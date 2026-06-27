import { expect, test } from "bun:test";
import type { WomanRecord } from "@/match";
import { buildManifest } from "./manifest";

const recs: WomanRecord[] = [
	{ id: 7186, name: "Marie Curie", aliases: [], notability: 180 },
	{
		id: 1234,
		name: "Megawati Sukarnoputri",
		aliases: ["Megawati"],
		notability: 60,
	},
];

test("manifest reports count, fixed source and schema, and the passed timestamp", () => {
	const m = buildManifest(recs, "2026-06-27T00:00:00.000Z");
	expect(m).toEqual({
		count: 2,
		generatedAt: "2026-06-27T00:00:00.000Z",
		source: "wikidata-qlever",
		schema: 1,
	});
});
