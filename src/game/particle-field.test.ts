import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createParticleField } from "./particle-field";

// Minimal browser-API mocks for the canvas/image/RAF/observer the engine needs.
function mockCtx() {
	return {
		clearRect: () => {},
		fillRect: () => {},
		beginPath: () => {},
		arc: () => {},
		fill: () => {},
		drawImage: () => {},
		getImageData: () => ({
			// 2x2 all-white, full-alpha so every pixel passes threshold
			data: new Uint8ClampedArray([
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255,
			]),
		}),
		globalAlpha: 1,
		fillStyle: "",
	} as unknown as CanvasRenderingContext2D;
}

function mockCanvas(w = 800, h = 600): HTMLCanvasElement {
	const ctx = mockCtx();
	return {
		getContext: () => ctx,
		getBoundingClientRect: () => ({
			width: w,
			height: h,
			x: 0,
			y: 0,
			top: 0,
			left: 0,
			right: w,
			bottom: h,
			toJSON: () => {},
		}),
		width: w,
		height: h,
		style: {},
	} as unknown as HTMLCanvasElement;
}

const originals: Record<string, unknown> = {};

beforeEach(() => {
	// ResizeObserver
	originals.ResizeObserver = globalThis.ResizeObserver;
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	// requestAnimationFrame / cancelAnimationFrame
	originals.requestAnimationFrame = globalThis.requestAnimationFrame;
	originals.cancelAnimationFrame = globalThis.cancelAnimationFrame;
	globalThis.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
	globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

	// matchMedia
	originals.matchMedia = globalThis.matchMedia;
	globalThis.matchMedia = ((q: string) => ({
		matches: false,
		media: q,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof matchMedia;

	// Image — setting src triggers onload async
	originals.Image = globalThis.Image;
	globalThis.Image = class {
		onload: (() => void) | null = null;
		crossOrigin: string | null = null;
		decoding = "async";
		width = 100;
		height = 150;
		_src = "";
		set src(v: string) {
			this._src = v;
			if (this.onload) setTimeout(this.onload, 0);
		}
		get src() {
			return this._src;
		}
	} as unknown as typeof Image;

	// document (Bun has no DOM)
	originals.document = (globalThis as Record<string, unknown>).document;
	(globalThis as Record<string, unknown>).document = {
		createElement: (tag: string) => {
			if (tag === "canvas") return mockCanvas(80, 80);
			return {} as HTMLElement;
		},
		addEventListener: () => {},
		removeEventListener: () => {},
		hidden: false,
	};

	// window
	originals.window = (globalThis as Record<string, unknown>).window;
	(globalThis as Record<string, unknown>).window = {
		devicePixelRatio: 1,
		matchMedia: globalThis.matchMedia,
	};

	originals.devicePixelRatio = (
		globalThis as Record<string, unknown>
	).devicePixelRatio;
	(globalThis as Record<string, unknown>).devicePixelRatio = 1;
});

afterEach(() => {
	for (const [key, val] of Object.entries(originals)) {
		if (val === undefined) {
			delete (globalThis as Record<string, unknown>)[key];
		} else {
			(globalThis as Record<string, unknown>)[key] = val;
		}
	}
});

describe("createParticleField", () => {
	it("returns a handle with morphTo, destroy, pause, resume", () => {
		const field = createParticleField(mockCanvas());
		expect(typeof field.morphTo).toBe("function");
		expect(typeof field.destroy).toBe("function");
		expect(typeof field.pause).toBe("function");
		expect(typeof field.resume).toBe("function");
		field.destroy();
	});

	it("morphTo loads an image and populates particles without throwing", async () => {
		const field = createParticleField(mockCanvas());
		field.morphTo("https://example.org/portrait.jpg");
		// Wait for the mocked Image onload to fire
		await new Promise((r) => setTimeout(r, 10));
		field.destroy();
	});

	it("destroy is idempotent", () => {
		const field = createParticleField(mockCanvas());
		field.destroy();
		field.destroy();
	});

	it("pause and resume do not throw", () => {
		const field = createParticleField(mockCanvas());
		field.pause();
		field.resume();
		field.destroy();
	});

	it("returns a no-op handle when getContext returns null", () => {
		const canvas = {
			getContext: () => null,
			getBoundingClientRect: () => ({ width: 100, height: 100 }),
		} as unknown as HTMLCanvasElement;
		const field = createParticleField(canvas);
		expect(typeof field.morphTo).toBe("function");
		field.morphTo("anything");
		field.destroy();
	});
});
