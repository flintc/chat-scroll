#!/usr/bin/env node
// Copies a recorded video into docs/public/videos so the docs can embed
// it. Manual on purpose — videos are the human-vetted artifact.
//
// Usage:
//   pnpm e2e:promote <pattern>
//
// <pattern> matches video stems by substring. Examples:
//   pnpm e2e:promote pin-to-top              # both vanilla + solid
//   pnpm e2e:promote vanilla                 # all vanilla videos
//   pnpm e2e:promote vanilla__pin-to-top     # exactly one
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const videoDir = path.resolve(here, '..', 'videos')
const docsDir = path.resolve(here, '..', '..', 'docs', 'public', 'videos')

const pattern = process.argv[2]
if (!pattern) {
  console.error('Usage: pnpm e2e:promote <pattern>')
  console.error('       (run `pnpm e2e:list` to see what is available)')
  process.exit(2)
}

if (!fs.existsSync(videoDir)) {
  console.error(`No videos at ${videoDir}. Run \`pnpm e2e\` first.`)
  process.exit(1)
}

const all = fs.readdirSync(videoDir).filter((f) => f.endsWith('.webm'))
const matches = all.filter((f) => f.includes(pattern))

if (matches.length === 0) {
  console.error(`No videos match "${pattern}". Available:`)
  for (const v of all) console.error(`  ${v.replace(/\.webm$/, '')}`)
  process.exit(1)
}

fs.mkdirSync(docsDir, { recursive: true })

for (const m of matches) {
  const src = path.join(videoDir, m)
  const dest = path.join(docsDir, m)
  fs.copyFileSync(src, dest)
  const size = (fs.statSync(src).size / 1024 / 1024).toFixed(2)
  console.log(`✓ ${m}  (${size} MB)  →  docs/public/videos/${m}`)
}

console.log(
  `\nEmbed in markdown with:\n  <video src="/videos/${matches[0]}" controls muted loop />`,
)
