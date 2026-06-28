import { describe, expect, it } from "bun:test";
import { getCount, reportDiscovery } from "./global";

describe("global stub", () => {
	it("getCount returns a non-negative placeholder discovered count", async () => {
		const c = await getCount();
		expect(typeof c).toBe("number");
		expect(c).toBeGreaterThanOrEqual(0);
	});

	it("reportDiscovery resolves without throwing and returns a count", async () => {
		const r = await reportDiscovery(7186, "Marie Curie");
		expect(typeof r.count).toBe("number");
	});
});
