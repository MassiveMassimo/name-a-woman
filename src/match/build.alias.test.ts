import { expect, test } from "bun:test";
import { buildIndex, isRelationalAlias } from "./build";
import { match } from "./match";
import type { WomanRecord } from "./types";

test("flags possessive and relational aliases, keeps real names", () => {
	expect(isRelationalAlias("Miley Cyrus's mom")).toBe(true);
	expect(isRelationalAlias("wife of Sir Michael Wood")).toBe(true);
	expect(isRelationalAlias("Sarina Esmailzadeh's death")).toBe(true);
	expect(isRelationalAlias("daughter of Li Xian")).toBe(true);
	// real names — including a legitimate "of" that is not relational
	expect(isRelationalAlias("Joan of Arc")).toBe(false);
	expect(isRelationalAlias("Catherine of Aragon")).toBe(false);
	expect(isRelationalAlias("Madame Curie")).toBe(false);
});

test("a relational alias does not make the famous relative matchable", () => {
	const records: WomanRecord[] = [
		{
			id: 4405278,
			name: "Tish Cyrus",
			aliases: ["Miley Cyrus's mom"],
			notability: 10,
		},
	];
	const idx = buildIndex(records);
	// The junk alias is dropped, so "miley cyrus" must not land on her mother.
	expect(match("miley cyrus", idx).status).toBe("none");
	// The real name still resolves.
	const r = match("tish cyrus", idx);
	expect(r.status).toBe("matched");
});
