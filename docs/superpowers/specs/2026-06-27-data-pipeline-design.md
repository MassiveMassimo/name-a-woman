# Name a Woman — Sub-project B: Data Pipeline (Design)

**Date:** 2026-06-27
**Status:** Approved design, pre-implementation
**Parent:** `2026-06-27-name-a-woman-architecture-design.md` (§5)
**Consumes:** the match engine's `WomanRecord` type and `serializeRecords` (sub-project A, merged).

## 1. Purpose & output contract

Produce the static index asset the game ships: every woman with an English Wikipedia article,
in the exact `serializeRecords` format the browser and server both load via `parseRecords` +
`buildIndex`. The pipeline is the **only** producer of that artifact.

**Output:**
- `public/data/women.json` — `serializeRecords(WomanRecord[])` output (column-oriented JSON).
  Served from the CDN; the host applies Content-Encoding (brotli) on the wire.
- `public/data/manifest.json` — `{ count, generatedAt, source: "wikidata-qlever", schema: 1 }`.
  The app reads the manifest to show the denominator ("X of <count>") and cache-bust.

`WomanRecord = { id, name, aliases, notability }` (unchanged from sub-project A). This pipeline
sets each field as below.

## 2. Source & filter

One SPARQL query against **QLever** (`https://qlever.cs.uni-freiburg.de/api/wikidata`) — NOT the
official WDQS, which 504s on this query class (reproduced in research). Filter:

- `wdt:P31 = Q5` (instance of human), AND
- `wdt:P21 ∈ { Q6581072 (female), Q1052281 (trans woman) }` (include trans women — the standard
  gender-gap definition), AND
- has an `enwiki` sitelink.

Returns ~435k rows. Per item, the query also pulls the fields in §3.

## 3. Field mapping

| `WomanRecord` field | Source | Notes |
| --- | --- | --- |
| `id` | **Wikidata QID, numeric part** (`Q7186` → `7186`) | Stable for life → safe key for the global `discovered` table across monthly rebuilds. Never a sequential index. |
| `name` | **exact `enwiki` article title** | Doubles as: the match display name, the article link (`/wiki/<name>`), and the key for the lazy photo+extract summary call. Store verbatim (not normalized — the engine normalizes internally). |
| `aliases` | Wikidata `skos:altLabel` (all languages), deduped | Carries mononyms / maiden names / transliterations. This is what makes last-name-only guesses like "Megawati" resolve via the engine's exact branch. |
| `notability` | **sitelink count** (`wikibase:sitelinks`) | v1 notability signal — free, in the same query. Drives the disambiguation margin K. (Pageviews is the documented upgrade; see §6.) |

## 4. Stages (one Bun script, reuses `src/match`)

`pipeline/build-index.ts`, run with Bun. Pure HTTP + transform + file write — no large dumps.

1. **Query** QLever; stream/collect rows.
2. **Group** alt-labels per QID into `aliases[]` (a single woman appears across multiple alias
   rows); dedupe aliases, drop any equal to `name`.
3. **Assemble** `WomanRecord[]`: parse QID→`id`, title→`name`, sitelinks→`notability`.
4. **Bake** via `serializeRecords` → write `public/data/women.json`; write `manifest.json`.

The script is idempotent: same Wikidata state → byte-identical output.

## 5. Delivery & refresh

- The pipeline is lightweight (one HTTP query + a file write), so it runs anywhere — locally for
  the first build, committed into the repo, deployed with the static site.
- **Monthly refresh** is automated on **imos-vm** as a systemd timer: pull, re-run
  `build-index.ts`, and if `women.json` changed, commit + push (the push redeploys the static
  site). The discovered-set DB is untouched by a rebuild because `id` (QID) is stable.

## 6. v1 cuts (add later, none change the contract)

- **enwiki redirects as extra aliases.** Research showed redirects ~double alias coverage, but
  they require a separate fetch (redirect dump / per-article API) over 435k articles. v1 uses
  Wikidata `altLabel` only; redirects are a coverage upgrade evaluated against real misses.
- **Pageviews as notability.** Sitelink count is the v1 signal (free, in-query, and — as traced
  for "Elizabeth" — produces correct ambiguity behavior because the famous clash-of-names cases
  have clustered high sitelink counts). Upgrade to 12-month pageviews (Pageview Complete dumps on
  imos-vm) only if K-tuning shows sitelinks too coarse.
- **Pre-brotli of the asset.** Rely on CDN on-the-wire compression in v1; pre-compress only if
  the host doesn't.

## 7. Flagged for the K-tuning eval (sub-project A refinement, not B)

The engine currently returns `ambiguous` for *any* prefix-only hit, so a last-name/mononym guess
only resolves when it exists as an **alias** (exact branch). If the real-data eval shows expected
mononyms failing because they are prefixes lacking a Wikidata alias (and redirects aren't in
yet), consider an engine change: accept a **unique notability-dominant prefix** match by the same
margin rule. Note it during eval; do not pre-build it.

## 8. Success criteria

- `women.json` parses via `parseRecords` and builds a `MatchIndex` with no errors.
- `manifest.count` is within a few hundred of the live QLever count (~435k mid-2026).
- Every `id` is a positive integer and unique; every `name` is a non-empty exact article title.
- Spot-check: "Megawati" resolves (alias present), "Marie Curie" resolves, bare "Elizabeth" is
  ambiguous — run through the real `match()` against the built index.
- A second run with unchanged Wikidata state produces byte-identical `women.json`.
