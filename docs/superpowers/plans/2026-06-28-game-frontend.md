# Game Frontend (Sub-project C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the playable 60-second "name a woman" game on the existing Marlin design, wired to the local match engine (removing Supabase), with the card-fly animation and a stubbed global counter.

**Architecture:** One Astro static page renders a single React island (`Game.tsx`) that owns all game state and orchestrates a set of **pure, framework-free logic modules** (state machine, guess resolution, Wikipedia summary fetch, global stub) plus thin presentational/animation shells (`Card.tsx`, `animations.ts`). The pure modules are unit-tested with `bun:test`; the React/GSAP shells are verified by `bun run build` (typecheck) and visual verification on `main` after merge.

**Tech Stack:** Astro 7 (static) + React 19 islands + Tailwind v4 + GSAP (core + Flip) + Bun + Biome. Match engine (`src/match`) and `public/data/women.json` are consumed unchanged.

## Global Constraints

- **Submit on Enter only** — never Space (load-bearing in multi-word names), never per-keystroke. No autocomplete dropdown.
- **Reject messages are terse and non-coaching:** `ambiguous` → `"too common"`; `none` → `"not found"`. No helper text (no "add a surname").
- **Round starts on the first keystroke**; 60s; at `0:00` input locks → game-over overlay (final score + Play Again resets to zero). `ROUND_SECONDS = 60`.
- **`?dev`** in the URL disables the timer (round never ends).
- **A woman already named this round cannot score twice** (duplicate = soft no-op, no card, no shake).
- **Animate only `transform` / `opacity` / `filter`** (GPU). GSAP + Flip is the animation library. **astroanimate is forbidden.**
- **Respect `prefers-reduced-motion`:** fade-only entrances, no transform motion, no stagger.
- **Card fly-in tunables (starting values, not final):** `scale 0.42`, `rotationX -42`, `skewY 6`, `blur(12px)`, `transformPerspective 900`, `~0.55s power3.out`. Reflow: `Flip.from(..., { stagger: 0.015, ease: 'power2.out', duration: 0.46 })`.
- **`id` is the numeric Wikidata QID** (`WomanRecord.id: number`). `WomanRecord = { id: number; name: string; aliases: string[]; notability: number }`.
- **Matching is local & synchronous** — never awaits the network. **Fail-open:** the global write resolves in the background and degrades silently on error; it must never block the card.
- **Keep the existing Marlin design** — calm, minimal, slate-100/900, big single-underline input, color-fade transitions. Do not redesign.
- **Tests:** `bun:test`, files co-located as `src/game/*.test.ts`. Path alias `@/* → src/*`. Run full suite with `bun test`; build with `bun run build`; lint with `bunx biome check`.

---

### Task 1: Project setup — GSAP dependency, Marlin woff2, Layout cleanup

**Files:**
- Modify: `package.json` (add `gsap`)
- Create: `public/fonts/Marlin Soft SQ Regular.woff2`, `Marlin Soft SQ Medium.woff2`, `Marlin Soft SQ Bold.woff2` (converted)
- Modify: `src/styles/globals.css:18-38` (`@font-face` `src` → woff2)
- Modify: `src/layouts/Layout.astro:25-53` (remove dead boilerplate)

**Interfaces:**
- Produces: the `gsap` + `gsap/Flip` import target for Task 6; woff2 Marlin faces; a cleaned `Layout.astro`.

- [ ] **Step 1: Add GSAP**

Run: `bun add gsap`
Expected: `gsap` appears in `package.json` `dependencies`; `bun install` completes. GSAP ships the Flip plugin and its own TS types in the package — no `@types/gsap`.

- [ ] **Step 2: Convert the three referenced Marlin weights to woff2**

Only `Regular` (400), `Medium` (500), `Bold` (700) are referenced by `@font-face`. Convert just those:

```bash
for w in Regular Medium Bold; do
  bunx ttf2woff2 < "public/fonts/Marlin Soft SQ $w.ttf" > "public/fonts/Marlin Soft SQ $w.woff2"
done
ls -la public/fonts/*.woff2
```
Expected: three `.woff2` files exist, each smaller than its `.ttf`.

- [ ] **Step 3: Point `@font-face` at the woff2 files**

In `src/styles/globals.css`, change each of the three `src:` lines from `.ttf`/`format("truetype")` to woff2:

