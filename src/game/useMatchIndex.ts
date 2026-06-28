import { useEffect, useState } from "react";
import { buildIndex, type MatchIndex, parseRecords } from "@/match";

interface IndexState {
	index: MatchIndex | null;
	total: number;
	ready: boolean;
}

// Fetch women.json + manifest.json once, build the in-memory index.
export function useMatchIndex(): IndexState {
	const [state, setState] = useState<IndexState>({
		index: null,
		total: 0,
		ready: false,
	});

	useEffect(() => {
		let alive = true;
		(async () => {
			const [womenText, manifest] = await Promise.all([
				fetch("/data/women.json").then((r) => r.text()),
				fetch("/data/manifest.json").then(
					(r) => r.json() as Promise<{ count: number }>,
				),
			]);
			const index = buildIndex(parseRecords(womenText));
			if (alive) setState({ index, total: manifest.count, ready: true });
		})();
		return () => {
			alive = false;
		};
	}, []);

	return state;
}
