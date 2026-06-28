// Dev mode (?dev): disables the 60s timer so the round never ends.
export function isDevMode(search: string): boolean {
	return new URLSearchParams(search).has("dev");
}
