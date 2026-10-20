import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dshRoot = path.resolve(process.env.DSH_SOURCE_ROOT ?? path.join(import.meta.dirname, '..', 'deepseek-harness'))
const { clientBundle } = await import(pathToFileURL(path.join(dshRoot, 'packages', 'client', 'tsdown.client.ts')).href)
export default clientBundle(import.meta.dirname, ['dist/src/dsh/index.js'], { hostPhase: true })
