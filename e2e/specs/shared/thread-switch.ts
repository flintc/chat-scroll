import { test, expect, hold, showCue } from '../../fixtures'

export function threadSwitchSpec(): void {
  test('thread-switch', async ({ page }) => {
    await page.goto('/#/thread-switch')
    await page.waitForFunction(() => Boolean(window.__demo))

    await hold(page, 2200) // opening still

    // ─── Mid-thread on t1 ──────────────────────────────────
    await showCue(page, 'user scrolls up in thread 1')
    await page.locator('[data-test="scroll-up"]').click()
    await hold(page, 600)
    await page.locator('[data-test="scroll-up"]').click()
    await hold(page, 1000)

    const t1Top = await page.evaluate(
      () =>
        document.querySelector<HTMLElement>('[data-test="scroll"]')
          ?.scrollTop ?? 0,
    )
    expect(t1Top).toBeGreaterThan(50)

    // ─── Switch to t2 ──────────────────────────────────────
    await showCue(page, 'user switches to thread 2')
    await page.locator('[data-test="thread-t2"]').click()
    await hold(page, 1500)

    const t2AtBottom = await page.evaluate(() => {
      const c = document.querySelector<HTMLElement>('[data-test="scroll"]')
      if (!c) return false
      return c.scrollHeight - c.scrollTop - c.clientHeight < 20
    })
    expect(t2AtBottom).toBe(true)

    // ─── Switch to t3 ──────────────────────────────────────
    await showCue(page, 'user switches to thread 3')
    await page.locator('[data-test="thread-t3"]').click()
    await hold(page, 1200)

    // ─── Switch back to t1 — restore mid-thread position ──
    await showCue(page, 'back to thread 1 — position restored')
    await page.locator('[data-test="thread-t1"]').click()
    await hold(page, 1500)

    const t1Restored = await page.evaluate(
      () =>
        document.querySelector<HTMLElement>('[data-test="scroll"]')
          ?.scrollTop ?? 0,
    )
    expect(Math.abs(t1Restored - t1Top)).toBeLessThan(20)

    await hold(page, 1000)
  })
}
