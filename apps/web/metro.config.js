// Ensure Metro resolves shared workspace modules under pnpm and supports package exports used by shared packages.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver = config.resolver || {};
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enablePackageExports = true;
const preferredConditionNames = ['react-native', 'browser', 'module', 'require', 'default'];
const existingConditionNames = (config.resolver.unstable_conditionNames || []).filter(
  (name) => name !== 'import',
);
config.resolver.unstable_conditionNames = Array.from(
  new Set([...preferredConditionNames, ...existingConditionNames]),
);

module.exports = withNativeWind(config, { input: './global.css' });
