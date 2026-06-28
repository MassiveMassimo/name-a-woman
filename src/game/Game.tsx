import {
	type FormEvent,
	useEffect,
	useLayoutEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import {
	captureCards,
	clearReject,
	dockInput,
	flyCardIn,
	reflow,
	rejectShake,
	tickCounter,
} from "./animations";
import { Card } from "./Card";
import { isDevMode } from "./dev";
import { getCount, reportDiscovery } from "./global";
import { resolveGuess } from "./resolve";
import { initialState, reduce } from "./state";
import { useMatchIndex } from "./useMatchIndex";

const inputClass =
	"input h-auto w-full rounded-none border-x-0 border-t-0 border-b-4 border-slate-300 bg-transparent text-4xl capitalize text-slate-900 outline-none transition-colors duration-300 placeholder:normal-case placeholder:text-slate-400 focus:border-slate-900 focus:placeholder:text-slate-500 sm:text-7xl lg:text-9xl dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-slate-300";

export function Game() {
	const { index, total, ready } = useMatchIndex();
	const [state, dispatch] = useReducer(reduce, undefined, initialState);
	const [message, setMessage] = useState("");
	const [count, setCount] = useState(0);

	const inputRef = useRef<HTMLInputElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const wallRef = useRef<HTMLDivElement>(null);
	const counterRef = useRef<HTMLSpanElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const pendingFlip = useRef<ReturnType<typeof captureCards> | null>(null);
	const prevCount = useRef(0);
	const dev = useRef(
		isDevMode(typeof window !== "undefined" ? window.location.search : ""),
	).current;

	// initial global count
	useEffect(() => {
		getCount().then(setCount);
	}, []);

	// animate the counter readout from its previous value to the new one
	useEffect(() => {
		if (counterRef.current)
			tickCounter(counterRef.current, prevCount.current, count);
		prevCount.current = count;
	}, [count]);

	// timer: tick each second while playing (disabled in dev mode)
	useEffect(() => {
		if (state.phase !== "playing" || dev) return;
		const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
		return () => clearInterval(id);
	}, [state.phase, dev]);

	// after a card is added, fly it in and reflow the rest
	// biome-ignore lint/correctness/useExhaustiveDependencies: state.named is the intended trigger; effect reads pendingFlip (a ref, not reactive)
	useLayoutEffect(() => {
		if (!pendingFlip.current || !wallRef.current || !inputRef.current) return;
		const newest = wallRef.current.firstElementChild as HTMLElement | null;
		if (newest) flyCardIn(newest, inputRef.current);
		reflow(pendingFlip.current);
		if (wallRef.current) wallRef.current.scrollLeft = 0;
		pendingFlip.current = null;
	}, [state.named]);

	function onChange() {
		// first keystroke starts the round and docks the input to the bottom
		if (state.phase === "idle" && (inputRef.current?.value.length ?? 0) > 0) {
			const el = inputRef.current;
			if (el)
				dockInput(el, () =>
					containerRef.current?.setAttribute("data-phase", "playing"),
				);
			dispatch({ type: "START" });
		}
	}

	function onSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const el = inputRef.current;
		const wrap = formRef.current;
		if (!el || !wrap || !index || state.phase === "over") return;
		const value = el.value.trim();
		if (!value) return;
		el.value = "";
		setMessage("");
		clearReject(el, wrap); // drop any lingering reject before resolving

		const namedIds = new Set(state.named.map((n) => n.id));
		const g = resolveGuess(value, index, namedIds);
		if (g.kind === "accept") {
			pendingFlip.current = captureCards([
				...(wallRef.current?.children ?? []),
			]);
			dispatch({
				type: "ACCEPT",
				woman: { id: g.woman.id, title: g.woman.name },
			});
			// fire-and-forget global write; fail-open
			reportDiscovery(g.woman.id, value)
				.then((r) => setCount(r.count))
				.catch(() => {});
		} else if (g.kind === "ambiguous") {
			setMessage("too common");
			rejectShake(el, wrap);
		} else if (g.kind === "none") {
			setMessage("not found");
			rejectShake(el, wrap);
		}
		// duplicate: soft no-op
	}

	function playAgain() {
		dispatch({ type: "RESET" });
		setMessage("");
		// mirror the idle→playing dock so the input glides back to center, not snaps
		const el = inputRef.current;
		if (el && formRef.current) clearReject(el, formRef.current);
		const toIdle = () =>
			containerRef.current?.setAttribute("data-phase", "idle");
		if (el) dockInput(el, toIdle);
		else toIdle();
		el?.focus();
	}

	const mm = String(Math.floor(state.timeLeft / 60));
	const ss = String(state.timeLeft % 60).padStart(2, "0");

	return (
		<main
			ref={containerRef}
			data-phase="idle"
			className="group relative flex min-h-svh flex-col bg-slate-50 px-5 data-[phase=idle]:items-center data-[phase=idle]:justify-center sm:px-10 lg:px-20 dark:bg-slate-900"
		>
			{/* corner readouts; held hidden until the index loads to avoid a "0 of 0" flash */}
			<div
				className={`pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-5 text-slate-500 text-sm transition-opacity duration-300 dark:text-slate-400 ${ready ? "opacity-100" : "opacity-0"}`}
			>
				<span>
					<span ref={counterRef}>0</span> of {total.toLocaleString()} named
				</span>
				{state.phase !== "idle" && (
					<span className="flex gap-4 tabular-nums">
						<span>
							{mm}:{ss}
						</span>
						<span>★ {state.named.length}</span>
					</span>
				)}
			</div>

			{/* card wall (top row) */}
			<div
				ref={wallRef}
				className="flex flex-1 flex-row flex-nowrap items-center gap-3 overflow-x-auto pt-16 [perspective:900px] group-data-[phase=idle]:hidden"
			>
				{state.named.map((n) => (
					<Card key={n.id} title={n.title} />
				))}
			</div>

			{/* input */}
			<form
				ref={formRef}
				onSubmit={onSubmit}
				className="t-input-wrap w-full group-data-[phase=playing]:pb-10"
			>
				<input
					ref={inputRef}
					className={`t-input ${inputClass}`}
					type="text"
					name="name"
					placeholder="Name a woman"
					autoComplete="off"
					disabled={!ready || state.phase === "over"}
					onChange={onChange}
				/>
				<p className="t-error-msg mt-2 text-sm">{message}</p>
			</form>

			{/* game over overlay */}
			{state.phase === "over" && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50/90 dark:bg-slate-900/90">
					<p className="text-2xl text-slate-600 dark:text-slate-300">
						Time! You named
					</p>
					<p className="text-8xl text-slate-900 dark:text-slate-100">
						{state.named.length}
					</p>
					<button
						type="button"
						onClick={playAgain}
						className="rounded-full bg-slate-900 px-6 py-2 text-slate-50 transition-transform active:scale-95 dark:bg-slate-100 dark:text-slate-900"
					>
						Play Again
					</button>
				</div>
			)}
		</main>
	);
}
