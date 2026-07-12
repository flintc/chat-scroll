import { test, expect, sendUserMessage, streamN } from '../../fixtures'

/**
 * In-page unmount coverage. Every other spec starts with a fresh
 * `page.goto`, so a crash in the framework's unmount path (vDOM
 * reconciliation walking the chat subtree while a scroll controller is
 * still attached) would never show up — the page it blanks is the one
 * the NEXT spec never visits. This spec clicks between scenarios inside
 * one live page — each switch is a real Vue `v-if` unmount into a
 * different component — and asserts the destination renders.
 *
 * The stream-first step matters: the gutter must be a real, sized
 * element (not a 0px no-op) when the unmount happens, and the pin must
 * be engaged, so teardown runs against live geometry.
 */
test('scenario switches unmount cleanly — no blank page, no leftover gutter', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))

  // Engage the pin and stream enough that the gutter has real height.
  await sendUserMessage(page)
  await streamN(page, 10, 30)
  const gutterHeight = await page
    .locator('[data-chat-scroll-gutter]')
    .evaluate((el) => parseFloat((el as HTMLElement).style.height) || 0)
  expect(gutterHeight).toBeGreaterThan(0)

  // Walk every scenario in one live page. Expected gutter count comes
  // from the destination's template (side-by-side renders two panes).
  const hops: Array<{ slug: string; gutters: number }> = [
    { slug: 'stick-to-bottom', gutters: 1 },
    { slug: 'thread-switch', gutters: 1 },
    { slug: 'side-by-side', gutters: 2 },
    { slug: 'pin-to-top-simple', gutters: 1 },
    { slug: 'pin-to-top', gutters: 1 },
  ]

  for (const hop of hops) {
    await page.click(`.demo-bar a[href="#/${hop.slug}"]`)
    // The destination component rendered — the literal "next page is
    // blank" failure mode this spec exists to catch.
    await expect(page.locator(`[data-scenario="${hop.slug}"]`)).toBeVisible()
    // The outgoing scenario's gutter left with its component; only the
    // destination's own template gutter(s) remain.
    await expect(page.locator('[data-chat-scroll-gutter]')).toHaveCount(
      hop.gutters,
    )
  }

  expect(pageErrors).toEqual([])
})
