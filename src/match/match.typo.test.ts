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
