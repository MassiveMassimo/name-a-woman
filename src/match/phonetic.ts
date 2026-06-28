import { doubleMetaphone } from "double-metaphone";
import { normalize } from "./normalize";

// Phonetic key for cross-spelling recall ("catherine hepburn" → Katharine
// Hepburn) that fuzzy can't bridge when the difference straddles the first-letter
// bucket boundary. Double Metaphone (primary code) per token, joined.
//
// Single-token names are excluded (return ""): a lone phonetic class is far too
// crowded to resolve a specific woman, so the phonetic stage only ever fires on
// full multi-word guesses. Build and match share this function, so the two stay
// in lockstep.
export function phoneticKey(s: string): string {
	const tokens = normalize(s).split(" ").filter(Boolean);
	if (tokens.length < 2) return "";
	return tokens.map((t) => doubleMetaphone(t)[0]).join(" ");
}
