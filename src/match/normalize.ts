// Latin letters that carry no NFD-decomposable diacritic (a stroke, ligature, or
// distinct glyph), so the combining-mark strip above misses them. Folded to their
// conventional ASCII spelling so a player typing "bjork gudmundsdottir" or
// "dorota loboda" reaches "Björk Guðmundsdóttir" / "Dorota Łoboda".
const LATIN_FOLD: Record<string, string> = {
	ø: "o",
	ð: "d",
	đ: "d",
	þ: "th",
	æ: "ae",
	œ: "oe",
	ł: "l",
	ß: "ss",
	ı: "i",
};

export function normalize(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // strip combining diacritics
		.toLowerCase()
		.replace(/[øðđþæœłßı]/g, (c) => LATIN_FOLD[c]) // fold non-decomposable Latin
		.replace(/\s+/g, " ")
		.trim();
}
