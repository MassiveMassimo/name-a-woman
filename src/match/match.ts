// src/match/match.ts
import uFuzzy from "@leeoniya/ufuzzy";
import { bucketKey } from "./build";
import { normalize } from "./normalize";
import { phoneticKey } from "./phonetic";
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
	| { status: "excluded"; name: string; gender: string }
	| { status: "none" };

// Final fallback when no woman matched: acknowledge a recognized person who is
// excluded from the index by gender identity, else a plain miss.
function notFound(index: MatchIndex, q: string): MatchResult {
	const ex = index.excluded.get(q);
	return ex
		? { status: "excluded", name: ex.name, gender: ex.gender }
		: { status: "none" };
}

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

	// Below the inexact floor only an exact form is trustworthy: a short keyboard
	// smash strict-prefixes — or sits one edit from — some obscure name and wins
	// dominance over its neighbours (see MIN_INEXACT_LEN). Gating the strict-prefix
	// scan on this also skips its allocation for the common short-keystroke case.
	const inexactOk = q.length >= MIN_INEXACT_LEN;

	// 2. Judge the field the query exactly-aliases or prefixes. A true mononym
	//    ("cher", "megawati") has one dominant bearer; a bare common first name
	//    spreads across many comparably-notable women → too common. Surname-only
	//    forms are exact anchors: they join the field only on an exact hit, never
	//    by prefix, so a common word that merely begins a surname ("planet" →
	//    "planeta") does not leak.
	if (inexactOk || bucket.some((e) => e.form === q)) {
		const field = bucket.filter((e) =>
			e.surname ? e.form === q : e.form.startsWith(q),
		);
		if (field.length > 0) return decide(index, topByWoman(field), DOMINANCE);
	}

	// 3. A single-edit fuzzy pass for typos — inexact, so floored. Surnames are
	//    excluded (a common word one edit from a surname, "random" → "randon", is
	//    not a guess). uFuzzy can match the query as a fragment buried inside a
	//    longer name (e.g. "asdfg" inside "alexis penny casdagli"), so keep only
	//    whole-name typos — length within the query's term count ("ada lovelce" →
	//    "ada lovelace").
	if (!inexactOk) return notFound(index, q);
	const fuzzable = bucket.filter((e) => !e.surname);
	const forms = fuzzable.map((e) => e.form);
	const idxs = uf.filter(forms, q);
	if (idxs && idxs.length > 0) {
		const maxLenDiff = q.split(" ").length;
		const fuzzy = idxs
			.map((i) => fuzzable[i])
			.filter((e) => Math.abs(e.form.length - q.length) <= maxLenDiff);
		if (fuzzy.length > 0) return decide(index, topByWoman(fuzzy), DOMINANCE);
	}

	// 4. Phonetic last resort: a full-name guess misspelled across a
	//    sound-preserving boundary fuzzy can't bridge ("catherine hepburn" →
	//    Katharine Hepburn). Multi-token only (phoneticKey returns "" otherwise),
	//    notable bearers only, so it stays precise.
	const pk = phoneticKey(q);
	if (pk) {
		const bearers = index.phonetic.get(pk);
		if (bearers) return decide(index, topByWoman(bearers), DOMINANCE);
	}

	// 5. No woman matched — acknowledge an excluded person, else a plain miss.
	return notFound(index, q);
}
