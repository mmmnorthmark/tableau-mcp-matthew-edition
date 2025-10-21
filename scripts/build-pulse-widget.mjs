#!/usr/bin/env node
import { cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const widgetSourcePath = join(rootDir, 'apps-pulse', 'mcp', 'dist', 'ui-template.html');
const widgetDestPath = join(rootDir, 'src', 'tools', 'pulse', 'embedPulseMetric', 'widget.html');

// Build the apps-pulse widget if it doesn't exist
if (!existsSync(widgetSourcePath)) {
  console.log('📦 Building Pulse widget...');
  try {
    execSync('pnpm build', {
      cwd: join(rootDir, 'apps-pulse'),
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('❌ Failed to build Pulse widget');
    process.exit(1);
  }
}

// Copy the built widget to the main server
console.log('📋 Copying Pulse widget to main server...');
try {
  cpSync(widgetSourcePath, widgetDestPath);
  console.log(`✅ Widget copied to ${widgetDestPath}`);
} catch (error) {
  console.error('❌ Failed to copy widget:', error.message);
  process.exit(1);
}
