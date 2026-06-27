import { normalize } from "./normalize";
import type { IndexEntry, MatchIndex, WomanRecord } from "./types";

export function bucketKey(form: string): string {
	return form.length === 0 ? "" : form[0];
}

export function buildIndex(records: WomanRecord[]): MatchIndex {
	const byId = new Map<number, WomanRecord>();
	const buckets = new Map<string, IndexEntry[]>();

	for (const r of records) {
		byId.set(r.id, r);
		const forms = new Set<string>();
		for (const raw of [r.name, ...r.aliases]) {
			const form = normalize(raw);
			if (form) forms.add(form);
		}
		for (const form of forms) {
			const key = bucketKey(form);
			const entry: IndexEntry = { form, id: r.id, notability: r.notability };
			const bucket = buckets.get(key);
			if (bucket) bucket.push(entry);
			else buckets.set(key, [entry]);
		}
	}

	for (const bucket of buckets.values()) {
		bucket.sort((a, b) => b.notability - a.notability);
	}
	return { byId, buckets };
}
