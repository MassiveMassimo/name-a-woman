export interface Summary {
	thumb: string | null;
	extract: string | null;
}

const SUMMARY_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const WIKIDATA_ENDPOINT = "https://www.wikidata.org/w/api.php";
const COMMONS_FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const THUMB_WIDTH = 640;

// Wikidata's "image" (P18) is hand-curated, so it is a real portrait. The REST
// summary thumbnail is driven by Wikipedia's PageImages heuristic, which often
// mis-picks a non-portrait lead file (a signature, logo, flag, or coat of arms —
// e.g. Pokimane's signature SVG). Prefer P18, keyed by the woman's Wikidata QID
// (the index `id`); fall back to the summary thumbnail. Returns a Commons thumb
// URL or null. Fail-open.
async function fetchPortrait(
	id: number,
	fetchImpl: typeof fetch,
): Promise<string | null> {
	try {
		const url = `${WIKIDATA_ENDPOINT}?action=wbgetclaims&entity=Q${id}&property=P18&format=json&origin=*`;
		const res = await fetchImpl(url);
		if (!res.ok) return null;
		const data = (await res.json()) as {
			claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] };
		};
		const file = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
		if (!file) return null;
		return `${COMMONS_FILEPATH}${encodeURIComponent(file)}?width=${THUMB_WIDTH}`;
	} catch {
		return null;
	}
}

// Lazy per-card fetch of photo + extract. Display-only and fail-open: any error
// yields nulls so the card still renders name (+ fallback image). The portrait
// (P18) and the summary (extract + fallback thumb) are fetched in parallel.
export async function fetchSummary(
	title: string,
	id: number,
	fetchImpl: typeof fetch = fetch,
): Promise<Summary> {
	const summary = (async (): Promise<Summary> => {
		try {
			const res = await fetchImpl(SUMMARY_ENDPOINT + encodeURIComponent(title));
			if (!res.ok) return { thumb: null, extract: null };
			const data = (await res.json()) as {
				extract?: string;
				thumbnail?: { source?: string };
			};
			return {
				thumb: data.thumbnail?.source ?? null,
				extract: data.extract ?? null,
			};
		} catch {
			return { thumb: null, extract: null };
		}
	})();

	const [base, portrait] = await Promise.all([
		summary,
		fetchPortrait(id, fetchImpl),
	]);
	return { thumb: portrait ?? base.thumb, extract: base.extract };
}
