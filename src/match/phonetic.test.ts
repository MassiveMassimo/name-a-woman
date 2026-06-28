import { expect, test } from "bun:test";
import { phoneticKey } from "./phonetic";

test("equal phonetic keys for sound-alike spellings", () => {
	expect(phoneticKey("Catherine Hepburn")).toBe(
		phoneticKey("Katharine Hepburn"),
	);
	expect(phoneticKey("Marylin Monroe")).toBe(phoneticKey("Marilyn Monroe"));
});

test("distinct names get distinct keys", () => {
	expect(phoneticKey("Marie Curie")).not.toBe(phoneticKey("Rosa Parks"));
});

test("single-token names return no key", () => {
	expect(phoneticKey("Cher")).toBe("");
	expect(phoneticKey("Madonna")).toBe("");
});
