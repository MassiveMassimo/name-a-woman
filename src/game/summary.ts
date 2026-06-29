export interface Summary {
	thumb: string | null;
	extract: string | null;
}

const SUMMARY_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const WIKIDATA_ENDPOINT = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const THUMB_WIDTH = 640;

// Resolve a Commons filename to a direct upload.wikimedia.org URL. The
// Special:FilePath convenience link 302-redirects cross-host without CORS
// headers, so an Image loaded with crossOrigin="anonymous" fails the CORS check
// on the redirect and never fires onload — the particle field morph, which
// reads pixels via getImageData, would silently break. The Commons API
// (origin=*) returns the final thumburl, which upload.wikimedia.org serves with
// Access-Control-Allow-Origin: *. Fail-open: any error yields null.
async function resolveCommonsUrl(
	file: string,
	fetchImpl: typeof fetch,
): Promise<string | null> {
	try {
		const params = new URLSearchParams({
			action: "query",
			titles: `File:${file}`,
			prop: "imageinfo",
			iiprop: "url",
			iiurlwidth: String(THUMB_WIDTH),
			format: "json",
			origin: "*",
		});
		const res = await fetchImpl(`${COMMONS_API}?${params}`);
		if (!res.ok) return null;
		const data = (await res.json()) as {
			query?: {
				pages?: Record<
					string,
					{ imageinfo?: { thumburl?: string; url?: string }[] }
				>;
			};
		};
		const info = Object.values(data.query?.pages ?? {})[0]?.imageinfo?.[0];
		return info?.thumburl ?? info?.url ?? null;
	} catch {
		return null;
	}
}

// Wikidata's "image" (P18) is hand-curated, so it is a real portrait. The REST
// summary thumbnail is driven by Wikipedia's PageImages heuristic, which often
// mis-picks a non-portrait lead file (a signature, logo, flag, or coat of arms —
// e.g. Pokimane's signature SVG). Prefer P18, keyed by the woman's Wikidata QID
// (the index `id`); resolve the filename to a CORS-safe direct URL, and fall
// back to the summary thumbnail. Fail-open.
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
		return await resolveCommonsUrl(file, fetchImpl);
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
