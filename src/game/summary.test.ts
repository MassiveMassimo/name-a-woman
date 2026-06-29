import { describe, expect, it } from "bun:test";
import { fetchSummary } from "./summary";

// Route by endpoint: Wikidata (P18 portrait) vs Wikipedia REST summary.
function router(opts: {
	summaryStatus?: number;
	summaryBody?: unknown;
	wikidataStatus?: number;
	wikidataBody?: unknown;
	onUrl?: (u: string) => void;
}): typeof fetch {
	const {
		summaryStatus = 200,
		summaryBody = {},
		wikidataStatus = 200,
		wikidataBody = {},
		onUrl,
	} = opts;
	return (async (url: string) => {
		onUrl?.(url);
		const isWd = url.includes("wikidata.org");
		const status = isWd ? wikidataStatus : summaryStatus;
		return {
			ok: status >= 200 && status < 300,
			status,
			json: async () => (isWd ? wikidataBody : summaryBody),
		} as Response;
	}) as unknown as typeof fetch;
}

const p18 = (file: string) => ({
	claims: { P18: [{ mainsnak: { datavalue: { value: file } } }] },
});

describe("fetchSummary", () => {
	it("prefers the Wikidata P18 portrait over the summary thumbnail", async () => {
		const f = router({
			summaryBody: {
				extract: "A physicist.",
				thumbnail: { source: "https://example.org/sig.svg.png" },
			},
			wikidataBody: p18("Marie Curie portrait.jpg"),
		});
		const s = await fetchSummary("Marie Curie", 7186, f);
		expect(s.thumb).toContain("Special:FilePath/Marie%20Curie%20portrait.jpg");
		expect(s.extract).toBe("A physicist.");
	});

	it("falls back to the summary thumbnail when no P18 exists", async () => {
		const f = router({
			summaryBody: {
				extract: "x",
				thumbnail: { source: "https://example.org/curie.jpg" },
			},
			wikidataBody: { claims: {} },
		});
		const s = await fetchSummary("Marie Curie", 7186, f);
		expect(s.thumb).toBe("https://example.org/curie.jpg");
	});

	it("returns null thumb when neither source has an image", async () => {
		const f = router({
			summaryBody: { extract: "No image." },
			wikidataBody: { claims: {} },
		});
		const s = await fetchSummary("Someone", 1, f);
		expect(s.thumb).toBeNull();
		expect(s.extract).toBe("No image.");
	});

	it("P18 is independent of a failed summary fetch", async () => {
		const f = router({ summaryStatus: 404, wikidataBody: p18("Photo.jpg") });
		const s = await fetchSummary("Missing", 1, f);
		expect(s.extract).toBeNull();
		expect(s.thumb).toContain("Photo.jpg");
	});

	it("fails open to nulls when fetch throws", async () => {
		const throwing = (async () => {
			throw new Error("network");
		}) as unknown as typeof fetch;
		const s = await fetchSummary("X", 1, throwing);
		expect(s).toEqual({ thumb: null, extract: null });
	});

	it("URL-encodes the title and queries the QID", async () => {
		const urls: string[] = [];
		const f = router({ onUrl: (u) => urls.push(u) });
		await fetchSummary("Frida Kahlo", 5588, f);
		expect(urls.some((u) => u.includes("Frida%20Kahlo"))).toBe(true);
		expect(urls.some((u) => u.includes("Q5588"))).toBe(true);
	});
});
