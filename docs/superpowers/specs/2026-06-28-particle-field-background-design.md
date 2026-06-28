# Name a Woman — Particle-Field Background (Design)

**Date:** 2026-06-28
**Status:** Approved design, pre-implementation
**Parent:** `2026-06-27-name-a-woman-architecture-design.md` (§1, §8) and
`2026-06-28-game-frontend-design.md` (§3, §8)
**Origin:** port of the `auth-waitlist` registry item
(`https://www.devl.dev/r/auth/waitlist.json`) — a React/canvas particle field that
spring-morphs between source images — adapted to this project's vanilla-TS + Astro stack and
the named-woman gameplay loop.

## 1. Purpose & scope

A background visual layer behind the game: a particle field that renders a portrait of the
**most recently accepted** woman, fitted to the screen at natural aspect ratio (no crop),
aligned to the right, full height. When a new correct name lands, the particles
**spring-migrate** to the new woman's portrait instead of snapping.

In scope: the particle engine (ported to vanilla TS), the background canvas layer in
`Game.astro`, the hook in the accept-guess path, the layout/legibility treatment, performance
tuning, and reduced-motion handling.

Out of scope: the `typingImpulseRef` keyboard-energy POC from the registry (deferred — a nice
later wiring but not part of v1); mouse repulsion on the field (the field is
`pointer-events: none`, so cursor interaction is moot for now and dropped); any change to the
match index, the server, the discovery write, or the card build/fly/reflow animations.

## 2. Image source & fallback (decided)

The shipped index carries no image data (architecture §5, §8). The particle field reuses the
**existing** runtime path: `src/game/summary.ts` → `fetchSummary(title)` returns
`{ thumb, extract }`, where `thumb` is the Wikipedia REST summary thumbnail URL
(`data.thumbnail?.source`). This is the same source the cards already use, so one summary call
per accepted guess serves **both** the card thumbnail and the background field — see §5 for the
consolidation.

**CORS:** `upload.wikimedia.org` sends `Access-Control-Allow-Origin: *`, which satisfies the
canvas `getImageData` taint check. The registry sets `image.crossOrigin = "anonymous"`; the
port keeps this.

**Fail-open policy (architecture §"fail-open on non-critical paths"):** the field is a visual
flourish, never a source of truth. If a woman has no thumbnail, or the fetch fails, or the
image is tainted, the field **keeps showing the previous woman's particles** — no blank flash,
no snap to empty. Before the first correct guess the field is empty (flat background as today);
the first portrait arrives with the first correct name. The game never blocks on the field.

## 3. Layout — "natural ratio, no crop, right-aligned, full height"

The registry's `sampleTargets` already does a **contain-fit**: it computes `drawW`/`drawH`
preserving the source aspect ratio so the entire image fits inside the canvas, then samples
pixels across that area. Nothing is cropped by construction.

This spec adds an `align: "right"` option to the engine (the registry ships `"center"` and
`"bottom"`):

- `offsetX = width - clusterW` — hard right edge.
- `offsetY = (height - clusterH) / 2` — vertically centered.

For a portrait-aspect thumbnail (the common case for a person photo), contain-fit on a tall
viewport means `clusterH ≈ height` (full top-to-bottom) and `clusterW < width` (letterboxed
left/right); with `align: "right"` the figure sits flush right, full height, uncropped. This
matches the requested behavior exactly. Landscape or square thumbnails still contain-fit
without crop; they just won't fill the full height, which is correct (we never crop).

The canvas itself is `position: fixed; inset: 0` — full viewport, behind all game content.

## 4. Code structure (the port)

The registry component is imperative canvas code wearing a React hat: every prop is already
mirrored into a ref so the `useEffect` doesn't re-run, there's an `applySrcRef` escape hatch
for morphs, and `useSyncExternalStore` wraps a `MutationObserver` that already exists. The port
strips the React wrapper and keeps the physics verbatim.

### 4.1 `src/game/particle-field.ts` (new)

```
createParticleField(canvas: HTMLCanvasElement, options?: Options): FieldHandle
```

`Options` (all optional, with the tuned defaults from §7):
`sampleStep`, `threshold`, `dotSize`, `renderScale`, `spring`, `damping`, `align`.

`FieldHandle`:
- `morphTo(src: string): void` — load the image and spring-migrate particles to the new
  shape. Safe to call repeatedly; the engine tokenizes loads so a fast second call supersedes
  a slow first.
