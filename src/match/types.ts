export type WomanRecord = {
	id: number;
	name: string;
	aliases: string[];
	notability: number;
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
};
