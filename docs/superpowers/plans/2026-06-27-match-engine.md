# Match Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, pure-TypeScript matching engine that decides whether a typed string identifies exactly one woman — the core game mechanic — runnable identically in the browser and in Node.

**Architecture:** A normalized prefix-bucket index over woman records (name + aliases), presorted by notability (pageviews). `match()` resolves a query via exact-surface-form lookup, falls back to uFuzzy for typos, and applies the notability-margin judge to accept/reject/flag-ambiguous. A serialize/parse pair defines the on-disk index format both runtimes load. No search service, no heavy search library — uFuzzy is the only dependency in the match path.

**Tech Stack:** TypeScript, Bun (runtime + `bun test`), Biome (lint/format), `@leeoniya/ufuzzy` (typo tolerance).

## Global Constraints

- Runtime/test: **Bun**. Tests use `import { test, expect, describe } from "bun:test"`.
- Lint/format: **Biome** (`bun run check`).
- `match()` and everything it imports must be **pure TypeScript with no browser- or Node-only APIs**, so the identical module runs in the browser island and the server validator. No `fs`, no `window`, no `document`.
- **Only `@leeoniya/ufuzzy`** may be added to the match path. Do NOT add Fuse.js, Orama, FlexSearch, MiniSearch, or Typesense.
- Normalization rule (verbatim): lowercase, strip diacritics (NFD + remove combining marks), collapse internal whitespace to single spaces, trim.
- Notability = integer (12-month pageviews); higher = more famous.
- Scoring rule (spec §2): an **exact** surface-form match to exactly one woman → accept; multiple women sharing an exact form → accept the top only if it beats the second by the notability margin **K**, else ambiguous; a query that only **prefix**-matches many women (no exact) → reject as "too common / incomplete"; typos are absorbed by a uFuzzy fallback treated like an exact match.
- **K is a single exported tunable constant**, default `5`, to be tuned later against a real eval set. Do not scatter the value.

---

### Task 1: Index types and normalization

**Files:**
- Create: `src/match/types.ts`
- Create: `src/match/normalize.ts`
- Test: `src/match/normalize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WomanRecord = { id: number; name: string; aliases: string[]; notability: number }`
  - `MatchIndex = { byId: Map<number, WomanRecord>; buckets: Map<string, IndexEntry[]> }`
  - `IndexEntry = { form: string; id: number; notability: number }` (`form` is normalized)
  - `normalize(s: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/match/normalize.test.ts
import { test, expect } from "bun:test";
import { normalize } from "./normalize";

test("lowercases and trims", () => {
  expect(normalize("  Marie Curie  ")).toBe("marie curie");
});

test("strips diacritics", () => {
  expect(normalize("Frída Kahló")).toBe("frida kahlo");
});

test("collapses internal whitespace", () => {
  expect(normalize("Marie   Curie")).toBe("marie curie");
});

test("empty and whitespace-only normalize to empty string", () => {
  expect(normalize("   ")).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/match/normalize.test.ts`
Expected: FAIL — cannot find module `./normalize`.

- [ ] **Step 3: Write the types**

```ts
// src/match/types.ts
export type WomanRecord = {
  id: number;
  name: string;
  aliases: string[];
  notability: number;
};

export type IndexEntry = {
  form: string; // normalized name or alias
  id: number;
  notability: number;
};

export type MatchIndex = {
  byId: Map<number, WomanRecord>;
  buckets: Map<string, IndexEntry[]>;
};
```

- [ ] **Step 4: Write the normalizer**

```ts
// src/match/normalize.ts
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/match/normalize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/match/types.ts src/match/normalize.ts src/match/normalize.test.ts
git commit -m "feat(match): index types and name normalization"
```

---

### Task 2: Build the prefix-bucket index

**Files:**
- Create: `src/match/build.ts`
- Test: `src/match/build.test.ts`

**Interfaces:**
- Consumes: `WomanRecord`, `MatchIndex`, `IndexEntry` (Task 1), `normalize` (Task 1).
- Produces:
  - `bucketKey(form: string): string` — first character of a normalized form, or `""` for empty.
  - `buildIndex(records: WomanRecord[]): MatchIndex` — one `IndexEntry` per (name + each alias), bucketed by first char, each bucket sorted by notability descending.

