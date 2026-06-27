import { expect, test } from "bun:test";
import { parseSparqlBindings, WOMEN_QUERY } from "./qlever";

test("query targets humans, both gender values, enwiki sitelink, sitelink count", () => {
	expect(WOMEN_QUERY).toContain("wd:Q5");
	expect(WOMEN_QUERY).toContain("wd:Q6581072");
	expect(WOMEN_QUERY).toContain("wd:Q1052281");
	expect(WOMEN_QUERY).toContain("en.wikipedia.org/");
	expect(WOMEN_QUERY).toContain("wikibase:sitelinks");
});

const fixture = {
	head: { vars: ["item", "title", "sitelinks", "alt"] },
	results: {
		bindings: [
			{
				item: { type: "uri", value: "http://www.wikidata.org/entity/Q7186" },
				title: { type: "literal", value: "Marie Curie" },
				sitelinks: {
					type: "literal",
					datatype: "http://www.w3.org/2001/XMLSchema#int",
					value: "180",
				},
				alt: { type: "literal", value: "Maria Skłodowska-Curie" },
			},
			{
				item: { type: "uri", value: "http://www.wikidata.org/entity/Q7186" },
				title: { type: "literal", value: "Marie Curie" },
				sitelinks: { type: "literal", value: "180" },
				alt: { type: "literal", value: "Madame Curie" },
			},
			{
				// no alt-label binding present
				item: { type: "uri", value: "http://www.wikidata.org/entity/Q1234" },
				title: { type: "literal", value: "Megawati Sukarnoputri" },
				sitelinks: { type: "literal", value: "60" },
			},
		],
	},
};

test("parses bindings into rows; qid stripped, sitelinks numeric, missing alt -> null", () => {
	const rows = parseSparqlBindings(fixture);
	expect(rows).toEqual([
		{
			qid: "Q7186",
			title: "Marie Curie",
			sitelinks: 180,
			alt: "Maria Skłodowska-Curie",
		},
		{ qid: "Q7186", title: "Marie Curie", sitelinks: 180, alt: "Madame Curie" },
		{ qid: "Q1234", title: "Megawati Sukarnoputri", sitelinks: 60, alt: null },
	]);
});
