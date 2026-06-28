// src/match/match.primary.test.ts
// Primary-topic resolution: a bare name resolves to the woman whose article
// TITLE is exactly that name (Wikipedia's primary topic), or to the dominant
// bearer of the field — but a common first name that is merely an obscure
// woman's alias must stay "too common".
import { expect, test } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
	// "Madonna" is the singer's article title → the primary topic, even though
	// another woman's name shares the "madonna" prefix.
	{ id: 1, name: "Madonna", aliases: [], notability: 190 },
	{ id: 2, name: "Madonna Hartley", aliases: [], notability: 4 },
	// No woman is titled exactly "Michelle"; an obscure woman carries it only as
	// an alias, while far more notable Michelles exist as full names.
	{ id: 3, name: "Dambisa (singer)", aliases: ["Michelle"], notability: 5 },
	{ id: 4, name: "Michelle Obama", aliases: [], notability: 135 },
	{ id: 5, name: "Michelle Bachelet", aliases: [], notability: 118 },
	// A dominant mononym whose article title is the full name: resolves via the
	// alias + field dominance, not an exact title.
	{ id: 6, name: "Oprah Winfrey", aliases: ["Oprah"], notability: 134 },
];
const idx = buildIndex(records);

test("a bare name matches the woman titled exactly that (primary topic)", () => {
	const r = match("Madonna", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(1);
});

test("a common first name that is only an alias stays too common", () => {
	// Must NOT resolve to the obscure alias-holder (id 3); the comparably-notable
	// Michelles make it ambiguous.
	expect(match("Michelle", idx).status).toBe("ambiguous");
});

test("the full name still resolves the specific woman", () => {
	const r = match("Michelle Obama", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(4);
});

test("a dominant mononym via alias resolves to its sole bearer", () => {
	const r = match("Oprah", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(6);
});