- [ ] **Step 1: Write the failing test**

```ts
// src/match/build.test.ts
import { test, expect } from "bun:test";
import { buildIndex, bucketKey } from "./build";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
  { id: 1, name: "Megawati Sukarnoputri", aliases: ["Megawati"], notability: 5000 },
  { id: 2, name: "Marie Curie", aliases: [], notability: 90000 },
];

test("bucketKey is the first normalized char", () => {
  expect(bucketKey("megawati")).toBe("m");
  expect(bucketKey("")).toBe("");
});

test("indexes every name and alias as a normalized entry", () => {
  const idx = buildIndex(records);
  const m = idx.buckets.get("m") ?? [];
  const forms = m.map((e) => e.form).sort();
  expect(forms).toEqual(["marie curie", "megawati", "megawati sukarnoputri"]);
});

test("each bucket is sorted by notability descending", () => {
  const idx = buildIndex(records);
  const m = idx.buckets.get("m") ?? [];
  expect(m[0].form).toBe("marie curie"); // notability 90000 first
});

test("byId resolves full records", () => {
  const idx = buildIndex(records);
  expect(idx.byId.get(1)?.name).toBe("Megawati Sukarnoputri");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/match/build.test.ts`
Expected: FAIL — cannot find module `./build`.

- [ ] **Step 3: Write the builder**

```ts
// src/match/build.ts
import { normalize } from "./normalize";
import type { IndexEntry, MatchIndex, WomanRecord } from "./types";

export function bucketKey(form: string): string {
  return form.length === 0 ? "" : form[0];
}

export function buildIndex(records: WomanRecord[]): MatchIndex {
  const byId = new Map<number, WomanRecord>();
  const buckets = new Map<string, IndexEntry[]>();

  for (const r of records) {
    byId.set(r.id, r);
    const forms = new Set<string>();
    for (const raw of [r.name, ...r.aliases]) {
      const form = normalize(raw);
      if (form) forms.add(form);
    }
    for (const form of forms) {
      const key = bucketKey(form);
      const entry: IndexEntry = { form, id: r.id, notability: r.notability };
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
    }
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => b.notability - a.notability);
  }
  return { byId, buckets };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/match/build.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/match/build.ts src/match/build.test.ts
git commit -m "feat(match): prefix-bucket index builder"
```

---

### Task 3: Exact + ambiguity judge (no typos yet)

**Files:**
- Create: `src/match/match.ts`
- Test: `src/match/match.test.ts`

**Interfaces:**
- Consumes: `MatchIndex`, `WomanRecord` (Task 1), `bucketKey` (Task 2), `normalize` (Task 1).
- Produces:
  - `K = 5` (exported tunable notability margin).
  - `MatchResult = { status: "matched"; woman: WomanRecord } | { status: "ambiguous" } | { status: "none" }`
  - `match(input: string, index: MatchIndex): MatchResult`

This task implements exact-form resolution and the judge. Typo fallback is added in Task 4 — the function is written now to fall through to `none`/`ambiguous` when there is no exact match, and Task 4 inserts the fuzzy branch before that fall-through.

- [ ] **Step 1: Write the failing test**

