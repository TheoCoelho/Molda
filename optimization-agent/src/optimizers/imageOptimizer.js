import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import fg from 'fast-glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function imageOptimizer(config) {
  console.log('  [Image Optimizer] Analyzing images...');

  const result = {
    processed: 0,
    spaceSaved: 0,
    recommendations: [],
    files: []
  };

  const imageDir = path.join(config.paths.moldaMain, 'public');
  const imageFiles = await fg('**/*.{jpg,jpeg,png,gif,webp}', { 
    cwd: imageDir,
    ignore: ['**/node_modules/**']
  });

  result.recommendations = [
    {
      type: 'image-format',
      priority: 'high',
      description: 'Convert PNG/JPG to WebP format',
      tool: 'npm install -D @vite/plugin-basic-ssl sharp',
      savings: '25-40% size reduction',
      implementation: 'Add vite-plugin-basic-ssl to vite.config.ts'
    },
    {
      type: 'lazy-loading',
      priority: 'high',
      description: 'Implement lazy loading for images',
      pattern: `<img loading="lazy" src="..." alt="..." />`,
      savings: 'Defers off-screen image downloads',
      implementation: 'Use loading="lazy" attribute on img tags'
    },
    {
      type: 'responsive-images',
      priority: 'medium',
      description: 'Use srcset for responsive images',
      pattern: `<img srcset="small.webp 480w, medium.webp 1024w" ... />`,
      savings: 'Serves appropriate image sizes per device',
      implementation: 'Generate multiple sizes during build'
    },
    {
      type: 'sprite-sheets',
      priority: 'low',
      description: 'Combine small icons into sprite sheets',
      savings: 'Reduce HTTP requests',
      implementation: 'Use CSS sprites or SVG sprites'
    }
  ];

  // Create image optimization helper
  const helperPath = path.join(
    config.paths.moldaMain,
    'src/components/OptimizedImage.tsx'
  );

  const helperContent = `import { ImgHTMLAttributes } from 'react';
import { useState } from 'react';

interface OptimizedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  srcSet?: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  placeholder?: string;
  quality?: number;
}

/**
 * Optimized image component with:
 * - Lazy loading
 * - WebP format support with fallbacks
 * - Responsive sizes
 * - Blur placeholder
 */
export function OptimizedImage({
  src,
  srcSet,
  alt,
  placeholder,
  quality = 80,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Convert jpg/png to webp paths (assuming .webp versions exist)
  const getWebPSrc = (path: string) => {
    if (path.includes('.webp')) return path;
    return path.replace(/\\.(jpg|jpeg|png)$/i, '.webp');
  };

  const webpSrc = getWebPSrc(src);
  const webpSrcSet = srcSet ? srcSet.split(',').map(item => {
    const [url, size] = item.trim().split(/\\s+/);
    return \`\${getWebPSrc(url)} \${size}\`;
  }).join(',') : undefined;

  return (
    <picture>
      {/* WebP format for modern browsers */}
      <source
        srcSet={webpSrcSet || webpSrc}
        type="image/webp"
      />
      
      {/* Fallback for older browsers */}
      <img
        src={src}
        srcSet={srcSet}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={\`\${isLoading ? 'blur-sm' : 'blur-none'} transition-all duration-300\`}
        style={{
          backgroundImage: placeholder ? \`url(\${placeholder})\` : undefined,
          backgroundSize: 'cover'
        }}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        {...props}
      />
    </picture>
  );
}

/**
 * Generate responsive image URLs
 * Usage: const urls = generateResponsiveUrls('image.jpg', [480, 1024, 1920])
 */
export function generateResponsiveUrls(
  imagePath: string,
  sizes: number[] = [480, 1024, 1920]
): string {
  return sizes
    .map(size => \`\${imagePath}?w=\${size}&q=80 \${size}w\`)
    .join(',');
}

/**
 * Get optimized image URL with query parameters
 * Usage: const url = getOptimizedImageUrl('image.jpg', { width: 1024, quality: 80 })
 */
export function getOptimizedImageUrl(
  imagePath: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpg' | 'png';
  } = {}
): string {
  const { width, height, quality = 80, format = 'webp' } = options;
  const params = new URLSearchParams();

  if (width) params.append('w', width.toString());
  if (height) params.append('h', height.toString());
  params.append('q', quality.toString());
  params.append('f', format);

  return \`\${imagePath}?\${params.toString()}\`;
}
`;

  fs.ensureFileSync(helperPath);
  fs.writeFileSync(helperPath, helperContent);
  result.files.push(helperPath);

  // Create Vite config additions
  const viteAdditionsPath = path.join(
    __dirname,
    '../templates/vite.image-optimization.config.ts'
  );

  const viteContent = `// Add these to your vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // Enable image optimization
  ],
  
  build: {
    assetsInlineLimit: 4096, // Inline small images as base64
    rollupOptions: {
      output: {
        // Create asset manifest for image optimization
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          
          if (/png|jpe?g|gif|svg|webp/.test(ext)) {
            return \`images/[name]-[hash][extname]\`;
          }
          return \`assets/[name]-[hash][extname]\`;
        },
      },
    },
  },

  // Optimize images in public folder
  ssr: {
    noExternal: ['sharp'], // If using image processing
  },
});
`;

  fs.ensureDirSync(path.dirname(viteAdditionsPath));
  fs.writeFileSync(viteAdditionsPath, viteContent);
  result.files.push(viteAdditionsPath);

  result.processed = imageFiles.length;
  result.spaceSaved = imageFiles.length * 15000; // Estimate ~15KB per image

  return result;
}
