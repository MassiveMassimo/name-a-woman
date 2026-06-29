// Notable people excluded from the women index by gender identity, so the game
// can acknowledge them ("recognized, but doesn't count") instead of a blank
// no-match. Scope is the non-binary / genderfluid umbrella only — the identities
// a player might reasonably expect to count. Cis men and trans men are men and
// simply no-match; trans women are women and live in the main index.
export const EXCLUDED_GENDERS: Record<string, string> = {
	Q48270: "non-binary",
	Q18116794: "genderfluid",
	Q12964198: "genderqueer",
	Q505371: "agender",
};

const VALUES = Object.keys(EXCLUDED_GENDERS)
	.map((q) => `wd:${q}`)
	.join(" ");

export const EXCLUDED_QUERY = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?item ?title ?gender ?alt WHERE {
  ?item wdt:P31 wd:Q5 ;
        wdt:P21 ?gender .
  VALUES ?gender { ${VALUES} }
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> ;
           schema:name ?title .
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
}`;

export type ExcludedRow = {
	qid: string;
	title: string;
	gender: string; // QID
	alt: string | null;
};

type Binding = Record<string, { value: string } | undefined>;

export function parseExcludedBindings(json: unknown): ExcludedRow[] {
	const bindings =
		(json as { results?: { bindings?: Binding[] } })?.results?.bindings ?? [];
	return bindings.map((b) => ({
		qid: (b.item?.value ?? "").replace("http://www.wikidata.org/entity/", ""),
		title: b.title?.value ?? "",
		gender: (b.gender?.value ?? "").replace(
			"http://www.wikidata.org/entity/",
			"",
		),
		alt: b.alt?.value ?? null,
	}));
}

export type ExcludedRecord = {
	id: number;
	name: string;
	aliases: string[];
	gender: string; // human-readable label
};

// Collapse rows (one per alias × gender) into one record per person. The first
// umbrella gender seen wins the label; aliases are deduped and never repeat the
// name.
export function buildExcluded(rows: ExcludedRow[]): ExcludedRecord[] {
	const byQid = new Map<
		string,
		{ name: string; gender: string; aliases: Set<string> }
	>();
	for (const row of rows) {
		if (!row.qid || !row.title) continue;
		let rec = byQid.get(row.qid);
		if (!rec) {
			rec = {
				name: row.title,
				gender: EXCLUDED_GENDERS[row.gender] ?? "non-binary",
				aliases: new Set(),
			};
			byQid.set(row.qid, rec);
		}
		if (row.alt && row.alt !== row.title) rec.aliases.add(row.alt);
	}
	const out: ExcludedRecord[] = [];
	for (const [qid, rec] of byQid) {
		out.push({
			id: Number(qid.replace("Q", "")),
			name: rec.name,
			aliases: [...rec.aliases],
			gender: rec.gender,
		});
	}
	return out;
}

export async function fetchExcludedRows(
	endpoint: string,
): Promise<ExcludedRow[]> {
	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/sparql-query",
			Accept: "application/sparql-results+json",
		},
		body: EXCLUDED_QUERY,
	});
	if (!res.ok) throw new Error(`QLever ${res.status}: ${await res.text()}`);
	return parseExcludedBindings(await res.json());
}