```ts
// src/match/match.test.ts
import { test, expect } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
  { id: 1, name: "Megawati Sukarnoputri", aliases: ["Megawati"], notability: 5000 },
  { id: 2, name: "Marie Curie", aliases: [], notability: 90000 },
  { id: 3, name: "Elizabeth Taylor", aliases: ["Liz Taylor"], notability: 80000 },
  { id: 4, name: "Elizabeth II", aliases: ["Queen Elizabeth II"], notability: 95000 },
  { id: 5, name: "Elizabeth Warren", aliases: [], notability: 40000 },
  // exact-name collision, dominant: famous actress vs obscure curler
  { id: 6, name: "Jennifer Jones", aliases: [], notability: 30000 },
  { id: 7, name: "Jennifer Jones", aliases: [], notability: 200 },
  // exact-name collision, within margin: two comparably-notable people
  { id: 8, name: "Anna Bell", aliases: [], notability: 1000 },
  { id: 9, name: "Anna Bell", aliases: [], notability: 900 },
];
const idx = buildIndex(records);

test("unique exact alias matches (Megawati)", () => {
  const r = match("Megawati", idx);
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.woman.id).toBe(1);
});

test("case- and space-insensitive exact match", () => {
  expect(match("  marie   curie ", idx).status).toBe("matched");
});

test("bare common first name with no exact form is rejected as ambiguous", () => {
  // "Elizabeth" is nobody's exact name/alias here; it only prefix-matches many
  expect(match("Elizabeth", idx).status).toBe("ambiguous");
});

test("full name resolves the specific woman", () => {
  const r = match("Elizabeth Taylor", idx);
  expect(r.status === "matched" && r.woman.id).toBe(3);
});

test("exact-name collision with a dominant woman accepts the dominant one", () => {
  const r = match("Jennifer Jones", idx);
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.woman.id).toBe(6);
});

test("exact-name collision within the notability margin is ambiguous", () => {
  expect(match("Anna Bell", idx).status).toBe("ambiguous");
});

test("unknown query returns none", () => {
  expect(match("zzzznotreal", idx).status).toBe("none");
});

test("empty query returns none", () => {
  expect(match("   ", idx).status).toBe("none");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/match/match.test.ts`
Expected: FAIL — cannot find module `./match`.

- [ ] **Step 3: Write the matcher (exact + judge)**

```ts
// src/match/match.ts
import { bucketKey } from "./build";
import { normalize } from "./normalize";
import type { IndexEntry, MatchIndex, WomanRecord } from "./types";

// Notability margin: on an exact-name collision the top woman must beat the
// second by this factor to win outright; otherwise the query is ambiguous.
// Tunable — calibrate against a real eval set (spec §2, §10).
export const K = 5;

export type MatchResult =
  | { status: "matched"; woman: WomanRecord }
  | { status: "ambiguous" }
  | { status: "none" };

// Reduce candidate entries to the best entry per distinct woman, ranked by
// notability descending. Returns at most one entry per woman id.
function topByWoman(entries: IndexEntry[]): IndexEntry[] {
  const best = new Map<number, IndexEntry>();
  for (const e of entries) {
    const prev = best.get(e.id);
    if (!prev || e.notability > prev.notability) best.set(e.id, e);
  }
  return [...best.values()].sort((a, b) => b.notability - a.notability);
}

// Apply the notability-margin judge to a set of distinct-woman candidates that
// all matched the query exactly (or fuzzily). One → accept; many → accept the
// dominant one only if it clears margin K; otherwise ambiguous.
function judge(index: MatchIndex, ranked: IndexEntry[]): MatchResult {
  if (ranked.length === 0) return { status: "none" };
  if (ranked.length === 1) {
    const woman = index.byId.get(ranked[0].id);
    return woman ? { status: "matched", woman } : { status: "none" };
  }
  const [first, second] = ranked;
  if (first.notability >= K * Math.max(second.notability, 1)) {
    const woman = index.byId.get(first.id);
    return woman ? { status: "matched", woman } : { status: "none" };
  }
  return { status: "ambiguous" };
}

export function match(input: string, index: MatchIndex): MatchResult {
  const q = normalize(input);
  if (!q) return { status: "none" };

  const bucket = index.buckets.get(bucketKey(q)) ?? [];

  const exact = bucket.filter((e) => e.form === q);
  if (exact.length > 0) return judge(index, topByWoman(exact));

  // No exact match. If the query only prefixes many forms, the player typed an
  // incomplete/too-common fragment → reject as ambiguous. (Typo handling: Task 4.)
  const prefix = bucket.filter((e) => e.form.startsWith(q));
  if (prefix.length > 0) return { status: "ambiguous" };

  return { status: "none" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/match/match.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/match/match.ts src/match/match.test.ts
git commit -m "feat(match): exact resolution and notability-margin judge"
```

---

### Task 4: Typo tolerance via uFuzzy fallback

**Files:**
- Modify: `src/match/match.ts`
- Test: `src/match/match.typo.test.ts`
- Modify: `package.json` (add `@leeoniya/ufuzzy`)

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: no signature change — `match()` now resolves single-edit typos before falling through to the prefix/ambiguous branch.

- [ ] **Step 1: Add the dependency**

Run: `bun add @leeoniya/ufuzzy`
Expected: `package.json` gains `@leeoniya/ufuzzy` under dependencies; `bun.lock` updates.

