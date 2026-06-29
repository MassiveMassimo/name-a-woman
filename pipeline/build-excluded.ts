import { buildExcluded, fetchExcludedRows } from "./excluded";
import { QLEVER_ENDPOINT } from "./qlever";

async function main(): Promise<void> {
	console.log("Querying QLever for excluded identities…");
	const rows = await fetchExcludedRows(QLEVER_ENDPOINT);
	console.log(`Fetched ${rows.length} rows`);

	const records = buildExcluded(rows);
	console.log(`Built ${records.length} excluded records`);

	await Bun.write("public/data/excluded.json", JSON.stringify(records));
	console.log(`Wrote public/data/excluded.json (count=${records.length})`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
