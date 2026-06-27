# Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the offline pipeline that turns Wikidata into the shipped `women.json` index — every woman with an English Wikipedia article, in the match engine's `serializeRecords` format.

**Architecture:** A small Bun script: one QLever SPARQL query → pure transform to `WomanRecord[]` → `serializeRecords` → `public/data/women.json` + `manifest.json`. Pure transforms are unit-tested with fixtures; the live query is verified by a final acceptance run. No large dumps, no per-article API fan-out.

**Tech Stack:** TypeScript, Bun (runtime + `bun test`), Biome, QLever SPARQL endpoint, the merged `src/match` engine (`serializeRecords`, `buildIndex`, `match`, `WomanRecord`).

## Global Constraints

- Runtime/test: **Bun** (`bun test`); tests use `import { test, expect } from "bun:test"`. Lint: `bun run check` (Biome).
- Pipeline code lives in `pipeline/` and is **build-time only** — Node/Bun APIs (`fetch`, `Bun.write`) are allowed here (unlike the engine, which must stay isomorphic).
- **Reuse `@/match`** — import `serializeRecords`, `buildIndex`, `match`, and the `WomanRecord` type. Do NOT redefine the record shape or the serialization format. (`@/` resolves to `src/`.)
- `WomanRecord` field rules: `id` = **Wikidata QID numeric part** (`Q7186` → `7186`); `name` = **exact `enwiki` article title, verbatim** (not normalized); `aliases` = **English Wikidata alt-labels**, deduped, with empties and any alias equal to `name` removed; `notability` = **sitelink count** (integer).
- Source = **QLever** (`https://qlever.cs.uni-freiburg.de/api/wikidata`), NOT WDQS. Gender filter `P21 ∈ { Q6581072, Q1052281 }`.
- Outputs: `public/data/women.json` (the `serializeRecords` string) and `public/data/manifest.json` (`{ count, generatedAt, source, schema }`).
- Aliases are **English alt-labels for v1** (refines spec §3 "all languages" — non-Latin scripts are unusable by Latin typists and bloat the payload; other Latin scripts are a later coverage item).

---

### Task 1: SPARQL query + parse QLever bindings

**Files:**
- Create: `pipeline/qlever.ts`
- Test: `pipeline/qlever.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WOMEN_QUERY: string` — the SPARQL query text.
  - `RawRow = { qid: string; title: string; sitelinks: number; alt: string | null }`
  - `parseSparqlBindings(json: unknown): RawRow[]` — pure; turns a SPARQL-JSON result into rows (one per binding, so a woman with N alt-labels yields N rows).
  - `fetchWomenRows(endpoint?: string): Promise<RawRow[]>` — IO; POSTs `WOMEN_QUERY`, parses via `parseSparqlBindings`. Not unit-tested (exercised in Task 4).

- [ ] **Step 1: Write the failing test**

```ts
// pipeline/qlever.test.ts
import { test, expect } from "bun:test";
import { WOMEN_QUERY, parseSparqlBindings } from "./qlever";

test("query targets humans, both gender values, enwiki sitelink, sitelink count", () => {
  expect(WOMEN_QUERY).toContain("wd:Q5");
  expect(WOMEN_QUERY).toContain("wd:Q6581072");
  expect(WOMEN_QUERY).toContain("wd:Q1052281");
  expect(WOMEN_QUERY).toContain("en.wikipedia.org/");
  expect(WOMEN_QUERY).toContain("wikibase:sitelinks");
});

const fixture = {
  head: { vars: ["item", "title", "sitelinks", "alt"] },
  results: {
    bindings: [
      {
        item: { type: "uri", value: "http://www.wikidata.org/entity/Q7186" },
        title: { type: "literal", value: "Marie Curie" },
        sitelinks: { type: "literal", datatype: "http://www.w3.org/2001/XMLSchema#int", value: "180" },
        alt: { type: "literal", value: "Maria Skłodowska-Curie" },
      },
      {
        item: { type: "uri", value: "http://www.wikidata.org/entity/Q7186" },
        title: { type: "literal", value: "Marie Curie" },
        sitelinks: { type: "literal", value: "180" },
        alt: { type: "literal", value: "Madame Curie" },
      },
      {
        // no alt-label binding present
        item: { type: "uri", value: "http://www.wikidata.org/entity/Q1234" },
        title: { type: "literal", value: "Megawati Sukarnoputri" },
        sitelinks: { type: "literal", value: "60" },
      },
    ],
  },
};

test("parses bindings into rows; qid stripped, sitelinks numeric, missing alt -> null", () => {
  const rows = parseSparqlBindings(fixture);
  expect(rows).toEqual([
    { qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Maria Skłodowska-Curie" },
    { qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Madame Curie" },
    { qid: "Q1234", title: "Megawati Sukarnoputri", sitelinks: 60, alt: null },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test pipeline/qlever.test.ts`