- [ ] **Step 2: Write the failing test**

```ts
// src/match/match.typo.test.ts
import { test, expect } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
  { id: 3, name: "Elizabeth Taylor", aliases: ["Liz Taylor"], notability: 80000 },
  { id: 2, name: "Marie Curie", aliases: [], notability: 90000 },
];
const idx = buildIndex(records);

test("absorbs a single-character typo (transposition)", () => {
  const r = match("Elizabetth Taylor", idx);
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.woman.id).toBe(3);
});

test("absorbs a single-character substitution", () => {
  const r = match("Marie Curei", idx); // transposed 'ie'->'ei' at end
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.woman.id).toBe(2);
});

test("gibberish still returns none, not a false fuzzy match", () => {
  expect(match("qwertyuiop", idx).status).toBe("none");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/match/match.typo.test.ts`
Expected: FAIL — `Elizabetth Taylor` currently returns `none` (no exact, no prefix).

- [ ] **Step 4: Insert the fuzzy fallback into `match()`**

In `src/match/match.ts`, add the import at the top:

```ts
import uFuzzy from "@leeoniya/ufuzzy";
```

Add this module-level singleton below the imports (single-edit tolerance: insert/substitute/transpose/delete one char within a term):

```ts
const uf = new uFuzzy({ intraMode: 1, intraIns: 1, intraSub: 1, intraTrn: 1, intraDel: 1 });
```

Then in `match()`, replace the prefix/ambiguous tail:

```ts
  // No exact match. If the query only prefixes many forms, the player typed an
  // incomplete/too-common fragment → reject as ambiguous. (Typo handling: Task 4.)
  const prefix = bucket.filter((e) => e.form.startsWith(q));
  if (prefix.length > 0) return { status: "ambiguous" };

  return { status: "none" };
```

with:

```ts
  // No exact match: try a single-edit fuzzy pass over this bucket's forms.
  const forms = bucket.map((e) => e.form);
  const idxs = uf.filter(forms, q);
  if (idxs && idxs.length > 0) {
    const fuzzy = idxs.map((i) => bucket[i]);
    return judge(index, topByWoman(fuzzy));
  }

  // No exact, no fuzzy. A pure prefix of many forms = incomplete/too-common.
  const prefix = bucket.filter((e) => e.form.startsWith(q));
  if (prefix.length > 0) return { status: "ambiguous" };

  return { status: "none" };
```

- [ ] **Step 5: Run the typo tests and the full match suite**

Run: `bun test src/match/`
Expected: PASS — the three new typo tests AND all Task 3 tests still pass (no regression: exact matches short-circuit before the fuzzy branch).

