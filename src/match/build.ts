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
		// The article title (r.name) is the primary form; aliases are secondary.
		// A form that equals the normalized title is marked primary even when it
		// also appears among the aliases.
		const nameForm = normalize(r.name);
		const forms = new Set<string>();
		if (nameForm) forms.add(nameForm);
		for (const a of r.aliases) {
			const form = normalize(a);
			if (form) forms.add(form);
		}
		for (const form of forms) {
			const key = bucketKey(form);
			const entry: IndexEntry = {
				form,
				id: r.id,
				notability: r.notability,
				primary: form === nameForm,
			};
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