Expected: FAIL — cannot find module `./qlever`.

- [ ] **Step 3: Write the query and parser**

```ts
// pipeline/qlever.ts
export const QLEVER_ENDPOINT = "https://qlever.cs.uni-freiburg.de/api/wikidata";

export const WOMEN_QUERY = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?item ?title ?sitelinks ?alt WHERE {
  ?item wdt:P31 wd:Q5 ;
        wdt:P21 ?gender ;
        wikibase:sitelinks ?sitelinks .
  VALUES ?gender { wd:Q6581072 wd:Q1052281 }
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> ;
           schema:name ?title .
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
}`;

export type RawRow = { qid: string; title: string; sitelinks: number; alt: string | null };

type Binding = Record<string, { value: string } | undefined>;

export function parseSparqlBindings(json: unknown): RawRow[] {
  const bindings = (json as { results?: { bindings?: Binding[] } })?.results?.bindings ?? [];
  return bindings.map((b) => ({
    qid: (b.item?.value ?? "").replace("http://www.wikidata.org/entity/", ""),
    title: b.title?.value ?? "",
    sitelinks: Number(b.sitelinks?.value ?? 0),
    alt: b.alt?.value ?? null,
  }));
}

export async function fetchWomenRows(endpoint: string = QLEVER_ENDPOINT): Promise<RawRow[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/sparql-query",
      Accept: "application/sparql-results+json",
    },
    body: WOMEN_QUERY,
  });
  if (!res.ok) throw new Error(`QLever ${res.status}: ${await res.text()}`);
  return parseSparqlBindings(await res.json());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test pipeline/qlever.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/qlever.ts pipeline/qlever.test.ts
git commit -m "feat(pipeline): QLever women query and SPARQL-JSON parser"
```

---

### Task 2: Transform rows → WomanRecord[]

**Files:**
- Create: `pipeline/transform.ts`
- Test: `pipeline/transform.test.ts`

**Interfaces:**
- Consumes: `RawRow` (Task 1); `WomanRecord` (from `@/match`).
- Produces: `rowsToRecords(rows: RawRow[]): WomanRecord[]` — groups rows by `qid`; one `WomanRecord` per woman with `id` = numeric QID, `name` = title, `notability` = sitelinks, `aliases` = deduped alt-labels minus empties and minus any equal to `name`.

- [ ] **Step 1: Write the failing test**

```ts
// pipeline/transform.test.ts
import { test, expect } from "bun:test";
import { buildIndex, match } from "@/match";
import { rowsToRecords } from "./transform";
import type { RawRow } from "./qlever";

