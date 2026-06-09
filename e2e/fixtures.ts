import { test as base, expect, type Page } from '@playwright/test'

/**
 * Drive a deterministic stream by repeatedly calling `window.__demo.tick()`
 * with a real wall-clock pause between chunks — so the recorded video has
 * the visual feel of streaming without the flakiness of random timing.
 *
 * intervalMs is enforced via Playwright's waitForTimeout, not setTimeout
 * inside the page, so the stream pacing is reproducible across machines.
 */
export async function streamUntilDone(
  page: Page,
  intervalMs: number = 80,
): Promise<void> {
  // Cap iterations defensively so a stuck demo can't hang the test.
  for (let i = 0; i < 200; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) return
    await page.waitForTimeout(intervalMs)
  }
}

/** Pause for `ms` while video records, used to give viewers time to read. */
export async function hold(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms)
}

/** Send a user message via the demo API. */
export async function sendUserMessage(
  page: Page,
  text?: string,
): Promise<void> {
  await page.evaluate(
    ({ text }) => window.__demo?.sendUserMessage(text),
    { text },
  )
}

/**
 * Stream exactly `count` chunks via the demo's tick API, with `intervalMs`
 * between calls. Stops early if the demo runs out of chunks.
 */
export async function streamN(
  page: Page,
  count: number,
  intervalMs: number = 130,
): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) return
    await page.waitForTimeout(intervalMs)
  }
}

/**
 * Simulate a user wheel-scroll over the chat surface — fires real wheel
 * events, which the controller's scroll listener picks up the same way
 * a person dragging the wheel would.
 */
export async function userWheelScroll(
  page: Page,
  deltaY: number,
): Promise<void> {
  const box = await page.locator('[data-test="scroll"]').boundingBox()
  if (!box) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, deltaY)
}

/**
 * Smoothly scroll the demo's scroll container by `deltaY` over a real
 * wall-clock duration so the motion is visible in the recorded video.
 * Used for spec-driven scrolls where we don't have a mouse to drive
 * (e.g. the side-by-side scenario where we need to scroll a specific
 * panel).
 *
 * Drives via `window.__demo.scrollByPx`, which the demo implements with
 * `scrollBy({ behavior: 'smooth' })`.
 */
export async function userScrollSmooth(
  page: Page,
  deltaY: number,
): Promise<void> {
  await page.evaluate((d) => window.__demo?.scrollByPx?.(d), deltaY)
  // Smooth scroll completes in ~250-400ms on Chromium — wait it out so
  // the next test action doesn't race with the animation.
  await page.waitForTimeout(500)
}

/**
 * Flash a brief on-screen cue over the demo so a viewer of the recorded
 * video can connect a sudden state change to the user action that
 * caused it. Drives via `window.__demo.showCue`, which fades a pill in
 * for ~1.5s and out.
 */
export async function showCue(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => window.__demo?.showCue?.(t), text)
}

export const test = base
export { expect }
