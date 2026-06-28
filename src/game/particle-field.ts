// Particle field: canvas-based figure that spring-morphs between source images.
// Ported from the auth-waitlist registry component (React) to vanilla TS.
// See docs/superpowers/specs/2026-06-28-particle-field-background-design.md.

type Particle = {
	ox: number;
	oy: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	alpha: number;
	phase: number;
	// Per-particle spring multiplier (0.9..1.1) — decorrelates arrival times during a morph.
	springJitter: number;
	// 0 = invisible, 1 = fully painted. Eases toward 1, or toward 0 while fading.
	appear: number;
	// Surplus particle from a prior shape — fade out and cull.
	fading: boolean;
};

type ParticleTarget = {
	ox: number;
	oy: number;
	size: number;
	alpha: number;
};

export type Align = "center" | "bottom" | "right";

export interface ParticleFieldOptions {
	/** Pixel step when sampling the source image. Lower = denser. */
	sampleStep?: number;
	/** Alpha cutoff 0-255 for including a pixel as a particle. */
	threshold?: number;
	/** Multiplier applied to the canvas rendering versus the sampled image. */
	renderScale?: number;
	/** Base dot size in device pixels. */
	dotSize?: number;
	/** Per-frame lerp factor pulling dots toward their origin (0-1). */
	approach?: number;
	/** How strong the cursor repels dots. */
	mouseForce?: number;
	/** Radius around the cursor that has repelling force, in device pixels. */
	mouseRadius?: number;
	/** Radius of the image-reveal lens at the cursor, in CSS pixels. */
	lensRadius?: number;
	/** Alignment of the particle cluster inside the canvas. */
	align?: Align;
	/** Fraction of the cluster width that fades to transparent on the left edge (0-1). */
	leftFade?: number;
	/** Fraction of the cluster height that fades to transparent at the bottom (0-1). */
	bottomFade?: number;
}

export interface ParticleFieldHandle {
	/** Load an image and spring-migrate particles to the new shape. */
	morphTo: (src: string) => void;
	/** Cancel RAF, disconnect observers, remove listeners. Idempotent. */
	destroy: () => void;
	/** Stop the RAF loop without rebuilding particles. */
	pause: () => void;
	/** Restart the RAF loop. */
	resume: () => void;
}

const LIGHT_FILL = "rgba(10, 12, 16, 1)";
const DARK_FILL = "rgba(255, 255, 255, 0.92)";

