import { expect, test } from "bun:test";
import { buildIndex } from "./build";
import { match } from "./match";
import { parseRecords, serializeRecords } from "./serialize";
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

test("round-trips records exactly", () => {
	expect(parseRecords(serializeRecords(records))).toEqual(records);
});

test("a parsed-and-rebuilt index still matches", () => {
	const idx = buildIndex(parseRecords(serializeRecords(records)));
	const r = match("Megawati", idx);
	expect(r.status === "matched" && r.woman.id).toBe(1);
});
