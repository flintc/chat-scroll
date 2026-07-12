import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamN,
  streamUntilDone,
  userWheelScroll,
} from '../../fixtures'

/**
 * PROBE / EMPIRICAL TEST for the dynamic-overflow-anchor change.
 *
 * The library sets `overflow-anchor: none` on the container for the WHOLE
 * streaming session, which hands the browser's own scroll-anchoring off so
 * the controller can own `scrollTop`. But the controller only ACTIVELY owns
 * `scrollTop` while it's holding a position the user asked to stay at —
 * locked to the bottom, or anchored on the pin. The moment the user scrolls
 * away mid-stream to read back, the controller deliberately stops writing
 * `scrollTop` — yet `overflow-anchor` is still `none`, so NOTHING is keeping
 * the reader's place. A late-arriving image (or any content that grows ABOVE
 * the viewport) then shifts everything the reader is looking at downward.
 *
 * These two tests reproduce exactly that: scroll away mid-stream, then grow a
 * zero-then-tall "image" ABOVE the viewport, and measure how far a reference
 * line the reader was looking at drifts.
 *
 *   - BUG  (overflow-anchor: none for the whole stream): the reference line
 *          jumps down by ~the image height; `scrollTop` does not move.
 *   - FIXED (overflow-anchor restored to the browser default once the user
 *          scrolls away): the browser re-anchors, `scrollTop` advances by the
 *          image height, and the reference line stays put.
 *
 * The "image" is injected and grown entirely from the test — a real unsized
 * <img> finishing its decode produces the identical ResizeObserver resize, so
 * a bare growing <div> at the top of the thread is a faithful stand-in and
 * needs no demo-API surface.
 */

const IMG_GROWTH = 240 // px the "image" grows when it "loads"

/** Inject a 4px placeholder at the very top of the thread (above viewport). */
async function injectPendingImage(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-test="list"]')!
    const host = list.firstElementChild as HTMLElement
    const img = document.createElement('div')
    img.setAttribute('data-test', 'late-img')
    // Unsized-image stand-in: nearly zero height until it "loads".
    img.style.height = '4px'
    img.style.background =
      'repeating-linear-gradient(45deg,#dde,#dde 6px,#eef 6px,#eef 12px)'
    img.style.margin = '6px 0'
    host.appendChild(img)
  })
}

/**
 * Tag the message sitting ~90px into the viewport as the reference line the
 * reader is "looking at", and return its viewport-relative top + scrollTop.
 */
async function markReference(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const cr = c.getBoundingClientRect()
    const centerY = cr.top + cr.height / 2
    const msgs = Array.from(
      c.querySelectorAll<HTMLElement>(
        '[data-test="bot-msg"],[data-test="user-msg"]',
      ),
    )
    // The reference is whatever message the reader's eye is on: the one
    // spanning the viewport centre (handles a single bubble taller than the
    // viewport), else the one with the most pixels in view. Either way it
    // sits BELOW the image being grown, so its drift measures lost place.
    const visible = (m: HTMLElement): number => {
      const r = m.getBoundingClientRect()
      return Math.max(
        0,
        Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top),
      )
    }
    const ref =
      msgs.find((m) => {
        const r = m.getBoundingClientRect()
        return r.top <= centerY && r.bottom >= centerY
      }) ??
      msgs
        .filter((m) => visible(m) > 0)
        .sort((a, b) => visible(b) - visible(a))[0]
    if (!ref) throw new Error('no reference message visible in viewport')
    ref.setAttribute('data-ref', '1')
    return {
      refTopInViewport: ref.getBoundingClientRect().top - cr.top,
      scrollTop: c.scrollTop,
    }
  })
}

/** Grow the placeholder to its "loaded" height (the resize a decode fires). */
async function loadImage(page: import('@playwright/test').Page) {
  await page.evaluate((h) => {
    const img = document.querySelector<HTMLElement>('[data-test="late-img"]')!
    img.style.height = `${h}px`
  }, IMG_GROWTH)
}

/** Re-read the reference line's viewport-relative top + scrollTop. */
async function readReference(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const cr = c.getBoundingClientRect()
    const ref = c.querySelector<HTMLElement>('[data-ref="1"]')!
    return {
      refTopInViewport: ref.getBoundingClientRect().top - cr.top,
      scrollTop: c.scrollTop,
      anchor:
        getComputedStyle(c).overflowAnchor /* observed style for the log */,
    }
  })
}

