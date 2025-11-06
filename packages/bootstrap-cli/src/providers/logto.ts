import chalk from 'chalk';
import type { BootstrapEnv } from '../env.js';

export interface LogtoApplication {
  id: string;
  name: string;
  type: string;
  secret?: string;
  customClientMetadata?: {
    corsAllowedOrigins?: string[];
    redirectUris?: string[];
    postLogoutRedirectUris?: string[];
  };
}

export interface LogtoApiResource {
  id: string;
  name: string;
  indicator: string;
}

export interface LogtoM2MApplication {
  id: string;
  name: string;
  secret: string;
}

export interface LogtoProvisionResult {
  applicationId: string;
  applicationSecret?: string;
  apiResourceId: string;
  m2mApplicationId: string;
  m2mApplicationSecret: string;
}

export interface LogtoProvisionOptions {
  env: BootstrapEnv;
  dryRun?: boolean;
  logger?: (line: string) => void;
}

interface LogtoManagementToken {
  access_token: string;
  expires_in: number;
}

/**
 * Derive the management API resource indicator from the management endpoint
 * Logto Cloud: https://[tenant-id].logto.app/api
 * Logto OSS: https://default.logto.app/api
 */
function deriveManagementResource(managementEndpoint: string): string {
  try {
    const url = new URL(managementEndpoint);
    return `${url.protocol}//${url.host}/api`;
  } catch {
    // Fallback to OSS default if URL parsing fails
    return 'https://default.logto.app/api';
  }
}

/**
 * Mint a management API token using M2M credentials
 */
async function mintManagementToken(env: BootstrapEnv): Promise<string> {
  // Use LOGTO_MANAGEMENT_ENDPOINT or fallback to LOGTO_ENDPOINT
  const endpoint = env.LOGTO_MANAGEMENT_ENDPOINT ?? env.LOGTO_ENDPOINT;
  if (!endpoint) {
    throw new Error('LOGTO_MANAGEMENT_ENDPOINT or LOGTO_ENDPOINT is required');
  }

  // Use LOGTO_MANAGEMENT_AUTH_BASIC or derive from M2M credentials
  const authBasic = env.LOGTO_MANAGEMENT_AUTH_BASIC;
  if (!authBasic) {
    throw new Error('LOGTO_MANAGEMENT_AUTH_BASIC is required');
  }

  // Derive the correct management API resource indicator
  const resource = deriveManagementResource(endpoint);

  const tokenUrl = `${endpoint}/oidc/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    resource: resource,
    scope: 'all'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authBasic}`
    },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to mint Logto management token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as LogtoManagementToken;
  return data.access_token;
}

/**
 * Search for applications by name
 */
async function searchApplications(
  managementEndpoint: string,
  token: string,
  name: string
): Promise<LogtoApplication[]> {
  const response = await fetch(`${managementEndpoint}/api/applications?page=1&page_size=100`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list applications: ${response.status}`);
  }

  const applications = (await response.json()) as LogtoApplication[];
  return applications.filter((app) => app.name === name);
}

/**
 * Create a new application
 */
async function createApplication(
  managementEndpoint: string,
  token: string,
  payload: Partial<LogtoApplication>
): Promise<LogtoApplication> {
  const response = await fetch(`${managementEndpoint}/api/applications`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create application: ${response.status} ${text}`);
  }

  return (await response.json()) as LogtoApplication;
}

/**
 * Get application details by ID
 */
async function getApplication(
  managementEndpoint: string,
  token: string,
  id: string
): Promise<LogtoApplication> {
  const response = await fetch(`${managementEndpoint}/api/applications/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get application ${id}: ${response.status}`);
  }

  return (await response.json()) as LogtoApplication;
}

/**
 * Update application metadata
 */
async function updateApplication(
  managementEndpoint: string,
  token: string,
  id: string,
  payload: Partial<LogtoApplication>
): Promise<LogtoApplication> {
  const response = await fetch(`${managementEndpoint}/api/applications/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update application ${id}: ${response.status} ${text}`);
  }

  return (await response.json()) as LogtoApplication;
}

/**
 * Ensure a SPA application exists with correct redirect URIs
 */
