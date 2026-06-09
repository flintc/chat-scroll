import type {
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Copies each test's recorded video to a stable, flat path:
 *   e2e/videos/<project>__<slug>.webm
 *
 * Why: Playwright stores videos under a hashed test-results subdirectory.
 * The promote script needs a deterministic name so humans can refer to
 * "the pin-to-top video" without grepping a hash.
 */
export default class VideoRename implements Reporter {
  private readonly outDir = path.resolve(
    import.meta.dirname,
    '..',
    'videos',
  )

  onBegin(): void {
    fs.mkdirSync(this.outDir, { recursive: true })
    // Wipe stale videos from previous runs so promote sees only fresh output.
    for (const entry of fs.readdirSync(this.outDir)) {
      if (entry.endsWith('.webm')) {
        fs.unlinkSync(path.join(this.outDir, entry))
      }
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const video = result.attachments.find(
      (a) => a.name === 'video' && typeof a.path === 'string',
    )
    if (!video?.path) return
    if (!fs.existsSync(video.path)) return
    const project = test.parent.project()?.name ?? 'unknown'
    const slug = test.title
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
    const dest = path.join(this.outDir, `${project}__${slug}.webm`)
    fs.copyFileSync(video.path, dest)
  }
}
