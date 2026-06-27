# Name a Woman — Architecture & Game Design

**Date:** 2026-06-27
**Status:** Approved design, pre-implementation
**Supersedes:** the initial Astro + Supabase (`search_woman` RPC) approach in the current codebase.

## 1. The game

A 60-second recall sprint. The player types names of women into a single input; each
correctly identified woman drops a card onto a growing wall. The meta-goal is to "name them
all" — every woman who has an English Wikipedia article.

**Round loop**

- 60-second timer, restartable, starts from zero each round.
- Score = number of distinct women correctly named this round.
- Input is **blind submit-on-Enter only**: the player types a full name and commits it with
  Enter. Space is deliberately *not* a submit key — it is load-bearing inside multi-word names
  ("Marie Curie"). There is **no autocomplete dropdown** — that would turn recall into
  recognition, which the scoring rule explicitly rejects.
- On a valid, unique match: a card animates onto the wall, input clears, score increments.
- On an ambiguous/invalid guess: a short reject cue (shake), no card, no score.
- A woman already named this round cannot be scored twice.

**Two layers of state**

- **Session (ephemeral, client only):** the timer, the set of woman-IDs named this round, the
  score. Nothing persisted.
- **Global (persistent, server):** every woman ever correctly named **by anyone** flips from
  undiscovered → discovered, permanently. Displayed as a counter: "humanity has named X of
  ~435,000" plus a feed of recent discoveries. The wall of 435k is **never** rendered as 435k
  DOM nodes — it is a counter + recent-discovery feed.

## 2. Scoring rule (the core mechanic)

**Accept a guess iff it resolves to exactly one woman by a notability margin.**

- `"Megawati"` → one dominant match (Megawati Sukarnoputri), no rival → **accept**.
- `"Elizabeth"` → thousands of matches, no single dominator → **reject** with a nudge
  ("too common — add a surname").
- `"Elizabetth Taylor"` → typo absorbed, one dominator → **accept**.

Implemented as **search → judge**: the matcher returns top-N candidates ranked by
`(text-match quality, notability)`; the judge accepts the top candidate only if it is a strong
match AND dominates the second candidate by a notability margin **K**.

**K is the difficulty dial.** It is tuned empirically against ~100 real guesses, not guessed.
This tuning pass happens once, with real data, before launch.

## 3. Scope

**English Wikipedia women only (v1):** ~435,000 women who have an English-language Wikipedia
article (live-verified count, mid-2026; grows ~18k/year). This is the set of globally
recall-able women — heads of state, laureates, artists worldwide (Megawati, Wangari Maathai,
Frida Kahlo all included). It is *not* "Western women only."

Excluded for v1: women notable only inside one non-English country with no English article.
Multi-language support can be added later without redesigning anything.

## 4. Architecture — client-first matching, near-zero server

The decisive constraint: a typing sprint lives or dies on per-guess feel, and any network
round-trip (30–150ms over public internet) makes the card-drop feel laggy regardless of how
fast a server search engine is. Therefore **matching does not touch the network**.

```
Build step (offline, re-run monthly):
   QLever SPARQL  →  435k women + aliases (+ enwiki redirects) + 12-month pageviews
                  →  bake a compact prefix-bucket index
                  →  brotli-precompressed static asset (~5–7 MB)

Browser (Astro 7 static, served from CDN):
   ├─ downloads the index once (content-hashed filename, cached forever)
   ├─ matching = a SHARED TypeScript function:
   │     prefix-bucket lookup (notability-presorted) + uFuzzy for typo tolerance
   │     → microsecond feedback, ZERO network, card drops instantly
   └─ on an ACCEPTED guess → fire-and-forget POST to the VM

imos-vm (Docker): a small Node API + Postgres
   └─ re-runs the SAME shared matching function to VALIDATE the guess
      (clients are untrusted), flips the global "discovered" bit
      (INSERT ... ON CONFLICT DO NOTHING), returns the updated counter
```

**No Typesense, no Supabase, no search service.** This is a deliberate reversal of the earlier
Typesense proposal. Rationale: if the client matches and the server only validates, having the
match logic in two different engines (browser index vs Typesense) means they can disagree —
client accepts, server rejects, player loses a card they earned. **One shared TypeScript
matching function** running in both the browser and Node guarantees they never diverge. That
consistency outweighs Typesense's stronger native typo engine, which uFuzzy substitutes for on
the client.

### How this maps to the original goals

| Goal | How it is served |
| --- | --- |
| Absolute best performance | Matching is microseconds, offline, zero round-trip. |
| Migrate off Supabase | Replaced by a static file + a 2-table Postgres. |
| Better control / less infra | No managed services and no search engine at all. |

## 5. Data pipeline (offline build job, re-runnable monthly)

1. **Women list:** one **QLever** SPARQL query (NOT the official WDQS — it 504s on this query
   class, reproduced during research) against the Wikidata graph:
   `instance of: human (Q5)` AND `sex or gender ∈ {female Q6581072, trans woman Q1052281}`
   AND has an `enwiki` sitelink. Returns ~435k rows of (QID, English label, article title,
   sitelink count) in a few seconds.
2. **Aliases:** union of Wikidata `aliases` (all languages, for transliterations) **+ English
   Wikipedia redirects** (maiden names, mononyms, stage names — the redirect set roughly doubles
   alias coverage and is the key supplement). Deduplicate.
