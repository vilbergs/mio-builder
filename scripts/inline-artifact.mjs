// Turns the `vite build --mode artifact` output into one self-contained HTML page (CSS and JS inlined).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist-artifact'
const assets = join(dir, 'assets')
const files = readdirSync(assets)
const js = files.filter((f) => f.endsWith('.js'))
if (js.length !== 1) throw new Error(`expected one JS chunk, found ${js.join(', ')}`)
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')
const code = readFileSync(join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script')

const page = `<title>Rossi Couch Builder</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${code}</script>
`
writeFileSync(join(dir, 'rossi-couch-builder.html'), page)
console.log(`wrote ${join(dir, 'rossi-couch-builder.html')} (${(page.length / 1024).toFixed(0)} kB)`)
