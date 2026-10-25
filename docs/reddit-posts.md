# Reddit posts for EVARRA?

Drafts for sharing the game from u/Original-Fall6524 (17 post karma, 1 comment
karma). Rules were read live on 2026-10-25. Nothing has been posted.

- **Game:** https://ysai258.github.io/evarra/ (GitHub Pages, returned HTTP 200)
- **Room server:** https://evarra-rooms.onrender.com/health (Render free plan, returned
  `ok: true`). It sleeps when idle. The first room of a session can take about a
  minute to open while it wakes. Open one room yourself just before you post.

## Before you post

1. **Comment first.** The account has 1 comment karma. Automoderators often hold
   posts from accounts with very little comment karma, even when the rules don't
   say so. Leave a few real comments in each sub over a day or two before you post.
2. **Space the posts out.** Post to one sub a day, not all on the same day.
   r/playmygame and r/telugu both have rules against spam or reposting.
3. **Be honest about AI.** The commit history shows the code was written with
   Claude. The photos are real, credited Wikimedia Commons images and the clues come
   from Wikidata, so none of the game's content is AI-generated. Don't claim the code
   was hand-written. r/playmygame removes false claims. Where a sub asks you to
   declare AI use (see r/IndieGaming below), declare it.
4. **About the photos.** The game uses Wikimedia Commons portraits under CC BY-SA,
   CC BY, CC0, GODL-India or public domain. It never uses movie stills or screenshots,
   and each photo's licence and photographer are shown after the round. This matters
   in r/playmygame ("not stolen IP"). It also keeps you clear of the anti-screengrab
   (DMCA) rule in r/tollywood, though that sub is ruled out for other reasons. Say so
   in the post if anyone asks.
5. **Attach an image.** There is no gameplay video in the repo. The screenshots in
   `qa/` work as an image post or a first comment:
   - `qa/mp-04-question.png` (141 KB): a multiplayer question, face blurred
   - `qa/mp-07-reveal.png` (186 KB): the answer and the round's leaderboard
   - `qa/09-fit-phone.png` (143 KB): the daily game on a phone

   A 20 to 30 second screen recording of a room with two phones would do better than
   any of these.
6. **Stay around.** Reply to every comment in the first few hours.

## Ranking

| # | Subreddit | Why it's allowed | Main risk |
|---|---|---|---|
| 1 | r/playmygame (149k) | Built for free, playable-now games. Needs a direct link, a description and your role in making it | 1 post a month; be honest about AI use |
| 2 | r/telugu (45k) | Telugu culture is on-topic; "relevant promotion may be allowed if it genuinely contributes to the Telugu community" | Mods decide; the rules ban "AI content" |
| 3 | r/IndieDev (464k) | Its only rule bans capsule-comparison posts; devs share their own games there | Large and busy, so the post can sink fast |
| 4 | r/andhra_pradesh (42k) | Posts must be "at least loosely relevant to AP and its people"; one post a day per account | Needs a flair; the sub is mostly news and politics |

**Ruled out:**

| Subreddit | Why |
|---|---|
| r/tollywood | 100 post karma minimum. Also bans self-promotion and "posts made with any form of AI" |
| r/Ni_Bondha | "No self-promotions or advertisements", and "Tollywood slop" gets you banned |
| r/hyderabad | "Advertising is not allowed unless permission is taken from the moderators" |
| r/DestroyMyGame | Video posts only, and "No AI… Keep that Claude shit out of here too" |
| r/indiegames | "No generative AI posts", and promo titles can't be questions |
| r/playtesters | "No self promotion" |
| r/IndianGaming | Mostly hardware and sales threads, so it's a poor fit |
| r/IndieGaming | Usable later. It needs an account at least a week old with real posting history, allows 1 post every 2 weeks, and you must declare any GenAI use and what it was for |
| r/WebGames, r/SideProject, r/microsaas, r/buildinpublic, r/indiehackers, r/IMadeThis, r/betatests | Excluded: the post was just removed from r/WebGames, and you posted to the others in the last 2 days |

