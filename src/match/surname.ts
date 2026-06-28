import { normalize } from "./normalize";

// Nobiliary / patronymic particles that bind to the surname. A trailing surname
// keeps any run of these immediately before its last token ("du maurier",
// "von trapp", "de beauvoir"); the bare last token is also exposed so a player
// who types just "maurier" / "beauvoir" still matches.
const PARTICLES = new Set([
	"de",
	"del",
	"della",
	"der",
	"den",
	"van",
	"von",
	"du",
	"da",
	"di",
	"dos",
	"das",
	"la",
	"le",
	"el",
	"al",
	"bin",
	"bint",
	"ibn",
	"mac",
	"mc",
	"st",
	"san",
	"santa",
	"ten",
	"ter",
	"of",
]);

// Surnames below this length ("wu", "ng", "li") are shared too widely to recall a
// specific woman, so they are not generated.
const MIN_SURNAME_LEN = 3;

// Derive normalized surname forms from a full article title. Returns [] for
// mononyms / single-token names. A compound surname (when present) comes first,
// the bare last token second:
//   "Marie Curie"          -> ["curie"]
//   "Simone de Beauvoir"   -> ["de beauvoir", "beauvoir"]   (nobiliary particle)
//   "Ruth Bader Ginsburg"  -> ["bader ginsburg", "ginsburg"] (two-word surname)
//   "Aung San Suu Kyi"     -> ["suu kyi", "kyi"]
// Two-word surnames are commonly how a woman is referenced; a particle run takes
// precedence over the bare two-word form, and initials ("J. K.") never start one.
export function surnameForms(name: string): string[] {
	const tokens = normalize(name).split(" ").filter(Boolean);
	if (tokens.length < 2) return [];
	const last = tokens[tokens.length - 1];
	if (last.length < MIN_SURNAME_LEN) return [];
	// Walk back over particles, but never consume the first (given-name) token.
	let i = tokens.length - 2;
	while (i >= 1 && PARTICLES.has(tokens[i])) i--;
	const particleCompound = tokens.slice(i + 1).join(" ");
	const prev = tokens[tokens.length - 2];
	const prevIsInitial = prev.length === 1 || prev.endsWith(".");

	const forms: string[] = [];
	if (particleCompound !== last) {
		forms.push(particleCompound);
	} else if (tokens.length >= 3 && !prevIsInitial) {
		forms.push(`${prev} ${last}`);
	}
	forms.push(last);
	return forms;
}
