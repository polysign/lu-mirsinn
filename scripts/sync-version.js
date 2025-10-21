#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const targetFilePath = path.join(
  rootDir,
  'src',
  'components',
  'app-home',
  'app-home.tsx',
);

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
  const replacement = `$1v${version}$2`;
  if (!pattern.test(source)) {
    console.error('[sync-version] Unable to locate about-version span.');
    process.exit(1);
  }
  return source.replace(pattern, replacement);
};

(() => {
  const packageJson = readJson(packageJsonPath);
  const version = packageJson?.version;
  if (typeof version !== 'string') {
    console.error('[sync-version] package.json version is missing or invalid.');
    process.exit(1);
  }

  let targetSource;
  try {
    targetSource = fs.readFileSync(targetFilePath, 'utf8');
  } catch (error) {
    console.error(`[sync-version] Failed to read ${targetFilePath}`, error);
    process.exit(1);
  }

  const nextSource = updateVersionSpan(targetSource, version);
  if (targetSource === nextSource) {
    console.log('[sync-version] about-version is already up to date.');
    return;
  }

  writeFile(targetFilePath, nextSource);
  console.log(`[sync-version] Updated about-version span to v${version}.`);
})();
