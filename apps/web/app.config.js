const base = require('./app.json');

const fs = require('node:fs');
const path = require('node:path');

const capitalizeFirst = (value) => {
  if (!value) return value;
  return value.slice(0, 1).toUpperCase() + value.slice(1);
};

const readDotenvKey = (filePath, key) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      if (k !== key) continue;
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const resolveProjectId = () => {
  const repoRoot = path.resolve(__dirname, '..', '..');

  // Prefer repo-local env files so sibling repos don't accidentally inherit the
  // caller's shell PROJECT_ID.
  return (
    readDotenvKey(path.join(repoRoot, '.env.local'), 'PROJECT_ID') ||
    readDotenvKey(path.join(repoRoot, '.env'), 'PROJECT_ID') ||
    readDotenvKey(path.join(repoRoot, '.env.generated'), 'PROJECT_ID') ||
    process.env.PROJECT_ID ||
    process.env.EXPO_PUBLIC_PROJECT_ID
  );
};

const resolveProjectTitle = () => {
  const projectId = resolveProjectId();
  const defaultTitle = projectId ? `Every ${capitalizeFirst(projectId)}` : 'Every';

  return process.env.PROJECT_TITLE || defaultTitle;
};

module.exports = ({ config } = {}) => {
  const safeConfig = config ?? {};
  const safeExpo = safeConfig.expo ?? {};
  const projectTitle = resolveProjectTitle();

  return {
    ...base,
    ...safeConfig,
    expo: {
      ...base.expo,
      ...safeExpo,
      name: projectTitle,
      // Ensure PWA/HTML title uses the project title.
      web: {
        ...base.expo?.web,
        ...safeExpo?.web,
        name: projectTitle,
        shortName: projectTitle,
      },
      ios: {
        ...base.expo?.ios,
        ...safeExpo?.ios,
        infoPlist: {
          ...base.expo?.ios?.infoPlist,
          ...safeExpo?.ios?.infoPlist,
          CFBundleDisplayName: projectTitle,
        },
      },
    },
  };
};
