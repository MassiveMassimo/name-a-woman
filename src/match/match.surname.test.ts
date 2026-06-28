// src/match/match.surname.test.ts
// Generated surname forms are exact-match anchors: a surname resolves its bearer
// when typed exactly, but a common word that merely prefixes or sits one edit
// from a surname must not leak.
import { expect, test } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
	{ id: 1, name: "Szimonetta Planeta", aliases: [], notability: 100 },
	{ id: 2, name: "Lucile Randon", aliases: [], notability: 100 },
	{ id: 3, name: "Daphne du Maurier", aliases: [], notability: 100 },
];
const idx = buildIndex(records);

test("an exact surname resolves its bearer", () => {
	const r = match("randon", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(2);
});

test("a particle surname and its bare token both resolve", () => {
	expect(match("du maurier", idx).status).toBe("matched");
	expect(match("maurier", idx).status).toBe("matched");
});

test("a common word that prefixes a surname does not match", () => {
	// "planet" is a strict prefix of the surname "planeta" — must not leak.
	expect(match("planet", idx).status).not.toBe("matched");
});

test("a common word one edit from a surname does not fuzzy-match", () => {
	// "random" is one substitution from the surname "randon" — must not leak.
	expect(match("random", idx).status).not.toBe("matched");
});