export async function ensureApplication(
  env: BootstrapEnv,
  token: string,
  options: { dryRun?: boolean; logger?: (line: string) => void } = {}
): Promise<{ id: string; secret?: string }> {
  const { dryRun = false, logger = console.log } = options;
  const managementEndpoint = env.LOGTO_MANAGEMENT_ENDPOINT ?? env.LOGTO_ENDPOINT;
  if (!managementEndpoint) {
    throw new Error('LOGTO_MANAGEMENT_ENDPOINT or LOGTO_ENDPOINT is required');
  }

  const appName = `${env.PROJECT_ID}-spa`;
  const domain = env.PROJECT_DOMAIN ?? '';

  const redirectUris = [
    `${domain}/callback`,
    'http://127.0.0.1:8787/callback'
  ];

  const postLogoutRedirectUris = [domain, 'http://127.0.0.1:8787'];
  const corsAllowedOrigins = [domain, 'http://127.0.0.1:8787'];

  const existing = await searchApplications(managementEndpoint, token, appName);

  if (existing.length > 0) {
    const app = existing[0];
    logger(chalk.gray(`[logto] Found existing application: ${app.name} (${app.id})`));

    // Check if metadata needs update
    const current = await getApplication(managementEndpoint, token, app.id);
    const currentRedirects = current.customClientMetadata?.redirectUris ?? [];
    const currentPostLogout = current.customClientMetadata?.postLogoutRedirectUris ?? [];
    const currentCors = current.customClientMetadata?.corsAllowedOrigins ?? [];

    const needsUpdate =
      JSON.stringify(currentRedirects.sort()) !== JSON.stringify(redirectUris.sort()) ||
      JSON.stringify(currentPostLogout.sort()) !== JSON.stringify(postLogoutRedirectUris.sort()) ||
      JSON.stringify(currentCors.sort()) !== JSON.stringify(corsAllowedOrigins.sort());

    if (needsUpdate) {
      if (dryRun) {
        logger(chalk.cyan(`[dry-run] Would update application ${app.id} metadata`));
      } else {
        logger(chalk.yellow(`[logto] Updating application ${app.id} metadata`));
        await updateApplication(managementEndpoint, token, app.id, {
          customClientMetadata: {
            redirectUris,
            postLogoutRedirectUris,
            corsAllowedOrigins
          }
        });
        logger(chalk.green(`[logto] Updated application ${app.id}`));
      }
    } else {
      logger(chalk.gray(`[logto] Application ${app.id} metadata is up to date`));
    }

    return { id: app.id };
  }

  // Create new application
  if (dryRun) {
    logger(chalk.cyan(`[dry-run] Would create SPA application: ${appName}`));
    return { id: 'dry-run-app-id' };
  }

  logger(chalk.yellow(`[logto] Creating SPA application: ${appName}`));
  const newApp = await createApplication(managementEndpoint, token, {
    name: appName,
    type: 'SPA',
    customClientMetadata: {
      redirectUris,
      postLogoutRedirectUris,
      corsAllowedOrigins
    }
  });

  logger(chalk.green(`[logto] Created application ${newApp.id}`));
  return { id: newApp.id, secret: newApp.secret };
}

/**
 * Search for API resources by indicator
 */
async function searchApiResources(
  managementEndpoint: string,
  token: string,
  indicator: string
): Promise<LogtoApiResource[]> {
  const response = await fetch(`${managementEndpoint}/api/resources?page=1&page_size=100`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list API resources: ${response.status}`);
  }

  const resources = (await response.json()) as LogtoApiResource[];
  return resources.filter((resource) => resource.indicator === indicator);
}

/**
 * Create a new API resource
 */
async function createApiResource(
  managementEndpoint: string,
  token: string,
  payload: Partial<LogtoApiResource>
): Promise<LogtoApiResource> {
  const response = await fetch(`${managementEndpoint}/api/resources`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create API resource: ${response.status} ${text}`);
  }

  return (await response.json()) as LogtoApiResource;
}

/**
 * Ensure an API resource exists
 */
export async function ensureApiResource(
  env: BootstrapEnv,
  token: string,
  options: { dryRun?: boolean; logger?: (line: string) => void } = {}
): Promise<{ id: string }> {
  const { dryRun = false, logger = console.log } = options;
  const managementEndpoint = env.LOGTO_MANAGEMENT_ENDPOINT ?? env.LOGTO_ENDPOINT;
  if (!managementEndpoint) {
    throw new Error('LOGTO_MANAGEMENT_ENDPOINT or LOGTO_ENDPOINT is required');
  }

  const indicator = env.LOGTO_API_RESOURCE;
  const resourceName = `${env.PROJECT_ID}-api`;

  const existing = await searchApiResources(managementEndpoint, token, indicator);

  if (existing.length > 0) {
    const resource = existing[0];
    logger(chalk.gray(`[logto] Found existing API resource: ${resource.name} (${resource.id})`));
    return { id: resource.id };
  }

  if (dryRun) {
    logger(chalk.cyan(`[dry-run] Would create API resource: ${resourceName}`));
    return { id: 'dry-run-resource-id' };
  }

  logger(chalk.yellow(`[logto] Creating API resource: ${resourceName}`));
  const newResource = await createApiResource(managementEndpoint, token, {
    name: resourceName,
    indicator
  });

  logger(chalk.green(`[logto] Created API resource ${newResource.id}`));
  return { id: newResource.id };
}

/**
 * Search for M2M applications
 */
