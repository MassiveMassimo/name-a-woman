import { describe, expect, it } from "bun:test";
import { isDevMode } from "./dev";

describe("isDevMode", () => {
	it("is true when ?dev is present", () => {
		expect(isDevMode("?dev")).toBe(true);
		expect(isDevMode("?foo=1&dev")).toBe(true);
		expect(isDevMode("?dev=1")).toBe(true);
	});
	it("is false otherwise", () => {
		expect(isDevMode("")).toBe(false);
		expect(isDevMode("?foo=1")).toBe(false);
	});
});
