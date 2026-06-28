# Name a Woman — Sub-project C: Game Frontend (Design)

**Date:** 2026-06-28
**Status:** Approved design, pre-implementation
**Parent:** `2026-06-27-name-a-woman-architecture-design.md` (§1, §4, §8)
**Consumes:** the match engine (sub-project A — `match`, `parseRecords`, `buildIndex`) and the
data pipeline output (sub-project B — `public/data/women.json`, `public/data/manifest.json`).
**Supersedes:** the current Supabase `search_woman` flow in `src/pages/index.astro`, and the
animation stack in architecture spec §8 (native View Transitions + Motion-for-counter) — see §7.

## 1. Purpose & scope

Build the playable game: the calm Marlin-typography screen the player already has, wired to the
**local** match engine (zero network per guess), with the 60-second sprint loop, the card wall,
and the card-fly animation. This is where **Supabase is removed**.

In scope: game state machine, first-keystroke start, the big-input→bottom transition, the
single-row card wall, lazy per-card photo+extract, GSAP card-fly + reflow, reject feedback,
session score, a **stubbed** global counter, dev mode, and the font/cleanup work.

Out of scope (sub-project D): the real Node API + Postgres global counter. C ships against a
stub behind a stable interface (§6) so it is playable solo.

## 2. Game flow & states

A single client-side state machine with three states:

- **`idle`** — the existing full-screen design: one huge centered Marlin input, placeholder
  "Name a woman". Nothing else competes. The match index loads in the background (§4).
- **`playing`** — entered on the **first keystroke** (architecture: the player implicitly starts
  the clock when ready; no Start button, no countdown). On that transition the big input
  **animates from center to the bottom of the screen, staying large**; the top becomes the card
  wall. The 60s timer starts. Each accepted, unique guess drops a card and increments score.
- **`over`** — at `0:00` the input locks and a game-over overlay shows the final score and a
  **Play Again** button. Play Again resets session state (score, named-set, timer, wall) to zero
  and returns to `idle` (or directly to a fresh `playing` — decide at build; default `idle`).

**Dev mode:** `?dev` in the URL disables the timer (the round never ends) so the developer can
freely query names and watch matching/animation. Harmless in production: session score is
ephemeral and the global discovery bit is server-validated per-woman regardless of timer, so no
separate build flag is needed.

**Duplicate guard:** a woman already named **this round** cannot score again (track a `Set` of
named woman-ids for the session). A repeat is treated as a soft no-op (optional faint cue; no
shake, no card).

## 3. Layout

- **Idle:** unchanged from the existing design — input centered, `text-4xl → sm:7xl → lg:9xl`,
  bottom underline only (`border-b-4`, no box), transparent background, capitalized text, the
  `transition-colors duration-300` focus fades.
- **Playing:** input docked at the **bottom**, still large (Marlin). The **card wall is a single
  horizontal row across the top**, newest at the left. Cards fly up out of the input into the row.
- **Readouts (timer · session score · global counter):** minimal, calm, in screen corners (not a
  heavy top bar) so they don't fight the cards. Exact placement refined during build; keep the
  Marlin/slate calm aesthetic. The global counter reads "{count} of {manifest.count} named".
- **Card wall is never 435k DOM nodes** — only the cards named this round render; the global total
  is the counter, not a rendered wall (architecture §1).
- Responsive: the big input scales down by breakpoint as it already does; the row scrolls
  horizontally on narrow screens.

## 4. Match wiring (remove Supabase)

- On mount, fetch `public/data/women.json`, run `parseRecords` → `buildIndex` once, hold the
  `MatchIndex` for the session. While loading, the input is present but guesses are queued or the
  input shows a subtle not-ready state; reaching `ready` enables play. (women.json is ~19 MB raw /
  ~3–4 MB brotli; parse+build is a one-time cost. **Deferred optimization:** move parse+build to a
  Web Worker if it janks the main thread; v1 may do it inline with a loading state.)
