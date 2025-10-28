#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const appHomeFilePath = path.join(rootDir, 'src', 'components', 'app-home', 'app-home.tsx');
const versionModulePath = path.join(rootDir, 'src', 'global', 'version.ts');

const readJson = filePath => {
  try {
    const buffer = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(buffer);
  } catch (error) {
    console.error(`[sync-version] Failed to read JSON from ${filePath}`, error);
    process.exit(1);
  }
};

const writeFile = (filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    console.error(`[sync-version] Failed to write ${filePath}`, error);
    process.exit(1);
  }
};

const updateVersionSpan = (source, version) => {
  const pattern = /(<span class="about-version">)v?\d+\.\d+\.\d+(<\/span>)/;
  if (!pattern.test(source)) {
    return null;
  }
  return source.replace(pattern, `$1${version}$2`);
};

const updateVersionConstant = (source, version) => {
  const pattern = /(export const APP_VERSION\s*=\s*['"])(v?\d+\.\d+\.\d+)(['"];?)/;
  if (!pattern.test(source)) {
    return null;
  }
  return source.replace(pattern, `$1${version}$3`);
};

const ensureFormattedVersion = version => (version.startsWith('v') ? version : `v${version}`);

const applyUpdate = (filePath, updater, options = {}) => {
  const { optional = false, create } = options;
  const relativePath = path.relative(rootDir, filePath);

  const fileExists = fs.existsSync(filePath);
  if (!fileExists) {
    if (typeof create === 'function') {
      const content = create();
      writeFile(filePath, content);
      console.log(`[sync-version] Created ${relativePath}.`);
      return;
    }
    if (optional) {
      console.warn(`[sync-version] Skipped ${relativePath} (file not found).`);
      return;
    }
    console.error(`[sync-version] ${relativePath} does not exist.`);
    process.exit(1);
  }

  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`[sync-version] Failed to read ${relativePath}`, error);
    process.exit(1);
  }

  const nextSource = updater(source);
  if (nextSource == null) {
    if (optional) {
      console.warn(`[sync-version] Skipped ${relativePath} (marker not found).`);
      return;
    }
    console.error(`[sync-version] Marker not found in ${relativePath}.`);
    process.exit(1);
  }

  if (source === nextSource) {
    console.log(`[sync-version] ${relativePath} already up to date.`);
    return;
  }

  writeFile(filePath, nextSource);
  console.log(`[sync-version] Updated ${relativePath}.`);
};

(() => {
  const packageJson = readJson(packageJsonPath);
  const version = packageJson?.version;
  if (typeof version !== 'string') {
    console.error('[sync-version] package.json version is missing or invalid.');
    process.exit(1);
  }

  const formattedVersion = ensureFormattedVersion(version);

  applyUpdate(
    versionModulePath,
    source => updateVersionConstant(source, formattedVersion),
    {
      create: () => `export const APP_VERSION = '${formattedVersion}';\n`,
    },
  );

  applyUpdate(
    appHomeFilePath,
    source => updateVersionSpan(source, formattedVersion),
    {
      optional: true,
    },
  );

  console.log(`[sync-version] Synced version markers to ${formattedVersion}.`);
})();
