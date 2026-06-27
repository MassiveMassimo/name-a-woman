import { expect, test } from "bun:test";
import { normalize } from "./normalize";

test("lowercases and trims", () => {
	expect(normalize("  Marie Curie  ")).toBe("marie curie");
});

test("strips diacritics", () => {
	expect(normalize("Frída Kahló")).toBe("frida kahlo");
});

test("collapses internal whitespace", () => {
	expect(normalize("Marie   Curie")).toBe("marie curie");
});

test("empty and whitespace-only normalize to empty string", () => {
	expect(normalize("   ")).toBe("");
});