```css
@font-face {
	font-family: "Marlin Soft SQ Regular";
	src: url("/fonts/Marlin Soft SQ Regular.woff2") format("woff2");
	font-weight: 400;
	font-style: normal;
	font-display: swap;
}
@font-face {
	font-family: "Marlin Soft SQ Bold";
	src: url("/fonts/Marlin Soft SQ Bold.woff2") format("woff2");
	font-weight: 700;
	font-style: normal;
	font-display: swap;
}
@font-face {
	font-family: "Marlin Soft SQ Medium";
	src: url("/fonts/Marlin Soft SQ Medium.woff2") format("woff2");
	font-weight: 500;
	font-style: normal;
	font-display: swap;
}
```

- [ ] **Step 4: Remove dead boilerplate from `Layout.astro`**

Replace the `<style is:global>` block and the placeholder description. The new `Layout.astro` body:

```astro
---
import "../styles/globals.css";

interface Props {
	title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="description" content="Name as many women as you can in 60 seconds.">
		<meta name="viewport" content="width=device-width">
		<link rel="icon" type="image/svg+xml" href="/favicon.svg">
		<meta name="generator" content={Astro.generator}>
		<title>{title}</title>
	</head>
	<body>
		<slot />
	</body>
</html>

<style is:global>
	html {
		background: #0f172a; /* slate-900 */
	}
</style>
```

