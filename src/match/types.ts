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
};

export type MatchIndex = {
	byId: Map<number, WomanRecord>;
	buckets: Map<string, IndexEntry[]>;
};
