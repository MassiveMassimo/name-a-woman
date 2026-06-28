import { expect, test } from "bun:test";
import { bucketKey, buildIndex } from "./build";
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
