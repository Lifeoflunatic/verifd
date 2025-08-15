#!/usr/bin/env node

/**
 * Node.js version check script
 * Ensures Node 22 is being used for better-sqlite3 compatibility
 */

const requiredMajor = 22;
const currentVersion = process.version;
const [major] = currentVersion.slice(1).split('.').map(Number);

console.log(`Node.js version check:`);
console.log(`  Current: ${currentVersion}`);
console.log(`  Required: v${requiredMajor}.x`);

if (major !== requiredMajor) {
  console.error(`\n❌ Node.js v${requiredMajor}.x is required for better-sqlite3 compatibility`);
  console.error(`\nTo fix this:`);
  console.error(`  1. Install Node ${requiredMajor} via Homebrew: brew install node@22`);
  console.error(`  2. Or use nvm: nvm install 22 && nvm use 22`);
  console.error(`  3. Or use fnm: fnm install 22 && fnm use 22`);
  console.error(`\nSee: https://github.com/WiseLibs/better-sqlite3/issues/1177`);
  process.exit(1);
}

console.log(`\n✅ Node.js version is correct!`);

// Additional check for pnpm
try {
  const { execSync } = require('child_process');
  const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
  console.log(`✅ pnpm version: ${pnpmVersion}`);
} catch (error) {
  console.warn(`⚠️  pnpm not found. Install with: npm install -g pnpm`);
}