/**
 * Place-keeping is delegated to the browser's own scroll-anchoring, which
 * Chromium and Firefox honor inside nested scroll containers but WebKit / iOS
 * Safari do not. So the fix holds the reader's place on the former and is a
 * no-op on the latter — assert the win where it's real, record the no-op
 * where it isn't (a future WebKit that anchors would let us tighten this).
 */
function assertHeldOrWebkitNoop(
  browserName: string,
  drift: number,
  label: string,
): void {
  if (browserName === 'webkit') {
    console.log(
      `[${label}] webkit: overflow-anchor not honored in nested scroller, ` +
        `drift=${drift.toFixed(1)}px (fix is a no-op here)`,
    )
    return
  }
  expect(Math.abs(drift)).toBeLessThan(24)
}

test('stick-to-bottom: late image above viewport keeps the reader’s place mid-stream', async ({
  page,
  browserName,
}) => {
  await page.goto('/#/stick-to-bottom')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 300)

  // Build a TALL thread: a finished turn, then a second turn mid-stream so
  // `streaming` is still true and there is plenty of content above.
  await sendUserMessage(page)
  await streamUntilDone(page, 25)
  await page.evaluate(() => window.__demo?.finishStream())
  await sendUserMessage(page)
  await streamN(page, 8, 40)
  await hold(page, 200)

  // Reader scrolls up a little — the stick lock releases. They are now parked
  // mid-thread while the response is still (logically) streaming.
  await showCue(page, 'reader scrolls up mid-stream — lock releases')
  await userWheelScroll(page, -140)
  await hold(page, 300)
  await expect(page.locator('[data-test="status"]')).toContainText('locked=·')

  await injectPendingImage(page)
  const before = await markReference(page)

  // The image finishes loading — content ABOVE the viewport grows.
  await showCue(page, 'image loads ABOVE the viewport')
  await loadImage(page)
  await hold(page, 250)
  const after = await readReference(page)

  const drift = after.refTopInViewport - before.refTopInViewport
  const scrolled = after.scrollTop - before.scrollTop
  console.log(
    `[late-img/stick] reference drift=${drift.toFixed(1)}px ` +
      `(before=${before.refTopInViewport.toFixed(1)} after=${after.refTopInViewport.toFixed(1)}) ` +
      `scrollTopΔ=${scrolled.toFixed(1)} (img grew ${IMG_GROWTH}px) ` +
      `overflow-anchor=${after.anchor}`,
  )

  await hold(page, 400)
  // The reader's line must not move by more than a few px (on engines that
  // anchor; no-op on WebKit).
  assertHeldOrWebkitNoop(browserName, drift, 'late-img/stick')
})

test('pin-to-top: late image above the pin keeps the reader’s place when scrolled into the answer', async ({
  page,
  browserName,
}) => {
  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 300)

  // Turn 1 to completion so there is tall content above turn-2's pin.
  await sendUserMessage(page)
  await streamUntilDone(page, 25)
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 200)

  // Turn 2 — pin engages, response starts streaming below it.
  await sendUserMessage(page)
  await streamN(page, 8, 40)
  await hold(page, 200)

  // Reader scrolls DOWN into the answer — they leave the pin (pinAnchored
  // clears) but the response is still streaming.
  await showCue(page, 'reader scrolls into the answer — leaves the pin')
  await userWheelScroll(page, 220)
  await hold(page, 300)

  await injectPendingImage(page)
  const before = await markReference(page)

  await showCue(page, 'image loads ABOVE the pin')
  await loadImage(page)
  await hold(page, 250)
  const after = await readReference(page)

  const drift = after.refTopInViewport - before.refTopInViewport
  const scrolled = after.scrollTop - before.scrollTop
  console.log(
    `[late-img/pin] reference drift=${drift.toFixed(1)}px ` +
      `(before=${before.refTopInViewport.toFixed(1)} after=${after.refTopInViewport.toFixed(1)}) ` +
      `scrollTopΔ=${scrolled.toFixed(1)} (img grew ${IMG_GROWTH}px) ` +
      `overflow-anchor=${after.anchor}`,
  )

  await hold(page, 400)
  assertHeldOrWebkitNoop(browserName, drift, 'late-img/pin')
})
