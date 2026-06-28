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

test("folds non-decomposable Latin letters to ASCII", () => {
	expect(normalize("Björk Guðmundsdóttir")).toBe("bjork gudmundsdottir");
	expect(normalize("Dorota Łoboda")).toBe("dorota loboda");
	expect(normalize("Pitsi Høegh")).toBe("pitsi hoegh");
	expect(normalize("Đỗ Thị Hà")).toBe("do thi ha");
	expect(normalize("Anke Eißmann")).toBe("anke eissmann");
});

test("empty and whitespace-only normalize to empty string", () => {
	expect(normalize("   ")).toBe("");
});
