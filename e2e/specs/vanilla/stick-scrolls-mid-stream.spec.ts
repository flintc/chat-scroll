import { test, expect, hold, showCue, streamN, userScrollSmooth } from '../../fixtures'

test('stick-scrolls-mid-stream', async ({ page }) => {
  await page.goto('/#/stick-to-bottom')
  await page.waitForFunction(() => Boolean(window.__demo))

  await hold(page, 2200) // opening still

  await expect(page.locator('[data-test="status"]')).toContainText(
    'locked=✓',
  )

  await showCue(page, 'user sends a question')
  await page.evaluate(() => {
    window.__demo?.sendUserMessage()
  })
  await hold(page, 600)

  await streamN(page, 12, 150)
  await hold(page, 800)

  // ─── User scrolls up mid-stream ────────────────────────────
  await showCue(page, 'user scrolls up MID-stream — lock breaks')
  await userScrollSmooth(page, -250)
  await hold(page, 1500)

  await expect(page.locator('[data-test="status"]')).toContainText(
    'locked=·',
  )

  const beforeTop = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')
    return c?.scrollTop ?? 0
  })

  await streamN(page, 25, 150)
  await hold(page, 1500)

  const afterTop = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')
    return c?.scrollTop ?? 0
  })
  expect(Math.abs(afterTop - beforeTop)).toBeLessThan(50)

  await showCue(page, 'user clicks ↓ — snaps to bottom')
  await page.click('[data-test="fab"]')
  await hold(page, 1500)

  await expect(page.locator('[data-test="status"]')).toContainText(
    'locked=✓',
  )
})
