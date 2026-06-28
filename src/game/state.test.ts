import { describe, expect, it } from "bun:test";
import { initialState, ROUND_SECONDS, reduce } from "./state";

describe("reduce", () => {
	it("starts idle with an empty round", () => {
		const s = initialState();
		expect(s.phase).toBe("idle");
		expect(s.named).toEqual([]);
		expect(s.timeLeft).toBe(ROUND_SECONDS);
	});

	it("START moves to playing and resets the clock", () => {
		const s = reduce(
			{ phase: "idle", named: [], timeLeft: ROUND_SECONDS },
			{ type: "START" },
		);
		expect(s.phase).toBe("playing");
		expect(s.timeLeft).toBe(ROUND_SECONDS);
	});

	it("ACCEPT prepends the woman and increments the score", () => {
		let s = reduce(initialState(), { type: "START" });
		s = reduce(s, {
			type: "ACCEPT",
			woman: { id: 7186, title: "Marie Curie" },
		});
		s = reduce(s, {
			type: "ACCEPT",
			woman: { id: 5588, title: "Ada Lovelace" },
		});
		expect(s.named.map((n) => n.id)).toEqual([5588, 7186]); // newest first
		expect(s.named.length).toBe(2);
	});

	it("ACCEPT ignores a duplicate id", () => {
		let s = reduce(initialState(), { type: "START" });
		s = reduce(s, {
			type: "ACCEPT",
			woman: { id: 7186, title: "Marie Curie" },
		});
		s = reduce(s, {
			type: "ACCEPT",
			woman: { id: 7186, title: "Marie Curie" },
		});
		expect(s.named.length).toBe(1);
	});

	it("ACCEPT is ignored unless playing", () => {
		const s = reduce(initialState(), {
			type: "ACCEPT",
			woman: { id: 1, title: "x" },
		});
		expect(s.named.length).toBe(0);
	});

	it("TICK decrements and ends the round at zero", () => {
		let s = { phase: "playing" as const, named: [], timeLeft: 2 };
		s = reduce(s, { type: "TICK" });
		expect(s.timeLeft).toBe(1);
		expect(s.phase).toBe("playing");
		s = reduce(s, { type: "TICK" });
		expect(s.timeLeft).toBe(0);
		expect(s.phase).toBe("over");
	});

	it("RESET returns to a fresh idle round", () => {
		const s = reduce(
			{ phase: "over", named: [{ id: 1, title: "x" }], timeLeft: 0 },
			{ type: "RESET" },
		);
		expect(s).toEqual(initialState());
	});
});
