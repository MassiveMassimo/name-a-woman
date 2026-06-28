export interface Summary {
	thumb: string | null;
	extract: string | null;
}

const ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary/";

// Lazy per-card fetch of photo + extract. Display-only and fail-open: any
// error yields nulls so the card still renders name (+ fallback image).
export async function fetchSummary(
	title: string,
	fetchImpl: typeof fetch = fetch,
): Promise<Summary> {
	try {
		const res = await fetchImpl(ENDPOINT + encodeURIComponent(title));
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
}
