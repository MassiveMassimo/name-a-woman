// src/match/match.ts
import uFuzzy from "@leeoniya/ufuzzy";
import { bucketKey } from "./build";
import { normalize } from "./normalize";
import type { IndexEntry, MatchIndex, WomanRecord } from "./types";

// Notability margin for an exact article-title collision (two distinct women
// share the same title, e.g. two "Jennifer Jones"): the top must beat the
// second by this factor to win outright, else ambiguous. Calibrated on a real
// eval set (spec §2, §10).
export const K = 5;

// Dominance margin for the prefix field (a bare name like "cher" that prefixes
// many different women): the top bearer must beat the next by this factor to be
// the primary topic, else the name is too common. Looser than K because the
// field bearers have different names, not an identical one.
export const DOMINANCE = 2;

// Minimum query length for an INEXACT match (strict-prefix or single-edit
// fuzzy). A 3-char keyboard smash ("asd", "tyu") reliably prefixes — or sits one
// edit from — some obscure name in a 436k-woman index and wins dominance over
// its even-obscurer neighbours, leaking a false match (one edit on three chars
// is half the string). A deliberate partial/typo ("opra" → Oprah) is >= 4.
// Exact forms (mononyms, full names) bypass this floor entirely.
export const MIN_INEXACT_LEN = 4;

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

// Decide a winner among distinct-woman candidates ranked by notability. One →
// accept; many → accept the top only if it clears the given margin over the
// second; otherwise ambiguous.
function decide(
	index: MatchIndex,
	ranked: IndexEntry[],
	margin: number,
): MatchResult {
	if (ranked.length === 0) return { status: "none" };
	if (ranked.length === 1) {
		const woman = index.byId.get(ranked[0].id);
		return woman ? { status: "matched", woman } : { status: "none" };
	}
	const [first, second] = ranked;
	if (first.notability >= margin * Math.max(second.notability, 1)) {
		const woman = index.byId.get(first.id);
		return woman ? { status: "matched", woman } : { status: "none" };
	}
	return { status: "ambiguous" };
}

export function match(input: string, index: MatchIndex): MatchResult {
	const q = normalize(input);
	if (!q) return { status: "none" };

	const bucket = index.buckets.get(bucketKey(q)) ?? [];

	// 1. The query is exactly a woman's article title → Wikipedia's primary
	//    topic. Titles are effectively unique, so common first names are
	//    disambiguation pages (no woman is titled exactly "Michelle"); they only
	//    appear here as aliases, which are handled by the field judge below.
	const title = bucket.filter((e) => e.form === q && e.primary);
	if (title.length > 0) return decide(index, topByWoman(title), K);

	// 2. Otherwise judge the field the query exactly-aliases or prefixes. A true
	//    mononym ("cher", "megawati") has one dominant bearer; a bare common
	//    first name spreads across many comparably-notable women → too common.
	const field = bucket.filter((e) => e.form.startsWith(q));
	if (field.length > 0) {
		// An exact form is a confident anchor (mononym/full name); a strict-prefix
		// only counts above the smash floor (see PREFIX_MIN_LEN).
		const hasExact = field.some((e) => e.form === q);
		if (hasExact || q.length >= MIN_INEXACT_LEN) {
			return decide(index, topByWoman(field), DOMINANCE);
		}
	}

	// 3. No exact/prefix: a single-edit fuzzy pass for typos. Skipped below the
	//    inexact-length floor — a one-edit match on a 2-3 char smash is noise.
	if (q.length < MIN_INEXACT_LEN) return { status: "none" };

	//    uFuzzy can match the query as a fragment buried inside a longer name
	//    (e.g. "asdfg" inside "alexis penny casdagli"), so keep only whole-name
	//    typos — length within the query's term count ("ada lovelce" → "ada
	//    lovelace").
	const forms = bucket.map((e) => e.form);
	const idxs = uf.filter(forms, q);
	if (idxs && idxs.length > 0) {
		const maxLenDiff = q.split(" ").length;
		const fuzzy = idxs
			.map((i) => bucket[i])
			.filter((e) => Math.abs(e.form.length - q.length) <= maxLenDiff);
		if (fuzzy.length > 0) return decide(index, topByWoman(fuzzy), DOMINANCE);
	}

	return { status: "none" };
}