const prefersReduced = (): boolean =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createParticleField(
	canvas: HTMLCanvasElement,
	options: ParticleFieldOptions = {},
): ParticleFieldHandle {
	const {
		sampleStep = 4,
		threshold = 45,
		renderScale = 1,
		dotSize = 0.9,
		approach = 0.1,
		mouseForce = 30,
		mouseRadius = 165,
		lensRadius = 150,
		align = "right",
		leftFade = 0.45,
		bottomFade = 0.5,
	} = options;

	const ctx = canvas.getContext("2d", { alpha: true });
	if (!ctx)
		return {
			morphTo: () => {},
			destroy: () => {},
			pause: () => {},
			resume: () => {},
		};

	let particles: Particle[] = [];
	let dpr = Math.min(window.devicePixelRatio || 1, 2);
	let width = 0;
	let height = 0;
	let clusterW = 0;
	let clusterH = 0;
	let offsetX = 0;
	let offsetY = 0;
	let rafId = 0;
	let time = 0;
	let destroyed = false;
	let paused = false;
	let resizeRaf = 0;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	let currentImage: HTMLImageElement | null = null;
	let loadToken = 0;
	let lensCanvas: HTMLCanvasElement | null = null;
	let lensCtx: CanvasRenderingContext2D | null = null;
	let lensW = 0;
	let lensH = 0;
	const reducedMotion = prefersReduced();

	// Cursor repulsion — tracked via window pointer events (the canvas itself
	// is pointer-events: none so clicks pass through to the game UI below).
	const pointer = { x: -9999, y: -9999, active: false };
	const onPointerMove = (e: PointerEvent) => {
		const rect = canvas.getBoundingClientRect();
		pointer.x = e.clientX - rect.left;
		pointer.y = e.clientY - rect.top;
		pointer.active = true;
	};
	const onPointerLeave = () => {
		pointer.active = false;
		pointer.x = -9999;
		pointer.y = -9999;
	};
	window.addEventListener("pointermove", onPointerMove);
	window.addEventListener("pointerleave", onPointerLeave);

	// Dark-mode paint color (media-query based, not class based).
	let fillColor = window.matchMedia("(prefers-color-scheme: dark)").matches
		? DARK_FILL
		: LIGHT_FILL;
	const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
	const onDarkChange = () => {
		fillColor = darkMq.matches ? DARK_FILL : LIGHT_FILL;
	};
	darkMq.addEventListener("change", onDarkChange);

	const ensureCanvasSize = () => {
		const rect = canvas.getBoundingClientRect();
		width = Math.max(1, Math.floor(rect.width));
		height = Math.max(1, Math.floor(rect.height));
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = width * dpr;
		canvas.height = height * dpr;
	};

	const sampleTargets = (image: HTMLImageElement): ParticleTarget[] => {
		if (!image.width || !image.height) return [];

		const srcRatio = image.width / image.height;
		const dstRatio = width / height;

		let drawW = width;
		let drawH = height;
		if (srcRatio > dstRatio) {
			// Image wider than container → fit to width (contain, no crop)
			drawW = width;
			drawH = width / srcRatio;
		} else {
			// Image taller than container → fit to height (contain, no crop)
			drawH = height;
			drawW = height * srcRatio;
		}

		drawW *= renderScale;
		drawH *= renderScale;

		const sw = Math.max(80, Math.floor(drawW / sampleStep));
		const sh = Math.max(80, Math.floor(drawH / sampleStep));

		const off = document.createElement("canvas");
		off.width = sw;
		off.height = sh;
		const offCtx = off.getContext("2d", { willReadFrequently: true });
		if (!offCtx) return [];
		offCtx.drawImage(image, 0, 0, sw, sh);
		let data: Uint8ClampedArray;
		try {
			data = offCtx.getImageData(0, 0, sw, sh).data;
		} catch {
			// Tainted canvas (CORS failure) — degrade silently, keep previous figure.
			return [];
		}

		const cellW = drawW / sw;
		const cellH = drawH / sh;

		clusterW = drawW;
		clusterH = drawH;
		if (align === "right") {
			offsetX = width - clusterW;
			offsetY = (height - clusterH) / 2;
		} else if (align === "bottom") {
			offsetX = (width - clusterW) / 2;
			offsetY = height - clusterH - Math.min(40, height * 0.04);
		} else {
			offsetX = (width - clusterW) / 2;
			offsetY = (height - clusterH) / 2;
		}

		const targets: ParticleTarget[] = [];
		for (let y = 0; y < sh; y++) {
			for (let x = 0; x < sw; x++) {
				const idx = (y * sw + x) * 4;
				const r = data[idx];
				const g = data[idx + 1];
				const b = data[idx + 2];
				const a = data[idx + 3];
				const brightness = (r + g + b) / 3;
				if (a < 200 || brightness < threshold) continue;

				const lum = brightness / 255;
				// Density falloff: skip some mid-gray pixels to keep dots sparse.
				const keep =
					lum > 0.8
						? true
						: lum > 0.5
							? Math.random() < 0.85
							: lum > 0.25
								? Math.random() < 0.55
								: Math.random() < 0.28;
				if (!keep) continue;

				const px = (offsetX + x * cellW + cellW / 2) * dpr;
				const py = (offsetY + y * cellH + cellH / 2) * dpr;
				targets.push({
					ox: px,
					oy: py,
					size: (dotSize + lum * 0.9) * dpr,
					alpha: 0.35 + lum * 0.6,
				});
			}
		}
		return targets;
	};

	const randomSpringJitter = () => 0.9 + Math.random() * 0.2;

	const buildFresh = (image: HTMLImageElement) => {
		if (!image.width || !image.height) return;
		ensureCanvasSize();
		const targets = sampleTargets(image);
		particles = targets.map((t) => ({
			ox: t.ox,
			oy: t.oy,
			x: t.ox + (Math.random() - 0.5) * 40,
			y: t.oy + (Math.random() - 0.5) * 40,
			vx: 0,
			vy: 0,
			size: t.size,
			alpha: t.alpha,
			phase: Math.random() * Math.PI * 2,
			springJitter: randomSpringJitter(),
			appear: 1,
			fading: false,
		}));
	};

	// Fisher-Yates shuffle — decorrelates raster scan order so morph
	// transitions don't sweep in a visible diagonal line.
	const shuffleIndices = (n: number): number[] => {
		const arr = new Array<number>(n);
		for (let i = 0; i < n; i++) arr[i] = i;
		for (let i = n - 1; i > 0; i--) {
			const j = (Math.random() * (i + 1)) | 0;
			const tmp = arr[i];
			arr[i] = arr[j];
			arr[j] = tmp;
		}
		return arr;
	};

	// Re-home existing particles onto a new figure so they spring-migrate
	// instead of snapping. Both arrays are shuffled before pairing so motion
	// is spatially decorrelated. Surplus particles fade in place; new
	// particles spawn on a small ring around their destination.
	const morphParticles = (image: HTMLImageElement) => {
		if (!image.width || !image.height) return;
		if (particles.length === 0) {
			buildFresh(image);
			return;
		}
		ensureCanvasSize();
		const targets = sampleTargets(image);

		const n = particles.length;
		const m = targets.length;
		const matched = Math.min(n, m);
		const pOrder = shuffleIndices(n);
		const tOrder = shuffleIndices(m);

		for (let k = 0; k < matched; k++) {
			const p = particles[pOrder[k]];
			const t = targets[tOrder[k]];
			p.ox = t.ox;
			p.oy = t.oy;
			p.size = t.size;
			p.alpha = t.alpha;
			p.fading = false;
			p.springJitter = randomSpringJitter();
			p.vx = 0;
			p.vy = 0;
			// Reset position for reduced-motion so the figure snaps, not eases.
			if (reducedMotion) {
				p.x = t.ox;
				p.y = t.oy;
			}
		}

		for (let k = matched; k < n; k++) {
			particles[pOrder[k]].fading = true;
		}

		for (let k = matched; k < m; k++) {
			const t = targets[tOrder[k]];
			const angle = Math.random() * Math.PI * 2;
			const dist = (20 + Math.random() * 40) * dpr;
			particles.push({
				ox: t.ox,
				oy: t.oy,
				x: reducedMotion ? t.ox : t.ox + Math.cos(angle) * dist,
				y: reducedMotion ? t.oy : t.oy + Math.sin(angle) * dist,
				vx: 0,
				vy: 0,
				size: t.size,
				alpha: t.alpha,
				phase: Math.random() * Math.PI * 2,
				springJitter: randomSpringJitter(),
				appear: 0,
				fading: false,
			});
		}
	};

	const render = () => {
		if (destroyed) return;
		if (!paused) {
			time += 0.016;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = fillColor;

			// Edge fades relative to the cluster's actual bounds, not the canvas.
			// Left + bottom: soft gradient. Right + top: sharp cutoff so particles
			// that bounce beyond the cluster during morphs/hover are hidden.
			const cL = offsetX * dpr;
			const cR = (offsetX + clusterW) * dpr;
			const cT = offsetY * dpr;
			const cB = (offsetY + clusterH) * dpr;
			const fw = clusterW * leftFade * dpr;
			const fh = clusterH * bottomFade * dpr;
			// Right/top cutoff: fixed 7% of cluster, decoupled from left/bottom fade.
			const cutoffW = clusterW * 0.07 * dpr;
			const cutoffH = clusterH * 0.07 * dpr;
			const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

			let writeIdx = 0;
			for (let i = 0; i < particles.length; i++) {
				const p = particles[i];

				if (!reducedMotion) {
					const dxo = p.ox - p.x;
					const dyo = p.oy - p.y;
					const rate = approach * p.springJitter;
					p.x += dxo * rate;
					p.y += dyo * rate;

					if (pointer.active) {
						const dx = p.x - pointer.x * dpr;
						const dy = p.y - pointer.y * dpr;
						const d2 = dx * dx + dy * dy;
						const mr = mouseRadius * dpr;
						if (d2 < mr * mr && d2 > 0.0001) {
							const d = Math.sqrt(d2);
							const force = (1 - d / mr) * mouseForce;
							p.vx += (dx / d) * force * 0.04;
							p.vy += (dy / d) * force * 0.04;
						}
					}

					p.vx *= 0.9;
					p.vy *= 0.9;
					p.x += p.vx;
					p.y += p.vy;

					p.x += Math.sin(time * 0.8 + p.phase) * 0.004;
					p.y += Math.cos(time * 0.9 + p.phase) * 0.003;
				}

				const appearTarget = p.fading ? 0 : 1;
				p.appear += (appearTarget - p.appear) * 0.08;

				if (p.fading && p.appear < 0.02) continue;

				const twinkle = reducedMotion
					? 1
					: 0.85 + Math.sin(time * 1.4 + p.phase) * 0.15;

				// Edge fades relative to the cluster's actual bounds, not the canvas.
				// Left + bottom: soft gradient. Right + top: sharp cutoff so particles
				// that bounce beyond the cluster during morphs/hover are hidden.
				const edgeFade =
					clamp01((p.x - cL) / fw) *
					clamp01((cR - p.x) / cutoffW) *
					clamp01((cB - p.y) / fh) *
					clamp01((p.y - cT) / cutoffH);

				ctx.globalAlpha = p.alpha * p.appear * twinkle * edgeFade;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fill();

				if (writeIdx !== i) particles[writeIdx] = p;
				writeIdx++;
			}
			if (writeIdx !== particles.length) particles.length = writeIdx;
			ctx.globalAlpha = 1;

			// Image-reveal lens: draw the real colored photo through a soft
			// spotlight gradient at the cursor. Edge fades are applied so the
			// lens respects the left/bottom cluster masks.
			if (pointer.active && currentImage?.width) {
				if (!lensCanvas) {
					lensCanvas = document.createElement("canvas");
					lensCtx = lensCanvas.getContext("2d");
				}
				if (lensCtx) {
					if (lensW !== canvas.width || lensH !== canvas.height) {
						lensCanvas.width = canvas.width;
						lensCanvas.height = canvas.height;
						lensW = canvas.width;
						lensH = canvas.height;
					}
					lensCtx.clearRect(0, 0, lensCanvas.width, lensCanvas.height);

					// Draw the image at its contain-fit position
					lensCtx.drawImage(
						currentImage,
						offsetX * dpr,
						offsetY * dpr,
						clusterW * dpr,
						clusterH * dpr,
					);

					// Erase edges with destination-out gradient strips
					lensCtx.globalCompositeOperation = "destination-out";
					// Left fade
					const lg = lensCtx.createLinearGradient(cL, 0, cL + fw, 0);
					lg.addColorStop(0, "rgba(0,0,0,1)");
					lg.addColorStop(1, "rgba(0,0,0,0)");
					lensCtx.fillStyle = lg;
					lensCtx.fillRect(cL, 0, fw, lensCanvas.height);
					// Right cutoff
					const rg = lensCtx.createLinearGradient(cR - cutoffW, 0, cR, 0);
					rg.addColorStop(0, "rgba(0,0,0,0)");
					rg.addColorStop(1, "rgba(0,0,0,1)");
					lensCtx.fillStyle = rg;
					lensCtx.fillRect(cR - cutoffW, 0, cutoffW, lensCanvas.height);
					// Bottom fade
					const bg = lensCtx.createLinearGradient(0, cB - fh, 0, cB);
					bg.addColorStop(0, "rgba(0,0,0,0)");
					bg.addColorStop(1, "rgba(0,0,0,1)");
					lensCtx.fillStyle = bg;
					lensCtx.fillRect(0, cB - fh, lensCanvas.width, fh);
					// Top cutoff
					const tg = lensCtx.createLinearGradient(0, cT, 0, cT + cutoffH);
					tg.addColorStop(0, "rgba(0,0,0,1)");
					tg.addColorStop(1, "rgba(0,0,0,0)");
					lensCtx.fillStyle = tg;
					lensCtx.fillRect(0, cT, lensCanvas.width, cutoffH);

					// Apply the spotlight gradient mask (keep only under the cursor)
					lensCtx.globalCompositeOperation = "destination-in";
					const px = pointer.x * dpr;
					const py = pointer.y * dpr;
					const r = lensRadius * dpr;
					const grad = lensCtx.createRadialGradient(px, py, 0, px, py, r);
					grad.addColorStop(0, "rgba(255,255,255,1)");
					grad.addColorStop(0.3, "rgba(255,255,255,1)");
					grad.addColorStop(0.7, "rgba(255,255,255,0.3)");
					grad.addColorStop(1, "rgba(255,255,255,0)");
					lensCtx.fillStyle = grad;
					lensCtx.fillRect(0, 0, lensCanvas.width, lensCanvas.height);
					lensCtx.globalCompositeOperation = "source-over";

					ctx.globalAlpha = 0.6;
					ctx.drawImage(lensCanvas, 0, 0);
					ctx.globalAlpha = 1;
				}
			}
		}
		rafId = requestAnimationFrame(render);
	};

	const ro = new ResizeObserver(() => {
		if (resizeRaf) cancelAnimationFrame(resizeRaf);
		resizeRaf = requestAnimationFrame(() => {
			if (resizeTimer) clearTimeout(resizeTimer);
			// Drag-resizing can fire continuously; debounce expensive resampling.
			resizeTimer = setTimeout(() => {
				if (currentImage) buildFresh(currentImage);
			}, 120);
		});
	});
	ro.observe(canvas);

	const loadAndApply = (nextSrc: string, asMorph: boolean) => {
		const token = ++loadToken;
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.decoding = "async";
		image.onload = () => {
			if (destroyed || token !== loadToken) return;
			currentImage = image;
			if (asMorph) morphParticles(image);
			else buildFresh(image);
		};
		image.src = nextSrc;
	};

	const onVisibilityChange = () => {
		if (document.hidden) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		} else if (!destroyed && !paused) {
			rafId = requestAnimationFrame(render);
		}
	};
	document.addEventListener("visibilitychange", onVisibilityChange);

	rafId = requestAnimationFrame(render);

	return {
		morphTo: (src: string) => loadAndApply(src, true),
		destroy: () => {
			destroyed = true;
			cancelAnimationFrame(rafId);
			if (resizeRaf) cancelAnimationFrame(resizeRaf);
			if (resizeTimer) clearTimeout(resizeTimer);
			ro.disconnect();
			darkMq.removeEventListener("change", onDarkChange);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerleave", onPointerLeave);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			lensCanvas = null;
			lensCtx = null;
		},
		pause: () => {
			paused = true;
			if (rafId) {
				cancelAnimationFrame(rafId);
				rafId = 0;
			}
		},
		resume: () => {
			paused = false;
			if (!rafId && !destroyed) rafId = requestAnimationFrame(render);
		},
	};
}