const rows: RawRow[] = [
  { qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Madame Curie" },
  { qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Madame Curie" }, // dup alias
  { qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Marie Curie" }, // alias == name, drop
  { qid: "Q1234", title: "Megawati Sukarnoputri", sitelinks: 60, alt: "Megawati" },
  { qid: "Q9999", title: "Jane Doe", sitelinks: 3, alt: null }, // no aliases
];

test("groups by qid, parses numeric id, dedups aliases, drops empty + name-equal", () => {
  const recs = rowsToRecords(rows);
  expect(recs).toEqual([
    { id: 7186, name: "Marie Curie", aliases: ["Madame Curie"], notability: 180 },
    { id: 1234, name: "Megawati Sukarnoputri", aliases: ["Megawati"], notability: 60 },
    { id: 9999, name: "Jane Doe", aliases: [], notability: 3 },
  ]);
});

test("the built index resolves a name and an alias", () => {
  const idx = buildIndex(rowsToRecords(rows));
  expect(match("Marie Curie", idx).status).toBe("matched");
  const m = match("Megawati", idx);
  expect(m.status === "matched" && m.woman.id).toBe(1234);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test pipeline/transform.test.ts`
Expected: FAIL — cannot find module `./transform`.

- [ ] **Step 3: Write the transform**

```ts
// pipeline/transform.ts
import type { WomanRecord } from "@/match";
import type { RawRow } from "./qlever";

export function rowsToRecords(rows: RawRow[]): WomanRecord[] {
  const byId = new Map<number, { name: string; notability: number; aliases: Set<string> }>();
  const order: number[] = [];

  for (const row of rows) {
    const id = Number(row.qid.replace(/^Q/, ""));
    if (!Number.isInteger(id) || id <= 0) continue;
    let rec = byId.get(id);
    if (!rec) {
      rec = { name: row.title, notability: row.sitelinks, aliases: new Set() };
      byId.set(id, rec);
      order.push(id);
    }
    if (row.alt && row.alt !== row.title) rec.aliases.add(row.alt);
  }

  return order.map((id) => {
    const rec = byId.get(id)!;
    return { id, name: rec.name, aliases: [...rec.aliases], notability: rec.notability };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test pipeline/transform.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/transform.ts pipeline/transform.test.ts
git commit -m "feat(pipeline): group rows into WomanRecord[]"
```

---

### Task 3: Manifest builder + bake/orchestrator

**Files:**
- Create: `pipeline/manifest.ts`
- Create: `pipeline/build-index.ts`
- Test: `pipeline/manifest.test.ts`

**Interfaces:**
- Consumes: `WomanRecord`, `serializeRecords` (`@/match`); `rowsToRecords` (Task 2); `fetchWomenRows` (Task 1).
- Produces:
  - `Manifest = { count: number; generatedAt: string; source: string; schema: number }`
  - `buildManifest(records: WomanRecord[], generatedAt: string): Manifest`
  - `pipeline/build-index.ts` — runnable: fetch → transform → write `public/data/women.json` and `public/data/manifest.json`. (IO; not unit-tested — Task 4 runs it for real.)

- [ ] **Step 1: Write the failing test**

```ts
// pipeline/manifest.test.ts
import { test, expect } from "bun:test";
import { buildManifest } from "./manifest";
import type { WomanRecord } from "@/match";

const recs: WomanRecord[] = [
  { id: 7186, name: "Marie Curie", aliases: [], notability: 180 },
  { id: 1234, name: "Megawati Sukarnoputri", aliases: ["Megawati"], notability: 60 },
];

test("manifest reports count, fixed source and schema, and the passed timestamp", () => {
  const m = buildManifest(recs, "2026-06-27T00:00:00.000Z");
  expect(m).toEqual({
    count: 2,
    generatedAt: "2026-06-27T00:00:00.000Z",
    source: "wikidata-qlever",
    schema: 1,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test pipeline/manifest.test.ts`
Expected: FAIL — cannot find module `./manifest`.

- [ ] **Step 3: Write the manifest builder and the orchestrator**

```ts
// pipeline/manifest.ts
import type { WomanRecord } from "@/match";

export type Manifest = { count: number; generatedAt: string; source: string; schema: number };

export function buildManifest(records: WomanRecord[], generatedAt: string): Manifest {
  return { count: records.length, generatedAt, source: "wikidata-qlever", schema: 1 };
}
```

```ts
// pipeline/build-index.ts
import { serializeRecords } from "@/match";
import { fetchWomenRows } from "./qlever";
import { buildManifest } from "./manifest";
import { rowsToRecords } from "./transform";

async function main(): Promise<void> {
  console.log("Querying QLever…");
  const rows = await fetchWomenRows();
  console.log(`Fetched ${rows.length} rows`);

  const records = rowsToRecords(rows);
  console.log(`Built ${records.length} woman records`);

  const manifest = buildManifest(records, new Date().toISOString());

  await Bun.write("public/data/women.json", serializeRecords(records));
  await Bun.write("public/data/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote public/data/women.json + manifest.json (count=${manifest.count})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test pipeline/manifest.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Confirm the orchestrator type-checks (no run yet)**

Run: `bun build pipeline/build-index.ts --target=bun --outfile=/dev/null`
Expected: builds with no errors (verifies imports resolve; does not execute the live query).

- [ ] **Step 6: Commit**

```bash
git add pipeline/manifest.ts pipeline/build-index.ts pipeline/manifest.test.ts
git commit -m "feat(pipeline): manifest builder and build-index orchestrator"
```

---

### Task 4: Live acceptance run + verification

**Files:**
- Create: `pipeline/verify-index.ts`
- Create: `public/data/women.json` (generated — committed artifact)
- Create: `public/data/manifest.json` (generated — committed artifact)
- Modify: `package.json` (add `data:build` and `data:verify` scripts)

**Interfaces:**
- Consumes: `parseRecords`, `buildIndex`, `match` (`@/match`).
- Produces: `pipeline/verify-index.ts` — loads the generated `women.json`, rebuilds the index, asserts count + spot-checks; exits non-zero on failure. Reused by the monthly refresh sanity check.

This task runs the real pipeline against live QLever. The response is large (~hundreds of MB of rows); the orchestrator writes straight to disk — never print the rows.

- [ ] **Step 1: Add npm scripts**

In `package.json` `scripts`, add:

```json
"data:build": "bun run pipeline/build-index.ts",
"data:verify": "bun run pipeline/verify-index.ts"
```

- [ ] **Step 2: Write the verifier**

```ts
// pipeline/verify-index.ts
import { buildIndex, match, parseRecords } from "@/match";

const text = await Bun.file("public/data/women.json").text();
const records = parseRecords(text);
const idx = buildIndex(records);

const failures: string[] = [];

// Denominator sanity: mid-2026 live count is ~435k; allow a wide band.
if (records.length < 380_000 || records.length > 600_000) {
  failures.push(`count out of range: ${records.length}`);
}
// Unique, positive integer ids.
const ids = new Set(records.map((r) => r.id));
if (ids.size !== records.length) failures.push("duplicate ids present");
if (records.some((r) => !Number.isInteger(r.id) || r.id <= 0)) failures.push("non-positive id present");
if (records.some((r) => r.name.trim() === "")) failures.push("empty name present");

// Behavioral spot-checks (spec §8).
const expectMatched = (q: string) => {
  const m = match(q, idx);
  if (m.status !== "matched") failures.push(`"${q}" expected matched, got ${m.status}`);
};
expectMatched("Marie Curie");
expectMatched("Megawati"); // surfaces the alias-coverage risk (spec §7) if it fails
if (match("Elizabeth", idx).status !== "ambiguous") {
  failures.push(`"Elizabeth" expected ambiguous, got ${match("Elizabeth", idx).status}`);
}

if (failures.length > 0) {
  console.error("VERIFY FAILED:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log(`VERIFY OK — ${records.length} women`);
```

- [ ] **Step 3: Run the real build**

Run: `bun run data:build`
Expected: prints `Wrote public/data/women.json + manifest.json (count=…)` with a count near ~435k. Takes seconds to a couple minutes depending on QLever. If QLever returns 5xx/timeout, retry; if it persists, report BLOCKED (the query, not the code, is the issue).

- [ ] **Step 4: Run the verifier**

Run: `bun run data:verify`
Expected: `VERIFY OK — <count> women`. If `"Megawati" expected matched` fails, that is the spec §7 alias-coverage risk surfacing — report it as DONE_WITH_CONCERNS (it's a data/engine-refinement finding, not a pipeline bug; do not hack the transform to force it).

- [ ] **Step 5: Confirm the asset is git-tracked, then commit**

```bash
ls -lh public/data/women.json public/data/manifest.json
git add pipeline/verify-index.ts package.json public/data/women.json public/data/manifest.json
git commit -m "feat(pipeline): generate and verify the women index asset"
```

---

## Self-Review

**Spec coverage** (against `2026-06-27-data-pipeline-design.md`):
- §1 output contract (`women.json` via `serializeRecords` + `manifest.json`) → Tasks 3, 4. ✓
- §2 QLever filter (Q5 + P21∈{Q6581072,Q1052281} + enwiki sitelink) → Task 1 `WOMEN_QUERY` + its test. ✓
- §3 field mapping (id=QID int, name=exact title, aliases=alt-labels deduped/cleaned, notability=sitelinks) → Task 2 `rowsToRecords` + test. English alt-labels per Global Constraints (documented refinement of §3). ✓
- §4 stages (query → group → assemble → bake) → Tasks 1–3. ✓
- §5 delivery (asset in `public/data/`, committed) → Task 4; monthly VM systemd timer is ops, out of this code plan (run `data:build && data:verify` on a timer — no new code). ✓
- §8 success criteria (parse/build, count band, unique int ids, non-empty names, Megawati/Marie/Elizabeth spot-checks, idempotence) → Task 4 `verify-index.ts`. Idempotence is inherent (pure transform over stable input); not separately asserted. ✓
- §6 cuts (redirects, pageviews, pre-brotli) correctly NOT implemented. §7 prefix-accept flag is surfaced, not built (Task 4 Step 4 routes it to DONE_WITH_CONCERNS). ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code; every command states expected output. ✓

**Type consistency:** `RawRow` defined Task 1, used Tasks 2–3; `WomanRecord` imported from `@/match` everywhere (never redefined); `rowsToRecords`/`buildManifest`/`fetchWomenRows`/`Manifest` signatures stable across tasks. ✓

**Known verification points (intended, not defects):** the QLever SPARQL-JSON binding shape (Task 1) and the exact response size are pinned by the live run in Task 4 — if QLever's JSON differs from the fixture, `data:verify` fails loudly rather than shipping a bad asset. The `schema:isPartOf <https://en.wikipedia.org/>` clause is the standard QLever idiom for an enwiki sitelink; Task 4 Step 3 confirms it returns the expected ~435k.
