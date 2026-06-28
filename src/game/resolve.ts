import { type MatchIndex, match, type WomanRecord } from "@/match";

export type Guess =
	| { kind: "accept"; woman: WomanRecord }
	| { kind: "duplicate"; woman: WomanRecord }
	| { kind: "ambiguous" }
	| { kind: "none" };

// Wrap the shared match() and apply the per-round duplicate guard.
export function resolveGuess(
	input: string,
	index: MatchIndex,
	namedIds: Set<number>,
): Guess {
	const result = match(input, index);
	if (result.status === "matched") {
		return namedIds.has(result.woman.id)
			? { kind: "duplicate", woman: result.woman }
			: { kind: "accept", woman: result.woman };
	}
	return result.status === "ambiguous"
		? { kind: "ambiguous" }
		: { kind: "none" };
}
