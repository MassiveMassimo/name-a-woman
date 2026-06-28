// src/match/match.typo.test.ts
import { expect, test } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
	{
		id: 3,
		name: "Elizabeth Taylor",
		aliases: ["Liz Taylor"],
		notability: 80000,
	},
	{ id: 2, name: "Marie Curie", aliases: [], notability: 90000 },
	{ id: 4, name: "Alexis Penny Casdagli", aliases: [], notability: 100 },
	{ id: 5, name: "Megawati Sukarnoputri", aliases: [], notability: 9000 },
	{ id: 6, name: "Megawati Manan", aliases: [], notability: 3 },
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

test("a keyboard smash does not fuzzy-match a fragment of a long name", () => {
	// "asdfg" lands inside "...casdagli" as a fuzzy fragment; the length guard
	// must reject it rather than returning Alexis Penny Casdagli.
	expect(match("asdfg", idx).status).not.toBe("matched");
});

test("a mononym matches the dominant full name it prefixes", () => {
	// "megawati" anchors the start of "Megawati Sukarnoputri" (notability-
	// dominant over Megawati Manan), so it must still resolve, not be dropped
	// by the fragment guard.
	const r = match("Megawati", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(5);
});
