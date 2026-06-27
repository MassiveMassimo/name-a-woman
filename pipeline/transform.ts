import type { WomanRecord } from "@/match";
import type { RawRow } from "./qlever";

export function rowsToRecords(rows: RawRow[]): WomanRecord[] {
	const byId = new Map<
		number,
		{ name: string; notability: number; aliases: Set<string> }
	>();
	const order: number[] = [];

	for (const row of rows) {
		const id = Number(row.qid.replace(/^Q/, ""));
		if (!Number.isInteger(id) || id <= 0) continue;
		let rec = byId.get(id);
		if (!rec) {
			rec = { name: row.title, notability: row.sitelinks, aliases: new Set() };
			byId.set(id, rec);
			order.push(id);
		}
		if (row.alt && row.alt !== row.title) rec.aliases.add(row.alt);
	}

	return order.map((id) => {
		const rec = byId.get(id);
		if (!rec) throw new Error(`Record for id ${id} not found`);
		return {
			id,
			name: rec.name,
			aliases: [...rec.aliases],
			notability: rec.notability,
		};
	});
}
