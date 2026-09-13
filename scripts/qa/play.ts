/**
 * Manual-QA harness (PRD §54, §62): drives a real browser through a whole game on a
 * phone-sized viewport and a desktop one, and writes screenshots to `qa/`.
 *
 *   npm run dev        # in one terminal
 *   npm run qa         # in another
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { celebrities, launchDate, scheduleThrough } from '../../src/data/index.ts';
import { daysBetween, toDateKey, todayKey } from '../../src/engine/date.ts';
import { resolveDailyPuzzle } from '../../src/engine/puzzle.ts';

const BASE_URL = process.env.QA_URL ?? 'http://localhost:5173';
const OUT = 'qa';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  > ${name}.png`);
}

/**
 * The board falls back to a placeholder when a photo will not load, which is correct
 * behaviour but looks like a passing run in a screenshot. Assert the real image is
 * on screen and actually decoded — a stale dev server serving `index.html` for
 * `/celebrities/*.webp` has slipped through here before.
 */
async function expectPhotoVisible(page: Page, where: string): Promise<void> {
  const image = page.locator('img.stage__image');
  if (await page.getByText('could not be loaded').count() > 0) {
    throw new Error(`${where}: the photo failed to load (fallback shown)`);
  }
  await image.first().waitFor({ state: 'visible', timeout: 10_000 });
  // Wait for the decode rather than asserting on it: against a real deployment the
  // full-resolution reveal is a few hundred KB over the network.
  try {
    await image.first().evaluate(
      (node) => {
        const img = node as HTMLImageElement;
        if (img.complete && img.naturalWidth > 0) return true;
        return new Promise((resolve, reject) => {
          img.addEventListener('load', () => resolve(true), { once: true });
          img.addEventListener('error', () => reject(new Error('image failed')), { once: true });
        });
      },
      { timeout: 15_000 },
    );
  } catch {
    throw new Error(`${where}: the photo never decoded`);
  }
}

/**
 * The whole game rests on this: the browser must never hold a clearer picture than
 * the stage the player has reached. Checks the DOM *and* every resource the page has
 * actually fetched, because "open the network tab" is the obvious way to cheat.
 */
async function expectNothingSharperFetched(
  page: Page,
  paths: { full: string; previews: string[] },
  stageIndex: number,
): Promise<void> {
  // Paths are compared by suffix: a deployment under a subdirectory (GitHub Pages
  // serves from /<repo>/) prefixes every asset URL.
  const fetched: string[] = await page.evaluate(
    () => performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname)
      .filter((path) => path.includes('/celebrities/')),
  );
  const forbidden = [paths.full, ...paths.previews.slice(stageIndex + 1)];
  const leaked = forbidden.filter((path) => fetched.some((url) => url.endsWith(path)));
  if (leaked.length > 0) {
    throw new Error(`at stage ${stageIndex + 1} the browser had already fetched: ${leaked.join(', ')}`);
  }
  const src = await page.locator('img.stage__image').last().getAttribute('src');
  if (!src?.endsWith(paths.previews[stageIndex]!)) {
    throw new Error(`stage ${stageIndex + 1} is showing ${src}, expected ${paths.previews[stageIndex]}`);
  }
}

async function guess(page: Page, name: string): Promise<void> {
  const box = page.getByRole('combobox');
  await box.click();
  await box.fill(name);
  await page.getByRole('option').first().waitFor({ state: 'visible' });
  await page.getByRole('option').first().click();
}

/**
 * The app takes "today" from the server's Date header, not the device clock, so the
 * harness has to ask the same source. Against a real deployment the two genuinely
 * differ whenever the local machine's clock has drifted — which is the anti-cheat
 * doing its job, not a failure.
 */
