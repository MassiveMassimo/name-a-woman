// src/match/match.test.ts
import { expect, test } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
	{
		id: 1,
		name: "Megawati Sukarnoputri",
		aliases: ["Megawati"],
		notability: 5000,
	},
	{ id: 2, name: "Marie Curie", aliases: [], notability: 90000 },
	{
		id: 3,
		name: "Elizabeth Taylor",
		aliases: ["Liz Taylor"],
		notability: 80000,
	},
	{
		id: 4,
		name: "Elizabeth II",
		aliases: ["Queen Elizabeth II"],
		notability: 95000,
	},
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
