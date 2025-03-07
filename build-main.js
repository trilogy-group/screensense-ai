// build-main.js
require('esbuild')
  .build({
    entryPoints: ['electron/main.ts'],
    bundle: true,
    platform: 'node',
    target: 'node16', // Adjust if needed to match your Electron version
    outfile: 'build/electron/main.js',
    external: [
      // Don't bundle electron
      'electron',

      // Never bundle native modules or their dependencies
      '@nut-tree-fork/*',
      '@nut-tree/*',
      'node-global-key-listener',
      'uiohook-napi',
      'sharp',
      'fluent-ffmpeg',
      '@parcel/watcher',

      // ESM packages that cause issues
      'pkce-challenge',

      // Other potential problematic packages
      '@modelcontextprotocol/*',

      // Fix warnings
      'highlight.js',
    ],
    format: 'cjs',
    sourcemap: true,
    // Allow top-level await
    loader: { '.ts': 'ts' },
    // Allow tree-shaking
    treeShaking: true,
    // Add warnings as logs
    logLevel: 'info',
    // Ensure modules can be resolved
    mainFields: ['main', 'module'],
    // Add path resolution for native modules
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      global: 'globalThis',
    },
    plugins: [
      {
        name: 'native-modules',
        setup(build) {
          // This helps with native module resolution
          build.onResolve({ filter: /\.node$/ }, args => {
            return { external: true };
          });
        },
      },
    ],
  })
  .catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
