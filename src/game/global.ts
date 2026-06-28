// STUB for sub-project C. The global "humanity has named X" counter lives on
// the VM (sub-project D); until then getCount returns a fixed placeholder
// DISCOVERED count (not the total denominator) and reportDiscovery is a no-op.
// D replaces both bodies behind these exact signatures — drop-in, no UI change.
const SEED_COUNT = 12043;

export async function getCount(): Promise<number> {
	return SEED_COUNT;
}

export async function reportDiscovery(
	id: number,
	submitted: string,
): Promise<{ count: number }> {
	void id;
	void submitted;
	return { count: SEED_COUNT };
}
