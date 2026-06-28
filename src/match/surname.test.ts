import { expect, test } from "bun:test";
import { surnameForms } from "./surname";

test("derives the last token as the surname", () => {
	expect(surnameForms("Marie Curie")).toEqual(["curie"]);
	expect(surnameForms("Ada Lovelace")).toEqual(["lovelace"]);
	expect(surnameForms("Margaret Thatcher")).toEqual(["thatcher"]);
});

test("ignores middle names (surname is the trailing token only)", () => {
	expect(surnameForms("Mary Jane Watson")).toEqual(["watson"]);
	expect(surnameForms("J. K. Rowling")).toEqual(["rowling"]);
});

test("keeps nobiliary particles AND exposes the bare surname", () => {
	expect(surnameForms("Daphne du Maurier")).toEqual(["du maurier", "maurier"]);
	expect(surnameForms("Simone de Beauvoir")).toEqual([
		"de beauvoir",
		"beauvoir",
	]);
	expect(surnameForms("Maria von Trapp")).toEqual(["von trapp", "trapp"]);
});

test("returns nothing for mononyms / single-token names", () => {
	expect(surnameForms("Cher")).toEqual([]);
	expect(surnameForms("Madonna")).toEqual([]);
});

test("skips surnames shorter than the floor", () => {
	expect(surnameForms("Yoko Wu")).toEqual([]); // "wu" too short
	expect(surnameForms("Yoko Ono")).toEqual(["ono"]); // 3 chars ok
});

test("never consumes the given name as a particle", () => {
	// "de" leads, but it is the given-name slot, so the surname is still "cruz"
	expect(surnameForms("De La Cruz")).toEqual(["la cruz", "cruz"]);
});

test("folds diacritics like the rest of the engine", () => {
	expect(surnameForms("Penélope Cruz")).toEqual(["cruz"]);
});
