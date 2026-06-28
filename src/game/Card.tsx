import { useEffect, useState } from "react";
import { fetchSummary, type Summary } from "./summary";

export function Card({ title }: { title: string }) {
	const [summary, setSummary] = useState<Summary | null>(null);

	useEffect(() => {
		let alive = true;
		fetchSummary(title).then((s) => {
			if (alive) setSummary(s);
		});
		return () => {
			alive = false;
		};
	}, [title]);

	const thumb = summary?.thumb ?? null;
	// fetchSummary is fail-open (always resolves), so a non-null summary means
	// the load settled — reveal even when thumb/extract came back empty.
	const loaded = summary !== null;

	return (
		<div
			className={`card t-skel h-52 w-36 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${loaded ? "is-revealed" : ""}`}
		>
			{/* skeleton: pulses until the summary load settles, then cross-fades out */}
			<div className="t-skel-skeleton is-pulsing">
				<div className="h-24 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700" />
				<div className="space-y-2 p-2.5">
					<div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
					<div className="h-2.5 w-full rounded bg-slate-200 dark:bg-slate-700" />
					<div className="h-2.5 w-full rounded bg-slate-200 dark:bg-slate-700" />
					<div className="h-2.5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
				</div>
			</div>
			{/* content: same fixed slot, fades in on reveal */}
			<div className="t-skel-content">
				<div className="relative h-24 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700">
					{thumb && (
						<img
							src={thumb}
							alt={title}
							loading="lazy"
							className="h-full w-full object-cover opacity-0 transition-opacity duration-300"
							onLoad={(e) => {
								e.currentTarget.style.opacity = "1";
							}}
						/>
					)}
				</div>
				<div className="p-2.5">
					<div className="line-clamp-2 font-medium text-slate-900 text-sm leading-tight dark:text-slate-100">
						{title}
					</div>
					<div className="mt-1 line-clamp-3 text-[11px] text-slate-500 leading-snug dark:text-slate-400">
						{summary?.extract ?? ""}
					</div>
				</div>
			</div>
		</div>
	);
}
