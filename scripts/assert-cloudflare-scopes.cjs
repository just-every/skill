#!/usr/bin/env node

/**
 * Assert Cloudflare API token has required scopes for R2 operations.
 *
 * Usage:
 *   node scripts/assert-cloudflare-scopes.cjs
 *   node scripts/assert-cloudflare-scopes.cjs --bucket demo-assets
 *
 * Runs `wrangler r2 bucket list` to verify the token has at minimum R2 Storage Read permission.
 *
 * Exit codes:
 *   0 - R2 bucket list succeeded (token has required scopes)
 *   1 - Listing failed (missing scopes, network error, or bucket not visible)
 */

const { spawn } = require('node:child_process');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (!entry.startsWith('--')) continue;
    const [flag, raw] = entry.split('=');
    const key = flag.slice(2);
    if (raw !== undefined) {
      args[key] = raw;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

function parseErrorMessage(stderr) {
  // Common Cloudflare API error patterns
  if (stderr.includes('Authentication error') || stderr.includes('Invalid API Token')) {
    return 'Authentication failed. Check CLOUDFLARE_API_TOKEN is set and valid.';
  }
  if (stderr.includes('permission') || stderr.includes('scope') || stderr.includes('unauthorized')) {
    return 'Token lacks required permissions. Ensure R2 Storage Read scope is enabled.';
  }
  if (stderr.includes('bucket not found') || stderr.includes('No such bucket')) {
    return 'Bucket does not exist. Verify bucket name and account access.';
  }
  if (stderr.includes('network') || stderr.includes('timeout') || stderr.includes('ECONNREFUSED')) {
    return 'Network error. Check internet connectivity and Cloudflare API availability.';
  }
  return null;
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const projectId = process.env.PROJECT_ID || 'demo';
  const bucket = argv.bucket || process.env.R2_BUCKET || `${projectId}-assets`;

  console.log(`Asserting Cloudflare token scopes for R2 bucket: ${bucket}`);
  console.log('Testing with: wrangler r2 bucket list\n');

  const args = ['r2', 'bucket', 'list', '--config', 'workers/api/wrangler.toml'];

  const result = await runCommand('wrangler', args);

  if (result.code === 0) {
    const bucketFound = result.stdout.includes(bucket);
    if (bucketFound) {
      console.log('✅ Success: Token can list R2 buckets and sees the target bucket.\n');
      return;
    }
    console.error('❌ Listing succeeded but target bucket was not found in output.\n');
    console.error(result.stdout.trim());
    process.exitCode = 1;
    return;
  }

  console.error('❌ Failed: Unable to list R2 buckets.\n');

  const customMessage = parseErrorMessage(result.stderr);
  if (customMessage) {
    console.error(`Error: ${customMessage}\n`);
  }

  console.error('Command output:');
  if (result.stderr.trim()) {
    console.error('STDERR:', result.stderr.trim());
  }
  if (result.stdout.trim()) {
    console.error('STDOUT:', result.stdout.trim());
  }

  console.error('\nRequired Cloudflare API token scopes:');
  console.error('  • Account - R2 Storage: Read (minimum)');
  console.error('  • Account - R2 Storage: Edit (for uploads/deletes)\n');
  console.error('To create or update your token:');
  console.error('  1. Visit: https://dash.cloudflare.com/profile/api-tokens');
  console.error('  2. Create token with "Edit Cloudflare Workers" template or custom token');
  console.error('  3. Ensure R2 Storage Read permission is enabled');
  console.error('  4. Set CLOUDFLARE_API_TOKEN environment variable\n');

  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exitCode = 1;
});