- On submit (Enter only — never Space, never on every keystroke): `match(input, index)`.
  - `matched` and not already named this round → drop a card, increment score, add id to the
    named-set, fire-and-forget `reportDiscovery` (§6).
  - `matched` but already named → soft no-op.
  - `ambiguous` → reject cue (shake), message "too common". No card, no score.
  - `none` → reject cue, message "not found". No card, no score.
  - Reject messages are terse and non-coaching (no "add a surname") — architecture §1.
- **Fail-open:** matching is local and synchronous; it never awaits the network. The global write
  (§6) resolves in the background and degrades silently on error — it must never block the card.
- Read `manifest.json` for the global denominator and as a cache-bust signal for `women.json`.

## 5. Card composition & lazy media

Per architecture spec "Card composition & image strategy". Each card shows the woman's **photo**,
**name**, and a **short Wikipedia extract**.

- The index ships **no** per-woman image or description — only `name` (= exact article title).
  When a card is created, one lazy call: `GET https://en.wikipedia.org/api/rest_v1/page/summary/
  <title>` returns thumbnail URL + short description together.
- While loading: **blur-up placeholder** in the photo slot.
- On network failure / no thumbnail: neutral **placeholder image** (blurred silhouette); the card
  still shows name + (if available) extract. A missing photo never blocks the card.
- Article link `en.wikipedia.org/wiki/<name>` is derived, not stored (optional; nice-to-have).
- Prefetch is a v1 nice-to-have; fetch-on-card-create is the baseline.

## 6. Global layer (stubbed for C)

C builds the full game against a thin client module with a stable interface; sub-project D swaps
in the real VM endpoint behind the same signatures without touching the UI.

```ts
// src/game/global.ts  (C ships this stub)
export async function reportDiscovery(id: number, submitted: string): Promise<{ count: number }>;
export async function getCount(): Promise<number>;
```

- v1 stub: `getCount()` returns a fixed placeholder **discovered** count (a small seed, NOT
  `manifest.count` — the denominator is the total, the count is how many are discovered);
  `reportDiscovery()` is a no-op that resolves immediately. Both are called exactly where the real
  ones will be, so D is a drop-in.
- The counter UI reads `getCount()` on round-end and optimistically increments on each first-time
  discovery this round (architecture §7: poll on round-end + optimistic increment; no websockets).

## 7. Animation — GSAP + Flip

