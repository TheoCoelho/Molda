#!/usr/bin/env node

/**
 * Molda Optimization Agent - CLI Entry Point
 * 
 * Usage:
 *   npm run optimize:full     - Run complete optimization pipeline
 *   npm run analyze:bundle    - Analyze bundle size
 *   npm run analyze:components - Analyze components
 *   npm run analyze:performance - Analyze performance
 *   npm run optimize:images   - Optimize images
 *   npm run optimize:splitting - Implement code splitting
 *   npm run optimize:vite     - Optimize Vite config
 *   npm run watch:performance - Monitor performance
 *   npm run validate:changes  - Validate optimizations
 *   npm run rollback:changes  - Rollback changes
 */

import { bundleAnalyzer } from './src/analyzers/bundleAnalyzer.js';
import { componentAnalyzer } from './src/analyzers/componentAnalyzer.js';
import { performanceAnalyzer } from './src/analyzers/performanceAnalyzer.js';
import { imageOptimizer } from './src/optimizers/imageOptimizer.js';
import { codeSplittingOptimizer } from './src/optimizers/codeSplitting.js';
import { viteOptimizer } from './src/optimizers/viteOptimizer.js';
import { changeValidator } from './src/validators/changeValidator.js';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')
);

const command = process.argv[2];

async function main() {
  switch (command) {
    case 'bundle':
      console.log(chalk.cyan('📦 Bundle Analysis\n'));
      const bundleResult = await bundleAnalyzer(config);
      console.log(JSON.stringify(bundleResult, null, 2));
      break;

    case 'components':
      console.log(chalk.cyan('⚛️  Component Analysis\n'));
      const componentResult = await componentAnalyzer(config);
      console.log(JSON.stringify(componentResult, null, 2));
      break;

    case 'performance':
      console.log(chalk.cyan('📊 Performance Analysis\n'));
      const perfResult = await performanceAnalyzer(config);
      console.log(JSON.stringify(perfResult, null, 2));
      break;

    case 'images':
      console.log(chalk.cyan('🖼️  Image Optimization\n'));
      const imgResult = await imageOptimizer(config);
      console.log(JSON.stringify(imgResult, null, 2));
      break;

    case 'splitting':
      console.log(chalk.cyan('✂️  Code Splitting\n'));
      const csResult = await codeSplittingOptimizer(config);
      console.log(JSON.stringify(csResult, null, 2));
      break;

    case 'vite':
      console.log(chalk.cyan('⚙️  Vite Optimization\n'));
      const viteResult = await viteOptimizer(config);
      console.log(JSON.stringify(viteResult, null, 2));
      break;

    case 'validate':
      console.log(chalk.cyan('🔍 Validating Changes\n'));
      const validation = await changeValidator(config);
      console.log(JSON.stringify(validation, null, 2));
      break;

    default:
      console.log(chalk.bold.cyan('\n📚 Molda Optimization Agent - Available Commands\n'));
      console.log(chalk.yellow('Analysis:'));
      console.log('  npm run analyze:bundle       - Analyze bundle size & dependencies');
      console.log('  npm run analyze:components   - Analyze components for optimization');
      console.log('  npm run analyze:performance  - Analyze performance metrics\n');
      
      console.log(chalk.yellow('Optimization:'));
      console.log('  npm run optimize:images      - Generate image optimization helpers');
      console.log('  npm run optimize:splitting   - Generate code splitting strategy');
      console.log('  npm run optimize:vite        - Generate optimized Vite config\n');
      
      console.log(chalk.yellow('Full Pipeline:'));
      console.log('  npm run optimize:full        - Run complete analysis & optimization\n');
      
      console.log(chalk.yellow('Utilities:'));
      console.log('  npm run watch:performance    - Monitor performance in real-time');
      console.log('  npm run validate:changes     - Validate optimization changes');
      console.log('  npm run report:generate      - Generate all reports\n');
      
      console.log(chalk.gray('For more info, see README.md or SETUP.md\n'));
  }
}

main().catch(err => {
  console.error(chalk.red('❌ Error:'), err.message);
  process.exit(1);
});