The `rules.json` endpoint doesn't show karma minimums that automoderators enforce
without saying so. None of the four subs above states one, but they may still have
one. If a post disappears straight away, message the mods politely instead of
reposting.

---

## 1. r/playmygame

**Why it fits:** The sub exists for this. Its rules: "Your game must be playable for
free… NOW", "Include a (brief) description of your game / your participation in
development", "Include a direct link to the game", "Be Truthful / No false claims
about your game", "Ensure your game is playable/not stolen IP", "1 post per month".
None of its title rules apply here: [TRAILER TUESDAY] is only for paid games.

**Post type:** Link post to https://ysai258.github.io/evarra/, or an image post
(`qa/mp-04-question.png`) with the link as the first line of the body. The link must
come before anything else.

**Flair:** Not confirmed. Reddit rate-limited the flair lookup. If the submit form asks
for one, choose the web/browser or free-to-play option.

**Title:**
> EVARRA? – a free browser game where you and your friends guess blurred Telugu film stars before the photo clears

**Body:**
> Play: https://ysai258.github.io/evarra/ (free, runs in the browser on phone or desktop, no sign-up)
>
> I made this to play with my friends. We're always arguing over who can spot an actor
> from the worst possible photo, so I turned that into a game.
>
> **How it works**
> - **Daily mode (solo):** One Telugu cinema star a day, the same for everyone. The
>   photo starts 92% blurred. You get five guesses and it clears a little after each
>   wrong one. You can buy clues (a director, a film) for a few points. Guess on the
>   first look and you get the full 500. At the end you get a spoiler-free grid to
>   share. Every past day stays playable from the archive.
> - **Play with friends (2–20 players):** One person creates a room and sends the
>   6-letter code or link. Everyone sees the same face at the same moment, and it gets
>   sharper every second. Wrong guesses cost nothing, and the faster you get it right
>   the more points you score. After each question there's a reveal and a leaderboard,
>   then a final board. A game is 5–20 questions.
>
> You only need a name to play. All the photos are Wikimedia Commons portraits with
> their licence and photographer credited, and the clues come from Wikidata. There are
> no movie stills. I built it myself, with an AI coding assistant helping on the code.
>
> Two things I'd love to hear:
> 1. If you don't watch Telugu films, is the daily one still fun, or is it impossible?
> 2. In a room, is 30 seconds a question too long or too short for your group?
>
> If you get a group into a room, tell me how it went!

**Optional first comment:**
> The first room you open can take about a minute to load, because the room server
> sleeps on a free plan when nobody's playing. After that it's instant. If you're
> wondering about the name: "Orey, evarra?" is roughly "dude, who IS that?" in Telugu.

---

## 2. r/telugu

**Why it fits:** "All posts must be related to the telugu language and telugu
culture", and "Relevant promotion may be allowed if it genuinely contributes to the
Telugu community". A free, non-commercial game about Telugu cinema, named after a
Telugu meme line, is that. The "No Movie Promotions" rule only covers teasers and
trailers, so it doesn't apply. "AI content is not allowed" covers AI-generated
content. The game's photos and clues are real, but mods decide, so don't
overstate anything.

**Post type:** Text post with the link in the body. An image (`qa/09-fit-phone.png`)
is optional.

**Flair:** Not confirmed. Rate-limited. Pick the closest general or culture flair if
the form asks.

**Title (English, Telugu welcome):**
> ఒరేయ్ ఎవర్రా? – I made a free game for guessing Telugu stars from a blurred photo, to play with friends

