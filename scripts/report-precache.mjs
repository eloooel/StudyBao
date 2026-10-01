import { existsSync, readFileSync, statSync } from 'node:fs'

const sw = readFileSync('dist/sw.js', 'utf8')
const manifest = /precacheAndRoute\(\[(.*?)\]/s.exec(sw)
if (manifest === null) {
  console.log('no precache manifest found')
  process.exit(0)
}

const entries = [...manifest[1].matchAll(/url:"([^"]+)"/g)].map((match) => match[1])
console.log(`precache entries: ${String(entries.length)}`)

let total = 0
const big = []
for (const url of entries) {
  const path = `dist/${url.replace(/^\//, '')}`
  if (!existsSync(path)) continue
  const size = statSync(path).size
  total += size
  if (size > 50 * 1024) big.push(`${url} — ${String(Math.round(size / 1024))} KB`)
}

console.log(`precache bytes: ${String(Math.round(total / 1024))} KiB`)
console.log('entries over 50 KB:')
for (const line of big) console.log('  ', line)
console.log(
  'entries matching pdf/ocr:',
  entries.filter((url) => /pdf|ocr/i.test(url)),
)
