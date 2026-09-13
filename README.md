# EVARRA? — ఒరేయ్ ఎవర్రా?

**Can you recognise the star?**

A daily guessing game built around one question: *how early can you recognise a
Telugu cinema face?* Every day one star, the same for everyone, starting at 92% blur.
Five guesses. The photo clears a little with each wrong one, and the score drops with
it. Get it at the first stage and you take the full 500.

The name is the meme line, and it splits neatly across the game: **ఎవర్రా?** for the
one face in front of you today, **ఎవర్రా మీరంతా?** for the archive — the whole crowd
of stars you have not played yet.

```
Open  →  squint at a blurred face  →  guess  →  it clears  →  guess again
      →  score  →  share a spoiler-free grid  →  come back tomorrow
```

---

## Quick start

```bash
npm install
npm run dataset:all   # builds the celebrity dataset from Wikidata + Wikimedia Commons
npm run dev           # http://localhost:5173
```

`dataset:all` takes roughly 30–40 minutes on a normal connection, mostly image
downloads. It needs no API keys and no accounts. The repository ships without the
generated dataset (see [Regenerating the dataset](#regenerating-the-dataset)), so the
first run has to build it before the game has anyone to show you.

A completed build produces roughly:

```
Discovered: 278 with usable photos     Shipped: 187 playable
Actors 101 · Actresses 86
Images: 296 valid · 94 kept for review · 389 rejected
All from Wikimedia Commons (CC BY-SA, CC BY, GODL-India, CC0, public domain)
```

Counts move a little with Wikidata and Commons; the pipeline reports its own.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and produce `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Watch mode |
| `npm run qa` | Drive a real browser through a full game and write screenshots to `qa/` |
| `npm run dataset:report` | Print a summary of the built dataset |

---

## How the game works

**Five reveal stages.** Blur runs 25px → 18px → 11px → 5px → 0, and it is baked into
the image bytes, not painted by CSS.

That distinction is the whole game. A CSS filter is paint: the file behind it stays
sharp, so "open image in new tab", a long-press, or the network panel hands the player
the answer they were supposed to work for. Instead each stage has its own file, blurred
at build time, and the browser is never sent a clearer picture than the stage the
player has reached — not even one stage ahead, since pre-loading would put it in the
network log. The full-resolution photo is requested only once the game ends.

Blurred detail is not worth storing, so each preview is rendered small (96px wide at
stage 1, 320px at stage 4) with its blur scaled into that pixel space; all four
together weigh under 20 KB, which means recognising the star early now costs *less*
bandwidth than losing. Stages already passed stay mounted underneath, so each reveal
cross-fades rather than cutting. The hardest stages are also desaturated so they read
as a silhouette rather than a colour blob.

**Scoring.** Every path through a puzzle scores differently. A wrong guess costs 80, a
clue costs 15. A loss scores 0.

```
 clues:     0    1    2    3    4    5
guess 1:  500  485  470  455  440  425
guess 2:  420  405  390  375  360  345
guess 3:  340  325  310  295  280  265
guess 4:  260  245  230  215  200  185
guess 5:  180  165  150  135  120  105
```

Three constraints pin those two numbers. Every score ends in a five or a zero, so both
steps must be multiples of five. All thirty combinations must differ, which means five
clues have to cost less than one wrong guess — otherwise the per-guess bands overlap.
And no win may score under 100.

Search that space and 80/15 is the only pairing where a clue is worth as much as 15;
every other valid option makes clues cheaper still, and none lands the lowest win
exactly on 100 without colliding, which is why the worst path scores 105.

The scheme this replaced — 100 a guess, 50 a clue, floored at 100 — produced **9
distinct scores across those 30 paths**: a clue cost exactly half a guess, so guess 1
with two clues tied guess 2 with none, and the floor flattened everything beneath it
into a single 100.

**Clues are things a filmgoer actually remembers.** The ladder runs: which generation
their films span → a film family or where they were born → a director they are
associated with → a film they were in → their best-known film. Allu Arjun's third clue
is Sukumar; Prabhas's is Rajamouli.

Every clue is assembled at build time from Wikidata statements, never generated at
runtime, and a missing field simply means one fewer clue. Two rules shape the wording:

- **No database statistics dressed as facts.** An earlier version offered "they have 10
  Telugu film credits" — true of Wikidata's coverage, not of the person's career. A
  test now fails the build if a clue mentions credits or records.
- **No overclaiming.** The last clue says "they were also in X", not "best known for X".
  For a character actor with hundreds of credits, the most-linked film is the strongest
  clue but is not necessarily what they are known for.

The director clue weights repeat collaborations above the director's own fame, so
Prabhas gets Rajamouli (two films) rather than whoever was most famous on a single
credit. Film years are the *earliest* release date on record, since a film with a
festival run and a re-release carries several.

**The daily puzzle is computed, never stored.** The schedule is a pure function of the
roster, the launch date and the repeat gap, and the browser replays it from launch up
to today on load. Replaying is also what upholds the no-repeat guarantee: the gap
depends on everything picked before a given day, so a date cannot be evaluated in
isolation. Difficulty is mixed 60% easy / 30% medium / 10% hard.

Nothing about the answers is written to disk. `npm run puzzles:generate` only pins the
launch date and prints a preview of the rotation — see [Security](#security) for why.

**The archive.** Finding the game on day ten should not mean nine stars are gone
forever, so every day from launch to today stays playable, picked from a calendar with
everything outside that range disabled. On launch day there is exactly one playable
star; a day later there are two. Future days are never playable — the point of a daily
game is that everyone faces the same star on the same day. Each day is scored and
stored on its own, and `?day=2026-09-20` deep-links to one.

The launch date is the first date in the shipped schedule, pinned on first generation
so that regenerating six months later cannot move it forward and strand days people
have already played. `LAUNCH_DATE=YYYY-MM-DD` overrides it.

**Streaks count puzzle dates, not play dates.** Statistics are derived from the stored
days rather than accumulated as you go, which is what makes the archive work: catch up
on ten missed stars and you have a ten-day streak, and playing them out of order still
gives the right answer. Missing today does not break a streak — there is still time —
but losing today does.

**Daily rollover is local midnight.** Every date in the game is a `YYYY-MM-DD` string
in the player's own timezone, never a UTC timestamp, so a player in Hyderabad and one
in London each get a new star at their own 00:00. The tab picks up the rollover
without a reload.

**Progress survives a refresh.** Every day you have opened is stored in `localStorage`
under its own date (with an in-memory fallback for private-mode browsers that throw on
access). A finished puzzle cannot be replayed.

**Nothing scrolls — not the board, not the landing, and no inner panel either.** Both
screens are flex layouts where the picture is the only element allowed to give up
space: reveal all five clues and it shrinks, but the guess box does not move. On wide
screens both put the picture on the left and the words on the right.

Inner scrollbars count as failures too. An early version capped the clue list with
`overflow-y: auto`, which put a scrollbar inside the clues — and, because setting one
axis to `auto` makes the browser compute the other as `auto` as well, a *horizontal*
bar under the rotated title. QA now fails on any element that renders a scrollbar,
excepting the suggestion dropdown and modals, where one is expected.

---

## Architecture

```
UI (src/components)  →  game engine (src/engine)  →  dataset (src/data)
```

The engine holds every rule and has no React in it: `submitGuess`, `revealHint`,
`revealNextStage`, `calculateScore`, `resolveDailyPuzzle`, `applyResult`,
`generateShareText`. The components render its output. That split is what makes the
future modes in `GameMode` (`EYES_ONLY`, `THEN_AND_NOW`, a shareable custom
challenge) additions rather than rewrites.

```
src/
  engine/      rules — pure, framework-free, fully unit-tested
  components/  the board, the combobox, the result, the modals
  data/        generated celebrities.json + puzzles.json
scripts/dataset/
  discover-celebrities.ts   who counts as a Telugu cinema personality
  fetch-metadata.ts         structured biography from Wikidata
  fetch-images.ts           candidate portraits from Wikimedia Commons
  validate-images.ts        resolution, aspect, blankness, duplicates, faces
  generate-assets.ts        face-centred 4:5 WebP crops
  build-dataset.ts          assemble, rank, deduplicate, write
  generate-puzzles.ts       the repeat-safe daily schedule
```

**Look:** retro screen-print — flat poster inks, hard un-blurred offset shadows, a
halftone dot screen, a few things pinned slightly askew. Old Telugu film posters were
printed exactly this way, a handful of flat colours slightly out of register, so the
aesthetic carries the cinema reference without any literal film-reel decoration.
Printed light-on-dark: near-black stock with pale ink, and electric blue, hot pink,
green and lemon as the four colours — which also means nothing on the page competes
with the photograph for brightness.

**Stack:** React 19 + TypeScript on Vite, Vitest and Testing Library for tests, sharp
for image processing, picojs for face detection during ingestion. No backend, no
accounts, no analytics, no dependencies at runtime beyond React.

---

## The dataset

### Where it comes from

Everything is built from two public sources, neither of which needs credentials:

1. **Wikidata** — who exists, and every biographical fact used in a clue. A person
   qualifies as a Telugu cinema personality if they are credited (`P161` cast member
   or `P57` director) on a film whose original language (`P364`) is Telugu.
2. **Wikimedia Commons** — the photographs, with their licence metadata.

No image is taken from a search engine, a fan site, or anywhere its licensing cannot
be established.

### Ranking, not the first 300 results

Sorting Telugu credits by raw fame surfaces Bollywood stars with a single guest
appearance. Telugu relevance is therefore weighted far above global fame, the presence
of a Telugu Wikipedia article acts as the strongest cheap relevance signal, and global
fame is capped so one very famous outsider cannot outrank an industry regular. People
with fewer than five Telugu credits are excluded outright.

### Who is playable

Leads, character actors, comedians, villains, directors and music directors are all
fair game — Wikidata's cast (`P161`), director (`P57`) and composer (`P86`) credits on
Telugu-language films. Music directors are stars in Telugu cinema in their own right,
and the audience knows their faces.

### The fame bar

That still only answers "is this person Telugu cinema?", which leaves a long tail of
bit-part actors. Nobody can identify a one-scene character actor at 92% blur, and being
asked to is just frustrating — so being *playable* takes a second test: articles in at
least 8 Wikipedia languages, **or** at least 40 Telugu credits.

Two routes because the signals fail in opposite directions. Language coverage measures
public recognition but under-counts anyone who worked before the internet; a very large
filmography means a face the audience has seen a thousand times even if the web barely
covers them. That second clause is what keeps Kaikala Satyanarayana — 489 films, six
language editions.

This deliberately costs count: 243 people clear eligibility, 187 clear the fame bar.
Everyone below it stays in `data/dataset.json` and simply never appears in the game or
the guess list — which also means a player can never waste a guess on someone who could
not have been the answer.

Difficulty is assigned by percentile within the ranking, so it keeps its meaning as
the dataset grows.

### Image selection

Candidates come from both a person's Wikidata `P18` and their Commons category — `P18`
is frequently a 300px snapshot while the same category holds a 2000px portrait. Each
candidate is scored on resolution and how portrait-shaped it is, and the best few are
kept: one to play with, the rest as runtime fallbacks if an image fails to load.

### Validation

Every downloaded file is checked for:

- a readable image format and real dimensions
- source resolution (rejected under 400px on the short edge, flagged under 500px)
- extreme aspect ratios
- blank or flat images (channel standard deviation)
- duplicates, by 64-bit average hash across the whole dataset
- subjects that are not photographs of the person — a commemorative stamp, a bronze
  statue, a pencil sketch, a road named after them, a film still
- **another celebrity named in the file title**
- faces, via picojs

The wrong-person check is the one that matters most. Commons is full of press photos
captioned "X and Y"; the face detector happily locks onto Y, and the game then shows
the wrong face under X's name. Any candidate whose title names a different person in
the dataset is rejected outright. Matching is on contiguous name tokens, so "Suhasini
Maniratnam" does not collide with "Mani Ratnam", and a name inside the subject's own
name never counts as someone else.

Face detection is used for cropping and for judging category scrapes, but a missed
face is not by itself disqualifying. The detector only handles upright frontal faces —
it misses sunglasses, profiles and low-contrast archive photographs, exactly the
classic stars this game most wants. So:

- Wikidata's `P18`, a curated choice, is forgiven a missed face.
- A candidate scraped from a Commons category is not: with no face to verify, "no face
  detected" there turns out to mean a filmography bar chart or a ceremony group shot
  about as often as it means a photograph.
- If that leaves a person with nothing at all, their largest faceless candidate is
  restored. Nobody drops out of the game purely because the cascade could not see
  them.

Where a face *is* found it earns its keep: the 4:5 crop is built around it so the head
fills the frame, instead of being a 40px dot in a red-carpet full-length shot. Images
without one fall back to sharp's attention-based crop.

`npm run dataset:report` prints the counts.

### Attribution and licensing

Every image record keeps its `originalUrl`, `sourceUrl` (the Commons file page),
`sourceName`, `license`, `licenseUrl` and `attribution`. An image whose licence cannot
be read from Commons is rejected rather than shipped. The file page, licence and
photographer credit are shown in the app once a round ends, and Commons is credited in
the footer throughout.

Licences vary per file (CC BY-SA, CC BY, CC0, public domain, …). If you deploy this,
check that your presentation satisfies each licence's attribution terms — the metadata
you need is in `data/dataset.json`.

No movie stills are used.

### Regenerating the dataset

```bash
npm run dataset:discover   # → data/raw/discovered.json, films.json
npm run dataset:fetch      # → data/raw/people.json
npm run dataset:images     # → data/images/, data/raw/images.json
npm run dataset:validate   # → data/raw/validation.json
npm run dataset:assets     # → public/celebrities/*.webp
npm run dataset:build      # → src/data/celebrities.json, data/dataset.json
npm run puzzles:generate   # → src/data/puzzles.json
```

Or `npm run dataset:all` for the lot. Each stage reads the previous stage's output, so
you can re-run from any point.

Re-runs are deliberately cheap. Downloads are named after the Commons file rather than
their position in a list, so changing how candidates are ranked reuses everything
already on disk. Commons category listings — one API call per person, and the most
request-hungry part of the whole pipeline — are cached in
`data/raw/category-files.json`; delete it to force a refresh. This matters because
Commons answers a sustained burst with `429` and a ~50-second `Retry-After`.

`data/raw/` and `data/images/` (a few hundred MB of originals) and the generated
assets are gitignored. `data/dataset.json` holds the full provenance record — every
source URL, licence and validation verdict — and is not bundled into the app.

---

## Environment variables

None are required. The game builds and runs with no configuration.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATASET_CONTACT` | No | Contact address added to the ingestion scripts' `User-Agent`. Wikimedia's policy asks automated clients to identify themselves; set it if you are going to run the pipeline repeatedly. |
| `LAUNCH_DATE` | No | `YYYY-MM-DD` first puzzle day, and the floor of the archive. Defaults to the date already pinned in `src/data/launch.json`, or today on a first-ever run. |
| `QA_URL` | No | Where `npm run qa` points its browser. Defaults to `http://localhost:5173`. |

`.env.example` documents this. There are no API keys anywhere in the project.

---

## Testing

```bash
npm test
```

Covers the deterministic daily selection (same date → same star, no repeat inside the
gap), the score table and hint penalties, name normalisation across `NTR` / `Jr NTR` /
`N. T. Rama Rao Jr.`, hint assembly, streak and distribution accounting, spoiler-free
share text, persistence across a refresh, the no-replay rule, the face-crop geometry,
and the combobox and board through Testing Library. A separate suite asserts the
integrity of the generated dataset — no duplicate ids or entities, no photo reused for
two people, full provenance on every image — and skips itself before the first build.

`npm run qa` is the manual-QA harness: with the dev server running it plays a whole
game in a real browser at phone and desktop sizes — first visit, a wrong guess, two
clues, a refresh mid-game, a win, a loss, the modals and the archive calendar — and
leaves screenshots in `qa/`. It fails the run on any console or page error, and on
three things screenshots alone would hide:

- the photo silently falling back to its placeholder (a stale dev server serving
  `index.html` for `/celebrities/*.webp` slipped past a review here more than once),
- the browser having fetched *anything* sharper than the current stage, checked
  against the page's real resource log rather than just the DOM,
- the page scrolling by even a pixel with all five clues open.

---

## Accessibility

The board is keyboard-operable end to end. The guess field implements the ARIA
combobox pattern with arrow-key navigation and an active-descendant. Wrong and right
answers are announced through a live region and never signalled by colour alone. The
blurred photo's alt text describes the blur level without naming the star.
`prefers-reduced-motion` collapses the shake, the reveal transition and the score
count-up.

---

## Security

The blur is real: the bytes the server sends for each stage are already blurred, so
there is no sharper copy of the photo in the browser until the game ends. That closes
the everyday ways of spoiling it — right-click, long-press, the network panel.

What remains is the dataset itself. It and the puzzle schedule are bundled into the
client, and while the date → celebrity mapping is obfuscated so tomorrow's answer is
not sitting in plain text, **that is not a security boundary** — anyone willing to run
the decoder can read it, and from the id they can guess the asset URL. For a daily
entertainment game that trade-off buys offline play and a static deploy, and it is the
one the PRD accepts. Moving the daily answer behind an API is the upgrade path if it
ever matters.

Today's answer is never in the page metadata, and the share text never names the star.

---

## Known limitations

- **Cropping is good, not perfect.** picojs finds upright frontal faces; profile and
  heavily stylised archive photographs fall back to a saliency crop, which
  occasionally frames loosely.
- **Coverage skews male**, though less than it did: 101 actors to 86 actresses.
  Wikidata simply holds better image coverage for Telugu actors, and the ranking cannot
  invent photographs that do not exist.
- **The fame bar cuts recent arrivals.** Wikidata's language coverage lags a career, so
  a lead who broke out in the last year or two can fall below the line despite being a
  face everyone knows.
- **Older stars get older photographs.** Some classic-era portraits are small or
  black-and-white, which makes them read differently under blur than a modern press
  photo.
- **Some legends are missing.** A few — Akkineni Nageswara Rao among them — have no
  freely licensed photograph on Commons large enough to crop a game asset from. The
  pipeline reports them as skipped rather than shipping a 328px portrait.
- **No backend.** Statistics and archive progress are per-device. Clearing site data
  clears the streak.
- Only `ACTOR` and `ACTRESS` are playable. Directors and character artists are in the
  dataset and carried through the schema, but no mode uses them yet.

---

Photographs are from Wikimedia Commons under their respective licences. Biographical
data from Wikidata (CC0). The name is a nod to a Telugu cinema meme; no film footage
or stills are used.
