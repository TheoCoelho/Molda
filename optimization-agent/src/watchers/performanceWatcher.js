#!/usr/bin/env node

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import watch from 'node-watch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8'));

console.log(chalk.bold.cyan('\n👁️  PERFORMANCE WATCHER STARTED\n'));
console.log(chalk.gray('Monitoring performance metrics...\n'));

const metrics = {
  bundleSize: 0,
  performanceScore: 0,
  lastCheck: null
};

// Watch for build changes
const buildDir = path.join(config.paths.moldaMain, 'dist');

watch(buildDir, { recursive: true }, (evt, name) => {
  if (name.includes('.js') || name.includes('.css')) {
    checkMetrics();
  }
});

async function checkMetrics() {
  const spinner = ora('Checking metrics...').start();
  
  try {
    // Get bundle size
    const distDir = path.join(config.paths.moldaMain, 'dist');
    if (fs.existsSync(distDir)) {
      const size = getDirectorySize(distDir);
      
      if (size > config.bundleThresholds.warnings.bundleSize) {
        spinner.warn(
          chalk.yellow(\`⚠️  Bundle size warning: \${formatSize(size)} (threshold: \${formatSize(config.bundleThresholds.warnings.bundleSize)})\`)
        );
      } else {
        spinner.succeed(chalk.green(\`✅ Bundle size OK: \${formatSize(size)}\`));
      }
      
      metrics.bundleSize = size;
    }
    
    metrics.lastCheck = new Date().toLocaleTimeString();
  } catch (error) {
    spinner.fail(chalk.red('Error checking metrics: ' + error.message));
  }
}

function getDirectorySize(dir) {
  let size = 0;
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stat.size;
    }
  });
  
  return size;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Periodic checks
setInterval(() => {
  checkMetrics();
}, config.watch.interval);

console.log(chalk.cyan('Press Ctrl+C to stop watching\n'));
