// The final acknowledge stage: a recognized person excluded from the women index
// by gender identity resolves to status "excluded" (carrying their label),
// strictly after every woman stage has missed.
import { expect, test } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import type { ExcludedRecord, WomanRecord } from "./types";

const women: WomanRecord[] = [
	{ id: 7186, name: "Marie Curie", aliases: [], notability: 200 },
	// shares a name with an excluded person below — the woman must win
	{ id: 1, name: "Sam Smith", aliases: [], notability: 50 },
];
const excluded: ExcludedRecord[] = [
	{ name: "Miley Cyrus", aliases: ["Miley"], gender: "genderfluid" },
	{ name: "Sam Smith", aliases: [], gender: "non-binary" },
];
const idx = buildIndex(women, excluded);

test("an excluded person resolves to status excluded with their label", () => {
	const r = match("Miley Cyrus", idx);
	expect(r.status).toBe("excluded");
	if (r.status === "excluded") {
		expect(r.name).toBe("Miley Cyrus");
		expect(r.gender).toBe("genderfluid");
	}
});

test("an excluded alias also resolves", () => {
	expect(match("miley", idx).status).toBe("excluded");
});

test("a woman wins over an excluded person sharing the name", () => {
	const r = match("Sam Smith", idx);
	expect(r.status).toBe("matched");
	if (r.status === "matched") expect(r.woman.id).toBe(1);
});

test("a real woman still resolves, not shadowed by the excluded stage", () => {
	expect(match("Marie Curie", idx).status).toBe("matched");
});

test("an unknown query is still a plain miss", () => {
	expect(match("zzzznope qqq", idx).status).toBe("none");
});

test("the excluded stage is opt-in: no excluded records → never fires", () => {
	const bare = buildIndex(women);
	expect(match("Miley Cyrus", bare).status).toBe("none");
});
