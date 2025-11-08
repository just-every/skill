import chalk from 'chalk';
import type { BootstrapEnv } from '../env.js';

export interface LogtoApplication {
  id: string;
  name: string;
  type: string;
  secret?: string;
  customClientMetadata?: {
    corsAllowedOrigins?: string[];
  };
  oidcClientMetadata?: {
    redirectUris?: string[];
    postLogoutRedirectUris?: string[];
    alwaysIssueRefreshToken?: boolean;
    rotateRefreshToken?: boolean;
  };
}

export interface LogtoApplicationSecret {
  id: string;
  name: string;
  value?: string;
  createdAt: string;
  expiresAt?: string | null;
}

export interface LogtoApiResource {
  id: string;
  name: string;
  indicator: string;
}

export interface LogtoApplicationUserConsentScope {
  organizationScopes?: string[];
  resourceScopes?: Record<string, string[]>;
  organizationResourceScopes?: string[];
  userScopes?: string[];
}

export interface LogtoProvisionResult {
  applicationId: string;
  applicationSecret?: string;
  apiResourceId: string;
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
 * Mint a management API token using the configured Basic credentials
 */
async function mintManagementToken(env: BootstrapEnv): Promise<string> {
  // Use LOGTO_MANAGEMENT_ENDPOINT or fallback to LOGTO_ENDPOINT
  const endpoint = env.LOGTO_MANAGEMENT_ENDPOINT ?? env.LOGTO_ENDPOINT;
  if (!endpoint) {
    throw new Error('LOGTO_MANAGEMENT_ENDPOINT or LOGTO_ENDPOINT is required');
  }

  // Use LOGTO_MANAGEMENT_AUTH_BASIC for client credentials
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

async function listApplicationSecrets(
  managementEndpoint: string,
  token: string,
  applicationId: string
): Promise<LogtoApplicationSecret[]> {
  const response = await fetch(`${managementEndpoint}/api/applications/${applicationId}/secrets`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to list secrets for application ${applicationId}: ${response.status}`);
  }

  return (await response.json()) as LogtoApplicationSecret[];
}

async function createApplicationSecret(
  managementEndpoint: string,
  token: string,
  applicationId: string,
  name: string
): Promise<LogtoApplicationSecret> {
  const response = await fetch(`${managementEndpoint}/api/applications/${applicationId}/secrets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create secret for application ${applicationId}: ${response.status} ${text}`);
  }

  return (await response.json()) as LogtoApplicationSecret;
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
 * Ensure a Traditional application exists with correct redirect URIs
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

  const appName = `${env.PROJECT_ID}-web`;
  const origins = buildLogtoOrigins(env);
  const redirectUris = origins.map((origin) => `${origin}/callback`);
  const postLogoutRedirectUris = [...origins];
  const corsAllowedOrigins = [...origins];

  const desiredOidcMetadata = {
    redirectUris,
    postLogoutRedirectUris,
    alwaysIssueRefreshToken: true,
    rotateRefreshToken: true
  };

  // Get the API resource ID for scope configuration
  const apiResourceIndicator = env.LOGTO_API_RESOURCE;
  let apiResourceId: string | undefined;

  if (!dryRun) {
    try {
      const resources = await searchApiResources(managementEndpoint, token, apiResourceIndicator);
      if (resources.length > 0) {
        apiResourceId = resources[0].id;
      }
    } catch (error) {
      logger(chalk.yellow(`[logto] Warning: Could not fetch API resource for scope configuration: ${error}`));
    }
  }

  // Build user consent scopes
  // Default scopes: openid, offline_access, profile, email
  const userScopes = ['openid', 'offline_access', 'profile', 'email'];

  // Build resource scopes if we have the API resource
  const resourceScopes: Record<string, string[]> = {};
  if (apiResourceId) {
    // For now, we'll request all scopes for the API resource
    // This could be made configurable in the future
    resourceScopes[apiResourceId] = [];
  }

  const existing = await searchApplications(managementEndpoint, token, appName);

  if (existing.length > 0) {
    const app = existing[0];
    logger(chalk.gray(`[logto] Found existing application: ${app.name} (${app.id})`));

    // Check if metadata needs update
    const current = await getApplication(managementEndpoint, token, app.id);
    const currentRedirects =
      current.oidcClientMetadata?.redirectUris ?? current.customClientMetadata?.redirectUris ?? [];
    const currentPostLogout =
      current.oidcClientMetadata?.postLogoutRedirectUris ??
      current.customClientMetadata?.postLogoutRedirectUris ??
      [];
    const currentCors = current.customClientMetadata?.corsAllowedOrigins ?? [];
    const currentRefresh = {
      alwaysIssueRefreshToken: current.oidcClientMetadata?.alwaysIssueRefreshToken ?? false,
      rotateRefreshToken: current.oidcClientMetadata?.rotateRefreshToken ?? false
    };

    const needsUpdate =
      JSON.stringify(currentRedirects.sort()) !== JSON.stringify(redirectUris.sort()) ||
      JSON.stringify(currentPostLogout.sort()) !== JSON.stringify(postLogoutRedirectUris.sort()) ||
      JSON.stringify(currentCors.sort()) !== JSON.stringify(corsAllowedOrigins.sort()) ||
      currentRefresh.alwaysIssueRefreshToken !== desiredOidcMetadata.alwaysIssueRefreshToken ||
      currentRefresh.rotateRefreshToken !== desiredOidcMetadata.rotateRefreshToken;

    if (needsUpdate) {
      if (dryRun) {
        logger(chalk.cyan(`[dry-run] Would update application ${app.id} metadata`));
      } else {
        logger(chalk.yellow(`[logto] Updating application ${app.id} metadata`));
        await updateApplication(managementEndpoint, token, app.id, {
          oidcClientMetadata: desiredOidcMetadata,
          customClientMetadata: {
            corsAllowedOrigins
          }
        });
        logger(chalk.green(`[logto] Updated application ${app.id}`));
      }
    } else {
      logger(chalk.gray(`[logto] Application ${app.id} metadata is up to date`));
    }

    // Update user consent scopes
    if (!dryRun && apiResourceId) {
      try {
        await ensureApplicationUserConsentScopes(
          managementEndpoint,
          token,
          app.id,
          { userScopes, resourceScopes },
          logger
        );
      } catch (error) {
        logger(chalk.yellow(`[logto] Warning: Could not update user consent scopes: ${error}`));
      }
    }

    const secret = await ensureApplicationSecretValue(
      env,
      managementEndpoint,
      token,
      app.id,
      { dryRun, logger }
    );
    return { id: app.id, secret };
  }

  // Create new application
  if (dryRun) {
    logger(chalk.cyan(`[dry-run] Would create Traditional application: ${appName}`));
    logger(chalk.cyan(`[dry-run]   Redirect URIs: ${redirectUris.join(', ')}`));
    logger(chalk.cyan(`[dry-run]   Post-logout URIs: ${postLogoutRedirectUris.join(', ')}`));
    logger(chalk.cyan(`[dry-run]   User scopes: ${userScopes.join(', ')}`));
    if (apiResourceId) {
      logger(chalk.cyan(`[dry-run]   API resource: ${apiResourceIndicator} (${apiResourceId})`));
    }
    return { id: 'dry-run-app-id' };
  }

  logger(chalk.yellow(`[logto] Creating Traditional application: ${appName}`));
  const newApp = await createApplication(managementEndpoint, token, {
    name: appName,
    type: 'Traditional',
    oidcClientMetadata: desiredOidcMetadata,
    customClientMetadata: {
      corsAllowedOrigins
    }
  });

  logger(chalk.green(`[logto] Created application ${newApp.id}`));

  // Set user consent scopes for new application
  if (apiResourceId) {
    try {
      await ensureApplicationUserConsentScopes(
        managementEndpoint,
        token,
        newApp.id,
        { userScopes, resourceScopes },
        logger
      );
    } catch (error) {
      logger(chalk.yellow(`[logto] Warning: Could not set user consent scopes: ${error}`));
    }
  }

  const secret = newApp.secret ??
    (await ensureApplicationSecretValue(env, managementEndpoint, token, newApp.id, { dryRun, logger }));

  return { id: newApp.id, secret };
}

async function ensureApplicationSecretValue(
  env: BootstrapEnv,
  managementEndpoint: string,
  token: string,
  applicationId: string,
  options: { dryRun?: boolean; logger?: (line: string) => void }
): Promise<string | undefined> {
  const { dryRun = false, logger = console.log } = options;

  if (env.LOGTO_APPLICATION_SECRET) {
    logger(chalk.gray('[logto] Using LOGTO_APPLICATION_SECRET from environment'));
    return env.LOGTO_APPLICATION_SECRET;
  }

  if (dryRun) {
    logger(chalk.cyan(`[dry-run] Would ensure application secret for ${applicationId}`));
    return 'dry-run-app-secret';
  }

  try {
    const secrets = await listApplicationSecrets(managementEndpoint, token, applicationId);
    const existing = secrets.find((secret) => typeof secret.value === 'string' && secret.value.trim().length > 0);
    if (existing?.value) {
      logger(chalk.gray(`[logto] Reusing existing application secret ${existing.id}`));
      return existing.value;
    }
  } catch (error) {
    logger(chalk.yellow(`[logto] Warning: Could not list application secrets: ${error}`));
  }

  logger(chalk.yellow(`[logto] Creating application secret for ${applicationId}`));
  const generatedName = `${env.PROJECT_ID}-web-${Date.now()}`;
  const created = await createApplicationSecret(managementEndpoint, token, applicationId, generatedName);
  if (!created.value) {
    throw new Error('Logto created an application secret but did not return the value');
  }
  logger(chalk.green(`[logto] Created application secret ${created.id}`));
  return created.value;
}

/**
 * Update application user consent scopes
 */
async function ensureApplicationUserConsentScopes(
  managementEndpoint: string,
  token: string,
  applicationId: string,
  scopes: LogtoApplicationUserConsentScope,
  logger: (line: string) => void
): Promise<void> {
  logger(chalk.gray(`[logto] Configuring user consent scopes for application ${applicationId}`));

  const response = await fetch(
    `${managementEndpoint}/api/applications/${applicationId}/user-consent-scopes`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(scopes)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update user consent scopes: ${response.status} ${text}`);
  }

  logger(chalk.green(`[logto] User consent scopes configured for application ${applicationId}`));
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
 * Provision all Logto resources idempotently
 */
export async function provisionLogto(options: LogtoProvisionOptions): Promise<LogtoProvisionResult> {
  const { env, dryRun = false, logger = console.log } = options;

  logger(chalk.blue('[logto] Starting Logto provisioning...'));

  if (dryRun) {
    logger(chalk.cyan('[dry-run] Would mint management token'));
    logger(chalk.cyan(`[dry-run] Would ensure Traditional application: ${env.PROJECT_ID}-web`));
    logger(chalk.cyan(`[dry-run] Would ensure API resource: ${env.LOGTO_API_RESOURCE}`));
    const dryRunResult: LogtoProvisionResult = {
      applicationId: 'dry-run-app-id',
      applicationSecret: 'dry-run-app-secret',
      apiResourceId: 'dry-run-resource-id'
    };
    logger(chalk.blue('[logto] Dry-run provisioning complete (no network calls)'));
    return dryRunResult;
  }

  // Mint management token
  let token: string;
  logger(chalk.gray('[logto] Minting management token...'));
  token = await mintManagementToken(env);

  // Ensure Traditional application
  const app = await ensureApplication(env, token, { logger });

  // Ensure API resource
  const resource = await ensureApiResource(env, token, { logger });

  logger(chalk.blue('[logto] Logto provisioning complete'));

  return {
    applicationId: app.id,
    applicationSecret: app.secret,
    apiResourceId: resource.id
  };
}

function buildLogtoOrigins(env: BootstrapEnv): string[] {
  const origins = new Set<string>();

  const canonical = normaliseOrigin(env.PROJECT_DOMAIN) ?? `https://${env.PROJECT_ID}.justevery.com`;
  origins.add(canonical);

  const workerOrigin = normaliseOrigin(env.WORKER_ORIGIN);
  if (workerOrigin) {
    origins.add(workerOrigin);
  }

  const appUrlOrigin = normaliseOrigin(env.APP_URL);
  if (appUrlOrigin) {
    origins.add(appUrlOrigin);
  }

  const fallbackWorker = env.EXPO_PUBLIC_WORKER_ORIGIN ? normaliseOrigin(env.EXPO_PUBLIC_WORKER_ORIGIN) : null;
  if (fallbackWorker) {
    origins.add(fallbackWorker);
  }

  const localOrigin = normaliseOrigin(env.EXPO_PUBLIC_WORKER_ORIGIN_LOCAL ?? 'http://127.0.0.1:8787');
  origins.add(localOrigin ?? 'http://127.0.0.1:8787');

  return Array.from(origins).filter((origin) => Boolean(origin));
}

function normaliseOrigin(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^https?:/i.test(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed.replace(/\/$/, ''));
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
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
  const appName = `${env.PROJECT_ID}-web`;
  const resourceName = `${env.PROJECT_ID}-api`;
  const steps: LogtoPlanStep[] = [
    {
      id: 'traditional-app',
      title: 'Traditional Application',
      detail: `Ensure application "${appName}" exists`,
      status: 'ensure'
    },
    {
      id: 'api-resource',
      title: 'API Resource',
      detail: `Ensure resource "${env.LOGTO_API_RESOURCE}" exists`,
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
