// pipeline/verify-index.ts
import { buildIndex, match, parseRecords } from "@/match";

const text = await Bun.file("public/data/women.json").text();
const records = parseRecords(text);
const idx = buildIndex(records);

const failures: string[] = [];

// Denominator sanity: mid-2026 live count is ~435k; allow a wide band.
if (records.length < 380_000 || records.length > 600_000) {
	failures.push(`count out of range: ${records.length}`);
}
// Unique, positive integer ids.
const ids = new Set(records.map((r) => r.id));
if (ids.size !== records.length) failures.push("duplicate ids present");
if (records.some((r) => !Number.isInteger(r.id) || r.id <= 0))
	failures.push("non-positive id present");
if (records.some((r) => r.name.trim() === ""))
	failures.push("empty name present");

// Behavioral spot-checks (spec §8).
const expectMatched = (q: string) => {
	const m = match(q, idx);
	if (m.status !== "matched")
		failures.push(`"${q}" expected matched, got ${m.status}`);
};
expectMatched("Marie Curie");
expectMatched("Megawati"); // surfaces the alias-coverage risk (spec §7) if it fails
if (match("Elizabeth", idx).status !== "ambiguous") {
	failures.push(
		`"Elizabeth" expected ambiguous, got ${match("Elizabeth", idx).status}`,
	);
}

if (failures.length > 0) {
	console.error(
		`VERIFY FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
	);
	process.exit(1);
}
console.log(`VERIFY OK — ${records.length} women`);
