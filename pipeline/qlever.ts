export const QLEVER_ENDPOINT = "https://qlever.cs.uni-freiburg.de/api/wikidata";

export const WOMEN_QUERY = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?item ?title ?sitelinks ?alt WHERE {
  ?item wdt:P31 wd:Q5 ;
        wdt:P21 ?gender ;
        wikibase:sitelinks ?sitelinks .
  VALUES ?gender { wd:Q6581072 wd:Q1052281 }
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> ;
           schema:name ?title .
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
}`;

export type RawRow = {
	qid: string;
	title: string;
	sitelinks: number;
	alt: string | null;
};

type Binding = Record<string, { value: string } | undefined>;

export function parseSparqlBindings(json: unknown): RawRow[] {
	const bindings =
		(json as { results?: { bindings?: Binding[] } })?.results?.bindings ?? [];
	return bindings.map((b) => ({
		qid: (b.item?.value ?? "").replace("http://www.wikidata.org/entity/", ""),
		title: b.title?.value ?? "",
		sitelinks: Number(b.sitelinks?.value ?? 0),
		alt: b.alt?.value ?? null,
	}));
}

export async function fetchWomenRows(
	endpoint: string = QLEVER_ENDPOINT,
): Promise<RawRow[]> {
	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/sparql-query",
			Accept: "application/sparql-results+json",
		},
		body: WOMEN_QUERY,
	});
	if (!res.ok) throw new Error(`QLever ${res.status}: ${await res.text()}`);
	return parseSparqlBindings(await res.json());
}
