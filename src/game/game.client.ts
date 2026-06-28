import { buildIndex, type MatchIndex, parseRecords } from "../match";
import {
	captureCards,
	clearReject,
	dockInput,
	flyCardIn,
	hideParticleField,
	reflow,
	rejectShake,
	revealParticleField,
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

	// Build one card: pulsing skeleton + content layer in a fixed slot, then
	// cross-fade the content in (.is-revealed) when the shared summary resolves.
	function buildCard(
		title: string,
		summaryPromise: Promise<Summary>,
	): HTMLElement {
		const card = document.createElement("div");
		card.className =
			"card t-skel h-52 w-36 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800";
		card.innerHTML = `
			<div class="t-skel-skeleton is-pulsing">
				<div class="h-24 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700"></div>
				<div class="space-y-2 p-2.5">
					<div class="h-3.5 w-3/4 rounded bg-gray-200 dark:bg-gray-700"></div>
					<div class="h-2.5 w-full rounded bg-gray-200 dark:bg-gray-700"></div>
					<div class="h-2.5 w-full rounded bg-gray-200 dark:bg-gray-700"></div>
					<div class="h-2.5 w-2/3 rounded bg-gray-200 dark:bg-gray-700"></div>
				</div>
			</div>
			<div class="t-skel-content">
				<div class="relative h-24 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700" data-thumb></div>
				<div class="p-2.5">
					<div class="line-clamp-2 font-medium text-gray-900 text-sm leading-tight dark:text-gray-100" data-title></div>
					<div class="mt-1 line-clamp-3 text-[11px] text-gray-500 leading-snug dark:text-gray-400" data-extract></div>
				</div>
			</div>`;
		// textContent (not innerHTML) for untrusted data
		(card.querySelector("[data-title]") as HTMLElement).textContent = title;
		summaryPromise.then((s) => {
			(card.querySelector("[data-extract]") as HTMLElement).textContent =
				s.extract ?? "";
			if (s.thumb) {
				const img = document.createElement("img");
				img.src = s.thumb;
				img.alt = title;
				img.loading = "lazy";
				img.className =
					"h-full w-full object-cover opacity-0 transition-opacity duration-300";
				img.addEventListener("load", () => {
					img.style.opacity = "1";
				});
				(card.querySelector("[data-thumb]") as HTMLElement).appendChild(img);
			}
			card.classList.add("is-revealed");
		});
		return card;
	}

	// first keystroke starts the round and docks the input to the bottom
	input.addEventListener("input", () => {
		if (state.phase === "idle" && input.value.length > 0) {
			dockInput(inputSlot, () => game.setAttribute("data-phase", "playing"));
			dispatch({ type: "START" });
			startTimer();
		}
	});

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		if (!index || state.phase === "over") return;
		const value = input.value.trim();
		if (!value) return;
		input.value = "";
		messageEl.textContent = "";
		clearReject(input, form); // drop any lingering reject before resolving

		const namedIds = new Set(state.named.map((n) => n.id));
		const g = resolveGuess(value, index, namedIds);
		if (g.kind === "accept") {
			const flip = captureCards([...wall.children]);
			dispatch({
				type: "ACCEPT",
				woman: { id: g.woman.id, title: g.woman.name },
			});
			// One summary fetch serves both the card content and the background field
			const summaryPromise = fetchSummary(g.woman.name);
			const card = buildCard(g.woman.name, summaryPromise);
			wall.prepend(card);
			flyCardIn(card, input);
			reflow(flip);
			wall.scrollLeft = 0;
			// Morph the particle field to the new woman's portrait; fail-open
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
			// fire-and-forget global write; fail-open
			reportDiscovery(g.woman.id, value)
				.then((r) => setCount(r.count))
				.catch(() => {});
		} else if (g.kind === "ambiguous") {
			messageEl.textContent = "too common";
			rejectShake(input, form);
		} else if (g.kind === "none") {
			messageEl.textContent = "not found";
			rejectShake(input, form);
		}
		// duplicate: soft no-op
	});

	again.addEventListener("click", () => {
		clearInterval(timerId);
		dispatch({ type: "RESET" });
		messageEl.textContent = "";
		clearReject(input, form);
		wall.replaceChildren();
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
		const [womenText, manifest] = await Promise.all([
			fetch("/data/women.json").then((r) => r.text()),
			fetch("/data/manifest.json").then(
				(r) => r.json() as Promise<{ count: number }>,
			),
		]);
		index = buildIndex(parseRecords(womenText));
		ready = true;
		totalEl.textContent = manifest.count.toLocaleString();
		readout.classList.remove("opacity-0");
		readout.classList.add("opacity-100");
		render();
	})();

	getCount().then(setCount);
	render();
}
