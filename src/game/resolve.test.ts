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
