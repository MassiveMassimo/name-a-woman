import { normalize } from "./normalize";
import { surnameForms } from "./surname";
import type { IndexEntry, MatchIndex, WomanRecord } from "./types";

export function bucketKey(form: string): string {
	return form.length === 0 ? "" : form[0];
}

// Surname-only forms ("rowling", "curie") are generated only for women notable
// enough to be recalled by surname alone. Surname recall is inherently a
// famous-woman gesture; gating here keeps the index ~10% leaner and stops obscure
// word-surnames from making random words typable. Resolution among same-surname
// bearers is left to match()'s dominance/ambiguity logic.
export const SURNAME_MIN_NOTABILITY = 10;

export function buildIndex(records: WomanRecord[]): MatchIndex {
	const byId = new Map<number, WomanRecord>();
	const buckets = new Map<string, IndexEntry[]>();

	for (const r of records) {
		byId.set(r.id, r);
		// The article title (r.name) is the primary form; aliases are secondary.
		// A form that equals the normalized title is marked primary even when it
		// also appears among the aliases.
		const nameForm = normalize(r.name);
		// form -> isSurnameOnly. A name/alias always wins over a surname tag, so a
		// surname that coincides with a real alias keeps full prefix/fuzzy behavior.
		const forms = new Map<string, boolean>();
		const addForm = (f: string, surname: boolean) => {
			if (!f) return;
			if (!forms.has(f)) forms.set(f, surname);
			else if (!surname) forms.set(f, false);
		};
		addForm(nameForm, false);
		for (const a of r.aliases) addForm(normalize(a), false);
		if (r.notability >= SURNAME_MIN_NOTABILITY) {
			for (const s of surnameForms(r.name)) addForm(s, true);
		}
		for (const [form, surname] of forms) {
			const key = bucketKey(form);
			const entry: IndexEntry = {
				form,
				id: r.id,
				notability: r.notability,
				primary: form === nameForm,
				surname,
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
