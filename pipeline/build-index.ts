import { serializeRecords } from "@/match";
import { buildManifest } from "./manifest";
import { fetchWomenRows } from "./qlever";
import { rowsToRecords } from "./transform";

async function main(): Promise<void> {
	console.log("Querying QLever…");
	const rows = await fetchWomenRows();
	console.log(`Fetched ${rows.length} rows`);

	const records = rowsToRecords(rows);
	console.log(`Built ${records.length} woman records`);

	const manifest = buildManifest(records, new Date().toISOString());

	await Bun.write("public/data/women.json", serializeRecords(records));
	await Bun.write(
		"public/data/manifest.json",
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	console.log(
		`Wrote public/data/women.json + manifest.json (count=${manifest.count})`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