- `destroy(): void` — cancels RAF, disconnects observers, removes listeners. Idempotent.
- `pause()` / `resume()` — stop/restart the RAF loop without rebuilding particles (used on
  game-over).

Internally the module owns: the `Particle`/`ParticleTarget` types, `sampleTargets`,
`buildFresh`, `morphTo` (the shuffled-index pairing that decorrelates the raster scan so
morphs don't sweep in a visible diagonal), the `render` RAF loop (spring + cursor repulsion +
drift + twinkle + cull), the `ResizeObserver` debounced resample, and the dark-mode paint
swap.

**Dark-mode paint:** our dark mode is media-query based
(`globals.css` `@custom-variant dark (@media (prefers-color-scheme: dark))`), not class-based,
so the registry's `MutationObserver` on `html.dark` is replaced by a
`matchMedia("(prefers-color-scheme: dark)")` listener that flips the fill color between
`rgba(10,12,16,1)` (light) and `rgba(255,255,255,0.92)` (dark). No `useSyncExternalStore`
equivalent is needed — a single listener updates a module-scoped ref the render loop reads.

**What is dropped from the registry:** `typingImpulseRef` and the `pulseParticleTypingImpulse`/
`pulseParticleSubmitImpulse`/`bumpParticleTypingImpulse` helpers (v1 doesn't wire keyboard
energy), `adaptToTheme`/`invert`/`denseParticles`/`color` props (not needed for this single
use), and `mouseForce`/`mouseRadius` (the field is `pointer-events: none` — see §6).

### 4.2 `src/game/Game.astro` (modified)

Add a background layer **before** the existing content, all `pointer-events-none`:

```astro
<div id="bg" class="pointer-events-none fixed inset-0 z-0">
  <canvas
    id="bg-field"
    class="block h-full w-full mask-l-from-30% mask-b-from-60%"
  ></canvas>
</div>
```

The canvas itself carries Tailwind v4 `mask-image` utilities (see §6) — no overlay divs needed.
The existing `<main id="game">` gains `relative z-10` so it sits above the field. `main`'s own
`bg-gray-50`/`dark:bg-gray-900` is **removed** (the field is now the background); the
game-over overlay keeps its `bg-gray-50/90`/`dark:bg-gray-900/90` so it still obscures the
field on time-up.

### 4.3 `src/game/game.client.ts` (modified)

In `init`, after the existing element lookups, create the field once:

```ts
const bgCanvas = $<HTMLCanvasElement>("bg-field");
const field = createParticleField(bgCanvas, { align: "right", /* tuned defaults */ });
```

In the accept branch (`game.client.ts:142-156`), after the card animation, fire-and-forget the
morph. Per §5 this shares the summary fetch with the card. On game-over, `field.pause()`; on
Play Again, `field.resume()` (the field keeps its last portrait — a fresh round starts with the
previous figure still behind it, which is fine; the next accept will morph it).

## 5. Sharing the summary fetch

Today `buildCard` (`game.client.ts:79-120`) calls `fetchSummary(title)` internally
(`:102`). If the accept branch also called `fetchSummary` for the particle field, that would be
**two** Wikipedia REST calls per accepted guess. This spec consolidates to one:

- Lift the fetch into the accept handler: `const summary = await fetchSummary(g.woman.name)`
  (fire-and-forget relative to the game loop — the card still renders its skeleton
  immediately; only the thumbnail/extract cross-fade awaits the summary, as today).
- `buildCard` changes to accept the summary as a second argument:
  `buildCard(title: string, summary: Promise<Summary>)` (or a resolved `Summary`). The card's
  internal `.then()` is preserved so the skeleton→content reveal timing is unchanged.
- The same resolved `thumb` drives `field.morphTo(thumb)` when present; absent thumb → no morph
  (fail-open, the field keeps its prior portrait).

This is a small, surgical refactor of `buildCard`'s signature — the only existing-code change
outside the new module and the markup.

## 6. Legibility via CSS mask