(Removes the stale `font-family: system-ui` that overrode Marlin, the unused `--accent*` gradient vars, and the `code { … }` block.)

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: exit 0, no type errors. Then `grep -c woff2 src/styles/globals.css` → `3`; `grep -c system-ui src/layouts/Layout.astro` → `0`.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock public/fonts/*.woff2 src/styles/globals.css src/layouts/Layout.astro
git commit -m "feat(c): add gsap, convert Marlin to woff2, clean Layout boilerplate"
```

---

### Task 2: Session state machine + dev mode (pure, tested)

**Files:**
- Create: `src/game/state.ts`
- Create: `src/game/state.test.ts`
- Create: `src/game/dev.ts`
- Create: `src/game/dev.test.ts`

**Interfaces:**
- Produces:
  - `ROUND_SECONDS: number` (= 60)
  - `type Phase = "idle" | "playing" | "over"`
  - `interface NamedWoman { id: number; title: string }`
  - `interface GameState { phase: Phase; named: NamedWoman[]; timeLeft: number }`
  - `type Action = { type: "START" } | { type: "ACCEPT"; woman: NamedWoman } | { type: "TICK" } | { type: "END" } | { type: "RESET" }`
  - `function initialState(): GameState`
  - `function reduce(state: GameState, action: Action): GameState`
  - `function isDevMode(search: string): boolean`
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

`src/game/state.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { type GameState, initialState, reduce, ROUND_SECONDS } from "./state";

describe("reduce", () => {
	it("starts idle with an empty round", () => {
		const s = initialState();
		expect(s.phase).toBe("idle");
		expect(s.named).toEqual([]);
		expect(s.timeLeft).toBe(ROUND_SECONDS);
	});

	it("START moves to playing and resets the clock", () => {
		const s = reduce({ phase: "idle", named: [], timeLeft: ROUND_SECONDS }, { type: "START" });
		expect(s.phase).toBe("playing");
		expect(s.timeLeft).toBe(ROUND_SECONDS);
	});

	it("ACCEPT prepends the woman and increments the score", () => {
		let s = reduce(initialState(), { type: "START" });
		s = reduce(s, { type: "ACCEPT", woman: { id: 7186, title: "Marie Curie" } });
		s = reduce(s, { type: "ACCEPT", woman: { id: 5588, title: "Ada Lovelace" } });
		expect(s.named.map((n) => n.id)).toEqual([5588, 7186]); // newest first
		expect(s.named.length).toBe(2);
	});

	it("ACCEPT ignores a duplicate id", () => {
		let s = reduce(initialState(), { type: "START" });
		s = reduce(s, { type: "ACCEPT", woman: { id: 7186, title: "Marie Curie" } });
		s = reduce(s, { type: "ACCEPT", woman: { id: 7186, title: "Marie Curie" } });
		expect(s.named.length).toBe(1);
	});

	it("ACCEPT is ignored unless playing", () => {
		const s = reduce(initialState(), { type: "ACCEPT", woman: { id: 1, title: "x" } });
		expect(s.named.length).toBe(0);
	});

	it("TICK decrements and ends the round at zero", () => {
		let s: GameState = { phase: "playing", named: [], timeLeft: 2 };
		s = reduce(s, { type: "TICK" });
		expect(s.timeLeft).toBe(1);
		expect(s.phase).toBe("playing");
		s = reduce(s, { type: "TICK" });
		expect(s.timeLeft).toBe(0);
		expect(s.phase).toBe("over");
	});

	it("RESET returns to a fresh idle round", () => {
		const s = reduce({ phase: "over", named: [{ id: 1, title: "x" }], timeLeft: 0 }, { type: "RESET" });
		expect(s).toEqual(initialState());
	});
});
```

`src/game/dev.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { isDevMode } from "./dev";

describe("isDevMode", () => {
	it("is true when ?dev is present", () => {
		expect(isDevMode("?dev")).toBe(true);
		expect(isDevMode("?foo=1&dev")).toBe(true);
		expect(isDevMode("?dev=1")).toBe(true);
	});
	it("is false otherwise", () => {
		expect(isDevMode("")).toBe(false);
		expect(isDevMode("?foo=1")).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/game/state.test.ts src/game/dev.test.ts`
Expected: FAIL — `Cannot find module "./state"` / `"./dev"`.

- [ ] **Step 3: Implement**

`src/game/state.ts`:

```ts
export const ROUND_SECONDS = 60;

export type Phase = "idle" | "playing" | "over";

export interface NamedWoman {
	id: number;
	title: string;
}

export interface GameState {
	phase: Phase;
	named: NamedWoman[];
	timeLeft: number;
}

export type Action =
	| { type: "START" }
	| { type: "ACCEPT"; woman: NamedWoman }
	| { type: "TICK" }
	| { type: "END" }
	| { type: "RESET" };

export function initialState(): GameState {
	return { phase: "idle", named: [], timeLeft: ROUND_SECONDS };
}

export function reduce(state: GameState, action: Action): GameState {
	switch (action.type) {
		case "START":
			return { phase: "playing", named: [], timeLeft: ROUND_SECONDS };
		case "ACCEPT": {
			if (state.phase !== "playing") return state;
			if (state.named.some((n) => n.id === action.woman.id)) return state;
			return { ...state, named: [action.woman, ...state.named] };
		}
		case "TICK": {
			if (state.phase !== "playing") return state;
			const timeLeft = state.timeLeft - 1;
			return timeLeft <= 0 ? { ...state, timeLeft: 0, phase: "over" } : { ...state, timeLeft };
		}
		case "END":
			return { ...state, phase: "over" };
		case "RESET":
			return initialState();
	}
}
```

`src/game/dev.ts`:

```ts
// Dev mode (?dev): disables the 60s timer so the round never ends.
export function isDevMode(search: string): boolean {
	return new URLSearchParams(search).has("dev");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/game/state.test.ts src/game/dev.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/game/state.ts src/game/state.test.ts src/game/dev.ts src/game/dev.test.ts
git commit -m "feat(c): game state machine and dev-mode detection"
```

---

### Task 3: Guess resolution (pure, tested)

**Files:**
- Create: `src/game/resolve.ts`
- Create: `src/game/resolve.test.ts`

**Interfaces:**
- Consumes: `match`, `buildIndex`, `type MatchIndex`, `type WomanRecord` from `@/match`.
- Produces:
  - `type Guess = { kind: "accept"; woman: WomanRecord } | { kind: "duplicate"; woman: WomanRecord } | { kind: "ambiguous" } | { kind: "none" }`
  - `function resolveGuess(input: string, index: MatchIndex, namedIds: Set<number>): Guess`

- [ ] **Step 1: Write the failing test**

`src/game/resolve.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { buildIndex, type WomanRecord } from "@/match";
import { resolveGuess } from "./resolve";

const records: WomanRecord[] = [
	{ id: 7186, name: "Marie Curie", aliases: [], notability: 200 },
	{ id: 42, name: "Elizabeth Taylor", aliases: [], notability: 100 },
	{ id: 43, name: "Elizabeth II", aliases: [], notability: 90 },
];
const index = buildIndex(records);

describe("resolveGuess", () => {
	it("accepts a unique dominant match", () => {
		const g = resolveGuess("Marie Curie", index, new Set());
		expect(g.kind).toBe("accept");
		if (g.kind === "accept") expect(g.woman.id).toBe(7186);
	});

	it("reports a duplicate when the id is already named", () => {
		const g = resolveGuess("Marie Curie", index, new Set([7186]));
		expect(g.kind).toBe("duplicate");
	});

	it("is ambiguous for a too-common prefix", () => {
		expect(resolveGuess("Elizabeth", index, new Set()).kind).toBe("ambiguous");
	});

	it("is none for nonsense", () => {
		expect(resolveGuess("zzzznope", index, new Set()).kind).toBe("none");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/resolve.test.ts`
Expected: FAIL — `Cannot find module "./resolve"`.

- [ ] **Step 3: Implement**

`src/game/resolve.ts`:

```ts
import { match, type MatchIndex, type WomanRecord } from "@/match";

export type Guess =
	| { kind: "accept"; woman: WomanRecord }
	| { kind: "duplicate"; woman: WomanRecord }
	| { kind: "ambiguous" }
	| { kind: "none" };

// Wrap the shared match() and apply the per-round duplicate guard.
export function resolveGuess(input: string, index: MatchIndex, namedIds: Set<number>): Guess {
	const result = match(input, index);
	if (result.status === "matched") {
		return namedIds.has(result.woman.id)
			? { kind: "duplicate", woman: result.woman }
			: { kind: "accept", woman: result.woman };
	}
	return result.status === "ambiguous" ? { kind: "ambiguous" } : { kind: "none" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/resolve.ts src/game/resolve.test.ts
git commit -m "feat(c): guess resolution over the shared match()"
```

---

### Task 4: Wikipedia summary fetch (pure, tested)

**Files:**
- Create: `src/game/summary.ts`
- Create: `src/game/summary.test.ts`

**Interfaces:**
- Produces:
  - `interface Summary { thumb: string | null; extract: string | null }`
  - `function fetchSummary(title: string, fetchImpl?: typeof fetch): Promise<Summary>`

- [ ] **Step 1: Write the failing test**

`src/game/summary.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { fetchSummary } from "./summary";

function mockFetch(status: number, body: unknown): typeof fetch {
	return (async (url: string) => {
		void url;
		return {
			ok: status >= 200 && status < 300,
			status,
			json: async () => body,
		} as Response;
	}) as unknown as typeof fetch;
}

describe("fetchSummary", () => {
	it("returns thumb + extract from a summary response", async () => {
		const f = mockFetch(200, {
			extract: "A physicist and chemist.",
			thumbnail: { source: "https://example.org/curie.jpg" },
		});
		const s = await fetchSummary("Marie Curie", f);
		expect(s.thumb).toBe("https://example.org/curie.jpg");
		expect(s.extract).toBe("A physicist and chemist.");
	});

	it("returns null thumb when no thumbnail is present", async () => {
		const f = mockFetch(200, { extract: "No image here." });
		const s = await fetchSummary("Someone", f);
		expect(s.thumb).toBeNull();
		expect(s.extract).toBe("No image here.");
	});

	it("fails open to nulls on a non-ok response", async () => {
		const s = await fetchSummary("Missing", mockFetch(404, {}));
		expect(s).toEqual({ thumb: null, extract: null });
	});

	it("fails open to nulls when fetch throws", async () => {
		const throwing = (async () => {
			throw new Error("network");
		}) as unknown as typeof fetch;
		const s = await fetchSummary("X", throwing);
		expect(s).toEqual({ thumb: null, extract: null });
	});

	it("URL-encodes the title", async () => {
		let seen = "";
		const f = (async (url: string) => {
			seen = url;
			return { ok: true, status: 200, json: async () => ({}) } as Response;
		}) as unknown as typeof fetch;
		await fetchSummary("Frida Kahlo", f);
		expect(seen).toContain("Frida%20Kahlo");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/summary.test.ts`
Expected: FAIL — `Cannot find module "./summary"`.

- [ ] **Step 3: Implement**

`src/game/summary.ts`:

```ts
export interface Summary {
	thumb: string | null;
	extract: string | null;
}

const ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary/";

// Lazy per-card fetch of photo + extract. Display-only and fail-open: any
// error yields nulls so the card still renders name (+ fallback image).
export async function fetchSummary(title: string, fetchImpl: typeof fetch = fetch): Promise<Summary> {
	try {
		const res = await fetchImpl(ENDPOINT + encodeURIComponent(title));
		if (!res.ok) return { thumb: null, extract: null };
		const data = (await res.json()) as { extract?: string; thumbnail?: { source?: string } };
		return {
			thumb: data.thumbnail?.source ?? null,
			extract: data.extract ?? null,
		};
	} catch {
		return { thumb: null, extract: null };
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/summary.ts src/game/summary.test.ts
git commit -m "feat(c): lazy Wikipedia summary fetch (fail-open)"
```

---

### Task 5: Global layer stub (pure, tested)

**Files:**
- Create: `src/game/global.ts`
- Create: `src/game/global.test.ts`

**Interfaces:**
- Produces:
  - `function getCount(): Promise<number>`
  - `function reportDiscovery(id: number, submitted: string): Promise<{ count: number }>`
  - Sub-project D replaces both bodies behind these exact signatures.

- [ ] **Step 1: Write the failing test**

`src/game/global.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { getCount, reportDiscovery } from "./global";

describe("global stub", () => {
	it("getCount returns a non-negative placeholder discovered count", async () => {
		const c = await getCount();
		expect(typeof c).toBe("number");
		expect(c).toBeGreaterThanOrEqual(0);
	});

	it("reportDiscovery resolves without throwing and returns a count", async () => {
		const r = await reportDiscovery(7186, "Marie Curie");
		expect(typeof r.count).toBe("number");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/game/global.test.ts`
Expected: FAIL — `Cannot find module "./global"`.

- [ ] **Step 3: Implement**

`src/game/global.ts`:

```ts
// STUB for sub-project C. The global "humanity has named X" counter lives on
// the VM (sub-project D); until then getCount returns a fixed placeholder
// DISCOVERED count (not the total denominator) and reportDiscovery is a no-op.
// D replaces both bodies behind these exact signatures — drop-in, no UI change.
const SEED_COUNT = 12043;

export async function getCount(): Promise<number> {
	return SEED_COUNT;
}

export async function reportDiscovery(id: number, submitted: string): Promise<{ count: number }> {
	void id;
	void submitted;
	return { count: SEED_COUNT };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/game/global.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/global.ts src/game/global.test.ts
git commit -m "feat(c): stub global discovery counter (D drop-in)"
```

---

### Task 6: GSAP animation helpers

**Files:**
- Create: `src/game/animations.ts`

**Interfaces:**
- Consumes: `gsap`, `gsap/Flip` (Task 1).
- Produces:
  - `function captureCards(cards: Element[]): Flip.FlipState`
  - `function flyCardIn(card: HTMLElement, input: HTMLElement): void`
  - `function reflow(state: Flip.FlipState): void`
  - `function dockInput(input: HTMLElement, applyDocked: () => void): void`
  - `function rejectShake(input: HTMLElement): void`
  - `function tickCounter(el: HTMLElement, from: number, to: number): void`

This task is verified by typecheck (`bun run build`) and visual verification on `main` after merge — GSAP DOM animations are not unit-tested (no value, no harness).

- [ ] **Step 1: Write the module**

`src/game/animations.ts`:

```ts
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

const prefersReduced = (): boolean =>
	typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Snapshot existing card positions BEFORE the new card is inserted, for Flip reflow.
export function captureCards(cards: Element[]): Flip.FlipState {
	return Flip.getState(cards);
}

// New card launches from the input and flies up into the row (3D tilt + blur).
export function flyCardIn(card: HTMLElement, input: HTMLElement): void {
	if (prefersReduced()) {
		gsap.fromTo(card, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
		return;
	}
	const nr = card.getBoundingClientRect();
	const ir = input.getBoundingClientRect();
	const dx = ir.left + ir.width / 2 - (nr.left + nr.width / 2);
	const dy = ir.top + ir.height / 2 - (nr.top + nr.height / 2);
	gsap.fromTo(
		card,
		{
			x: dx,
			y: dy,
			scale: 0.42,
			rotationX: -42,
			skewY: 6,
			autoAlpha: 0,
			filter: "blur(12px)",
			transformPerspective: 900,
			transformOrigin: "center center",
		},
		{ x: 0, y: 0, scale: 1, rotationX: 0, skewY: 0, autoAlpha: 1, filter: "blur(0px)", duration: 0.55, ease: "power3.out" },
	);
}

// Existing cards glide to their new slots; barely-there ripple from the insertion point.
export function reflow(state: Flip.FlipState): void {
	Flip.from(state, { duration: 0.46, ease: "power2.out", stagger: prefersReduced() ? 0 : 0.015 });
}

// Big centered input → bottom dock. applyDocked flips the CSS class; Flip tweens between.
export function dockInput(input: HTMLElement, applyDocked: () => void): void {
	if (prefersReduced()) {
		applyDocked();
		return;
	}
	const state = Flip.getState(input);
	applyDocked();
	Flip.from(state, { duration: 0.5, ease: "power3.out" });
}

export function rejectShake(input: HTMLElement): void {
	if (prefersReduced()) return;
	gsap.fromTo(input, { x: -7 }, { x: 0, duration: 0.16, ease: "elastic.out(1,0.4)" });
}

// Animate the global counter readout from one value to the next.
export function tickCounter(el: HTMLElement, from: number, to: number): void {
	const obj = { v: from };
	gsap.to(obj, {
		v: to,
		duration: prefersReduced() ? 0 : 0.6,
		ease: "power2.out",
		onUpdate: () => {
			el.textContent = Math.round(obj.v).toLocaleString();
		},
	});
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run build`
Expected: exit 0, no type errors (confirms `gsap`/`gsap/Flip` imports and `Flip.FlipState` resolve).

- [ ] **Step 3: Commit**

```bash
git add src/game/animations.ts
git commit -m "feat(c): GSAP card-fly, Flip reflow, dock, shake, counter helpers"
```

---

### Task 7: Card component

**Files:**
- Create: `src/game/Card.tsx`

**Interfaces:**
- Consumes: `fetchSummary`, `type Summary` from `./summary`.
- Produces: `function Card({ title }: { title: string }): JSX.Element` — renders `.card` markup the wall and `animations.ts` operate on.

Verified by typecheck + visual verification on `main`.

- [ ] **Step 1: Write the component**

`src/game/Card.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchSummary, type Summary } from "./summary";

export function Card({ title }: { title: string }) {
	const [summary, setSummary] = useState<Summary | null>(null);

	useEffect(() => {
		let alive = true;
		fetchSummary(title).then((s) => {
			if (alive) setSummary(s);
		});
		return () => {
			alive = false;
		};
	}, [title]);

	const thumb = summary?.thumb ?? null;

	return (
		<div className="card w-36 shrink-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
			<div className="relative h-24 bg-gradient-to-br from-slate-600 to-slate-700">
				{thumb && (
					<img
						src={thumb}
						alt={title}
						loading="lazy"
						className="h-full w-full object-cover opacity-0 transition-opacity duration-300"
						onLoad={(e) => {
							e.currentTarget.style.opacity = "1";
						}}
					/>
				)}
			</div>
			<div className="p-2.5">
				<div className="font-medium text-sm leading-tight text-slate-100">{title}</div>
				<div className="mt-1 line-clamp-3 text-[11px] leading-snug text-slate-400">{summary?.extract ?? ""}</div>
			</div>
		</div>
	);
}
```

(While the summary loads, the gradient slot is the blur-up placeholder; the `<img>` fades in `onLoad`. No thumb / failure leaves the gradient as the neutral fallback — the card still shows name + extract.)

- [ ] **Step 2: Verify typecheck**

Run: `bun run build`
Expected: exit 0. (`line-clamp-3` is a Tailwind v4 core utility — no plugin needed.)

- [ ] **Step 3: Commit**

```bash
git add src/game/Card.tsx
git commit -m "feat(c): card with lazy photo + extract and blur-up fallback"
```

---

### Task 8: Game island + index.astro rewire + remove Supabase

**Files:**
- Create: `src/game/useMatchIndex.ts`
- Create: `src/game/Game.tsx`
- Modify: `src/pages/index.astro` (render the island, drop the Supabase script)
- Modify: `package.json` (remove `@supabase/supabase-js` if unreferenced)
- Delete: `src/lib/supabase.ts` (if unreferenced)

**Interfaces:**
- Consumes: `reduce`, `initialState`, `ROUND_SECONDS`, `type GameState`, `type NamedWoman` from `./state`; `isDevMode` from `./dev`; `resolveGuess` from `./resolve`; `getCount`, `reportDiscovery` from `./global`; `captureCards`, `flyCardIn`, `reflow`, `dockInput`, `rejectShake`, `tickCounter` from `./animations`; `Card` from `./Card`; `parseRecords`, `buildIndex`, `type MatchIndex` from `@/match`.
- Produces: a playable game. Verified by typecheck + visual verification on `main`.

- [ ] **Step 1: Write the index-loading hook**

`src/game/useMatchIndex.ts`:

```ts
import { useEffect, useState } from "react";
import { buildIndex, type MatchIndex, parseRecords } from "@/match";

interface IndexState {
	index: MatchIndex | null;
	total: number;
	ready: boolean;
}

// Fetch women.json + manifest.json once, build the in-memory index.
export function useMatchIndex(): IndexState {
	const [state, setState] = useState<IndexState>({ index: null, total: 0, ready: false });

	useEffect(() => {
		let alive = true;
		(async () => {
			const [womenText, manifest] = await Promise.all([
				fetch("/data/women.json").then((r) => r.text()),
				fetch("/data/manifest.json").then((r) => r.json() as Promise<{ count: number }>),
			]);
			const index = buildIndex(parseRecords(womenText));
			if (alive) setState({ index, total: manifest.count, ready: true });
		})();
		return () => {
			alive = false;
		};
	}, []);

	return state;
}
```

- [ ] **Step 2: Write the Game island**

`src/game/Game.tsx`:

```tsx
import { type FormEvent, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { captureCards, dockInput, flyCardIn, reflow, rejectShake, tickCounter } from "./animations";
import { Card } from "./Card";
import { isDevMode } from "./dev";
import { getCount, reportDiscovery } from "./global";
import { resolveGuess } from "./resolve";
import { initialState, reduce } from "./state";
import { useMatchIndex } from "./useMatchIndex";

const inputClass =
	"input h-auto w-full rounded-none border-x-0 border-t-0 border-b-4 border-slate-700 bg-transparent text-4xl capitalize text-slate-100 outline-none transition-colors duration-300 placeholder:normal-case placeholder:text-slate-600 focus:border-slate-300 focus:placeholder:text-slate-500 sm:text-7xl lg:text-9xl";

export function Game() {
	const { index, total, ready } = useMatchIndex();
	const [state, dispatch] = useReducer(reduce, undefined, initialState);
	const [message, setMessage] = useState("");
	const [count, setCount] = useState(0);

	const inputRef = useRef<HTMLInputElement>(null);
	const wallRef = useRef<HTMLDivElement>(null);
	const counterRef = useRef<HTMLSpanElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const pendingFlip = useRef<ReturnType<typeof captureCards> | null>(null);
	const dev = useRef(isDevMode(typeof window !== "undefined" ? window.location.search : "")).current;

	// initial global count
	useEffect(() => {
		getCount().then(setCount);
	}, []);

	// animate the counter readout when it changes
	useEffect(() => {
		if (counterRef.current) tickCounter(counterRef.current, 0, count);
	}, [count]);

	// timer: tick each second while playing (disabled in dev mode)
	useEffect(() => {
		if (state.phase !== "playing" || dev) return;
		const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
		return () => clearInterval(id);
	}, [state.phase, dev]);

	// after a card is added, fly it in and reflow the rest
	useLayoutEffect(() => {
		if (!pendingFlip.current || !wallRef.current || !inputRef.current) return;
		const newest = wallRef.current.firstElementChild as HTMLElement | null;
		if (newest) flyCardIn(newest, inputRef.current);
		reflow(pendingFlip.current);
		if (wallRef.current) wallRef.current.scrollLeft = 0;
		pendingFlip.current = null;
	}, [state.named]);

	function onChange() {
		// first keystroke starts the round and docks the input to the bottom
		if (state.phase === "idle" && (inputRef.current?.value.length ?? 0) > 0) {
			const el = inputRef.current;
			if (el) dockInput(el, () => containerRef.current?.setAttribute("data-phase", "playing"));
			dispatch({ type: "START" });
		}
	}

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		const el = inputRef.current;
		if (!el || !index || state.phase === "over") return;
		const value = el.value.trim();
		if (!value) return;
		el.value = "";
		setMessage("");

		const namedIds = new Set(state.named.map((n) => n.id));
		const g = resolveGuess(value, index, namedIds);
		if (g.kind === "accept") {
			pendingFlip.current = captureCards([...(wallRef.current?.children ?? [])]);
			dispatch({ type: "ACCEPT", woman: { id: g.woman.id, title: g.woman.name } });
			// fire-and-forget global write; fail-open
			reportDiscovery(g.woman.id, value)
				.then((r) => setCount(r.count))
				.catch(() => {});
		} else if (g.kind === "ambiguous") {
			setMessage("too common");
			rejectShake(el);
		} else if (g.kind === "none") {
			setMessage("not found");
			rejectShake(el);
		}
		// duplicate: soft no-op
	}

	function playAgain() {
		dispatch({ type: "RESET" });
		setMessage("");
		containerRef.current?.setAttribute("data-phase", "idle");
		inputRef.current?.focus();
	}

	const mm = String(Math.floor(state.timeLeft / 60));
	const ss = String(state.timeLeft % 60).padStart(2, "0");

	return (
		<main
			ref={containerRef}
			data-phase="idle"
			className="relative flex min-h-svh flex-col bg-slate-900 px-5 data-[phase=idle]:items-center data-[phase=idle]:justify-center sm:px-10 lg:px-20"
		>
			{/* corner readouts */}
			<div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-5 text-sm text-slate-400">
				<span>
					<span ref={counterRef}>0</span> of {total.toLocaleString()} named
				</span>
				{state.phase !== "idle" && (
					<span className="flex gap-4 tabular-nums">
						<span>
							{mm}:{ss}
						</span>
						<span>★ {state.named.length}</span>
					</span>
				)}
			</div>

			{/* card wall (top row) */}
			<div
				ref={wallRef}
				className="flex flex-1 flex-row flex-nowrap items-center gap-3 overflow-x-auto pt-16 [perspective:900px] data-[phase=idle]:hidden"
			>
				{state.named.map((n) => (
					<Card key={n.id} title={n.title} />
				))}
			</div>

			{/* input */}
			<form onSubmit={onSubmit} className="w-full data-[phase=playing]:pb-10">
				<input
					ref={inputRef}
					className={inputClass}
					type="text"
					name="name"
					placeholder="Name a woman"
					autoComplete="off"
					disabled={!ready || state.phase === "over"}
					onChange={onChange}
				/>
				{message && <p className="mt-2 text-sm text-slate-500">{message}</p>}
			</form>

			{/* game over overlay */}
			{state.phase === "over" && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/90">
					<p className="text-2xl text-slate-300">Time! You named</p>
					<p className="text-8xl text-slate-100">{state.named.length}</p>
					<button
						type="button"
						onClick={playAgain}
						className="rounded-full bg-slate-100 px-6 py-2 text-slate-900 transition-transform active:scale-95"
					>
						Play Again
					</button>
				</div>
			)}
		</main>
	);
}
```

NOTE: the `data-[phase=…]` Tailwind variants drive the idle-vs-playing layout (idle centers the input and hides the wall; playing reveals the top row and docks the input). `dockInput` animates the transition. Exact positioning is tuned during visual verification on `main`.

- [ ] **Step 3: Rewire `index.astro` to the island**

Replace the entire file `src/pages/index.astro` with:

```astro
---
import Layout from "../layouts/Layout.astro";
import { Game } from "@/game/Game";
---