async function serverToday(): Promise<string> {
  try {
    const response = await fetch(BASE_URL, { method: 'HEAD', cache: 'no-store' });
    const header = response.headers.get('date');
    if (header) {
      const serverNow = new Date(header);
      if (!Number.isNaN(serverNow.getTime())) return toDateKey(serverNow);
    }
  } catch {
    /* fall back to the device clock */
  }
  return todayKey();
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const today = await serverToday();
  if (today !== todayKey()) {
    console.log(`  note: server date is ${today}, this machine says ${todayKey()}`);
  }
  const answer = resolveDailyPuzzle(today, celebrities, scheduleThrough(today));
  if (!answer) throw new Error('No puzzle for today - run `npm run dataset:all` first.');
  const decoy = celebrities.find((c) => c.playable && c.id !== answer.id)!;
  console.log(`  today: ${answer.name} (decoy: ${decoy.name})`);

  const browser = await chromium.launch();
  const problems: string[] = [];

  const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
  const page = await phone.newPage();
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });

  await page.goto(BASE_URL);
  await shot(page, '01-landing-mobile');

  const paths = {
    full: answer.images[0]!.localPath,
    previews: answer.images[0]!.previews,
  };

  await page.getByRole('button', { name: /Play today/i }).click();
  await expectPhotoVisible(page, 'stage 1');
  await expectNothingSharperFetched(page, paths, 0);
  await shot(page, '02-stage-1');

  await guess(page, decoy.name);
  await expectPhotoVisible(page, 'stage 2');
  await expectNothingSharperFetched(page, paths, 1);
  await shot(page, '03-wrong-stage-2');

  await page.getByRole('button', { name: /Reveal a clue/i }).click();
  await page.getByRole('button', { name: /Reveal a clue/i }).click();
  await shot(page, '04-hints');

  await page.reload();
  console.log(`  after refresh: ${(await page.getByRole('status').textContent())?.trim()}`);
  await shot(page, '05-after-refresh');

  await guess(page, answer.name);
  await expectPhotoVisible(page, 'result');
  const revealed = await page.locator('img.stage__image').first().getAttribute('src');
  if (!revealed?.endsWith(answer.images[0]!.localPath)) {
    throw new Error(`the reveal did not load the full photo (got ${revealed})`);
  }
  await shot(page, '06-result-win');

  await page.getByRole('button', { name: /Your stats/i }).click();
  await shot(page, '07-stats');
  await page.getByRole('button', { name: /Close/i }).click();

  await page.getByRole('button', { name: /How to play/i }).click();
  await shot(page, '08-how-to-play');
  await page.getByRole('button', { name: /Close/i }).click();

  await page.getByRole('button', { name: /Past stars/i }).click();
  await shot(page, '08b-archive-calendar');
  // Padding cells are spans, so only real day buttons count.
  const playableDays = await page.locator('button.cell:not(:disabled)').count();
  const expected = daysBetween(launchDate, today) + 1;
  if (playableDays !== expected) {
    throw new Error(`calendar offers ${playableDays} days, expected ${expected} since launch`);
  }
  console.log(`  calendar: ${playableDays} day(s) playable since launch`);
  await page.getByRole('button', { name: /Close/i }).click();

  const loser = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
  const lose = await loser.newPage();
  await lose.goto(BASE_URL);
  await lose.getByRole('button', { name: /Play today/i }).click();
  for (const wrong of celebrities.filter((c) => c.playable && c.id !== answer.id).slice(0, 5)) {
    await guess(lose, wrong.name);
  }
  await shot(lose, '09-result-lost');

  // The landing is the first thing anyone sees; it has to fit too, including on a
  // short phone where there is far less room than the design was drawn at.
  for (const [label, viewport] of [
    ['landing-phone', PHONE],
    ['landing-small', { width: 360, height: 667 }],
    ['landing-desktop', DESKTOP],
  ] as const) {
    const context = await browser.newContext({ viewport });
    const landing = await context.newPage();
    await landing.goto(BASE_URL);
    await landing.waitForTimeout(400);
    const bars = await landing.evaluate(() => {
      const doc = document.documentElement;
      // Any element with its own scrollbar counts: an inner scroller looks just as
      // broken as a scrolling page, and is uglier.
      // Only elements that actually render a scrollbar: overflow must be auto/scroll
      // *and* the content must exceed the box. An `overflow: visible` element can
      // report a larger scrollHeight without ever showing a bar.
      const inner = Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          if (el.classList.contains('guess__list') || el.classList.contains('modal')) return false;
          // Inlined rather than factored into a helper: tsx compiles named inner
          // functions with a `__name` shim that does not exist in page context.
          const style = getComputedStyle(el);
          const scrollsY = style.overflowY === 'auto' || style.overflowY === 'scroll';
          const scrollsX = style.overflowX === 'auto' || style.overflowX === 'scroll';
          return (scrollsY && el.scrollHeight - el.clientHeight > 1)
            || (scrollsX && el.scrollWidth - el.clientWidth > 1);
        })
        .map((el) => `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);
      return {
        page: doc.scrollHeight - window.innerHeight,
        across: doc.scrollWidth - doc.clientWidth,
        inner: [...new Set(inner)].slice(0, 5),
      };
    });
    if (bars.page > 1) throw new Error(`${label}: the landing scrolls by ${bars.page}px`);
    if (bars.across > 1) throw new Error(`${label}: the landing scrolls sideways by ${bars.across}px`);
    if (bars.inner.length > 0) {
      throw new Error(`${label}: inner scrollbars on ${bars.inner.join(', ')}`);
    }
    if (label === 'landing-small') await shot(landing, '00-landing-small');
    await context.close();
  }

  // Everything must sit on one screen: a guessing game you have to scroll is one you
  // lose your place in. The short phone is the case that actually breaks — and the
  // losing state on a past day is the tallest the panel ever gets.
  const fitCases = [
    ['phone', PHONE, 'clues'],
    ['short-phone', { width: 390, height: 740 }, 'clues'],
    ['short-phone-result', { width: 390, height: 740 }, 'lose'],
    ['desktop', DESKTOP, 'clues'],
    ['desktop-result', { width: 1366, height: 728 }, 'win'],
  ] as const;

  for (const [label, viewport, mode] of fitCases) {
    const context = await browser.newContext({ viewport });
    const fit = await context.newPage();
    await fit.goto(BASE_URL);
    await fit.getByRole('button', { name: /Play today/i }).click();
    if (mode === 'win') {
      await guess(fit, answer.name);
    } else if (mode === 'lose') {
      for (const wrong of celebrities.filter((c) => c.playable && c.id !== answer.id).slice(0, 5)) {
        await guess(fit, wrong.name);
      }
    } else {
      for (let clue = 0; clue < 5; clue += 1) {
        const button = fit.getByRole('button', { name: /Reveal a clue/i });
        if (await button.isDisabled()) break;
        await button.click();
      }
    }
    await fit.waitForTimeout(400);

    // The photo must still show a face, not a letterbox strip.
    const photo = await fit.locator('img.stage__image').last().boundingBox();
    if (!photo || photo.height < 120) {
      throw new Error(`${label}: the photo collapsed to ${Math.round(photo?.height ?? 0)}px tall`);
    }
    // Assets are 4:5. A frame much wider than that is cover-cropping the portrait.
    const ratio = photo.width / photo.height;
    if (ratio > 1.15) {
      throw new Error(
        `${label}: the photo frame is ${ratio.toFixed(2)}:1 — the 4:5 portrait is being cropped`,
      );
    }

    // Nothing may be painted over the photograph. Measured on the panel's first
    // child, not the panel itself: content that overflows its box does not grow the
    // box, so a box-level check misses exactly the case this is guarding.
    const panel = await fit.locator('.game__panel > *').first().boundingBox();
    const sideBySide = Boolean(panel && photo && panel.x >= photo.x + photo.width - 1);
    if (panel && photo && !sideBySide && panel.y < photo.y + photo.height - 1) {
      throw new Error(
        `${label}: the panel overlaps the photo by ${Math.round(photo.y + photo.height - panel.y)}px`,
      );
    }
    const bars = await fit.evaluate(() => {
      const doc = document.documentElement;
      // Only elements that actually render a scrollbar: overflow must be auto/scroll
      // *and* the content must exceed the box. An `overflow: visible` element can
      // report a larger scrollHeight without ever showing a bar.
      const inner = Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          if (el.classList.contains('guess__list') || el.classList.contains('modal')) return false;
          // Inlined rather than factored into a helper: tsx compiles named inner
          // functions with a `__name` shim that does not exist in page context.
          const style = getComputedStyle(el);
          const scrollsY = style.overflowY === 'auto' || style.overflowY === 'scroll';
          const scrollsX = style.overflowX === 'auto' || style.overflowX === 'scroll';
          return (scrollsY && el.scrollHeight - el.clientHeight > 1)
            || (scrollsX && el.scrollWidth - el.clientWidth > 1);
        })
        .map((el) => `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);
      return {
        page: doc.scrollHeight - window.innerHeight,
        across: doc.scrollWidth - doc.clientWidth,
        inner: [...new Set(inner)].slice(0, 5),
      };
    });
    // `overflow: hidden` means content past the fold is clipped rather than
    // scrollable, so a scroll check alone cannot see it. Assert the last thing on the
    // panel is actually on screen.
    const tail = await fit.locator('.game__panel > *').last().boundingBox();
    const height = viewport.height;
    if (tail && tail.y + tail.height > height + 1) {
      throw new Error(
        `${label}: the bottom of the panel is cut off by ${Math.round(tail.y + tail.height - height)}px`,
      );
    }

    if (bars.page > 1) throw new Error(`${label}: scrolls by ${bars.page}px`);
    if (bars.across > 1) throw new Error(`${label}: scrolls sideways by ${bars.across}px`);
    if (bars.inner.length > 0) {
      throw new Error(`${label}: inner scrollbars on ${bars.inner.join(', ')}`);
    }
    await shot(fit, `09-fit-${label}`);
    await context.close();
  }

  const desktopContext = await browser.newContext({ viewport: DESKTOP });
  const desktop = await desktopContext.newPage();
  await desktop.goto(BASE_URL);
  await shot(desktop, '10-landing-desktop');
  await desktop.getByRole('button', { name: /Play today/i }).click();
  await guess(desktop, decoy.name);
  await shot(desktop, '11-game-desktop');

  await browser.close();
  if (problems.length > 0) {
    console.error(`\n! ${problems.length} runtime problem(s):`);
    for (const problem of new Set(problems)) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`\nOK - screenshots in ${OUT}/`);
}

main().catch((err) => {
  console.error('QA run failed:', err);
  process.exit(1);
});