Instead of the registry demo's gradient-overlay divs, the canvas is masked directly with
Tailwind v4 `mask-image` utilities
([tailwindcss.com/docs/mask-image](https://tailwindcss.com/docs/mask-image)). This is cleaner:
it masks the actual rendered pixels (including particles that drift left from spring physics),
requires no bg-color matching, needs no extra DOM elements, and is GPU-composited.

Two linear masks are combined (Tailwind sets `mask-composite: intersect` by default, so a
pixel must pass both masks to be visible):

- **`mask-l-from-30%`** — `linear-gradient(to left, black 30%, transparent 0%)`. Fully visible
  from 30% across to the right edge; fades to transparent at the left edge. This is the
  requested left-edge fade: the figure (right-aligned) stays solid on the right while the left
  third dissolves into the page background. The centered idle input and corner readouts sit in
  the faded zone and stay legible.
- **`mask-b-from-60%`** — `linear-gradient(to bottom, black 60%, transparent 100%)`. Fully
  visible in the top 60%; fades to transparent across the bottom 40%. The docked input and its
  underline sit in this faded zone and stay readable.

With `intersect`, the visible region is the upper-right area — exactly where the right-aligned
figure lives. The bottom-left (where the input concentrates) is doubly faded. The faded areas
show the `html` background (`#f9fafb` light / `#111827` dark from `Layout.astro`), which is the
same gray-50/gray-900 the page already uses, so the transition is seamless.

The exact `from` percentages are tuned during the visual pass on `main`. The field wrapper is
`pointer-events: none`, so it never intercepts input focus, card clicks, or the wall scroll.

## 7. Performance & tuning

The field is a **background**, not a hero centerpiece, so it runs sparser than the registry
defaults. Initial tuning (refined during the visual pass on `main`):

| Prop | Registry default | This project | Why |
| --- | --- | --- | --- |
| `sampleStep` | 3 | 4 | sparser for a background; fewer particles = less CPU |
| `threshold` | 50 | 45 | keep a touch more of the figure |
| `dotSize` | 1.15 | 0.9 | smaller dots, less visual weight |
| `renderScale` | 1 | 1 | unchanged |
| `spring` | 0.035 | 0.035 | unchanged (morph feel) |
| `damping` | 0.86 | 0.86 | unchanged |

Source thumbnails are ~320–512px on the long edge; at `sampleStep: 4` that yields a few thousand
particles, well within a 60fps RAF budget for the spring/twinkle math.

DPR is clamped to 2 (registry does this). The `ResizeObserver` is debounced 120ms before
resampling (registry does this). The RAF loop is paused on game-over and when the tab is
hidden (`document.visibilitychange`) — the latter is a small addition over the registry for
battery courtesy.

## 8. Reduced motion

The existing `prefersReduced()` helper (`animations.ts:6-8`) is reused. When reduced motion is
preferred:

- No spring wobble, no twinkle, no drift: particles snap to their target positions on
  `morphTo` and hold static. The morph is effectively instant (no spring migration).
- The RAF loop still runs at low cost to paint the static field and handle resizes, but no
  per-frame velocity integration. (Alternatively, render once and stop the loop entirely until
  the next morph/resize — decide at build; default to the low-cost loop for simplicity.)

The figure still reads (it's a static portrait in particles), just without motion. This
satisfies the architecture spec §8 rule: respect `prefers-reduced-motion`.

## 9. What doesn't change

- The index (`public/data/women.json`), the manifest, the build pipeline — untouched.
- `match()`, `parseRecords`, `buildIndex`, `resolveGuess` — untouched.
- The server, the discovery POST, the global counter — untouched.
- The card build/fly-in/Flip reflow, the timer, the reject shake — untouched except the
  `buildCard` signature change in §5.
- The state machine (`state.ts`) — untouched. The field is not part of game state; it's a
  side-effect of the accept action, like `reportDiscovery`.

## 10. Verification

- **Typecheck/lint/build** in the worktree: `bun run typecheck`, `bun run lint`,
  `bun run build` (per CLAUDE.md).
- **Unit:** the particle engine's sampling/morph logic is pure given a canvas + image; a
  `particle-field.test.ts` can assert that `morphTo` with a dummy image populates particles and
  that `destroy` cancels the RAF (using a fake RAF + canvas mock). Co-located with the module,
  run via `bun test`.
- **Visual:** per CLAUDE.md, the visual pass happens on `main` after merge — verify the figure
  is right-aligned, full-height, uncropped; that morphs between two named women spring rather
  than snap; that the input/readouts stay legible over the field; that dark mode swaps paint;
  and that reduced motion holds the figure static.

## 11. Worktree

`git worktree add ../name-a-woman-particle-field -b particle-field`. Build/typecheck/lint in
the worktree; merge to `main` locally for the visual verification pass; remove the worktree
after. No PR unless requested.
