import { describe, expect, it } from "bun:test";
import { fetchSummary } from "./summary";

function mockFetch(status: number, body: unknown): typeof fetch {
	return (async (url: string) => {
		void url;
		return {
			ok: status >= 200 && status < 300,
			status,
			json: async () => body,
		} as Response;
	}) as unknown as typeof fetch;
}

describe("fetchSummary", () => {
	it("returns thumb + extract from a summary response", async () => {
		const f = mockFetch(200, {
			extract: "A physicist and chemist.",
			thumbnail: { source: "https://example.org/curie.jpg" },
		});
		const s = await fetchSummary("Marie Curie", f);
		expect(s.thumb).toBe("https://example.org/curie.jpg");
		expect(s.extract).toBe("A physicist and chemist.");
	});

	it("returns null thumb when no thumbnail is present", async () => {
		const f = mockFetch(200, { extract: "No image here." });
		const s = await fetchSummary("Someone", f);
		expect(s.thumb).toBeNull();
		expect(s.extract).toBe("No image here.");
	});

	it("fails open to nulls on a non-ok response", async () => {
		const s = await fetchSummary("Missing", mockFetch(404, {}));
		expect(s).toEqual({ thumb: null, extract: null });
	});

	it("fails open to nulls when fetch throws", async () => {
		const throwing = (async () => {
			throw new Error("network");
		}) as unknown as typeof fetch;
		const s = await fetchSummary("X", throwing);
		expect(s).toEqual({ thumb: null, extract: null });
	});

	it("URL-encodes the title", async () => {
		let seen = "";
		const f = (async (url: string) => {
			seen = url;
			return { ok: true, status: 200, json: async () => ({}) } as Response;
		}) as unknown as typeof fetch;
		await fetchSummary("Frida Kahlo", f);
		expect(seen).toContain("Frida%20Kahlo");
	});
});
