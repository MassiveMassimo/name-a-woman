export function normalize(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // strip combining diacritics
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}
