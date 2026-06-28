import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

const prefersReduced = (): boolean =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Snapshot existing card positions BEFORE the new card is inserted, for Flip reflow.
export function captureCards(cards: Element[]): Flip.FlipState {
	return Flip.getState(cards);
}

// New card launches from the input and flies up into the row (3D tilt + blur).
export function flyCardIn(card: HTMLElement, input: HTMLElement): void {
	if (prefersReduced()) {
		gsap.fromTo(card, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
		return;
	}
	const nr = card.getBoundingClientRect();
	const ir = input.getBoundingClientRect();
	const dx = ir.left + ir.width / 2 - (nr.left + nr.width / 2);
	const dy = ir.top + ir.height / 2 - (nr.top + nr.height / 2);
	gsap.fromTo(
		card,
		{
			x: dx,
			y: dy,
			scale: 0.42,
			rotationX: -42,
			skewY: 6,
			autoAlpha: 0,
			filter: "blur(12px)",
			transformPerspective: 900,
			transformOrigin: "center center",
		},
		{
			x: 0,
			y: 0,
			scale: 1,
			rotationX: 0,
			skewY: 0,
			autoAlpha: 1,
			filter: "blur(0px)",
			duration: 0.55,
			ease: "power3.out",
		},
	);
}

// Existing cards glide to their new slots; barely-there ripple from the insertion point.
export function reflow(state: Flip.FlipState): void {
	Flip.from(state, {
		duration: 0.46,
		ease: "power2.out",
		stagger: prefersReduced() ? 0 : 0.015,
	});
}

// Big centered input → bottom dock. applyDocked flips the CSS class; Flip tweens between.
export function dockInput(input: HTMLElement, applyDocked: () => void): void {
	if (prefersReduced()) {
		applyDocked();
		return;
	}
	const state = Flip.getState(input);
	applyDocked();
	Flip.from(state, { duration: 0.5, ease: "power3.out" });
}

export function rejectShake(input: HTMLElement): void {
	if (prefersReduced()) return;
	gsap.killTweensOf(input); // avoid mid-flight snap on a rapid second reject
	gsap.fromTo(
		input,
		{ x: -7 },
		{ x: 0, duration: 0.16, ease: "elastic.out(1,0.4)" },
	);
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
