// src/match/match.ts
import uFuzzy from "@leeoniya/ufuzzy";
import { bucketKey } from "./build";
import { normalize } from "./normalize";
import type { IndexEntry, MatchIndex, WomanRecord } from "./types";

// Notability margin: on an exact-name collision the top woman must beat the
// second by this factor to win outright; otherwise the query is ambiguous.
// Tunable — calibrate against a real eval set (spec §2, §10).
export const K = 5;

// Single-edit fuzzy matcher: tolerate one insert, substitute, transpose, or
// delete per term. Constructed once at module load (zero-overhead haystack).
const uf = new uFuzzy({
	intraMode: 1,
	intraIns: 1,
	intraSub: 1,
	intraTrn: 1,
	intraDel: 1,
});

export type MatchResult =
	| { status: "matched"; woman: WomanRecord }
	| { status: "ambiguous" }
	| { status: "none" };

// Reduce candidate entries to the best entry per distinct woman, ranked by
// notability descending. Returns at most one entry per woman id.
function topByWoman(entries: IndexEntry[]): IndexEntry[] {
	const best = new Map<number, IndexEntry>();
	for (const e of entries) {
		const prev = best.get(e.id);
		if (!prev || e.notability > prev.notability) best.set(e.id, e);
	}
	return [...best.values()].sort((a, b) => b.notability - a.notability);
}

// Apply the notability-margin judge to a set of distinct-woman candidates that
// all matched the query exactly (or fuzzily). One → accept; many → accept the
// dominant one only if it clears margin K; otherwise ambiguous.
function judge(index: MatchIndex, ranked: IndexEntry[]): MatchResult {
	if (ranked.length === 0) return { status: "none" };
	if (ranked.length === 1) {
		const woman = index.byId.get(ranked[0].id);
		return woman ? { status: "matched", woman } : { status: "none" };
	}
	const [first, second] = ranked;
	if (first.notability >= K * Math.max(second.notability, 1)) {
		const woman = index.byId.get(first.id);
		return woman ? { status: "matched", woman } : { status: "none" };
	}
	return { status: "ambiguous" };
}

export function match(input: string, index: MatchIndex): MatchResult {
	const q = normalize(input);
	if (!q) return { status: "none" };

	const bucket = index.buckets.get(bucketKey(q)) ?? [];

	const exact = bucket.filter((e) => e.form === q);
	if (exact.length > 0) return judge(index, topByWoman(exact));

	// No exact match: try a single-edit fuzzy pass over this bucket's forms.
	const forms = bucket.map((e) => e.form);
	const idxs = uf.filter(forms, q);
	if (idxs && idxs.length > 0) {
		const fuzzy = idxs.map((i) => bucket[i]);
		return judge(index, topByWoman(fuzzy));
	}

	// No exact, no fuzzy. A pure prefix of many forms = incomplete/too-common.
	const prefix = bucket.filter((e) => e.form.startsWith(q));
	if (prefix.length > 0) return { status: "ambiguous" };

	return { status: "none" };
}
