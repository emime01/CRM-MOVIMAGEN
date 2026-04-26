/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    // Keep ffmpeg packages server-side only so webpack doesn't try to bundle
    // the native binary, and Vercel's file tracer ships it with the function.
    serverComponentsExternalPackages: ['@ffmpeg-installer/ffmpeg', 'fluent-ffmpeg'],
  },
  outputFileTracingIncludes: {
    '/api/comprobantes': [
      './node_modules/@ffmpeg-installer/**/*',
      // Font used by ffmpeg drawtext for soporte name + dates overlay
      './src/lib/comprobantes/fonts/**/*',
    ],
  },
}
module.exports = nextConfig
