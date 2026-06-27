import type { WomanRecord } from "./types";

// Column-oriented compact form keeps the payload small and brotli-friendly:
// parallel arrays instead of repeated object keys.
type Columns = {
	id: number[];
	name: string[];
	aliases: string[][];
	notability: number[];
};

export function serializeRecords(records: WomanRecord[]): string {
	const cols: Columns = { id: [], name: [], aliases: [], notability: [] };
	for (const r of records) {
		cols.id.push(r.id);
		cols.name.push(r.name);
		cols.aliases.push(r.aliases);
		cols.notability.push(r.notability);
	}
	return JSON.stringify(cols);
}

export function parseRecords(text: string): WomanRecord[] {
	const cols = JSON.parse(text) as Columns;
	const out: WomanRecord[] = [];
	for (let i = 0; i < cols.id.length; i++) {
		out.push({
			id: cols.id[i],
			name: cols.name[i],
			aliases: cols.aliases[i],
			notability: cols.notability[i],
		});
	}
	return out;
}
