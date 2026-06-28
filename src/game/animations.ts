import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

const prefersReduced = (): boolean =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Title flies from the input position to its card position (Flip-style).
// Measures the input rect + computed font-size, then animates the title
// from there with a scale + blur so the text appears to travel and settle.
export function flyTitleFromInput(
	titleEl: HTMLElement,
	input: HTMLElement,
): void {
	if (prefersReduced()) {
		gsap.set(titleEl, {
			autoAlpha: 1,
			x: 0,
			y: 0,
			scale: 1,
			filter: "blur(0px)",
		});
		return;
	}
	const inputRect = input.getBoundingClientRect();
	const titleRect = titleEl.getBoundingClientRect();
	const inputFs = parseFloat(getComputedStyle(input).fontSize);
	const titleFs = parseFloat(getComputedStyle(titleEl).fontSize);
	const dx = inputRect.left - titleRect.left;
	const dy =
		inputRect.top +
		inputRect.height / 2 -
		(titleRect.top + titleRect.height / 2);
	const scale = inputFs / titleFs;
	gsap.fromTo(
		titleEl,
		{ x: dx, y: dy, scale, autoAlpha: 1, filter: "blur(8px)" },
		{
			x: 0,
			y: 0,
			scale: 1,
			autoAlpha: 1,
			filter: "blur(0px)",
			duration: 0.6,
			ease: "power3.out",
		},
	);
}

// Old card exits upward: translate up + blur + fade out, then remove from DOM.
export function transitionCardOut(
	card: HTMLElement,
	onRemove: () => void,
): void {
	gsap.killTweensOf(card);
	if (prefersReduced()) {
		onRemove();
		return;
	}
	gsap.to(card, {
		y: -40,
		autoAlpha: 0,
		filter: "blur(12px)",
		duration: 0.5,
		ease: "power3.in",
		onComplete: onRemove,
	});
}

// Blur-fade the extract text in once the Wikipedia summary resolves.
export function revealExtract(el: HTMLElement): void {
	if (prefersReduced()) {
		gsap.set(el, { autoAlpha: 1, filter: "blur(0px)" });
		return;
	}
	gsap.fromTo(
		el,
		{ autoAlpha: 0, filter: "blur(4px)" },
		{ autoAlpha: 1, filter: "blur(0px)", duration: 0.5, ease: "power2.out" },
	);
}

// Kill any in-flight card tweens and empty the wall (used on reset).
export function clearWall(wall: HTMLElement): void {
	gsap.killTweensOf(wall.children);
	wall.replaceChildren();
}

// Big centered input → bottom dock. applyDocked flips the CSS class; Flip tweens between.
export function dockInput(target: HTMLElement, applyDocked: () => void): void {
	if (prefersReduced()) {
		applyDocked();
		return;
	}
	const state = Flip.getState(target);
	applyDocked();
	Flip.from(state, { duration: 0.5, ease: "power3.out" });
}

// CSS-driven reject (transitions.dev error-state-shake): shake the input,
// flag the wrap so the error message reveals, then auto-revert after the hold.
// Reduced-motion is handled in CSS (shake suppressed, message still shows).
let rejectTimer: ReturnType<typeof setTimeout> | undefined;

export function rejectShake(input: HTMLElement, wrap: HTMLElement): void {
	input.classList.remove("is-shaking");
	void input.offsetWidth; // reflow so a rapid second reject replays the shake
	wrap.classList.add("is-error");
	input.classList.add("is-error", "is-shaking");
	clearTimeout(rejectTimer);
	rejectTimer = setTimeout(() => clearReject(input, wrap), 3000); // --revert-hold
}

export function clearReject(input: HTMLElement, wrap: HTMLElement): void {
	clearTimeout(rejectTimer);
	wrap.classList.remove("is-error");
	input.classList.remove("is-error");
}

// Reveal the particle-field canvas with a blur-fade-in on first appearance.
export function revealParticleField(canvas: HTMLCanvasElement): void {
	if (prefersReduced()) {
		gsap.set(canvas, { opacity: 1, filter: "blur(0px)" });
		return;
	}
	gsap.fromTo(
		canvas,
		{ opacity: 0, filter: "blur(24px)" },
		{ opacity: 1, filter: "blur(0px)", duration: 0.8, ease: "power2.out" },
	);
}

// Hide the particle-field canvas with a blur-fade-out (inverse of reveal).
export function hideParticleField(canvas: HTMLCanvasElement): void {
	if (prefersReduced()) {
		gsap.set(canvas, { opacity: 0, filter: "blur(24px)" });
		return;
	}
	gsap.to(canvas, {
		opacity: 0,
		filter: "blur(24px)",
		duration: 0.6,
		ease: "power2.in",
	});
}

// Animate the global counter readout from one value to the next.
export function tickCounter(el: HTMLElement, from: number, to: number): void {
	const obj = { v: from };
	gsap.to(obj, {
		v: to,
		duration: prefersReduced() ? 0 : 0.6,
		ease: "power2.out",
		onUpdate: () => {
			el.textContent = Math.round(obj.v).toLocaleString();
		},
	});
}
