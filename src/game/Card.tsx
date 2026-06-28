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

	return (
		<div className="card w-36 shrink-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
			<div className="relative h-24 bg-gradient-to-br from-slate-600 to-slate-700">
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
				<div className="font-medium text-slate-100 text-sm leading-tight">
					{title}
				</div>
				<div className="mt-1 line-clamp-3 text-[11px] text-slate-400 leading-snug">
					{summary?.extract ?? ""}
				</div>
			</div>
		</div>
	);
}
