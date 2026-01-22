import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function bundleAnalyzer(config) {
  console.log('  [Bundle Analyzer] Starting analysis...');

  const packagePath = path.join(config.paths.root, 'Molda-main/package.json');
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const dependencies = Object.keys(packageData.dependencies || {});
  const devDependencies = Object.keys(packageData.devDependencies || {});

  // Analyze for common optimization opportunities
  const analysis = {
    totalDependencies: dependencies.length + devDependencies.length,
    dependencies,
    devDependencies,
    bundleStatus: {
      mainSize: 0,
      totalSize: 0,
      status: 'unknown'
    },
    warnings: [],
    suggestions: [],
    redundancies: detectRedundancies(dependencies),
    heavyDependencies: identifyHeavyDependencies(dependencies),
    unusedDependencies: []
  };

  // Check for common redundancies
  if (dependencies.includes('@react-three/fiber') && dependencies.includes('@react-three/drei')) {
    analysis.suggestions.push({
      type: 'optimization',
      severity: 'info',
      message: 'Consider lazy loading R3F components to reduce initial bundle',
      savings: '~45KB'
    });
  }

  if (dependencies.includes('shadcn') || devDependencies.includes('@shadcn/ui')) {
    analysis.suggestions.push({
      type: 'code-splitting',
      severity: 'info',
      message: 'Implement tree-shaking for unused shadcn components',
      savings: '~30KB'
    });
  }

  if (dependencies.includes('three')) {
    analysis.suggestions.push({
      type: 'lazy-loading',
      severity: 'info',
      message: 'Lazy load Three.js components in non-critical routes',
      savings: '~80KB'
    });
  }

  return analysis;
}

function detectRedundancies(dependencies) {
  const redundancies = [];

  // Common redundancy patterns
  const patterns = {
    'lodash': ['lodash-es', 'underscore'],
    'moment': ['date-fns', 'dayjs'],
    'axios': ['node-fetch', 'isomorphic-fetch'],
  };

  Object.entries(patterns).forEach(([main, alternatives]) => {
    if (dependencies.includes(main)) {
      alternatives.forEach(alt => {
        if (dependencies.includes(alt)) {
          redundancies.push({
            package: main,
            redundant: alt,
            suggestion: `Remove ${alt} if ${main} is used`
          });
        }
      });
    }
  });

  return redundancies;
}

function identifyHeavyDependencies(dependencies) {
  // Known heavy packages
  const heavyPackages = {
    'three': { size: '600KB', critical: true },
    '@react-three/fiber': { size: '200KB', critical: true },
    '@react-three/drei': { size: '400KB', critical: true },
    'fabric': { size: '250KB', critical: false },
    'lodash': { size: '70KB', critical: false },
    'chart.js': { size: '150KB', critical: false },
  };

  const heavy = [];
  dependencies.forEach(dep => {
    if (heavyPackages[dep]) {
      heavy.push({
        package: dep,
        size: heavyPackages[dep].size,
        critical: heavyPackages[dep].critical,
        lazyLoadable: !heavyPackages[dep].critical
      });
    }
  });

  return heavy;
}
