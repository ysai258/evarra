/**
 * Manual-QA harness for multiplayer: drives two real browsers through a whole room and
 * writes screenshots to `qa/`.
 *
 *   npm run dev:server   # in one terminal
 *   npm run dev          # in another
 *   npm run qa:mp        # in a third
 *
 * The socket tests already prove the protocol. What this proves is the part they
 * cannot: that two browsers see the same face at the same moment, that the image
 * actually arrives through the token route, and that the reveal and the leaderboard
 * land on screen rather than in a payload.
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const BASE_URL = process.env.QA_URL ?? 'http://localhost:5173';
const OUT = 'qa';
const PHONE = { width: 390, height: 844 };

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  > ${name}.png`);
}

/**
 * The photograph has to arrive from the room server, decoded. A blurred stage that
 * failed to load is an invisible failure in a screenshot — the layout looks right and
 * the picture is simply absent.
 */
async function expectPhoto(page: Page, where: string): Promise<void> {
  const image = page.locator('img.stage__image').last();
  await image.waitFor({ state: 'visible', timeout: 10_000 });
  const ok = await image.evaluate((node) => {
    const img = node as HTMLImageElement;
    return img.complete && img.naturalWidth > 0;
  });
  if (!ok) throw new Error(`${where}: the photo did not load from the room server`);
}

async function join(browser: Browser, url: string, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`  ! ${name}: ${message.text()}`);
  });
  await page.goto(url);
  return page;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  try {
    // --- host creates a room -------------------------------------------------
    const host = await join(browser, `${BASE_URL}/multiplayer`, 'host');
    await host.getByRole('button', { name: /create a room/i }).click();
    await host.getByLabel(/your name/i).fill('Yashwanth');
    await host.getByRole('button', { name: /^create room$/i }).click();

    const code = (await host.locator('.mp-code__value').textContent())?.trim();
    if (!code) throw new Error('no room code on screen');
    console.log(`  room ${code}`);
    await shot(host, 'mp-01-lobby-host');

    // --- a friend follows the invite link ------------------------------------
    const guest = await join(browser, `${BASE_URL}/room/${code}`, 'guest');
    await guest.getByLabel(/your name/i).fill('Rahul');
    await guest.getByRole('button', { name: /^join room$/i }).click();
    await guest.getByText(/waiting for the host/i).waitFor({ timeout: 5000 });
    await shot(guest, 'mp-02-lobby-guest');

    // The host's lobby must have grown a player without a reload.
    await host.getByText('Rahul').waitFor({ timeout: 5000 });

    // --- shortest game the host is offered ------------------------------------
    // Five questions is the floor of the stepper; the clock can come down to fifteen
    // seconds, which is what makes this run about two and a half minutes rather than
    // five. Nothing here reaches past the UI to shorten it: a harness that took a
    // back door would stop testing the thing players actually use.
    await host.getByRole('button', { name: /fewer seconds per question/i }).click();
    await host.getByRole('button', { name: /start game/i }).click();

    // The 3-2-1 is the same instant in both browsers.
    await Promise.all([
      host.locator('.mp-countdown').waitFor({ timeout: 5000 }),
      guest.locator('.mp-countdown').waitFor({ timeout: 5000 }),
    ]);
    await shot(host, 'mp-03-countdown');

    await host.locator('.mp-countdown').waitFor({ state: 'detached', timeout: 10_000 });
    await expectPhoto(host, 'question');
    await expectPhoto(guest, 'question');
    await shot(host, 'mp-04-question');

    // --- one player guesses, the other does not ------------------------------
    // The harness cannot know the answer — that is the point of the token route — so
    // this picks a name and handles either outcome. Overwhelmingly it will be wrong,
    // which is the more interesting path anyway: it is the one unlimited guessing
    // added, and the one where a miss has to be charged for.
    await host.getByRole('combobox').fill('a');
    await host.locator('.guess__option').first().click();

    const locked = host.locator('.mp-locked');
    const missed = host.locator('.mp-worth__misses');
    await Promise.race([
      locked.waitFor({ timeout: 8000 }),
      missed.waitFor({ timeout: 8000 }),
    ]);

    if (await locked.count() > 0) {
      console.log('  (guessed right first time)');
      await shot(host, 'mp-05-locked-in');
    } else {
      const cost = (await missed.textContent())?.trim();
      console.log(`  (guessed wrong — ${cost})`);
      if (!cost?.includes('1 miss')) throw new Error('a wrong guess was not charged for');
      await shot(host, 'mp-05-wrong-guess');
    }

    // Whatever happened on the host's screen must not have reached the other player:
    // neither the answer nor the fact that someone has locked something in.
    if (await guest.locator('.mp-locked').count() > 0) {
      throw new Error('a guess leaked into the other player’s screen');
    }
    if (await guest.locator('.mp-worth__misses').count() > 0) {
      throw new Error('one player’s miss showed on another player’s screen');
    }
    await shot(guest, 'mp-06-still-guessing');

    // --- reveal ---------------------------------------------------------------
    await host.locator('.mp-answer').waitFor({ timeout: 30_000 });
    await expectPhoto(host, 'reveal');
    await shot(host, 'mp-07-reveal');
    await shot(guest, 'mp-08-reveal-guest');

    // --- final leaderboard ----------------------------------------------------
    // Five questions at fifteen seconds, plus a ten-second reveal after each.
    await host.locator('.mp-final__board').waitFor({ timeout: 200_000 });
    // Let the staggered board finish arriving before the shutter, or the screenshot
    // records a half-drawn leaderboard and looks like a bug.
    await host.waitForTimeout(1800);
    await shot(host, 'mp-09-final');
    await shot(guest, 'mp-10-final-guest');

    console.log('\n  multiplayer QA passed');
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
process.exit(1);
});