**Decision:** GSAP (core) + the **Flip** plugin are C's animation library. This supersedes
architecture §8 (native View Transitions + Motion-only-for-counter). Rationale: the card-drop
choreography is a timeline (GSAP's strength) and grid/row reflow is exactly what `Flip` does;
bundle (~38 KB gz) is negligible against the multi-MB index. The counter spring can also be GSAP
— one animation library, not two. **astroanimate remains rejected** (architecture §8).

The matching hot path stays library-free (pure `match()`); animation fires only on an accepted
submit (~once/1–2 s), well below any perf concern.

| Moment | How |
| --- | --- |
| Card fly-in | Card launches from the bottom input and flies up into the row. Start ≈ `scale 0.42`, `rotationX −42°`, `skewY 6°`, `blur(12px)`, `autoAlpha 0`, `transformPerspective 900`; tween to identity over ~0.55 s `power3.out`. Perspective lives on the wall container. |
| Row reflow | `Flip.getState` existing cards → prepend new → `Flip.from(state, { stagger: 0.015, ease: 'power2.out' })` — barely-there 15 ms ripple from the insertion point. |
| Big input → bottom dock | Animate the input from centered to bottom on the `idle → playing` transition (GSAP; transform/opacity only). |
| Reject | Short horizontal shake on the input (`gsap.fromTo` x, ~0.16 s). |
| Global counter tick | GSAP (e.g. number tween / spring-like ease) when the count updates. |

- Animate **only transform/opacity/filter** (GPU); fixed start values are tuned, not final (user:
  "good enough for now, I'll tweak later").
- **`prefers-reduced-motion`:** fade-only entrances, no transform motion, no stagger
  (`gsap.matchMedia`).

## 8. Visual design

Keep the existing calm Marlin design — do not redesign.

- **Font:** Marlin Soft SQ. Convert the weights actually referenced (`Regular` 400, `Medium` 500,
  `Bold` 700) from `.ttf` → **woff2** and update the `@font-face` `src` in `globals.css`. The other
  ~17 unused `.ttf` weights in `public/fonts/` are dead weight in the deploy — flag for removal
  (not required by this work).
- **Palette:** slate-100 / slate-900 (light/dark), calm. Single-underline input, color-fade
  transitions retained.
- **Cleanup in `Layout.astro`:** remove the stale `html { font-family: system-ui }` (line 38 —
  conflicts with the Marlin `--font-sans`), the Astro-starter `--accent*` gradient vars, and the
  `code { … }` block (all dead boilerplate). Replace the placeholder
  `<meta name="description" content="Astro description">` with a real description. Reconcile the
  page background with the slate palette.

## 9. Architecture & files

One Astro static page renders a single React island that owns all game state and animation (the
input and wall must coordinate for the card-fly, and share session state).

- `src/pages/index.astro` — renders `<Game client:load />`; drop the Supabase `<script>`.
- `src/game/Game.tsx` — the island: state machine (`idle`/`playing`/`over`), timer, input, score,
  named-set, wall; orchestrates match + animation + global stub.
- `src/game/useMatchIndex.ts` — fetch `women.json` + `parseRecords` + `buildIndex`; `{ index, ready }`.
- `src/game/Card.tsx` — one card: lazy summary fetch (§5), blur-up, fallback.
- `src/game/summary.ts` — Wikipedia REST summary fetch + normalize to `{ thumb, extract }`.
- `src/game/animations.ts` — GSAP/Flip helpers: `flyCardIn`, `reflow`, `dockInput`, `rejectShake`,
  `tickCounter`; all honor reduced-motion.
- `src/game/global.ts` — the stub from §6.
- Carry over the existing input styling (the `ui/input.tsx` classes / index.astro classes).

## 10. Dependencies

- **Add:** `gsap` (includes Flip in the standard package, now fully free).
- **Remove (if unreferenced after rewire):** `@supabase/supabase-js`, `src/lib/supabase.ts`, the
  `PUBLIC_SUPABASE_*` env usage. Verify nothing else imports them before deleting.

## 11. Performance

- Per-guess matching is synchronous and local — microsecond feedback, zero round-trip.
- One-time index parse+build is the main cost; show a ready state, consider a Web Worker if it
  janks (§4).
- 60fps target during a sprint: cards land via transform/opacity/filter only; reflow via Flip;
  no layout-property animation.
- Lazy per-card media keeps the index payload free of images.

## 12. v1 cuts (add later, none change the core)

- Web Worker for index parse (only if main-thread parse janks).
- Aliases lazy-loaded after names (architecture §10 mitigation) — only if first-load payload hurts.
- Prefetch of card media; article links; recent-discovery feed (needs D).

## 13. Success criteria

- Typing a name + Enter produces card-drop feedback with **no network round-trip** (local match).
- "Megawati" / "Elizabeth Taylor" accept; bare "Elizabeth" rejects ("too common") — consistent
  with the calibrated engine.
- First keystroke starts the clock; the big input animates to the bottom; cards collect in the top
  row and fly from the input; existing cards ripple right.
- `?dev` disables the timer; free play works.
- At `0:00` the input locks and the game-over overlay shows the final score with a working
  Play Again.
- Each card lazily shows photo + name + extract, with blur-up and a graceful no-photo fallback.
- Supabase is fully removed; `bun run build` + `bun test` + Biome are clean.
- Sustained 60fps during a fast sprint with cards landing in quick succession; reduced-motion
  users get fade-only.
