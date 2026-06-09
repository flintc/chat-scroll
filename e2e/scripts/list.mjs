#!/usr/bin/env node
// Lists videos available for promotion. Run after `pnpm e2e`.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const videoDir = path.resolve(here, '..', 'videos')
const docsDir = path.resolve(here, '..', '..', 'docs', 'public', 'videos')

if (!fs.existsSync(videoDir)) {
  console.log('(no videos yet — run `pnpm e2e` first)')
  process.exit(0)
}

const videos = fs
  .readdirSync(videoDir)
  .filter((f) => f.endsWith('.webm'))
  .sort()

if (videos.length === 0) {
  console.log('(no videos in e2e/videos — run `pnpm e2e` first)')
  process.exit(0)
}

const promoted = new Set(
  fs.existsSync(docsDir)
    ? fs.readdirSync(docsDir).filter((f) => f.endsWith('.webm'))
    : [],
)

console.log('Available videos:')
for (const v of videos) {
  const mark = promoted.has(v) ? '★' : ' '
  const stem = v.replace(/\.webm$/, '')
  const size = (fs.statSync(path.join(videoDir, v)).size / 1024 / 1024).toFixed(
    2,
  )
  console.log(`  ${mark} ${stem.padEnd(40)} ${size} MB`)
}
console.log('\n★ = already promoted to docs/public/videos')
console.log('Promote one with: pnpm e2e:promote <name>  (e.g. pin-to-top)')
console.log('Promote all matching a project with: pnpm e2e:promote vanilla')
