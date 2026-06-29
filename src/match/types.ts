export type WomanRecord = {
	id: number;
	name: string;
	aliases: string[];
	notability: number;
};

// A notable person excluded from the women index by gender identity. Matched
// exactly (name + aliases) so the game can acknowledge them rather than return a
// blank no-match. `gender` is a human-readable label ("genderfluid").
export type ExcludedRecord = {
	name: string;
	aliases: string[];
	gender: string;
};

export type IndexEntry = {
	form: string; // normalized name or alias
	id: number;
	notability: number;
	primary: boolean; // form derives from the article title (vs an alias)
	surname: boolean; // generated surname-only form: matched exactly, never by prefix/fuzzy
};

export type MatchIndex = {
	byId: Map<number, WomanRecord>;
	buckets: Map<string, IndexEntry[]>;
	// Phonetic-key → notable bearers, for the last-resort phonetic stage.
	phonetic: Map<string, IndexEntry[]>;
	// Normalized name/alias → excluded person, for the final acknowledge stage.
	excluded: Map<string, { name: string; gender: string }>;
};