If `uf.filter` returns `null` for no-match (uFuzzy's documented behavior), the `idxs && idxs.length` guard already handles it. If the transposition test fails, verify the `intraTrn: 1` option name against the installed `@leeoniya/ufuzzy` version's README before changing test expectations.

- [ ] **Step 6: Commit**

```bash
git add src/match/match.ts src/match/match.typo.test.ts package.json bun.lock
git commit -m "feat(match): single-edit typo tolerance via uFuzzy fallback"
```

---

### Task 5: Serialize / parse the index (shared on-disk format)

**Files:**
- Create: `src/match/serialize.ts`
- Test: `src/match/serialize.test.ts`

**Interfaces:**
- Consumes: `WomanRecord`, `MatchIndex` (Task 1), `buildIndex` (Task 2).
- Produces:
  - `serializeRecords(records: WomanRecord[]): string` — compact JSON the data pipeline emits and the CDN serves (brotli applied at the HTTP/asset layer, not here).
  - `parseRecords(text: string): WomanRecord[]` — inverse, used by both browser and server before `buildIndex`.

The shipped artifact is the **records**, not the built buckets — the index is rebuilt from records on load (Task 2's `buildIndex`, measured ~40ms). This keeps one source of truth for the structure and avoids serializing Maps.

- [ ] **Step 1: Write the failing test**

```ts
// src/match/serialize.test.ts
import { test, expect } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import { parseRecords, serializeRecords } from "./serialize";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
  { id: 1, name: "Megawati Sukarnoputri", aliases: ["Megawati"], notability: 5000 },
  { id: 2, name: "Marie Curie", aliases: [], notability: 90000 },
];

test("round-trips records exactly", () => {
  expect(parseRecords(serializeRecords(records))).toEqual(records);
});

test("a parsed-and-rebuilt index still matches", () => {
  const idx = buildIndex(parseRecords(serializeRecords(records)));
  const r = match("Megawati", idx);
  expect(r.status === "matched" && r.woman.id).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/match/serialize.test.ts`
Expected: FAIL — cannot find module `./serialize`.

- [ ] **Step 3: Write serialize/parse**

```ts
// src/match/serialize.ts
import type { WomanRecord } from "./types";

// Column-oriented compact form keeps the payload small and brotli-friendly:
// parallel arrays instead of repeated object keys.
type Columns = { id: number[]; name: string[]; aliases: string[][]; notability: number[] };

export function serializeRecords(records: WomanRecord[]): string {
  const cols: Columns = { id: [], name: [], aliases: [], notability: [] };
  for (const r of records) {
    cols.id.push(r.id);
    cols.name.push(r.name);
    cols.aliases.push(r.aliases);
    cols.notability.push(r.notability);
  }
  return JSON.stringify(cols);
}

export function parseRecords(text: string): WomanRecord[] {
  const cols = JSON.parse(text) as Columns;
  const out: WomanRecord[] = [];
  for (let i = 0; i < cols.id.length; i++) {
    out.push({
      id: cols.id[i],
      name: cols.name[i],
      aliases: cols.aliases[i],
      notability: cols.notability[i],
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/match/serialize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/match/serialize.ts src/match/serialize.test.ts
git commit -m "feat(match): column-oriented index serialize/parse"
```

---

### Task 6: Public barrel + lint pass

**Files:**
- Create: `src/match/index.ts`
- Test: (run the full suite + Biome)

**Interfaces:**
- Produces: a single import surface — `import { match, buildIndex, parseRecords, serializeRecords, K } from "@/match"` and the types.

- [ ] **Step 1: Write the barrel**

```ts
// src/match/index.ts
export { buildIndex, bucketKey } from "./build";
export { match, K } from "./match";
export type { MatchResult } from "./match";
export { normalize } from "./normalize";
export { parseRecords, serializeRecords } from "./serialize";
export type { IndexEntry, MatchIndex, WomanRecord } from "./types";
```

- [ ] **Step 2: Run the full match suite**

Run: `bun test src/match/`
Expected: PASS — all tests from Tasks 1–5 green.

- [ ] **Step 3: Lint and format**

Run: `bun run check`
Expected: no errors; any auto-fixes applied to `src/match/*`.

- [ ] **Step 4: Commit**

```bash
git add src/match/index.ts
git commit -m "feat(match): public barrel export for the engine"
```

---

## Self-Review

**Spec coverage** (against `2026-06-27-name-a-woman-architecture-design.md`):
- §2 scoring rule (exact-single accept, exact-collision margin K, prefix-many reject, typo absorb) → Tasks 3 + 4. ✓
- §4 shared pure-TS `match()` for browser + server → Global Constraints + Task 3 (no Node/browser APIs). ✓
- §5 index baked from records → Task 5 serialize is the artifact contract the data pipeline (sub-project B) emits. ✓
- §6 prefix-bucket lookup + uFuzzy + judge, notability-sorted, no Fuse/Orama/FlexSearch → Tasks 2, 3, 4 + Global Constraints. ✓
- §10 K is a tunable constant → exported `K` (Task 3), single source. ✓
- Out of scope here (correctly, separate sub-projects): real Wikidata extraction (B), UI/animation (C), Postgres/anti-cheat server (D). The server's re-validation in D will import this exact `match()`.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every command has expected output. ✓

**Type consistency:** `WomanRecord`/`MatchIndex`/`IndexEntry` defined in Task 1 and used unchanged in 2–5; `match()`/`MatchResult`/`K` signatures stable across Tasks 3–6; `bucketKey` defined Task 2, imported Task 3. ✓

**Known verification point:** the exact `@leeoniya/ufuzzy` option names (`intraTrn` etc.) are pinned at implementation time by Task 4 Step 5 — the test fails loudly if the API differs, which is the intended guard rather than a guess baked into shipped code.
