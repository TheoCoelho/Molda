#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { bundleAnalyzer } from './analyzers/bundleAnalyzer.js';
import { componentAnalyzer } from './analyzers/componentAnalyzer.js';
import { performanceAnalyzer } from './analyzers/performanceAnalyzer.js';
import { imageOptimizer } from './optimizers/imageOptimizer.js';
import { codeSplittingOptimizer } from './optimizers/codeSplitting.js';
import { viteOptimizer } from './optimizers/viteOptimizer.js';
import { reportGenerator } from './reporters/reportGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));

const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const reportDir = path.join(__dirname, '../reports', timestamp);
fs.ensureDirSync(reportDir);

console.log(chalk.bold.cyan('\n🚀 MOLDA OPTIMIZATION AGENT v1.0\n'));

async function runOptimizationPipeline() {
  const results = {
    timestamp,
    analyses: {},
    optimizations: {},
    metrics: {},
    suggestions: []
  };

  try {
    // Phase 1: Analysis
    console.log(chalk.bold.yellow('\n📊 PHASE 1: ANALYSIS\n'));

    let spinner = ora('Analyzing bundle...').start();
    try {
      results.analyses.bundle = await bundleAnalyzer(config);
      spinner.succeed('Bundle analysis complete');
    } catch (e) {
      spinner.warn('Bundle analysis skipped: ' + e.message);
    }

    spinner = ora('Analyzing components...').start();
    try {
      results.analyses.components = await componentAnalyzer(config);
      spinner.succeed('Component analysis complete');
    } catch (e) {
      spinner.warn('Component analysis skipped: ' + e.message);
    }

    spinner = ora('Analyzing performance...').start();
    try {
      results.analyses.performance = await performanceAnalyzer(config);
      spinner.succeed('Performance analysis complete');
    } catch (e) {
      spinner.warn('Performance analysis skipped: ' + e.message);
    }

    // Phase 2: Optimization
    console.log(chalk.bold.yellow('\n⚙️  PHASE 2: OPTIMIZATION\n'));

    if (config.optimization.enableImageOptimization) {
      spinner = ora('Optimizing images...').start();
      try {
        results.optimizations.images = await imageOptimizer(config);
        spinner.succeed('Images optimized');
      } catch (e) {
        spinner.warn('Image optimization skipped: ' + e.message);
      }
    }

    if (config.optimization.enableCodeSplitting) {
      spinner = ora('Implementing code splitting...').start();
      try {
        results.optimizations.codeSplitting = await codeSplittingOptimizer(config);
        spinner.succeed('Code splitting implemented');
      } catch (e) {
        spinner.warn('Code splitting skipped: ' + e.message);
      }
    }

    spinner = ora('Optimizing Vite configuration...').start();
    try {
      results.optimizations.vite = await viteOptimizer(config);
      spinner.succeed('Vite configuration optimized');
    } catch (e) {
      spinner.warn('Vite optimization skipped: ' + e.message);
    }

    // Phase 3: Reporting
    console.log(chalk.bold.yellow('\n📈 PHASE 3: REPORTING\n'));

    spinner = ora('Generating reports...').start();
    try {
      const reportPaths = await reportGenerator(results, reportDir, config);
      spinner.succeed('Reports generated');
      results.reports = reportPaths;
    } catch (e) {
      spinner.warn('Report generation skipped: ' + e.message);
    }

    // Save full results
    fs.writeFileSync(
      path.join(reportDir, 'full-results.json'),
      JSON.stringify(results, null, 2)
    );

    // Display Summary
    console.log(chalk.bold.green('\n✅ OPTIMIZATION COMPLETE\n'));
    console.log(chalk.cyan(`📁 Reports saved to: ${reportDir}\n`));

    displaySummary(results);

  } catch (error) {
    console.error(chalk.red('\n❌ OPTIMIZATION FAILED\n'), error);
    process.exit(1);
  }
}

function displaySummary(results) {
  console.log(chalk.bold('SUMMARY:\n'));

  if (results.analyses.bundle) {
    const bundle = results.analyses.bundle;
    console.log(chalk.yellow('Bundle Analysis:'));
    console.log(`  • Main bundle: ${formatSize(bundle.mainSize)}`);
    console.log(`  • Total size: ${formatSize(bundle.totalSize)}`);
    console.log(`  • Dependencies: ${bundle.dependencies.length}`);
    if (bundle.warnings.length > 0) {
      console.log(chalk.red(`  • ⚠️  ${bundle.warnings.length} warnings`));
    }
  }

  if (results.analyses.components) {
    const components = results.analyses.components;
    console.log(chalk.yellow('\nComponent Analysis:'));
    console.log(`  • Total components: ${components.totalComponents}`);
    console.log(`  • Optimization candidates: ${components.candidates.length}`);
    if (components.candidates.length > 0) {
      console.log(`  • Estimated improvement: ${components.estimatedImprovement}%`);
    }
  }

  if (results.optimizations.images) {
    const images = results.optimizations.images;
    console.log(chalk.yellow('\nImage Optimization:'));
    console.log(`  • Images processed: ${images.processed}`);
    console.log(`  • Space saved: ${formatSize(images.spaceSaved)}`);
  }

  console.log(chalk.cyan('\n💡 Next steps:'));
  console.log('  1. Review reports in the reports directory');
  console.log('  2. Run npm run validate:changes to verify optimizations');
  console.log('  3. Test the application thoroughly');
  console.log('  4. Run npm run build to test production bundle');
  console.log('  5. Monitor performance with npm run watch:performance\n');
}

function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

runOptimizationPipeline();
