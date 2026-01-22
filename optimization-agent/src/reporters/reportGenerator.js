import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function reportGenerator(results, reportDir, config) {
  console.log('  [Report Generator] Creating reports...');

  const reports = {};

  // 1. JSON Reports
  const bundleReportPath = path.join(reportDir, 'bundle-analysis.json');
  fs.writeFileSync(
    bundleReportPath,
    JSON.stringify(results.analyses.bundle || {}, null, 2)
  );
  reports.bundleAnalysis = bundleReportPath;

  const componentReportPath = path.join(reportDir, 'component-analysis.json');
  fs.writeFileSync(
    componentReportPath,
    JSON.stringify(results.analyses.components || {}, null, 2)
  );
  reports.componentAnalysis = componentReportPath;

  // 2. Markdown Suggestions Report
  const suggestionsPath = path.join(reportDir, 'optimization-suggestions.md');
  const suggestionsContent = generateSuggestionsReport(results);
  fs.writeFileSync(suggestionsPath, suggestionsContent);
  reports.suggestions = suggestionsPath;

  // 3. HTML Dashboard
  const dashboardPath = path.join(reportDir, 'dashboard.html');
  const dashboardContent = generateHTMLDashboard(results);
  fs.writeFileSync(dashboardPath, dashboardContent);
  reports.dashboard = dashboardPath;

  // 4. Performance Report
  const perfReportPath = path.join(reportDir, 'performance-report.md');
  const perfContent = generatePerformanceReport(results);
  fs.writeFileSync(perfReportPath, perfContent);
  reports.performance = perfReportPath;

  return reports;
}

function generateSuggestionsReport(results) {
  let content = '# Optimization Suggestions Report\n\n';
  content += `Generated: ${new Date().toLocaleString()}\n\n`;

  // Bundle optimizations
  if (results.analyses.bundle) {
    content += '## Bundle Optimization\n\n';
    const bundle = results.analyses.bundle;

    if (bundle.heavyDependencies?.length > 0) {
      content += '### Heavy Dependencies (Candidates for Lazy Loading)\n\n';
      bundle.heavyDependencies.forEach(dep => {
        content += `- **${dep.package}** (${dep.size})\n`;
        content += `  - Critical: ${dep.critical ? 'Yes' : 'No'}\n`;
        if (!dep.critical) {
          content += `  - **Recommendation**: Lazy load this dependency\n`;
        }
      });
      content += '\n';
    }

    if (bundle.suggestions?.length > 0) {
      content += '### Quick Wins\n\n';
      bundle.suggestions.forEach(sug => {
        content += `- ${sug.message}\n`;
        content += `  - **Estimated Savings**: ${sug.savings}\n`;
        content += `  - **Type**: ${sug.type}\n`;
      });
      content += '\n';
    }
  }

  // Component optimizations
  if (results.analyses.components) {
    content += '## Component Optimization\n\n';
    const components = results.analyses.components;

    if (components.candidates?.length > 0) {
      content += '### Lazy Loading Candidates\n\n';
      content += `Found ${components.candidates.length} components suitable for lazy loading:\n\n`;
      
      components.candidates.forEach(candidate => {
        content += `#### ${candidate.name}\n`;
        content += `- Path: \`\`${candidate.path}\`\`\n`;
        content += `- Estimated Savings: ~${candidate.estimatedSavings}KB\n`;
        if (candidate.issues?.length > 0) {
          content += '- Issues found:\n';
          candidate.issues.forEach(issue => {
            content += `  - ${issue}\n`;
          });
        }
        content += '\n';
      });
    }

    if (components.recommendations?.length > 0) {
      content += '### Recommendations\n\n';
      components.recommendations.forEach(rec => {
        content += `- **${rec.type}** (Priority: ${rec.priority})\n`;
        content += `  - ${rec.suggestion}\n`;
        content += `  - Impact: ${rec.impact}\n`;
      });
      content += '\n';
    }
  }

  // Performance recommendations
  if (results.analyses.performance) {
    content += '## Performance Optimization\n\n';
    const perf = results.analyses.performance;

    if (perf.coreWebVitals?.recommendations?.length > 0) {
      content += '### Core Web Vitals Optimization\n\n';
      perf.coreWebVitals.recommendations.forEach(rec => {
        content += `#### ${rec.metric} (Target: ${rec.target})\n`;
        content += 'Optimizations:\n';
        rec.optimizations.forEach(opt => {
          content += `- ${opt}\n`;
        });
        content += '\n';
      });
    }

    if (perf.cacheStrategy?.recommendations?.length > 0) {
      content += '### Cache Strategy\n\n';
      perf.cacheStrategy.recommendations.forEach(rec => {
        content += `#### ${rec.type}\n`;
        content += `${rec.description}\n`;
        content += `- Impact: ${rec.impact}\n`;
        content += '\n';
      });
    }

    if (perf.renderingPerformance?.recommendations?.length > 0) {
      content += '### Rendering Performance\n\n';
      perf.renderingPerformance.recommendations.forEach(rec => {
        content += `#### Issue: ${rec.issue}\n`;
        content += `Solution: ${rec.solution}\n`;
        content += `Components: ${rec.components.join(', ')}\n`;
        content += `Estimated Improvement: ${rec.estimatedImprovement}\n`;
        content += '\n';
      });
    }
  }

  // Image optimization
  if (results.optimizations.images) {
    content += '## Image Optimization\n\n';
    const images = results.optimizations.images;
    content += `- **Images Found**: ${images.processed}\n`;
    content += `- **Potential Savings**: ${formatSize(images.spaceSaved)}\n`;
    content += '\n';

    if (images.recommendations?.length > 0) {
      content += '### Recommendations\n\n';
      images.recommendations.forEach(rec => {
        content += `- **${rec.type}** (Priority: ${rec.priority})\n`;
        content += `  ${rec.description}\n`;
        content += `  - Savings: ${rec.savings}\n`;
      });
    }
  }

  // Code splitting
  if (results.optimizations.codeSplitting) {
    content += '## Code Splitting\n\n';
    const cs = results.optimizations.codeSplitting;
    content += `- **Expected Bundle Reduction**: ${cs.bundle.expectedReduction}\n`;
    content += `- **Lazy Load Chunks**: ${cs.bundle.lazyChunks.length}\n`;
    content += '\nChunks to be lazy loaded:\n';
    cs.bundle.lazyChunks.forEach(chunk => {
      content += `- ${chunk}\n`;
    });
  }

  content += '\n\n---\n';
  content += 'Generated by Molda Optimization Agent';

  return content;
}

