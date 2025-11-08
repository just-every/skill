import { execa } from 'execa';

export interface WranglerPreflightOptions {
  cwd: string;
}

const installHint = [
  'Install Wrangler with one of:',
  '  pnpm --filter @justevery/worker add -D wrangler',
  '  or npm install -g wrangler'
].join('\n');

const authHint = [
  'Authenticate with Cloudflare via:',
  '  wrangler login',
  '  or set CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID'
].join('\n');

function wrapError(message: string, cause: unknown): Error {
  if (cause instanceof Error) {
    return new Error(`${message}\n${cause.message}`, { cause });
  }
  return new Error(message);
}

export async function ensureWranglerReady(options: WranglerPreflightOptions): Promise<void> {
  try {
    await execa({
      stdout: 'ignore',
      stderr: 'pipe'
    })('wrangler', ['--version'], {
      cwd: options.cwd
    });
  } catch (error) {
    throw wrapError(`Wrangler CLI not available.\n${installHint}`, error);
  }

  try {
    await execa({
      stdout: 'ignore',
      stderr: 'pipe'
    })('wrangler', ['whoami'], {
      cwd: options.cwd
    });
  } catch (error) {
    throw wrapError(`Wrangler authentication check failed.\n${authHint}`, error);
  }
}
