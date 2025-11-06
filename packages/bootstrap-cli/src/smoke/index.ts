import { runSmokeChecks, type SmokeCheckReport, type SmokeCheckConfig } from './check.js';
import { captureSmokeScreens, type SmokeScreensOptions, type SmokeScreensResult } from './screens.js';

export interface SmokeCommandOptions {
  baseUrl: string;
  routes?: string[];
  bearerToken?: string | null;
  outputRoot?: string;
  stamp?: string;
  mode?: 'full' | 'minimal';
  skipWrangler?: boolean;
  attempts?: number;
  delayMs?: number;
  projectId?: string | null;
  d1Name?: string | null;
  r2Bucket?: string | null;
  logtoEndpoint?: string | null;
  logtoApplicationId?: string | null;
  headless?: boolean;
}

export interface SmokeCommandResult {
  checks: SmokeCheckReport;
  screens?: SmokeScreensResult;
}

export async function runSmoke(options: SmokeCommandOptions): Promise<SmokeCommandResult> {
  const routes = options.routes ?? undefined;

  const checkConfig: SmokeCheckConfig = {
    baseUrl: options.baseUrl,
    routes,
    bearerToken: options.bearerToken,
    outputRoot: options.outputRoot,
    stamp: options.stamp,
    mode: options.mode,
    skipWrangler: options.skipWrangler,
    attempts: options.attempts,
    delayMs: options.delayMs,
    projectId: options.projectId,
    d1Name: options.d1Name,
    r2Bucket: options.r2Bucket,
    logtoEndpoint: options.logtoEndpoint,
    logtoApplicationId: options.logtoApplicationId
  };

  const checks = await runSmokeChecks(checkConfig);

  let screens: SmokeScreensResult | undefined;
  if (options.mode !== 'minimal') {
    const screenConfig: SmokeScreensOptions = {
      baseUrl: options.baseUrl,
      routes: routes ?? checks.checks
        .filter((entry) => entry.name.startsWith('page:'))
        .map((entry) => entry.name.replace('page:', '')),
      bearerToken: options.bearerToken,
      outputRoot: options.outputRoot,
      stamp: options.stamp,
      headless: options.headless
    };

    screens = await captureSmokeScreens(screenConfig);
  }

  return {
    checks,
    screens
  };
}

export { type SmokeCheckReport };
