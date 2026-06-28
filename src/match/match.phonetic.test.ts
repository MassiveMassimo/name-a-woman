// src/match/match.phonetic.test.ts
// The phonetic last-resort stage resolves a full-name guess misspelled across a
// sound-preserving boundary (Catherine/Katharine) that fuzzy can't bridge,
// without overriding exact/field/fuzzy and without firing on single tokens.
import { expect, test } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
	{ id: 1, name: "Katharine Hepburn", aliases: [], notability: 100 },
	{ id: 2, name: "Marilyn Monroe", aliases: [], notability: 100 },
];
const idx = buildIndex(records);

test("a phonetic full-name misspelling resolves the famous bearer", () => {
	const r = match("catherine hepburn", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(1);
});

test("a single-token phonetic guess does not match (too crowded)", () => {
	// "katharine" alone must not phonetic-resolve.
	expect(match("catherine", idx).status).not.toBe("matched");
});

test("multi-token nonsense stays unmatched", () => {
	expect(match("random nonsense words", idx).status).toBe("none");
});

test("an exact name still resolves directly, not via phonetics", () => {
	const r = match("Marilyn Monroe", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(2);
});
