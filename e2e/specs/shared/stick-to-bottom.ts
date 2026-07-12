import { test, expect, hold, showCue, streamUntilDone, userScrollSmooth } from '../../fixtures'

export function stickToBottomSpec(): void {
  test('stick-to-bottom', async ({ page }) => {
    await page.goto('/#/stick-to-bottom')
    await page.waitForFunction(() => Boolean(window.__demo))

    await hold(page, 2200) // opening still — locked, prior chitchat visible

    await expect(page.locator('[data-test="status"]')).toContainText(
      'locked=✓',
    )

    // ─── Auto-follow ──────────────────────────────────────────
    await showCue(page, 'user sends a question')
    await page.evaluate(() => {
      window.__demo?.sendUserMessage('Tell me more about that.')
    })
    await hold(page, 500)
    await streamUntilDone(page, 130)
    await hold(page, 500)

    const gap1 = await page.evaluate(() => {
      const c = document.querySelector<HTMLElement>('[data-test="scroll"]')
      return c ? c.scrollHeight - c.scrollTop - c.clientHeight : Infinity
    })
    expect(gap1).toBeLessThan(50)

    await hold(page, 1500)

    // ─── User scrolls up — releases the lock ─────────────────
    await showCue(page, 'user scrolls up — lock releases')
    await userScrollSmooth(page, -300)
    await hold(page, 1000)
    await expect(page.locator('[data-test="status"]')).toContainText(
      'locked=·',
    )

    await hold(page, 800)

    // ─── More content arrives, no auto-follow ────────────────
    const beforeScrollTop = await page.evaluate(() => {
      const c = document.querySelector<HTMLElement>('[data-test="scroll"]')
      return c?.scrollTop ?? 0
    })
    await page.evaluate(() => {
      window.__demo?.sendUserMessage()
      window.__demo?.tick()
      window.__demo?.tick()
      window.__demo?.tick()
    })
    await hold(page, 1500)

    const afterScrollTop = await page.evaluate(() => {
      const c = document.querySelector<HTMLElement>('[data-test="scroll"]')
      return c?.scrollTop ?? 0
    })
    expect(Math.abs(afterScrollTop - beforeScrollTop)).toBeLessThan(50)

    // ─── Click the FAB — snap back to bottom ────────────────
    await showCue(page, 'user clicks ↓ to re-lock')
    await page.locator('[data-test="fab"]').click()
    await hold(page, 600)
    await expect(page.locator('[data-test="status"]')).toContainText(
      'locked=✓',
    )

    await hold(page, 1500)
  })
}