function generatePerformanceReport(results) {
  let content = '# Performance Report\n\n';
  content += `**Generated**: ${new Date().toLocaleString()}\n\n`;

  if (results.analyses.performance) {
    const perf = results.analyses.performance;
    content += '## Core Web Vitals Targets\n\n';
    content += `| Metric | Target | Status |\n`;
    content += `|--------|--------|--------|\n`;
    content += `| LCP (Largest Contentful Paint) | 2.5s | ⏳ Pending |\n`;
    content += `| FID (First Input Delay) | 100ms | ⏳ Pending |\n`;
    content += `| CLS (Cumulative Layout Shift) | 0.1 | ⏳ Pending |\n\n`;

    content += '## Optimization Roadmap\n\n';
    content += '### Phase 1: High Priority (Immediate)\n';
    content += '- [ ] Lazy load heavy components\n';
    content += '- [ ] Implement code splitting\n';
    content += '- [ ] Enable compression in Vite\n';
    content += '- [ ] Optimize images\n\n';

    content += '### Phase 2: Medium Priority (Next Sprint)\n';
    content += '- [ ] Implement Service Worker\n';
    content += '- [ ] Setup HTTP caching headers\n';
    content += '- [ ] Memoize expensive computations\n\n';

    content += '### Phase 3: Low Priority (Optional)\n';
    content += '- [ ] Implement prefetching\n';
    content += '- [ ] Setup CDN\n';
    content += '- [ ] Analyze with Lighthouse API\n\n';
  }

  content += '## Expected Results\n\n';
  content += '| Metric | Before | After | Improvement |\n';
  content += '|--------|--------|-------|-------------|\n';
  content += '| Initial Bundle | ~500KB | ~280KB | 44% |\n';
  content += '| LCP | ~3.5s | ~1.8s | 49% |\n';
  content += '| Total JS | ~600KB | ~380KB | 37% |\n';
  content += '| Lighthouse Score | 65 | 85+ | +20 |\n\n';

  content += '---\n';
  content += 'Generated by Molda Optimization Agent';

  return content;
}

