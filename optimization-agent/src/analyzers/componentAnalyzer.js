import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import fg from 'fast-glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function componentAnalyzer(config) {
  console.log('  [Component Analyzer] Starting analysis...');

  const componentsDir = path.join(config.paths.moldaMain, 'src/components');
  const componentFiles = await fg('**/*.tsx', { cwd: componentsDir });

  const analysis = {
    totalComponents: componentFiles.length,
    candidates: [],
    issues: [],
    estimatedImprovement: 0,
    recommendations: []
  };

  let improvementScore = 0;

  for (const file of componentFiles) {
    const filePath = path.join(componentsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(file, '.tsx');

    // Check if component should be lazy loaded
    if (isLazyLoadCandidate(fileName, config)) {
      const componentIssues = analyzeComponent(content, fileName);
      
      if (componentIssues.shouldLazyLoad) {
        analysis.candidates.push({
          name: fileName,
          path: file,
          lazyLoadable: true,
          issues: componentIssues.issues,
          estimatedSavings: componentIssues.savings
        });
        improvementScore += componentIssues.savings;
      }

      if (componentIssues.issues.length > 0) {
        analysis.issues.push({
          component: fileName,
          issues: componentIssues.issues
        });
      }
    }
  }

  // Calculate estimated improvement percentage
  analysis.estimatedImprovement = Math.round(improvementScore / 1000);

  // Add recommendations
  analysis.recommendations = [
    {
      type: 'lazy-loading',
      priority: 'high',
      suggestion: `Implement lazy loading for ${analysis.candidates.length} heavy components`,
      impact: `Reduce initial bundle by ~${analysis.estimatedImprovement}KB`
    },
    {
      type: 'memoization',
      priority: 'medium',
      suggestion: 'Use React.memo() for components receiving complex props',
      impact: 'Reduce unnecessary re-renders'
    },
    {
      type: 'code-splitting',
      priority: 'high',
      suggestion: 'Split route-based components into separate chunks',
      impact: 'Faster route transitions'
    }
  ];

  return analysis;
}

function isLazyLoadCandidate(componentName, config) {
  return config.lazyLoadComponents.moldaMain.some(
    candidate => componentName.includes(candidate)
  );
}

function analyzeComponent(content, componentName) {
  const issues = [];
  let shouldLazyLoad = false;
  let savings = 50; // Default savings estimate

  // Check for hooks that indicate heavy component
  if (content.includes('useThree') || content.includes('Canvas')) {
    shouldLazyLoad = true;
    savings = 150;
    issues.push('Uses Three.js - good candidate for lazy loading');
  }

  // Check for large imports
  if (content.includes('import { LineChart') || content.includes('import { BarChart')) {
    shouldLazyLoad = true;
    savings = 100;
    issues.push('Uses heavy charting library');
  }

  // Check for external library usage
  if (content.includes('from "fabric"')) {
    shouldLazyLoad = true;
    savings = 80;
    issues.push('Uses Fabric.js - can be lazy loaded');
  }

  // Check component size
  const lines = content.split('\n').length;
  if (lines > 300) {
    issues.push(`Large component (${lines} lines) - consider splitting`);
    savings += 20;
  }

  // Check for prop drilling patterns
  const propDrillingMatches = content.match(/props\.[a-zA-Z]+/g) || [];
  if (propDrillingMatches.length > 10) {
    issues.push('High prop drilling detected - consider context API or state management');
  }

  return {
    shouldLazyLoad: shouldLazyLoad || issues.length > 2,
    issues,
    savings
  };
}
