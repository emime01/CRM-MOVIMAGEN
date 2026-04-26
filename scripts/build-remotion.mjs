// Pre-bundle the Remotion composition at build time so the API route does
// not need to run webpack during a serverless cold start.
import { bundle } from '@remotion/bundler'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const entryPoint = path.resolve(projectRoot, 'src/remotion/index.ts')
const outDir = path.resolve(projectRoot, '.remotion-bundle')

console.log('[remotion] Bundling composition...')
console.log('[remotion]   entry:', entryPoint)
console.log('[remotion]   out:  ', outDir)

const result = await bundle({
  entryPoint,
  outDir,
  // Sin sourcemaps: pesan ~13 MB innecesarios en el deploy serverless.
  webpackOverride: (config) => ({ ...config, devtool: false }),
})

console.log('[remotion] Done. Bundle path:', result)