**Body:**
> I made this to play with my friends and family. It's named after the "Orey, evarra?"
> line, and the idea is simple: how early can you recognise a Telugu cinema face?
>
> https://ysai258.github.io/evarra/
>
> - **ఎవర్రా? (daily):** One star a day, the same for everyone. The photo starts very
>   blurred and clears after each wrong guess. You get five guesses, and clues like a
>   director or a film they were in.
> - **ఎవర్రా మీరంతా? (archive):** Every earlier day stays playable.
> - **Play with friends:** Make a room, share the code in your WhatsApp group, and up
>   to 20 people guess the same face at the same time, with a leaderboard after every
>   question.
>
> It's free, runs on phone or desktop, has no ads and needs no sign-up. The photos are
> credited Wikimedia Commons portraits, not movie stills.
>
> I'd really like to know:
> 1. Who's missing? The roster covers about 170 actors and actresses right now.
> 2. Would a Telugu-script version of the clues and buttons be worth doing?

**Optional first comment:**
> For a group game: one person taps "Play with friends" and creates a room, then shares
> the link. The first room can take a minute to wake the server up.

---

## 3. r/IndieDev

**Why it fits:** Its only rule bans capsule-comparison posts outside Wednesdays.
Developers share their own playable games there and ask for feedback. Post on any day
except in Wednesday's capsule thread.

**Post type:** Image post (`qa/mp-07-reveal.png` or `qa/mp-04-question.png`), with the
link and text in the body.

**Flair:** Not confirmed. Rate-limited. Choose a "Feedback?" or "Free Game"-style flair
if one is offered.

**Title:**
> I made a browser party game for my friends: everyone guesses the same blurred face, and it sharpens every second

**Body:**
> Play: https://ysai258.github.io/evarra/ (free, phone or desktop, no sign-up)
>
> I made this to play with my friends. It's a face-guessing game for Telugu film stars,
> with a solo daily puzzle and a real-time room mode for 2–20 players.
>
> A few things I worked out along the way:
> - **The blur is in the image files, not CSS.** With a CSS blur, "open image in new
>   tab" shows you the answer. Each stage is its own small file (under 20 KB for all
>   four), and the browser never gets a sharper one than you've reached.
> - **In a room, the clock clears the photo, not your mistakes.** If wrong guesses
>   cleared it, every miss would be a free clue for everyone else. The server owns the
>   timer and the score, and it won't serve the next blur stage until the room's clock
>   reaches it.
> - **The room server is one small Node + Socket.IO process.** Rooms live in memory,
>   and a dropped phone keeps its seat for 30 seconds.
>
> An AI coding assistant helped with the code. The photos are credited Wikimedia
> Commons portraits and the clues come from Wikidata.
>
> I'd like feedback on two things:
> 1. Does the continuous sharpening read as "fair" in a room, or does it feel random
>    who gets it first?
> 2. On the home screen, is it clear there's a multiplayer mode?

**Optional first comment:** Same note about the server waking up as in r/playmygame.

---

## 4. r/andhra_pradesh

**Why it fits:** "Posts must at least be loosely relevant to AP and it's people", and
"There is a limit of one post per day per account". Telugu cinema is about as close to
AP's people as non-political content gets. You must "Assign appropriate flair to your
post". Its flair rules are on the sub's wiki at `/r/andhra_pradesh/wiki/flair_rules`.
Read that page before posting.

**Post type:** Text post with the link.

**Flair:** Required. The exact list wasn't confirmed (rate-limited). Choose the
entertainment, culture or general option, never Politics.

**Title:**
> Made a free game to play with friends: guess the Telugu star from a blurred photo

**Body:**
> I built this to play with my friends: https://ysai258.github.io/evarra/
>
> Every day there's one Telugu cinema star, starting 92% blurred. You get five guesses,
> and it clears a bit after each wrong one. There's also a "play with friends" mode:
> make a room, drop the link in your group chat, and everyone guesses the same face at
> the same time with a live leaderboard. It's free, works on phone or desktop, and has
> no sign-up.
>
> Two questions:
> 1. Which star did you get on the first look, and which one stumped you?
> 2. Would your friend group play this together on a call?

**Optional first comment:** none needed. Reply to people instead.
