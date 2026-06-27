import type { WomanRecord } from "@/match";

export type Manifest = {
	count: number;
	generatedAt: string;
	source: string;
	schema: number;
};

export function buildManifest(
	records: WomanRecord[],
	generatedAt: string,
): Manifest {
	return {
		count: records.length,
		generatedAt,
		source: "wikidata-qlever",
		schema: 1,
	};
}
