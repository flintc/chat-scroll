import { test, expect, hold, sendUserMessage, showCue } from '../../fixtures'
import type { Page } from '@playwright/test'

/**
 * Tight scroll-bound regression guard — absolute measurement.
 *
 * **Contract under test:** after a message is pinned and content has
 * settled, scrolling to the bottom must leave the pinned message flush
 * with the top of the visible scroll port (modulo the configured
 * `scrollMargin`). Equivalently:
 *
 *     container.scrollHeight - container.clientHeight === pinnedY
 *
 * The gutter math in `packages/chat-scroll-core/src/gutter.ts` makes
 * this contract a hard guarantee that holds regardless of the consumer
 * application's CSS — container padding, content padding, content
 * border, content margin all included. This test exercises that by
 * mutating both `padding-bottom` on the content AND `padding` on the
 * container mid-test and re-checking the bound.
 *
 * Why measure the pinned element's rect rather than scrollTop math?
 * Because the *visible* invariant is "the pinned message sits at the
 * top of the visible chat area at max-scroll." That's what consumers
 * actually rely on. Reading `maxScrollTop` and comparing it to a
 * controller-computed `pinnedY` is a tautology check; reading where the
 * pinned message renders is the user-observable truth.
 *
 * Tolerance: 2px to absorb sub-pixel rounding and the rare 1-frame
 * settling lag from the smooth-scroll animation.
 */
const SCROLL_MARGIN_PX = 12 // matches DEFAULTS.scrollMargin in chat-scroll.ts
const TOLERANCE_PX = 2

async function setStyle(
  page: Page,
  selector: string,
  prop: 'paddingBottom' | 'paddingTop' | 'padding',
  value: string,
): Promise<void> {
  await page.evaluate(
    ({ selector, prop, value }) => {
      const el = document.querySelector<HTMLElement>(selector)
      if (el) el.style[prop] = value
    },
    { selector, prop, value },
  )
  // Yield frames so ResizeObserver fires + controller recomputes the gutter.
  await page.waitForTimeout(150)
}

/**
 * Scroll to max, then return how far below the container's top the
 * pinned user message sits. Tight-pin contract: this must equal
 * `scrollMargin` regardless of consumer CSS.
 */
async function pinnedOffsetAtMaxScroll(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(
      '[data-test="scroll"]',
    )
    if (!container) return Number.NaN
    container.scrollTop = container.scrollHeight + 9999
    // Find the most recent user message — the one that was just pinned.
    const userMsgs = container.querySelectorAll<HTMLElement>('.msg--user')
    const pinned = userMsgs[userMsgs.length - 1]
    if (!pinned) return Number.NaN
    const cRect = container.getBoundingClientRect()
    const pRect = pinned.getBoundingClientRect()
    return pRect.top - cRect.top
  })
}

export function scrollBoundTightSpec(): void {
  test('scroll-bound-tight', async ({ page }) => {
    await page.goto('/#/pin-to-top')
    await page.waitForFunction(() => Boolean(window.__demo))
    await hold(page, 500)

    await showCue(page, 'send so gutter engages')
    await sendUserMessage(page)
    await page.waitForFunction(() =>
      document
        .querySelector('[data-test="status"]')
        ?.textContent?.includes('pinActive=✓'),
    )
    // Do NOT stream the bot response and do NOT call `finishStream`
    // (which would flush the entire pre-baked response). The
    // assertions below scroll to max and expect the pin to sit at
    // exactly `scrollMargin` — that contract only holds while the
    // response is shorter than `clientHeight - paddingBottom -
    // scrollMargin` (the regime where the gutter is > 0). Leaving the
    // bot bubble empty keeps us solidly in that regime. We're
    // testing the gutter formula, not streaming. The 500ms hold
    // covers `pinMessage`'s 320ms smooth-scroll animation.
    await hold(page, 500)

    // Tight pin with default consumer CSS (the demo's .chat__list has
    // padding-bottom: 12px and .chat__scroll has padding: 16px).
    const baseline = await pinnedOffsetAtMaxScroll(page)
    expect(
      baseline,
      `at max-scroll the pinned message must sit ${SCROLL_MARGIN_PX}px ` +
        `below the container top (scrollMargin), got ${baseline}px`,
    ).toBeGreaterThanOrEqual(SCROLL_MARGIN_PX - TOLERANCE_PX)
    expect(baseline).toBeLessThanOrEqual(SCROLL_MARGIN_PX + TOLERANCE_PX)

    // Add an unusual amount of content padding-bottom — the gutter must
    // compensate so the contract still holds.
    await setStyle(page, '[data-test="list"]', 'paddingBottom', '64px')
    const withContentPad = await pinnedOffsetAtMaxScroll(page)
    expect(
      withContentPad,
      `content padding-bottom must not loosen the pin; got ${withContentPad}px`,
    ).toBeGreaterThanOrEqual(SCROLL_MARGIN_PX - TOLERANCE_PX)
    expect(withContentPad).toBeLessThanOrEqual(SCROLL_MARGIN_PX + TOLERANCE_PX)

    // Stack on an unusual amount of CONTAINER padding — this is the
    // case the old formula didn't account for at all.
    await setStyle(page, '[data-test="scroll"]', 'padding', '48px')
    const withContainerPad = await pinnedOffsetAtMaxScroll(page)
    expect(
      withContainerPad,
      `container padding must not loosen the pin; got ${withContainerPad}px`,
    ).toBeGreaterThanOrEqual(SCROLL_MARGIN_PX - TOLERANCE_PX)
    expect(withContainerPad).toBeLessThanOrEqual(
      SCROLL_MARGIN_PX + TOLERANCE_PX,
    )

    // Revert content padding while keeping the inflated container
    // padding — make sure shrinking content padding also doesn't break
    // the contract.
    await setStyle(page, '[data-test="list"]', 'paddingBottom', '0px')
    const reverted = await pinnedOffsetAtMaxScroll(page)
    expect(
      reverted,
      `shrinking content padding must keep the pin tight; got ${reverted}px`,
    ).toBeGreaterThanOrEqual(SCROLL_MARGIN_PX - TOLERANCE_PX)
    expect(reverted).toBeLessThanOrEqual(SCROLL_MARGIN_PX + TOLERANCE_PX)
  })
}
