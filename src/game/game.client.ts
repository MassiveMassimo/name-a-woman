import {
	buildIndex,
	type ExcludedRecord,
	type MatchIndex,
	parseRecords,
} from "../match";
import {
	clearReject,
	clearWall,
	dockInput,
	hideParticleField,
	rejectShake,
	revealParticleField,
	showExcluded,
	tickCounter,
} from "./animations";
import { isDevMode } from "./dev";
import { getCount, reportDiscovery } from "./global";
import { createParticleField } from "./particle-field";
import { resolveGuess } from "./resolve";
import { type GameState, initialState, reduce } from "./state";
import { fetchSummary, type Summary } from "./summary";

const root = document.getElementById("game");
if (root) init(root);

function init(game: HTMLElement): void {
	const $ = <T extends HTMLElement>(id: string): T => {
		const el = document.getElementById(id);
		if (!el) throw new Error(`#${id} missing`);
		return el as T;
	};

	const readout = $("readout");
	const counterEl = $("counter");
	const totalEl = $("total");
	const hudEl = $("hud");
	const timerEl = $("timer");
	const starEl = $("star");
	const wall = $<HTMLDivElement>("wall");
	const form = $<HTMLFormElement>("form");
	const input = $<HTMLInputElement>("input");
	const inputSlot = $<HTMLDivElement>("input-slot");
	const messageEl = $("message");
	const overEl = $("over");
	const finalEl = $("final");
	const again = $<HTMLButtonElement>("again");

	const bgCanvas = document.getElementById(
		"bg-field",
	) as HTMLCanvasElement | null;
	const field = bgCanvas ? createParticleField(bgCanvas) : null;
	let fieldRevealed = false;

	const dev = isDevMode(window.location.search);
	let state: GameState = initialState();
	let index: MatchIndex | null = null;
	let ready = false;
	let prevCount = 0;
	let timerId: ReturnType<typeof setInterval> | undefined;

	const summaryCache = new Map<string, Promise<Summary>>();

	// Fire fetchSummary if we haven't already; cached so repeated keystrokes
	// for the same woman don't duplicate the request.
	function prefetchSummary(name: string, id: number): Promise<Summary> {
		let p = summaryCache.get(name);
		if (!p) {
			p = fetchSummary(name, id);
			summaryCache.set(name, p);
		}
		return p;
	}

	function render(): void {
		const m = Math.floor(state.timeLeft / 60);
		const s = String(state.timeLeft % 60).padStart(2, "0");
		timerEl.textContent = `${m}:${s}`;
		starEl.textContent = String(state.named.length);
		finalEl.textContent = String(state.named.length);
		// display toggles (not `hidden`, which loses to the flex utility)
		hudEl.style.display = state.phase === "idle" ? "none" : "flex";
		overEl.style.display = state.phase === "over" ? "flex" : "none";
		input.disabled = !ready || state.phase === "over";
	}

	function dispatch(action: Parameters<typeof reduce>[1]): void {
		state = reduce(state, action);
		if (state.phase === "over") {
			clearInterval(timerId);
			field?.pause();
		} else if (action.type === "RESET") {
			field?.resume();
		}
		render();
	}

	function setCount(c: number): void {
		tickCounter(counterEl, prevCount, c);
		prevCount = c;
	}

	function startTimer(): void {
		if (dev) return;
		clearInterval(timerId);
		timerId = setInterval(() => dispatch({ type: "TICK" }), 1000);
	}

	// Extract the first sentence from a Wikipedia extract string.
	// Matches sentence terminators only when followed by a capital letter
	// to avoid truncating on abbreviations like "St." or "D.C.".
	function firstSentence(text: string): string {
		const m = text.match(/[.!?]\s+[A-Z]/);
		return m?.index !== undefined ? text.slice(0, m.index + 1) : text;
	}

	// Build a single full-bleed card: large name (left-aligned) + first Wikipedia
	// sentence. Both lines stagger in together — the summary is already resolved
	// before the card is built so the caption has real content at entrance.
	function buildCard(title: string, summary: Summary): HTMLElement {
		const card = document.createElement("div");
		card.className =
			"card t-stagger absolute inset-0 flex items-center px-5 sm:px-10 lg:px-20";
		card.innerHTML = `
			<div class="max-w-xl">
				<strong class="t-stagger-line t-stagger-line--1 font-fraunces font-medium text-5xl leading-tight text-gray-900 sm:text-6xl dark:text-gray-100" data-title></strong>
				<span class="t-stagger-line t-stagger-line--2 mt-4 block min-h-24 text-xl text-gray-600 sm:text-2xl dark:text-gray-400" data-extract></span>
			</div>`;
		(card.querySelector("[data-title]") as HTMLElement).textContent = title;
		(card.querySelector("[data-extract]") as HTMLElement).textContent =
			summary.extract ? firstSentence(summary.extract) : "";
		return card;
	}

	// Shimmer overlay — masks the input text after submit while the
	// Wikipedia summary fetches. <input> can't host ::before, so we
	// overlay a span with t-shimmer. Mirrors the input's border-b-4 and
	// flex-centers the text so it sits where the input's text sits.
	// overflow:hidden + scroll matching keeps long names aligned with
	// the input's tail-scroll position.
	const shimmerOverlay = document.createElement("div");
	shimmerOverlay.className =
		"pointer-events-none absolute inset-0 hidden overflow-hidden flex items-center border-b-4 border-transparent text-4xl capitalize sm:text-7xl lg:text-9xl";
	shimmerOverlay.innerHTML = '<span class="t-shimmer"></span>';
	inputSlot.appendChild(shimmerOverlay);

	function showShimmer(name: string): void {
		const span = shimmerOverlay.querySelector(".t-shimmer") as HTMLElement;
		span.textContent = name;
		span.setAttribute("data-text", name);
		// Match the input's horizontal scroll so the shimmer shows the
		// same visible portion (tail) as the input does for long names.
		span.style.transform = `translateX(${-input.scrollLeft}px)`;
		shimmerOverlay.classList.remove("hidden");
		input.style.color = "transparent";
	}

	function hideShimmer(): void {
		shimmerOverlay.classList.add("hidden");
		input.style.color = "";
	}

	// Crossfade: append the new card, stagger/fade out any existing cards on
	// top, remove them after the exit transition.
	function swapCards(newCard: HTMLElement): void {
		const existing = [...wall.children] as HTMLElement[];
		wall.appendChild(newCard);
		requestAnimationFrame(() => newCard.classList.add("is-shown"));
		for (const child of existing) {
			child.style.zIndex = "1";
			child.classList.add("is-hiding");
			child.classList.remove("is-shown");
			setTimeout(() => child.remove(), 450);
		}
	}

	// Await the summary, then clear the shimmer mask and crossfade the
	// real card in. On a prefetch cache hit the await resolves in a
	// microtask — the shimmer flashes for one frame, then the card
	// staggers in.
	async function animateCard(
		name: string,
		summaryPromise: Promise<Summary>,
	): Promise<void> {
		const summary = await summaryPromise;
		hideShimmer();
		input.value = "";
		if (state.phase !== "playing") return;
		swapCards(buildCard(name, summary));
	}

	// first keystroke starts the round and docks the input to the bottom.
	// Also clears any lingering shimmer from a pending submit.
	input.addEventListener("input", () => {
		if (state.phase === "idle" && input.value.length > 0) {
			dockInput(inputSlot, () => game.setAttribute("data-phase", "playing"));
			dispatch({ type: "START" });
			startTimer();
		}
		hideShimmer();
		// Invisible prefetch — fire the Wikipedia summary fetch when the
		// input unambiguously resolves to a not-yet-named woman, so the
		// card can animate in without waiting on submit.
		if (index && state.phase === "playing") {
			const value = input.value.trim();
			if (value) {
				const namedIds = new Set(state.named.map((n) => n.id));
				const g = resolveGuess(value, index, namedIds);
				if (g.kind === "accept") prefetchSummary(g.woman.name, g.woman.id);
			}
		}
	});

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		if (!index || state.phase === "over") return;
		const value = input.value.trim();
		if (!value) return;
		messageEl.textContent = "";
		clearReject(input, form); // drop any lingering reject before resolving

		const namedIds = new Set(state.named.map((n) => n.id));
		const g = resolveGuess(value, index, namedIds);
		if (g.kind === "accept") {
			dispatch({
				type: "ACCEPT",
				woman: { id: g.woman.id, title: g.woman.name },
			});
			// Mask the submitted text with shimmer while the summary fetches.
			// animateCard clears the shimmer + input when the summary lands.
			// Capitalize to match the input's text-transform: capitalize,
			// which the ::before gradient layer doesn't reliably inherit.
			showShimmer(value.replace(/(^|\s)\S/g, (m) => m.toUpperCase()));
			const summaryPromise = prefetchSummary(g.woman.name, g.woman.id);
			summaryPromise
				.then((s) => {
					if (!s.thumb) return;
					field?.morphTo(s.thumb);
					if (!fieldRevealed && bgCanvas) {
						fieldRevealed = true;
						revealParticleField(bgCanvas);
					}
				})
				.catch(() => {});
			void animateCard(g.woman.name, summaryPromise);
			// fire-and-forget global write; fail-open
			reportDiscovery(g.woman.id, value)
				.then((r) => setCount(r.count))
				.catch(() => {});
		} else {
			input.value = "";
			if (g.kind === "ambiguous") {
				messageEl.textContent = "too common";
				rejectShake(input, form);
			} else if (g.kind === "none") {
				messageEl.textContent = "not found";
				rejectShake(input, form);
			} else if (g.kind === "duplicate") {
				messageEl.textContent = "already named";
				rejectShake(input, form);
			} else if (g.kind === "excluded") {
				// Recognized, but identifies outside the index — acknowledge in
				// purple instead of a red reject.
				messageEl.textContent = `${g.name} identifies as ${g.gender} — doesn't count`;
				showExcluded(input, form);
			}
		}
	});

	again.addEventListener("click", () => {
		clearInterval(timerId);
		dispatch({ type: "RESET" });
		messageEl.textContent = "";
		clearReject(input, form);
		hideShimmer();
		clearWall(wall);
		// mirror the idle→playing dock so the input glides back to center
		dockInput(inputSlot, () => game.setAttribute("data-phase", "idle"));
		input.focus();
		// fade the particle field out; reset so the next correct guess re-reveals
		if (bgCanvas) {
			hideParticleField(bgCanvas);
			fieldRevealed = false;
		}
	});

	// load the index, then enable play; readout fades in to avoid a 0-of-0 flash
	(async () => {
		const [womenText, excludedText, manifest] = await Promise.all([
			fetch("/data/women.json").then((r) => r.text()),
			// Fail-open: a missing/broken excluded list just disables the
			// acknowledgement, never the game.
			fetch("/data/excluded.json")
				.then((r) => r.text())
				.catch(() => "[]"),
			fetch("/data/manifest.json").then(
				(r) => r.json() as Promise<{ count: number }>,
			),
		]);
		const excluded = JSON.parse(excludedText) as ExcludedRecord[];
		index = buildIndex(parseRecords(womenText), excluded);
		ready = true;
		totalEl.textContent = manifest.count.toLocaleString();
		readout.classList.remove("opacity-0");
		readout.classList.add("opacity-100");
		render();
	})();

	getCount().then(setCount);
	render();
}
