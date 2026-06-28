export const ROUND_SECONDS = 60;

export type Phase = "idle" | "playing" | "over";

export interface NamedWoman {
	id: number;
	title: string;
}

export interface GameState {
	phase: Phase;
	named: NamedWoman[];
	timeLeft: number;
}

export type Action =
	| { type: "START" }
	| { type: "ACCEPT"; woman: NamedWoman }
	| { type: "TICK" }
	| { type: "END" }
	| { type: "RESET" };

export function initialState(): GameState {
	return { phase: "idle", named: [], timeLeft: ROUND_SECONDS };
}

export function reduce(state: GameState, action: Action): GameState {
	switch (action.type) {
		case "START":
			return { phase: "playing", named: [], timeLeft: ROUND_SECONDS };
		case "ACCEPT": {
			if (state.phase !== "playing") return state;
			if (state.named.some((n) => n.id === action.woman.id)) return state;
			return { ...state, named: [action.woman, ...state.named] };
		}
		case "TICK": {
			if (state.phase !== "playing") return state;
			const timeLeft = state.timeLeft - 1;
			return timeLeft <= 0
				? { ...state, timeLeft: 0, phase: "over" }
				: { ...state, timeLeft };
		}
		case "END":
			return { ...state, phase: "over" };
		case "RESET":
			return initialState();
	}
}
