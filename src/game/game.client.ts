import { buildIndex, type MatchIndex, parseRecords } from "../match";
import {
	clearReject,
	clearWall,
	dockInput,
	hideParticleField,
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

	// Extract the first sentence from a Wikipedia extract string.
	// Matches sentence terminators only when followed by a capital letter
	// to avoid truncating on abbreviations like "St." or "D.C.".
	function firstSentence(text: string): string {
		const m = text.match(/[.!?]\s+[A-Z]/);
		return m?.index !== undefined ? text.slice(0, m.index + 1) : text;
	}

	// Build a single full-bleed card: large name (left-aligned) + first Wikipedia
	// sentence. The name staggers in via t-stagger; the extract uses t-text-swap
	// to crossfade from empty to the resolved Wikipedia text.
	function buildCard(
		title: string,
		summaryPromise: Promise<Summary>,
	): HTMLElement {
		const card = document.createElement("div");
		card.className =
			"card t-stagger absolute inset-0 flex items-center px-5 sm:px-10 lg:px-20";
		card.innerHTML = `
			<div class="max-w-xl">
				<strong class="t-stagger-line t-stagger-line--1 font-fraunces font-medium text-5xl leading-tight text-gray-900 sm:text-6xl dark:text-gray-100" data-title></strong>
				<span class="t-stagger-line t-stagger-line--2 mt-4 block min-h-24 text-xl text-gray-600 sm:text-2xl dark:text-gray-400">
					<span class="t-text-swap" data-extract></span>
				</span>
			</div>`;
		(card.querySelector("[data-title]") as HTMLElement).textContent = title;
		const extractEl = card.querySelector("[data-extract]") as HTMLElement;
		summaryPromise.then((s) => {
			if (!card.isConnected) return;
			const text = s.extract ? firstSentence(s.extract) : "";
			if (!text) return;
			// t-text-swap three-phase: exit empty, swap text, enter new
			extractEl.classList.add("is-exit");
			setTimeout(() => {
				if (!card.isConnected) return;
				extractEl.textContent = text;
				extractEl.classList.remove("is-exit");
				extractEl.classList.add("is-enter-start");
				void extractEl.offsetWidth; // force reflow
				extractEl.classList.remove("is-enter-start");
			}, 150); // --text-swap-dur
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
			dispatch({
				type: "ACCEPT",
				woman: { id: g.woman.id, title: g.woman.name },
			});
			// One summary fetch serves both the card content and the background field
			const summaryPromise = fetchSummary(g.woman.name);
			const card = buildCard(g.woman.name, summaryPromise);
			// Crossfade: existing card(s) exit on top while new card staggers in beneath
			const existing = [...wall.children] as HTMLElement[];
			wall.appendChild(card);
			requestAnimationFrame(() => card.classList.add("is-shown"));
			for (const child of existing) {
				child.style.zIndex = "1";
				child.classList.add("is-hiding");
				child.classList.remove("is-shown");
				setTimeout(() => child.remove(), 200);
			}
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
		} else if (g.kind === "duplicate") {
			messageEl.textContent = "already named";
			rejectShake(input, form);
		}
	});

	again.addEventListener("click", () => {
		clearInterval(timerId);
		dispatch({ type: "RESET" });
		messageEl.textContent = "";
		clearReject(input, form);
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
