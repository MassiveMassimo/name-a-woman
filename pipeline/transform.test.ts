import { expect, test } from "bun:test";
import { buildIndex, match } from "@/match";
import type { RawRow } from "./qlever";
import { rowsToRecords } from "./transform";

const rows: RawRow[] = [
	{ qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Madame Curie" },
	{ qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Madame Curie" }, // dup alias
	{ qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Marie Curie" }, // alias == name, drop
	{
		qid: "Q1234",
		title: "Megawati Sukarnoputri",
		sitelinks: 60,
		alt: "Megawati",
	},
	{ qid: "Q9999", title: "Jane Doe", sitelinks: 3, alt: null }, // no aliases
];

test("groups by qid, parses numeric id, dedups aliases, drops empty + name-equal", () => {
	const recs = rowsToRecords(rows);
	expect(recs).toEqual([
		{
			id: 7186,
			name: "Marie Curie",
			aliases: ["Madame Curie"],
			notability: 180,
		},
		{
			id: 1234,
			name: "Megawati Sukarnoputri",
			aliases: ["Megawati"],
			notability: 60,
		},
		{ id: 9999, name: "Jane Doe", aliases: [], notability: 3 },
	]);
});

test("the built index resolves a name and an alias", () => {
	const idx = buildIndex(rowsToRecords(rows));
	expect(match("Marie Curie", idx).status).toBe("matched");
	const m = match("Megawati", idx);
	expect(m.status === "matched" && m.woman.id).toBe(1234);
});
