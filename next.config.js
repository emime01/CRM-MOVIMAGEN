/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    // Remotion + Chromium son Node-only y traen binarios. No los puede bundlear webpack.
    serverComponentsExternalPackages: [
      '@remotion/bundler',
      '@remotion/renderer',
      'remotion',
      'esbuild',
      '@sparticuz/chromium-min',
    ],
    outputFileTracingIncludes: {
      '/api/comprobantes': [
        // Bundle pre-armado en build (scripts/build-remotion.mjs) — evita correr
        // webpack en runtime durante el cold start.
        './.remotion-bundle/**/*',
        // Fallback por si el bundle pre-armado no está y hay que bundlear runtime.
        './src/remotion/**/*',
      ],
    },
    outputFileTracingExcludes: {
      '/api/comprobantes': [
        // Caché de webpack (~89 MB), solo build-time.
        'node_modules/.cache/**',
        // Build-time tooling traccionado por @remotion/bundler que no necesitamos
        // en runtime (ya pre-bundleamos).
        'node_modules/@rspack/**',
        'node_modules/@remotion/studio/**',
        'node_modules/@remotion/bundler/**',
        'node_modules/webpack/**',
        'node_modules/typescript/**',
        'node_modules/@esbuild/**',
        'node_modules/esbuild/**',
        // Sourcemaps innecesarios en runtime.
        '**/*.map',
      ],
    },
  },
}
module.exports = nextConfig