<Layout title="Name a Woman">
	<Game client:load />
</Layout>
```

(Removes the `<form>`/`<Input>` markup and the Supabase `<script>` block entirely — the island owns all of it.)

- [ ] **Step 4: Remove Supabase**

Confirm nothing else imports it, then delete and uninstall:

```bash
grep -rn "supabase" src/ astro.config.mjs 2>/dev/null
```
Expected: no remaining references outside `src/lib/supabase.ts` itself.

```bash
git rm src/lib/supabase.ts
bun remove @supabase/supabase-js
```

If `grep` shows other references (e.g. `src/env.d.ts` `PUBLIC_SUPABASE_*` types), remove those lines too.

- [ ] **Step 5: Verify build + full suite + lint**

Run: `bun run build`
Expected: exit 0, no type errors, static page emitted.

Run: `bun test`
Expected: all prior tests + the new `src/game/*.test.ts` pass.

Run: `bunx biome check src/game src/pages src/layouts`
Expected: no errors (apply `--write` if only formatting differs).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(c): game island, local match wiring, remove Supabase"
```

---

## Post-merge (visual verification on `main`)

Per the project convention, the card-fly, the idle→playing input dock, the wall reflow, the timer sweep, and the game-over overlay are eyeballed on `main` after merge (the single dev server runs there). Iterate on `main` if the visual pass finds issues:

- `bun run dev`, open the page, confirm: first keystroke docks the input + starts the clock; accepted names fly a card from the input into the top row; the rest ripple right; rejects shake with "too common"/"not found"; `?dev` freezes the timer; `0:00` shows the overlay; Play Again resets.
