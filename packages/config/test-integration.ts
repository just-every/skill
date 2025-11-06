/**
 * Integration test: Verify exports work correctly
 * Run: npx tsx packages/config/test-integration.ts
 */

// Test all exports
import {
  // Web exports
  createWebEnvGetter,
  getInjectedEnv,
  mergeEnv,
  normalizeValue,
  parseList,
  fetchRuntimeEnv,
  // Worker exports
  createWorkerEnvGetter,
  getRequiredWorkerEnv,
  getOptionalWorkerEnv,
  validateWorkerEnv,
  // Env exports
  resolveEnv,
  requiredEnv,
  // Types
  type EnvGetter,
  type EnvSchema,
  type ValidatedEnv,
} from './src/index';

console.log('✓ All exports loaded successfully');

// Test web helpers
const getEnv = createWebEnvGetter('TEST_');
const testValue = getEnv('KEY');
console.log('✓ Web env getter created');

const normalized = normalizeValue('  test  ');
console.assert(normalized === 'test', 'normalizeValue failed');
console.log('✓ normalizeValue works');

const list = parseList('a, b, c');
console.assert(list.length === 3, 'parseList failed');
console.log('✓ parseList works');

// Test worker helpers
interface TestEnv {
  REQUIRED_KEY: string;
  OPTIONAL_KEY?: string;
}

const mockEnv: TestEnv = { REQUIRED_KEY: 'value' };

try {
  validateWorkerEnv(mockEnv, ['REQUIRED_KEY']);
  console.log('✓ validateWorkerEnv works');
} catch (error) {
  console.error('✗ validateWorkerEnv failed:', error);
  process.exit(1);
}

const required = getRequiredWorkerEnv(mockEnv, ['REQUIRED_KEY']);
console.assert(required.REQUIRED_KEY === 'value', 'getRequiredWorkerEnv failed');
console.log('✓ getRequiredWorkerEnv works');

// Test env helpers
const envKeys = requiredEnv();
console.assert(Array.isArray(envKeys), 'requiredEnv failed');
console.log('✓ requiredEnv works');

console.log('\n✅ All integration tests passed!');