async function searchM2MApplications(
  managementEndpoint: string,
  token: string,
  name: string
): Promise<LogtoApplication[]> {
  const response = await fetch(`${managementEndpoint}/api/applications?page=1&page_size=100`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list applications: ${response.status}`);
  }

  const applications = (await response.json()) as LogtoApplication[];
  return applications.filter((app) => app.name === name && app.type === 'MachineToMachine');
}

/**
 * Ensure an M2M application exists for smoke tests
 */
export async function ensureM2MApp(
  env: BootstrapEnv,
  token: string,
  options: { dryRun?: boolean; logger?: (line: string) => void } = {}
): Promise<{ id: string; secret: string }> {
  const { dryRun = false, logger = console.log } = options;
  const managementEndpoint = env.LOGTO_MANAGEMENT_ENDPOINT ?? env.LOGTO_ENDPOINT;
  if (!managementEndpoint) {
    throw new Error('LOGTO_MANAGEMENT_ENDPOINT or LOGTO_ENDPOINT is required');
  }

  const appName = `${env.PROJECT_ID}-m2m`;

  const existing = await searchM2MApplications(managementEndpoint, token, appName);

  if (existing.length > 0) {
    const app = existing[0];
    logger(chalk.gray(`[logto] Found existing M2M application: ${app.name} (${app.id})`));

    // Note: Cannot retrieve secret for existing M2M apps
    // User must provide LOGTO_M2M_SECRET if they want to use existing app
    return { id: app.id, secret: app.secret ?? 'existing-app-secret-unavailable' };
  }

  if (dryRun) {
    logger(chalk.cyan(`[dry-run] Would create M2M application: ${appName}`));
    return { id: 'dry-run-m2m-id', secret: 'dry-run-m2m-secret' };
  }

  logger(chalk.yellow(`[logto] Creating M2M application: ${appName}`));
  const newApp = await createApplication(managementEndpoint, token, {
    name: appName,
    type: 'MachineToMachine'
  });

  if (!newApp.secret) {
    throw new Error('M2M application created but secret not returned');
  }

  logger(chalk.green(`[logto] Created M2M application ${newApp.id}`));
  return { id: newApp.id, secret: newApp.secret };
}

/**
 * Provision all Logto resources idempotently
 */
export async function provisionLogto(options: LogtoProvisionOptions): Promise<LogtoProvisionResult> {
  const { env, dryRun = false, logger = console.log } = options;

  logger(chalk.blue('[logto] Starting Logto provisioning...'));

  // Mint management token
  let token: string;
  if (dryRun) {
    logger(chalk.cyan('[dry-run] Would mint management token'));
    token = 'dry-run-token';
  } else {
    logger(chalk.gray('[logto] Minting management token...'));
    token = await mintManagementToken(env);
  }

  // Ensure SPA application
  const app = await ensureApplication(env, token, { dryRun, logger });

  // Ensure API resource
  const resource = await ensureApiResource(env, token, { dryRun, logger });

  // Ensure M2M application
  const m2m = await ensureM2MApp(env, token, { dryRun, logger });

  logger(chalk.blue('[logto] Logto provisioning complete'));

  return {
    applicationId: app.id,
    applicationSecret: app.secret,
    apiResourceId: resource.id,
    m2mApplicationId: m2m.id,
    m2mApplicationSecret: m2m.secret
  };
}

/**
 * Build a Logto plan (similar to Cloudflare plan)
 */
export interface LogtoPlanStep {
  id: string;
  title: string;
  detail: string;
  status: 'noop' | 'ensure';
}

export interface LogtoPlan {
  provider: 'logto';
  endpoint: string;
  steps: LogtoPlanStep[];
  notes: string[];
}

export function buildLogtoPlan(env: BootstrapEnv): LogtoPlan {
  const appName = `${env.PROJECT_ID}-spa`;
  const resourceName = `${env.PROJECT_ID}-api`;
  const m2mName = `${env.PROJECT_ID}-m2m`;

  const steps: LogtoPlanStep[] = [
    {
      id: 'spa-app',
      title: 'SPA Application',
      detail: `Ensure application "${appName}" exists`,
      status: 'ensure'
    },
    {
      id: 'api-resource',
      title: 'API Resource',
      detail: `Ensure resource "${env.LOGTO_API_RESOURCE}" exists`,
      status: 'ensure'
    },
    {
      id: 'm2m-app',
      title: 'M2M Application',
      detail: `Ensure M2M app "${m2mName}" exists`,
      status: 'ensure'
    }
  ];

  const notes = [
    `Endpoint: ${env.LOGTO_ENDPOINT}`,
    `API Resource: ${env.LOGTO_API_RESOURCE}`,
    `Management: ${env.LOGTO_MANAGEMENT_ENDPOINT ?? 'not set'}`
  ];

  return {
    provider: 'logto',
    endpoint: env.LOGTO_ENDPOINT,
    steps,
    notes
  };
}

export function formatLogtoPlan(plan: LogtoPlan): string {
  const header = `Provider: logto (endpoint ${plan.endpoint})`;
  const steps = plan.steps.map((step) => `  - ${step.title}: ${step.detail} [${step.status}]`);
  const notes = plan.notes.map((note) => `    ${note}`);
  return [header, ...steps, '  Notes:', ...notes].join('\n');
}
