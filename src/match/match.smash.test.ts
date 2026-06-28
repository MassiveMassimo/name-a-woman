// src/match/match.smash.test.ts
// Keyboard-smash guard: a short query with no exact form that merely
// strict-prefixes an obscure name must not leak a false match. Real partials
// (>= MIN_INEXACT_LEN) and exact mononyms of any length still resolve.
import { expect, test } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
	// Two obscure women whose names strict-prefix the smash "asd"; one dominates
	// the other by the dominance margin. No woman is titled/aliased exactly "asd".
	{ id: 1, name: "Asdis Hjalms", aliases: [], notability: 15 },
	{ id: 2, name: "Asdis Thorr", aliases: [], notability: 7 },
	// A short exact mononym (title is exactly "Mia") plus a longer namesake.
	{ id: 3, name: "Mia", aliases: [], notability: 50 },
	{ id: 4, name: "Mia Khalifa", aliases: [], notability: 10 },
	// A dominant partial: "opra" strict-prefixes a single famous bearer.
	{ id: 5, name: "Oprah Winfrey", aliases: ["Oprah"], notability: 134 },
	// An obscure name one edit from the smash "dac" (sub) but not a prefix of it.
	{ id: 6, name: "Dax", aliases: [], notability: 12 },
];
const idx = buildIndex(records);

test("a 3-char smash that only strict-prefixes obscure names does not match", () => {
	expect(match("asd", idx).status).not.toBe("matched");
});

test("a short exact mononym still matches its bearer", () => {
	const r = match("Mia", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(3);
});

test("a 3-char smash one edit from an obscure name does not fuzzy-match", () => {
	expect(match("dac", idx).status).not.toBe("matched");
});

test("a >=4-char partial of a famous name still resolves", () => {
	const r = match("opra", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(5);
});