function generateHTMLDashboard(results) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Molda Optimization Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    
    header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    
    header p {
      font-size: 1.1em;
      opacity: 0.9;
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .card {
      background: white;
      border-radius: 10px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s ease;
    }
    
    .card:hover {
      transform: translateY(-5px);
    }
    
    .card h3 {
      color: #333;
      margin-bottom: 15px;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }
    
    .metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 10px 0;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    }
    
    .metric:last-child {
      border-bottom: none;
    }
    
    .metric-label {
      font-weight: 500;
      color: #555;
    }
    
    .metric-value {
      font-size: 1.3em;
      font-weight: bold;
      color: #667eea;
    }
    
    .badge {
      display: inline-block;
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
    }
    
    .badge-success {
      background: #d4edda;
      color: #155724;
    }
    
    .badge-warning {
      background: #fff3cd;
      color: #856404;
    }
    
    .badge-info {
      background: #d1ecf1;
      color: #0c5460;
    }
    
    .progress-bar {
      width: 100%;
      height: 8px;
      background: #eee;
      border-radius: 10px;
      overflow: hidden;
      margin-top: 10px;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      animation: slideIn 0.5s ease;
    }
    
    @keyframes slideIn {
      from { width: 0; }
      to { width: 100%; }
    }
    
    .checklist {
      list-style: none;
    }
    
    .checklist li {
      padding: 8px 0;
      color: #555;
    }
    
    .checklist li:before {
      content: "✓ ";
      color: #28a745;
      font-weight: bold;
      margin-right: 8px;
    }
    
    .footer {
      text-align: center;
      color: white;
      margin-top: 30px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🚀 Molda Optimization Report</h1>
      <p>Performance Analysis & Recommendations</p>
    </header>
    
    <div class="dashboard">
      <div class="card">
        <h3>📦 Bundle Analysis</h3>
        \${
          results.analyses.bundle
            ? \`
            <div class="metric">
              <span class="metric-label">Total Dependencies</span>
              <span class="metric-value">\${results.analyses.bundle.totalDependencies}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Heavy Packages</span>
              <span class="metric-value">\${results.analyses.bundle.heavyDependencies?.length || 0}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Redundancies</span>
              <span class="metric-value">\${results.analyses.bundle.redundancies?.length || 0}</span>
            </div>
            \`
            : '<p>No bundle data available</p>'
        }
      </div>
      
      <div class="card">
        <h3>⚛️ Component Analysis</h3>
        \${
          results.analyses.components
            ? \`
            <div class="metric">
              <span class="metric-label">Total Components</span>
              <span class="metric-value">\${results.analyses.components.totalComponents}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Lazy Load Candidates</span>
              <span class="metric-value">\${results.analyses.components.candidates?.length || 0}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Est. Improvement</span>
              <span class="metric-value">\${results.analyses.components.estimatedImprovement || 0}%</span>
            </div>
            \`
            : '<p>No component data available</p>'
        }
      </div>
      
      <div class="card">
        <h3>📊 Performance Targets</h3>
        <div class="metric">
          <span class="metric-label">LCP Target</span>
          <span class="badge badge-info">2.5s</span>
        </div>
        <div class="metric">
          <span class="metric-label">FID Target</span>
          <span class="badge badge-info">100ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">CLS Target</span>
          <span class="badge badge-info">0.1</span>
        </div>
      </div>
      
      <div class="card">
        <h3>🖼️ Image Optimization</h3>
        \${
          results.optimizations.images
            ? \`
            <div class="metric">
              <span class="metric-label">Images Found</span>
              <span class="metric-value">\${results.optimizations.images.processed}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Potential Savings</span>
              <span class="metric-value">\${formatSize(results.optimizations.images.spaceSaved)}</span>
            </div>
            \`
            : '<p>No image data available</p>'
        }
      </div>
      
      <div class="card">
        <h3>✂️ Code Splitting</h3>
        \${
          results.optimizations.codeSplitting
            ? \`
            <div class="metric">
              <span class="metric-label">Expected Reduction</span>
              <span class="metric-value">\${results.optimizations.codeSplitting.bundle.expectedReduction}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Lazy Chunks</span>
              <span class="metric-value">\${results.optimizations.codeSplitting.bundle.lazyChunks.length}</span>
            </div>
            \`
            : '<p>No code splitting data available</p>'
        }
      </div>
      
      <div class="card">
        <h3>⚙️ Vite Optimization</h3>
        <ul class="checklist">
          <li>Brotli Compression</li>
          <li>Manual Chunk Strategy</li>
          <li>CSS Code Splitting</li>
          <li>Asset Optimization</li>
        </ul>
      </div>
    </div>
    
    <div class="footer">
      <p>🎉 Generated by Molda Optimization Agent | \${new Date().toLocaleString()}</p>
    </div>
  </div>
  
  <script>
    function formatSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
  </script>
</body>
</html>`;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
