import { expect, test } from "bun:test";
import { bucketKey, buildIndex, SURNAME_MIN_NOTABILITY } from "./build";
import type { WomanRecord } from "./types";

const records: WomanRecord[] = [
	{
		id: 1,
		name: "Megawati Sukarnoputri",
		aliases: ["Megawati"],
		notability: 5000,
	},
	{ id: 2, name: "Marie Curie", aliases: [], notability: 90000 },
];

test("bucketKey is the first normalized char", () => {
	expect(bucketKey("megawati")).toBe("m");
	expect(bucketKey("")).toBe("");
});

test("indexes every name and alias as a normalized entry", () => {
	const idx = buildIndex(records);
	const m = idx.buckets.get("m") ?? [];
	const forms = m.map((e) => e.form).sort();
	expect(forms).toEqual(["marie curie", "megawati", "megawati sukarnoputri"]);
});

test("each bucket is sorted by notability descending", () => {
	const idx = buildIndex(records);
	const m = idx.buckets.get("m") ?? [];
	expect(m[0].form).toBe("marie curie"); // notability 90000 first
});

test("byId resolves full records", () => {
	const idx = buildIndex(records);
	expect(idx.byId.get(1)?.name).toBe("Megawati Sukarnoputri");
});

test("marks the article-title form primary and aliases non-primary", () => {
	const idx = buildIndex(records);
	const m = idx.buckets.get("m") ?? [];
	expect(m.find((e) => e.form === "megawati sukarnoputri")?.primary).toBe(true);
	expect(m.find((e) => e.form === "megawati")?.primary).toBe(false);
});

test("generates a non-primary surname form for notable women", () => {
	const idx = buildIndex([
		{ id: 1, name: "Ada Lovelace", aliases: [], notability: 100 },
	]);
	const surname = (idx.buckets.get("l") ?? []).find(
		(e) => e.form === "lovelace",
	);
	expect(surname?.id).toBe(1);
	expect(surname?.primary).toBe(false);
});

test("does not generate surname forms below the notability floor", () => {
	const idx = buildIndex([
		{
			id: 1,
			name: "Obscure Person",
			aliases: [],
			notability: SURNAME_MIN_NOTABILITY - 1,
		},
	]);
	expect((idx.buckets.get("p") ?? []).some((e) => e.form === "person")).toBe(
		false,
	);
});

test("does not generate a surname form for mononyms", () => {
	const idx = buildIndex([
		{ id: 1, name: "Cher", aliases: [], notability: 100 },
	]);
	// the only form is the title itself; no spurious extra entry
	const all = [...idx.buckets.values()].flat();
	expect(all).toHaveLength(1);
});