3. **Notability score:** 12-month summed **pageviews** (`agent=user`) from the Pageview Complete
   monthly dumps (~5.9 GB/month; ~70 GB for a year; stream-filter to `en.wikipedia`, sum per
   title). Pageviews give 5–6 orders of magnitude of separation — far better disambiguation than
   sitelink count. Sitelink count is the tiebreaker for brand-new articles lacking pageview
   history.
4. **Bake the index:** build the prefix-bucket structure (keyed on the first 1–2 chars, each
   bucket presorted descending by notability), serialize column-oriented, brotli-compress, emit
   as a static asset with a content-hashed filename.

**Caveats to encode:** women missing the Wikidata `sex or gender` claim are invisible to the
filter (the count is a floor, not exact); a few `Q5` sitelinks point to event/non-biography
articles; timestamp every snapshot.

## 6. Match engine (shared TypeScript function)

A single pure function `match(input, index) → { womanId, confidence, margin } | { ambiguous } | { none }`,
imported by both the browser and the Node validator.

- **Prefix-bucket lookup:** hashmap lookup on the first 1–2 chars, then a prefix filter over the
  bucket (presorted by notability), early-exit at limit. Per-keystroke cost is effectively
  microseconds; no per-query sort.
- **Typo tolerance:** layer **uFuzzy** over the candidate set returned by the bucket lookup.
  uFuzzy is ~7 KB and built for "needle in a flat list" — it handles edit-distance on the small
  candidate set, not the full 435k.
- **Alias/partial matching:** aliases are first-class entries in the index, so "Megawati"
  resolves the same way a full name does.
- **Judge:** apply the §2 notability-margin rule on the ranked candidates. Runs client-side in
  <0.01 ms because the candidates are already notability-sorted.

**Explicitly not used:** Fuse.js (O(n) Bitap, falls over at 435k), and heavy general engines
(Orama/FlexSearch/MiniSearch) — over-engineered for prefix+alias+custom-ranking, and their
fuzzy machinery is a feature the game may not need. uFuzzy is the only library dependency in the
match path.

## 7. Server (imos-vm)

- **Postgres**, two tables: `discovered(woman_id PK, first_named_at, first_named_by?)` and an
  optional `leaderboard`. The discovered set is a growing union; the counter is `count(*)`.
- **Node API** (single small service): `POST /api/guess` receives `{ submitted_string,
  claimed_woman_id }`, re-runs the shared `match()` to confirm the string genuinely resolves to
  that woman under the rules (trust boundary — non-negotiable), then `INSERT ... ON CONFLICT DO
  NOTHING` and returns the new counter. `GET /api/counter` and a recent-discovery feed endpoint.
- Both run under Docker on imos-vm (4-core ARM64, 23 GB RAM, native arm64 images — confirmed).
- **Realtime:** v1 polls the counter on round-end + optimistic increment. No websockets in v1.

## 8. Frontend & animations

Astro 7 static + React 19 islands + Tailwind v4. **astroanimate is rejected** (6-week-old,
13-star, dormant, Astro 4/5 only, scroll-reveal paradigm — wrong for event-driven card-drops).

Animation rules: animate only `transform`/`opacity` (GPU compositor, holds 60fps during a fast
sprint); CSS/WAAPI over JS on the hot path; `ease-out` for entrances under ~300ms; respect
`prefers-reduced-motion`.

| Moment | Tool | Easing | Duration |
| --- | --- | --- | --- |
| Card drop onto wall | CSS `@starting-style` + transform (no JS) | ease-out | ~260ms |
| Wall reflow (siblings shift) | View Transitions API | ease-in-out | ~250ms |
| Global counter tick | Motion `useSpring` (only JS-lib moment) | spring | ~400ms |
| Reject feedback | WAAPI transform shake (interruptible) | ease-out | ~160ms |
| 60s countdown | one CSS transition / `@property` | linear | 60000ms |

Card start state is `scale(0.95)` + opacity, never `scale(0)`. The countdown's numeric readout
is the only thing React updates per second; the smooth visual sweep is a single CSS transition.

## 9. v1 scope cuts (add later, none change the core)

Accounts, persistent personal collections, realtime websockets, multi-language women, a
server-backed leaderboard. All bolt on without redesign.

## 10. Risks & open tuning items

1. **~5–7 MB one-time download** (full aliases), not 2 MB. Cached forever after first visit.
   Mitigation: ship names+notability first (~2–3 MB, playable instantly), lazy-load aliases
   during the first round.
2. **~120–150 MB tab heap** — tight on a 3 GB Android. Must validate on real mid-range hardware;
   trim aliases if it exceeds budget.
3. **Typo tolerance is layered (uFuzzy), not native.** Validate with a ~100-real-guess eval;
   tune the notability-margin K in the same pass. If sound-alike misses matter, add a phonetic
   (Double Metaphone) pass over candidates — does not change the architecture.
4. **Anti-cheat:** client matching is forgeable; the server MUST re-validate before counting a
   global discovery. Covered by the shared `match()` function running server-side.
5. **Index staleness:** the shipped index is a monthly snapshot; the build job re-runs to refresh.

## 11. Success criteria

- A guess produces card-drop feedback with no network round-trip (client-side match).
- The notability-margin rule correctly accepts "Megawati"/"Elizabeth Taylor" and rejects bare
  "Elizabeth" on a real eval set.
- The same `match()` function produces identical accept/reject decisions in browser and on the
  server (no divergence).
- Global counter increments exactly once the first time any woman is named, never on duplicates,
  and only after server-side re-validation.
- Sustained 60fps during a fast typing sprint with cards landing in quick succession.
