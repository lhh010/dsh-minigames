window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-minigames",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/games/registry.ts
		const games = /* @__PURE__ */ new Map();
		/**
		* Register a game definition. Duplicate ids fail loud so a name collision
		* cannot silently shadow an existing game.
		* @param definition - the game to add.
		* @returns the same definition (for chaining in index files).
		*/
		function registerGame(definition) {
			if (games.has(definition.id)) throw new Error(`dsh-minigames: game "${definition.id}" is already registered`);
			games.set(definition.id, definition);
			return definition;
		}
		/**
		* All registered games, in registration order.
		* @returns a fresh snapshot array (callers may sort/filter freely).
		*/
		function getGames() {
			return [...games.values()];
		}
		/**
		* Look up one game by id.
		* @param id - the game id.
		* @returns the definition, or undefined when not registered.
		*/
		function getGame(id) {
			return games.get(id);
		}
		const GRAVITY$4 = 2100;
		const JUMP_V = -640;
		const BASE_SPEED$4 = 320;
		const MAX_SPEED$4 = 760;
		/** Speed gain per score point (speed = BASE + score * this, capped at MAX). */
		const SPEED_PER_SCORE = .15;
		const SPAWN_MIN$1 = 1.1;
		const SPAWN_MAX$1 = 2.4;
		/** Spawn interval shrinks with score — denser obstacle fields in the late game. */
		const SPAWN_SCALE = 4e-4;
		const SPAWN_FLOOR = .5;
		/** Forgiving hitbox shrink on both axes, in px. */
		const HITBOX_SHRINK = 4;
		/** A new run at the starting line. */
		function createDinoState(rng = Math.random) {
			return {
				t: 0,
				speed: BASE_SPEED$4,
				distance: 0,
				score: 0,
				night: false,
				raining: false,
				lightning: 0,
				nextStrikeIn: 4,
				dino: {
					x: 60,
					y: 115,
					vy: 0,
					onGround: true,
					ducking: false
				},
				obstacles: [],
				nextSpawnIn: 1.5,
				over: false,
				rng
			};
		}
		/** The dino's current collision rect: follows the jump, ducking shrinks it. */
		function dinoRect(state) {
			const dino = state.dino;
			if (dino.ducking && dino.onGround) return {
				x: dino.x,
				y: 139,
				w: 46,
				h: 26
			};
			return {
				x: dino.x,
				y: dino.y,
				w: 46,
				h: 50
			};
		}
		/** Shrunk AABB overlap test — the forgiving hitbox the runner actually uses. */
		function collides$1(a, b) {
			const ax0 = a.x + HITBOX_SHRINK;
			const ax1 = a.x + a.w - HITBOX_SHRINK;
			const ay0 = a.y + HITBOX_SHRINK;
			const ay1 = a.y + a.h - HITBOX_SHRINK;
			const bx0 = b.x + HITBOX_SHRINK;
			const bx1 = b.x + b.w - HITBOX_SHRINK;
			const by0 = b.y + HITBOX_SHRINK;
			const by1 = b.y + b.h - HITBOX_SHRINK;
			return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
		}
		/** Roll one obstacle at the right edge of the viewport. */
		function spawnObstacle(state) {
			const rng = state.rng;
			const roll = rng();
			if (roll < .4) {
				const w = 22 + rng() * 8;
				const h = 40 + rng() * 12;
				state.obstacles.push({
					kind: "cactus",
					x: 600,
					w,
					h,
					y: 165 - h
				});
			} else if (roll < .65) {
				const w = 46 + rng() * 10;
				const h = 40 + rng() * 12;
				state.obstacles.push({
					kind: "cactus-double",
					x: 600,
					w,
					h,
					y: 165 - h
				});
			} else {
				const w = 46;
				const h = 30;
				const kindRoll = rng();
				if (kindRoll < .3) state.obstacles.push({
					kind: "bird",
					x: 600,
					w,
					h,
					y: 47
				});
				else if (kindRoll < .75) state.obstacles.push({
					kind: "bird",
					x: 600,
					w,
					h,
					y: 105
				});
				else state.obstacles.push({
					kind: "bird-ground",
					x: 600,
					w,
					h,
					y: 135
				});
			}
		}
		/**
		* Advance the run by dt seconds.
		* @param state - the run state (mutated in place).
		* @param dt - elapsed seconds (clamp to <=1/30 upstream).
		* @param input - this frame's input.
		*/
		function step$10(state, dt, input) {
			if (state.over) return;
			state.t += dt;
			state.distance += state.speed * dt;
			state.score = Math.floor(state.distance / 10);
			state.night = Math.floor(state.score / 800) % 2 === 1;
			state.raining = state.score >= 1e3 && state.score % 1e3 < 300;
			if (state.raining) {
				state.lightning = Math.max(0, state.lightning - dt * 7);
				if (state.lightning === 0) {
					state.nextStrikeIn -= dt;
					if (state.nextStrikeIn <= 0) {
						state.lightning = 1;
						state.nextStrikeIn = 3 + state.rng() * 5;
					}
				}
			} else state.lightning = 0;
			state.speed = Math.min(MAX_SPEED$4, BASE_SPEED$4 + state.score * SPEED_PER_SCORE);
			const dino = state.dino;
			if (input.jump && dino.onGround) {
				dino.vy = JUMP_V;
				dino.onGround = false;
			}
			if (!dino.onGround) {
				dino.vy += GRAVITY$4 * dt;
				dino.y += dino.vy * dt;
				const floor = 115;
				if (dino.y >= floor) {
					dino.y = floor;
					dino.vy = 0;
					dino.onGround = true;
				}
			}
			dino.ducking = input.duck && dino.onGround;
			const speed = state.speed;
			const remaining = [];
			for (const obstacle of state.obstacles) {
				obstacle.x -= speed * dt;
				if (obstacle.x + obstacle.w >= 0) remaining.push(obstacle);
			}
			state.obstacles = remaining;
			state.nextSpawnIn -= dt;
			if (state.nextSpawnIn <= 0) {
				spawnObstacle(state);
				const shrink = state.score * SPAWN_SCALE;
				const min = Math.max(SPAWN_FLOOR, SPAWN_MIN$1 - shrink);
				const max = Math.max(min + .3, SPAWN_MAX$1 - shrink);
				state.nextSpawnIn = min + state.rng() * (max - min);
			}
			const rect = dinoRect(state);
			for (const obstacle of state.obstacles) if (collides$1(rect, obstacle)) {
				state.over = true;
				return;
			}
		}
		//#endregion
		//#region src/client/games/theme.ts
		/**
		* Shared visual kit for all games: one palette, one background, one particle
		* system, one overlay style. Games keep their own layout code and call into
		* these helpers so the whole panel reads as one product.
		*
		* All helpers are pure canvas drawing (no DOM, no state beyond the particle
		* pool a game owns through {@link createParticles}).
		*/
		/** The panel palette (Tokyo-Night-inspired, harmonious on the #15151b shell). */
		const THEME = {
			bgTop: "#181822",
			bgBottom: "#10101a",
			panel: "#1e1e2a",
			panelEdge: "#34344a",
			text: "#e2e2ee",
			textMuted: "rgba(226,226,238,0.55)",
			/** Ordered accent ramp games pick stable indices from. */
			accents: [
				"#7aa2f7",
				"#bb9af7",
				"#9ece6a",
				"#e0af68",
				"#f7768e",
				"#7dcfff",
				"#ff9e64",
				"#73daca"
			],
			good: "#9ece6a",
			bad: "#f7768e",
			gold: "#e0af68"
		};
		/** A stable accent by index (wraps). */
		function accent(index) {
			return THEME.accents[(index % THEME.accents.length + THEME.accents.length) % THEME.accents.length];
		}
		/** Fill the whole logical canvas with the shared vertical gradient. */
		function drawBackground(ctx, w, h) {
			const gradient = ctx.createLinearGradient(0, 0, 0, h);
			gradient.addColorStop(0, THEME.bgTop);
			gradient.addColorStop(1, THEME.bgBottom);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, w, h);
		}
		/** A soft outer glow for a shape about to be filled with `color`. */
		function glow(ctx, color, blur = 10) {
			ctx.shadowColor = color;
			ctx.shadowBlur = blur;
		}
		/** Clear the glow set by {@link glow}. */
		function noGlow(ctx) {
			ctx.shadowBlur = 0;
			ctx.shadowColor = "transparent";
		}
		/** Rounded rect path helper (fills/strokes are the caller's choice). */
		function roundRectPath(ctx, x, y, w, h, r) {
			ctx.beginPath();
			ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
		}
		/** One HUD line: a muted label followed by a bright value. */
		function hudPair(ctx, x, y, label, value, align = "left", valueColor = THEME.text) {
			ctx.font = "600 13px system-ui, sans-serif";
			if (align === "right") {
				ctx.textAlign = "right";
				const valueWidth = ctx.measureText(value).width;
				ctx.fillStyle = valueColor;
				ctx.fillText(value, x, y);
				ctx.fillStyle = THEME.textMuted;
				ctx.fillText(label, x - valueWidth - 6, y);
				return;
			}
			ctx.textAlign = align;
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText(label, x, y);
			ctx.fillStyle = valueColor;
			ctx.fillText(value, x + ctx.measureText(label + " ").width, y);
		}
		/** The shared end/pause veil: dark cover, spaced title, muted subtitle. */
		function drawOverlay(ctx, w, h, title, subtitle, titleColor = THEME.text) {
			ctx.fillStyle = "rgba(13,13,20,0.74)";
			ctx.fillRect(0, 0, w, h);
			ctx.textAlign = "center";
			ctx.font = "bold 26px system-ui, sans-serif";
			ctx.fillStyle = titleColor;
			ctx.fillText(spaced(title), w / 2, h / 2 - 8);
			ctx.font = "600 13px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText(subtitle, w / 2, h / 2 + 20);
		}
		/** Letter-space a CJK/latin title for the overlay look ('游戏结束' → '游 戏 结 束'). */
		function spaced(text) {
			return [...text].join(" ");
		}
		function createParticles() {
			const pool = [];
			const spawn = (x, y, color, speed) => {
				if (pool.length >= 160) pool.shift();
				const angle = Math.random() * Math.PI * 2;
				const v = speed * (.35 + Math.random() * .65);
				pool.push({
					x,
					y,
					vx: Math.cos(angle) * v,
					vy: Math.sin(angle) * v - speed * .25,
					life: 0,
					maxLife: 380 + Math.random() * 320,
					size: 2 + Math.random() * 3,
					color,
					circle: Math.random() < .5
				});
			};
			return {
				burst(x, y, color, count = 10, speed = 130) {
					for (let i = 0; i < count; i += 1) spawn(x, y, color, speed);
				},
				tick(ctx, dtMs) {
					const dt = dtMs / 1e3;
					for (let i = pool.length - 1; i >= 0; i -= 1) {
						const p = pool[i];
						p.life += dtMs;
						if (p.life >= p.maxLife) {
							pool.splice(i, 1);
							continue;
						}
						p.x += p.vx * dt;
						p.y += p.vy * dt;
						p.vy += 260 * dt;
						const alpha = 1 - p.life / p.maxLife;
						ctx.globalAlpha = alpha;
						ctx.fillStyle = p.color;
						glow(ctx, p.color, 6);
						if (p.circle) {
							ctx.beginPath();
							ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
							ctx.fill();
						} else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
						noGlow(ctx);
					}
					ctx.globalAlpha = 1;
				},
				size() {
					return pool.length;
				}
			};
		}
		//#endregion
		//#region src/client/games/dino/render.ts
		const particles$26 = createParticles();
		let prevOver$3 = false;
		let prevNow$6 = 0;
		const DAY = {
			bgTop: "#f4f1e9",
			bgBottom: "#e4e0d4",
			dino: "#2e2e35",
			dinoShade: "#8a8a96",
			cactus: accent(2),
			cactusDark: "#3d7a46",
			bird: "#8f8f9c",
			birdDark: "#5f5f6c",
			beak: THEME.gold,
			ground: "#6f6f7a",
			groundDash: "#c2bdb1",
			cloud: "#d9d5c9",
			text: "#4a4a55",
			eye: "#ffffff",
			fog: "#c8d2da",
			rain: accent(5)
		};
		const NIGHT = {
			bgTop: THEME.bgTop,
			bgBottom: THEME.bgBottom,
			dino: THEME.text,
			dinoShade: THEME.textMuted,
			cactus: accent(2),
			cactusDark: "#45834d",
			bird: "#c6c6d2",
			birdDark: "#8f8fa0",
			beak: THEME.gold,
			ground: THEME.panelEdge,
			groundDash: "#3c3c50",
			cloud: "#2e2e38",
			text: THEME.text,
			eye: "#ffffff",
			fog: "#8b96b5",
			rain: accent(5)
		};
		/** Draw one frame of the run. */
		function renderDino(ctx, state) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$6));
			prevNow$6 = now;
			const p = state.night ? NIGHT : DAY;
			if (state.night) drawBackground(ctx, 600, 185);
			else {
				const sky = ctx.createLinearGradient(0, 0, 0, 185);
				sky.addColorStop(0, p.bgTop);
				sky.addColorStop(1, p.bgBottom);
				ctx.fillStyle = sky;
				ctx.fillRect(0, 0, 600, 185);
			}
			drawClouds(ctx, state, p);
			drawGround$1(ctx, state, p);
			for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.t, p);
			drawDino(ctx, state, p);
			if (state.raining) {
				drawFog$1(ctx, state, p);
				drawRain(ctx, state, p);
			}
			if (state.over && !prevOver$3) particles$26.burst(state.dino.x + 23, state.dino.y + 25, THEME.bad, 16, 170);
			prevOver$3 = state.over;
			particles$26.tick(ctx, dt);
			hudPair(ctx, 588, 22, "", String(Math.floor(state.score)).padStart(5, "0"), "right", p.text);
			if (state.over) drawGameOver(ctx, state);
			if (state.lightning > 0) {
				ctx.fillStyle = `rgba(255,255,255,${Math.min(.95, state.lightning).toFixed(3)})`;
				ctx.fillRect(0, 0, 600, 185);
			}
		}
		/** Drifting fog: a translucent wash plus soft blobs that obscure the view. */
		function drawFog$1(ctx, state, p) {
			ctx.globalAlpha = .2;
			ctx.fillStyle = p.fog;
			ctx.fillRect(0, 0, 600, 185);
			ctx.globalAlpha = 1;
			for (let i = 0; i < 6; i += 1) {
				const x = (state.t * 26 + i * 173) % 940 - 170;
				const y = 34 + i * 41 % 120;
				ctx.globalAlpha = .17;
				ctx.fillStyle = p.fog;
				ctx.beginPath();
				ctx.ellipse(x, y, 84 + i % 3 * 18, 30 + i % 2 * 12, 0, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		}
		/** Drifting slanted rain streaks. */
		function drawRain(ctx, state, p) {
			ctx.strokeStyle = p.rain;
			ctx.lineWidth = 1.5;
			for (let i = 0; i < 26; i += 1) {
				const y = (state.t * 780 + i * 43) % 245 - 30;
				const x = i * 61 % 600 - 20 + i % 4 * 6;
				ctx.globalAlpha = .4;
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.lineTo(x - 11, y + 26);
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
		}
		/** Slow-drifting background clouds for depth. */
		function drawClouds(ctx, state, p) {
			ctx.fillStyle = p.cloud;
			for (let i = 0; i < 3; i += 1) {
				const x = (state.t * 12 + i * 140) % 820 - 110;
				const y = 26 + i * 37 % 40;
				ctx.beginPath();
				ctx.arc(x, y, 9, 0, Math.PI * 2);
				ctx.arc(x + 12, y - 4, 7, 0, Math.PI * 2);
				ctx.arc(x + 24, y, 8, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		function drawGround$1(ctx, state, p) {
			ctx.fillStyle = p.ground;
			ctx.fillRect(0, 165, 600, 2);
			const gap = 34;
			const offset = state.t * state.speed % gap;
			ctx.fillStyle = p.groundDash;
			for (let x = -offset; x < 600; x += gap) ctx.fillRect(x, 172, 14, 2);
			for (let x = -offset - gap / 2; x < 600; x += gap) {
				ctx.globalAlpha = .4;
				ctx.fillRect(x, 178, 10, 2);
				ctx.globalAlpha = 1;
			}
		}
		function drawObstacle(ctx, obstacle, t, p) {
			if (obstacle.kind === "cactus" || obstacle.kind === "cactus-double") {
				if (obstacle.kind === "cactus-double") {
					const trunk = Math.max(14, Math.floor((obstacle.w - 6) / 2));
					const gap = obstacle.w - trunk * 2;
					drawCactus(ctx, obstacle.x, obstacle.y, trunk, obstacle.h, p);
					drawCactus(ctx, obstacle.x + trunk + gap, obstacle.y, trunk, obstacle.h, p);
					return;
				}
				drawCactus(ctx, obstacle.x, obstacle.y, obstacle.w, obstacle.h, p);
			} else drawBird(ctx, obstacle, t, p);
		}
		/** A rounded two-tone cactus with an arm on each side. */
		function drawCactus(ctx, x, y, w, h, p) {
			const r = w * .42;
			const arm = Math.max(6, w * .38);
			const leftY = y + h * .24;
			const rightY = y + h * .48;
			ctx.fillStyle = p.cactus;
			ctx.beginPath();
			ctx.roundRect(x - arm - 4, leftY, arm + 4, 4.5, 2);
			ctx.fill();
			ctx.beginPath();
			ctx.roundRect(x - arm, leftY - 7, 4.5, 7, 2);
			ctx.fill();
			ctx.beginPath();
			ctx.roundRect(x + w, rightY, arm + 4, 4.5, 2);
			ctx.fill();
			ctx.beginPath();
			ctx.roundRect(x + w, rightY - 7, 4.5, 7, 2);
			ctx.fill();
			ctx.fillStyle = p.cactus;
			glow(ctx, p.cactus, 8);
			roundRectPath(ctx, x, y, w, h, r);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = p.cactusDark;
			ctx.beginPath();
			ctx.roundRect(x + w - 5, y + 2, 5, h - 4, 2);
			ctx.fill();
			ctx.globalAlpha = .25;
			ctx.fillStyle = p.cactusDark;
			ctx.fillRect(x + w * .3, y + 6, 2.5, h - 10);
			ctx.fillRect(x + w * .62, y + 6, 2.5, h - 10);
			ctx.globalAlpha = 1;
			ctx.fillStyle = "rgba(255,255,255,0.18)";
			ctx.beginPath();
			ctx.ellipse(x + w * .3, y + 3, w * .18, 2.5, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		/** A plump bird with a flapping wing, eye, beak and tail. */
		function drawBird(ctx, o, t, p) {
			const x = o.x;
			const y = o.y;
			ctx.fillStyle = p.bird;
			ctx.beginPath();
			ctx.moveTo(x + 36, y + 13);
			ctx.lineTo(x + 46, y + 9);
			ctx.lineTo(x + 38, y + 19);
			ctx.closePath();
			ctx.fill();
			ctx.beginPath();
			ctx.ellipse(x + 24, y + 16, 15, 10.5, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.arc(x + 11, y + 8.5, 6.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = p.beak;
			ctx.beginPath();
			ctx.moveTo(x + 3, y + 7);
			ctx.lineTo(x - 3, y + 10);
			ctx.lineTo(x + 5, y + 11);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = p.eye === "#ffffff" ? "#202028" : "#ffffff";
			ctx.beginPath();
			ctx.arc(x + 10, y + 7, 1.8, 0, Math.PI * 2);
			ctx.fill();
			const flap = Math.sin(t * 22) * 5;
			ctx.fillStyle = p.birdDark;
			ctx.beginPath();
			ctx.ellipse(x + 24, y + 10.5 + flap * .6, 9, 5, -.35, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "rgba(255,255,255,0.16)";
			ctx.beginPath();
			ctx.ellipse(x + 28, y + 15, 7, 4.5, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		/** The dino sprite as a pixel matrix (17 rows x 18 cols): 1 = body, 0 = empty.
		* The lone 0 inside the head (row 2, col 11) is the white eye. The legs are
		* the last four rows, drawn dynamically for the run cycle. */
		const DINO_MATRIX = [
			[
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				0,
				0
			],
			[
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0
			],
			[
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				1,
				1,
				0,
				1,
				1,
				1,
				1,
				1,
				0
			],
			[
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0
			],
			[
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0
			],
			[
				1,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				0,
				0,
				0,
				0
			],
			[
				1,
				1,
				0,
				0,
				0,
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0,
				0
			],
			[
				1,
				1,
				1,
				0,
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0,
				0,
				0,
				0,
				0
			],
			[
				1,
				1,
				1,
				1,
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0,
				0,
				0,
				0,
				0
			],
			[
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0,
				0,
				0
			],
			[
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0,
				0,
				0,
				0,
				0
			],
			[
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0,
				0,
				0,
				0,
				0,
				0
			],
			[
				0,
				0,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				0,
				0,
				0,
				0,
				0,
				0,
				0
			]
		];
		const DINO_COLS = 18;
		const DINO_STATIC_ROWS = 13;
		const EYE_R = 2;
		const EYE_C = 11;
		/** Draw the static sprite rows, scaled to fill the 46x50 hitbox. */
		function drawDinoBody(ctx, x, y, height, p) {
			const cellW = 46 / DINO_COLS;
			const cellH = height / 17;
			ctx.fillStyle = p.dino;
			glow(ctx, p.dino, 8);
			for (let r = 0; r < DINO_STATIC_ROWS; r += 1) {
				const row = DINO_MATRIX[r];
				for (let c = 0; c < DINO_COLS; c += 1) {
					if (!row[c]) continue;
					const x0 = x + Math.round(c * cellW);
					const x1 = x + Math.round((c + 1) * cellW);
					const y0 = y + Math.round(r * cellH);
					const y1 = y + Math.round((r + 1) * cellH);
					ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
				}
			}
			noGlow(ctx);
			ctx.fillStyle = p.eye;
			const ex = x + Math.round(EYE_C * cellW);
			const ey = y + Math.round(EYE_R * cellH);
			ctx.fillRect(ex, ey, Math.ceil(cellW * 1.3), Math.ceil(cellH * 1.3));
		}
		/** Standing pose: matrix body + two running legs (tucked mid-air). */
		function drawDino(ctx, state, p) {
			const dino = state.dino;
			const x = dino.x;
			if (dino.ducking) {
				drawDinoDucking(ctx, x, 165, p);
				return;
			}
			const y = dino.y;
			const phase = dino.onGround ? Math.floor(state.t * 13) % 2 : 0;
			const legL = dino.onGround ? phase === 0 ? 12 : 9 : 5;
			const legR = dino.onGround ? phase === 0 ? 9 : 12 : 5;
			drawDinoBody(ctx, x, y, 50, p);
			const legTop = y + Math.round(DINO_STATIC_ROWS * (50 / 17));
			ctx.fillStyle = p.dino;
			ctx.fillRect(x + 10, legTop, 8, legL);
			ctx.fillRect(x + 21, legTop, 8, legR);
			ctx.fillRect(x + 9, legTop + legL - 3, 10, 3);
			ctx.fillRect(x + 20, legTop + legR - 3, 10, 3);
		}
		/** Ducking: the same sprite flattened into the low hitbox. */
		function drawDinoDucking(ctx, x, ground, p) {
			drawDinoBody(ctx, x, ground - 26, 26, p);
			ctx.fillStyle = p.dino;
			ctx.fillRect(x + 10, ground - 6, 8, 5);
			ctx.fillRect(x + 21, ground - 6, 8, 5);
		}
		function drawGameOver(ctx, state) {
			drawOverlay(ctx, 600, 185, "GAME OVER", `得分 ${Math.floor(state.score)} · 按空格或点击重新开始`, THEME.bad);
		}
		//#endregion
		//#region src/client/games/canvas-fit.ts
		/**
		* Size a canvas to its host and return a context with the logical->pixel
		* transform applied. Re-fits on host resize.
		* @param host - the sized container the canvas lives in.
		* @param canvas - the game canvas.
		* @param logicalW - the game's logical width in px.
		* @param logicalH - the game's logical height in px.
		* @param maxWidth - display width cap in CSS px.
		* @returns the transformed context and a disposer, or null when 2d is unavailable.
		*/
		function fitCanvas(host, canvas, logicalW, logicalH, maxWidth = 960) {
			const ctx = canvas.getContext("2d");
			if (ctx === null) return null;
			const apply = () => {
				const dpr = window.devicePixelRatio || 1;
				const availW = host.clientWidth;
				const availH = host.clientHeight;
				let cssW = Math.min(availW > 0 ? availW : logicalW, maxWidth);
				let cssH = cssW * (logicalH / logicalW);
				if (availH > 0 && cssH > availH) {
					cssH = availH;
					cssW = cssH * (logicalW / logicalH);
				}
				canvas.style.width = `${cssW}px`;
				canvas.style.height = `${cssH}px`;
				canvas.width = Math.max(1, Math.round(cssW * dpr));
				canvas.height = Math.max(1, Math.round(cssH * dpr));
				ctx.setTransform(cssW / logicalW * dpr, 0, 0, cssH / logicalH * dpr, 0, 0);
			};
			apply();
			const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
			observer?.observe(host);
			return {
				ctx,
				dispose: () => observer?.disconnect()
			};
		}
		//#endregion
		//#region src/client/games/focus.ts
		/**
		* Keyboard focus gating for games: the game host div is focusable and owns
		* the game keys only while it (or its canvas) has focus. This keeps typing in
		* the chat composer, arrow-scrolling the page, and other UI shortcuts
		* working while a game is mounted but not in focus.
		*/
		/**
		* Make the host focusable and focus it (without scrolling) so the game
		* receives keys from the first click.
		* @param host - the game host element.
		*/
		function focusGameHost(host) {
			host.tabIndex = 0;
			host.focus({ preventScroll: true });
		}
		/**
		* Whether the document focus is inside the game host (the host itself or the
		* canvas it mounts).
		* @param host - the game host element.
		* @returns true when game keys should be handled.
		*/
		function gameHasFocus(host) {
			const el = document.activeElement;
			return el === host || el instanceof HTMLElement && host.contains(el);
		}
		//#endregion
		//#region src/client/games/frame-scheduler.ts
		/**
		* Shared frame scheduler for mini-games: dt clamping, dirty-flag rendering,
		* and adaptive frame skipping under main-thread contention.
		*
		* Why: the panel lives in the same page as the session transcript. When the
		* session streams, the main thread is busy and rAF callbacks get starved; a
		* game without a dt clamp then teleports its simulation (visible stutter),
		* and a static puzzle board that repaints every frame needlessly competes
		* with the transcript for the same thread.
		*
		* Usage (arcade game — continuous simulation):
		*   const loop = createFrameLoop(frame => {
		*     const dt = frame.dt            // clamped seconds
		*     step(dt); render()
		*   })
		*   loop.start(); loop.pause(); loop.resume(); loop.destroy()
		*
		* Usage (board/puzzle game — repaint only on change):
		*   const loop = createFrameLoop(frame => {
		*     const dt = frame.dt
		*     tickParticles(dt)
		*     if (frame.render || particlesActive()) render()
		*   })
		*   loop.markDirty()  // call after ANY state change (input, win, timer text)
		*/
		/** Max simulated seconds per frame: beyond this the frame is treated as a
		* stall (tab throttling, main-thread contention) and the excess is dropped —
		* the game slows down instead of teleporting. */
		const MAX_DT_S = .05;
		/** When wall-clock frame time exceeds this, skip the render pass but still
		* step the simulation (keeps physics sane under contention). */
		const CONTENDED_FRAME_MS = 40;
		/** Consecutive contended frames before the scheduler starts skipping renders
		* (a short hiccup should not flicker the canvas). */
		const CONTENDED_STREAK = 3;
		function createFrameLoop(callback, options) {
			let raf = 0;
			let running = false;
			let last = 0;
			let dirty = true;
			let contended = 0;
			let skipping = false;
			const continuous = (options?.mode ?? "continuous") === "continuous";
			const frame = (now) => {
				if (!running) return;
				raf = requestAnimationFrame(frame);
				const wallMs = last === 0 ? 16 : now - last;
				last = now;
				const dt = Math.min(MAX_DT_S, wallMs / 1e3);
				if (wallMs > CONTENDED_FRAME_MS) contended += 1;
				else contended = 0;
				if (contended >= CONTENDED_STREAK) skipping = true;
				else if (contended === 0) skipping = false;
				const render = dirty || continuous && !skipping;
				dirty = false;
				callback({
					dt,
					render,
					wallMs
				});
			};
			return {
				start() {
					if (running) return;
					running = true;
					last = 0;
					raf = requestAnimationFrame(frame);
				},
				pause() {
					if (!running) return;
					running = false;
					cancelAnimationFrame(raf);
					raf = 0;
				},
				resume() {
					if (running) return;
					running = true;
					last = 0;
					raf = requestAnimationFrame(frame);
				},
				destroy() {
					running = false;
					cancelAnimationFrame(raf);
					raf = 0;
				},
				markDirty() {
					dirty = true;
				},
				get running() {
					return running;
				}
			};
		}
		//#endregion
		//#region src/client/games/dino/index.ts
		/** How long the game over screen waits before accepting a restart. */
		const RESTART_DELAY = 400;
		function createDinoGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 600, 185);
			if (fit === null) throw new Error("dsh-minigames: dino needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createDinoState();
			let overSince = 0;
			let jumpEdge = false;
			let duckHeld = false;
			let lastScore = -1;
			const reportScore = () => {
				const score = Math.floor(state.score);
				if (score < lastScore + 10 && !state.over) return;
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "Space" || event.code === "ArrowUp") {
					event.preventDefault();
					if (state.over) {
						if (performance.now() - overSince > RESTART_DELAY) reset();
						return;
					}
					jumpEdge = true;
				} else if (event.code === "ArrowDown") {
					event.preventDefault();
					duckHeld = true;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const onKeyUp = (event) => {
				if (event.code === "ArrowDown") duckHeld = false;
			};
			const onClick = () => {
				if (state.over) {
					if (performance.now() - overSince > RESTART_DELAY) reset();
					return;
				}
				jumpEdge = true;
			};
			const loop = createFrameLoop((f) => {
				step$10(state, f.dt, {
					jump: jumpEdge,
					duck: duckHeld
				});
				jumpEdge = false;
				if (state.over && overSince === 0) {
					overSince = performance.now();
					reportScore();
				}
				reportScore();
				if (f.render) renderDino(ctx, state);
			});
			const reset = () => {
				state = createDinoState();
				overSince = 0;
				jumpEdge = false;
				duckHeld = false;
				lastScore = -1;
				reportScore();
				loop.markDirty();
			};
			const togglePause = () => {
				if (loop.running) pause();
				else resume();
			};
			const pause = () => {
				loop.pause();
			};
			const resume = () => {
				loop.resume();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			canvas.addEventListener("click", onClick);
			focusGameHost(host);
			loop.start();
			renderDino(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
					canvas.removeEventListener("click", onClick);
				}
			};
		}
		const dinoGame = {
			id: "dino",
			title: "恐龙跳一跳",
			icon: "🦖",
			description: "Chrome 经典小恐龙：空格/点击跳跃，↓ 蹲下躲鸟，速度越来越快。",
			controls: [
				"空格 / ↑ / 点击：跳跃",
				"↓：蹲下躲鸟",
				"P：暂停"
			],
			create: createDinoGame
		};
		const SHAPES = {
			1: [
				[
					0,
					0,
					0,
					0
				],
				[
					1,
					1,
					1,
					1
				],
				[
					0,
					0,
					0,
					0
				],
				[
					0,
					0,
					0,
					0
				]
			],
			2: [[1, 1], [1, 1]],
			3: [
				[
					0,
					1,
					0
				],
				[
					1,
					1,
					1
				],
				[
					0,
					0,
					0
				]
			],
			4: [
				[
					0,
					1,
					1
				],
				[
					1,
					1,
					0
				],
				[
					0,
					0,
					0
				]
			],
			5: [
				[
					1,
					1,
					0
				],
				[
					0,
					1,
					1
				],
				[
					0,
					0,
					0
				]
			],
			6: [
				[
					1,
					0,
					0
				],
				[
					1,
					1,
					1
				],
				[
					0,
					0,
					0
				]
			],
			7: [
				[
					0,
					0,
					1
				],
				[
					1,
					1,
					1
				],
				[
					0,
					0,
					0
				]
			]
		};
		/** Line-clear score table indexed by cleared rows in one lock. */
		const LINE_SCORES = [
			0,
			100,
			300,
			500,
			800
		];
		/** Empty grid, fresh state, and the first two pieces spawned. */
		function createTetrisState(rng = Math.random) {
			const state = {
				grid: Array.from({ length: 20 }, () => Array(10).fill(0)),
				current: null,
				nextQueue: [],
				hold: null,
				canHold: true,
				score: 0,
				lines: 0,
				level: 1,
				over: false,
				rng
			};
			for (let i = 0; i < 6; i += 1) state.nextQueue.push(randomPiece(rng));
			spawn(state);
			return state;
		}
		function randomKind$1(rng) {
			return 1 + Math.floor(rng() * 7);
		}
		function randomPiece(rng) {
			const kind = randomKind$1(rng);
			return {
				kind,
				shape: SHAPES[kind],
				x: 0,
				y: 0
			};
		}
		/** Center the piece horizontally at the top. */
		function center(piece) {
			piece.x = Math.floor((10 - piece.shape[0].length) / 2);
			piece.y = 0;
		}
		/** Whether the piece overlaps the walls, the floor, or filled cells. */
		function collides(grid, piece) {
			for (let r = 0; r < piece.shape.length; r += 1) for (let c = 0; c < piece.shape[r].length; c += 1) {
				if (piece.shape[r][c] === 0) continue;
				const gy = piece.y + r;
				const gx = piece.x + c;
				if (gx < 0 || gx >= 10 || gy >= 20) return true;
				if (gy >= 0 && grid[gy][gx] !== 0) return true;
			}
			return false;
		}
		/** Promote the next piece to current (used at start and after each lock). */
		function spawn(state) {
			state.current = state.nextQueue.shift();
			center(state.current);
			state.canHold = true;
			state.nextQueue.push(randomPiece(state.rng));
			if (collides(state.grid, state.current)) state.over = true;
		}
		/** Try to move the current piece; gravity (dy=1) that fails locks instead. */
		function move(state, dx, dy) {
			const piece = state.current;
			if (piece === null || state.over) return false;
			const next = {
				...piece,
				shape: piece.shape,
				x: piece.x + dx,
				y: piece.y + dy
			};
			if (!collides(state.grid, next)) {
				piece.x = next.x;
				piece.y = next.y;
				return true;
			}
			if (dy === 1) {
				lock(state);
				return false;
			}
			return false;
		}
		/** Rotate the current piece CW (dir 1) or CCW (dir -1) with simple wall kicks. */
		function rotate(state, dir) {
			const piece = state.current;
			if (piece === null || state.over || piece.kind === 2) return false;
			const shape = piece.shape;
			const n = shape.length;
			const rotated = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => dir === 1 ? shape[n - 1 - c][r] : shape[c][n - 1 - r]));
			for (const kick of [
				0,
				-1,
				1,
				-2,
				2
			]) {
				const candidate = {
					...piece,
					shape: rotated,
					x: piece.x + kick,
					y: piece.y
				};
				if (!collides(state.grid, candidate)) {
					piece.shape = rotated;
					piece.x = candidate.x;
					return true;
				}
			}
			return false;
		}
		/** Drop the current piece to the floor. Returns the cells dropped. */
		function hardDrop(state) {
			if (state.current === null || state.over) return 0;
			let dropped = 0;
			while (move(state, 0, 1)) dropped += 1;
			return dropped;
		}
		/** Merge the current piece into the grid, clear lines, score, and spawn next. */
		function lock(state) {
			const piece = state.current;
			if (piece === null || state.over) return;
			for (let r = 0; r < piece.shape.length; r += 1) for (let c = 0; c < piece.shape[r].length; c += 1) {
				if (piece.shape[r][c] === 0) continue;
				const gy = piece.y + r;
				const gx = piece.x + c;
				if (gy >= 0) state.grid[gy][gx] = piece.kind;
			}
			const cleared = clearFullRows(state.grid);
			for (let r = 0; r < 20; r += 1) if (state.grid[r].every((cell) => cell !== 0)) {
				console.error(`dsh-minigames tetris: full row ${r} survived clearing`, JSON.stringify(state.grid[r]));
				break;
			}
			if (cleared > 0) {
				state.lines += cleared;
				state.score += LINE_SCORES[cleared] * state.level;
				state.level = Math.floor(state.lines / 10) + 1;
			}
			spawn(state);
		}
		/** Remove full rows (returning how many) and compact the grid above. */
		function clearFullRows(grid) {
			const kept = grid.filter((row) => row.some((cell) => cell === 0));
			const cleared = 20 - kept.length;
			if (cleared > 0) {
				const empty = Array.from({ length: cleared }, () => Array(10).fill(0));
				grid.splice(0, grid.length, ...empty, ...kept);
			}
			return cleared;
		}
		/** Swap the current piece with the hold slot (once per piece). */
		function holdPiece(state) {
			if (state.current === null || state.over || !state.canHold) return;
			const held = state.hold;
			state.hold = state.current;
			state.canHold = false;
			if (held === null) {
				spawn(state);
				state.canHold = false;
			} else {
				state.current = held;
				center(state.current);
				if (collides(state.grid, state.current)) state.over = true;
			}
		}
		/** Gravity interval in ms for a level (levels speed up, floor at 120ms). */
		function gravityInterval(level) {
			return Math.max(120, 800 - (level - 1) * 80);
		}
		/** Ghost drop y: where the current piece would land. */
		function ghostY(state) {
			const piece = state.current;
			if (piece === null) return 0;
			let y = piece.y;
			while (!collides(state.grid, {
				...piece,
				y: y + 1
			})) y += 1;
			return y;
		}
		/** Whether the current piece is resting on the floor/stack (cannot descend). */
		function isLanded(state) {
			const piece = state.current;
			if (piece === null || state.over) return false;
			return collides(state.grid, {
				...piece,
				shape: piece.shape,
				x: piece.x,
				y: piece.y + 1
			});
		}
		//#endregion
		//#region src/client/games/tetris/render.ts
		/**
		* Tetris canvas renderer on the shared theme kit: gradient backdrop, a
		* themed board with glowing rounded blocks and a ghost outline, accent-per-
		* kind piece colors, hudPair stats, a clear-line particle burst (observed
		* from the lines counter), and a themed game-over overlay.
		*/
		const CELL$24 = 22;
		const MINI = 14;
		const BOARD_W$15 = 220;
		const BOARD_H$10 = 440;
		/** Full logical canvas width: the board plus the preview column. */
		const LOGICAL_W$37 = 332;
		const PREVIEW_X = 236;
		const PREVIEW_W = 88;
		/** Kind id -> fill color (stable accent per piece type). */
		function kindColor(kind) {
			return accent(kind);
		}
		const GRID_LINE$1 = THEME.panelEdge;
		const particles$25 = createParticles();
		let prevLines = -1;
		let lastFrame$8 = 0;
		function drawCell(ctx, x, y, color, alpha = 1, ghost = false, lit = true) {
			ctx.globalAlpha = alpha;
			if (ghost) {
				ctx.strokeStyle = color;
				ctx.lineWidth = 1.5;
				roundRectPath(ctx, x + 2.5, y + 2.5, 17, 17, 4);
				ctx.stroke();
			} else {
				if (lit) glow(ctx, color, 7);
				ctx.fillStyle = color;
				roundRectPath(ctx, x + 1, y + 1, 20, 20, 4);
				ctx.fill();
				if (lit) noGlow(ctx);
				ctx.fillStyle = "rgba(255,255,255,0.25)";
				ctx.fillRect(x + 3, y + 3, 16, 2);
				ctx.fillStyle = "rgba(0,0,0,0.25)";
				ctx.fillRect(x + 3, y + CELL$24 - 5, 16, 2);
			}
			ctx.globalAlpha = 1;
		}
		function drawShape(ctx, shape, px, py, kind, alpha = 1, ghost = false) {
			for (let r = 0; r < shape.length; r += 1) for (let c = 0; c < shape[r].length; c += 1) {
				if (shape[r][c] === 0) continue;
				drawCell(ctx, px + c * CELL$24, py + r * CELL$24, kindColor(kind), alpha, ghost);
			}
		}
		/** Draw a mini piece preview (used for the next queue). */
		function drawMiniPiece(ctx, piece, x, y, w) {
			if (piece === null) return;
			const shape = piece.shape;
			const shapeW = shape[0].length * MINI;
			const shapeH = shape.length * MINI;
			const ox = x + Math.floor((w - shapeW) / 2);
			const oy = y + Math.floor((42 - shapeH) / 2);
			ctx.fillStyle = kindColor(piece.kind);
			for (let r = 0; r < shape.length; r += 1) for (let c = 0; c < shape[r].length; c += 1) {
				if (shape[r][c] === 0) continue;
				ctx.fillRect(ox + c * MINI, oy + r * MINI, 13, 13);
			}
		}
		/** Draw a full-size piece preview (hold). */
		function drawHold(ctx, piece, y) {
			hudPair(ctx, PREVIEW_X, y, "暂存 ", "C");
			ctx.fillStyle = THEME.panel;
			roundRectPath(ctx, PREVIEW_X, y + 6, PREVIEW_W, 66, 6);
			ctx.fill();
			ctx.strokeStyle = GRID_LINE$1;
			ctx.lineWidth = 1;
			ctx.stroke();
			if (piece === null) return;
			const shape = piece.shape;
			drawShape(ctx, shape, PREVIEW_X + Math.floor((PREVIEW_W - shape[0].length * CELL$24) / 2), y + 6 + Math.floor((66 - shape.length * CELL$24) / 2), piece.kind);
		}
		/** Draw the next-queue previews (up to PREVIEW_COUNT mini pieces). */
		function drawNextQueue(ctx, state) {
			hudPair(ctx, PREVIEW_X, 12, "下一个", "");
			const itemH = 50;
			for (let i = 0; i < Math.min(5, state.nextQueue.length); i += 1) {
				const y = 18 + i * itemH;
				ctx.fillStyle = THEME.panel;
				roundRectPath(ctx, PREVIEW_X, y, PREVIEW_W, 42, 6);
				ctx.fill();
				ctx.strokeStyle = GRID_LINE$1;
				ctx.lineWidth = 1;
				ctx.stroke();
				drawMiniPiece(ctx, state.nextQueue[i], PREVIEW_X, y, PREVIEW_W);
			}
		}
		/** Draw one frame of the game; `paused` veils the board. */
		function renderTetris(ctx, state, paused) {
			const width = LOGICAL_W$37;
			ctx.clearRect(0, 0, width, 448);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$8 === 0 ? 16 : now - lastFrame$8);
			lastFrame$8 = now;
			drawBackground(ctx, width, 448);
			ctx.fillStyle = THEME.panel;
			roundRectPath(ctx, 1, 1, 218, 438, 6);
			ctx.fill();
			ctx.strokeStyle = GRID_LINE$1;
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.lineWidth = 1;
			for (let c = 1; c < 10; c += 1) {
				ctx.beginPath();
				ctx.moveTo(c * CELL$24 + .5, 0);
				ctx.lineTo(c * CELL$24 + .5, BOARD_H$10);
				ctx.stroke();
			}
			for (let r = 1; r < 20; r += 1) {
				ctx.beginPath();
				ctx.moveTo(0, r * CELL$24 + .5);
				ctx.lineTo(BOARD_W$15, r * CELL$24 + .5);
				ctx.stroke();
			}
			for (let r = 0; r < 20; r += 1) for (let c = 0; c < 10; c += 1) {
				const kind = state.grid[r][c];
				if (kind !== 0) drawCell(ctx, c * CELL$24, r * CELL$24, kindColor(kind), 1, false, false);
			}
			if (state.current !== null) {
				const piece = state.current;
				const gy = ghostY(state);
				if (gy !== piece.y) drawShape(ctx, piece.shape, piece.x * CELL$24, gy * CELL$24, piece.kind, .35, true);
				drawShape(ctx, piece.shape, piece.x * CELL$24, piece.y * CELL$24, piece.kind);
			}
			if (prevLines >= 0 && state.lines > prevLines) for (let i = 0; i < 3; i += 1) particles$25.burst(BOARD_W$15 / 2 + (i - 1) * BOARD_W$15 / 3, BOARD_H$10 * .75, THEME.gold, 12, 160);
			prevLines = state.lines;
			particles$25.tick(ctx, dt);
			drawNextQueue(ctx, state);
			drawHold(ctx, state.hold, 276);
			hudPair(ctx, PREVIEW_X, 372, "得分 ", String(state.score), "left", THEME.text);
			hudPair(ctx, PREVIEW_X, 390, "行数 ", `${state.lines}`, "left", THEME.text);
			hudPair(ctx, PREVIEW_X, 408, "等级 ", String(state.level), "left", THEME.text);
			if (state.over) drawOverlay(ctx, BOARD_W$15, BOARD_H$10, "GAME OVER", `得分 ${state.score} · R 重新开始`, THEME.bad);
			else if (paused) drawOverlay(ctx, BOARD_W$15, BOARD_H$10, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/tetris/index.ts
		/** Controllable window between landing and locking (standard Tetris lock delay). */
		const LOCK_DELAY_MS = 400;
		/** Max slide/rotate refreshes of the lock window per piece (anti-stall bound). */
		const LOCK_RESETS_PER_PIECE = 15;
		function createTetrisGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$37, 448);
			if (fit === null) throw new Error("dsh-minigames: tetris needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createTetrisState();
			let gravityAcc = 0;
			let lastScore = -1;
			let landedAt = null;
			let lockResets = 0;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			/** Refresh the lock-delay window after a successful slide/rotate of a landed piece. */
			const touchLanded = () => {
				if (landedAt !== null && lockResets < LOCK_RESETS_PER_PIECE) {
					landedAt = performance.now();
					lockResets += 1;
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (!loop.running && event.code !== "KeyP" && event.code !== "KeyR") return;
				switch (event.code) {
					case "ArrowLeft":
					case "KeyA":
						event.preventDefault();
						if (move(state, -1, 0)) touchLanded();
						break;
					case "ArrowRight":
					case "KeyD":
						event.preventDefault();
						if (move(state, 1, 0)) touchLanded();
						break;
					case "ArrowDown":
					case "KeyS":
						event.preventDefault();
						if (move(state, 0, 1)) state.score += 1;
						reportScore();
						break;
					case "Space":
						event.preventDefault();
						state.score += hardDrop(state) * 2;
						gravityAcc = 0;
						landedAt = null;
						lockResets = 0;
						reportScore();
						break;
					case "ArrowUp":
					case "KeyX":
					case "KeyW":
						event.preventDefault();
						if (rotate(state, 1)) touchLanded();
						break;
					case "KeyZ":
						event.preventDefault();
						if (rotate(state, -1)) touchLanded();
						break;
					case "KeyC":
						event.preventDefault();
						holdPiece(state);
						gravityAcc = 0;
						landedAt = null;
						lockResets = 0;
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
						break;
					case "KeyR": if (state.over) reset();
				}
			};
			const loop = createFrameLoop((f) => {
				if (!state.over && state.current !== null && isLanded(state)) {
					const now = performance.now();
					if (landedAt === null) landedAt = now;
					if (now - landedAt >= LOCK_DELAY_MS) {
						lock(state);
						landedAt = null;
						lockResets = 0;
						gravityAcc = 0;
						reportScore();
					}
					if (f.render) renderTetris(ctx, state, false);
					return;
				}
				landedAt = null;
				lockResets = 0;
				gravityAcc += f.dt * 1e3;
				const interval = gravityInterval(state.level);
				while (gravityAcc >= interval && !state.over) {
					gravityAcc -= interval;
					if (!move(state, 0, 1)) {
						gravityAcc = 0;
						reportScore();
						if (state.over) break;
					}
				}
				if (f.render) renderTetris(ctx, state, false);
			});
			const reset = () => {
				state = createTetrisState();
				gravityAcc = 0;
				landedAt = null;
				lockResets = 0;
				lastScore = -1;
				reportScore();
				loop.markDirty();
			};
			const togglePause = () => {
				if (loop.running) pause();
				else resume();
			};
			const pause = () => {
				if (!loop.running) return;
				loop.pause();
				renderTetris(ctx, state, true);
			};
			const resume = () => {
				loop.resume();
			};
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			loop.start();
			renderTetris(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const tetrisGame = {
			id: "tetris",
			title: "俄罗斯方块",
			icon: "🧱",
			description: "经典下落消除：←→ 移动，↑/X 旋转，空格硬降，C 暂存，P 暂停。",
			controls: [
				"← →：左右移动",
				"↑ / X：旋转",
				"空格：硬降",
				"C：暂存",
				"P：暂停"
			],
			create: createTetrisGame
		};
		const DIR_DX$1 = [
			0,
			1,
			0,
			-1
		];
		const DIR_DY$1 = [
			-1,
			0,
			1,
			0
		];
		/** Tank collision inset in px: the effective body is TILE - 2*INSET, letting
		* tanks fit and turn in lanes a hair tighter than a full tile. */
		const TANK_INSET = 3;
		/** Perpendicular-axis snap range after a turn (px) — keeps the tank on-grid. */
		const LANE_SNAP$1 = 4;
		const SPAWN_INTERVAL = 1.6;
		const PLAYER_SPEED$3 = 120;
		const ENEMY_SPEED$1 = 82;
		/** Seconds of invulnerability a freshly spawned enemy gets (spawn flash). */
		const ENEMY_SPAWN_INVULN = .7;
		const PLAYER_FIRE_CD = .4;
		const ENEMY_FIRE_CD_MIN = 1.2;
		const BULLET_SPEED_PLAYER = 260;
		const BULLET_SPEED_ENEMY = 170;
		const AI_TICK$1 = .45;
		const PLAYER_HP = 3;
		const PLAYER_INVULN = 1.5;
		/** Primary spawn tiles (enemies appear on these). */
		const SPAWN_POINTS = [
			[0, 0],
			[14, 0],
			[7, 0]
		];
		/** 2-wide pockets so a spawned tank can actually drive out of the border. */
		const SPAWN_POCKETS = [
			[0, 0],
			[1, 0],
			[14, 0],
			[13, 0],
			[7, 0],
			[8, 0]
		];
		const PLAYER_START$1 = [7, 11];
		/** Symmetric fields; the three spawn tiles and the player start are cleared below. */
		const MAPS = [
			[
				[
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1
				],
				[
					1,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					0,
					0,
					0,
					0,
					0,
					0,
					1
				],
				[
					1,
					0,
					1,
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					1,
					0,
					1
				],
				[
					1,
					0,
					1,
					0,
					0,
					1,
					0,
					0,
					0,
					1,
					0,
					0,
					1,
					0,
					1
				],
				[
					1,
					0,
					0,
					0,
					1,
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					0,
					0,
					1
				],
				[
					1,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					0,
					1,
					1
				],
				[
					1,
					0,
					0,
					1,
					0,
					1,
					2,
					0,
					2,
					1,
					0,
					1,
					0,
					0,
					1
				],
				[
					1,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					0,
					1,
					1
				],
				[
					1,
					0,
					0,
					0,
					1,
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					0,
					0,
					1
				],
				[
					1,
					0,
					1,
					0,
					0,
					1,
					0,
					0,
					0,
					1,
					0,
					0,
					1,
					0,
					1
				],
				[
					1,
					0,
					1,
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					1,
					0,
					1
				],
				[
					1,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1
				],
				[
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1
				]
			],
			[
				[
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1
				],
				[
					1,
					0,
					0,
					0,
					1,
					0,
					0,
					0,
					0,
					0,
					1,
					0,
					0,
					0,
					1
				],
				[
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					1,
					1,
					0,
					1,
					0,
					1,
					0,
					1
				],
				[
					1,
					0,
					1,
					0,
					0,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					1,
					0,
					1
				],
				[
					1,
					0,
					1,
					1,
					1,
					0,
					0,
					0,
					0,
					0,
					1,
					1,
					1,
					0,
					1
				],
				[
					1,
					0,
					0,
					0,
					1,
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					0,
					0,
					1
				],
				[
					1,
					1,
					1,
					0,
					0,
					0,
					2,
					0,
					0,
					0,
					0,
					0,
					1,
					1,
					1
				],
				[
					1,
					0,
					0,
					0,
					1,
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					0,
					0,
					1
				],
				[
					1,
					0,
					1,
					1,
					1,
					0,
					0,
					0,
					0,
					0,
					1,
					1,
					1,
					0,
					1
				],
				[
					1,
					0,
					1,
					0,
					0,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					1,
					0,
					1
				],
				[
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					1,
					1,
					0,
					1,
					0,
					1,
					0,
					1
				],
				[
					1,
					0,
					0,
					0,
					1,
					0,
					0,
					0,
					0,
					0,
					1,
					0,
					0,
					0,
					1
				],
				[
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1
				]
			],
			[
				[
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1
				],
				[
					1,
					0,
					0,
					0,
					0,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					0,
					1
				],
				[
					1,
					0,
					2,
					2,
					0,
					1,
					1,
					0,
					1,
					1,
					0,
					2,
					2,
					0,
					1
				],
				[
					1,
					0,
					2,
					1,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					2,
					0,
					1
				],
				[
					1,
					0,
					0,
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					1,
					1,
					0,
					0,
					1
				],
				[
					1,
					1,
					0,
					0,
					0,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					1,
					1
				],
				[
					1,
					0,
					0,
					0,
					1,
					0,
					0,
					2,
					0,
					0,
					1,
					0,
					0,
					0,
					1
				],
				[
					1,
					1,
					0,
					0,
					0,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					1,
					1
				],
				[
					1,
					0,
					0,
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					1,
					1,
					0,
					0,
					1
				],
				[
					1,
					0,
					2,
					1,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					2,
					0,
					1
				],
				[
					1,
					0,
					2,
					2,
					0,
					1,
					1,
					0,
					1,
					1,
					0,
					2,
					2,
					0,
					1
				],
				[
					1,
					0,
					0,
					0,
					0,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					0,
					1
				],
				[
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1
				]
			]
		];
		MAPS.length;
		/** Map index played by a wave (1-based wave number). */
		function mapIndexForWave(wave) {
			return (wave - 1) % MAPS.length;
		}
		function buildGrid(mapIndex) {
			const grid = MAPS[mapIndex % MAPS.length].map((row) => [...row]);
			for (const [tx, ty] of SPAWN_POCKETS) grid[ty][tx] = 0;
			return grid;
		}
		/** A fresh world at wave 1. */
		function createWorld$1(rng = Math.random) {
			return {
				grid: buildGrid(0),
				mapIndex: 0,
				player: {
					id: 0,
					kind: "player",
					x: PLAYER_START$1[0] * 32,
					y: PLAYER_START$1[1] * 32,
					dir: 0,
					targetDir: 0,
					hp: PLAYER_HP,
					cooldown: 0,
					alive: true,
					invuln: 0
				},
				enemies: [],
				bullets: [],
				effects: [],
				score: 0,
				wave: 1,
				spawnQueue: 5,
				spawnTimer: 1,
				aiTimer: 0,
				flow: null,
				result: "none",
				t: 0,
				rng
			};
		}
		/** Grid tile at tile coords; out of bounds counts as solid steel. */
		function tileAt$2(grid, tx, ty) {
			if (tx < 0 || tx >= 15 || ty < 0 || ty >= 13) return 2;
			return grid[ty][tx];
		}
		/**
		* Tile span of a tank's effective collision body: the full tile inset by
		* {@link TANK_INSET} on every side, so the tank fits lanes that are a hair
		* tighter than a full tile and can still turn there.
		*/
		function insetTiles$1(x, y) {
			return {
				tx0: Math.floor((x + TANK_INSET) / 32),
				tx1: Math.floor((x + 32 - 1 - TANK_INSET) / 32),
				ty0: Math.floor((y + TANK_INSET) / 32),
				ty1: Math.floor((y + 32 - 1 - TANK_INSET) / 32)
			};
		}
		/** Whether every tile the tank's (inset) body overlaps is walkable. */
		function rectWalkable$1(grid, x, y) {
			const { tx0, tx1, ty0, ty1 } = insetTiles$1(x, y);
			for (let ty = ty0; ty <= ty1; ty += 1) for (let tx = tx0; tx <= tx1; tx += 1) if (tileAt$2(grid, tx, ty) !== 0) return false;
			return true;
		}
		/** AABB overlap between two tanks (shrunk so neighbours can pass). */
		function tanksOverlap(a, b) {
			const pad = TANK_INSET;
			return a.x + pad < b.x + 32 - pad && a.x + 32 - pad > b.x + pad && a.y + pad < b.y + 32 - pad && a.y + 32 - pad > b.y + pad;
		}
		/** Try to move a tank by dist px in dir; blocked by walls and other tanks. */
		function tryMove$1(state, tank, dir, dist) {
			const nx = tank.x + DIR_DX$1[dir] * dist;
			const ny = tank.y + DIR_DY$1[dir] * dist;
			if (!rectWalkable$1(state.grid, nx, ny)) {
				snapToNextBoundary$1(tank, dir, dist + TANK_INSET);
				return false;
			}
			for (const other of [state.player, ...state.enemies]) {
				if (other === tank || !other.alive) continue;
				if (tanksOverlap({
					...tank,
					x: nx,
					y: ny
				}, other)) {
					snapToNextBoundary$1(tank, dir, dist + TANK_INSET);
					return false;
				}
			}
			tank.x = nx;
			tank.y = ny;
			tank.dir = dir;
			snapToNextBoundary$1(tank, dir, dist);
			return true;
		}
		/** Snap the tank to the next boundary in its driving direction when within
		* `range` px of it (the "boundary ahead"): the tank arrives exactly on-grid
		* instead of overshooting or parking at a half-tile offset. */
		function snapToNextBoundary$1(tank, dir, range) {
			if (dir === 1) {
				const boundary = Math.floor(tank.x / 32) * 32 + 32;
				if (boundary - tank.x <= range) tank.x = boundary;
			} else if (dir === 3) {
				const boundary = Math.floor(tank.x / 32) * 32;
				if (tank.x - boundary <= range) tank.x = boundary;
			} else if (dir === 2) {
				const boundary = Math.floor(tank.y / 32) * 32 + 32;
				if (boundary - tank.y <= range) tank.y = boundary;
			} else {
				const boundary = Math.floor(tank.y / 32) * 32;
				if (tank.y - boundary <= range) tank.y = boundary;
			}
		}
		/** Whether the tank can advance nearly a full tile in dir (walls + tanks clear). */
		function canAdvance$1(state, tank, dir) {
			const step = 30.4;
			const nx = tank.x + DIR_DX$1[dir] * step;
			const ny = tank.y + DIR_DY$1[dir] * step;
			if (!rectWalkable$1(state.grid, nx, ny)) return false;
			for (const other of [state.player, ...state.enemies]) {
				if (other === tank || !other.alive) continue;
				if (tanksOverlap({
					...tank,
					x: nx,
					y: ny
				}, other)) return false;
			}
			return true;
		}
		/**
		* Move a tank toward its desired heading. Turning is free: the tank turns the
		* moment its (inset) body fits the new lane — no waiting for grid alignment.
		* When it turns near a tile boundary it is snapped onto the grid, so the tank
		* stays visually lane-aligned whenever it is close; driving straight still
		* snaps at every boundary crossing. The collision body is TILE - 2*INSET, so
		* a mid-lane turn is only blocked when the body genuinely pokes into a wall.
		* @param state - the world.
		* @param tank - the tank to move.
		* @param targetDir - the desired heading this frame.
		* @param dist - movement distance in px.
		* @returns whether the tank actually moved.
		*/
		function moveTank(state, tank, targetDir, dist) {
			const turning = targetDir !== tank.dir;
			if (turning) {
				if (targetDir === 0 || targetDir === 2) {
					const gx = Math.round(tank.x / 32) * 32;
					if (rectWalkable$1(state.grid, gx, tank.y)) tank.x = gx;
				} else {
					const gy = Math.round(tank.y / 32) * 32;
					if (rectWalkable$1(state.grid, tank.x, gy)) tank.y = gy;
				}
			}
			const moved = tryMove$1(state, tank, targetDir, dist);
			if (turning && moved) snapPerpendicularIfClose$1(tank, targetDir);
			return moved;
		}
		/** Snap a just-turned tank's perpendicular axis onto the nearest grid line. */
		function snapPerpendicularIfClose$1(tank, newDir) {
			const vertical = newDir === 0 || newDir === 2;
			const value = vertical ? tank.x : tank.y;
			const boundary = Math.round(value / 32) * 32;
			if (Math.abs(value - boundary) <= LANE_SNAP$1) {
				if (vertical) tank.x = boundary;
				else tank.y = boundary;
			}
		}
		/** Spawn a bullet just outside the tank's front face in its facing direction. */
		function fire$3(state, tank, speed) {
			const cx = tank.x + 16;
			const cy = tank.y + 16;
			const x = tank.dir === 1 ? tank.x + 32 + 2 : tank.dir === 3 ? tank.x - 8 : cx - 3;
			const y = tank.dir === 2 ? tank.y + 32 + 2 : tank.dir === 0 ? tank.y - 8 : cy - 3;
			state.bullets.push({
				x,
				y,
				dir: tank.dir,
				owner: tank.kind
			});
			tank.cooldown = tank.kind === "player" ? PLAYER_FIRE_CD : ENEMY_FIRE_CD_MIN + state.rng() * 1.4000000000000001;
		}
		/** Whether tank a is aligned with b on one axis with no solid tile between. */
		function losClear(state, a, b) {
			const ax = a.x + 16;
			const ay = a.y + 16;
			const bx = b.x + 16;
			const by = b.y + 16;
			const sameCol = Math.abs(ax - bx) < 16;
			const sameRow = Math.abs(ay - by) < 16;
			if (!sameCol && !sameRow) return false;
			if (sameCol) {
				const tx = Math.floor(ax / 32);
				const r0 = Math.min(Math.floor(ay / 32), Math.floor(by / 32));
				const r1 = Math.max(Math.floor(ay / 32), Math.floor(by / 32));
				for (let ty = r0 + 1; ty < r1; ty += 1) if (tileAt$2(state.grid, tx, ty) !== 0) return false;
				return true;
			}
			const ty = Math.floor(ay / 32);
			const c0 = Math.min(Math.floor(ax / 32), Math.floor(bx / 32));
			const c1 = Math.max(Math.floor(ax / 32), Math.floor(bx / 32));
			for (let tx = c0 + 1; tx < c1; tx += 1) if (tileAt$2(state.grid, tx, ty) !== 0) return false;
			return true;
		}
		/** Flow-field distance at tile coords (-1 = wall/unreachable/out of grid). */
		function flowAt$1(flow, tx, ty) {
			if (tx < 0 || tx >= 15 || ty < 0 || ty >= 13) return -1;
			return flow[ty * 15 + tx];
		}
		/**
		* BFS flow field of walking distances from one tile over open tiles (brick
		* counts as open: it is shootable, and the field is rebuilt every decision
		* tick anyway). Used by the enemy AI to route around walls toward the player.
		*/
		function buildFlowField$1(grid, tx, ty) {
			const flow = (/* @__PURE__ */ new Int16Array(195)).fill(-1);
			if (tileAt$2(grid, tx, ty) !== 0) return flow;
			flow[ty * 15 + tx] = 0;
			const queue = [ty * 15 + tx];
			for (let qi = 0; qi < queue.length; qi += 1) {
				const cur = queue[qi];
				const cx = cur % 15;
				const cy = cur / 15 | 0;
				for (let dir = 0; dir < 4; dir += 1) {
					const nx = cx + DIR_DX$1[dir];
					const ny = cy + DIR_DY$1[dir];
					if (nx < 0 || nx >= 15 || ny < 0 || ny >= 13) continue;
					const ni = ny * 15 + nx;
					if (flow[ni] !== -1 || grid[ny][nx] !== 0) continue;
					flow[ni] = flow[cur] + 1;
					queue.push(ni);
				}
			}
			return flow;
		}
		/**
		* Perpendicular escape direction from a player bullet sharing this tank's
		* lane and approaching within ~4 tiles; null when nothing threatens or both
		* sides are walled.
		*/
		function incomingBulletSide(state, enemy) {
			const ecx = enemy.x + 16;
			const ecy = enemy.y + 16;
			for (const bullet of state.bullets) {
				if (bullet.owner !== "player") continue;
				const bcx = bullet.x + 3;
				const bcy = bullet.y + 3;
				if (bullet.dir === 0 || bullet.dir === 2) {
					if (Math.abs(bcx - ecx) > 16) continue;
					if (!(bullet.dir === 2 ? bcy < ecy : bcy > ecy) || Math.abs(ecy - bcy) >= 128) continue;
					const leftOk = canAdvance$1(state, enemy, 3);
					const rightOk = canAdvance$1(state, enemy, 1);
					if (leftOk && rightOk) return state.rng() < .5 ? 3 : 1;
					return leftOk ? 3 : rightOk ? 1 : null;
				}
				if (Math.abs(bcy - ecy) > 16) continue;
				if (!(bullet.dir === 1 ? bcx < ecx : bcx > ecx) || Math.abs(ecx - bcx) >= 128) continue;
				const upOk = canAdvance$1(state, enemy, 0);
				const downOk = canAdvance$1(state, enemy, 2);
				if (upOk && downOk) return state.rng() < .5 ? 0 : 2;
				return upOk ? 0 : downOk ? 2 : null;
			}
			return null;
		}
		/** A perpendicular direction that actually advances (used for un-sticking). */
		function perpendicularEscape(state, enemy) {
			const perpendicular = enemy.dir === 0 || enemy.dir === 2 ? [3, 1] : [0, 2];
			for (const dir of perpendicular) if (canAdvance$1(state, enemy, dir)) return dir;
			const back = (enemy.dir + 2) % 4;
			if (canAdvance$1(state, enemy, back)) return back;
			return null;
		}
		/** One enemy decision: dodge an incoming bullet, shoot when a lane is clear,
		* else follow the BFS flow field toward the player (greedy as a fallback). */
		function decideEnemy$1(state, enemy) {
			const player = state.player;
			const dodge = enemy.dodge ?? 0;
			if (dodge > 0 && state.rng() < dodge) {
				const side = incomingBulletSide(state, enemy);
				if (side !== null) {
					enemy.targetDir = side;
					enemy.commitTicks = 0;
					return;
				}
			}
			if ((enemy.stuckTicks ?? 0) >= 3) {
				enemy.stuckTicks = 0;
				enemy.commitTicks = 0;
				const escape = perpendicularEscape(state, enemy);
				if (escape !== null) {
					enemy.targetDir = escape;
					enemy.commitTicks = 2;
					return;
				}
			}
			if (losClear(state, enemy, player)) {
				const ex = enemy.x + 16;
				const ey = enemy.y + 16;
				const px = player.x + 16;
				const py = player.y + 16;
				const facing = Math.abs(ex - px) < Math.abs(ey - py) ? py < ey ? 0 : 2 : px > ex ? 1 : 3;
				enemy.dir = facing;
				enemy.targetDir = facing;
				if (enemy.cooldown <= 0) fire$3(state, enemy, BULLET_SPEED_ENEMY);
				return;
			}
			const flow = state.flow;
			if (flow !== null) {
				const etx = Math.floor((enemy.x + 16) / 32);
				const ety = Math.floor((enemy.y + 16) / 32);
				const here = flowAt$1(flow, etx, ety);
				if (here > 0) {
					const commit = enemy.commitTicks ?? 0;
					if (commit > 0) {
						const ahead = flowAt$1(flow, etx + DIR_DX$1[enemy.targetDir], ety + DIR_DY$1[enemy.targetDir]);
						if (ahead >= 0 && ahead <= here && canAdvance$1(state, enemy, enemy.targetDir)) {
							enemy.commitTicks = commit - 1;
							return;
						}
						enemy.commitTicks = 0;
					}
					let best = null;
					let bestKey = "";
					const ex = enemy.x + 16;
					const ey = enemy.y + 16;
					const px = player.x + 16;
					const py = player.y + 16;
					const preferAxis = Math.abs(px - ex) >= Math.abs(py - ey) ? "x" : "y";
					const axisRank = (dir) => {
						return preferAxis === "x" === (dir === 1 || dir === 3) ? 0 : 1;
					};
					const bias = (dir) => {
						if (dir === 1) return px - ex;
						if (dir === 3) return ex - px;
						if (dir === 2) return py - ey;
						return ey - py;
					};
					const gx = Math.round(enemy.x / 32) * 32;
					const gy = Math.round(enemy.y / 32) * 32;
					const aligned = {
						...enemy,
						x: rectWalkable$1(state.grid, gx, enemy.y) ? gx : enemy.x,
						y: rectWalkable$1(state.grid, enemy.x, gy) ? gy : enemy.y
					};
					for (const dir of [
						enemy.dir,
						0,
						1,
						2,
						3
					]) {
						const nx1 = etx + DIR_DX$1[dir];
						const ny1 = ety + DIR_DY$1[dir];
						if (flowAt$1(flow, nx1, ny1) < 0) continue;
						if (!canAdvance$1(state, aligned, dir)) continue;
						const d1 = flowAt$1(flow, nx1, ny1);
						let d2 = d1;
						const ahead2 = flowAt$1(flow, nx1 + DIR_DX$1[dir], ny1 + DIR_DY$1[dir]);
						if (ahead2 >= 0) d2 = ahead2;
						const key = `${String(d2).padStart(4, "0")}|${String(d1).padStart(4, "0")}|${axisRank(dir)}|${String(Math.round(bias(dir))).padStart(5, "0")}`;
						if (best === null || key < bestKey) {
							best = dir;
							bestKey = key;
						}
					}
					if (best !== null) {
						enemy.targetDir = best;
						enemy.commitTicks = 2;
						return;
					}
				}
			}
			const ex = enemy.x + 16;
			const ey = enemy.y + 16;
			const px = player.x + 16;
			const py = player.y + 16;
			const dx = px - ex;
			const dy = py - ey;
			const candidates = Math.abs(dx) > Math.abs(dy) ? [
				dx > 0 ? 1 : 3,
				dy > 0 ? 2 : 0,
				dx > 0 ? 3 : 1,
				dy > 0 ? 0 : 2
			] : [
				dy > 0 ? 2 : 0,
				dx > 0 ? 1 : 3,
				dy > 0 ? 0 : 2,
				dx > 0 ? 3 : 1
			];
			for (const dir of candidates) if (canAdvance$1(state, enemy, dir)) {
				enemy.targetDir = dir;
				return;
			}
		}
		function spawnEnemy$2(state) {
			for (const [tx, ty] of SPAWN_POINTS) {
				const x = tx * 32;
				const y = ty * 32;
				if (state.enemies.some((enemy) => Math.abs(enemy.x - x) < 32 && Math.abs(enemy.y - y) < 32)) continue;
				state.enemies.push({
					id: state.enemies.length + 1,
					kind: "enemy",
					x,
					y,
					dir: 2,
					targetDir: 2,
					hp: 1,
					cooldown: .5 + state.rng(),
					alive: true,
					invuln: ENEMY_SPAWN_INVULN,
					dodge: .25 + state.rng() * .4,
					commitTicks: 0,
					stuckTicks: 0
				});
				state.spawnQueue -= 1;
				return;
			}
		}
		function killEnemy(state, index) {
			const enemy = state.enemies[index];
			state.enemies.splice(index, 1);
			state.score += 100;
			state.effects.push({
				x: enemy.x + 16,
				y: enemy.y + 16,
				t: 0,
				life: .45
			});
		}
		/**
		* Advance the world by dt seconds under the player's held inputs.
		* @param state - the world (mutated in place).
		* @param dt - elapsed seconds (clamp to <=1/30 upstream).
		* @param input - player held keys this frame.
		*/
		function stepWorld$1(state, dt, input) {
			if (state.result !== "none") return;
			state.t += dt;
			const player = state.player;
			if (player.alive) {
				let dir = null;
				if (input.up) dir = 0;
				else if (input.down) dir = 2;
				else if (input.left) dir = 3;
				else if (input.right) dir = 1;
				if (dir !== null) {
					player.targetDir = dir;
					moveTank(state, player, player.targetDir, PLAYER_SPEED$3 * dt);
				} else player.targetDir = player.dir;
				if (input.fire) {
					player.cooldown = Math.max(0, player.cooldown - dt);
					if (player.cooldown <= 0) fire$3(state, player, BULLET_SPEED_PLAYER);
				}
				player.invuln = Math.max(0, player.invuln - dt);
			}
			state.aiTimer += dt;
			const decide = state.aiTimer >= AI_TICK$1;
			if (decide) {
				state.aiTimer = 0;
				const ptx = Math.floor((state.player.x + 16) / 32);
				const pty = Math.floor((state.player.y + 16) / 32);
				state.flow = buildFlowField$1(state.grid, ptx, pty);
			}
			for (const enemy of state.enemies) {
				if (decide) decideEnemy$1(state, enemy);
				const bx = enemy.x;
				const by = enemy.y;
				moveTank(state, enemy, enemy.targetDir, ENEMY_SPEED$1 * dt);
				if (enemy.kind === "enemy") {
					if (enemy.dir === 0 || enemy.dir === 2) {
						const dx = Math.round(enemy.x / 32) * 32 - enemy.x;
						if (Math.abs(dx) > .5) {
							const pull = Math.sign(dx) * Math.min(Math.abs(dx), ENEMY_SPEED$1 * dt * .5);
							if (rectWalkable$1(state.grid, enemy.x + pull, enemy.y)) enemy.x += pull;
						}
					} else {
						const dy = Math.round(enemy.y / 32) * 32 - enemy.y;
						if (Math.abs(dy) > .5) {
							const pull = Math.sign(dy) * Math.min(Math.abs(dy), ENEMY_SPEED$1 * dt * .5);
							if (rectWalkable$1(state.grid, enemy.x, enemy.y + pull)) enemy.y += pull;
						}
					}
				}
				const moved = Math.abs(enemy.x - bx) + Math.abs(enemy.y - by) > .5;
				if (decide || moved) enemy.stuckTicks = moved ? 0 : (enemy.stuckTicks ?? 0) + 1;
				if ((enemy.stuckTicks ?? 0) >= 2 && !moved) {
					const gx = Math.round(enemy.x / 32) * 32;
					const gy = Math.round(enemy.y / 32) * 32;
					if (rectWalkable$1(state.grid, gx, gy)) {
						enemy.x = gx;
						enemy.y = gy;
					}
				}
				enemy.cooldown = Math.max(0, enemy.cooldown - dt);
				enemy.invuln = Math.max(0, enemy.invuln - dt);
			}
			if (state.spawnQueue > 0 && state.enemies.length < 3) {
				state.spawnTimer -= dt;
				if (state.spawnTimer <= 0) {
					spawnEnemy$2(state);
					state.spawnTimer = SPAWN_INTERVAL;
				}
			}
			const aliveBullets = [];
			for (const bullet of state.bullets) {
				const speed = bullet.owner === "player" ? BULLET_SPEED_PLAYER : BULLET_SPEED_ENEMY;
				bullet.x += DIR_DX$1[bullet.dir] * speed * dt;
				bullet.y += DIR_DY$1[bullet.dir] * speed * dt;
				let dead = false;
				const tx = Math.floor(bullet.x / 32);
				const ty = Math.floor(bullet.y / 32);
				const tile = tileAt$2(state.grid, tx, ty);
				if (tile === 1) {
					state.grid[ty][tx] = 0;
					state.effects.push({
						x: bullet.x,
						y: bullet.y,
						t: 0,
						life: .3
					});
					dead = true;
				} else if (tile === 2 || tx < 0 || tx >= 15 || ty < 0 || ty >= 13) {
					state.effects.push({
						x: bullet.x,
						y: bullet.y,
						t: 0,
						life: .25
					});
					dead = true;
				}
				if (!dead && bullet.owner === "player") for (let i = 0; i < state.enemies.length; i += 1) {
					const enemy = state.enemies[i];
					if (bulletHitsTank(bullet, enemy)) {
						killEnemy(state, i);
						dead = true;
						break;
					}
				}
				else if (!dead && bullet.owner === "enemy" && player.alive) {
					if (bulletHitsTank(bullet, player) && player.invuln <= 0) {
						player.hp -= 1;
						player.invuln = PLAYER_INVULN;
						state.effects.push({
							x: bullet.x,
							y: bullet.y,
							t: 0,
							life: .35
						});
						dead = true;
						if (player.hp <= 0) player.alive = false;
					}
				}
				if (!dead) aliveBullets.push(bullet);
			}
			state.bullets = aliveBullets;
			if (state.effects.length > 0) {
				for (const effect of state.effects) effect.t += dt;
				state.effects = state.effects.filter((effect) => effect.t < effect.life);
			}
			if (!player.alive) {
				state.result = "lose";
				return;
			}
			if (state.enemies.length === 0 && state.spawnQueue === 0) {
				if (state.wave < 3) {
					state.wave += 1;
					state.mapIndex = mapIndexForWave(state.wave);
					state.grid = buildGrid(state.mapIndex);
					state.bullets = [];
					state.effects = [];
					state.spawnQueue = 5;
					state.spawnTimer = .8;
					state.flow = null;
					state.player.x = PLAYER_START$1[0] * 32;
					state.player.y = PLAYER_START$1[1] * 32;
					state.player.dir = 0;
					state.player.targetDir = 0;
					state.player.invuln = Math.max(state.player.invuln, 1.2);
				} else state.result = "win";
			}
		}
		/** Whether a bullet's rect overlaps a tank's rect (shrunk by 2px). */
		function bulletHitsTank(bullet, tank) {
			return bullet.x + 2 < tank.x + 32 - 2 && bullet.x + 6 - 2 > tank.x + 2 && bullet.y + 2 < tank.y + 32 - 2 && bullet.y + 6 - 2 > tank.y + 2;
		}
		//#endregion
		//#region src/client/games/tanks/render.ts
		/**
		* Tank battle canvas renderer on the shared theme kit: gradient field,
		* themed brick/steel tiles, glowing rounded tanks and tracers, explosion
		* particles (observed from score/effects), a hudPair HUD, and themed
		* end-of-round overlay.
		*/
		const BRICK$1 = "#8a5a3a";
		const BRICK_LIGHT$1 = "#9c6a46";
		const BRICK_DARK$1 = "#5f3c26";
		const STEEL = "#8a8a98";
		const STEEL_DARK = "#5c5c68";
		const TREAD = "#3a3a44";
		const BULLET_CORE = "#ffffff";
		const PLAYER = accent(0);
		const ENEMY = accent(4);
		const TANK_W = 480;
		const TANK_H = 416;
		const particles$24 = createParticles();
		let prevScore$10 = -1;
		let prevEffects = 0;
		let lastFrame$7 = 0;
		function drawTile$3(ctx, tx, ty, tile) {
			const x = tx * 32;
			const y = ty * 32;
			if (tile === 1) {
				ctx.fillStyle = (tx + ty) % 2 === 0 ? BRICK$1 : BRICK_DARK$1;
				ctx.fillRect(x, y, 32, 32);
				ctx.fillStyle = BRICK_LIGHT$1;
				ctx.fillRect(x, y, 32, 3);
				ctx.strokeStyle = BRICK_DARK$1;
				ctx.lineWidth = 1;
				for (let i = 1; i < 4; i += 1) {
					ctx.beginPath();
					ctx.moveTo(x, y + 8 * i + .5);
					ctx.lineTo(x + 32, y + 8 * i + .5);
					ctx.stroke();
				}
				ctx.beginPath();
				ctx.moveTo(x + 16 + .5, y);
				ctx.lineTo(x + 16 + .5, y + 32);
				ctx.stroke();
			} else if (tile === 2) {
				roundRectPath(ctx, x + 1, y + 1, 30, 30, 4);
				ctx.fillStyle = STEEL;
				ctx.fill();
				ctx.strokeStyle = STEEL_DARK;
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.fillStyle = STEEL_DARK;
				for (const [rx, ry] of [
					[8, 8],
					[23, 8],
					[8, 23],
					[23, 23]
				]) ctx.fillRect(x + rx, y + ry, 3, 3);
			}
		}
		function drawTank(ctx, tank, t) {
			if (tank.invuln > 0 && Math.floor(performance.now() / 110) % 2 === 0) return;
			const x = tank.x;
			const y = tank.y;
			const isPlayer = tank.kind === "player";
			const body = isPlayer ? PLAYER : ENEMY;
			const dark = isPlayer ? THEME.bgBottom : "#a83a4e";
			const cx = x + 16;
			const cy = y + 16;
			ctx.fillStyle = TREAD;
			roundRectPath(ctx, x + 3, y + 3, 26, 26, 4);
			ctx.fill();
			const tick = Math.floor((t * 90 + (isPlayer ? 0 : 40)) % 32);
			ctx.fillStyle = dark;
			for (let i = 0; i < 3; i += 1) {
				const off = (tick + i * 12) % 32;
				ctx.fillRect(x + 6, y + 3 + off, 4, 5);
				ctx.fillRect(x + 32 - 10, y + 3 + off, 4, 5);
			}
			glow(ctx, body, 10);
			ctx.fillStyle = body;
			roundRectPath(ctx, x + 8, y + 8, 16, 16, 5);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = dark;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = dark;
			ctx.fillRect(cx - 4 + DIR_DX$1[tank.dir] * 12, cy - 4 + DIR_DY$1[tank.dir] * 12, 8, 8);
			ctx.fillStyle = body;
			ctx.fillRect(cx - 3, cy - 3, 6, 6);
		}
		function drawBullet$1(ctx, bullet) {
			const color = bullet.owner === "player" ? THEME.gold : accent(4);
			glow(ctx, color, 12);
			ctx.fillStyle = color;
			roundRectPath(ctx, bullet.x - 2, bullet.y - 2, 10, 10, 3);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = BULLET_CORE;
			ctx.fillRect(bullet.x, bullet.y, 6, 6);
		}
		/** Draw one frame of the battle; `paused` veils the scene. */
		function renderTanks(ctx, state, paused) {
			ctx.clearRect(0, 0, TANK_W, TANK_H);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$7 === 0 ? 16 : now - lastFrame$7);
			lastFrame$7 = now;
			drawBackground(ctx, TANK_W, TANK_H);
			for (let ty = 0; ty < 13; ty += 1) for (let tx = 0; tx < 15; tx += 1) {
				const tile = state.grid[ty][tx];
				if (tile !== 0) drawTile$3(ctx, tx, ty, tile);
			}
			ctx.strokeStyle = "rgba(255,255,255,0.05)";
			ctx.lineWidth = 1;
			for (let tx = 1; tx < 15; tx += 1) {
				ctx.beginPath();
				ctx.moveTo(tx * 32 + .5, 0);
				ctx.lineTo(tx * 32 + .5, TANK_H);
				ctx.stroke();
			}
			for (let ty = 1; ty < 13; ty += 1) {
				ctx.beginPath();
				ctx.moveTo(0, ty * 32 + .5);
				ctx.lineTo(TANK_W, ty * 32 + .5);
				ctx.stroke();
			}
			if (state.score > prevScore$10 && state.effects.length > 0) {
				const e = state.effects[state.effects.length - 1];
				particles$24.burst(e.x, e.y, accent(7), 18, 150);
			} else if (state.effects.length > prevEffects) {
				const e = state.effects[state.effects.length - 1];
				particles$24.burst(e.x, e.y, THEME.gold, 8, 90);
			}
			prevScore$10 = state.score;
			prevEffects = state.effects.length;
			particles$24.tick(ctx, dt);
			for (const bullet of state.bullets) drawBullet$1(ctx, bullet);
			for (const enemy of state.enemies) drawTank(ctx, enemy, state.t);
			if (state.player.alive) drawTank(ctx, state.player, state.t);
			hudPair(ctx, 8, 16, `第 ${state.wave}/3 波 · `, `剩余敌人 ${state.enemies.length + state.spawnQueue}`);
			hudPair(ctx, 8, 32, "生命 ", "♥".repeat(Math.max(0, state.player.hp)), "left", THEME.bad);
			hudPair(ctx, 8, 48, "得分 ", String(state.score), "left", THEME.gold);
			if (state.result !== "none") drawOverlay(ctx, TANK_W, TANK_H, state.result === "win" ? "胜利！" : "GAME OVER", `得分 ${state.score} · 按 R 重新开始`, state.result === "win" ? THEME.good : THEME.bad);
			else if (paused) drawOverlay(ctx, TANK_W, TANK_H, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/tanks/index.ts
		function createTanksGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, TANK_W, TANK_H);
			if (fit === null) throw new Error("dsh-minigames: tanks needs a 2d canvas context");
			const ctx = fit.ctx;
			let world = createWorld$1();
			let lastScore = -1;
			const input = {
				up: false,
				down: false,
				left: false,
				right: false,
				fire: false
			};
			const reportScore = () => {
				if (world.score === lastScore) return;
				lastScore = world.score;
				options?.onScore?.(world.score);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				switch (event.code) {
					case "ArrowUp":
					case "KeyW":
						event.preventDefault();
						input.up = true;
						break;
					case "ArrowDown":
					case "KeyS":
						event.preventDefault();
						input.down = true;
						break;
					case "ArrowLeft":
					case "KeyA":
						event.preventDefault();
						input.left = true;
						break;
					case "ArrowRight":
					case "KeyD":
						event.preventDefault();
						input.right = true;
						break;
					case "Space":
						event.preventDefault();
						input.fire = true;
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
						break;
					case "KeyR": if (world.result !== "none") reset();
				}
			};
			const onKeyUp = (event) => {
				switch (event.code) {
					case "ArrowUp":
					case "KeyW":
						input.up = false;
						break;
					case "ArrowDown":
					case "KeyS":
						input.down = false;
						break;
					case "ArrowLeft":
					case "KeyA":
						input.left = false;
						break;
					case "ArrowRight":
					case "KeyD":
						input.right = false;
						break;
					case "Space": input.fire = false;
				}
			};
			const loop = createFrameLoop((f) => {
				stepWorld$1(world, f.dt, input);
				reportScore();
				if (f.render) renderTanks(ctx, world, false);
			});
			const reset = () => {
				world = createWorld$1();
				lastScore = -1;
				input.up = input.down = input.left = input.right = input.fire = false;
				reportScore();
				loop.markDirty();
			};
			const togglePause = () => {
				if (loop.running) pause();
				else resume();
			};
			const pause = () => {
				if (!loop.running) return;
				loop.pause();
				renderTanks(ctx, world, true);
			};
			const resume = () => {
				loop.resume();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			loop.start();
			renderTanks(ctx, world, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
				}
			};
		}
		const tanksGame = {
			id: "tanks",
			title: "坦克大战",
			icon: "🛡️",
			description: "2D 坦克对战（带 AI）：WASD/方向键移动，空格开火，消灭三波敌军。",
			controls: [
				"WASD / 方向键：移动",
				"空格：开火",
				"P：暂停",
				"R：重开"
			],
			create: createTanksGame
		};
		/** Score for removing a 4-connected group of `size` — super-linear (quadratic),
		* so one big pop vastly outweighs many small ones. */
		function scoreForGroup(size) {
			return 10 * size * size;
		}
		/** The target score a level requires; each level adds 400 (800, 1200, 1600,
		* ...). A greedy solver clears ~1700 points on a typical board, so the early
		* levels are comfortably reachable and later ones become the natural end. */
		function levelTarget(level) {
			return 800 + (level - 1) * 400;
		}
		function randomKind(state) {
			return 1 + Math.floor(state.rng() * state.kinds);
		}
		/** Fill the board with random gems (groups are fine — they are what you click). */
		function shuffle$1(state) {
			const { rows, cols } = state;
			state.grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => randomKind(state)));
		}
		/** A fresh, playable level-1 board. */
		function createMatch3State(rng = Math.random, rows = 8, cols = 8, kinds = 5) {
			const state = {
				rows,
				cols,
				kinds,
				grid: [],
				score: 0,
				target: levelTarget(1),
				level: 1,
				result: "none",
				rng
			};
			shuffle$1(state);
			return state;
		}
		/** The 4-connected same-color group containing `pos` (empty when the cell is empty). */
		function groupAt(grid, pos) {
			const rows = grid.length;
			const cols = grid[0].length;
			const kind = grid[pos.r][pos.c];
			if (kind === 0) return [];
			const seen = /* @__PURE__ */ new Set([`${pos.r},${pos.c}`]);
			const queue = [{
				r: pos.r,
				c: pos.c
			}];
			const out = [];
			while (queue.length > 0) {
				const p = queue.shift();
				out.push(p);
				for (const [dr, dc] of [
					[0, 1],
					[0, -1],
					[1, 0],
					[-1, 0]
				]) {
					const nr = p.r + dr;
					const nc = p.c + dc;
					if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
					const key = `${nr},${nc}`;
					if (seen.has(key)) continue;
					if (grid[nr][nc] === kind) {
						seen.add(key);
						queue.push({
							r: nr,
							c: nc
						});
					}
				}
			}
			return out;
		}
		/** Size of the largest 4-connected group on the board (0 when empty). */
		function largestGroupSize(grid) {
			const rows = grid.length;
			const cols = grid[0].length;
			const visited = /* @__PURE__ */ new Set();
			let max = 0;
			for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
				const key = `${r},${c}`;
				if (visited.has(key) || grid[r][c] === 0) continue;
				const group = groupAt(grid, {
					r,
					c
				});
				for (const p of group) visited.add(`${p.r},${p.c}`);
				if (group.length > max) max = group.length;
			}
			return max;
		}
		/** Whether any group of size >= 2 remains (the board still has moves). */
		function hasRemovableGroup(grid) {
			return largestGroupSize(grid) >= 2;
		}
		/** Compute the fall mapping a removal will cause (matches {@link applyRemoval}). */
		function planRemoval(grid, positions) {
			const rows = grid.length;
			const removedSet = new Set(positions.map((p) => `${p.r},${p.c}`));
			const removedByCol = /* @__PURE__ */ new Map();
			for (const p of positions) {
				const list = removedByCol.get(p.c) ?? [];
				list.push(p.r);
				removedByCol.set(p.c, list);
			}
			const falls = [];
			for (let c = 0; c < grid[0].length; c += 1) {
				const removedRows = (removedByCol.get(c) ?? []).sort((a, b) => a - b);
				for (let r = 0; r < rows; r += 1) {
					if (removedSet.has(`${r},${c}`)) continue;
					const drop = removedRows.filter((rr) => rr > r).length;
					if (drop > 0) falls.push({
						from: {
							r,
							c
						},
						to: {
							r: r + drop,
							c
						}
					});
				}
			}
			return {
				removed: positions,
				falls
			};
		}
		/** Commit a removal: zero the cells and drop everything above them. */
		function applyRemoval(grid, positions) {
			for (const p of positions) grid[p.r][p.c] = 0;
			const rows = grid.length;
			const cols = grid[0].length;
			for (let c = 0; c < cols; c += 1) {
				let write = rows - 1;
				for (let r = rows - 1; r >= 0; r -= 1) if (grid[r][c] !== 0) {
					grid[write][c] = grid[r][c];
					if (write !== r) grid[r][c] = 0;
					write -= 1;
				}
			}
		}
		/** Remove the group at `pos`, score it, and let the rest fall. Returns the group. */
		function removeGroup(state, pos) {
			const group = groupAt(state.grid, pos);
			if (group.length === 0) return [];
			state.score += scoreForGroup(group.length);
			applyRemoval(state.grid, group);
			return group;
		}
		/** Re-evaluate win/lose after a removal (no-op once a result is set). */
		function updateResult(state) {
			if (state.result !== "none") return;
			if (state.score >= state.target) state.result = "win";
			else if (!hasRemovableGroup(state.grid)) state.result = "lose";
		}
		/** Start the next level: fresh board, reset score, +400 target. */
		function advanceLevel$3(state) {
			state.level += 1;
			state.target = levelTarget(state.level);
			state.score = 0;
			state.result = "none";
			shuffle$1(state);
		}
		/** Restart the whole run from level 1. */
		function restart$1(state) {
			state.level = 1;
			state.target = levelTarget(1);
			state.score = 0;
			state.result = "none";
			shuffle$1(state);
		}
		/** Gem fill/dark colors by kind (1..5), from the shared accent ramp. */
		const GEM_COLORS = [
			"",
			accent(0),
			accent(1),
			accent(2),
			accent(3),
			accent(4)
		];
		const BOARD_BG = "#101018";
		const GRID_LINE = "rgba(255,255,255,0.05)";
		const CURSOR = THEME.gold;
		const particles$23 = createParticles();
		let prevScore$9 = -1;
		let prevFrameMs$10 = 0;
		function cellX$3(c) {
			return c * 44 + 22;
		}
		function cellY$3(r) {
			return 40 + r * 44 + 22;
		}
		/** Draw one gem shape at (cx, cy), radius r. */
		function drawGem(ctx, kind, cx, cy, r) {
			const color = GEM_COLORS[kind];
			glow(ctx, color, 7);
			ctx.fillStyle = color;
			switch (kind) {
				case 1:
					ctx.beginPath();
					ctx.arc(cx, cy, r * .62, 0, Math.PI * 2);
					ctx.fill();
					break;
				case 2:
					roundRectPath(ctx, cx - r * .6, cy - r * .6, r * 1.2, r * 1.2, r * .25);
					ctx.fill();
					break;
				case 3:
					ctx.beginPath();
					ctx.moveTo(cx, cy - r * .7);
					ctx.lineTo(cx - r * .7, cy + r * .6);
					ctx.lineTo(cx + r * .7, cy + r * .6);
					ctx.closePath();
					ctx.fill();
					break;
				case 4:
					ctx.beginPath();
					ctx.moveTo(cx, cy - r * .75);
					ctx.lineTo(cx + r * .6, cy);
					ctx.lineTo(cx, cy + r * .75);
					ctx.lineTo(cx - r * .6, cy);
					ctx.closePath();
					ctx.fill();
					break;
				default:
					ctx.beginPath();
					for (let i = 0; i < 10; i += 1) {
						const radius = i % 2 === 0 ? r * .75 : r * .34;
						const angle = -Math.PI / 2 + i * Math.PI / 5;
						const px = cx + Math.cos(angle) * radius;
						const py = cy + Math.sin(angle) * radius;
						if (i === 0) ctx.moveTo(px, py);
						else ctx.lineTo(px, py);
					}
					ctx.closePath();
					ctx.fill();
			}
			noGlow(ctx);
			ctx.strokeStyle = "rgba(0,0,0,0.35)";
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.fillStyle = "rgba(255,255,255,0.28)";
			ctx.beginPath();
			ctx.arc(cx - r * .2, cy - r * .28, r * .18, 0, Math.PI * 2);
			ctx.fill();
		}
		function drawHud$3(ctx, state) {
			hudPair(ctx, 10, 16, "关卡 ", String(state.level), "left", accent(2));
			hudPair(ctx, 342, 16, "得分 ", `${state.score} / ${state.target}`, "right", THEME.gold);
			const progress = Math.min(1, state.score / state.target);
			ctx.fillStyle = THEME.panelEdge;
			roundRectPath(ctx, 10, 24, 332, 6, 3);
			ctx.fill();
			if (progress > .005) {
				glow(ctx, THEME.good, 6);
				ctx.fillStyle = THEME.good;
				roundRectPath(ctx, 10, 24, 332 * progress, 6, 3);
				ctx.fill();
				noGlow(ctx);
			}
			ctx.fillStyle = THEME.textMuted;
			ctx.font = "600 10px system-ui, sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("点击同色四连通块消除", 10, 37);
		}
		/** Draw one frame. `grid` is the display grid (pre-removal during the clear phase). */
		function renderMatch3(ctx, state, grid, view) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$10 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$10);
			prevFrameMs$10 = nowMs;
			ctx.clearRect(0, 0, 352, 392);
			drawBackground(ctx, 352, 392);
			ctx.fillStyle = BOARD_BG;
			ctx.fillRect(0, 40, 352, 352);
			drawHud$3(ctx, state);
			ctx.strokeStyle = GRID_LINE;
			ctx.lineWidth = 1;
			for (let i = 1; i < 8; i += 1) {
				ctx.beginPath();
				ctx.moveTo(i * 44 + .5, 40);
				ctx.lineTo(i * 44 + .5, 392);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, 40 + i * 44 + .5);
				ctx.lineTo(352, 40 + i * 44 + .5);
				ctx.stroke();
			}
			const clear = view.clear;
			const falling = /* @__PURE__ */ new Map();
			if (clear !== null) for (const fall of clear.falls) falling.set(`${fall.from.r},${fall.from.c}`, fall);
			const removedSet = new Set(clear?.removed.map((p) => `${p.r},${p.c}`) ?? []);
			for (let r = 0; r < grid.length; r += 1) for (let c = 0; c < grid[0].length; c += 1) {
				const key = `${r},${c}`;
				const kind = grid[r][c];
				if (kind === 0 || removedSet.has(key)) continue;
				const fall = falling.get(key);
				if (fall !== void 0 && clear !== null) {
					const k = clear.t * clear.t;
					drawGem(ctx, kind, cellX$3(fall.from.c), cellY$3(fall.from.r) + (cellY$3(fall.to.r) - cellY$3(fall.from.r)) * k, 18.48);
				} else drawGem(ctx, kind, cellX$3(c), cellY$3(r), 18.48);
			}
			if (clear !== null) {
				const pulse = .4 + .5 * Math.abs(Math.sin(clear.t * 24));
				for (const p of clear.removed) {
					ctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(2)})`;
					ctx.fillRect(p.c * 44 + 2, 40 + p.r * 44 + 2, 40, 40);
				}
				const bottomRow = Math.max(...clear.removed.map((p) => p.r));
				ctx.fillStyle = THEME.gold;
				ctx.font = "bold 14px system-ui, sans-serif";
				ctx.textAlign = "center";
				ctx.globalAlpha = Math.max(0, 1 - clear.t);
				ctx.fillText(clear.scoreText, 176, cellY$3(bottomRow) - 8 - clear.t * 22);
				ctx.globalAlpha = 1;
			}
			if (clear !== null && prevScore$9 >= 0 && state.score > prevScore$9 && clear.t < .2) {
				const cx = clear.removed.reduce((s, p) => s + cellX$3(p.c), 0) / clear.removed.length;
				const cy = clear.removed.reduce((s, p) => s + cellY$3(p.r), 0) / clear.removed.length;
				const kind = grid[clear.removed[0].r][clear.removed[0].c];
				particles$23.burst(cx, cy, GEM_COLORS[kind] ?? THEME.gold, 16, 150);
			}
			prevScore$9 = state.score;
			particles$23.tick(ctx, dtMs);
			if (view.cursor !== null) {
				const p = view.cursor;
				ctx.strokeStyle = CURSOR;
				ctx.lineWidth = 1.5;
				ctx.setLineDash([4, 3]);
				ctx.strokeRect(p.c * 44 + 3, 40 + p.r * 44 + 3, 38, 38);
				ctx.setLineDash([]);
			}
			if (view.result === "win" || view.result === "lose") {
				ctx.save();
				ctx.translate(0, 40);
				if (view.result === "win") drawOverlay(ctx, 352, 352, "过关！", `第 ${state.level} 关完成 · 目标 ${state.target}`, THEME.gold);
				else drawOverlay(ctx, 352, 352, "游戏结束", `得分 ${state.score} / 目标 ${state.target} · 按 R 重新开始`, THEME.bad);
				ctx.restore();
			} else if (view.paused) drawOverlay(ctx, 352, 392, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/match3/index.ts
		const CLEAR_MS$1 = 280;
		const WIN_MS = 900;
		function createMatch3Game(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 352, 392);
			if (fit === null) throw new Error("dsh-minigames: match3 needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createMatch3State();
			let running = false;
			let lastScore = -1;
			let phase = "idle";
			let phaseT = 0;
			let cursor = {
				r: 0,
				c: 0
			};
			let clearPlan = null;
			let clearGrid = [];
			let clearScoreText = "";
			/** The display grid: the pre-removal grid during the clear animation. */
			let displayGrid = state.grid;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * 352 / rect.width;
				const y = (event.clientY - rect.top) * 392 / rect.height;
				const c = Math.floor(x / 44);
				const r = Math.floor((y - 40) / 44);
				if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null;
				return {
					r,
					c
				};
			};
			/** Remove the group at `pos` with a flash + fall animation. */
			const pop = (pos) => {
				if (phase !== "idle") return;
				const group = groupAt(state.grid, pos);
				if (group.length === 0) return;
				clearPlan = planRemoval(state.grid, group);
				clearGrid = state.grid.map((row) => [...row]);
				clearScoreText = `+${scoreForGroup(group.length)}`;
				removeGroup(state, pos);
				reportScore();
				displayGrid = clearGrid;
				phase = "clear";
				phaseT = 0;
				loop.markDirty();
			};
			const onPointerDown = (event) => {
				if (!running) return;
				const cell = cellFromEvent(event);
				if (cell !== null) pop(cell);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const wasCursorKey = event.code.startsWith("Arrow");
				switch (event.code) {
					case "ArrowUp":
						event.preventDefault();
						cursor = {
							r: Math.max(0, cursor.r - 1),
							c: cursor.c
						};
						break;
					case "ArrowDown":
						event.preventDefault();
						cursor = {
							r: Math.min(state.rows - 1, cursor.r + 1),
							c: cursor.c
						};
						break;
					case "ArrowLeft":
						event.preventDefault();
						cursor = {
							r: cursor.r,
							c: Math.max(0, cursor.c - 1)
						};
						break;
					case "ArrowRight":
						event.preventDefault();
						cursor = {
							r: cursor.r,
							c: Math.min(state.cols - 1, cursor.c + 1)
						};
						break;
					case "Space":
						event.preventDefault();
						if (!running) return;
						pop(cursor);
						break;
					case "KeyR":
						event.preventDefault();
						if (phase === "lose") {
							restart$1(state);
							displayGrid = state.grid;
							reportScore();
							phase = "idle";
							phaseT = 0;
							loop.markDirty();
						}
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
				}
				if (wasCursorKey) loop.markDirty();
			};
			const advancePhase = (dt) => {
				phaseT += dt * 1e3;
				if (phase === "clear" && phaseT >= CLEAR_MS$1) {
					displayGrid = state.grid;
					updateResult(state);
					if (state.result === "win") {
						phase = "win";
						phaseT = 0;
					} else if (state.result === "lose") phase = "lose";
					else phase = "idle";
					clearPlan = null;
				} else if (phase === "win" && phaseT >= WIN_MS) {
					advanceLevel$3(state);
					displayGrid = state.grid;
					reportScore();
					phase = "idle";
					phaseT = 0;
				}
			};
			const frame = (f) => {
				if (!running) return;
				advancePhase(f.dt);
				if (!f.render && phase === "idle") return;
				const view = {
					cursor,
					clear: phase === "clear" && clearPlan !== null ? {
						removed: clearPlan.removed,
						falls: clearPlan.falls,
						t: Math.min(1, phaseT / CLEAR_MS$1),
						scoreText: clearScoreText
					} : null,
					result: phase === "win" || phase === "lose" ? state.result : "none",
					paused: false
				};
				renderMatch3(ctx, state, displayGrid, view);
			};
			const loop = createFrameLoop(frame);
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderMatch3(ctx, state, displayGrid, {
					cursor,
					clear: null,
					result: phase === "win" || phase === "lose" ? state.result : "none",
					paused: true
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderMatch3(ctx, state, state.grid, {
				cursor,
				clear: null,
				result: "none",
				paused: false
			});
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const match3Game = {
			id: "match3",
			title: "消消乐",
			icon: "💎",
			description: "点击同色四连通块消除，一次消得越多分越高；达到目标分过关，目标逐关提高。",
			controls: [
				"点击：消除同色四连通块",
				"方向键 + 空格：键盘消除",
				"R：重开",
				"P：暂停"
			],
			create: createMatch3Game
		};
		//#endregion
		//#region src/client/games/snake/logic.ts
		const DIRS$6 = [
			[-1, 0],
			[0, 1],
			[1, 0],
			[0, -1]
		];
		/** A fresh snake: 3 cells in the middle, moving right, food placed elsewhere. */
		function createSnakeState(rng = Math.random) {
			const state = {
				cols: 16,
				rows: 12,
				snake: [
					{
						r: Math.floor(6),
						c: Math.floor(8) + 1
					},
					{
						r: Math.floor(6),
						c: Math.floor(8)
					},
					{
						r: Math.floor(6),
						c: Math.floor(8) - 1
					}
				],
				dir: 1,
				food: {
					r: 0,
					c: 0
				},
				score: 0,
				over: false,
				rng
			};
			placeFood(state);
			return state;
		}
		/** A random empty cell becomes the new food. */
		function placeFood(state) {
			const occupied = new Set(state.snake.map((p) => `${p.r},${p.c}`));
			const empty = [];
			for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) if (!occupied.has(`${r},${c}`)) empty.push({
				r,
				c
			});
			if (empty.length === 0) {
				state.over = true;
				return;
			}
			state.food = empty[Math.floor(state.rng() * empty.length)];
		}
		/** Change direction (no 180° reversal). */
		function turn$1(state, dir) {
			if ((state.dir + 2) % 4 === dir) return;
			state.dir = dir;
		}
		/**
		* Advance one tick: move the head, handle food / self collision. The board is
		* a torus — crossing a wall wraps the snake to the opposite side.
		*/
		function stepSnake(state) {
			if (state.over) return;
			const [dr, dc] = DIRS$6[state.dir];
			const head = state.snake[0];
			const next = {
				r: (head.r + dr + state.rows) % state.rows,
				c: (head.c + dc + state.cols) % state.cols
			};
			const eats = next.r === state.food.r && next.c === state.food.c;
			const body = state.snake;
			body[body.length - 1];
			const willMoveTail = !eats;
			for (let i = 0; i < body.length; i += 1) {
				const p = body[i];
				if (p.r === next.r && p.c === next.c) {
					if (willMoveTail && i === body.length - 1) continue;
					state.over = true;
					return;
				}
			}
			body.unshift(next);
			if (eats) {
				state.score += 1;
				placeFood(state);
			} else body.pop();
		}
		const particles$22 = createParticles();
		let prevScore$8 = 0;
		let prevFrameMs$9 = 0;
		/**
		* Draw one frame.
		* @param paused - show the pause overlay.
		*/
		function renderSnake(ctx, state, paused) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$9 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$9);
			prevFrameMs$9 = nowMs;
			drawBackground(ctx, 416, 342);
			hudPair(ctx, 10, 20, "得分", `${state.score}`);
			ctx.strokeStyle = "rgba(255,255,255,0.04)";
			ctx.lineWidth = 1;
			for (let c = 1; c < 16; c += 1) {
				ctx.beginPath();
				ctx.moveTo(c * 26 + .5, 30);
				ctx.lineTo(c * 26 + .5, 342);
				ctx.stroke();
			}
			for (let r = 1; r < 12; r += 1) {
				ctx.beginPath();
				ctx.moveTo(0, 30 + r * 26 + .5);
				ctx.lineTo(416, 30 + r * 26 + .5);
				ctx.stroke();
			}
			const head = state.snake[0];
			if (state.score > prevScore$8) particles$22.burst(head.c * 26 + 13, 30 + head.r * 26 + 13, THEME.good, 14, 130);
			prevScore$8 = state.score;
			glow(ctx, THEME.bad, 10);
			ctx.fillStyle = THEME.bad;
			ctx.beginPath();
			ctx.arc(state.food.c * 26 + 13, 30 + state.food.r * 26 + 13, 7.8, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			state.snake.forEach((p, i) => {
				const x = p.c * 26;
				const y = 30 + p.r * 26;
				if (i === 0) {
					glow(ctx, THEME.good, 10);
					ctx.fillStyle = THEME.good;
				} else {
					noGlow(ctx);
					ctx.fillStyle = THEME.good;
					ctx.globalAlpha = Math.max(.35, .85 - i * .02);
				}
				roundRectPath(ctx, x + 1.5, y + 1.5, 23, 23, 7);
				ctx.fill();
			});
			ctx.globalAlpha = 1;
			noGlow(ctx);
			particles$22.tick(ctx, dtMs);
			if (state.over) drawOverlay(ctx, 416, 342, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
			else if (paused) drawOverlay(ctx, 416, 342, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/snake/index.ts
		const TICK_BASE = 180;
		const TICK_MIN = 70;
		/** Tick interval in ms — faster as the snake grows. */
		function tickFor(score) {
			return Math.max(TICK_MIN, TICK_BASE - score * 6);
		}
		function createSnakeGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 416, 342);
			if (fit === null) throw new Error("dsh-minigames: snake needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createSnakeState();
			let tickAcc = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				switch (event.code) {
					case "ArrowUp":
					case "KeyW":
						event.preventDefault();
						turn$1(state, 0);
						break;
					case "ArrowDown":
					case "KeyS":
						event.preventDefault();
						turn$1(state, 2);
						break;
					case "ArrowLeft":
					case "KeyA":
						event.preventDefault();
						turn$1(state, 3);
						break;
					case "ArrowRight":
					case "KeyD":
						event.preventDefault();
						turn$1(state, 1);
						break;
					case "KeyR":
						event.preventDefault();
						reset();
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
				}
			};
			const reset = () => {
				state = createSnakeState();
				tickAcc = 0;
				lastScore = -1;
				reportScore();
				loop.markDirty();
			};
			const loop = createFrameLoop((f) => {
				if (!state.over) {
					tickAcc += f.dt * 1e3;
					const interval = tickFor(state.score);
					while (tickAcc >= interval && !state.over) {
						tickAcc -= interval;
						stepSnake(state);
						reportScore();
					}
				}
				if (f.render) renderSnake(ctx, state, false);
			});
			const togglePause = () => {
				if (loop.running) pause();
				else resume();
			};
			const pause = () => {
				if (!loop.running) return;
				loop.pause();
				renderSnake(ctx, state, true);
			};
			const resume = () => {
				loop.resume();
			};
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			loop.start();
			renderSnake(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const snakeGame = {
			id: "snake",
			title: "贪吃蛇",
			icon: "🐍",
			description: "经典贪吃蛇：方向键移动，吃食物变长；穿越边界会从对侧出现。",
			controls: [
				"方向键 / WASD：移动",
				"R：重开",
				"P：暂停"
			],
			create: createSnakeGame
		};
		function emptyGrid$3() {
			return Array.from({ length: 4 }, () => Array(4).fill(null));
		}
		/** All empty cells. */
		function emptyCells$2(grid) {
			const out = [];
			for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) if (grid[r][c] === null) out.push({
				r,
				c,
				value: 0
			});
			return out;
		}
		/** Spawn a 2 (90%) or 4 (10%) on a random empty cell. */
		function spawnTile$1(state) {
			const empty = emptyCells$2(state.grid);
			if (empty.length === 0) return;
			const spot = empty[Math.floor(state.rng() * empty.length)];
			state.grid[spot.r][spot.c] = state.rng() < .9 ? 2 : 4;
		}
		/** A fresh board with two starting tiles. */
		function create2048State(rng = Math.random) {
			const state = {
				grid: emptyGrid$3(),
				score: 0,
				won: false,
				over: false,
				rng
			};
			spawnTile$1(state);
			spawnTile$1(state);
			return state;
		}
		/**
		* Slide one row/column toward the start (compacting and merging equal
		* neighbours). Returns { moved, gained }.
		*/
		function slideLine(line) {
			const kept = line.filter((v) => v !== null);
			const merged = [];
			let gained = 0;
			for (let i = 0; i < kept.length; i += 1) if (i + 1 < kept.length && kept[i] === kept[i + 1]) {
				const v = kept[i] * 2;
				merged.push(v);
				gained += v;
				i += 1;
			} else merged.push(kept[i]);
			while (merged.length < 4) merged.push(0);
			const moved = line.some((v, i) => (v ?? 0) !== (merged[i] ?? 0));
			for (let i = 0; i < 4; i += 1) line[i] = (merged[i] ?? 0) === 0 ? null : merged[i] ?? 0;
			return {
				moved,
				gained
			};
		}
		/** Extract a row or column as a line (dir: 0 up, 1 right, 2 down, 3 left). */
		function extract(grid, axis, index, reverse) {
			const line = [];
			for (let i = 0; i < 4; i += 1) {
				const v = axis === "row" ? grid[index][i] : grid[i][index];
				line.push(v);
			}
			return reverse ? line.reverse() : line;
		}
		/** Write a line back into the grid. */
		function write(grid, axis, index, reverse, line) {
			const data = reverse ? [...line].reverse() : line;
			for (let i = 0; i < 4; i += 1) if (axis === "row") grid[index][i] = data[i];
			else grid[i][index] = data[i];
		}
		/** Whether a direction would produce any movement. */
		function couldMove(grid) {
			for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) {
				if (grid[r][c] === null) return true;
				const v = grid[r][c];
				if (r + 1 < 4 && grid[r + 1][c] === v) return true;
				if (c + 1 < 4 && grid[r][c + 1] === v) return true;
			}
			return false;
		}
		/**
		* Apply a move in one direction (0 up, 1 right, 2 down, 3 left). Valid moves
		* spawn a tile and update score/win/over.
		*/
		function move2048(state, dir) {
			if (state.over) return false;
			const axis = dir === 0 || dir === 2 ? "col" : "row";
			const reverse = dir === 1 || dir === 2;
			let moved = false;
			let gained = 0;
			for (let i = 0; i < 4; i += 1) {
				const line = extract(state.grid, axis, i, reverse);
				const res = slideLine(line);
				if (res.moved) {
					moved = true;
					gained += res.gained;
					write(state.grid, axis, i, reverse, line);
				}
			}
			if (!moved) return false;
			state.score += gained;
			if (state.grid.flat().some((v) => v !== null && v >= 2048)) state.won = true;
			spawnTile$1(state);
			if (!couldMove(state.grid)) state.over = true;
			return true;
		}
		const particles$21 = createParticles();
		let prevScore$7 = -1;
		let prevNow$5 = 0;
		/** Stable tile accent by exponent of 2 (2 → accent(0), 4 → accent(1), ...). */
		function tileColor(value) {
			return accent(Math.log2(value) - 1);
		}
		function tilePos(i) {
			return 8 + i * 72;
		}
		/**
		* Draw one frame.
		* @param paused - show the pause overlay.
		*/
		function render2048(ctx, state, paused) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$5));
			prevNow$5 = now;
			drawBackground(ctx, 296, 332);
			hudPair(ctx, 10, 24, "", "2048", "left");
			hudPair(ctx, 286, 24, "得分", String(state.score), "right");
			ctx.fillStyle = THEME.panel;
			glow(ctx, THEME.panelEdge, 8);
			roundRectPath(ctx, 0, 36, 296, 296, 10);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			roundRectPath(ctx, .5, 36.5, 295, 295, 10);
			ctx.stroke();
			for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) {
				const x = tilePos(c);
				const y = 36 + tilePos(r);
				const value = state.grid[r][c] ?? null;
				if (value === null) {
					ctx.fillStyle = THEME.bgBottom;
					roundRectPath(ctx, x, y, 64, 64, 8);
					ctx.fill();
					continue;
				}
				const color = tileColor(value);
				ctx.fillStyle = color;
				glow(ctx, color, Math.min(18, 4 + Math.log2(value) * 1.2));
				roundRectPath(ctx, x, y, 64, 64, 8);
				ctx.fill();
				noGlow(ctx);
				ctx.fillStyle = value <= 4 ? THEME.text : "#ffffff";
				ctx.font = value >= 1024 ? "bold 18px system-ui, sans-serif" : "bold 24px system-ui, sans-serif";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(String(value), x + 32, y + 32);
			}
			ctx.textBaseline = "alphabetic";
			if (state.score !== prevScore$7) {
				if (prevScore$7 >= 0 && state.score > prevScore$7) particles$21.burst(148, 184, THEME.good, 12, 160);
				prevScore$7 = state.score;
			}
			particles$21.tick(ctx, dt);
			if (state.won && !state.over) drawOverlay(ctx, 296, 332, "达成 2048！", "继续挑战更高分 · R 重新开始", THEME.gold);
			else if (state.over) drawOverlay(ctx, 296, 332, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
			else if (paused) drawOverlay(ctx, 296, 332, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/game2048/index.ts
		function create2048Game(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 296, 332);
			if (fit === null) throw new Error("dsh-minigames: 2048 needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = create2048State();
			let running = false;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const DIR_KEYS = {
				ArrowUp: 0,
				KeyW: 0,
				ArrowRight: 1,
				KeyD: 1,
				ArrowDown: 2,
				KeyS: 2,
				ArrowLeft: 3,
				KeyA: 3
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const dir = DIR_KEYS[event.code];
				if (dir !== void 0) {
					event.preventDefault();
					if (!running) return;
					if (move2048(state, dir)) {
						reportScore();
						loop.markDirty();
					}
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					state = create2048State();
					lastScore = -1;
					reportScore();
					loop.markDirty();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				f.dt;
				if (f.render) render2048(ctx, state, false);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				render2048(ctx, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.resume();
				loop.markDirty();
			};
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			render2048(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const game2048 = {
			id: "2048",
			title: "2048",
			icon: "🔢",
			description: "方向键滑动合并数字，合成 2048 即达成，继续挑战更高分。",
			controls: [
				"方向键 / WASD：滑动合并",
				"R：重开",
				"P：暂停"
			],
			create: create2048Game
		};
		function makeCell() {
			return {
				mine: false,
				count: 0,
				revealed: false,
				flagged: false
			};
		}
		/** A fresh unseeded board. */
		function createMinesweeperState(rng = Math.random) {
			return {
				grid: Array.from({ length: 9 }, () => Array.from({ length: 9 }, makeCell)),
				seeded: false,
				revealed: 0,
				safeCells: 71,
				elapsed: 0,
				over: false,
				won: false,
				rng
			};
		}
		/** Advance the game clock: counts only after the first click, until the end. */
		function tick$2(state, dt) {
			if (state.seeded && !state.over && !state.won) state.elapsed += dt;
		}
		function neighbours(r, c) {
			const out = [];
			for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
				if (dr === 0 && dc === 0) continue;
				const nr = r + dr;
				const nc = c + dc;
				if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) out.push([nr, nc]);
			}
			return out;
		}
		/** Place mines avoiding the first-click cell and its neighbours. */
		function seedMines(state, safeR, safeC) {
			const safe = new Set([[safeR, safeC], ...neighbours(safeR, safeC)].map(([r, c]) => `${r},${c}`));
			const candidates = [];
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) if (!safe.has(`${r},${c}`)) candidates.push([r, c]);
			let placed = 0;
			while (placed < 10 && candidates.length > 0) {
				const idx = Math.floor(state.rng() * candidates.length);
				const [r, c] = candidates.splice(idx, 1)[0];
				state.grid[r][c].mine = true;
				placed += 1;
			}
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
				let count = 0;
				for (const [nr, nc] of neighbours(r, c)) if (state.grid[nr][nc].mine) count += 1;
				state.grid[r][c].count = count;
			}
			state.seeded = true;
		}
		/** Reveal a cell; flood-fill zeros. Returns true if a mine was hit. */
		function reveal(state, r, c) {
			const cell = state.grid[r][c];
			if (cell.revealed || cell.flagged || state.over || state.won) return false;
			if (!state.seeded) seedMines(state, r, c);
			const stack = [[r, c]];
			while (stack.length > 0) {
				const [cr, cc] = stack.pop();
				const cur = state.grid[cr][cc];
				if (cur.revealed || cur.flagged) continue;
				cur.revealed = true;
				state.revealed += 1;
				if (cur.mine) {
					state.over = true;
					return true;
				}
				if (cur.count === 0) {
					for (const [nr, nc] of neighbours(cr, cc)) if (!state.grid[nr][nc].revealed) stack.push([nr, nc]);
				}
			}
			if (state.revealed >= state.safeCells) state.won = true;
			return false;
		}
		/** Toggle a flag on a hidden cell. */
		function toggleFlag(state, r, c) {
			const cell = state.grid[r][c];
			if (cell.revealed || state.over || state.won) return;
			cell.flagged = !cell.flagged;
		}
		/**
		* Chord (double-click a revealed number): when the flagged neighbours equal
		* the cell's count, reveal every unopened, unflagged neighbour — with the
		* classic risk that a mis-placed flag exposes a mine and ends the game.
		*/
		function chord(state, r, c) {
			const cell = state.grid[r][c];
			if (!cell.revealed || cell.mine || state.over || state.won) return;
			const around = neighbours(r, c);
			if (around.filter(([nr, nc]) => state.grid[nr][nc].flagged).length !== cell.count) return;
			for (const [nr, nc] of around) if (reveal(state, nr, nc) && state.over) {
				revealAllMines(state);
				return;
			}
		}
		/** Reveal all mines (game over display). */
		function revealAllMines(state) {
			for (const row of state.grid) for (const cell of row) if (cell.mine) cell.revealed = true;
		}
		const LOGICAL_W$33 = 270;
		const LOGICAL_H$30 = 300;
		/** Seconds -> "mm:ss" (or "ss" under a minute). */
		function formatTime(seconds) {
			const s = Math.floor(seconds);
			const m = Math.floor(s / 60);
			return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
		}
		const particles$20 = createParticles();
		let prevOver$2 = false;
		let prevWon$4 = false;
		let prevFrameMs$8 = 0;
		/**
		* Draw one frame.
		* @param paused - show the pause overlay.
		*/
		function renderMinesweeper(ctx, state, paused) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$8 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$8);
			prevFrameMs$8 = nowMs;
			drawBackground(ctx, LOGICAL_W$33, LOGICAL_H$30);
			if (state.won && !prevWon$4) particles$20.burst(LOGICAL_W$33 / 2, 165, THEME.gold, 26, 160);
			if (state.over && !prevOver$2) particles$20.burst(LOGICAL_W$33 / 2, 165, THEME.bad, 26, 160);
			prevWon$4 = state.won;
			prevOver$2 = state.over;
			const flagged = state.grid.flat().filter((c) => c.flagged).length;
			hudPair(ctx, 10, 20, "💣", `${Math.max(0, 10 - flagged)}`);
			hudPair(ctx, 260, 20, "⏱", formatTime(state.elapsed), "right");
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
				const x = c * 30;
				const y = 30 + r * 30;
				const cell = state.grid[r][c];
				if (!cell.revealed) {
					roundRectPath(ctx, x + 1.5, y + 1.5, 27, 27, 6);
					ctx.fillStyle = THEME.panel;
					ctx.fill();
					ctx.strokeStyle = THEME.panelEdge;
					ctx.lineWidth = 1;
					ctx.stroke();
					if (cell.flagged) {
						glow(ctx, THEME.bad, 8);
						ctx.fillStyle = THEME.bad;
						ctx.beginPath();
						ctx.arc(x + 15, y + 15, 6.6, 0, Math.PI * 2);
						ctx.fill();
						noGlow(ctx);
					}
				} else if (cell.mine) {
					roundRectPath(ctx, x + 1.5, y + 1.5, 27, 27, 6);
					ctx.fillStyle = "#17171f";
					ctx.fill();
					glow(ctx, THEME.bad, 10);
					ctx.fillStyle = THEME.bad;
					ctx.beginPath();
					ctx.arc(x + 15, y + 15, 8.4, 0, Math.PI * 2);
					ctx.fill();
					noGlow(ctx);
					ctx.fillStyle = THEME.text;
					ctx.beginPath();
					ctx.arc(x + 15 - 2, y + 15 - 2, 2.4, 0, Math.PI * 2);
					ctx.fill();
				} else {
					roundRectPath(ctx, x + 1.5, y + 1.5, 27, 27, 6);
					ctx.fillStyle = "#17171f";
					ctx.fill();
					if (cell.count > 0) {
						const color = accent(cell.count);
						glow(ctx, color, 6);
						ctx.fillStyle = color;
						ctx.font = "bold 14px ui-monospace, monospace";
						ctx.textAlign = "center";
						ctx.textBaseline = "middle";
						ctx.fillText(String(cell.count), x + 15, y + 15);
						noGlow(ctx);
					}
				}
			}
			ctx.textBaseline = "alphabetic";
			particles$20.tick(ctx, dtMs);
			if (state.over) drawOverlay(ctx, LOGICAL_W$33, LOGICAL_H$30, "踩雷了", "按 R 重新开始", THEME.bad);
			else if (state.won) drawOverlay(ctx, LOGICAL_W$33, LOGICAL_H$30, "全部排雷！", `用时 ${formatTime(state.elapsed)} · 按 R 重新开始`, THEME.gold);
			else if (paused) drawOverlay(ctx, LOGICAL_W$33, LOGICAL_H$30, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/minesweeper/index.ts
		/** Time-based score: a faster solve -> a higher score (the panel keeps the max). */
		function solveScore$1(elapsed) {
			return Math.max(0, Math.round(1e3 - elapsed * 2));
		}
		function createMinesweeperGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$33, LOGICAL_H$30);
			if (fit === null) throw new Error("dsh-minigames: minesweeper needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createMinesweeperState();
			let running = false;
			let reported = false;
			let shownSec = -1;
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$33 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$30 / rect.height;
				const c = Math.floor(x / 30);
				const r = Math.floor((y - 30) / 30);
				if (r < 0 || r >= 9 || c < 0 || c >= 9) return null;
				return {
					r,
					c
				};
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const cell = cellFromEvent(event);
				if (cell === null) return;
				if (event.button === 2) {
					event.preventDefault();
					if (!state.over && !state.won) {
						toggleFlag(state, cell.r, cell.c);
						loop.markDirty();
					}
					return;
				}
				if (event.button !== 0 || state.over || state.won) return;
				if (reveal(state, cell.r, cell.c) && state.over) revealAllMines(state);
				loop.markDirty();
			};
			const onContextMenu = (event) => {
				event.preventDefault();
			};
			const onDoubleClick = (event) => {
				if (!running) return;
				const cell = cellFromEvent(event);
				if (cell === null) return;
				chord(state, cell.r, cell.c);
				if (state.over) revealAllMines(state);
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createMinesweeperState();
					reported = false;
					shownSec = -1;
					loop.markDirty();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				tick$2(state, f.dt);
				if (state.won && !reported) {
					reported = true;
					options?.onScore?.(solveScore$1(state.elapsed));
					loop.markDirty();
				}
				const sec = Math.floor(state.elapsed);
				if (sec !== shownSec) {
					shownSec = sec;
					loop.markDirty();
				}
				if (f.render) renderMinesweeper(ctx, state, false);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderMinesweeper(ctx, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.resume();
				loop.markDirty();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("contextmenu", onContextMenu);
			canvas.addEventListener("dblclick", onDoubleClick);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderMinesweeper(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					canvas.removeEventListener("contextmenu", onContextMenu);
					canvas.removeEventListener("dblclick", onDoubleClick);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const minesweeperGame = {
			id: "minesweeper",
			title: "扫雷",
			icon: "💣",
			description: "经典扫雷：左键翻开、右键标旗、双击数字自动展开周围，排完即胜。",
			controls: [
				"左键：翻开",
				"右键：标旗",
				"双击数字：自动展开",
				"R：重开",
				"P：暂停"
			],
			create: createMinesweeperGame
		};
		/** A fresh shuffled deck: PAIRS symbols, each appearing twice. */
		function createMemoryState(rng = Math.random) {
			const symbols = [];
			for (let i = 0; i < 8; i += 1) symbols.push(i, i);
			for (let i = symbols.length - 1; i > 0; i -= 1) {
				const j = Math.floor(rng() * (i + 1));
				const tmp = symbols[i];
				symbols[i] = symbols[j];
				symbols[j] = tmp;
			}
			return {
				cards: symbols,
				flipped: [],
				matched: 0,
				moves: 0,
				finished: false,
				rng
			};
		}
		/** Flip a card. Returns 'match' | 'mismatch' | 'noop' when the flip resolved a pair. */
		function flip(state, index) {
			if (state.finished) return "noop";
			if (state.cards[index] === null || state.flipped.includes(index)) return "noop";
			if (state.flipped.length >= 2) return "noop";
			state.flipped.push(index);
			if (state.flipped.length < 2) return "noop";
			state.moves += 1;
			const a = state.flipped[0];
			const b = state.flipped[1];
			if (state.cards[a] === state.cards[b]) {
				state.cards[a] = null;
				state.cards[b] = null;
				state.matched += 1;
				state.flipped = [];
				if (state.matched === 8) state.finished = true;
				return "match";
			}
			return "mismatch";
		}
		/** Turn any face-up cards back down (e.g. after a mismatch reveal delay). */
		function resetFlip(state) {
			state.flipped = [];
		}
		const BOARD_W$10 = 192;
		const BOARD_H$6 = 192;
		const LOGICAL_W$32 = BOARD_W$10;
		const LOGICAL_H$29 = 224;
		/** Symbol for each card id (0..PAIRS-1). */
		const SYMBOLS = [
			"🍎",
			"🍌",
			"🍇",
			"🍓",
			"🍊",
			"🍉",
			"🥝",
			"🍑"
		];
		const particles$19 = createParticles();
		let prevCards = [];
		let prevFrameMs$7 = 0;
		function cellCenter$5(i) {
			const r = Math.floor(i / 4);
			return {
				x: i % 4 * 48 + 24,
				y: 32 + r * 48 + 24
			};
		}
		/**
		* Draw one frame.
		* @param paused - show the pause overlay.
		*/
		function renderMemory(ctx, state, paused) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$7 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$7);
			prevFrameMs$7 = nowMs;
			ctx.clearRect(0, 0, LOGICAL_W$32, LOGICAL_H$29);
			drawBackground(ctx, LOGICAL_W$32, LOGICAL_H$29);
			hudPair(ctx, 10, 21, "步数 ", String(state.moves));
			hudPair(ctx, 182, 21, "配对 ", `${state.matched}/8`, "right", THEME.good);
			for (let i = 0; i < state.cards.length; i += 1) {
				const x = i % 4 * 48;
				const y = 32 + Math.floor(i / 4) * 48;
				const symbol = state.cards[i] ?? null;
				if (symbol === null) continue;
				if (state.flipped.includes(i)) {
					glow(ctx, accent(symbol), 10);
					ctx.fillStyle = THEME.panel;
					roundRectPath(ctx, x + 2, y + 2, 44, 44, 8);
					ctx.fill();
					noGlow(ctx);
					ctx.strokeStyle = accent(symbol);
					ctx.lineWidth = 2;
					ctx.stroke();
					ctx.font = "26px serif";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText(SYMBOLS[symbol] ?? "?", x + 24, y + 24);
				} else {
					const rim = accent(i);
					ctx.fillStyle = THEME.panel;
					roundRectPath(ctx, x + 2, y + 2, 44, 44, 8);
					ctx.fill();
					ctx.strokeStyle = rim;
					ctx.lineWidth = 1.5;
					ctx.stroke();
					ctx.fillStyle = "rgba(255,255,255,0.08)";
					roundRectPath(ctx, x + 6, y + 6, 36, 5, 3);
					ctx.fill();
				}
			}
			ctx.textBaseline = "alphabetic";
			if (prevCards.length === state.cards.length) {
				for (let i = 0; i < state.cards.length; i += 1) if (state.cards[i] === null && prevCards[i] !== null && prevCards[i] !== void 0) {
					const { x, y } = cellCenter$5(i);
					particles$19.burst(x, y, THEME.good, 12, 120);
				}
			}
			prevCards = [...state.cards];
			particles$19.tick(ctx, dtMs);
			if (state.finished) {
				ctx.save();
				ctx.translate(0, 32);
				drawOverlay(ctx, BOARD_W$10, BOARD_H$6, "全部配对！", `${state.moves} 步完成 · 按 R 重新开始`, THEME.gold);
				ctx.restore();
			} else if (paused) drawOverlay(ctx, LOGICAL_W$32, LOGICAL_H$29, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/memory/index.ts
		const REVEAL_MS = 1e3;
		function createMemoryGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$32, LOGICAL_H$29);
			if (fit === null) throw new Error("dsh-minigames: memory needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createMemoryState();
			let running = false;
			let lockUntil = 0;
			let flipTimer = 0;
			let revealRemaining = 0;
			let lastScore = -1;
			const reportScore = () => {
				const score = Math.max(0, 500 - state.moves * 5);
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const indexFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$32 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$29 / rect.height;
				const c = Math.floor(x / 48);
				const r = Math.floor((y - 32) / 48);
				if (r < 0 || r >= 4 || c < 0 || c >= 4) return null;
				return r * 4 + c;
			};
			const onMouseDown = (event) => {
				if (!running) return;
				if (state.finished) return;
				if (performance.now() < lockUntil) return;
				const index = indexFromEvent(event);
				if (index === null) return;
				if (flip(state, index) === "mismatch") {
					lockUntil = performance.now() + REVEAL_MS;
					flipTimer = window.setTimeout(() => {
						resetFlip(state);
						reportScore();
						loop.markDirty();
					}, REVEAL_MS);
				}
				reportScore();
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(flipTimer);
					flipTimer = 0;
					revealRemaining = 0;
					state = createMemoryState();
					lockUntil = 0;
					lastScore = -1;
					loop.markDirty();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				f.dt;
				if (f.render) renderMemory(ctx, state, false);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				if (flipTimer !== 0) {
					clearTimeout(flipTimer);
					flipTimer = 0;
					revealRemaining = Math.max(0, lockUntil - performance.now());
				}
				loop.pause();
				renderMemory(ctx, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (revealRemaining > 0 && state.flipped.length >= 2) {
					lockUntil = performance.now() + revealRemaining;
					flipTimer = window.setTimeout(() => {
						resetFlip(state);
						reportScore();
						loop.markDirty();
					}, revealRemaining);
				}
				revealRemaining = 0;
				loop.resume();
				loop.markDirty();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderMemory(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(flipTimer);
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const memoryGame = {
			id: "memory",
			title: "记忆翻牌",
			icon: "🃏",
			description: "翻开两张配对，全部配对完成即胜，步数越少越好。",
			controls: [
				"点击：翻牌",
				"R：重开",
				"P：暂停"
			],
			create: createMemoryGame
		};
		/** A fresh empty board; the player moves first. */
		function createGomokuState() {
			return {
				board: Array.from({ length: 15 }, () => Array(15).fill(0)),
				turn: 1,
				winner: 0,
				over: false
			};
		}
		const DIRS$5 = [
			[0, 1],
			[1, 0],
			[1, 1],
			[1, -1]
		];
		/** The length of a line through (r, c) in direction (dr, dc), centred. */
		function lineLength(board, r, c, dr, dc, stone) {
			let count = 1;
			for (const sign of [-1, 1]) {
				let nr = r + dr * sign;
				let nc = c + dc * sign;
				while (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === stone) {
					count += 1;
					nr += dr * sign;
					nc += dc * sign;
				}
			}
			return count;
		}
		/** Check for a win after the last move at (r, c). */
		function checkWin$2(board, r, c) {
			const stone = board[r][c];
			if (stone === 0) return false;
			for (const [dr, dc] of DIRS$5) if (lineLength(board, r, c, dr, dc, stone) >= 5) return true;
			return false;
		}
		/** Place a stone for the current turn; advances the turn and checks the win. */
		function place$2(state, r, c) {
			if (state.over || state.board[r][c] !== 0) return false;
			state.board[r][c] = state.turn;
			if (checkWin$2(state.board, r, c)) {
				state.winner = state.turn;
				state.over = true;
				return true;
			}
			if (state.board.flat().every((v) => v !== 0)) {
				state.winner = 0;
				state.over = true;
				return true;
			}
			state.turn = state.turn === 1 ? 2 : 1;
			return true;
		}
		/**
		* Heuristic score for one move of `stone`: sum of line scores for every line
		* through the move. Live lines (open both ends) score higher; length^2 growth
		* makes longer threats far more valuable.
		*/
		function scoreMove$1(board, r, c, stone) {
			let total = 0;
			for (const [dr, dc] of DIRS$5) {
				let count = 1;
				let open = 0;
				for (const sign of [-1, 1]) {
					let nr = r + dr * sign;
					let nc = c + dc * sign;
					while (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === stone) {
						count += 1;
						nr += dr * sign;
						nc += dc * sign;
					}
					if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === 0) open += 1;
				}
				const live = open >= 2 ? 2 : open === 1 ? 1 : 0;
				total += count * count * (live + 1);
			}
			return total;
		}
		/**
		* Choose the AI's move: winning moves first, then blocking the player's
		* winning moves, then the best scored empty cell near existing stones.
		*/
		function chooseAiMove$1(state) {
			const empties = [];
			for (let r = 0; r < 15; r += 1) for (let c = 0; c < 15; c += 1) if (state.board[r][c] === 0) empties.push({
				r,
				c
			});
			if (empties.length === 0) return null;
			for (const m of empties) {
				state.board[m.r][m.c] = 2;
				if (checkWin$2(state.board, m.r, m.c)) {
					state.board[m.r][m.c] = 0;
					return m;
				}
				state.board[m.r][m.c] = 0;
			}
			for (const m of empties) {
				state.board[m.r][m.c] = 1;
				if (checkWin$2(state.board, m.r, m.c)) {
					state.board[m.r][m.c] = 0;
					return m;
				}
				state.board[m.r][m.c] = 0;
			}
			let best = null;
			let bestScore = -1;
			for (const m of empties) {
				let near = false;
				for (let dr = -2; dr <= 2 && !near; dr += 1) for (let dc = -2; dc <= 2; dc += 1) {
					const nr = m.r + dr;
					const nc = m.c + dc;
					if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && state.board[nr][nc] !== 0) {
						near = true;
						break;
					}
				}
				if (!near) continue;
				const attack = scoreMove$1(state.board, m.r, m.c, 2);
				const defense = scoreMove$1(state.board, m.r, m.c, 1);
				const score = attack * 1.1 + defense;
				if (score > bestScore) {
					bestScore = score;
					best = m;
				}
			}
			return best ?? empties[Math.floor(empties.length / 2)];
		}
		const BOARD_W$9 = 360;
		const BOARD_H$5 = 360;
		const LOGICAL_W$31 = BOARD_W$9;
		const LOGICAL_H$28 = 392;
		const particles$18 = createParticles();
		let prevOver$1 = false;
		let prevFrameMs$6 = 0;
		const STAR_POINTS$1 = [
			[3, 3],
			[3, 11],
			[11, 3],
			[11, 11],
			[7, 7]
		];
		/**
		* Draw one frame.
		* @param paused - show the pause overlay.
		*/
		function renderGomoku(ctx, state, paused) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$6 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$6);
			prevFrameMs$6 = nowMs;
			ctx.clearRect(0, 0, LOGICAL_W$31, LOGICAL_H$28);
			drawBackground(ctx, LOGICAL_W$31, LOGICAL_H$28);
			hudPair(ctx, 10, 21, "状态 ", state.over ? state.winner === 1 ? "你赢了！" : state.winner === 2 ? "AI 赢了" : "平局" : state.turn === 1 ? "你的回合 ●" : "AI 思考中 ○", "left", state.over ? state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.text : accent(0));
			ctx.fillStyle = THEME.panel;
			roundRectPath(ctx, 2, 34, 356, 356, 10);
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.strokeStyle = THEME.panelEdge;
			for (let i = 0; i < 15; i += 1) {
				ctx.beginPath();
				ctx.moveTo(12, 32 + i * 24 + 12);
				ctx.lineTo(348, 32 + i * 24 + 12);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(i * 24 + 12, 44);
				ctx.lineTo(i * 24 + 12, 380);
				ctx.stroke();
			}
			ctx.fillStyle = THEME.textMuted;
			for (const [r, c] of STAR_POINTS$1) {
				ctx.beginPath();
				ctx.arc(c * 24 + 12, 32 + r * 24 + 12, 2.5, 0, Math.PI * 2);
				ctx.fill();
			}
			for (let r = 0; r < 15; r += 1) for (let c = 0; c < 15; c += 1) {
				const stone = state.board[r][c];
				if (stone === 0) continue;
				const x = c * 24 + 12;
				const y = 32 + r * 24 + 12;
				glow(ctx, stone === 1 ? accent(0) : THEME.text, 6);
				ctx.fillStyle = stone === 1 ? "#0f0f16" : "#ececf4";
				ctx.beginPath();
				ctx.arc(x, y, 10.08, 0, Math.PI * 2);
				ctx.fill();
				noGlow(ctx);
				ctx.strokeStyle = stone === 1 ? THEME.panelEdge : THEME.textMuted;
				ctx.lineWidth = 1;
				ctx.stroke();
			}
			if (state.over && !prevOver$1) {
				const color = state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.gold;
				particles$18.burst(BOARD_W$9 / 2, 212, color, 26, 170);
			}
			prevOver$1 = state.over;
			particles$18.tick(ctx, dtMs);
			if (state.over) {
				ctx.save();
				ctx.translate(0, 32);
				drawOverlay(ctx, BOARD_W$9, BOARD_H$5, state.winner === 1 ? "你赢了！" : state.winner === 2 ? "AI 赢了" : "平局", "按 R 重新开始", state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.gold);
				ctx.restore();
			} else if (paused) drawOverlay(ctx, LOGICAL_W$31, LOGICAL_H$28, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/gomoku/index.ts
		const AI_DELAY_MS$4 = 500;
		function createGomokuGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$31, LOGICAL_H$28);
			if (fit === null) throw new Error("dsh-minigames: gomoku needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createGomokuState();
			let running = false;
			let aiAt = 0;
			let lastScore = -1;
			const reportScore = () => {
				const score = Math.max(0, Math.floor((performance.now() - 0) * 0)) + (state.winner === 1 && state.over ? 100 : 0);
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const indexFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$31 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$28 / rect.height;
				const c = Math.round((x - 12) / 24);
				const r = Math.round((y - 32 - 12) / 24);
				if (r < 0 || r >= 15 || c < 0 || c >= 15) return null;
				return {
					r,
					c
				};
			};
			const onMouseDown = (event) => {
				if (!running) return;
				if (state.over || state.turn !== 1) return;
				const cell = indexFromEvent(event);
				if (cell === null) return;
				if (place$2(state, cell.r, cell.c)) {
					reportScore();
					loop.markDirty();
					if (!state.over) aiAt = performance.now() + AI_DELAY_MS$4;
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createGomokuState();
					aiAt = 0;
					lastScore = -1;
					loop.markDirty();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				if (!state.over && state.turn === 2 && performance.now() >= aiAt) {
					const move = chooseAiMove$1(state);
					if (move !== null) place$2(state, move.r, move.c);
					reportScore();
					loop.markDirty();
				}
				f.dt;
				if (f.render) renderGomoku(ctx, state, false);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderGomoku(ctx, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.resume();
				loop.markDirty();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderGomoku(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const gomokuGame = {
			id: "gomoku",
			title: "五子棋",
			icon: "⚫",
			description: "15x15 五子棋 vs AI：五子连珠即胜，AI 会进攻也会堵你。",
			controls: [
				"点击：落子",
				"R：重新开始",
				"P：暂停"
			],
			create: createGomokuGame
		};
		//#endregion
		//#region src/client/games/hop/logic.ts
		const PLATFORM_W = 60;
		const GAP_NEAR_MIN = 55;
		const GAP_MID_MIN = 105;
		const GAP_FAR_MIN = 140;
		const W_NARROW_MIN = 42;
		const W_NORMAL_MIN = 56;
		const W_WIDE_MIN = 72;
		const GRAVITY$3 = 1320;
		/** A fresh run: start platform + two ahead. */
		function createHopState(rng = Math.random) {
			const state = {
				index: 0,
				platforms: [{
					x: 0,
					w: PLATFORM_W
				}],
				playerX: PLATFORM_W / 2,
				vy: 0,
				y: 0,
				power: 0,
				jumping: false,
				falling: false,
				score: 0,
				over: false,
				rng
			};
			extendPlatforms(state);
			return state;
		}
		/** One gap draw: near (40%), mid (35%), far (25%). */
		function nextGap(rng) {
			const roll = rng();
			if (roll < .4) return GAP_NEAR_MIN + rng() * 50;
			if (roll < .75) return GAP_MID_MIN + rng() * 35;
			return GAP_FAR_MIN + rng() * 20;
		}
		/** One platform width draw: narrow (30%), normal (40%), wide (30%). */
		function nextWidth(rng) {
			const roll = rng();
			if (roll < .3) return W_NARROW_MIN + rng() * 10;
			if (roll < .7) return W_NORMAL_MIN + rng() * 8;
			return W_WIDE_MIN + rng() * 16;
		}
		/** Append platforms far enough ahead. */
		function extendPlatforms(state) {
			while (state.platforms.length < state.index + 3) {
				const last = state.platforms[state.platforms.length - 1];
				const gap = nextGap(state.rng);
				state.platforms.push({
					x: last.x + last.w + gap,
					w: nextWidth(state.rng)
				});
			}
		}
		/** Start charging (held input). */
		function startCharge(state) {
			if (state.jumping || state.over) return;
			state.power = 0;
		}
		/** Advance the charge while held. */
		function charge(state, dt) {
			if (state.jumping || state.over) return;
			state.power = Math.min(1, state.power + dt * 1.6);
		}
		/** Release: jump with the current charge. */
		function jump(state) {
			if (state.jumping || state.over) return;
			state.jumping = true;
			state.vy = -410 * (.25 + state.power * 1.05);
			state.y = 0;
		}
		/** Advance one frame. Returns whether the run ended this frame. */
		function stepHop(state, dt) {
			if (state.over) {
				if (state.falling) {
					state.vy += GRAVITY$3 * dt;
					state.y += state.vy * dt;
					if (state.y >= 150) state.falling = false;
				}
				return true;
			}
			if (!state.jumping) return false;
			const horizontalSpeed = 130 + state.power * 120;
			state.playerX += horizontalSpeed * dt;
			state.vy += GRAVITY$3 * dt;
			state.y += state.vy * dt;
			if (state.y >= 0) {
				state.y = 0;
				state.jumping = false;
				state.power = 0;
				const current = state.platforms[state.index];
				const next = state.platforms[state.index + 1];
				if (next !== void 0 && state.playerX >= next.x && state.playerX <= next.x + next.w) {
					state.index += 1;
					const centre = next.x + next.w / 2;
					const dist = Math.abs(state.playerX - centre);
					const bonus = dist < next.w * .15 ? 2 : dist < next.w * .35 ? 1 : 0;
					state.score += 1 + bonus;
					extendPlatforms(state);
					return false;
				}
				if (state.playerX >= current.x && state.playerX <= current.x + current.w) return false;
				state.falling = true;
				state.over = true;
				return true;
			}
			return false;
		}
		const particles$17 = createParticles();
		let prevScore$6 = -1;
		let prevFrameMs$5 = 0;
		/** Draw one frame. */
		function renderHop(ctx, state) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$5 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$5);
			prevFrameMs$5 = nowMs;
			ctx.clearRect(0, 0, 360, 300);
			drawBackground(ctx, 360, 300);
			const baseX = state.platforms[state.index].x;
			const toScreenX = (wx) => 40 + (wx - baseX) * .75;
			const platformY = 260;
			for (let i = state.index; i < state.index + 3; i += 1) {
				const p = state.platforms[i];
				const x = toScreenX(p.x);
				const w = p.w * .75;
				const lift = (i - state.index) * 14;
				const color = accent(i);
				glow(ctx, color, 8);
				ctx.fillStyle = color;
				roundRectPath(ctx, x, platformY - lift, w, 16, 5);
				ctx.fill();
				noGlow(ctx);
				ctx.fillStyle = THEME.bgBottom;
				ctx.fillRect(x + 2, platformY - lift + 13, w - 4, 3);
			}
			const px = toScreenX(state.playerX);
			const height = -state.y;
			const py = 232 - height * .8;
			if (!state.falling) {
				const shadowScale = Math.max(.35, 1 - height / 80);
				ctx.fillStyle = `rgba(0, 0, 0, ${(.45 * shadowScale).toFixed(3)})`;
				ctx.beginPath();
				ctx.ellipse(px, 266, 20 * shadowScale, 5.5 * shadowScale, 0, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.save();
			ctx.translate(px, py + 14);
			if (state.falling) ctx.rotate(Math.min(Math.PI * 2, state.y / 25));
			else if (state.jumping) ctx.rotate(Math.min(.65, height / 60) * .9);
			glow(ctx, THEME.gold, 10);
			ctx.fillStyle = THEME.gold;
			roundRectPath(ctx, -14, -14, 28, 28, 6);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = "#f6df8a";
			ctx.fillRect(-13, -13, 26, 5);
			ctx.fillStyle = "rgba(0,0,0,0.25)";
			ctx.fillRect(-13, 8, 26, 5);
			ctx.restore();
			if (state.jumping || state.over) {} else {
				ctx.fillStyle = THEME.panelEdge;
				roundRectPath(ctx, 20, 20, 120, 10, 5);
				ctx.fill();
				if (state.power > .01) {
					glow(ctx, accent(0), 6);
					ctx.fillStyle = accent(0);
					roundRectPath(ctx, 20, 20, Math.max(6, 120 * state.power), 10, 5);
					ctx.fill();
					noGlow(ctx);
				}
				ctx.fillStyle = THEME.textMuted;
				ctx.font = "600 11px system-ui, sans-serif";
				ctx.textAlign = "left";
				ctx.fillText("按住蓄力，松开起跳", 20, 46);
			}
			hudPair(ctx, 346, 24, "得分 ", String(state.score), "right", THEME.gold);
			if (prevScore$6 >= 0 && state.score > prevScore$6) particles$17.burst(px, py, THEME.gold, 14, 140);
			prevScore$6 = state.score;
			particles$17.tick(ctx, dtMs);
			if (state.over && !state.falling) drawOverlay(ctx, 360, 300, "掉下去了", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
		}
		//#endregion
		//#region src/client/games/hop/index.ts
		function createHopGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 360, 300);
			if (fit === null) throw new Error("dsh-minigames: hop needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createHopState();
			let running = false;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const onMouseDown = () => {
				if (!running) return;
				if (state.over) return;
				startCharge(state);
			};
			const onMouseUp = () => {
				if (state.over || !state.jumping) {
					jump(state);
					reportScore();
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
					event.preventDefault();
					if (!running || state.over) return;
					startCharge(state);
				} else if (event.code === "KeyR") {
					event.preventDefault();
					state = createHopState();
					lastScore = -1;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const onKeyUp = (event) => {
				if (!running) return;
				if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
					if (state.over || !state.jumping) {
						jump(state);
						reportScore();
					}
				}
			};
			const frame = (f) => {
				if (!running) return;
				charge(state, f.dt);
				stepHop(state, f.dt);
				reportScore();
				if (f.render) renderHop(ctx, state);
			};
			const loop = createFrameLoop(frame);
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				loop.pause();
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("mouseup", onMouseUp);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			renderHop(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					canvas.removeEventListener("mouseup", onMouseUp);
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
				}
			};
		}
		const hopGame = {
			id: "hop",
			title: "跳一跳",
			icon: "🦘",
			description: "按住蓄力、松开起跳，跳到下一个平台；落点越准加分越多。",
			controls: [
				"按住 / 点击：蓄力",
				"松开：起跳",
				"R：重开",
				"P：暂停"
			],
			create: createHopGame
		};
		const BRICK_TOP = 36;
		function buildWall() {
			const bricks = [];
			for (let r = 0; r < 5; r += 1) for (let c = 0; c < 8; c += 1) bricks.push({
				x: 24 + c * 54,
				y: BRICK_TOP + r * 22,
				hp: 1,
				color: r
			});
			return bricks;
		}
		/** A fresh level-1 wall. */
		function createBreakoutState(rng = Math.random) {
			return {
				paddleX: 240,
				ball: {
					x: 240,
					y: 280,
					vx: 140,
					vy: -200,
					color: -1
				},
				bricks: buildWall(),
				score: 0,
				level: 1,
				lives: 3,
				over: false,
				rng
			};
		}
		/** Rebuild the wall for the next level with a faster ball. */
		function nextLevel$2(state) {
			state.level += 1;
			state.bricks = buildWall();
			state.ball.x = state.paddleX;
			state.ball.y = 280;
			const speed = 250 + state.level * 20;
			state.ball.vx = speed * (state.rng() < .5 ? -.7 : .7);
			state.ball.vy = -Math.sqrt(speed * speed - state.ball.vx * state.ball.vx);
		}
		/** Move the paddle towards a target x (clamped to the walls). */
		function movePaddle(state, targetX) {
			state.paddleX = Math.max(35, Math.min(445, targetX));
		}
		/**
		* Advance one frame. Returns the ball state for rendering: { lost, cleared }.
		*/
		function stepBreakout(state, dt) {
			if (state.over) return {
				lost: false,
				cleared: false
			};
			const ball = state.ball;
			ball.x += ball.vx * dt;
			ball.y += ball.vy * dt;
			if (ball.x - 6 < 0) {
				ball.x = 6;
				ball.vx = Math.abs(ball.vx);
			}
			if (ball.x + 6 > 480) {
				ball.x = 474;
				ball.vx = -Math.abs(ball.vx);
			}
			if (ball.y - 6 < 0) {
				ball.y = 6;
				ball.vy = Math.abs(ball.vy);
			}
			if (ball.vy > 0 && ball.y + 6 >= 292 && ball.y + 6 <= 308 && ball.x >= state.paddleX - 35 - 6 && ball.x <= state.paddleX + 35 + 6) {
				const rel = (ball.x - state.paddleX) / 35;
				const speed = Math.hypot(ball.vx, ball.vy);
				ball.vx = rel * speed * .85;
				ball.vy = -Math.abs(Math.sqrt(speed * speed - ball.vx * ball.vx));
				ball.y = 286;
			}
			let cleared = false;
			for (let i = 0; i < state.bricks.length; i += 1) {
				const brick = state.bricks[i];
				if (ball.x + 6 > brick.x && ball.x - 6 < brick.x + 48 && ball.y + 6 > brick.y && ball.y - 6 < brick.y + 16) {
					const dx = ball.x - (brick.x + 24);
					const dy = ball.y - (brick.y + 8);
					if (Math.abs(dx / 24) > Math.abs(dy / 8)) ball.vx = ball.vx > 0 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
					else ball.vy = ball.vy > 0 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
					brick.hp -= 1;
					if (brick.hp <= 0) {
						state.bricks.splice(i, 1);
						const base = 10 * state.level;
						state.score += state.ball.color === brick.color ? base * 3 : base;
						state.ball.color = brick.color;
					}
					if (state.bricks.length === 0) {
						nextLevel$2(state);
						cleared = true;
					}
					break;
				}
			}
			if (ball.y - 6 > 320) {
				state.lives -= 1;
				if (state.lives <= 0) state.over = true;
				else {
					state.ball.x = state.paddleX;
					state.ball.y = 280;
					state.ball.vx = 140;
					state.ball.vy = -200;
				}
				return {
					lost: true,
					cleared
				};
			}
			return {
				lost: false,
				cleared
			};
		}
		//#endregion
		//#region src/client/games/breakout/render.ts
		const LOGICAL_W$30 = 480;
		const LOGICAL_H$27 = 320;
		const particles$16 = createParticles();
		let prevScore$5 = -1;
		let prevNow$4 = 0;
		/** Draw one frame; `paused` veils the scene. */
		function renderBreakout(ctx, state, paused) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$4));
			prevNow$4 = now;
			drawBackground(ctx, LOGICAL_W$30, LOGICAL_H$27);
			state.bricks.forEach((brick) => {
				const color = accent(brick.color);
				ctx.fillStyle = color;
				glow(ctx, color, 6);
				roundRectPath(ctx, brick.x, brick.y, 48, 16, 4);
				ctx.fill();
				noGlow(ctx);
			});
			ctx.fillStyle = THEME.accents[0];
			glow(ctx, THEME.accents[0], 12);
			roundRectPath(ctx, state.paddleX - 35, 296, 70, 10, 5);
			ctx.fill();
			noGlow(ctx);
			const ballColor = state.ball.color >= 0 ? accent(state.ball.color) : THEME.text;
			ctx.fillStyle = ballColor;
			glow(ctx, ballColor, 14);
			ctx.beginPath();
			ctx.arc(state.ball.x, state.ball.y, 6, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			if (state.score !== prevScore$5) {
				if (prevScore$5 >= 0 && state.score > prevScore$5) particles$16.burst(state.ball.x, state.ball.y, ballColor, 12, 150);
				prevScore$5 = state.score;
			}
			particles$16.tick(ctx, dt);
			hudPair(ctx, 10, 18, "关卡", String(state.level), "left");
			hudPair(ctx, 470, 18, "得分", `${state.score} · 生命 ${"♥".repeat(Math.max(0, state.lives))}`, "right");
			ctx.textAlign = "left";
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText("小球会变成所消除方块的颜色 · 同色得分 ×3", 10, 312);
			if (state.over) drawOverlay(ctx, LOGICAL_W$30, LOGICAL_H$27, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
			else if (paused) drawOverlay(ctx, LOGICAL_W$30, LOGICAL_H$27, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/breakout/index.ts
		function createBreakoutGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$30, LOGICAL_H$27);
			if (fit === null) throw new Error("dsh-minigames: breakout needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createBreakoutState();
			let running = false;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const paddleFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$30 / rect.width;
				movePaddle(state, x);
			};
			const onMouseMove = (event) => {
				if (state.over) return;
				paddleFromEvent(event);
			};
			const onMouseDown = (event) => {
				if (state.over) return;
				paddleFromEvent(event);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "ArrowLeft" || event.code === "KeyA") {
					event.preventDefault();
					movePaddle(state, state.paddleX - 26);
				} else if (event.code === "ArrowRight" || event.code === "KeyD") {
					event.preventDefault();
					movePaddle(state, state.paddleX + 26);
				} else if (event.code === "KeyR") {
					event.preventDefault();
					state = createBreakoutState();
					lastScore = -1;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (f) => {
				if (!running) return;
				if (!state.over) {
					stepBreakout(state, f.dt);
					reportScore();
				}
				if (f.render) renderBreakout(ctx, state, false);
			};
			const loop = createFrameLoop(frame);
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderBreakout(ctx, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			canvas.addEventListener("mousemove", onMouseMove);
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderBreakout(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousemove", onMouseMove);
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const breakoutGame = {
			id: "breakout",
			title: "打砖块",
			icon: "🧱",
			description: "移动挡板反弹小球打碎砖块，清完进入下一关；小球会变成所消除方块的颜色，同色消除得分×3。",
			controls: [
				"鼠标 / ←→：移动挡板",
				"R：重开",
				"P：暂停"
			],
			create: createBreakoutGame
		};
		const SPAWN_MIN = .35;
		const SPAWN_MAX = 1.1;
		const MOLE_MIN = .9;
		const MOLE_MAX = 1.6;
		function rand$2(lo, hi, rng) {
			return lo + rng() * (hi - lo);
		}
		/** A fresh round: no moles, full timer. */
		function createWhackState(rng = Math.random) {
			return {
				moles: [],
				moleTimes: [],
				remaining: 30,
				score: 0,
				over: false,
				spawnT: rand$2(SPAWN_MIN, SPAWN_MAX, rng),
				rng
			};
		}
		/** Advance the round clock: timer, mole retreats and pops. */
		function tickWhack(state, dt) {
			if (state.over) return;
			state.remaining -= dt;
			if (state.remaining <= 0) {
				state.remaining = 0;
				state.over = true;
				state.moles = [];
				state.moleTimes = [];
				return;
			}
			for (let i = state.moles.length - 1; i >= 0; i -= 1) {
				state.moleTimes[i] -= dt;
				if (state.moleTimes[i] <= 0) {
					state.moles.splice(i, 1);
					state.moleTimes.splice(i, 1);
				}
			}
			if (state.moles.length < 5) {
				state.spawnT -= dt;
				if (state.spawnT <= 0) {
					state.spawnT = rand$2(SPAWN_MIN, SPAWN_MAX, state.rng);
					const taken = new Set(state.moles);
					const free = [];
					for (let hole = 0; hole < 25; hole += 1) if (!taken.has(hole)) free.push(hole);
					if (free.length > 0) {
						state.moles.push(free[Math.floor(state.rng() * free.length)]);
						state.moleTimes.push(rand$2(MOLE_MIN, MOLE_MAX, state.rng));
					}
				}
			}
		}
		/** Click a hole: hit a mole +1, miss -1. Returns whether it was a hit. */
		function whack(state, hole) {
			if (state.over || hole < 0 || hole >= 25) return false;
			const index = state.moles.indexOf(hole);
			if (index >= 0) {
				state.moles.splice(index, 1);
				state.moleTimes.splice(index, 1);
				state.score += 1;
				return true;
			}
			state.score = Math.max(0, state.score - 1);
			return false;
		}
		const GRASS = "#2f6b3a";
		const GRASS_LIGHT = "#3a7a45";
		const HOLE = "#3a2a1a";
		const HOLE_EDGE = "#241708";
		const MOLE = "#8a5a2b";
		const MOLE_LIGHT = "#c98d4e";
		const particles$15 = createParticles();
		let prevScore$4 = -1;
		let prevMoles = [];
		let lastFrame$6 = 0;
		/** Draw one frame. */
		function renderWhack(ctx, state) {
			ctx.clearRect(0, 0, 320, 350);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$6 === 0 ? 16 : now - lastFrame$6);
			lastFrame$6 = now;
			drawBackground(ctx, 320, 350);
			ctx.fillStyle = THEME.panel;
			roundRectPath(ctx, 2, 32, 316, 316, 10);
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.save();
			roundRectPath(ctx, 2, 32, 316, 316, 10);
			ctx.clip();
			ctx.fillStyle = GRASS;
			ctx.fillRect(0, 30, 320, 320);
			ctx.fillStyle = GRASS_LIGHT;
			for (let r = 0; r < 5; r += 1) for (let c = 0; c < 5; c += 1) if ((r + c) % 2 === 0) ctx.fillRect(c * 64, 30 + r * 64, 64, 64);
			for (let r = 0; r < 5; r += 1) for (let c = 0; c < 5; c += 1) {
				const x = c * 64;
				const y = 30 + r * 64;
				ctx.fillStyle = HOLE_EDGE;
				ctx.beginPath();
				ctx.ellipse(x + 32, y + 32 + 8, 24.32, 16.64, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = HOLE;
				ctx.beginPath();
				ctx.ellipse(x + 32, y + 32 + 7, 20.48, 12.8, 0, 0, Math.PI * 2);
				ctx.fill();
				const index = r * 5 + c;
				if (state.moles.includes(index)) drawMole(ctx, x + 32, y + 32);
			}
			ctx.restore();
			if (prevScore$4 >= 0 && state.score > prevScore$4) {
				const gone = prevMoles.filter((hole) => !state.moles.includes(hole));
				for (const hole of gone.slice(0, 3)) particles$15.burst((hole % 5 + .5) * 64, 30 + (Math.floor(hole / 5) + .5) * 64, accent(7), 14, 140);
			}
			prevScore$4 = state.score;
			prevMoles = [...state.moles];
			particles$15.tick(ctx, dt);
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, 320, 30);
			hudPair(ctx, 10, 20, "⏱ ", `${Math.max(0, Math.ceil(state.remaining))}s`, "left", THEME.gold);
			hudPair(ctx, 310, 20, "得分 ", String(state.score), "right", THEME.text);
			if (state.over) {
				ctx.save();
				ctx.translate(0, 30);
				drawOverlay(ctx, 320, 320, "时间到！", `得分 ${state.score} · 按 R 重新开始`, THEME.gold);
				ctx.restore();
			}
		}
		/** A mole peeking out of its hole: body, belly, ears, eyes. */
		function drawMole(ctx, cx, cy) {
			glow(ctx, accent(7), 10);
			ctx.fillStyle = MOLE;
			ctx.beginPath();
			ctx.ellipse(cx - 14, cy - 16, 7, 9, -.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.ellipse(cx + 14, cy - 16, 7, 9, .5, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.ellipse(cx, cy - 2, 22, 24, 0, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = MOLE_LIGHT;
			ctx.beginPath();
			ctx.ellipse(cx, cy + 2, 13, 15, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = THEME.bgBottom;
			ctx.beginPath();
			ctx.arc(cx - 8, cy - 8, 3.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.arc(cx + 8, cy - 8, 3.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = THEME.bad;
			ctx.beginPath();
			ctx.arc(cx, cy - 2, 4, 0, Math.PI * 2);
			ctx.fill();
		}
		//#endregion
		//#region src/client/games/whack/index.ts
		function createWhackGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 320, 350);
			if (fit === null) throw new Error("dsh-minigames: whack needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createWhackState();
			let running = false;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const holeFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * 320 / rect.width;
				const y = (event.clientY - rect.top) * 350 / rect.height;
				const c = Math.floor(x / 64);
				const r = Math.floor((y - 30) / 64);
				if (r < 0 || r >= 5 || c < 0 || c >= 5) return null;
				return r * 5 + c;
			};
			const onMouseDown = (event) => {
				if (!running || state.over) return;
				const hole = holeFromEvent(event);
				if (hole === null) return;
				whack(state, hole);
				reportScore();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.ctrlKey || event.altKey || event.metaKey) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createWhackState();
					lastScore = -1;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (f) => {
				if (!running) return;
				tickWhack(state, f.dt);
				reportScore();
				if (f.render) renderWhack(ctx, state);
			};
			const loop = createFrameLoop(frame);
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				loop.pause();
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderWhack(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const whackGame = {
			id: "whack",
			title: "打地鼠",
			icon: "🔨",
			description: "30 秒限时打地鼠：地鼠冒头就点，命中 +1、打空 -1。",
			controls: [
				"点击：打地鼠",
				"R：重开",
				"P：暂停"
			],
			create: createWhackGame
		};
		const DIRS$4 = [
			[-1, -1],
			[-1, 0],
			[-1, 1],
			[0, -1],
			[0, 1],
			[1, -1],
			[1, 0],
			[1, 1]
		];
		const CORNERS = [
			[0, 0],
			[0, 7],
			[7, 0],
			[7, 7]
		];
		function other$1(player) {
			return player === 1 ? 2 : 1;
		}
		function inBounds$2(r, c) {
			return r >= 0 && r < 8 && c >= 0 && c < 8;
		}
		/** A fresh board with the classic four-disc opening; black moves first. */
		function createOthelloState() {
			const board = Array.from({ length: 8 }, () => Array(8).fill(0));
			board[3][3] = 1;
			board[4][4] = 1;
			board[3][4] = 2;
			board[4][3] = 2;
			return {
				board,
				turn: 1,
				winner: 0,
				over: false,
				passes: 0
			};
		}
		/** Discs that a move at (r, c) would flip for `player` (empty if illegal). */
		function flipsAt(board, r, c, player) {
			if (!inBounds$2(r, c) || board[r][c] !== 0) return [];
			const out = [];
			for (const [dr, dc] of DIRS$4) {
				const line = [];
				let nr = r + dr;
				let nc = c + dc;
				while (inBounds$2(nr, nc) && board[nr][nc] === other$1(player)) {
					line.push([nr, nc]);
					nr += dr;
					nc += dc;
				}
				if (line.length > 0 && inBounds$2(nr, nc) && board[nr][nc] === player) out.push(...line);
			}
			return out;
		}
		/** All legal moves for `player`. */
		function legalMoves$3(state, player) {
			const out = [];
			for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if (flipsAt(state.board, r, c, player).length > 0) out.push({
				r,
				c
			});
			return out;
		}
		/** Resolve auto-passes and detect the game end after a placement or pass. */
		function resolve(state) {
			while (state.passes < 2 && !state.over) {
				if (legalMoves$3(state, state.turn).length > 0) return;
				state.passes += 1;
				state.turn = other$1(state.turn);
			}
			let black = 0;
			let white = 0;
			for (const row of state.board) for (const cell of row) if (cell === 1) black += 1;
			else if (cell === 2) white += 1;
			state.over = true;
			state.winner = black > white ? 1 : white > black ? 2 : 0;
		}
		/** Place a disc for the current turn; returns false when the move is illegal. */
		function place$1(state, r, c) {
			if (state.over) return false;
			const flips = flipsAt(state.board, r, c, state.turn);
			if (flips.length === 0) return false;
			state.board[r][c] = state.turn;
			for (const [fr, fc] of flips) state.board[fr][fc] = state.turn;
			state.passes = 0;
			state.turn = other$1(state.turn);
			resolve(state);
			return true;
		}
		/** The current side passes (used when it has no legal move). */
		function passTurn(state) {
			if (state.over) return;
			state.passes += 1;
			state.turn = other$1(state.turn);
			resolve(state);
		}
		/**
		* Heuristic score for one move: flips + corner bonus, corner-adjacent
		* penalty, edge bonus, slight centre (mobility) bias.
		*/
		function scoreMove(board, r, c, player) {
			let score = flipsAt(board, r, c, player).length;
			if ((r === 0 || r === 7) && (c === 0 || c === 7)) return 40 + score;
			for (const [cr, cc] of CORNERS) if (Math.abs(r - cr) <= 1 && Math.abs(c - cc) <= 1) {
				score -= 15;
				break;
			}
			if (r === 0 || r === 7 || c === 0 || c === 7) score += 8;
			const dist = Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5));
			score += Math.max(0, 4 - dist) * 2;
			return score;
		}
		/** Choose the AI's move: the highest-scoring legal cell, or null when passing. */
		function chooseAiMove(state) {
			const moves = legalMoves$3(state, state.turn);
			if (moves.length === 0) return null;
			let best = moves[0];
			let bestScore = -Infinity;
			for (const move of moves) {
				const score = scoreMove(state.board, move.r, move.c, state.turn);
				if (score > bestScore) {
					bestScore = score;
					best = move;
				}
			}
			return best;
		}
		const LOGICAL_W$28 = 352;
		const LOGICAL_H$25 = 382;
		const particles$14 = createParticles();
		let prevFrameMs$4 = 0;
		let prevBoard = [];
		function countDiscs(state, player) {
			let n = 0;
			for (const row of state.board) for (const cell of row) if (cell === player) n += 1;
			return n;
		}
		/** Cheap legality check for hint dots (mirrors flipsAt without allocation churn). */
		function canFlipFrom(state, r, c) {
			for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
				if (dr === 0 && dc === 0) continue;
				let nr = r + dr;
				let nc = c + dc;
				let seen = false;
				while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && state.board[nr][nc] === 2) {
					seen = true;
					nr += dr;
					nc += dc;
				}
				if (seen && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && state.board[nr][nc] === 1) return true;
			}
			return false;
		}
		/**
		* Draw one frame.
		* @param paused - show the pause overlay.
		*/
		function renderOthello(ctx, state, paused) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$4 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$4);
			prevFrameMs$4 = nowMs;
			drawBackground(ctx, LOGICAL_W$28, LOGICAL_H$25);
			if (prevBoard.length === 8) {
				outer: for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if (state.board[r][c] === 1 && prevBoard[r][c] === 0) {
					particles$14.burst(c * 44 + 22, 30 + r * 44 + 22, accent(0), 14, 120);
					break outer;
				}
			}
			prevBoard = state.board.map((row) => [...row]);
			for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
				roundRectPath(ctx, c * 44 + 1, 30 + r * 44 + 1, 42, 42, 8);
				ctx.fillStyle = (r + c) % 2 === 0 ? THEME.panel : "#23232f";
				ctx.fill();
			}
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 2;
			ctx.strokeRect(1, 31, 350, 350);
			for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
				const cell = state.board[r][c];
				const x = c * 44 + 22;
				const y = 30 + r * 44 + 22;
				if (cell === 1 || cell === 2) {
					const isBlack = cell === 1;
					glow(ctx, isBlack ? accent(0) : accent(3), 8);
					ctx.fillStyle = isBlack ? "#14141c" : THEME.text;
					ctx.beginPath();
					ctx.arc(x, y, 17.6, 0, Math.PI * 2);
					ctx.fill();
					noGlow(ctx);
					ctx.fillStyle = isBlack ? "#33333f" : "#ffffff";
					ctx.beginPath();
					ctx.arc(x - 3, y - 3, 44 * .24, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			if (!state.over && state.turn === 1) {
				const hint = accent(2);
				glow(ctx, hint, 6);
				ctx.fillStyle = hint;
				for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if (state.board[r][c] === 0 && canFlipFrom(state, r, c)) {
					ctx.beginPath();
					ctx.arc(c * 44 + 22, 30 + r * 44 + 22, 5, 0, Math.PI * 2);
					ctx.fill();
				}
				noGlow(ctx);
			}
			hudPair(ctx, 12, 20, "○", `${countDiscs(state, 1)}`);
			hudPair(ctx, 64, 20, "●", `${countDiscs(state, 2)}`);
			if (!state.over) hudPair(ctx, 342, 20, "", state.turn === 1 ? "你的回合" : "AI 思考中…", "right", state.turn === 1 ? THEME.text : THEME.textMuted);
			particles$14.tick(ctx, dtMs);
			if (state.over) {
				const title = state.winner === 1 ? "你赢了！" : state.winner === 2 ? "AI 赢了" : "平局";
				const color = state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.text;
				drawOverlay(ctx, LOGICAL_W$28, LOGICAL_H$25, title, `○ ${countDiscs(state, 1)} : ${countDiscs(state, 2)} ● · 按 R 重新开始`, color);
			} else if (paused) drawOverlay(ctx, LOGICAL_W$28, LOGICAL_H$25, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/othello/index.ts
		const AI_DELAY_MS$3 = 500;
		function createOthelloGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$28, LOGICAL_H$25);
			if (fit === null) throw new Error("dsh-minigames: othello needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createOthelloState();
			let running = false;
			let aiAt = 0;
			let lastScore = -1;
			const reportScore = () => {
				const score = state.winner === 1 && state.over ? 100 : 0;
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$28 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$25 / rect.height;
				const c = Math.floor(x / 44);
				const r = Math.floor((y - 30) / 44);
				if (r < 0 || r >= 8 || c < 0 || c >= 8) return null;
				return {
					r,
					c
				};
			};
			const onMouseDown = (event) => {
				if (!running) return;
				if (state.over || state.turn !== 1) return;
				const cell = cellFromEvent(event);
				if (cell === null) return;
				if (place$1(state, cell.r, cell.c)) {
					reportScore();
					loop.markDirty();
					if (!state.over) aiAt = performance.now() + AI_DELAY_MS$3;
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createOthelloState();
					aiAt = 0;
					lastScore = -1;
					loop.markDirty();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				if (!state.over && state.turn === 2 && performance.now() >= aiAt) {
					const move = chooseAiMove(state);
					if (move !== null) place$1(state, move.r, move.c);
					else passTurn(state);
					reportScore();
					loop.markDirty();
				}
				f.dt;
				if (f.render) renderOthello(ctx, state, false);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderOthello(ctx, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.resume();
				loop.markDirty();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderOthello(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const othelloGame = {
			id: "othello",
			title: "黑白棋",
			icon: "⚫",
			description: "黑白棋 vs AI：翻转夹住的对方棋子，角最重要，无棋可下自动让位。",
			controls: [
				"点击：落子",
				"R：重开",
				"P：暂停"
			],
			create: createOthelloGame
		};
		const FLAP_VY = -270;
		function rand$1(lo, hi, rng) {
			return lo + rng() * (hi - lo);
		}
		/** A fresh run: bird mid-screen, first pipe already approaching. */
		function createFlappyState(rng = Math.random) {
			const state = {
				y: 225,
				vy: 0,
				pipes: [],
				score: 0,
				over: false,
				rng
			};
			state.pipes.push({
				x: 340,
				gapY: rand$1(105, 345, rng),
				scored: false
			});
			return state;
		}
		/** A flap impulse (click / space). */
		function flap(state) {
			if (state.over) return;
			state.vy = FLAP_VY;
		}
		/** Advance one frame. Returns whether the run ended this frame. */
		function stepFlappy(state, dt) {
			if (state.over) return true;
			state.vy += 620 * dt;
			state.y += state.vy * dt;
			const speed = 150 + state.score * 3;
			for (const pipe of state.pipes) pipe.x -= speed * dt;
			const last = state.pipes[state.pipes.length - 1];
			if (last.x < 485) state.pipes.push({
				x: last.x + 185,
				gapY: rand$1(105, 345, state.rng),
				scored: false
			});
			if (state.pipes[0].x + 52 < 0) state.pipes.shift();
			for (const pipe of state.pipes) if (!pipe.scored && pipe.x + 52 < 90) {
				pipe.scored = true;
				state.score += 1;
			}
			if (state.y - 13 < 0) {
				state.y = 13;
				state.vy = 0;
			}
			if (state.y + 13 > 450) {
				state.y = 437;
				state.over = true;
				return true;
			}
			for (const pipe of state.pipes) if (103 > pipe.x && 77 < pipe.x + 52) {
				if (!(state.y > pipe.gapY - 75 && state.y < pipe.gapY + 75)) {
					state.over = true;
					return true;
				}
			}
			return false;
		}
		const LOGICAL_W$27 = 300;
		const LOGICAL_H$24 = 480;
		const PIPE_ACCENT = accent(2);
		const particles$13 = createParticles();
		let prevScore$3 = -1;
		let prevNow$3 = 0;
		/**
		* Draw one frame.
		* @param wingT - running seconds counter driving the wing flap.
		* @param paused - show the pause overlay.
		*/
		function renderFlappy(ctx, state, wingT, paused) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$3));
			prevNow$3 = now;
			drawBackground(ctx, LOGICAL_W$27, LOGICAL_H$24);
			for (const pipe of state.pipes) {
				drawPipe$2(ctx, pipe.x, 0, pipe.gapY - 75);
				drawPipe$2(ctx, pipe.x, pipe.gapY + 75, 450 - (pipe.gapY + 75));
			}
			const wobble = Math.sin(wingT * 18) * .35;
			ctx.save();
			ctx.translate(90, 30 + state.y);
			ctx.rotate(Math.max(-.5, Math.min(.9, state.vy / 620)));
			glow(ctx, THEME.gold, 14);
			ctx.fillStyle = THEME.gold;
			ctx.beginPath();
			ctx.ellipse(0, 0, 15, 13, 0, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = "#f6e3a0";
			ctx.beginPath();
			ctx.ellipse(-3, 4, 8, 6, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = accent(7);
			ctx.beginPath();
			ctx.ellipse(-2, -2, 7, 5, wobble, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = THEME.bgBottom;
			ctx.beginPath();
			ctx.arc(6, -5, 3.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = THEME.bad;
			ctx.beginPath();
			ctx.moveTo(12, -1);
			ctx.lineTo(22, 1);
			ctx.lineTo(12, 5);
			ctx.closePath();
			ctx.fill();
			ctx.restore();
			if (state.score !== prevScore$3) {
				if (prevScore$3 >= 0 && state.score > prevScore$3) particles$13.burst(90, 30 + state.y, THEME.gold, 10, 140);
				prevScore$3 = state.score;
			}
			particles$13.tick(ctx, dt);
			ctx.fillStyle = "rgba(13,13,20,0.45)";
			ctx.fillRect(0, 0, LOGICAL_W$27, 30);
			hudPair(ctx, 10, 20, "得分", String(state.score), "left");
			if (state.over) drawOverlay(ctx, LOGICAL_W$27, LOGICAL_H$24, "撞到了", `得分 ${state.score} · 按 R 重新开始`, THEME.gold);
			else if (paused) drawOverlay(ctx, LOGICAL_W$27, LOGICAL_H$24, "已暂停", "面板继续", THEME.text);
		}
		function drawPipe$2(ctx, x, y, h) {
			if (h <= 0) return;
			ctx.fillStyle = PIPE_ACCENT;
			glow(ctx, PIPE_ACCENT, 8);
			roundRectPath(ctx, x, 30 + y, 52, h, 6);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = THEME.panelEdge;
			roundRectPath(ctx, x - 3, 30 + y, 58, 6, 3);
			ctx.fill();
			roundRectPath(ctx, x - 3, 30 + y + h - 6, 58, 6, 3);
			ctx.fill();
		}
		//#endregion
		//#region src/client/games/flappy/index.ts
		function createFlappyGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$27, LOGICAL_H$24);
			if (fit === null) throw new Error("dsh-minigames: flappy needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createFlappyState();
			let wingT = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const onPointerDown = () => {
				if (state.over) return;
				flap(state);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
					event.preventDefault();
					if (!state.over) flap(state);
				} else if (event.code === "KeyR") {
					event.preventDefault();
					state = createFlappyState();
					lastScore = -1;
					loop.markDirty();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				wingT += f.dt;
				stepFlappy(state, f.dt);
				reportScore();
				if (f.render) renderFlappy(ctx, state, wingT, false);
			});
			const togglePause = () => {
				if (loop.running) pause();
				else resume();
			};
			const pause = () => {
				if (!loop.running) return;
				loop.pause();
				renderFlappy(ctx, state, wingT, true);
			};
			const resume = () => {
				loop.resume();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			loop.start();
			renderFlappy(ctx, state, 0, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const flappyGame = {
			id: "flappy",
			title: "Flappy",
			icon: "🐦",
			description: "点击或空格让小鸟振翅，穿过柱子缝隙，越远分越高。",
			controls: [
				"点击 / 空格 / ↑：振翅",
				"R：重开",
				"P：暂停"
			],
			create: createFlappyGame
		};
		/** Puzzle difficulties: clue counts. */
		const DIFFICULTIES = {
			easy: 45,
			normal: 35,
			hard: 30
		};
		function shuffle(arr, rng) {
			for (let i = arr.length - 1; i > 0; i -= 1) {
				const j = Math.floor(rng() * (i + 1));
				const tmp = arr[i];
				arr[i] = arr[j];
				arr[j] = tmp;
			}
			return arr;
		}
		function emptyGrid$2() {
			return Array.from({ length: 9 }, () => Array(9).fill(null));
		}
		function valid(grid, r, c, n) {
			for (let i = 0; i < 9; i += 1) if (grid[r][i] === n || grid[i][c] === n) return false;
			const br = Math.floor(r / 3) * 3;
			const bc = Math.floor(c / 3) * 3;
			for (let dr = 0; dr < 3; dr += 1) for (let dc = 0; dc < 3; dc += 1) if (grid[br + dr][bc + dc] === n) return false;
			return true;
		}
		/** Fill the grid by randomized backtracking; returns whether it succeeded. */
		function fill(grid, rng) {
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) if (grid[r][c] === null) {
				const candidates = shuffle([
					1,
					2,
					3,
					4,
					5,
					6,
					7,
					8,
					9
				], rng);
				for (const n of candidates) if (valid(grid, r, c, n)) {
					grid[r][c] = n;
					if (fill(grid, rng)) return true;
					grid[r][c] = null;
				}
				return false;
			}
			return true;
		}
		/** A complete, valid solution. */
		function generateSolution(rng) {
			const grid = emptyGrid$2();
			if (!fill(grid, rng)) throw new Error("dsh-minigames: sudoku generator failed");
			return grid;
		}
		/** Remove cells symmetrically down to (at most) `givens` clues. */
		function makePuzzle(solution, givens, rng) {
			const puzzle = solution.map((row) => [...row]);
			const order = shuffle(Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9]), rng);
			let remaining = 81;
			for (const [r, c] of order) {
				if (remaining <= givens) break;
				if (puzzle[r][c] === null) continue;
				const r2 = 8 - r;
				const c2 = 8 - c;
				if (puzzle[r2][c2] === null) continue;
				const removed = r === r2 && c === c2 ? 1 : 2;
				if (remaining - removed < givens) continue;
				puzzle[r][c] = null;
				puzzle[r2][c2] = null;
				remaining -= removed;
			}
			return puzzle;
		}
		/** A fresh puzzle at the given difficulty. */
		function createSudokuState(rng = Math.random, difficulty = "normal") {
			const puzzle = makePuzzle(generateSolution(rng), DIFFICULTIES[difficulty], rng);
			return {
				puzzle,
				grid: puzzle.map((row) => [...row]),
				elapsed: 0,
				won: false,
				rng
			};
		}
		/** Advance the game clock (only before the win). */
		function tick$1(state, dt) {
			if (!state.won) state.elapsed += dt;
		}
		/** Whether the number at (r, c) conflicts with its row, column or box. */
		function conflictsAt(state, r, c) {
			const n = state.grid[r][c];
			if (n === null) return false;
			for (let i = 0; i < 9; i += 1) {
				if (i !== c && state.grid[r][i] === n) return true;
				if (i !== r && state.grid[i][c] === n) return true;
			}
			const br = Math.floor(r / 3) * 3;
			const bc = Math.floor(c / 3) * 3;
			for (let dr = 0; dr < 3; dr += 1) for (let dc = 0; dc < 3; dc += 1) {
				const rr = br + dr;
				const cc = bc + dc;
				if ((rr !== r || cc !== c) && state.grid[rr][cc] === n) return true;
			}
			return false;
		}
		/**
		* Fill (n 1-9) or clear (n 0) a free cell. Fixed clues are never editable.
		* Returns false for invalid input or a locked cell.
		*/
		function place(state, r, c, n) {
			if (state.won || r < 0 || r >= 9 || c < 0 || c >= 9) return false;
			if (state.puzzle[r][c] !== null) return false;
			if (n < 0 || n > 9) return false;
			if (n === 0) {
				state.grid[r][c] = null;
				return true;
			}
			state.grid[r][c] = n;
			if (state.grid.every((row) => row.every((cell) => cell !== null)) && !hasConflicts(state)) state.won = true;
			return true;
		}
		/** Whether any cell on the board currently conflicts. */
		function hasConflicts(state) {
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) if (conflictsAt(state, r, c)) return true;
			return false;
		}
		const BOARD_W$6 = 360;
		const BOARD_H$2 = 360;
		const LOGICAL_W$26 = BOARD_W$6;
		const LOGICAL_H$23 = 390;
		const ENTRY = accent(0);
		const GRID$1 = THEME.panelEdge;
		const BOX = THEME.gold;
		const particles$12 = createParticles();
		let prevWon$3 = false;
		let lastFrame$5 = 0;
		/** Draw one frame; cursor is the selected cell or null.
		* @param paused - show the pause overlay. */
		function renderSudoku(ctx, state, difficulty, cursor, paused) {
			ctx.clearRect(0, 0, LOGICAL_W$26, LOGICAL_H$23);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$5 === 0 ? 16 : now - lastFrame$5);
			lastFrame$5 = now;
			drawBackground(ctx, LOGICAL_W$26, LOGICAL_H$23);
			ctx.fillStyle = THEME.panel;
			roundRectPath(ctx, 2, 32, 356, 356, 10);
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.stroke();
			if (cursor !== null && !state.won) {
				const cx = cursor.c * 40;
				const cy = 30 + cursor.r * 40;
				ctx.fillStyle = "rgba(122,162,247,0.14)";
				glow(ctx, accent(0), 12);
				roundRectPath(ctx, cx + 2, cy + 2, 36, 36, 8);
				ctx.fill();
				noGlow(ctx);
			}
			const s = Math.floor(state.elapsed);
			const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
			ctx.font = "bold 19px ui-monospace, monospace";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
				const n = state.grid[r][c];
				if (n === null) continue;
				const isClue = state.puzzle[r][c] !== null;
				const bad = !isClue && conflictsAt(state, r, c);
				ctx.fillStyle = isClue ? THEME.text : bad ? THEME.bad : ENTRY;
				if (bad) glow(ctx, THEME.bad, 8);
				ctx.fillText(String(n), c * 40 + 20, 30 + r * 40 + 20);
				if (bad) noGlow(ctx);
			}
			ctx.textBaseline = "alphabetic";
			ctx.strokeStyle = GRID$1;
			ctx.lineWidth = 1;
			for (let i = 0; i <= 9; i += 1) {
				if (i % 3 === 0) continue;
				ctx.beginPath();
				ctx.moveTo(i * 40, 30);
				ctx.lineTo(i * 40, LOGICAL_H$23);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, 30 + i * 40);
				ctx.lineTo(BOARD_W$6, 30 + i * 40);
				ctx.stroke();
			}
			ctx.strokeStyle = BOX;
			ctx.lineWidth = 2.5;
			for (let i = 0; i <= 9; i += 3) {
				ctx.beginPath();
				ctx.moveTo(i * 40, 30);
				ctx.lineTo(i * 40, LOGICAL_H$23);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, 30 + i * 40);
				ctx.lineTo(BOARD_W$6, 30 + i * 40);
				ctx.stroke();
			}
			if (state.won && !prevWon$3) particles$12.burst(BOARD_W$6 / 2, 210, THEME.gold, 26, 170);
			prevWon$3 = state.won;
			particles$12.tick(ctx, dt);
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, LOGICAL_W$26, 30);
			hudPair(ctx, 10, 20, `${difficulty === "easy" ? "简单" : difficulty === "normal" ? "普通" : "困难"} · D 切换`, "", "left");
			hudPair(ctx, 350, 20, "⏱ ", clock, "right");
			if (state.won) {
				ctx.save();
				ctx.translate(0, 30);
				drawOverlay(ctx, BOARD_W$6, BOARD_H$2, "解决！", `用时 ${clock} · 按 R 开新题`, THEME.gold);
				ctx.restore();
			} else if (paused) drawOverlay(ctx, LOGICAL_W$26, LOGICAL_H$23, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/sudoku/index.ts
		/** Time-based score: a faster solve -> a higher score (the panel keeps the max). */
		function solveScore(elapsed) {
			return Math.max(0, Math.round(1e3 - elapsed * 2));
		}
		const DIFF_CYCLE = [
			"easy",
			"normal",
			"hard"
		];
		function createSudokuGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$26, LOGICAL_H$23);
			if (fit === null) throw new Error("dsh-minigames: sudoku needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createSudokuState();
			let difficulty = "normal";
			let cursor = {
				r: 0,
				c: 0
			};
			let running = false;
			let reported = false;
			let shownSec = -1;
			const newPuzzle = () => {
				state = createSudokuState(void 0, difficulty);
				reported = false;
			};
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$26 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$23 / rect.height;
				const c = Math.floor(x / 40);
				const r = Math.floor((y - 30) / 40);
				if (r < 0 || r >= 9 || c < 0 || c >= 9) return null;
				return {
					r,
					c
				};
			};
			const onMouseDown = (event) => {
				if (state.won) {
					newPuzzle();
					loop.markDirty();
					return;
				}
				const cell = cellFromEvent(event);
				if (cell === null) return;
				cursor = cell;
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					newPuzzle();
					loop.markDirty();
					return;
				}
				if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
					return;
				}
				if (event.code === "KeyD") {
					event.preventDefault();
					difficulty = DIFF_CYCLE[(DIFF_CYCLE.indexOf(difficulty) + 1) % DIFF_CYCLE.length];
					newPuzzle();
					loop.markDirty();
					return;
				}
				if (!running || state.won) return;
				if (event.code.startsWith("Digit")) {
					event.preventDefault();
					const n = Number(event.code.slice(5));
					if (n >= 0 && n <= 9) place(state, cursor.r, cursor.c, n);
				} else if (event.code === "Backspace" || event.code === "Delete") {
					event.preventDefault();
					place(state, cursor.r, cursor.c, 0);
				} else if (event.code === "ArrowUp") {
					event.preventDefault();
					cursor = {
						r: Math.max(0, cursor.r - 1),
						c: cursor.c
					};
				} else if (event.code === "ArrowDown") {
					event.preventDefault();
					cursor = {
						r: Math.min(8, cursor.r + 1),
						c: cursor.c
					};
				} else if (event.code === "ArrowLeft") {
					event.preventDefault();
					cursor = {
						r: cursor.r,
						c: Math.max(0, cursor.c - 1)
					};
				} else if (event.code === "ArrowRight") {
					event.preventDefault();
					cursor = {
						r: cursor.r,
						c: Math.min(8, cursor.c + 1)
					};
				}
				loop.markDirty();
			};
			const loop = createFrameLoop((f) => {
				tick$1(state, f.dt);
				if (state.won && !reported) {
					reported = true;
					options?.onScore?.(solveScore(state.elapsed));
					loop.markDirty();
				}
				const sec = Math.floor(state.elapsed);
				if (sec !== shownSec) {
					shownSec = sec;
					loop.markDirty();
				}
				if (f.render) renderSudoku(ctx, state, difficulty, cursor, false);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderSudoku(ctx, state, difficulty, cursor, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.resume();
				loop.markDirty();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderSudoku(ctx, state, difficulty, cursor, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const sudokuGame = {
			id: "sudoku",
			title: "数独",
			icon: "🧩",
			description: "9×9 数独：填满且无冲突即胜，D 键切难度，越快分越高。",
			controls: [
				"点击：选中格子",
				"1-9：填入 / 0：清除",
				"方向键：移动光标",
				"D：切换难度",
				"R：新题",
				"P：暂停"
			],
			create: createSudokuGame
		};
		/** Seconds at the start of a round (and after a life) during which the
		* ghosts stay put, so the player can leave the spawn corridor. */
		const GHOST_DELAY = 1.5;
		const MAP_ROWS = [
			"###################",
			"#........#........#",
			"#o##.###.#.###.##o#",
			"#.................#",
			"#.##.#.#####.#.##.#",
			"#....#...#...#....#",
			"####.###.#.###.####",
			"####.#       #.####",
			"####.#.#####.#.####",
			"#....#...#...#....#",
			"#.##.#.#####.#.##.#",
			"#.................#",
			"#o##.###.#.###.##o#",
			"#........#........#",
			"###################"
		];
		const PLAYER_SPAWN = {
			r: 7,
			c: 9
		};
		const GHOST_SPAWNS = [{
			r: 5,
			c: 1
		}, {
			r: 5,
			c: 17
		}];
		const DIRS$3 = [
			[0, -1],
			[1, 0],
			[0, 1],
			[-1, 0]
		];
		function isWall(state, r, c) {
			if (r < 0 || r >= 15 || c < 0 || c >= 19) return true;
			return state.grid[r][c] === "#";
		}
		/** A fresh run: dots placed, player and ghosts at their spawns. */
		function createPacmanState(rng = Math.random) {
			const grid = MAP_ROWS.map((row) => row.split(""));
			let dotsLeft = 0;
			for (const row of grid) for (const cell of row) if (cell === "." || cell === "o") dotsLeft += 1;
			for (const spawn of [PLAYER_SPAWN, ...GHOST_SPAWNS]) {
				const cell = grid[spawn.r][spawn.c];
				if (cell === "." || cell === "o") {
					grid[spawn.r][spawn.c] = " ";
					dotsLeft -= 1;
				}
			}
			return {
				grid,
				px: PLAYER_SPAWN.c * 20 + 10,
				py: PLAYER_SPAWN.r * 20 + 10,
				dir: 1,
				intent: 1,
				ghosts: GHOST_SPAWNS.map((spawn) => {
					const x = spawn.c * 20 + 10;
					const y = spawn.r * 20 + 10;
					return {
						x,
						y,
						dir: 1,
						homeX: x,
						homeY: y
					};
				}),
				fright: 0,
				score: 0,
				lives: 3,
				dotsLeft,
				ghostDelay: GHOST_DELAY,
				over: false,
				won: false,
				rng
			};
		}
		function atCentre(v) {
			return Math.abs(v % 20 - 10) < 2;
		}
		/** Snap a coordinate back to the centre of its cell (undoes wall wedging). */
		function snapCentre(v) {
			return Math.floor(v / 20) * 20 + 10;
		}
		/**
		* Move the player one frame, grid-aligned: it travels between cell centres,
		* lands exactly on the next centre, and only turns at a centre. When the next
		* cell is a wall it parks on the current centre — it never creeps toward the
		* wall edge, so no centre/wall jitter.
		*/
		function movePlayer(state, dt) {
			if (atCentre(state.px) && atCentre(state.py) && state.intent !== state.dir) {
				const [idx, idy] = DIRS$3[state.intent];
				const gr = Math.floor(state.py / 20);
				const gc = Math.floor(state.px / 20);
				if (!isWall(state, gr + idy, gc + idx)) state.dir = state.intent;
			}
			const [dx, dy] = DIRS$3[state.dir];
			const gr = Math.floor(state.py / 20);
			const gc = Math.floor(state.px / 20);
			if (isWall(state, gr + dy, gc + dx)) {
				state.px = snapCentre(state.px);
				state.py = snapCentre(state.py);
			} else {
				const targetX = (gc + dx) * 20 + 10;
				const targetY = (gr + dy) * 20 + 10;
				const step = 110 * dt;
				let nx = state.px + dx * step;
				let ny = state.py + dy * step;
				if (dx !== 0 && (dx > 0 && nx > targetX || dx < 0 && nx < targetX)) nx = targetX;
				if (dy !== 0 && (dy > 0 && ny > targetY || dy < 0 && ny < targetY)) ny = targetY;
				state.px = nx;
				state.py = ny;
			}
			const r = Math.floor(state.py / 20);
			const c = Math.floor(state.px / 20);
			const cell = state.grid[r][c];
			if (cell === ".") {
				state.grid[r][c] = " ";
				state.dotsLeft -= 1;
				state.score += 10;
			} else if (cell === "o") {
				state.grid[r][c] = " ";
				state.dotsLeft -= 1;
				state.score += 50;
				state.fright = 5;
			}
		}
		/** Direction that minimises (or maximises) the Manhattan distance to the player. */
		function ghostDir(state, ghost, flee) {
			const gr = Math.floor(ghost.y / 20);
			const gc = Math.floor(ghost.x / 20);
			const pr = Math.floor(state.py / 20);
			const pc = Math.floor(state.px / 20);
			const back = (ghost.dir + 2) % 4;
			let best = null;
			let bestScore = flee ? -Infinity : Infinity;
			for (let d = 0; d < 4; d = d + 1) {
				if (d === back) continue;
				const [dx, dy] = DIRS$3[d];
				if (isWall(state, gr + dy, gc + dx)) continue;
				const dist = Math.abs(gr + dy - pr) + Math.abs(gc + dx - pc);
				if (flee ? dist > bestScore : dist < bestScore) {
					bestScore = dist;
					best = d;
				}
			}
			if (best === null) best = back;
			return best;
		}
		/** Move the ghosts one frame, grid-aligned like the player; frozen during ghostDelay. */
		function moveGhosts(state, dt) {
			if (state.ghostDelay > 0) {
				state.ghostDelay -= dt;
				return;
			}
			const flee = state.fright > 0;
			for (const ghost of state.ghosts) {
				if (atCentre(ghost.x) && atCentre(ghost.y)) ghost.dir = ghostDir(state, ghost, flee);
				const [dx, dy] = DIRS$3[ghost.dir];
				const gr = Math.floor(ghost.y / 20);
				const gc = Math.floor(ghost.x / 20);
				if (isWall(state, gr + dy, gc + dx)) {
					ghost.x = snapCentre(ghost.x);
					ghost.y = snapCentre(ghost.y);
					continue;
				}
				const targetX = (gc + dx) * 20 + 10;
				const targetY = (gr + dy) * 20 + 10;
				const step = 95 * dt;
				let nx = ghost.x + dx * step;
				let ny = ghost.y + dy * step;
				if (dx !== 0 && (dx > 0 && nx > targetX || dx < 0 && nx < targetX)) nx = targetX;
				if (dy !== 0 && (dy > 0 && ny > targetY || dy < 0 && ny < targetY)) ny = targetY;
				ghost.x = nx;
				ghost.y = ny;
			}
		}
		/** Player-ghost contacts: eat a frightened ghost or lose a life. */
		function collide(state) {
			if (state.ghostDelay > 0) return;
			for (const ghost of state.ghosts) if (Math.hypot(ghost.x - state.px, ghost.y - state.py) < 18) {
				if (state.fright > 0) {
					ghost.x = ghost.homeX;
					ghost.y = ghost.homeY;
					ghost.dir = 1;
					state.score += 200;
				} else {
					state.lives -= 1;
					state.px = PLAYER_SPAWN.c * 20 + 10;
					state.py = PLAYER_SPAWN.r * 20 + 10;
					state.dir = 1;
					state.intent = 1;
					state.fright = 0;
					state.ghostDelay = GHOST_DELAY;
					for (const g of state.ghosts) {
						g.x = g.homeX;
						g.y = g.homeY;
						g.dir = 1;
					}
					if (state.lives <= 0) state.over = true;
					return;
				}
			}
		}
		/** Advance one frame. Returns whether the run ended this frame. */
		function stepPacman(state, dt) {
			if (state.over || state.won) return true;
			if (state.fright > 0) state.fright = Math.max(0, state.fright - dt);
			movePlayer(state, dt);
			moveGhosts(state, dt);
			collide(state);
			if (state.dotsLeft <= 0) {
				state.won = true;
				return true;
			}
			return state.over;
		}
		const LOGICAL_W$25 = 380;
		const LOGICAL_H$22 = 330;
		const WALL$1 = "#23233a";
		const WALL_EDGE = "#34344e";
		const DOT = "#c8b088";
		const particles$11 = createParticles();
		let prevScore$2 = 0;
		let prevFrameMs$3 = 0;
		/** Draw one frame; `t` is a running seconds counter for flicker effects.
		* @param paused - show the pause overlay. */
		function renderPacman(ctx, state, t, paused) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$3 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$3);
			prevFrameMs$3 = nowMs;
			drawBackground(ctx, LOGICAL_W$25, LOGICAL_H$22);
			if (state.score > prevScore$2) {
				const gain = state.score - prevScore$2;
				particles$11.burst(state.px, 30 + state.py, gain >= 100 ? accent(4) : THEME.gold, gain >= 100 ? 22 : 10, gain >= 100 ? 170 : 120);
			}
			prevScore$2 = state.score;
			for (let r = 0; r < 15; r += 1) for (let c = 0; c < 19; c += 1) {
				const x = c * 20;
				const y = 30 + r * 20;
				const cell = state.grid[r][c];
				if (cell === "#") {
					ctx.fillStyle = WALL$1;
					ctx.fillRect(x, y, 20, 20);
					ctx.fillStyle = WALL_EDGE;
					ctx.fillRect(x + 1, y + 1, 18, 3);
				} else if (cell === ".") {
					ctx.fillStyle = DOT;
					ctx.beginPath();
					ctx.arc(x + 10, y + 10, 2.5, 0, Math.PI * 2);
					ctx.fill();
				} else if (cell === "o") {
					const pulse = 4 + Math.sin(t * 8) * 1.5;
					glow(ctx, THEME.gold, 8);
					ctx.fillStyle = THEME.gold;
					ctx.beginPath();
					ctx.arc(x + 10, y + 10, pulse, 0, Math.PI * 2);
					ctx.fill();
					noGlow(ctx);
				}
			}
			const DIR_OFFSET = {
				0: [0, -2],
				1: [2, 0],
				2: [0, 2],
				3: [-2, 0]
			};
			state.ghosts.forEach((ghost, i) => {
				const frightened = state.fright > 0;
				const flicker = frightened && Math.floor(t * 8) % 2 === 0;
				const bodyColor = frightened ? flicker ? "#ffffff" : accent(5) : accent(4 + i);
				ctx.fillStyle = bodyColor;
				glow(ctx, bodyColor, 10);
				const gy = 30 + ghost.y;
				const r = 8.4;
				ctx.beginPath();
				ctx.arc(ghost.x, gy, r, Math.PI, 0);
				const phase = t * 10 + i * 2;
				ctx.lineTo(ghost.x + r, gy + r);
				ctx.lineTo(ghost.x + r - r * (2 / 3), gy + r - 4 + Math.sin(phase) * 2.5);
				ctx.lineTo(ghost.x + r - r * (1 / 3), gy + r);
				ctx.lineTo(ghost.x, gy + r - 4 + Math.sin(phase + Math.PI) * 2.5);
				ctx.lineTo(ghost.x - r + r * (1 / 3), gy + r);
				ctx.lineTo(ghost.x - r + r * (2 / 3), gy + r - 4 + Math.sin(phase + Math.PI * .5) * 2.5);
				ctx.lineTo(ghost.x - r, gy + r);
				ctx.closePath();
				ctx.fill();
				noGlow(ctx);
				if (!frightened) {
					const [ex, ey] = DIR_OFFSET[ghost.dir];
					ctx.fillStyle = "#ffffff";
					ctx.beginPath();
					ctx.arc(ghost.x - 4, gy - 2, 3.5, 0, Math.PI * 2);
					ctx.arc(ghost.x + 4, gy - 2, 3.5, 0, Math.PI * 2);
					ctx.fill();
					ctx.fillStyle = THEME.bgBottom;
					ctx.beginPath();
					ctx.arc(ghost.x - 4 + ex, gy - 2 + ey, 1.8, 0, Math.PI * 2);
					ctx.arc(ghost.x + 4 + ex, gy - 2 + ey, 1.8, 0, Math.PI * 2);
					ctx.fill();
				}
			});
			const mouth = .12 + .5 * Math.abs(Math.sin(t * 12));
			const [a0, a1] = {
				0: [-Math.PI / 2 - mouth, -Math.PI / 2 + mouth],
				1: [-mouth, mouth],
				2: [Math.PI / 2 - mouth, Math.PI / 2 + mouth],
				3: [Math.PI - mouth, Math.PI + mouth]
			}[state.dir];
			ctx.fillStyle = THEME.gold;
			glow(ctx, THEME.gold, 12);
			ctx.beginPath();
			ctx.moveTo(state.px, 30 + state.py);
			ctx.arc(state.px, 30 + state.py, 8.8, a1, a0);
			ctx.closePath();
			ctx.fill();
			noGlow(ctx);
			hudPair(ctx, 10, 20, "得分", `${state.score}`);
			hudPair(ctx, 370, 20, "生命", "♥".repeat(Math.max(0, state.lives)), "right", THEME.bad);
			particles$11.tick(ctx, dtMs);
			if (state.over) drawOverlay(ctx, LOGICAL_W$25, LOGICAL_H$22, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
			else if (state.won) drawOverlay(ctx, LOGICAL_W$25, LOGICAL_H$22, "过关啦！", `得分 ${state.score} · 按 R 重新开始`, THEME.gold);
			else if (paused) drawOverlay(ctx, LOGICAL_W$25, LOGICAL_H$22, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/pacman/index.ts
		const KEY_DIR$2 = {
			ArrowUp: 0,
			ArrowRight: 1,
			ArrowDown: 2,
			ArrowLeft: 3,
			KeyW: 0,
			KeyD: 1,
			KeyS: 2,
			KeyA: 3
		};
		function createPacmanGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$25, LOGICAL_H$22);
			if (fit === null) throw new Error("dsh-minigames: pacman needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createPacmanState();
			let t = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const dir = KEY_DIR$2[event.code];
				if (dir !== void 0) {
					event.preventDefault();
					if (!state.over && !state.won) state.intent = dir;
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createPacmanState();
					lastScore = -1;
					loop.markDirty();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				t += f.dt;
				stepPacman(state, f.dt);
				reportScore();
				if (f.render) renderPacman(ctx, state, t, false);
			});
			const togglePause = () => {
				if (loop.running) pause();
				else resume();
			};
			const pause = () => {
				if (!loop.running) return;
				loop.pause();
				renderPacman(ctx, state, t, true);
			};
			const resume = () => {
				loop.resume();
			};
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			loop.start();
			renderPacman(ctx, state, 0, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const pacmanGame = {
			id: "pacman",
			title: "吃豆人",
			icon: "🟡",
			description: "经典吃豆人：吃掉所有豆子过关，力量豆可反吃幽灵。",
			controls: [
				"方向键 / WASD：移动",
				"R：重开",
				"P：暂停"
			],
			create: createPacmanGame
		};
		const FOV = Math.PI / 2;
		const HIT_ANGLE = 5 * Math.PI / 180;
		const HIT_PITCH = 4 * Math.PI / 180;
		const SENSITIVITY = .0022;
		const RECOIL_PITCH = .055;
		const RECOIL_MAX = .2;
		const RECOIL_RECOVER = .16;
		const SHAKE_YAW = .02;
		const FLASH_TIME = .08;
		const BULLET_HIT_MS = .12;
		const BULLET_MISS_MS = .3;
		const HIT_FLASH = .15;
		const TURN_MIN = .4;
		const TURN_MAX = 1.2;
		const MAX_TURN = Math.PI / 3;
		const MAX_PITCH = Math.PI / 6;
		function rand(lo, hi, rng) {
			return lo + rng() * (hi - lo);
		}
		function clamp(v, lo, hi) {
			return Math.max(lo, Math.min(hi, v));
		}
		/** Normalize an angle to (-π, π]. */
		function normAngle(a) {
			let r = a % (Math.PI * 2);
			if (r > Math.PI) r -= Math.PI * 2;
			if (r <= -Math.PI) r += Math.PI * 2;
			return r;
		}
		/** A fresh round: looking straight ahead, target in front at camera height. */
		function createFpsTrackState(rng = Math.random) {
			return {
				yaw: 0,
				pitch: 0,
				targetX: 1220,
				targetY: 500,
				targetH: 150,
				angle: rand(0, Math.PI * 2, rng),
				hVel: rand(-75, 75, rng),
				score: 0,
				shots: 0,
				hits: 0,
				onTargetTime: 0,
				recoilPitch: 0,
				shakeYaw: 0,
				flashT: 0,
				bullet: null,
				hitFlashT: 0,
				elapsed: 0,
				remaining: 30,
				over: false,
				turnT: rand(TURN_MIN, TURN_MAX, rng),
				rng
			};
		}
		/** Rotate the view by mouse deltas (px). Screen-y is down, so moving the
		* mouse down must pitch the view down (standard FPS feel). */
		function turn(state, dx, dy) {
			state.yaw = normAngle(state.yaw + dx * SENSITIVITY);
			state.pitch = clamp(state.pitch - dy * SENSITIVITY, -MAX_PITCH, MAX_PITCH);
		}
		/** Effective view yaw including the shot shake. */
		function effectiveYaw(state) {
			return state.yaw + state.shakeYaw;
		}
		/** Effective view pitch including the recoil kick. */
		function effectivePitch(state) {
			return state.pitch + state.recoilPitch;
		}
		/** Distance along the view axis from the camera to the target. */
		function targetDepth(state) {
			const dx = state.targetX - 800;
			const dy = state.targetY - 500;
			return dx * Math.cos(effectiveYaw(state)) + dy * Math.sin(effectiveYaw(state));
		}
		/** The target's horizontal offset from the view direction (radians). */
		function targetOffset(state) {
			return normAngle(Math.atan2(state.targetY - 500, state.targetX - 800) - effectiveYaw(state));
		}
		/** The target's vertical offset from the view pitch (radians). */
		function targetPitchOffset(state) {
			return Math.atan2(state.targetH - 150, Math.max(20, targetDepth(state))) - effectivePitch(state);
		}
		/** Whether the view is currently locked on the target (both axes). */
		function isLocked(state) {
			return Math.abs(targetOffset(state)) < HIT_ANGLE && Math.abs(targetPitchOffset(state)) < HIT_PITCH;
		}
		/** Screen x of the target (0..LOGICAL_W) when visible, or null. */
		function targetScreenX(state) {
			const offset = targetOffset(state);
			if (Math.abs(offset) > FOV / 2) return null;
			return 240 + offset / (FOV / 2) * 240;
		}
		/** Screen y of the target (0..LOGICAL_H) when visible, or null. A target
		* above the camera must render above the screen centre (smaller y). */
		function targetScreenY(state) {
			if (targetScreenX(state) === null) return null;
			const vertical = targetPitchOffset(state);
			const half = Math.PI / 6;
			if (Math.abs(vertical) > half) return null;
			return 150 - vertical / half * 150;
		}
		/** Fire a shot: spawn a bullet that flies to the target (when locked) or out
		* into the view direction (when not), then apply recoil and shake. */
		function shoot$1(state) {
			if (state.over) return false;
			state.shots += 1;
			const hit = isLocked(state);
			if (hit) {
				state.hits += 1;
				state.score += 20;
			}
			const yaw = effectiveYaw(state);
			const pitch = effectivePitch(state);
			const cosP = Math.cos(pitch);
			if (hit) state.bullet = {
				x0: 800,
				y0: 500,
				h0: 150,
				x1: state.targetX,
				y1: state.targetY,
				h1: state.targetH,
				t: 0,
				dur: BULLET_HIT_MS,
				hit: true
			};
			else state.bullet = {
				x0: 800,
				y0: 500,
				h0: 150,
				x1: 800 + cosP * Math.cos(yaw) * 700,
				y1: 500 + cosP * Math.sin(yaw) * 700,
				h1: 150 + Math.sin(pitch) * 700,
				t: 0,
				dur: BULLET_MISS_MS,
				hit: false
			};
			state.recoilPitch = Math.min(RECOIL_MAX, state.recoilPitch + RECOIL_PITCH);
			state.shakeYaw += rand(-.02, SHAKE_YAW, state.rng);
			state.flashT = FLASH_TIME;
			return hit;
		}
		/** The bullet's current world position, or null when none is in flight. */
		function bulletPosition(state) {
			const bullet = state.bullet;
			if (bullet === null) return null;
			const k = Math.min(1, bullet.t);
			return {
				x: bullet.x0 + (bullet.x1 - bullet.x0) * k,
				y: bullet.y0 + (bullet.y1 - bullet.y0) * k,
				h: bullet.h0 + (bullet.h1 - bullet.h0) * k
			};
		}
		/** Advance one frame: target motion, recoil/shake decay, lock score, timer. */
		function tickFpsTrack(state, dt) {
			if (state.over) return;
			state.remaining -= dt;
			state.elapsed += dt;
			if (state.remaining <= 0) {
				state.remaining = 0;
				state.over = true;
				return;
			}
			state.turnT -= dt;
			if (state.turnT <= 0) {
				state.angle += rand(-MAX_TURN, MAX_TURN, state.rng);
				state.hVel = rand(-75, 75, state.rng);
				state.turnT = rand(TURN_MIN, TURN_MAX, state.rng);
			}
			let nx = state.targetX + Math.cos(state.angle) * 140 * dt;
			let ny = state.targetY + Math.sin(state.angle) * 140 * dt;
			if (nx < 40 || nx > 1560) {
				nx = clamp(nx, 40, 1560);
				state.angle = Math.PI - state.angle;
				state.turnT = rand(TURN_MIN, TURN_MAX, state.rng);
			}
			if (ny < 40 || ny > 960) {
				ny = clamp(ny, 40, 960);
				state.angle = -state.angle;
				state.turnT = rand(TURN_MIN, TURN_MAX, state.rng);
			}
			state.targetX = nx;
			state.targetY = ny;
			state.targetH = clamp(state.targetH + state.hVel * dt, 30, 320);
			if (state.targetH <= 30 || state.targetH >= 320) state.hVel = -state.hVel;
			state.recoilPitch = Math.max(0, state.recoilPitch - RECOIL_RECOVER * dt);
			state.shakeYaw *= Math.exp(-3.2 * dt);
			if (state.flashT > 0) state.flashT = Math.max(0, state.flashT - dt);
			if (state.hitFlashT > 0) state.hitFlashT = Math.max(0, state.hitFlashT - dt);
			if (state.bullet !== null) {
				state.bullet.t += dt / state.bullet.dur;
				if (state.bullet.t >= 1) {
					if (state.bullet.hit) state.hitFlashT = HIT_FLASH;
					state.bullet = null;
				}
			}
			if (isLocked(state)) {
				state.score += 10 * dt;
				state.onTargetTime += dt;
			}
		}
		//#endregion
		//#region src/client/games/aimtrack/render.ts
		const SKY_TOP = "#10142a";
		const SKY_BOTTOM = "#1c2b45";
		const GROUND = "#141a10";
		const GROUND_GRID = "rgba(122,162,247,0.10)";
		const TARGET = accent(4);
		const TARGET_EDGE = accent(6);
		const CROSSHAIR = THEME.good;
		const LOCKED = THEME.gold;
		const FOCAL = 240;
		const particles$10 = createParticles();
		let prevHits = -1;
		let lastFrame$4 = 0;
		/** Project a world point at height h into screen coords (effective view). */
		function project(state, wx, wy, h) {
			const yaw = effectiveYaw(state);
			const dx = wx - 800;
			const dy = wy - 500;
			const depth = dx * Math.cos(yaw) + dy * Math.sin(yaw);
			const lateral = dx * -Math.sin(yaw) + dy * Math.cos(yaw);
			if (depth < 20) return null;
			return {
				x: 240 + lateral * (FOCAL / depth),
				y: 150 + Math.tan(effectivePitch(state)) * FOCAL + (150 - h) / depth * FOCAL,
				depth
			};
		}
		/** Draw one frame; `t` is a running seconds counter for the target pulse. */
		function renderAimTrack(ctx, state, t, phase) {
			ctx.clearRect(0, 0, 480, 300);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$4 === 0 ? 16 : now - lastFrame$4);
			lastFrame$4 = now;
			const horizon = 150 + Math.tan(effectivePitch(state)) * FOCAL * .6;
			const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
			sky.addColorStop(0, SKY_TOP);
			sky.addColorStop(1, SKY_BOTTOM);
			ctx.fillStyle = sky;
			ctx.fillRect(0, 0, 480, Math.max(0, horizon));
			ctx.fillStyle = GROUND;
			ctx.fillRect(0, Math.max(0, horizon), 480, 300 - Math.max(0, horizon));
			ctx.strokeStyle = GROUND_GRID;
			ctx.lineWidth = 1;
			const gridStep = 160;
			for (let gx = -160; gx <= 1760; gx += gridStep) {
				const p1 = project(state, gx, -300, 0);
				const p2 = project(state, gx, 1300, 0);
				if (p1 !== null && p2 !== null) {
					ctx.beginPath();
					ctx.moveTo(p1.x, p1.y);
					ctx.lineTo(p2.x, p2.y);
					ctx.stroke();
				}
			}
			for (let gy = -300; gy <= 1300; gy += gridStep) {
				const p1 = project(state, -160, gy, 0);
				const p2 = project(state, 1760, gy, 0);
				if (p1 !== null && p2 !== null) {
					ctx.beginPath();
					ctx.moveTo(p1.x, p1.y);
					ctx.lineTo(p2.x, p2.y);
					ctx.stroke();
				}
			}
			if (phase === "playing") {
				const tp = project(state, state.targetX, state.targetY, state.targetH);
				const sx = targetScreenX(state);
				const sy = targetScreenY(state);
				if (tp !== null && sx !== null && sy !== null) {
					const locked = isLocked(state);
					const size = Math.max(6, Math.min(18, 2600 / tp.depth));
					const pulse = 1 + Math.sin(t * 6) * .06;
					glow(ctx, TARGET, 14);
					ctx.fillStyle = TARGET;
					ctx.beginPath();
					ctx.arc(sx, sy, size * pulse, 0, Math.PI * 2);
					ctx.fill();
					noGlow(ctx);
					ctx.strokeStyle = TARGET_EDGE;
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.arc(sx, sy, size * pulse, 0, Math.PI * 2);
					ctx.stroke();
					if (locked) {
						ctx.strokeStyle = "rgba(224,175,104,0.6)";
						ctx.beginPath();
						ctx.arc(sx, sy, size * 1.7, 0, Math.PI * 2);
						ctx.stroke();
					}
				}
			}
			const locked = isLocked(state);
			ctx.strokeStyle = locked ? LOCKED : CROSSHAIR;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(240, 150, 9, 0, Math.PI * 2);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(226, 150);
			ctx.lineTo(235, 150);
			ctx.moveTo(245, 150);
			ctx.lineTo(254, 150);
			ctx.moveTo(240, 136);
			ctx.lineTo(240, 145);
			ctx.moveTo(240, 155);
			ctx.lineTo(240, 164);
			ctx.stroke();
			if (locked) {
				ctx.fillStyle = "rgba(224,175,104,0.22)";
				ctx.beginPath();
				ctx.arc(240, 150, 12, 0, Math.PI * 2);
				ctx.fill();
			}
			if (phase === "playing") {
				const pos = bulletPosition(state);
				if (pos !== null) {
					const p = project(state, pos.x, pos.y, pos.h);
					if (p !== null) {
						glow(ctx, THEME.gold, 8);
						ctx.strokeStyle = "rgba(224,175,104,0.85)";
						ctx.lineWidth = 2;
						ctx.beginPath();
						ctx.moveTo(390, 310);
						ctx.lineTo(p.x, p.y);
						ctx.stroke();
						noGlow(ctx);
						ctx.fillStyle = "#fff3b0";
						ctx.beginPath();
						ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
						ctx.fill();
					}
				}
				if (state.hitFlashT > 0) {
					const hx = targetScreenX(state);
					const hy = targetScreenY(state);
					if (hx !== null && hy !== null) {
						ctx.strokeStyle = "rgba(224,175,104,0.9)";
						ctx.lineWidth = 2;
						const s = 5 + (1 - state.hitFlashT / .15) * 6;
						for (let i = 0; i < 4; i += 1) {
							const a = i / 4 * Math.PI + t * 4;
							ctx.beginPath();
							ctx.moveTo(hx + Math.cos(a) * s, hy + Math.sin(a) * s);
							ctx.lineTo(hx + Math.cos(a) * (s + 6), hy + Math.sin(a) * (s + 6));
							ctx.stroke();
						}
					}
				}
			}
			if (phase !== "ready") drawGun(ctx, state);
			if (prevHits >= 0 && state.hits > prevHits) {
				const hx = targetScreenX(state);
				const hy = targetScreenY(state);
				particles$10.burst(hx ?? 240, hy ?? 150, THEME.gold, 14, 150);
			}
			prevHits = state.hits;
			particles$10.tick(ctx, dt);
			if (phase !== "ready") {
				hudPair(ctx, 10, 18, "⏱ ", `${Math.max(0, Math.ceil(state.remaining))}s`, "left", THEME.gold);
				hudPair(ctx, 470, 18, `得分 ${Math.floor(state.score)} · `, `命中率 ${shotRatePct(state).toFixed(0)}%`, "right");
				ctx.font = "11px ui-monospace, monospace";
				ctx.fillStyle = THEME.textMuted;
				ctx.textAlign = "left";
				ctx.fillText("左键 射击 · P 暂停 · Esc 释放鼠标 · R 重开", 10, 294);
			}
			if (phase === "ready") overlay(ctx, "点击进入跟枪", "点击锁定鼠标（光标隐藏），移动鼠标转动视角", "准星固定在屏幕中央 · 左键射击 · P 暂停");
			else if (phase === "paused") overlay(ctx, "已暂停", "按 P 或点击继续 · R 重开");
			else if (phase === "over") overlay(ctx, "时间到！", `得分 ${Math.floor(state.score)} · 命中率 ${shotRatePct(state).toFixed(0)}%`, "点击重新开始 · R 重开");
		}
		/** A simple first-person rifle held in the bottom-right corner. */
		function drawGun(ctx, state) {
			const kick = Math.min(1, state.recoilPitch / .2);
			ctx.save();
			ctx.translate(468, 296 + kick * 12);
			ctx.rotate(-.52 - kick * .05);
			const metal = "#3a3e45";
			const metalHi = "#555a62";
			const metalLo = "#22252a";
			const wood = "#4a3527";
			ctx.fillStyle = metal;
			ctx.fillRect(-150, -14, 122, 16);
			ctx.fillStyle = metalHi;
			ctx.fillRect(-150, -14, 122, 5);
			ctx.fillStyle = metalLo;
			ctx.fillRect(-186, -8, 40, 7);
			ctx.fillStyle = metalHi;
			ctx.fillRect(-186, -8, 40, 2.5);
			ctx.fillStyle = metal;
			ctx.fillRect(-192, -13, 7, 16);
			ctx.fillStyle = "#2f333a";
			ctx.fillRect(-150, 2, 92, 12);
			ctx.fillStyle = wood;
			ctx.beginPath();
			ctx.moveTo(-98, 2);
			ctx.lineTo(-86, 30);
			ctx.lineTo(-72, 30);
			ctx.lineTo(-76, 2);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = metalLo;
			ctx.beginPath();
			ctx.moveTo(-60, 2);
			ctx.lineTo(-52, 28);
			ctx.lineTo(-38, 28);
			ctx.lineTo(-42, 2);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = metalLo;
			ctx.fillRect(-122, -26, 36, 12);
			ctx.fillStyle = "#101216";
			ctx.fillRect(-117, -23, 26, 5);
			ctx.restore();
			if (state.flashT > 0) {
				const angle = -.52;
				const mx = 468 + Math.cos(angle) * -198;
				const my = 296 + Math.sin(angle) * -198;
				ctx.save();
				ctx.translate(mx, my);
				ctx.rotate(Math.PI / 4);
				glow(ctx, THEME.gold, 12);
				ctx.fillStyle = "rgba(255,216,61,0.95)";
				ctx.beginPath();
				ctx.moveTo(0, -11);
				ctx.lineTo(7, 0);
				ctx.lineTo(0, 11);
				ctx.lineTo(-7, 0);
				ctx.closePath();
				ctx.fill();
				noGlow(ctx);
				ctx.fillStyle = "rgba(255,255,255,0.8)";
				ctx.beginPath();
				ctx.moveTo(0, -5);
				ctx.lineTo(4, 0);
				ctx.lineTo(0, 5);
				ctx.lineTo(-4, 0);
				ctx.closePath();
				ctx.fill();
				ctx.restore();
			}
		}
		/** Shared-style overlay veil with a spaced title and up to two body lines. */
		function overlay(ctx, title, line1, line2) {
			drawOverlay(ctx, 480, 300, title, line1, THEME.gold);
			if (line2 !== void 0) {
				ctx.textAlign = "center";
				ctx.font = "600 13px system-ui, sans-serif";
				ctx.fillStyle = THEME.textMuted;
				ctx.fillText(line2, 240, 192);
			}
		}
		function shotRatePct(state) {
			return state.shots <= 0 ? 0 : state.hits / state.shots * 100;
		}
		//#endregion
		//#region src/client/games/aimtrack/index.ts
		function createAimTrackGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 300);
			if (fit === null) throw new Error("dsh-minigames: aimtrack needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createFpsTrackState();
			let phase = "ready";
			let t = 0;
			let lastScore = -1;
			const reportScore = () => {
				const score = Math.floor(state.score);
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const lockMouse = () => {
				try {
					canvas.requestPointerLock()?.catch(() => {});
				} catch {}
			};
			const onPointerLockChange = () => {
				if (document.pointerLockElement === canvas) {
					if (phase !== "playing") phase = "playing";
				} else if (phase === "playing") phase = "paused";
				loop.markDirty();
			};
			const onMouseMove = (event) => {
				if (phase !== "playing") return;
				if (document.pointerLockElement === canvas) turn(state, event.movementX, event.movementY);
			};
			const onMouseDown = (event) => {
				if (phase === "playing" && event.button === 0) {
					shoot$1(state);
					reportScore();
				}
			};
			const onClick = () => {
				if (phase === "over") {
					state = createFpsTrackState();
					lastScore = -1;
				}
				if (phase !== "playing") lockMouse();
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createFpsTrackState();
					lastScore = -1;
					if (phase === "over") phase = "ready";
					loop.markDirty();
					return;
				}
				if (event.code === "KeyP") {
					event.preventDefault();
					if (phase === "playing") {
						phase = "paused";
						if (document.pointerLockElement === canvas) document.exitPointerLock();
					} else if (phase === "paused") lockMouse();
				}
			};
			const frame = (f) => {
				if (phase === "playing") {
					t += f.dt;
					tickFpsTrack(state, f.dt);
					reportScore();
					if (state.over && phase === "playing") {
						phase = "over";
						if (document.pointerLockElement === canvas) document.exitPointerLock();
					}
				}
				if (f.render) renderAimTrack(ctx, state, t, phase);
			};
			const loop = createFrameLoop(frame);
			const pause = () => {
				if (phase === "playing") {
					phase = "paused";
					if (document.pointerLockElement === canvas) document.exitPointerLock();
				}
				loop.markDirty();
			};
			const resume = () => {
				if (phase === "paused" || phase === "ready") phase = "ready";
			};
			document.addEventListener("pointerlockchange", onPointerLockChange);
			canvas.addEventListener("mousemove", onMouseMove);
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("click", onClick);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			loop.start();
			renderAimTrack(ctx, state, 0, phase);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					loop.destroy();
					fit.dispose();
					if (document.pointerLockElement === canvas) document.exitPointerLock();
					document.removeEventListener("pointerlockchange", onPointerLockChange);
					canvas.removeEventListener("mousemove", onMouseMove);
					canvas.removeEventListener("mousedown", onMouseDown);
					canvas.removeEventListener("click", onClick);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const aimTrackGame = {
			id: "aimtrack",
			title: "跟枪练习",
			icon: "🎯",
			description: "FPS 跟枪：点击锁定鼠标，准星固定屏幕中央，转动视角压住上下左右漂移的靶子，左键射击。",
			controls: [
				"点击：锁定鼠标开始",
				"鼠标：转动视角",
				"左键：射击",
				"P：暂停（Esc 释放鼠标）",
				"R：重开"
			],
			create: createAimTrackGame
		};
		/** Keyboard codes for pads 0..3 (also drawn on the pads). */
		const PAD_KEYS = [
			"KeyA",
			"KeyS",
			"KeyD",
			"KeyF"
		];
		function createSimonState(rng = Math.random) {
			return {
				phase: "idle",
				sequence: [],
				inputIndex: 0,
				showIndex: 0,
				round: 0,
				score: 0,
				rng
			};
		}
		/** Flash spacing for a round: linear ramp from START_INTERVAL_MS at round 1 to MIN_INTERVAL_MS at RAMP_ROUND. */
		function flashInterval(round) {
			return 600 + (Math.min(Math.max(round, 1), 10) - 1) / 9 * -300;
		}
		/** Begin a round: append one pad and (re)start the show phase from the first flash. */
		function startRound(state) {
			state.sequence.push(Math.floor(state.rng() * 4));
			state.round = state.sequence.length;
			state.phase = "showing";
			state.showIndex = 0;
			state.inputIndex = 0;
		}
		/**
		* Advance the show phase by one flash.
		* @returns true when the whole sequence has been shown and the phase is now 'input'.
		*/
		function advanceShow(state) {
			if (state.phase !== "showing") return false;
			state.showIndex += 1;
			if (state.showIndex >= state.sequence.length) {
				state.phase = "input";
				state.inputIndex = 0;
				return true;
			}
			return false;
		}
		/**
		* Press a pad during the input phase.
		* @returns 'ignored' outside 'input'; 'correct' for a continuing match;
		*   'round-clear' when the full sequence was repeated; 'wrong' on game over.
		*/
		function press(state, pad) {
			if (state.phase !== "input") return "ignored";
			if (state.sequence[state.inputIndex] !== pad) {
				state.phase = "over";
				return "wrong";
			}
			state.inputIndex += 1;
			if (state.inputIndex >= state.sequence.length) {
				state.score += state.round;
				state.phase = "idle";
				return "round-clear";
			}
			return "correct";
		}
		/** Key letter drawn on each pad (A/S/D/F). */
		const KEY_LETTERS = [
			"A",
			"S",
			"D",
			"F"
		];
		function padRect(i) {
			const col = i % 2;
			const row = Math.floor(i / 2);
			return {
				x: 8 + col * 112,
				y: 40 + row * 112
			};
		}
		/** Which pad (0..3) a logical-space point lands on, or null. */
		function padAt(x, y) {
			for (let i = 0; i < 4; i += 1) {
				const { x: px, y: py } = padRect(i);
				if (x >= px && x <= px + 96 && y >= py && y <= py + 96) return i;
			}
			return null;
		}
		/**
		* Draw one frame.
		* @param lit - pad index to render glowing, or null for none (caller-owned
		*   flash/press timing).
		*/
		function renderSimon(ctx, state, lit, paused) {
			ctx.clearRect(0, 0, 224, 256);
			drawBackground(ctx, 224, 256);
			hudPair(ctx, 8, 21, "回合 ", String(Math.max(1, state.round)));
			hudPair(ctx, 216, 21, "得分 ", String(state.score), "right", THEME.gold);
			for (let i = 0; i < 4; i += 1) {
				const { x, y } = padRect(i);
				const color = accent(i);
				const active = lit === i;
				glow(ctx, color, active ? 22 : 5);
				ctx.fillStyle = active ? color : THEME.panel;
				roundRectPath(ctx, x, y, 96, 96, 14);
				ctx.fill();
				noGlow(ctx);
				ctx.strokeStyle = color;
				ctx.lineWidth = active ? 2.5 : 1.5;
				ctx.stroke();
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.font = "bold 22px system-ui, sans-serif";
				ctx.fillStyle = active ? THEME.bgTop : color;
				ctx.fillText(KEY_LETTERS[i] ?? "?", x + 48, y + 48);
			}
			ctx.textBaseline = "alphabetic";
			if (state.phase === "input" && !paused) {
				ctx.textAlign = "center";
				ctx.font = "600 13px system-ui, sans-serif";
				ctx.fillStyle = THEME.textMuted;
				ctx.fillText("轮到你了", 112, 253);
			}
			if (state.phase === "over") drawOverlay(ctx, 224, 256, "游戏结束", `得分 ${state.score} · 按 R 重开`, THEME.bad);
			else if (paused) drawOverlay(ctx, 224, 256, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/simon/index.ts
		const START_DELAY_MS = 700;
		const ROUND_CLEAR_MS = 800;
		const PRESS_FLASH_MS = 180;
		function createSimonGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 224, 256);
			if (fit === null) throw new Error("dsh-minigames: simon needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createSimonState();
			let running = false;
			let lit = null;
			let stepTimer = 0;
			let stepAt = 0;
			let litOffTimer = 0;
			let litOffAt = 0;
			let stepRemaining = 0;
			let litRemaining = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const clearTimers = () => {
				clearTimeout(stepTimer);
				stepTimer = 0;
				clearTimeout(litOffTimer);
				litOffTimer = 0;
			};
			const lightPad = (pad, ms) => {
				lit = pad;
				loop.markDirty();
				clearTimeout(litOffTimer);
				litOffAt = performance.now() + ms;
				litOffTimer = window.setTimeout(() => {
					lit = null;
					litOffTimer = 0;
					loop.markDirty();
				}, ms);
			};
			/** Fire one flash step: light the current pad, advance, arm the next step. */
			const step = () => {
				const pad = state.sequence[state.showIndex];
				if (pad === void 0) return;
				lightPad(pad, 350);
				advanceShow(state);
				if (state.phase === "showing") scheduleStep(Math.max(50, flashInterval(state.round) - 350));
			};
			const scheduleStep = (delayMs) => {
				stepAt = performance.now() + delayMs;
				stepTimer = window.setTimeout(step, delayMs);
			};
			const inputPad = (pad) => {
				if (state.phase !== "input") return;
				lightPad(pad, PRESS_FLASH_MS);
				if (press(state, pad) === "round-clear") {
					reportScore();
					startRound(state);
					scheduleStep(ROUND_CLEAR_MS);
				}
				loop.markDirty();
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const pad = padAt((event.clientX - rect.left) * 224 / rect.width, (event.clientY - rect.top) * 256 / rect.height);
				if (pad !== null) inputPad(pad);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimers();
					stepRemaining = 0;
					litRemaining = 0;
					lit = null;
					state = createSimonState();
					lastScore = -1;
					reportScore();
					startRound(state);
					loop.markDirty();
					if (running) scheduleStep(START_DELAY_MS);
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				} else {
					const pad = PAD_KEYS.indexOf(event.code);
					if (pad !== -1) {
						event.preventDefault();
						if (running) inputPad(pad);
					}
				}
			};
			const loop = createFrameLoop((f) => {
				f.dt;
				if (f.render) renderSimon(ctx, state, lit, false);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				if (stepTimer !== 0) {
					clearTimeout(stepTimer);
					stepTimer = 0;
					stepRemaining = Math.max(0, stepAt - performance.now());
				}
				if (litOffTimer !== 0) {
					clearTimeout(litOffTimer);
					litOffTimer = 0;
					litRemaining = Math.max(0, litOffAt - performance.now());
				}
				loop.pause();
				renderSimon(ctx, state, lit, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (stepRemaining > 0) scheduleStep(stepRemaining);
				else if (state.phase === "showing" && stepTimer === 0) scheduleStep(START_DELAY_MS);
				stepRemaining = 0;
				if (lit !== null && litRemaining > 0) lightPad(lit, litRemaining);
				else if (lit !== null) lit = null;
				litRemaining = 0;
				loop.resume();
				loop.markDirty();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startRound(state);
			scheduleStep(START_DELAY_MS);
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimers();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const simonGame = {
			id: "simon",
			title: "Simon 记忆序列",
			icon: "🎵",
			description: "记住闪烁序列并复现，回合越往后越长越快。",
			controls: [
				"点击 / A S D F：按键",
				"R：重开",
				"P：暂停"
			],
			create: createSimonGame
		};
		/**
		* The 45 built-in levels, microban-style, ≤ 14x14, ordered by difficulty.
		* Levels 11-20 ramp through narrow corridors and goal rooms with forced
		* fill ordering (deepest goal first), up to 6 boxes; level 20 funnels six
		* boxes down a deep two-cell shaft into a wide goal row. Levels 21-30 are
		* the hard tier (6-8 boxes): goal-column parking order, left-edge shaft
		* rides, dual shafts into offset goal rows, split goal pockets, deep shafts
		* with a blocking box, side-chamber shuttles, a single-doorway two-room
		* shuttle, and a toothed divider column for the finale. Levels 31-45 are
		* the expert tier (6-7 boxes): side chambers that must clear before the
		* shaft, single-doorway three-room chains, goal rooms fed by one shared
		* shaft with a blocking box parked in the drop zone, and shafts of varying
		* depth whose blocker position forces strict push ordering. Every expert
		* level measures 97k-278k node expansions on the budgeted solver in the
		* unit tests (hard tier tops out near 290k on level 30).
		* Tiles: # wall, space floor, $ box, . goal, * box-on-goal, @ player,
		* + player-on-goal.
		*/
		const LEVELS$3 = [
			`
#####
#@$.#
#####
`,
			`
#######
#@  $.#
#######
`,
			`
#####
#@  #
# $ #
# . #
#####
`,
			`
######
#    #
# $$ #
# .. #
# @  #
######
`,
			`
######
#    #
# #@ #
# $* #
# .* #
#    #
######
`,
			`
#######
#     #
# .$. #
# $@$ #
#  $. #
#   . #
#######
`,
			`
#######
#     #
# # # #
# $ . #
# #@  #
# $ . #
#######
`,
			`
########
#      #
# .**$@#
#      #
#####  #
    ####
`,
			`
########
#      #
# $  . #
# @    #
# $  . #
#      #
########
`,
			`
#########
#       #
#  $ $  #
#  ###  #
# $  @  #
#  ...  #
#########
`,
			`
###########
#..########
#..########
#  ########
# $ $ $ $ #
#         #
##### #####
#         #
#    @    #
###########
`,
			`
##########
#        #
# $ $    #
#  $$    #
### ######
#        #
#..  @   #
#..      #
##########
`,
			`
############
#####      #
#     $ $  #
#     $ $  #
####  ######
####  ######
#  .....   #
#### #######
#### #######
## $ #######
## @ #######
############
`,
			`
###########
#####     #
#     $ $ #
#     $ $ #
##### #####
#         #
#      ...#
#      .  #
#####@#####
###########
`,
			`
#############
#     @     #
# $ $ $ $ $ #
### ##### ###
### ##### ###
#           #
#   .....   #
#############
`,
			`
#############
#     @     #
# $ $ $ $ $ #
####  #######
####  #######
#  ......   #
##### #######
#         $ #
#           #
#############
`,
			`
############
#    @     #
# $ $ $ $  #
## # #######
## # #######
# $ $  #####
#  #  ######
#  #  ######
# ......   #
############
`,
			`
##############
#     @      #
#  $$ $ $$$  #
#### #### ####
#### #### ####
#### #### ####
#### #### ####
#            #
#  ......    #
##############
`,
			`
#############
#     @     #
# $ $ $ $ $ #
##### # #####
##### # #####
#           #
#  .....    #
#############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#            #
#  ......    #
##############
`,
			`
############
#.#   #    #
#.# $ # $  #
#.# $ # $  #
#.#   #    #
#.# #####  #
#.#        #
#          #
#    $$    #
#     @    #
############
`,
			`
##########
#.#      #
#.#  $ $ #
#.#  $ $ #
#.#      #
#.#      #
#.  $ $  #
#   @    #
##########
`,
			`
##############
#            #
#  $ $ $     #
### ###### ###
#      ...   #
#      ...   #
### ###### ###
#  $ $ $     #
#      @     #
##############
`,
			`
##############
#     @      #
# $ $ $$ $   #
######  ######
######  ######
######  ######
######  ######
#    $       #
#  ......    #
##############
`,
			`
############
#.#   #    #
#.# $ # $  #
#.# $ # $  #
#.#   #    #
#.# #####  #
#.#        #
#     $$   #
#     @    #
############
`,
			`
##############
#     @      #
#  $$ $ $$$  #
#### #### ####
#### #### ####
#### #### ####
#### #### ####
#            #
#  ... ...   #
##############
`,
			`
##########
#   @    #
# $$$$$$ #
#        #
#        #
#### #####
# .    . #
#        #
#        #
#        #
#  ....  #
##########
`,
			`
############
#    @     #
# $ $ $ $  #
## # #######
## # #######
# $ $  #####
#  #$ ######
#  #  ######
# .......  #
############
`,
			`
############
#   ....   #
#   ....   #
#####  #####
#          #
#  $ $ $ $ #
#          #
###@########
# $ $ $ $  #
#          #
############
`,
			`
############
#.#   #    #
#.# $ # $  #
#.# $ # $  #
#.#   #    #
#.# #####  #
#.#  #     #
#     $$   #
#     @    #
############
`,
			`
############
#  @       #
# $ $ $ $  #
## # #######
## # #######
# $ $  #####
#  #$ ######
#  #  ######
#  ....... #
############
`,
			`
############
#    @     #
# $ $ $    #
####  ######
#          #
#  $ $ $   #
####  ######
#          #
#  ......  #
#          #
############
`,
			`
############
#    ....  #
#    ....  #
#####  #####
#          #
#  $ $ $ $ #
#          #
###@########
# $ $ $ $  #
#          #
############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#    $       #
# .......    #
##############
`,
			`
############
#    @     #
# $ $ $    #
####  ######
#          #
#  $ $ $   #
####  ######
#          #
#  ......  #
############
`,
			`
############
#  ....    #
#  ....    #
#####  #####
#          #
#  $ $ $ $ #
#          #
###@########
# $ $ $ $  #
#          #
############
`,
			`
############
#     .... #
#     .... #
#####  #####
#          #
#  $ $ $ $ #
#          #
###@########
# $ $ $ $  #
#          #
############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#      $     #
#  .......   #
##############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#        $   #
# .......    #
##############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
#     $      #
#  .......   #
##############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#     $      #
#  .......   #
##############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#       $    #
# .......    #
##############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
#     $      #
# .......    #
##############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
######  ######
#     $      #
#  .......   #
##############
`,
			`
##############
#     @      #
# $ $ $$ $ $ #
######  ######
######  ######
######  ######
######  ######
#   $        #
# .......    #
##############
`
		];
		/** Direction name -> (dr, dc). */
		const DIRS$2 = {
			up: [-1, 0],
			down: [1, 0],
			left: [0, -1],
			right: [0, 1]
		};
		/**
		* Parse level text into geometry + initial layout. Rows are padded to the
		* widest row; any non-wall character is walkable floor.
		* @param text - the level tiles.
		* @returns the parsed level.
		* @throws when the text has no rows, not exactly one player, or the box and
		*   goal counts differ.
		*/
		function parseLevel(text) {
			const lines = text.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.length > 0);
			if (lines.length === 0) throw new Error("sokoban: empty level");
			const rows = lines.length;
			const cols = Math.max(...lines.map((l) => l.length));
			const walls = [];
			const goals = [];
			const boxes = [];
			let player = null;
			for (let r = 0; r < rows; r += 1) {
				const w = [];
				const g = [];
				const b = [];
				for (let c = 0; c < cols; c += 1) {
					const ch = c < lines[r].length ? lines[r][c] : " ";
					w.push(ch === "#");
					g.push(ch === "." || ch === "*" || ch === "+");
					b.push(ch === "$" || ch === "*");
					if (ch === "@" || ch === "+") {
						if (player !== null) throw new Error("sokoban: multiple players");
						player = {
							r,
							c
						};
					}
				}
				walls.push(w);
				goals.push(g);
				boxes.push(b);
			}
			if (player === null) throw new Error("sokoban: no player");
			const boxCount = boxes.flat().filter(Boolean).length;
			const goalCount = goals.flat().filter(Boolean).length;
			if (boxCount !== goalCount || boxCount === 0) throw new Error(`sokoban: ${boxCount} boxes vs ${goalCount} goals`);
			return {
				rows,
				cols,
				walls,
				goals,
				boxes,
				player
			};
		}
		function inBounds$1(state, r, c) {
			return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
		}
		/** Whether every box sits on a goal cell. */
		function isCleared(state) {
			for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) if (state.boxes[r][c] && !state.goals[r][c]) return false;
			return true;
		}
		/** Reset the state to the given level's initial layout, keeping the score. */
		function loadLevel$1(state, levelIndex) {
			const level = parseLevel(LEVELS$3[levelIndex]);
			state.levelIndex = levelIndex;
			state.rows = level.rows;
			state.cols = level.cols;
			state.walls = level.walls;
			state.goals = level.goals;
			state.boxes = level.boxes.map((row) => [...row]);
			state.player = { ...level.player };
			state.moves = 0;
			state.entryScore = state.score;
			state.history = [];
			state.cleared = false;
		}
		/** Restart the current level (rolls the score back to the level entry). */
		function restartLevel$4(state) {
			state.score = state.entryScore;
			loadLevel$1(state, state.levelIndex);
		}
		/** localStorage key holding the highest level reached (1-based number). */
		const SOKOBAN_PROGRESS_KEY = "dsh-minigames-sokoban-progress";
		/**
		* Clamp a reached-level value into the valid 1..total range (non-finite or
		* non-positive input degrades to 1).
		* @param reached - raw stored or derived value.
		* @param total - number of built-in levels.
		* @returns the clamped 1-based reached level.
		*/
		function clampReached(reached, total) {
			if (!Number.isFinite(reached) || reached < 1) return 1;
			return Math.min(total, Math.trunc(reached));
		}
		/**
		* Progress after clearing a level: the reached value grows past it, never
		* shrinks.
		* @param level - the cleared level, 1-based.
		*/
		function nextReached(reached, level) {
			return Math.max(reached, level + 1);
		}
		/**
		* Session-only reached level used when localStorage is unavailable (sandboxed
		* iframe): progress then survives level jumps within the session only.
		*/
		let sessionReached = null;
		/**
		* Read the highest level reached, clamped to 1..total. Falls back to the
		* session-only copy when storage access throws.
		* @param total - number of built-in levels.
		*/
		function loadReached(total) {
			let raw = sessionReached;
			try {
				if (raw === null && typeof localStorage !== "undefined") {
					const parsed = Number(localStorage.getItem(SOKOBAN_PROGRESS_KEY));
					if (parsed >= 1) raw = parsed;
				}
			} catch (e) {}
			const reached = clampReached(raw ?? 1, total);
			sessionReached = reached;
			return reached;
		}
		/**
		* Persist the highest level reached (localStorage when available, plus the
		* session-only copy).
		*/
		function saveReached(reached) {
			sessionReached = reached;
			try {
				if (typeof localStorage !== "undefined") localStorage.setItem(SOKOBAN_PROGRESS_KEY, String(reached));
			} catch (e) {}
		}
		/**
		* A fresh state on the given level.
		* @param levelIndex - built-in level to load (0-based).
		* @param score - score carried in from previous levels.
		*/
		function createSokobanState(levelIndex = 0, score = 0) {
			const state = {
				levelIndex: 0,
				rows: 0,
				cols: 0,
				walls: [],
				goals: [],
				boxes: [],
				player: {
					r: 0,
					c: 0
				},
				moves: 0,
				score,
				entryScore: score,
				history: [],
				cleared: false
			};
			loadLevel$1(state, levelIndex);
			return state;
		}
		/**
		* Try to move the player one cell in `dir` (up/down/left/right), pushing a
		* single box when the target cell holds one and the cell beyond it is free
		* (floor or goal). Updates moves/score/history/cleared on success.
		* @returns the applied move, or null when blocked (wall, box-into-wall,
		*   box-into-box) or the level is already cleared.
		*/
		function applyMove$3(state, dir) {
			if (state.cleared) return null;
			const [dr, dc] = DIRS$2[dir];
			const from = state.player;
			const tr = from.r + dr;
			const tc = from.c + dc;
			if (!inBounds$1(state, tr, tc) || state.walls[tr][tc]) return null;
			const move = {
				playerFrom: { ...from },
				playerTo: {
					r: tr,
					c: tc
				},
				boxFrom: null,
				boxTo: null,
				scored: false,
				cleared: false
			};
			if (state.boxes[tr][tc]) {
				const br = tr + dr;
				const bc = tc + dc;
				if (!inBounds$1(state, br, bc) || state.walls[br][bc] || state.boxes[br][bc]) return null;
				state.boxes[tr][tc] = false;
				state.boxes[br][bc] = true;
				move.boxFrom = {
					r: tr,
					c: tc
				};
				move.boxTo = {
					r: br,
					c: bc
				};
				if (state.goals[br][bc]) {
					move.scored = true;
					state.score += 100;
				}
			}
			state.player = {
				r: tr,
				c: tc
			};
			state.moves += 1;
			if (isCleared(state)) {
				move.cleared = true;
				state.cleared = true;
				state.score += 500;
			}
			state.history.push(move);
			return move;
		}
		/**
		* Undo the last move: restore the player, the pushed box, the move count,
		* the score, and the cleared flag exactly.
		* @returns the undone move, or null when there is nothing to undo.
		*/
		function undoMove(state) {
			const move = state.history.pop();
			if (move === void 0) return null;
			if (move.boxTo !== null && move.boxFrom !== null) {
				state.boxes[move.boxTo.r][move.boxTo.c] = false;
				state.boxes[move.boxFrom.r][move.boxFrom.c] = true;
				if (move.scored) state.score -= 100;
			}
			if (move.cleared) {
				state.cleared = false;
				state.score -= 500;
			}
			state.player = { ...move.playerFrom };
			state.moves -= 1;
			return move;
		}
		/** Fixed logical canvas sized to the largest built-in level; smaller levels center. */
		const MAX_ROWS$1 = Math.max(...LEVELS$3.map((t) => t.split("\n").filter((l) => l.trim().length > 0).length));
		const MAX_COLS$1 = Math.max(...LEVELS$3.map((t) => Math.max(...t.split("\n").filter((l) => l.trim().length > 0).map((l) => l.length))));
		const LOGICAL_W$22 = MAX_COLS$1 * 48;
		const LOGICAL_H$19 = 44 + MAX_ROWS$1 * 48;
		const BOX_ACCENT = accent(1);
		const PLAYER_ACCENT$1 = accent(0);
		const particles$9 = createParticles();
		let prevCleared = false;
		let prevFrameMs$2 = 0;
		function gridOffsets(state) {
			return {
				ox: (MAX_COLS$1 - state.cols) / 2 * 48,
				oy: 44 + (MAX_ROWS$1 - state.rows) / 2 * 48
			};
		}
		/** Draw one brick-style wall cell: panel fill with an edge stroke. */
		function drawWall(ctx, x, y) {
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(x, y, 48, 48);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 2;
			ctx.strokeRect(x + 1, y + 1, 46, 46);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(x + 3, y + 24 + .5);
			ctx.lineTo(x + 48 - 3, y + 24 + .5);
			ctx.stroke();
		}
		/** Draw a goal cell as a glowing rounded outline. */
		function drawGoal(ctx, cx, cy) {
			const size = 26;
			ctx.strokeStyle = THEME.gold;
			ctx.lineWidth = 2;
			glow(ctx, THEME.gold, 8);
			roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, 6);
			ctx.stroke();
			noGlow(ctx);
		}
		/** Draw a glowing rounded box; green glow when it sits on a goal. */
		function drawBox(ctx, cx, cy, onGoal) {
			const color = onGoal ? THEME.good : BOX_ACCENT;
			const size = 36;
			glow(ctx, color, onGoal ? 14 : 8);
			ctx.fillStyle = color;
			roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, 8);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = "rgba(13,13,20,0.5)";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(cx - size / 4, cy);
			ctx.lineTo(cx + size / 4, cy);
			ctx.stroke();
		}
		/** Draw the player as a glowing rounded figure (body + head). */
		function drawPlayer(ctx, cx, cy) {
			const bodyW = 26;
			const bodyH = 18;
			glow(ctx, PLAYER_ACCENT$1, 12);
			ctx.fillStyle = PLAYER_ACCENT$1;
			roundRectPath(ctx, cx - bodyW / 2, cy - bodyH / 2 + 4, bodyW, bodyH, 7);
			ctx.fill();
			noGlow(ctx);
			glow(ctx, PLAYER_ACCENT$1, 8);
			ctx.beginPath();
			ctx.arc(cx, cy - bodyH / 2 + 2, 7, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
		}
		/** Draw one frame. `push` positions interpolate to their target. */
		function renderSokoban(ctx, state, view) {
			const now = typeof performance !== "undefined" ? performance.now() : 0;
			const dtMs = prevFrameMs$2 === 0 ? 16 : Math.min(64, now - prevFrameMs$2);
			prevFrameMs$2 = now;
			drawBackground(ctx, LOGICAL_W$22, LOGICAL_H$19);
			hudPair(ctx, 12, 18, "关卡 ", `${state.levelIndex + 1}/${view.totalLevels}`);
			hudPair(ctx, 130, 18, "步数 ", String(state.moves));
			hudPair(ctx, LOGICAL_W$22 - 12, 18, "得分 ", String(state.score), "right");
			ctx.fillStyle = THEME.textMuted;
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("方向键/WASD 移动 · Z 撤销 · R 重开 · [ ] 跳关", 12, 36);
			ctx.textAlign = "right";
			ctx.fillText(`${state.levelIndex + 1}/${view.totalLevels} · 已解锁 1–${view.unlockedThrough}`, LOGICAL_W$22 - 12, 36);
			const { ox, oy } = gridOffsets(state);
			const animating = view.push !== null;
			const skip = /* @__PURE__ */ new Set();
			if (animating) {
				skip.add(`${view.push.playerTo.r},${view.push.playerTo.c}`);
				if (view.push.boxTo !== null) skip.add(`${view.push.boxTo.r},${view.push.boxTo.c}`);
			}
			for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
				const x = ox + c * 48;
				const y = oy + r * 48;
				if (state.walls[r][c]) {
					drawWall(ctx, x, y);
					continue;
				}
				ctx.fillStyle = "rgba(255,255,255,0.025)";
				ctx.fillRect(x, y, 48, 48);
				if (state.goals[r][c]) drawGoal(ctx, x + 24, y + 24);
			}
			for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
				if (!state.boxes[r][c] || skip.has(`${r},${c}`)) continue;
				drawBox(ctx, ox + c * 48 + 24, oy + r * 48 + 24, state.goals[r][c]);
			}
			if (!animating) drawPlayer(ctx, ox + state.player.c * 48 + 24, oy + state.player.r * 48 + 24);
			else {
				const k = view.push.t;
				const px = ox + state.player.c * 48 + 24;
				const py = oy + state.player.r * 48 + 24;
				const step = 48 * (1 - k);
				const dx = view.push.playerTo.c === state.player.c ? 0 : view.push.playerTo.c < state.player.c ? step : -step;
				const dy = view.push.playerTo.r === state.player.r ? 0 : view.push.playerTo.r < state.player.r ? step : -step;
				drawPlayer(ctx, px + dx, py + dy);
				if (view.push.boxTo !== null) {
					const bt = view.push.boxTo;
					const bx = ox + bt.c * 48 + 24;
					const by = oy + bt.r * 48 + 24;
					const bdx = bt.c === state.player.c ? 0 : bt.c < state.player.c ? step : -step;
					const bdy = bt.r === state.player.r ? 0 : bt.r < state.player.r ? step : -step;
					drawBox(ctx, bx + bdx, by + bdy, state.goals[bt.r][bt.c]);
				}
			}
			if (!state.cleared) prevCleared = false;
			if (state.cleared && !prevCleared) particles$9.burst(ox + state.player.c * 48 + 24, oy + state.player.r * 48 + 24, THEME.gold, 26, 180);
			prevCleared = state.cleared;
			particles$9.tick(ctx, dtMs);
			if (view.won) drawOverlay(ctx, LOGICAL_W$22, LOGICAL_H$19, "全部通关", `总分 ${state.score} · 按 R 重新开始`, THEME.gold);
			else if (state.cleared) drawOverlay(ctx, LOGICAL_W$22, LOGICAL_H$19, "过关", "按 N 或稍后进入下一关", THEME.good);
			else if (view.paused) drawOverlay(ctx, LOGICAL_W$22, LOGICAL_H$19, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/sokoban/index.ts
		const PUSH_MS = 110;
		const AUTO_ADVANCE_MS$1 = 1500;
		/** The direction each key maps to. */
		const KEY_DIR$1 = {
			ArrowUp: "up",
			ArrowDown: "down",
			ArrowLeft: "left",
			ArrowRight: "right",
			KeyW: "up",
			KeyS: "down",
			KeyA: "left",
			KeyD: "right"
		};
		function createSokobanGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$22, LOGICAL_H$19);
			if (fit === null) throw new Error("dsh-minigames: sokoban needs a 2d canvas context");
			const ctx = fit.ctx;
			let reached = loadReached(LEVELS$3.length);
			let state = createSokobanState(reached - 1);
			let running = false;
			let raf = 0;
			let last = 0;
			let lastScore = -1;
			let won = false;
			let pushMove = null;
			let pushT = 0;
			let autoMs = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const tryMove = (dir) => {
				if (state.cleared || pushMove !== null) return;
				const move = applyMove$3(state, dir);
				if (move === null) return;
				pushMove = move;
				pushT = 0;
				if (move.cleared) {
					autoMs = 0;
					reached = nextReached(reached, state.levelIndex + 1);
					saveReached(reached);
				}
			};
			/** Jump to another unlocked level (fresh load; score carries over). */
			const jumpLevel = (target) => {
				if (target < 0 || target > reached - 1 || target >= LEVELS$3.length) return;
				loadLevel$1(state, target);
				won = false;
				pushMove = null;
				pushT = 0;
				autoMs = -1;
				reportScore();
			};
			const nextLevel = () => {
				if (!state.cleared) return;
				if (state.levelIndex + 1 >= LEVELS$3.length) {
					won = true;
					reportScore();
					return;
				}
				loadLevel$1(state, state.levelIndex + 1);
				pushMove = null;
				pushT = 0;
				autoMs = -1;
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					if (won) {
						state = createSokobanState();
						won = false;
					} else restartLevel$4(state);
					pushMove = null;
					pushT = 0;
					autoMs = -1;
					reportScore();
					return;
				}
				if (event.code === "BracketLeft" || event.code === "BracketRight") {
					event.preventDefault();
					jumpLevel(state.levelIndex + (event.code === "BracketRight" ? 1 : -1));
					return;
				}
				if (!running) return;
				if (event.code === "KeyN") {
					event.preventDefault();
					nextLevel();
					return;
				}
				if (event.code === "KeyZ") {
					event.preventDefault();
					if (state.cleared || pushMove !== null) return;
					undoMove(state);
					reportScore();
					return;
				}
				const dir = KEY_DIR$1[event.code];
				if (dir === void 0) return;
				event.preventDefault();
				tryMove(dir);
			};
			const advance = (dt) => {
				if (pushMove !== null) {
					pushT += dt * 1e3;
					if (pushT >= PUSH_MS) {
						pushMove = null;
						pushT = 0;
						reportScore();
					}
				}
				if (state.cleared && !won && state.levelIndex + 1 < LEVELS$3.length && autoMs >= 0) {
					autoMs += dt * 1e3;
					if (autoMs >= AUTO_ADVANCE_MS$1) nextLevel();
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				advance(dt);
				const view = {
					totalLevels: LEVELS$3.length,
					unlockedThrough: Math.min(reached, LEVELS$3.length),
					won,
					paused: false,
					push: pushMove !== null ? {
						playerTo: pushMove.playerTo,
						boxTo: pushMove.boxTo,
						t: Math.min(1, pushT / PUSH_MS)
					} : null
				};
				renderSokoban(ctx, state, view);
			};
			const startLoop = () => {
				if (raf !== 0) return;
				last = performance.now();
				raf = requestAnimationFrame(frame);
			};
			const stopLoop = () => {
				cancelAnimationFrame(raf);
				raf = 0;
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				stopLoop();
				renderSokoban(ctx, state, {
					totalLevels: LEVELS$3.length,
					unlockedThrough: Math.min(reached, LEVELS$3.length),
					won,
					paused: true,
					push: null
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderSokoban(ctx, state, {
				totalLevels: LEVELS$3.length,
				unlockedThrough: Math.min(reached, LEVELS$3.length),
				won,
				paused: false,
				push: null
			});
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const sokobanGame = {
			id: "sokoban",
			title: "推箱子",
			icon: "📦",
			description: "经典推箱子（Sokoban）：把所有箱子推到目标点上，30 个关卡，支持撤销。",
			controls: [
				"方向键 / WASD：移动推箱",
				"Z：撤销 · R：重开",
				"N：下一关 · [ / ]：跳关（已解锁范围内）",
				"P：暂停"
			],
			create: createSokobanGame
		};
		/** Collision/spawn radii per rock size. */
		const ROCK_RADIUS = {
			large: 40,
			medium: 22,
			small: 12
		};
		/** Score awarded for shooting a rock of each size. */
		const ROCK_SCORE = {
			large: 20,
			medium: 50,
			small: 100
		};
		const VERT_COUNT = 10;
		const ROT_SPEED = 3.8;
		const THRUST = 340;
		const DAMPING_PER_FRAME = .99;
		const FRAME_MS = 1e3 / 60;
		const MAX_SPEED$3 = 480;
		const START_LIVES$2 = 3;
		const SHIP_HIT_RADIUS = 11;
		const BULLET_SPEED = 540;
		const BULLET_LIFE = 1100;
		const RESPAWN_INVULN = 2e3;
		const WAVE_DELAY = 1500;
		/** Rocks never spawn within this radius of the ship's respawn point (center). */
		const SPAWN_SAFE_RADIUS = 200;
		function wrapX(x) {
			return (x % 960 + 960) % 960;
		}
		function wrapY(y) {
			return (y % 600 + 600) % 600;
		}
		/** Shortest signed delta from a to b on a wrapping axis of length size. */
		function wrapDelta(a, b, size) {
			let d = b - a;
			if (d > size / 2) d -= size;
			else if (d < -size / 2) d += size;
			return d;
		}
		/** Wrap-aware squared distance between two points. */
		function wrapDist2(ax, ay, bx, by) {
			const dx = wrapDelta(ax, bx, 960);
			const dy = wrapDelta(ay, by, 600);
			return dx * dx + dy * dy;
		}
		function makeRock(size, x, y, vx, vy, rng) {
			const verts = [];
			for (let i = 0; i < VERT_COUNT; i += 1) verts.push(.72 + rng() * .56);
			return {
				x,
				y,
				vx,
				vy,
				size,
				angle: rng() * Math.PI * 2,
				spin: (rng() * 2 - 1) * 1.4,
				verts
			};
		}
		/** One drifting rock at a random position outside the spawn-safe radius. */
		function spawnRock(state, size) {
			let x = 480;
			let y = 0;
			for (let i = 0; i < 40; i += 1) {
				x = state.rng() * 960;
				y = state.rng() * 600;
				const dx = x - 480;
				const dy = y - 300;
				if (Math.hypot(dx, dy) > SPAWN_SAFE_RADIUS) break;
			}
			const angle = state.rng() * Math.PI * 2;
			const speed = 24 + state.rng() * 30;
			state.rocks.push(makeRock(size, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, state.rng));
		}
		/** Replace the wave field: 2 + N large rocks for wave N. */
		function spawnWave$1(state) {
			const count = 2 + state.wave;
			for (let i = 0; i < count; i += 1) spawnRock(state, "large");
		}
		/** A fresh world at wave 1 with the ship centered. */
		function createAsteroids(rng = Math.random) {
			const state = {
				ship: {
					x: 480,
					y: 300,
					vx: 0,
					vy: 0,
					angle: 0,
					thrusting: false
				},
				rocks: [],
				bullets: [],
				events: [],
				score: 0,
				wave: 1,
				lives: START_LIVES$2,
				result: "none",
				fireCooldown: 0,
				invuln: RESPAWN_INVULN,
				waveClearTimer: null,
				t: 0,
				rng
			};
			spawnWave$1(state);
			return state;
		}
		/**
		* Destroy `index`'s rock: award score, record a destruction event, and split
		* large/medium rocks into two faster children deflected sideways.
		*/
		function destroyRock(state, index, awardScore) {
			const rock = state.rocks[index];
			state.rocks.splice(index, 1);
			if (awardScore) state.score += ROCK_SCORE[rock.size];
			state.events.push({
				x: rock.x,
				y: rock.y,
				size: rock.size
			});
			if (rock.size === "small") return;
			const childSize = rock.size === "large" ? "medium" : "small";
			const speed = Math.hypot(rock.vx, rock.vy) * 1.35 + 18;
			const heading = Math.atan2(rock.vy, rock.vx);
			for (const deflect of [-.9, .9]) {
				const a = heading + deflect;
				state.rocks.push(makeRock(childSize, rock.x, rock.y, Math.cos(a) * speed, Math.sin(a) * speed, state.rng));
			}
		}
		/** Respawn at the center with a fresh invulnerability window. */
		function respawnShip(state) {
			state.ship.x = 480;
			state.ship.y = 300;
			state.ship.vx = 0;
			state.ship.vy = 0;
			state.ship.angle = 0;
			state.invuln = RESPAWN_INVULN;
		}
		/**
		* Advance the world by dt milliseconds under the player's held inputs.
		* @param state - the world (mutated in place).
		* @param dt - elapsed milliseconds (clamp upstream; large steps blur physics).
		* @param input - player held keys this step.
		*/
		function updateAsteroids(state, dt, input) {
			if (state.result !== "none") return;
			const dtSec = dt / 1e3;
			state.t += dt;
			state.events = [];
			const ship = state.ship;
			if (input.left) ship.angle -= ROT_SPEED * dtSec;
			if (input.right) ship.angle += ROT_SPEED * dtSec;
			ship.thrusting = input.thrust;
			if (input.thrust) {
				ship.vx += Math.sin(ship.angle) * THRUST * dtSec;
				ship.vy -= Math.cos(ship.angle) * THRUST * dtSec;
				const speed = Math.hypot(ship.vx, ship.vy);
				if (speed > MAX_SPEED$3) {
					ship.vx = ship.vx / speed * MAX_SPEED$3;
					ship.vy = ship.vy / speed * MAX_SPEED$3;
				}
			}
			const damp = Math.pow(DAMPING_PER_FRAME, dt / FRAME_MS);
			ship.vx *= damp;
			ship.vy *= damp;
			ship.x = wrapX(ship.x + ship.vx * dtSec);
			ship.y = wrapY(ship.y + ship.vy * dtSec);
			state.fireCooldown = Math.max(0, state.fireCooldown - dt);
			state.invuln = Math.max(0, state.invuln - dt);
			if (input.fire && state.fireCooldown <= 0 && state.bullets.length < 8) {
				const nose = 17;
				state.bullets.push({
					x: wrapX(ship.x + Math.sin(ship.angle) * nose),
					y: wrapY(ship.y - Math.cos(ship.angle) * nose),
					vx: ship.vx + Math.sin(ship.angle) * BULLET_SPEED,
					vy: ship.vy - Math.cos(ship.angle) * BULLET_SPEED,
					life: BULLET_LIFE
				});
				state.fireCooldown = 180;
				state.score = Math.max(0, state.score - 1);
			}
			const aliveBullets = [];
			for (const bullet of state.bullets) {
				bullet.life -= dt;
				if (bullet.life <= 0) continue;
				bullet.x = wrapX(bullet.x + bullet.vx * dtSec);
				bullet.y = wrapY(bullet.y + bullet.vy * dtSec);
				aliveBullets.push(bullet);
			}
			state.bullets = aliveBullets;
			for (const rock of state.rocks) {
				rock.x = wrapX(rock.x + rock.vx * dtSec);
				rock.y = wrapY(rock.y + rock.vy * dtSec);
				rock.angle += rock.spin * dtSec;
			}
			const liveBullets = [];
			for (const bullet of state.bullets) {
				let dead = false;
				for (let i = 0; i < state.rocks.length; i += 1) {
					const rock = state.rocks[i];
					const r = ROCK_RADIUS[rock.size];
					if (wrapDist2(bullet.x, bullet.y, rock.x, rock.y) < r * r) {
						destroyRock(state, i, true);
						dead = true;
						break;
					}
				}
				if (!dead) liveBullets.push(bullet);
			}
			state.bullets = liveBullets;
			if (state.invuln <= 0) for (let i = 0; i < state.rocks.length; i += 1) {
				const rock = state.rocks[i];
				const r = ROCK_RADIUS[rock.size] + SHIP_HIT_RADIUS;
				if (wrapDist2(ship.x, ship.y, rock.x, rock.y) < r * r) {
					destroyRock(state, i, false);
					state.lives -= 1;
					if (state.lives <= 0) {
						state.result = "lose";
						return;
					}
					respawnShip(state);
					break;
				}
			}
			if (state.rocks.length === 0) {
				if (state.waveClearTimer === null) state.waveClearTimer = WAVE_DELAY;
				state.waveClearTimer -= dt;
				if (state.waveClearTimer <= 0) {
					state.wave += 1;
					state.waveClearTimer = null;
					spawnWave$1(state);
				}
			} else state.waveClearTimer = null;
		}
		//#endregion
		//#region src/client/games/asteroids/render.ts
		/**
		* Asteroids canvas renderer on the shared theme kit: gradient void, glowing
		* stroked rock polygons (accent by size), glowing ship triangle with thrust
		* flame, bullet dots, particle bursts observed from the logic-provided
		* destruction events, a hudPair HUD, and the themed game-over overlay.
		*/
		const AST_W = 960;
		const AST_H = 600;
		const SHIP_COLOR = accent(0);
		const BULLET_COLOR = THEME.gold;
		const ROCK_COLOR = {
			large: accent(4),
			medium: accent(3),
			small: accent(7)
		};
		const particles$8 = createParticles();
		let lastT = -1;
		let lastFrame$3 = 0;
		function drawRock(ctx, rock) {
			const color = ROCK_COLOR[rock.size];
			const radius = ROCK_RADIUS[rock.size];
			ctx.save();
			ctx.translate(rock.x, rock.y);
			ctx.rotate(rock.angle);
			glow(ctx, color, 12);
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			ctx.beginPath();
			const step = Math.PI * 2 / rock.verts.length;
			for (let i = 0; i < rock.verts.length; i += 1) {
				const a = i * step;
				const r = radius * rock.verts[i];
				const x = Math.cos(a) * r;
				const y = Math.sin(a) * r;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.stroke();
			noGlow(ctx);
			ctx.restore();
		}
		function drawShip(ctx, state) {
			const ship = state.ship;
			if (state.invuln > 0 && Math.floor(state.t / 110) % 2 === 0) return;
			ctx.save();
			ctx.translate(ship.x, ship.y);
			ctx.rotate(ship.angle);
			glow(ctx, SHIP_COLOR, 14);
			ctx.strokeStyle = SHIP_COLOR;
			ctx.lineWidth = 2.5;
			ctx.beginPath();
			ctx.moveTo(0, -16);
			ctx.lineTo(-11, 12);
			ctx.lineTo(0, 6);
			ctx.lineTo(11, 12);
			ctx.closePath();
			ctx.stroke();
			if (ship.thrusting) {
				glow(ctx, accent(0), 10);
				ctx.strokeStyle = accent(0);
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(-6, 12);
				ctx.lineTo(0, 20 + Math.sin(state.t / 40) * 4);
				ctx.lineTo(6, 12);
				ctx.stroke();
			}
			noGlow(ctx);
			ctx.restore();
		}
		function drawBullet(ctx, x, y) {
			glow(ctx, BULLET_COLOR, 10);
			ctx.fillStyle = BULLET_COLOR;
			ctx.beginPath();
			ctx.arc(x, y, 2.5, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
		}
		/** Draw one frame of the asteroid field; `paused` veils the scene. */
		function renderAsteroids(ctx, state, paused) {
			ctx.clearRect(0, 0, 960, 600);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$3 === 0 ? 16 : now - lastFrame$3);
			lastFrame$3 = now;
			drawBackground(ctx, 960, 600);
			if (state.t !== lastT) {
				for (const event of state.events) particles$8.burst(event.x, event.y, ROCK_COLOR[event.size], event.size === "small" ? 10 : 16, 140);
				lastT = state.t;
			}
			particles$8.tick(ctx, dt);
			for (const rock of state.rocks) drawRock(ctx, rock);
			for (const bullet of state.bullets) drawBullet(ctx, bullet.x, bullet.y);
			if (state.result === "none") drawShip(ctx, state);
			hudPair(ctx, 8, 16, "波次 ", String(state.wave));
			hudPair(ctx, 8, 32, "生命 ", "♥".repeat(Math.max(0, state.lives)), "left", THEME.bad);
			hudPair(ctx, 8, 48, "得分 ", String(state.score), "left", THEME.gold);
			if (state.result === "lose") drawOverlay(ctx, 960, 600, "GAME OVER", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
			else if (paused) drawOverlay(ctx, 960, 600, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/asteroids/index.ts
		function createAsteroidsGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, AST_W, AST_H);
			if (fit === null) throw new Error("dsh-minigames: asteroids needs a 2d canvas context");
			const ctx = fit.ctx;
			let world = createAsteroids();
			let running = false;
			let lastScore = -1;
			const input = {
				left: false,
				right: false,
				thrust: false,
				fire: false
			};
			const reportScore = () => {
				if (world.score === lastScore) return;
				lastScore = world.score;
				options?.onScore?.(world.score);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				switch (event.code) {
					case "ArrowLeft":
					case "KeyA":
						event.preventDefault();
						input.left = true;
						break;
					case "ArrowRight":
					case "KeyD":
						event.preventDefault();
						input.right = true;
						break;
					case "ArrowUp":
					case "KeyW":
						event.preventDefault();
						input.thrust = true;
						break;
					case "Space":
						event.preventDefault();
						input.fire = true;
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
						break;
					case "KeyR": if (world.result !== "none") reset();
				}
			};
			const onKeyUp = (event) => {
				switch (event.code) {
					case "ArrowLeft":
					case "KeyA":
						input.left = false;
						break;
					case "ArrowRight":
					case "KeyD":
						input.right = false;
						break;
					case "ArrowUp":
					case "KeyW":
						input.thrust = false;
						break;
					case "Space": input.fire = false;
				}
			};
			const frame = (f) => {
				if (!running) return;
				updateAsteroids(world, f.dt * 1e3, input);
				reportScore();
				if (f.render) renderAsteroids(ctx, world, false);
			};
			const loop = createFrameLoop(frame);
			const reset = () => {
				world = createAsteroids();
				lastScore = -1;
				input.left = input.right = input.thrust = input.fire = false;
				reportScore();
				loop.markDirty();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderAsteroids(ctx, world, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			renderAsteroids(ctx, world, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
				}
			};
		}
		const asteroidsGame = {
			id: "asteroids",
			title: "小行星",
			icon: "☄️",
			description: "矢量小行星：惯性驾驶飞船，击碎岩石群，一波接一波地生存下去。每开一炮 -1 分，瞄准则生。",
			controls: [
				"A/D 或 ←/→：旋转",
				"W 或 ↑：推进",
				"空格：开火（每发 -1 分）",
				"P：暂停",
				"R：重开"
			],
			create: createAsteroidsGame
		};
		//#endregion
		//#region src/client/games/pipes/logic.ts
		/**
		* 接水管 (Pipes) pure logic: solvable level generation (a random
		* source-to-sink path is laid first, the rest is random filler, then
		* rotations are scrambled while a known-good config is kept), tile
		* rotation, water connectivity BFS, and win/timeout state. Deterministic
		* given an injected rng; no DOM, no timers.
		*/
		/** Directions: 0 up, 1 right, 2 down, 3 left. */
		const DR = [
			-1,
			0,
			1,
			0
		];
		const DC = [
			0,
			1,
			0,
			-1
		];
		/** Base opening bitmasks (bit d = opening toward direction d). */
		const BASE_MASK = {
			straight: 5,
			elbow: 3,
			tee: 7,
			cross: 15,
			source: 2,
			sink: 8
		};
		/**
		* The opening bitmask of a tile: each base opening rotated by `rotation`
		* quarter turns clockwise.
		*/
		function openings(tile) {
			let mask = 0;
			const base = BASE_MASK[tile.type];
			for (let d = 0; d < 4; d += 1) if ((base & 1 << d) !== 0) mask |= 1 << (d + tile.rotation) % 4;
			return mask;
		}
		/** Whether the tile opens toward direction `d`. */
		function hasOpening(tile, d) {
			return (openings(tile) & 1 << d) !== 0;
		}
		/** Board size for a level: starts at 5, +1 every 3 levels, capped at 8. */
		function levelSize$3(level) {
			return Math.min(8, 5 + Math.floor((level - 1) / 3));
		}
		/**
		* Randomized DFS for a simple (self-avoiding) path between two cells; the
		* grid is connected so a path always exists.
		*/
		function dfsPath(size, from, to, rng, visited, path) {
			path.push(from);
			visited[from.r][from.c] = true;
			if (from.r === to.r && from.c === to.c) return true;
			const order = [
				0,
				1,
				2,
				3
			].map((d) => ({
				d,
				k: rng()
			})).sort((a, b) => a.k - b.k).map((e) => e.d);
			for (const d of order) {
				const r = from.r + DR[d];
				const c = from.c + DC[d];
				if (r < 0 || r >= size || c < 0 || c >= size || visited[r][c]) continue;
				if (dfsPath(size, {
					r,
					c
				}, to, rng, visited, path)) return true;
			}
			path.pop();
			visited[from.r][from.c] = false;
			return false;
		}
		/** The rotation r (0..3) that gives `type` the opening set `mask`. */
		function rotationFor(type, mask) {
			for (let r = 0; r < 4; r += 1) if (openings({
				type,
				rotation: r
			}) === mask) return r;
			return 0;
		}
		/** A tile placed so it opens exactly toward both path neighbours. */
		function tileForDirs(d1, d2) {
			const mask = 1 << d1 | 1 << d2;
			const type = mask === 5 || mask === 10 ? "straight" : "elbow";
			return {
				type,
				rotation: rotationFor(type, mask)
			};
		}
		/** Random filler tile: weighted pipes with a random rotation (cross fixed). */
		function fillerTile(rng) {
			const roll = rng();
			const type = roll < .35 ? "straight" : roll < .8 ? "elbow" : roll < .95 ? "tee" : "cross";
			return {
				type,
				rotation: type === "cross" ? 0 : Math.floor(rng() * 4)
			};
		}
		/**
		* Generate a solvable board: one source tile on the left edge and one sink
		* tile on the right edge, a random simple path of straights/elbows between
		* them (the tracked solution), random filler elsewhere, then scrambled
		* rotations that leave at least one known-good config (applying `solution`
		* always wins).
		* @param size - board dimension (size x size).
		* @param rng - injected random source for determinism.
		*/
		function generateLevel(size, rng) {
			const source = {
				r: Math.floor(rng() * size),
				c: 0
			};
			let sink = {
				r: Math.floor(rng() * size),
				c: size - 1
			};
			while (sink.r === source.r) sink = {
				r: Math.floor(rng() * size),
				c: size - 1
			};
			const visited = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
			const path = [];
			dfsPath(size, source, sink, rng, visited, path);
			const tiles = Array.from({ length: size }, () => Array.from({ length: size }, () => ({
				type: "straight",
				rotation: 0
			})));
			const at = (cell) => tiles[cell.r][cell.c];
			const sourceDir = path[1].c === source.c ? path[1].r < source.r ? 0 : 2 : 1;
			const sinkDir = path[path.length - 2].c === sink.c ? path[path.length - 2].r < sink.r ? 0 : 2 : 3;
			at(source).type = "source";
			at(source).rotation = rotationFor("source", 1 << sourceDir);
			at(sink).type = "sink";
			at(sink).rotation = rotationFor("sink", 1 << sinkDir);
			for (let i = 1; i < path.length - 1; i += 1) {
				const prev = path[i - 1];
				const next = path[i + 1];
				const cell = path[i];
				const d1 = prev.r === cell.r ? prev.c < cell.c ? 3 : 1 : prev.r < cell.r ? 0 : 2;
				const d2 = next.r === cell.r ? next.c < cell.c ? 3 : 1 : next.r < cell.r ? 0 : 2;
				tiles[cell.r][cell.c] = tileForDirs(d1, d2);
			}
			const onPath = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
			for (const cell of path) onPath[cell.r][cell.c] = true;
			for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (!onPath[r][c]) tiles[r][c] = fillerTile(rng);
			const solution = tiles.map((row) => row.map((t) => t.rotation));
			for (let attempt = 0; attempt < 64; attempt += 1) {
				for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) {
					const tile = tiles[r][c];
					if (tile.type === "source" || tile.type === "sink" || tile.type === "cross") continue;
					tile.rotation = Math.floor(rng() * 4);
				}
				if (!levelConnected(tiles, size, source, sink)) break;
			}
			return {
				size,
				tiles,
				source,
				sink,
				solution
			};
		}
		/**
		* BFS from the source through matching pipe openings; a cell is water-filled
		* when reached. The sink being reached is the win.
		*/
		function connectedCells(tiles, size, source) {
			const reached = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
			const queue = [source];
			reached[source.r][source.c] = true;
			while (queue.length > 0) {
				const cell = queue.shift();
				for (let d = 0; d < 4; d += 1) {
					if (!hasOpening(tiles[cell.r][cell.c], d)) continue;
					const r = cell.r + DR[d];
					const c = cell.c + DC[d];
					if (r < 0 || r >= size || c < 0 || c >= size || reached[r][c]) continue;
					if (!hasOpening(tiles[r][c], (d + 2) % 4)) continue;
					reached[r][c] = true;
					queue.push({
						r,
						c
					});
				}
			}
			return reached;
		}
		/** Whether the sink is water-filled on the given tiles. */
		function levelConnected(tiles, size, source, sink) {
			return connectedCells(tiles, size, source)[sink.r][sink.c];
		}
		/**
		* Rotate a tile one quarter turn clockwise. No-op outside 'playing', on the
		* fixed tiles (source/sink/cross), or out of bounds.
		* @returns true when a rotation was applied.
		*/
		function rotateTile(state, r, c) {
			if (state.status !== "playing") return false;
			if (r < 0 || r >= state.board.size || c < 0 || c >= state.board.size) return false;
			const tile = state.board.tiles[r][c];
			if (tile.type === "source" || tile.type === "sink" || tile.type === "cross") return false;
			tile.rotation = (tile.rotation + 1) % 4;
			return true;
		}
		/**
		* Check for a win after a rotation: when water reaches the sink, mark the
		* level won and award {@link WIN_SCORE}.
		* @returns true on the playing→won transition.
		*/
		function checkWin$1(state) {
			if (state.status !== "playing") return false;
			if (!levelConnected(state.board.tiles, state.board.size, state.board.source, state.board.sink)) return false;
			state.status = "won";
			state.score += 200;
			return true;
		}
		/**
		* Advance the countdown while playing; hitting zero ends the game.
		* @param dt - elapsed seconds (the caller freezes the clock on pause).
		*/
		function tick(state, dt) {
			if (state.status !== "playing") return;
			state.timeLeft = Math.max(0, state.timeLeft - dt);
			if (state.timeLeft <= 0) state.status = "over";
		}
		/** Move to the next level: bigger board (per {@link levelSize}) and a fresh countdown. */
		function advanceLevel$2(state) {
			if (state.status !== "won") return;
			state.level += 1;
			state.board = generateLevel(levelSize$3(state.level), state.rng);
			state.timeLeft = 90;
			state.status = "playing";
		}
		/**
		* A fresh state on the given level.
		* @param level - 1-based level number.
		* @param score - score carried in from previous levels.
		* @param rng - injected random source for determinism.
		*/
		function createPipesState(level = 1, score = 0, rng = Math.random) {
			return {
				level,
				score,
				timeLeft: 90,
				status: "playing",
				board: generateLevel(levelSize$3(level), rng),
				rng
			};
		}
		const MAX_SIZE$1 = 8;
		const WATER = accent(0);
		/** Low-time warning threshold in seconds. */
		const LOW_TIME_S = 15;
		const particles$7 = createParticles();
		let prevWon$2 = false;
		let prevFrameMs$1 = 0;
		function boardOffsets(size) {
			return {
				ox: 16 + (MAX_SIZE$1 - size) * 52 / 2,
				oy: 60 + (MAX_SIZE$1 - size) * 52 / 2
			};
		}
		/**
		* One pipe cell: a stroke from the center to each opening edge. Connected
		* cells glow and carry flowing dashes; unconnected cells use muted strokes.
		*/
		function drawPipe$1(ctx, tile, x, y, connected, nowMs) {
			const cx = x + 26;
			const cy = y + 26;
			const mask = openings(tile);
			ctx.lineCap = "round";
			ctx.lineWidth = 9;
			for (let d = 0; d < 4; d += 1) {
				if ((mask & 1 << d) === 0) continue;
				const ex = cx + DC[d] * 52 / 2;
				const ey = cy + DR[d] * 52 / 2;
				if (connected) {
					glow(ctx, WATER, 10);
					ctx.strokeStyle = WATER;
				} else ctx.strokeStyle = THEME.panelEdge;
				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.lineTo(ex, ey);
				ctx.stroke();
				noGlow(ctx);
			}
			if (connected) {
				ctx.save();
				ctx.setLineDash([9, 9]);
				ctx.lineDashOffset = -(nowMs / 40) % 18;
				ctx.strokeStyle = "rgba(226,240,255,0.85)";
				ctx.lineWidth = 3.5;
				for (let d = 0; d < 4; d += 1) {
					if ((mask & 1 << d) === 0) continue;
					ctx.beginPath();
					ctx.moveTo(cx, cy);
					ctx.lineTo(cx + DC[d] * 52 / 2, cy + DR[d] * 52 / 2);
					ctx.stroke();
				}
				ctx.restore();
			}
		}
		/** Source/sink endpoint: a glowing hub with a stub toward its opening. */
		function drawEndpoint(ctx, label, color, x, y, rotation, connected, nowMs) {
			drawPipe$1(ctx, {
				type: label === "源" ? "source" : "sink",
				rotation
			}, x, y, connected, nowMs);
			const cx = x + 26;
			const cy = y + 26;
			glow(ctx, color, connected ? 14 : 8);
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(cx, cy, 13, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = "#10101a";
			ctx.font = "bold 13px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(label, cx, cy + 1);
			ctx.textBaseline = "alphabetic";
		}
		/** Draw one frame. */
		function renderPipes(ctx, state, view) {
			const now = typeof performance !== "undefined" ? performance.now() : 0;
			const dtMs = prevFrameMs$1 === 0 ? 16 : Math.min(64, now - prevFrameMs$1);
			prevFrameMs$1 = now;
			drawBackground(ctx, 448, 492);
			const timeColor = state.timeLeft <= LOW_TIME_S ? THEME.bad : THEME.text;
			hudPair(ctx, 12, 18, "关卡 ", String(state.level));
			hudPair(ctx, 110, 18, "时间 ", `${Math.ceil(state.timeLeft)}s`, "left", timeColor);
			hudPair(ctx, 436, 18, "得分 ", String(state.score), "right");
			ctx.fillStyle = THEME.textMuted;
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("点击 / 方向键+空格：旋转水管 · P：暂停 · R：重开", 12, 36);
			const { size, source, sink, tiles } = state.board;
			const { ox, oy } = boardOffsets(size);
			const water = connectedCells(tiles, size, source);
			for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) {
				const x = ox + c * 52;
				const y = oy + r * 52;
				ctx.fillStyle = "rgba(255,255,255,0.025)";
				ctx.fillRect(x, y, 52, 52);
				ctx.strokeStyle = "rgba(52,52,74,0.6)";
				ctx.lineWidth = 1;
				ctx.strokeRect(x + .5, y + .5, 51, 51);
				const tile = tiles[r][c];
				const connected = water[r][c];
				if (tile.type === "source") drawEndpoint(ctx, "源", THEME.good, x, y, tile.rotation, connected, now);
				else if (tile.type === "sink") drawEndpoint(ctx, "汇", THEME.gold, x, y, tile.rotation, connected, now);
				else drawPipe$1(ctx, tile, x, y, connected, now);
			}
			if (view.cursor !== null) {
				const { r, c } = view.cursor;
				if (r >= 0 && r < size && c >= 0 && c < size) {
					ctx.strokeStyle = accent(1);
					ctx.lineWidth = 2;
					glow(ctx, accent(1), 8);
					roundRectPath(ctx, ox + c * 52 + 2, oy + r * 52 + 2, 48, 48, 8);
					ctx.stroke();
					noGlow(ctx);
				}
			}
			if (state.status === "won" && !prevWon$2) particles$7.burst(ox + sink.c * 52 + 26, oy + sink.r * 52 + 26, WATER, 26, 180);
			prevWon$2 = state.status === "won";
			particles$7.tick(ctx, dtMs);
			if (view.paused) drawOverlay(ctx, 448, 492, "已暂停", "面板继续", THEME.text);
			else if (state.status === "won") drawOverlay(ctx, 448, 492, "接通！", `+200 · 按 N 或稍后进入下一关`, THEME.good);
			else if (state.status === "over") drawOverlay(ctx, 448, 492, "时间到", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
		}
		//#endregion
		//#region src/client/games/pipes/index.ts
		const AUTO_ADVANCE_MS = 1500;
		const MAX_SIZE = 8;
		/** The cursor delta each arrow key maps to. */
		const KEY_MOVE = {
			ArrowUp: [-1, 0],
			ArrowDown: [1, 0],
			ArrowLeft: [0, -1],
			ArrowRight: [0, 1]
		};
		function createPipesGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 448, 492);
			if (fit === null) throw new Error("dsh-minigames: pipes needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createPipesState();
			let running = false;
			let lastScore = -1;
			let cursor = null;
			let wonElapsed = 0;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const restart = () => {
				state = createPipesState(1, 0, state.rng);
				cursor = null;
				wonElapsed = 0;
				reportScore();
				loop.markDirty();
			};
			/** Rotate the tile at the cursor/cell and check for the win transition. */
			const rotateAt = (r, c) => {
				if (state.status !== "playing") return;
				if (rotateTile(state, r, c)) {
					loop.markDirty();
					if (checkWin$1(state)) {
						wonElapsed = 0;
						reportScore();
					}
				}
			};
			const moveCursor = (dr, dc) => {
				const size = state.board.size;
				if (cursor === null) {
					cursor = {
						r: Math.floor(size / 2),
						c: Math.floor(size / 2)
					};
					loop.markDirty();
					return;
				}
				cursor.r = Math.min(size - 1, Math.max(0, cursor.r + dr));
				cursor.c = Math.min(size - 1, Math.max(0, cursor.c + dc));
				loop.markDirty();
			};
			const onPointerDown = (event) => {
				if (!running) return;
				if (state.status === "over") return;
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * 448 / rect.width;
				const y = (event.clientY - rect.top) * 492 / rect.height;
				const boardPx = state.board.size * 52;
				const ox = 16 + (MAX_SIZE - state.board.size) * 52 / 2;
				const oy = 60 + (MAX_SIZE - state.board.size) * 52 / 2;
				if (x < ox || y < oy || x >= ox + boardPx || y >= oy + boardPx) return;
				const c = Math.floor((x - ox) / 52);
				const r = Math.floor((y - oy) / 52);
				cursor = {
					r,
					c
				};
				rotateAt(r, c);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					restart();
					return;
				}
				if (event.code === "KeyN") {
					event.preventDefault();
					if (state.status === "won") {
						advanceLevel$2(state);
						cursor = null;
						wonElapsed = 0;
						loop.markDirty();
					}
					return;
				}
				if (!running) return;
				const move = KEY_MOVE[event.code];
				if (move !== void 0) {
					event.preventDefault();
					moveCursor(move[0], move[1]);
					return;
				}
				if (event.code === "Space" || event.code === "Enter") {
					event.preventDefault();
					if (cursor !== null) rotateAt(cursor.r, cursor.c);
				}
			};
			const advance = (dt) => {
				if (state.status === "playing") tick(state, dt);
				if (state.status === "won") {
					wonElapsed += dt;
					if (wonElapsed >= AUTO_ADVANCE_MS / 1e3) {
						advanceLevel$2(state);
						cursor = null;
						wonElapsed = 0;
						loop.markDirty();
					}
				}
			};
			const frame = (f) => {
				if (!running) return;
				advance(f.dt);
				if (f.render) renderPipes(ctx, state, {
					paused: false,
					cursor
				});
			};
			const loop = createFrameLoop(frame);
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				loop.pause();
				renderPipes(ctx, state, {
					paused: true,
					cursor
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderPipes(ctx, state, {
				paused: false,
				cursor
			});
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const pipesGame = {
			id: "pipes",
			title: "接水管",
			icon: "🚰",
			description: "旋转水管铺出一条从水源到汇的水路：越往后棋盘越大，每关限时 90 秒。",
			controls: [
				"点击 / 方向键+空格：旋转水管",
				"N：下一关（过关后）",
				"P：暂停 · R：重开"
			],
			create: createPipesGame
		};
		/** Score for one cleared line of `n` balls (5→50, 6→120, 7→210, ...). */
		function scoreForLine(n) {
			return 10 * n * (n - 4);
		}
		function emptyGrid$1() {
			return Array.from({ length: 9 }, () => Array(9).fill(0));
		}
		/** All empty cells in row-major order. */
		function emptyCells$1(grid) {
			const out = [];
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) if (grid[r][c] === 0) out.push({
				r,
				c
			});
			return out;
		}
		/** Spawn `count` random balls on empty cells (fewer only when the board runs out). */
		function spawnBalls(state, count = 3) {
			let placed = 0;
			for (let i = 0; i < count; i += 1) {
				const empty = emptyCells$1(state.grid);
				if (empty.length === 0) break;
				const spot = empty[Math.floor(state.rng() * empty.length)];
				state.grid[spot.r][spot.c] = 1 + Math.floor(state.rng() * 7);
				placed += 1;
			}
			return placed;
		}
		/** A fresh board with the opening spawn. */
		function createColorLinesState(rng = Math.random) {
			const state = {
				grid: emptyGrid$1(),
				score: 0,
				over: false,
				rng
			};
			spawnBalls(state);
			return state;
		}
		/**
		* Whether a ball at `from` can slide to the empty cell `to` over a clear
		* orthogonal path (any length; the path itself walks only empty cells).
		*/
		function hasPath(grid, from, to) {
			if (grid[from.r][from.c] === 0) return false;
			if (grid[to.r][to.c] !== 0) return false;
			const seen = Array.from({ length: 9 }, () => Array(9).fill(false));
			const queue = [from];
			seen[from.r][from.c] = true;
			while (queue.length > 0) {
				const p = queue.shift();
				if (p.r === to.r && p.c === to.c) return true;
				for (const [dr, dc] of [
					[0, 1],
					[0, -1],
					[1, 0],
					[-1, 0]
				]) {
					const nr = p.r + dr;
					const nc = p.c + dc;
					if (nr < 0 || nr >= 9 || nc < 0 || nc >= 9) continue;
					if (seen[nr][nc]) continue;
					if (nr === to.r && nc === to.c) return true;
					if (grid[nr][nc] !== 0) continue;
					seen[nr][nc] = true;
					queue.push({
						r: nr,
						c: nc
					});
				}
			}
			return false;
		}
		/** The 4 line directions: right, down, and the two diagonals. */
		const DIRECTIONS = [
			[0, 1],
			[1, 0],
			[1, 1],
			[1, -1]
		];
		/**
		* Every cell on a 5+ run of one color (whole-board scan in the 4 line
		* directions). Overlapping runs merge their cells; score sums per run.
		*/
		function findClearing(grid) {
			const inClear = /* @__PURE__ */ new Set();
			let gained = 0;
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
				const color = grid[r][c];
				if (color === 0) continue;
				for (const [dr, dc] of DIRECTIONS) {
					const pr = r - dr;
					const pc = c - dc;
					if (pr >= 0 && pr < 9 && pc >= 0 && pc < 9 && grid[pr][pc] === color) continue;
					let len = 0;
					while (r + len * dr >= 0 && r + len * dr < 9 && c + len * dc >= 0 && c + len * dc < 9 && grid[r + len * dr][c + len * dc] === color) len += 1;
					if (len >= 5) {
						gained += scoreForLine(len);
						for (let i = 0; i < len; i += 1) inClear.add(`${r + i * dr},${c + i * dc}`);
					}
				}
			}
			return {
				cells: [...inClear].map((key) => {
					const [rr, cc] = key.split(",");
					return {
						r: Number(rr),
						c: Number(cc)
					};
				}),
				gained
			};
		}
		/**
		* Slide the ball `from` to the empty cell `to`. Legal moves then clear any
		* 5+ lines (no spawn that turn) or spawn 3 new balls; a full board with no
		* clear ends the game.
		*/
		function moveBall(state, from, to) {
			const fail = {
				moved: false,
				cleared: [],
				gained: 0
			};
			if (state.over) return fail;
			if (!hasPath(state.grid, from, to)) return fail;
			const color = state.grid[from.r][from.c];
			state.grid[from.r][from.c] = 0;
			state.grid[to.r][to.c] = color;
			const { cells, gained } = findClearing(state.grid);
			if (cells.length > 0) {
				for (const p of cells) state.grid[p.r][p.c] = 0;
				state.score += gained;
			} else {
				spawnBalls(state);
				if (emptyCells$1(state.grid).length === 0) state.over = true;
			}
			return {
				moved: true,
				cleared: cells,
				gained
			};
		}
		const BOARD_W$5 = 456;
		const BOARD_H$1 = 456;
		const LOGICAL_W$20 = BOARD_W$5;
		const LOGICAL_H$17 = 496;
		const particles$6 = createParticles();
		let prevScore$1 = -1;
		let prevFrameMs = 0;
		function cellX$2(c) {
			return 6 + c * 50 + 22;
		}
		function cellY$2(r) {
			return 46 + r * 50 + 22;
		}
		function drawBoardPanel(ctx) {
			ctx.fillStyle = THEME.panel;
			glow(ctx, THEME.panelEdge, 8);
			roundRectPath(ctx, 0, 40, BOARD_W$5, BOARD_H$1, 10);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			roundRectPath(ctx, .5, 40.5, 455, 455, 10);
			ctx.stroke();
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
				ctx.fillStyle = THEME.bgBottom;
				roundRectPath(ctx, 6 + c * 50, 46 + r * 50, 44, 44, 8);
				ctx.fill();
			}
		}
		/** One glowing ball; radius pulses when selected. */
		function drawBall$4(ctx, color, cx, cy, r) {
			const fill = accent(color - 1);
			glow(ctx, fill, 10);
			ctx.fillStyle = fill;
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = "rgba(255,255,255,0.3)";
			ctx.beginPath();
			ctx.arc(cx - r * .28, cy - r * .3, r * .22, 0, Math.PI * 2);
			ctx.fill();
		}
		/** Draw one frame. */
		function renderColorLines(ctx, state, view) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs);
			prevFrameMs = nowMs;
			const pulse = .5 + .5 * Math.sin(nowMs / 180);
			ctx.clearRect(0, 0, LOGICAL_W$20, LOGICAL_H$17);
			drawBackground(ctx, LOGICAL_W$20, LOGICAL_H$17);
			hudPair(ctx, 10, 16, "五连珠", "", "left");
			hudPair(ctx, LOGICAL_W$20 / 2, 16, "得分 ", String(state.score), "left", THEME.gold);
			hudPair(ctx, 446, 16, "剩余空间 ", String(emptyCells$1(state.grid).length), "right");
			drawBoardPanel(ctx);
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
				const color = state.grid[r][c];
				if (color === 0) continue;
				const isSelected = view.selected !== null && view.selected.r === r && view.selected.c === c;
				const radius = 15.84 * (isSelected ? 1 + .14 * pulse : 1);
				if (isSelected) {
					ctx.strokeStyle = THEME.gold;
					ctx.lineWidth = 2;
					ctx.globalAlpha = .4 + .4 * pulse;
					ctx.beginPath();
					ctx.arc(cellX$2(c), cellY$2(r), 19.36, 0, Math.PI * 2);
					ctx.stroke();
					ctx.globalAlpha = 1;
				}
				drawBall$4(ctx, color, cellX$2(c), cellY$2(r), radius);
			}
			if (view.clearing !== null) {
				const flash = .35 + .55 * Math.abs(Math.sin(view.clearing.t * 22));
				for (const p of view.clearing.cells) {
					ctx.fillStyle = `rgba(255,255,255,${flash.toFixed(2)})`;
					roundRectPath(ctx, 6 + p.c * 50 + 2, 46 + p.r * 50 + 2, 40, 40, 8);
					ctx.fill();
				}
			}
			if (state.score !== prevScore$1) {
				if (prevScore$1 >= 0 && state.score > prevScore$1) particles$6.burst(BOARD_W$5 / 2, 268, THEME.good, 14, 150);
				prevScore$1 = state.score;
			}
			particles$6.tick(ctx, dtMs);
			const cur = view.cursor;
			ctx.strokeStyle = view.selected !== null && view.selected.r === cur.r && view.selected.c === cur.c ? THEME.text : THEME.gold;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 3]);
			roundRectPath(ctx, 6 + cur.c * 50 + 2, 46 + cur.r * 50 + 2, 40, 40, 8);
			ctx.stroke();
			ctx.setLineDash([]);
			if (state.over) drawOverlay(ctx, LOGICAL_W$20, LOGICAL_H$17, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
		}
		//#endregion
		//#region src/client/games/colorlines/index.ts
		const CLEAR_MS = 300;
		function createColorLinesGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$20, LOGICAL_H$17);
			if (fit === null) throw new Error("dsh-minigames: colorlines needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createColorLinesState();
			let running = false;
			let lastScore = -1;
			let selected = null;
			let cursor = {
				r: 0,
				c: 0
			};
			/** Clear flash animation while non-null. */
			let clearing = null;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$20 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$17 / rect.height;
				const c = Math.floor((x - 6) / 50);
				const r = Math.floor((y - 40 - 6) / 50);
				if (r < 0 || r > 8 || c < 0 || c > 8) return null;
				return {
					r,
					c
				};
			};
			const attemptMove = (to) => {
				if (selected === null) return;
				const result = moveBall(state, selected, to);
				if (!result.moved) return;
				selected = null;
				reportScore();
				if (result.cleared.length > 0) clearing = {
					cells: result.cleared,
					t: 0
				};
			};
			/** Click / Enter on the cursor cell: pick up a ball or slide the held one. */
			const activate = (cell) => {
				if (state.over || clearing !== null) return;
				const color = state.grid[cell.r][cell.c];
				if (selected === null) {
					if (color !== 0) selected = cell;
					return;
				}
				if (cell.r === selected.r && cell.c === selected.c) {
					selected = null;
					return;
				}
				if (color !== 0) {
					selected = cell;
					return;
				}
				attemptMove(cell);
			};
			const onPointerDown = (event) => {
				if (!running) return;
				const cell = cellFromEvent(event);
				if (cell !== null) {
					cursor = cell;
					activate(cell);
					loop.markDirty();
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (!running && event.code.startsWith("Arrow")) return;
				switch (event.code) {
					case "ArrowUp":
						event.preventDefault();
						cursor = {
							r: Math.max(0, cursor.r - 1),
							c: cursor.c
						};
						break;
					case "ArrowDown":
						event.preventDefault();
						cursor = {
							r: Math.min(8, cursor.r + 1),
							c: cursor.c
						};
						break;
					case "ArrowLeft":
						event.preventDefault();
						cursor = {
							r: cursor.r,
							c: Math.max(0, cursor.c - 1)
						};
						break;
					case "ArrowRight":
						event.preventDefault();
						cursor = {
							r: cursor.r,
							c: Math.min(8, cursor.c + 1)
						};
						break;
					case "Enter":
					case "Space":
						event.preventDefault();
						if (!running) return;
						activate(cursor);
						break;
					case "KeyR":
						event.preventDefault();
						state = createColorLinesState();
						selected = null;
						clearing = null;
						lastScore = -1;
						reportScore();
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
				}
				loop.markDirty();
			};
			const loop = createFrameLoop((f) => {
				if (clearing !== null) {
					clearing.t += f.dt;
					if (clearing.t >= CLEAR_MS / 1e3) {
						clearing = null;
						loop.markDirty();
					}
				}
				if (f.render || clearing !== null) renderColorLines(ctx, state, {
					selected,
					cursor,
					clearing
				});
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				loop.pause();
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.resume();
				loop.markDirty();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderColorLines(ctx, state, {
				selected,
				cursor,
				clearing: null
			});
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const colorLinesGame = {
			id: "colorlines",
			title: "五连珠",
			icon: "🔮",
			description: "移动彩球连成五连胜：同色直线（含斜线）5 颗即消除，消除的回合不补充新球。",
			controls: [
				"点击 / 方向键+回车：选球再选落点",
				"R：重开",
				"P：暂停"
			],
			create: createColorLinesGame
		};
		const GRACE_MS = 1500;
		const RAMP_MS$1 = 12e4;
		const SPAWN_START = 900;
		const SPEED_START$1 = 90;
		const AIM_JITTER = .35;
		const NEAR_MISS_FACTOR = 1.5;
		/** Max velocity rotation, rad/s; a fast player can out-orbit them. */
		const HOMING_TURN_RATE = 1.6;
		/** Homing bullet speed as a factor of the tier speed. */
		const HOMING_SPEED_FACTOR = .75;
		const LASER_TELEGRAPH_MS = 1100;
		/** First laser may not spawn before this survival time. */
		const LASER_START_MS = 25e3;
		/** Interval ramp duration counted from the first laser. */
		const LASER_RAMP_MS = 9e4;
		const LASER_MAX_INTERVAL = 6e3;
		/** Probability a laser targets the player's row/col instead of a random one. */
		const LASER_AIM_CHANCE = .6;
		/** Laser spawn interval after `tMs`, linear 6s→3.2s over 90s from the first. */
		function laserInterval(tMs) {
			const k = Math.min(1, Math.max(0, (tMs - LASER_START_MS) / LASER_RAMP_MS));
			return LASER_MAX_INTERVAL + -2800 * k;
		}
		/** Spawn interval after `tMs` of survival, linear 900→250 over 120s. */
		function spawnInterval$2(tMs) {
			const k = Math.min(1, Math.max(0, tMs / RAMP_MS$1));
			return SPAWN_START + -650 * k;
		}
		/** Bullet speed after `tMs` of survival, linear 90→220 over 120s. */
		function bulletSpeed(tMs) {
			const k = Math.min(1, Math.max(0, tMs / RAMP_MS$1));
			return SPEED_START$1 + 130 * k;
		}
		/** Unit direction vector of a laser axis. */
		function laserDir(axis) {
			if (axis === "h") return {
				dx: 1,
				dy: 0
			};
			if (axis === "v") return {
				dx: 0,
				dy: 1
			};
			const s = Math.SQRT1_2;
			return axis === "d1" ? {
				dx: s,
				dy: s
			} : {
				dx: -s,
				dy: s
			};
		}
		/** Clip the infinite line through (ax, ay) along unit (dx, dy) to the rect
		* [minX, maxX] × [minY, maxY] (parametric Liang–Barsky slab clipping).
		* @returns the boundary-to-boundary segment, or null when the line misses
		* the rect or the direction is zero. */
		function lineClip(ax, ay, dx, dy, minX, minY, maxX, maxY) {
			if (dx === 0 && dy === 0) return null;
			let tMin = -Infinity;
			let tMax = Infinity;
			const clip = (d, a, lo, hi) => {
				if (d === 0) return a >= lo && a <= hi;
				let tLo = (lo - a) / d;
				let tHi = (hi - a) / d;
				if (tLo > tHi) [tLo, tHi] = [tHi, tLo];
				tMin = Math.max(tMin, tLo);
				tMax = Math.min(tMax, tHi);
				return tMin <= tMax;
			};
			if (!clip(dx, ax, minX, maxX)) return null;
			if (!clip(dy, ay, minY, maxY)) return null;
			return {
				x0: ax + tMin * dx,
				y0: ay + tMin * dy,
				x1: ax + tMax * dx,
				y1: ay + tMax * dy
			};
		}
		/** Perpendicular distance from (px, py) to the laser's (infinite) beam line. */
		function laserDist(l, px, py) {
			if (l.axis === "h") return Math.abs(py - l.pos);
			if (l.axis === "v") return Math.abs(px - l.pos);
			const { dx, dy } = laserDir(l.axis);
			return Math.abs(dx * (py - (l.ay ?? 0)) - dy * (px - (l.ax ?? 0)));
		}
		/** A fresh run: player centered, pointer target at the player, grace on. */
		function createDodger(rng = Math.random) {
			return {
				x: 240,
				y: 315,
				tx: 240,
				ty: 315,
				bullets: [],
				t: 0,
				score: 0,
				grazes: 0,
				over: false,
				grace: GRACE_MS,
				spawnCooldown: spawnInterval$2(0),
				lasers: [],
				laserCooldown: LASER_START_MS,
				rng
			};
		}
		/** Clamp the chase target into the playable area (below the HUD strip). */
		function setTarget(state, x, y) {
			state.tx = Math.min(472, Math.max(8, x));
			state.ty = Math.min(592, Math.max(38, y));
		}
		/**
		* Spawn one bullet on a random edge point, aimed at the player with jitter.
		* Once score ≥ HOMING_SCORE, a seeded HOMING_FRACTION of spawns are homing
		* (0.75x tier speed, own pool cap HOMING_MAX_ALIVE, do not count against
		* MAX_BULLETS; a full homing pool falls back to a normal bullet).
		* Exposed for tests; stepDodger calls it on its cooldown.
		*/
		function spawnBullet(state) {
			let homing = state.score >= 800 && state.rng() < .35;
			let homingCount = 0;
			let normalCount = 0;
			for (const b of state.bullets) if (b.homing) homingCount += 1;
			else normalCount += 1;
			if (homing && homingCount >= 24) homing = false;
			if (!homing && normalCount >= 120) return;
			const edge = Math.floor(state.rng() * 4);
			let x = 0;
			let y = 0;
			if (edge === 0) {
				x = state.rng() * 480;
				y = -9;
			} else if (edge === 1) {
				x = 489;
				y = state.rng() * 600;
			} else if (edge === 2) {
				x = state.rng() * 480;
				y = 609;
			} else {
				x = -9;
				y = state.rng() * 600;
			}
			const aim = Math.atan2(state.y - y, state.x - x) + (state.rng() * 2 - 1) * AIM_JITTER;
			const speed = bulletSpeed(state.t) * (homing ? HOMING_SPEED_FACTOR : 1);
			const bullet = {
				x,
				y,
				vx: Math.cos(aim) * speed,
				vy: Math.sin(aim) * speed,
				grazed: false
			};
			if (homing) {
				bullet.homing = true;
				bullet.age = 0;
			}
			state.bullets.push(bullet);
		}
		/**
		* Spawn one laser: 60% aimed at the player (row/col, or the anchor pinned to
		* the player's position for diagonals), 40% at a uniform random position in
		* the field; axis picked uniformly over h/v, plus d1/d2 once score ≥
		* LASER_DIAGONAL_SCORE. Exposed for tests.
		* @param state - the run (laser pushed onto `state.lasers`).
		* @returns the spawned laser.
		*/
		function spawnLaser(state) {
			const aimed = state.rng() < LASER_AIM_CHANCE;
			const axes = state.score >= 350 ? [
				"h",
				"v",
				"d1",
				"d2"
			] : ["h", "v"];
			const axis = axes[Math.floor(state.rng() * axes.length)];
			const laser = {
				axis,
				pos: 0,
				phase: "telegraph",
				phaseT: 0
			};
			if (axis === "h") laser.pos = aimed ? state.y : 30 + state.rng() * 570;
			else if (axis === "v") laser.pos = aimed ? state.x : state.rng() * 480;
			else {
				laser.ax = aimed ? state.x : state.rng() * 480;
				laser.ay = aimed ? state.y : 30 + state.rng() * 570;
			}
			state.lasers.push(laser);
			return laser;
		}
		/**
		* Whether the scheduler may spawn a laser now: alive cap (2 normally, 3 once
		* score ≥ LASER_MULTI_SCORE), and while still in the early phase (time <
		* LASER_SOLO_FIRE_UNTIL AND score < LASER_MULTI_SCORE) only when every alive
		* laser is already fading, so at most one laser telegraphs/fires at a time —
		* no impossible grids before the multi-laser unlock.
		*/
		function laserCanSpawn(state) {
			const multi = state.score >= 500;
			const cap = multi ? 3 : 2;
			if (state.lasers.length >= cap) return false;
			if (!multi && state.t < 7e4 && state.lasers.some((l) => l.phase !== "fade")) return false;
			return true;
		}
		/**
		* Advance one fixed step by `dt` ms under the held input.
		* @param state - the run (mutated in place).
		* @param dt - elapsed milliseconds (clamp upstream).
		* @param input - held arrow/WASD keys; any held key nudges the chase target.
		* @returns true when the run ended this step.
		*/
		function stepDodger(state, dt, input) {
			if (state.over) return true;
			const dtSec = dt / 1e3;
			state.t += dt;
			state.grace = Math.max(0, state.grace - dt);
			if (input.left) state.tx -= 300 * dtSec;
			if (input.right) state.tx += 300 * dtSec;
			if (input.up) state.ty -= 300 * dtSec;
			if (input.down) state.ty += 300 * dtSec;
			setTarget(state, state.tx, state.ty);
			const dx = state.tx - state.x;
			const dy = state.ty - state.y;
			const dist = Math.hypot(dx, dy);
			if (dist > .001) {
				const step = Math.min(dist, 340 * dtSec);
				state.x += dx / dist * step;
				state.y += dy / dist * step;
			}
			state.spawnCooldown -= dt;
			while (state.spawnCooldown <= 0) {
				spawnBullet(state);
				state.spawnCooldown += spawnInterval$2(state.t);
			}
			const hitR = 13;
			const grazeR = hitR * NEAR_MISS_FACTOR;
			const alive = [];
			for (const b of state.bullets) {
				if (b.homing) {
					b.age = (b.age ?? 0) + dt;
					if (b.age >= 6e3) continue;
					const speed = Math.hypot(b.vx, b.vy);
					const cur = Math.atan2(b.vy, b.vx);
					let delta = Math.atan2(state.y - b.y, state.x - b.x) - cur;
					while (delta > Math.PI) delta -= Math.PI * 2;
					while (delta < -Math.PI) delta += Math.PI * 2;
					const maxTurn = HOMING_TURN_RATE * dtSec;
					const turn = Math.min(maxTurn, Math.max(-maxTurn, delta));
					b.vx = Math.cos(cur + turn) * speed;
					b.vy = Math.sin(cur + turn) * speed;
				}
				b.x += b.vx * dtSec;
				b.y += b.vy * dtSec;
				const M = b.homing ? 300 : 80;
				if (b.x < -M || b.x > 480 + M || b.y < -M || b.y > 600 + M) continue;
				const d = Math.hypot(b.x - state.x, b.y - state.y);
				if (d < hitR) {
					if (state.grace > 0) {
						if (!b.grazed) {
							b.grazed = true;
							state.grazes += 1;
							state.score += 5;
						}
					} else {
						state.over = true;
						state.bullets = alive;
						return true;
					}
				} else if (!b.grazed && d < grazeR) {
					b.grazed = true;
					state.grazes += 1;
					state.score += 5;
				}
				alive.push(b);
			}
			state.bullets = alive;
			state.laserCooldown -= dt;
			if (state.laserCooldown <= 0) {
				if (laserCanSpawn(state)) {
					spawnLaser(state);
					state.laserCooldown = laserInterval(state.t);
				} else state.laserCooldown = 0;
			}
			const liveLasers = [];
			for (const l of state.lasers) {
				l.phaseT += dt;
				if (l.phase === "telegraph") {
					if (l.phaseT >= 1100) {
						l.phase = "fire";
						l.phaseT -= LASER_TELEGRAPH_MS;
					}
				} else if (l.phase === "fire") {
					if (l.phaseT >= 450) {
						l.phase = "fade";
						l.phaseT -= 450;
					}
				} else if (l.phaseT >= 300) continue;
				liveLasers.push(l);
			}
			state.lasers = liveLasers;
			if (state.grace <= 0) for (const l of state.lasers) {
				if (l.phase !== "fire") continue;
				if (laserDist(l, state.x, state.y) <= 15) {
					state.over = true;
					return true;
				}
			}
			state.score = Math.floor(state.t / 1e3) * 10 + state.grazes * 5;
			return false;
		}
		//#endregion
		//#region src/client/games/dodger/render.ts
		const PLAYER_COLOR$2 = accent(0);
		const LASER_WARN_COLOR = accent(1);
		const LASER_FIRE_COLOR = accent(4);
		const HOMING_COLOR = accent(2);
		/** Bullet color by speed tier: slow amber → mid orange → fast red. */
		function bulletColor(speed) {
			if (speed < 130) return accent(3);
			if (speed < 175) return accent(6);
			return accent(4);
		}
		const particles$5 = createParticles();
		let prevNow$2 = 0;
		let prevOver = false;
		/**
		* Draw one frame.
		* @param paused - show the pause overlay.
		*/
		function renderDodger(ctx, state, paused) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$2));
			prevNow$2 = now;
			drawBackground(ctx, 480, 600);
			for (const b of state.bullets) drawStreak(ctx, b);
			for (const l of state.lasers) drawLaser(ctx, l, state.t);
			if (!(state.grace > 0 && Math.floor(state.grace / 120) % 2 === 0)) {
				glow(ctx, PLAYER_COLOR$2, 16);
				ctx.fillStyle = PLAYER_COLOR$2;
				ctx.beginPath();
				ctx.arc(state.x, state.y, 8, 0, Math.PI * 2);
				ctx.fill();
				noGlow(ctx);
				ctx.fillStyle = "#c8d6ff";
				ctx.beginPath();
				ctx.arc(state.x, state.y, 3.6, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.strokeStyle = THEME.textMuted;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.arc(state.x, state.y, 12, 0, Math.PI * 2);
				ctx.stroke();
			}
			if (state.over && !prevOver) particles$5.burst(state.x, state.y, THEME.bad, 22, 200);
			prevOver = state.over;
			particles$5.tick(ctx, dt);
			ctx.fillStyle = "rgba(13,13,20,0.45)";
			ctx.fillRect(0, 0, 480, 30);
			hudPair(ctx, 10, 20, "时间", `${(state.t / 1e3).toFixed(1)}s`, "left");
			hudPair(ctx, 240, 20, "得分", String(state.score), "left");
			hudPair(ctx, 470, 20, "擦弹", String(state.grazes), "right", THEME.gold);
			if (state.over) drawOverlay(ctx, 480, 600, "被 击 中", `坚持 ${(state.t / 1e3).toFixed(1)} 秒 · 得分 ${state.score} · 按 R 重新开始`, THEME.bad);
			else if (paused) drawOverlay(ctx, 480, 600, "已暂停", "面板继续", THEME.text);
		}
		function drawStreak(ctx, b) {
			if (b.homing) {
				drawComet(ctx, b);
				return;
			}
			const speed = Math.hypot(b.vx, b.vy);
			const color = bulletColor(speed);
			const tail = Math.min(26, 8 + speed * .08);
			const ux = b.vx / speed;
			const uy = b.vy / speed;
			const grad = ctx.createLinearGradient(b.x, b.y, b.x - ux * tail, b.y - uy * tail);
			grad.addColorStop(0, color);
			grad.addColorStop(1, "transparent");
			glow(ctx, color, 10);
			ctx.strokeStyle = grad;
			ctx.lineWidth = 7;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(b.x, b.y);
			ctx.lineTo(b.x - ux * tail, b.y - uy * tail);
			ctx.stroke();
			noGlow(ctx);
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
			ctx.fill();
		}
		/** Homing bullet: glowing accent(2) head with a short trail along its velocity. */
		function drawComet(ctx, b) {
			const speed = Math.hypot(b.vx, b.vy) || 1;
			const ux = b.vx / speed;
			const uy = b.vy / speed;
			const tail = 16;
			const grad = ctx.createLinearGradient(b.x, b.y, b.x - ux * tail, b.y - uy * tail);
			grad.addColorStop(0, HOMING_COLOR);
			grad.addColorStop(1, "transparent");
			glow(ctx, HOMING_COLOR, 14);
			ctx.strokeStyle = grad;
			ctx.lineWidth = 5.5;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(b.x, b.y);
			ctx.lineTo(b.x - ux * tail, b.y - uy * tail);
			ctx.stroke();
			noGlow(ctx);
			ctx.fillStyle = HOMING_COLOR;
			ctx.beginPath();
			ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#ffffff";
			ctx.beginPath();
			ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
			ctx.fill();
		}
		/** Beam span endpoints across the field for a laser's axis (diagonals are
		* parametrically clipped to the field rect; degenerate fallback = anchor). */
		function beamEnds(l) {
			if (l.axis === "h") return {
				x0: 0,
				y0: l.pos,
				x1: 480,
				y1: l.pos
			};
			if (l.axis === "v") return {
				x0: l.pos,
				y0: 30,
				x1: l.pos,
				y1: 600
			};
			const { dx, dy } = laserDir(l.axis);
			const seg = lineClip(l.ax ?? 0, l.ay ?? 0, dx, dy, 0, 30, 480, 600);
			if (seg) return seg;
			const x = l.ax ?? 0;
			const y = l.ay ?? 0;
			return {
				x0: x,
				y0: y,
				x1: x,
				y1: y
			};
		}
		function drawLaser(ctx, l, t) {
			const { x0, y0, x1, y1 } = beamEnds(l);
			if (l.phase === "telegraph") {
				const alpha = .35 + .3 * (.5 + .5 * Math.sin(t / 90));
				ctx.save();
				ctx.globalAlpha = alpha;
				glow(ctx, LASER_WARN_COLOR, 6);
				ctx.strokeStyle = LASER_WARN_COLOR;
				ctx.lineWidth = 1.5;
				ctx.setLineDash([8, 6]);
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.stroke();
				ctx.restore();
				return;
			}
			if (l.phase === "fire") {
				const width = 14 * (.55 + .45 * Math.min(1, l.phaseT / 120));
				const { dx, dy } = laserDir(l.axis);
				const gx = -dy;
				const gy = dx;
				const grad = ctx.createLinearGradient(x0 - gx * width / 2, y0 - gy * width / 2, x0 + gx * width / 2, y0 + gy * width / 2);
				grad.addColorStop(0, "rgba(255,255,255,0.1)");
				grad.addColorStop(.5, LASER_FIRE_COLOR);
				grad.addColorStop(1, "rgba(255,255,255,0.1)");
				glow(ctx, LASER_FIRE_COLOR, 22);
				ctx.strokeStyle = grad;
				ctx.lineWidth = width;
				ctx.lineCap = "butt";
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.stroke();
				noGlow(ctx);
				ctx.strokeStyle = "rgba(255,255,255,0.85)";
				ctx.lineWidth = width * .3;
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.stroke();
				return;
			}
			const alpha = Math.max(0, 1 - l.phaseT / 300);
			ctx.save();
			ctx.globalAlpha = alpha * .6;
			glow(ctx, LASER_FIRE_COLOR, 12);
			ctx.strokeStyle = LASER_FIRE_COLOR;
			ctx.lineWidth = 7;
			ctx.lineCap = "butt";
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
			ctx.stroke();
			ctx.restore();
		}
		//#endregion
		//#region src/client/games/dodger/index.ts
		function createDodgerGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 600);
			if (fit === null) throw new Error("dsh-minigames: dodger needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createDodger();
			let running = false;
			let lastScore = -1;
			const input = {
				up: false,
				down: false,
				left: false,
				right: false
			};
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const onPointerMove = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) / rect.width * 480;
				const y = (event.clientY - rect.top) / rect.height * 600;
				setTarget(state, x, y);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.ctrlKey || event.altKey || event.metaKey) return;
				switch (event.code) {
					case "ArrowLeft":
					case "KeyA":
						event.preventDefault();
						input.left = true;
						break;
					case "ArrowRight":
					case "KeyD":
						event.preventDefault();
						input.right = true;
						break;
					case "ArrowUp":
					case "KeyW":
						event.preventDefault();
						input.up = true;
						break;
					case "ArrowDown":
					case "KeyS":
						event.preventDefault();
						input.down = true;
						break;
					case "KeyR":
						event.preventDefault();
						reset();
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
				}
			};
			const onKeyUp = (event) => {
				switch (event.code) {
					case "ArrowLeft":
					case "KeyA":
						input.left = false;
						break;
					case "ArrowRight":
					case "KeyD":
						input.right = false;
						break;
					case "ArrowUp":
					case "KeyW":
						input.up = false;
						break;
					case "ArrowDown":
					case "KeyS": input.down = false;
				}
			};
			const frame = (f) => {
				if (!running) return;
				stepDodger(state, f.dt * 1e3, input);
				reportScore();
				if (f.render) renderDodger(ctx, state, false);
			};
			const loop = createFrameLoop(frame);
			const reset = () => {
				state = createDodger();
				lastScore = -1;
				input.up = input.down = input.left = input.right = false;
				loop.markDirty();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderDodger(ctx, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			canvas.addEventListener("pointermove", onPointerMove);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			renderDodger(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("pointermove", onPointerMove);
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
				}
			};
		}
		const dodgerGame = {
			id: "dodger",
			title: "弹幕躲避",
			icon: "💠",
			description: "移动光点在弹幕中穿行，贴弹擦过加分，活得越久弹幕越密越快。",
			controls: [
				"鼠标：跟随移动",
				"WASD / 方向键：移动",
				"R：重开",
				"P：暂停"
			],
			create: createDodgerGame
		};
		//#endregion
		//#region src/client/games/typing/logic.ts
		/**
		* Typing meteors pure logic: English words fall from the top; typing the
		* first letter of a word locks onto it, matching letters advance, completing
		* the word scores (+10 x letters, x1.5 at streak >= 5) and destroys it. A
		* word crossing the bottom line costs one of 3 lives. Deterministic
		* functions over a plain state object driven by an explicit ms clock.
		*/
		/** Pool of ~120 common words plus a few spaceless mini-phrases. */
		const WORDS = [
			"cat",
			"dog",
			"sun",
			"map",
			"key",
			"ice",
			"fox",
			"owl",
			"sky",
			"red",
			"blue",
			"tree",
			"star",
			"moon",
			"fish",
			"bird",
			"book",
			"rain",
			"snow",
			"wind",
			"fire",
			"gold",
			"king",
			"queen",
			"ship",
			"road",
			"song",
			"time",
			"work",
			"life",
			"hand",
			"head",
			"eyes",
			"door",
			"food",
			"game",
			"home",
			"land",
			"name",
			"night",
			"play",
			"read",
			"city",
			"farm",
			"girl",
			"boy",
			"walk",
			"jump",
			"run",
			"fast",
			"slow",
			"warm",
			"cold",
			"deep",
			"high",
			"wide",
			"open",
			"close",
			"light",
			"dark",
			"apple",
			"grape",
			"lemon",
			"melon",
			"peach",
			"berry",
			"bread",
			"rice",
			"soup",
			"cake",
			"cloud",
			"storm",
			"field",
			"grass",
			"river",
			"ocean",
			"beach",
			"stone",
			"metal",
			"wood",
			"house",
			"tower",
			"chair",
			"table",
			"phone",
			"paper",
			"music",
			"dance",
			"smile",
			"dream",
			"magic",
			"sword",
			"shield",
			"castle",
			"dragon",
			"planet",
			"rocket",
			"puzzle",
			"wonder",
			"bright",
			"silver",
			"shadow",
			"winter",
			"summer",
			"spring",
			"friend",
			"family",
			"school",
			"letter",
			"number",
			"goforit",
			"letsgo",
			"comeon",
			"hurryup",
			"niceone",
			"goodjob",
			"okgo",
			"staycalm",
			"hangon",
			"yougotit"
		];
		/** Spawn interval at elapsed 0. */
		const START_SPAWN_MS = 2600;
		/** Elapsed time over which spawn/speed ramp. */
		const RAMP_MS = 1e5;
		/** Random x candidates tried per spawn before lifting the band. */
		const SPAWN_RETRIES = 6;
		/**
		* Default rendered-width estimate (px) for a word when no font-measured
		* function is injected: monospace advance plus glow/padding allowance.
		*/
		function defaultWordWidth(text) {
			return text.length * 11 + 24;
		}
		/** Horizontal overlap width of [ax, ax+aw] and [bx, bx+bw]; 0 when disjoint. */
		function overlap(ax, aw, bx, bw) {
			return Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
		}
		/** A fresh run: empty field, full lives, first spawn almost due. */
		function createTypingState(rng = Math.random, wordWidth = defaultWordWidth) {
			return {
				words: [],
				lockId: null,
				typed: "",
				lives: 3,
				score: 0,
				streak: 0,
				over: false,
				elapsed: 0,
				spawnT: 600,
				shake: 0,
				nextId: 1,
				lastWord: null,
				rng,
				wordWidth
			};
		}
		/** Linear ramp helper clamped to [0, RAMP_MS]. */
		function rampT(elapsedMs) {
			return Math.min(Math.max(elapsedMs, 0), RAMP_MS) / RAMP_MS;
		}
		/** Current spawn interval in ms. */
		function spawnInterval$1(elapsedMs) {
			return START_SPAWN_MS + rampT(elapsedMs) * -1500;
		}
		/** Current fall speed in px/s. */
		function fallSpeed(elapsedMs) {
			return 22 + rampT(elapsedMs) * 24;
		}
		/** Pick a pool word, never the same as `last` immediately (pool > 1). */
		function pickWord(rng, last) {
			let index = Math.floor(rng() * WORDS.length);
			if (WORDS[index] === last) index = (index + 1) % WORDS.length;
			return WORDS[index];
		}
		/**
		* Total horizontal overlap (px) a candidate word at (`x`, `y`) would have
		* with live words whose vertical band is within SPAWN_BAND.
		*/
		function spawnClash(state, text, x, y) {
			let sum = 0;
			for (const word of state.words) {
				if (Math.abs(word.y - y) >= 30) continue;
				sum += overlap(x, state.wordWidth(text), word.x, state.wordWidth(word.text));
			}
			return sum;
		}
		/**
		* Pick a spawn position for `text`: keep the word fully inside the side
		* margins and try random x values clear of in-band live words; if every
		* candidate clashes, retry one band higher so the word enters later, and on
		* a still-crowded field accept the least-overlapping x.
		* @returns position with x as the word's left edge.
		*/
		function pickSpawn(state, text) {
			const maxX = Math.max(0, 456 - state.wordWidth(text));
			let x = 12;
			for (let band = 0; band < 3; band += 1) {
				const y = 36 - band * 30;
				x = 12 + state.rng() * maxX;
				let bestX = x;
				let bestClash = spawnClash(state, text, bestX, y);
				for (let i = 1; i < SPAWN_RETRIES && bestClash > 0; i += 1) {
					const candidate = 12 + state.rng() * maxX;
					const clash = spawnClash(state, text, candidate, y);
					if (clash < bestClash) {
						bestX = candidate;
						bestClash = clash;
					}
				}
				if (bestClash === 0) return {
					x: bestX,
					y
				};
				x = bestX;
			}
			return {
				x,
				y: -24
			};
		}
		/**
		* Advance the field by `dtMs`: shake decay, fall, bottom-line life loss,
		* game over, and spawning (no immediate word repeats).
		*/
		function tickTyping(state, dtMs) {
			if (state.over) return;
			state.elapsed += dtMs;
			state.shake = Math.max(0, state.shake - dtMs);
			const vy = fallSpeed(state.elapsed) * (dtMs / 1e3);
			for (const word of state.words) word.y += vy;
			for (let i = state.words.length - 1; i >= 0; i -= 1) {
				const word = state.words[i];
				if (word.y < 520) continue;
				state.words.splice(i, 1);
				state.lives -= 1;
				if (state.lockId === word.id) {
					state.lockId = null;
					state.typed = "";
				}
			}
			if (state.lives <= 0) {
				state.lives = 0;
				state.over = true;
				state.words = [];
				state.lockId = null;
				state.typed = "";
				return;
			}
			while (state.spawnT <= 0 && !state.over) {
				state.spawnT += spawnInterval$1(state.elapsed);
				if (state.words.length >= 8) continue;
				const text = pickWord(state.rng, state.lastWord);
				state.lastWord = text;
				const spawn = pickSpawn(state, text);
				state.words.push({
					id: state.nextId,
					text,
					x: spawn.x,
					y: spawn.y
				});
				state.nextId += 1;
			}
			state.spawnT -= dtMs;
		}
		/**
		* Type one letter [a-z].
		* @returns 'ignored' when over or not a letter; 'miss' when no word starts
		*   with it (no penalty); 'lock' when a word was just locked; 'match' for a
		*   continuing match; 'break' when a wrong letter broke the lock (streak
		*   resets, small shake); 'complete' when the locked word was finished.
		*/
		function typeLetter(state, ch) {
			if (state.over) return "ignored";
			const letter = ch.toLowerCase();
			if (!/^[a-z]$/.test(letter)) return "ignored";
			if (state.lockId === null) {
				let best = null;
				for (const word of state.words) if (word.text[0] === letter && (best === null || word.y > best.y)) best = word;
				if (best === null) return "miss";
				state.lockId = best.id;
				state.typed = letter;
				return "lock";
			}
			const locked = state.words.find((word) => word.id === state.lockId);
			if (locked === void 0) {
				state.lockId = null;
				state.typed = "";
				return "ignored";
			}
			if (locked.text[state.typed.length] === letter) {
				state.typed += letter;
				if (state.typed.length === locked.text.length) {
					state.streak += 1;
					const multiplier = state.streak >= 5 ? 1.5 : 1;
					state.score += Math.round(10 * locked.text.length * multiplier);
					state.words.splice(state.words.indexOf(locked), 1);
					state.lockId = null;
					state.typed = "";
					return "complete";
				}
				return "match";
			}
			state.lockId = null;
			state.typed = "";
			state.streak = 0;
			state.shake = 220;
			return "break";
		}
		/** ESC: release the lock without a streak penalty. */
		function escapeLock(state) {
			state.lockId = null;
			state.typed = "";
		}
		const WORD_FONT = "bold 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
		/** Draw one word at (x, y): locked words get plate/glow/prefix treatment. */
		function drawWord(ctx, state, word) {
			const locked = word.id === state.lockId;
			const cx = word.x;
			const top = word.y;
			if (locked) {
				glow(ctx, accent(0), 14);
				ctx.fillStyle = THEME.good;
				ctx.fillText(word.text.slice(0, state.typed.length), cx, top);
				const prefixW = ctx.measureText(word.text.slice(0, state.typed.length)).width;
				const next = word.text[state.typed.length] ?? "";
				const nextW = next === "" ? 0 : ctx.measureText(next).width;
				ctx.fillStyle = accent(0);
				ctx.fillText(next, cx + prefixW, top);
				if (next !== "") ctx.fillRect(cx + prefixW, top + 10, nextW, 2);
				ctx.fillStyle = THEME.text;
				ctx.fillText(word.text.slice(state.typed.length + (next === "" ? 0 : 1)), cx + prefixW + nextW, top);
				noGlow(ctx);
			} else {
				glow(ctx, THEME.textMuted, 4);
				ctx.fillStyle = THEME.text;
				ctx.fillText(word.text, cx, top);
				noGlow(ctx);
			}
		}
		/** A few dim stars so the fall reads like a meteor shower. */
		const STARS = [];
		for (let i = 0; i < 26; i += 1) STARS.push({
			x: (i * 97 + 31) % 480,
			y: (i * 173 + 47) % 460 + 40,
			r: i % 3 * .5 + .6
		});
		/**
		* Draw one frame.
		* @param shakeDx - horizontal shake offset (px) applied to the word field.
		*/
		function renderTyping(ctx, state, paused, shakeDx = 0) {
			ctx.clearRect(0, 0, 480, 560);
			drawBackground(ctx, 480, 560);
			for (const star of STARS) {
				ctx.fillStyle = THEME.textMuted;
				ctx.beginPath();
				ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
				ctx.fill();
			}
			glow(ctx, THEME.bad, 12);
			ctx.strokeStyle = THEME.bad;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(0, 520);
			ctx.lineTo(480, 520);
			ctx.stroke();
			noGlow(ctx);
			ctx.save();
			ctx.translate(shakeDx, 0);
			ctx.font = WORD_FONT;
			ctx.textBaseline = "middle";
			ctx.textAlign = "left";
			for (const word of state.words) {
				if (word.id === state.lockId) continue;
				drawWord(ctx, state, word);
			}
			const lockedWord = state.words.find((word) => word.id === state.lockId);
			if (lockedWord !== void 0) {
				const textW = ctx.measureText(lockedWord.text).width;
				ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
				ctx.beginPath();
				ctx.roundRect(lockedWord.x - 8, lockedWord.y - 14, textW + 16, 28, 6);
				ctx.fill();
				drawWord(ctx, state, lockedWord);
			}
			ctx.restore();
			ctx.textBaseline = "alphabetic";
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, 480, 30);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.strokeRect(.5, .5, 479, 29);
			hudPair(ctx, 10, 20, "生命 ", "❤".repeat(state.lives) || "—", "left", THEME.bad);
			hudPair(ctx, 240, 20, "连击 ", String(state.streak), "center", state.streak >= 5 ? THEME.gold : THEME.text);
			hudPair(ctx, 470, 20, "得分 ", String(state.score), "right", THEME.gold);
			if (state.over) drawOverlay(ctx, 480, 560, "游戏结束", `得分 ${state.score} · 按 R 重开`, THEME.bad);
			else if (paused) drawOverlay(ctx, 480, 560, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/typing/index.ts
		function createTypingGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 560);
			if (fit === null) throw new Error("dsh-minigames: typing needs a 2d canvas context");
			const ctx = fit.ctx;
			let state;
			let running = false;
			let lastScore = -1;
			const particles = createParticles();
			const newState = () => {
				ctx.font = WORD_FONT;
				return createTypingState(Math.random, (text) => ctx.measureText(text).width);
			};
			state = newState();
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			/** Handle one letter key against the current lock. */
			const inputLetter = (ch) => {
				if (state.over) return;
				const locked = state.lockId === null ? null : state.words.find((word) => word.id === state.lockId);
				if (typeLetter(state, ch) === "complete" && locked !== void 0 && locked !== null) particles.burst(locked.x + locked.text.length * 5, locked.y, accent(2), 14, 150);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.ctrlKey || event.altKey || event.metaKey) return;
				const letter = /^[a-zA-Z]$/.test(event.key) ? event.key : null;
				if (letter !== null && running && !state.over) {
					const lockLive = state.lockId !== null && state.words.some((word) => word.id === state.lockId);
					const startsWord = !lockLive && state.words.some((word) => word.text[0] === letter.toLowerCase());
					if (lockLive || startsWord) {
						event.preventDefault();
						inputLetter(letter);
						return;
					}
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					state = newState();
					lastScore = -1;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				} else if (event.code === "Escape") {
					event.preventDefault();
					if (running) escapeLock(state);
				} else if (letter !== null) {
					event.preventDefault();
					if (running) inputLetter(letter);
				}
			};
			const frame = (f) => {
				if (!running) return;
				const dtMs = f.dt * 1e3;
				tickTyping(state, dtMs);
				reportScore();
				if (f.render) {
					const shakeDx = state.shake > 0 ? Math.sin(state.shake / 18) * 4 : 0;
					renderTyping(ctx, state, false, shakeDx);
					particles.tick(ctx, dtMs);
				}
			};
			const loop = createFrameLoop(frame);
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				loop.pause();
				renderTyping(ctx, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderTyping(ctx, state, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const typingGame = {
			id: "typing",
			title: "打字流星",
			icon: "🌠",
			description: "输入单词首字母锁定流星，拼完整个单词即可消除，别让单词落到底线。",
			controls: [
				"字母键：输入单词",
				"Esc：取消锁定",
				"R：重开",
				"P：暂停"
			],
			create: createTypingGame
		};
		/** Deterministic mulberry32 PRNG (see tests/pipes-logic.spec.ts precedent). */
		function mulberry32$19(seed) {
			let s = seed >>> 0;
			return () => {
				s = s + 1831565813 >>> 0;
				let t = s;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** A solved (all-off) board. */
		function emptyBoard() {
			return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));
		}
		function cloneBoard(board) {
			return board.map((row) => [...row]);
		}
		/** In-bounds orthogonal neighbors of a cell, excluding the cell itself. */
		function neighbors$2(r, c) {
			const out = [];
			if (r > 0) out.push([r - 1, c]);
			if (r < 4) out.push([r + 1, c]);
			if (c > 0) out.push([r, c - 1]);
			if (c < 4) out.push([r, c + 1]);
			return out;
		}
		/**
		* Toggle a cell and its orthogonal neighbors.
		* @returns a new board; the input is unchanged.
		*/
		function toggleAt(board, r, c) {
			const next = cloneBoard(board);
			next[r][c] = !next[r][c];
			for (const [nr, nc] of neighbors$2(r, c)) next[nr][nc] = !next[nr][nc];
			return next;
		}
		/** True when every light is off. */
		function isSolved$3(board) {
			return board.every((row) => row.every((cell) => !cell));
		}
		/** Scramble toggle count for a level: 4 at level 1, +1 per level, capped at 12. */
		function scrambleCount(level) {
			return Math.min(4 + Math.max(1, level) - 1, 12);
		}
		/** The N toggle cells a scramble applies, deterministically from the seed. */
		function scrambleMoves(seed, n) {
			const rng = mulberry32$19(seed);
			const moves = [];
			for (let i = 0; i < n; i += 1) moves.push([Math.floor(rng() * 5), Math.floor(rng() * 5)]);
			return moves;
		}
		/**
		* Build a level board: solved board scrambled by n seed-determined toggles.
		* Applying the same toggles again solves it.
		*/
		function scramble(seed, n) {
			let board = emptyBoard();
			for (const [r, c] of scrambleMoves(seed, n)) board = toggleAt(board, r, c);
			return board;
		}
		const LOGICAL_W$18 = 340;
		const LOGICAL_H$15 = 388;
		function cellRect$1(r, c) {
			return {
				x: 6 + c * 68,
				y: 38 + r * 68
			};
		}
		/** Which cell a logical-space point lands on, or null. */
		function cellAt$4(x, y) {
			for (let r = 0; r < 5; r += 1) for (let c = 0; c < 5; c += 1) {
				const { x: px, y: py } = cellRect$1(r, c);
				if (x >= px && x <= px + 56 && y >= py && y <= py + 56) return {
					r,
					c
				};
			}
			return null;
		}
		/** Center of a cell in logical space (particle bursts). */
		function cellCenter$4(r, c) {
			const { x, y } = cellRect$1(r, c);
			return {
				x: x + 28,
				y: y + 28
			};
		}
		/**
		* Draw one frame.
		* @param cursor - keyboard-focused cell, or null to hide the focus ring.
		* @param paused - show the pause overlay.
		* @param winText - level-clear overlay subtitle, or null while playing.
		*/
		function renderLights(ctx, w, h, board, cursor, level, moves, paused, winText) {
			ctx.clearRect(0, 0, w, h);
			drawBackground(ctx, w, h);
			hudPair(ctx, 6, 21, "关卡 ", String(level));
			hudPair(ctx, w - 6, 21, "步数 ", String(moves), "right", THEME.gold);
			for (let r = 0; r < 5; r += 1) for (let c = 0; c < 5; c += 1) {
				const { x, y } = cellRect$1(r, c);
				const color = accent(r + c);
				const on = board[r][c];
				glow(ctx, color, on ? 20 : 4);
				ctx.fillStyle = on ? color : THEME.panel;
				roundRectPath(ctx, x, y, 56, 56, 10);
				ctx.fill();
				noGlow(ctx);
				ctx.strokeStyle = on ? color : THEME.panelEdge;
				ctx.lineWidth = cursor !== null && cursor.r === r && cursor.c === c ? 2.5 : 1;
				if (cursor !== null && cursor.r === r && cursor.c === c) glow(ctx, THEME.text, 8);
				ctx.stroke();
				noGlow(ctx);
			}
			if (winText !== null) drawOverlay(ctx, w, h, "过关", winText, THEME.good);
			else if (paused) drawOverlay(ctx, w, h, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/lightsout/index.ts
		const ADVANCE_MS$11 = 1500;
		/** Undo history cap: rewind stays bounded and cheap. */
		const MAX_HISTORY$3 = 200;
		function createLightsOutGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$18, LOGICAL_H$15);
			if (fit === null) throw new Error("dsh-minigames: lightsout needs a 2d canvas context");
			const ctx = fit.ctx;
			const LS_REACHED = "dsh-minigames:lightsout:reached";
			const readReached = () => {
				try {
					const saved = window.localStorage.getItem(LS_REACHED);
					if (saved !== null) {
						const n = Number(saved);
						if (Number.isFinite(n) && n >= 1) return Math.floor(n);
					}
				} catch {}
				return 1;
			};
			const saveReached = (lv) => {
				try {
					window.localStorage.setItem(LS_REACHED, String(lv));
				} catch {}
			};
			let level = readReached();
			let moves = 0;
			let board = scramble(level * 2654435769, scrambleCount(level));
			let cursor = {
				r: 2,
				c: 2
			};
			let winText = null;
			let running = false;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScore = -1;
			const history = [];
			const particles = createParticles();
			const reportScore = () => {
				if (level === lastScore) return;
				lastScore = level;
				options?.onScore?.(level);
			};
			const startLevel = (next) => {
				level = next;
				moves = 0;
				board = scramble(level * 2654435769, scrambleCount(level));
				winText = null;
				history.length = 0;
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					startLevel(level + 1);
				}, delayMs);
			};
			const move = (r, c) => {
				if (winText !== null) return;
				history.push({
					board,
					moves
				});
				if (history.length > MAX_HISTORY$3) history.shift();
				moves += 1;
				board = toggleAt(board, r, c);
				loop.markDirty();
				if (isSolved$3(board)) {
					winText = `第 ${level} 关完成 · ${moves} 步`;
					saveReached(level + 1);
					reportScore();
					const center = cellCenter$4(r, c);
					particles.burst(center.x, center.y, THEME.gold, 14, 150);
					for (let i = 0; i < 5; i += 1) {
						const edge = cellCenter$4(i, c);
						particles.burst(edge.x, edge.y, THEME.good, 3, 90);
					}
					if (running) scheduleAdvance(ADVANCE_MS$11);
					else advanceRemaining = ADVANCE_MS$11;
				}
			};
			/** Rewind the last move (board + move counter); no-op at level start. */
			const undo = () => {
				if (winText !== null) return;
				const entry = history.pop();
				if (entry === void 0) return;
				board = entry.board;
				moves = entry.moves;
				loop.markDirty();
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const cell = cellAt$4((event.clientX - rect.left) * LOGICAL_W$18 / rect.width, (event.clientY - rect.top) * LOGICAL_H$15 / rect.height);
				if (cell !== null) {
					cursor = cell;
					move(cell.r, cell.c);
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					winText = null;
					startLevel(level);
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				} else if (event.code === "KeyZ" || event.code === "Backspace") {
					event.preventDefault();
					if (!running) return;
					undo();
				} else if (event.code.startsWith("Arrow") || event.code === "Space" || event.code === "Enter") {
					event.preventDefault();
					if (!running) return;
					if (event.code === "ArrowUp") cursor = {
						r: Math.max(0, cursor.r - 1),
						c: cursor.c
					};
					else if (event.code === "ArrowDown") cursor = {
						r: Math.min(4, cursor.r + 1),
						c: cursor.c
					};
					else if (event.code === "ArrowLeft") cursor = {
						r: cursor.r,
						c: Math.max(0, cursor.c - 1)
					};
					else if (event.code === "ArrowRight") cursor = {
						r: cursor.r,
						c: Math.min(4, cursor.c + 1)
					};
					else move(cursor.r, cursor.c);
					loop.markDirty();
				}
			};
			const frame = (f) => {
				if (!running) return;
				if (!f.render && particles.size() === 0) return;
				renderLights(ctx, LOGICAL_W$18, LOGICAL_H$15, board, cursor, level, moves, false, winText);
				particles.tick(ctx, f.dt * 1e3);
			};
			const loop = createFrameLoop(frame);
			const pause = () => {
				if (!running) return;
				running = false;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderLights(ctx, LOGICAL_W$18, LOGICAL_H$15, board, cursor, level, moves, true, winText);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.start();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const lightsOutGame = {
			id: "lightsout",
			title: "点灯 Lights Out",
			icon: "💡",
			description: "点亮或熄灭十字形相邻的灯，把整块面板全部熄灭。",
			controls: [
				"点击 / 方向键 + 空格或回车：切换",
				"Z / Backspace：回退一步",
				"R：重开本关",
				"P：暂停"
			],
			create: createLightsOutGame
		};
		const SPEEDUP = 1.04;
		const SPEED_CAP = 2.2;
		/** Max outbound angle off vertical at a paddle edge, radians (60°). */
		const MAX_BOUNCE = Math.PI / 3;
		/** Max serve angle off vertical, radians (36°). */
		const SERVE_ANGLE = Math.PI / 5;
		/**
		* One mulberry32 step on an explicit state word.
		* @param state - the current 32-bit PRNG state.
		* @returns the uniform value in [0,1) and the next state word.
		*/
		function mulberry32Step(state) {
			const a = state + 1831565813 >>> 0;
			let t = a;
			t = Math.imul(t ^ t >>> 15, t | 1);
			t ^= t + Math.imul(t ^ t >>> 7, t | 61);
			return {
				value: ((t ^ t >>> 14) >>> 0) / 4294967296,
				next: a
			};
		}
		/** A fresh match: paddles centered, ball parked at center serving to the player. */
		function createState$6(seed = 1) {
			return {
				playerX: 240,
				aiX: 240,
				targetX: 240,
				ball: {
					x: 240,
					y: 320,
					vx: 0,
					vy: 0
				},
				playerScore: 0,
				aiScore: 0,
				rally: 0,
				serveCd: 900,
				serveDir: 1,
				over: null,
				rngState: seed >>> 0
			};
		}
		function clampPaddleX(x) {
			return Math.min(438, Math.max(42, x));
		}
		/** Ball speed after one paddle hit: +4%, capped at SPEED_CAP × BASE_SPEED. */
		function nextSpeed(speed) {
			return Math.min(speed * SPEEDUP, 300 * SPEED_CAP);
		}
		/**
		* Classic paddle reflection: outbound angle scales with the hit offset from
		* the paddle center (edge → MAX_BOUNCE off vertical), speed preserved.
		* @param paddleCenter - paddle center x.
		* @param ballX - ball center x at the hit.
		* @param speed - outbound speed.
		* @param dir - vertical direction after the bounce: -1 up (player hit), 1 down.
		* @returns the new velocity.
		*/
		function paddleReflect(paddleCenter, ballX, speed, dir) {
			const angle = Math.min(1, Math.max(-1, (ballX - paddleCenter) / 42)) * MAX_BOUNCE;
			return {
				vx: Math.sin(angle) * speed,
				vy: Math.cos(angle) * speed * dir
			};
		}
		/** Reflect the ball off the left/right walls; keeps x inside [BALL_R, W-BALL_R]. */
		function bounceWalls(ball) {
			if (ball.x < 7) {
				ball.x = 14 - ball.x;
				ball.vx = Math.abs(ball.vx);
			} else if (ball.x > 473) {
				ball.x = 946 - ball.x;
				ball.vx = -Math.abs(ball.vx);
			}
		}
		/** Launch the parked ball from center toward `serveDir` with a seeded angle. */
		function serve(s) {
			const { value, next } = mulberry32Step(s.rngState);
			s.rngState = next;
			const angle = (value * 2 - 1) * SERVE_ANGLE;
			s.ball.x = 240;
			s.ball.y = 320;
			s.ball.vx = Math.sin(angle) * 300;
			s.ball.vy = Math.cos(angle) * 300 * s.serveDir;
		}
		/** Score a goal for `who`: bump the score, park the ball, serve to the loser. */
		function scoreGoal(s, who) {
			if (who === "player") {
				s.playerScore += 1;
				s.serveDir = -1;
			} else {
				s.aiScore += 1;
				s.serveDir = 1;
			}
			s.rally = 0;
			s.ball.x = 240;
			s.ball.y = 320;
			s.ball.vx = 0;
			s.ball.vy = 0;
			if (s.playerScore >= 7 || s.aiScore >= 7) {
				s.over = s.playerScore >= 7 ? "player" : "ai";
				s.serveCd = 0;
			} else s.serveCd = 900;
		}
		/**
		* Advance one fixed step by `dt` ms under the held input (copy-on-write).
		* @param state - the match state (never mutated).
		* @param dt - elapsed milliseconds (clamp upstream).
		* @param input - pointer target x and/or held left/right keys.
		* @returns the new state.
		*/
		function step$9(state, dt, input) {
			if (state.over !== null) return state;
			const s = {
				...state,
				ball: { ...state.ball }
			};
			const dtSec = dt / 1e3;
			if (input.playerX !== void 0) s.targetX = input.playerX;
			if (input.left) s.targetX -= 380 * dtSec;
			if (input.right) s.targetX += 380 * dtSec;
			s.targetX = clampPaddleX(s.targetX);
			const pDx = s.targetX - s.playerX;
			const pStep = Math.min(Math.abs(pDx), 480 * dtSec);
			s.playerX += Math.sign(pDx) * pStep;
			if (s.serveCd > 0) {
				s.serveCd -= dt;
				if (s.serveCd <= 0) {
					s.serveCd = 0;
					serve(s);
				}
				return s;
			}
			const aiDx = (s.ball.vy < 0 ? s.ball.x : 240) - s.aiX;
			if (Math.abs(aiDx) > 6) {
				const aiStep = Math.min(Math.abs(aiDx), 260 * dtSec);
				s.aiX = clampPaddleX(s.aiX + Math.sign(aiDx) * aiStep);
			}
			s.ball.x += s.ball.vx * dtSec;
			s.ball.y += s.ball.vy * dtSec;
			bounceWalls(s.ball);
			if (s.ball.vy > 0 && s.ball.y + 7 >= 594 && s.ball.y - 7 <= 606 && Math.abs(s.ball.x - s.playerX) <= 49) {
				const speed = nextSpeed(Math.hypot(s.ball.vx, s.ball.vy));
				const v = paddleReflect(s.playerX, s.ball.x, speed, -1);
				s.ball.vx = v.vx;
				s.ball.vy = v.vy;
				s.ball.y = 587;
				s.rally += 1;
			}
			if (s.ball.vy < 0 && s.ball.y - 7 <= 76 && s.ball.y + 7 >= 64 && Math.abs(s.ball.x - s.aiX) <= 49) {
				const speed = nextSpeed(Math.hypot(s.ball.vx, s.ball.vy));
				const v = paddleReflect(s.aiX, s.ball.x, speed, 1);
				s.ball.vx = v.vx;
				s.ball.vy = v.vy;
				s.ball.y = 83;
				s.rally += 1;
			}
			if (s.ball.y + 7 < 0) scoreGoal(s, "player");
			else if (s.ball.y - 7 > 640) scoreGoal(s, "ai");
			return s;
		}
		//#endregion
		//#region src/client/games/pong/render.ts
		const PLAYER_COLOR$1 = accent(0);
		const AI_COLOR = accent(4);
		const BALL_COLOR = accent(2);
		const particles$4 = createParticles();
		let prevNow$1 = 0;
		let prevPlayerScore = 0;
		let prevAiScore = 0;
		/** Draw one frame. */
		function renderPong(ctx, state) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$1));
			prevNow$1 = now;
			drawBackground(ctx, 480, 640);
			ctx.save();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 2;
			ctx.setLineDash([10, 12]);
			ctx.beginPath();
			ctx.moveTo(0, 320);
			ctx.lineTo(480, 320);
			ctx.stroke();
			ctx.restore();
			drawPaddle(ctx, state.aiX, 64, AI_COLOR);
			drawPaddle(ctx, state.playerX, 594, PLAYER_COLOR$1);
			drawBall$3(ctx, state);
			if (state.playerScore !== prevPlayerScore) particles$4.burst(state.ball.x, 30, THEME.good, 18, 180);
			if (state.aiScore !== prevAiScore) particles$4.burst(state.ball.x, 640, THEME.bad, 18, 180);
			prevPlayerScore = state.playerScore;
			prevAiScore = state.aiScore;
			particles$4.tick(ctx, dt);
			ctx.fillStyle = "rgba(13,13,20,0.45)";
			ctx.fillRect(0, 0, 480, 30);
			hudPair(ctx, 10, 20, "我方", String(state.playerScore), "left", THEME.good);
			ctx.textAlign = "center";
			ctx.font = "600 13px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText(":", 240, 20);
			hudPair(ctx, 254, 20, "对方", String(state.aiScore), "left", THEME.bad);
			hudPair(ctx, 470, 20, "回合", String(state.rally), "right", THEME.gold);
			if (state.over === "player") drawOverlay(ctx, 480, 640, `你赢了 ${state.playerScore}:${state.aiScore}`, "点击或按空格重新开始", THEME.good);
			else if (state.over === "ai") drawOverlay(ctx, 480, 640, `你输了 ${state.playerScore}:${state.aiScore}`, "点击或按空格重新开始", THEME.bad);
			else if (state.serveCd > 0) {
				ctx.textAlign = "center";
				ctx.font = "600 13px system-ui, sans-serif";
				ctx.fillStyle = THEME.textMuted;
				ctx.fillText("准备发球…", 240, 302);
			}
		}
		function drawPaddle(ctx, cx, y, color) {
			glow(ctx, color, 14);
			ctx.fillStyle = color;
			roundRectPath(ctx, cx - 42, y, 84, 12, 6);
			ctx.fill();
			noGlow(ctx);
		}
		function drawBall$3(ctx, state) {
			glow(ctx, BALL_COLOR, 16);
			ctx.fillStyle = BALL_COLOR;
			ctx.beginPath();
			ctx.arc(state.ball.x, state.ball.y, 7, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = "#ffffff";
			ctx.beginPath();
			ctx.arc(state.ball.x, state.ball.y, 3.15, 0, Math.PI * 2);
			ctx.fill();
		}
		//#endregion
		//#region src/client/games/pong/index.ts
		function createPongGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 640);
			if (fit === null) throw new Error("dsh-minigames: pong needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createState$6();
			let running = false;
			let reported = false;
			const input = {
				playerX: void 0,
				left: false,
				right: false
			};
			/** Fire onScore once per match with the player's points (best-score friendly). */
			const reportScore = () => {
				if (reported || state.over === null) return;
				reported = true;
				options?.onScore?.(state.playerScore);
			};
			const restart = () => {
				state = createState$6(Math.random() * 4294967295 >>> 0);
				reported = false;
				input.left = input.right = false;
				loop.markDirty();
			};
			const onPointerMove = (event) => {
				const rect = canvas.getBoundingClientRect();
				input.playerX = (event.clientX - rect.left) / rect.width * 480;
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.ctrlKey || event.altKey || event.metaKey) return;
				switch (event.code) {
					case "ArrowLeft":
					case "KeyA":
						event.preventDefault();
						input.left = true;
						break;
					case "ArrowRight":
					case "KeyD":
						event.preventDefault();
						input.right = true;
						break;
					case "KeyR":
						event.preventDefault();
						restart();
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
						break;
					case "Space":
						event.preventDefault();
						if (state.over !== null) restart();
				}
			};
			const onKeyUp = (event) => {
				switch (event.code) {
					case "ArrowLeft":
					case "KeyA":
						input.left = false;
						break;
					case "ArrowRight":
					case "KeyD": input.right = false;
				}
			};
			const onPointerDown = () => {
				if (state.over !== null) restart();
			};
			const frame = (f) => {
				if (!running) return;
				state = step$9(state, f.dt * 1e3, input);
				reportScore();
				if (f.render) renderPong(ctx, state);
			};
			const loop = createFrameLoop(frame);
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				loop.pause();
				renderPong(ctx, state);
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			canvas.addEventListener("pointermove", onPointerMove);
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			renderPong(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("pointermove", onPointerMove);
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
				}
			};
		}
		const pongGame = {
			id: "pong",
			title: "弹球对打",
			icon: "🏓",
			description: `鼠标或 ←/→ 移动挡板，先拿 7 分获胜，回合越久球越快。`,
			controls: [
				"鼠标：左右移动",
				"←/→ / A D：移动",
				"R：重开",
				"P：暂停"
			],
			create: createPongGame
		};
		/** Gravity on cut-off overhang pieces, px/s². */
		const GRAVITY$1 = 1100;
		/**
		* mulberry32 PRNG: small, fast, seedable — used for the initial slider side
		* and the per-layer speed jitter.
		* @param seed - any uint32; identical seeds produce identical streams.
		* @returns a () => number in [0, 1).
		*/
		function mulberry32$18(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Top-edge y of layer `i` in tower coordinates. */
		function layerTopY(i) {
			return 596 - (i + 1) * 24;
		}
		/** Slider speed for a layer count, ramped every RAMP_EVERY layers. */
		function sliderSpeed(layers) {
			return 150 + Math.floor(layers / 5) * 22;
		}
		/**
		* A fresh run: ground slab centered, first slider entering from a seeded
		* side with jittered speed.
		* @param seed - mulberry32 seed for the side/speed jitter stream.
		*/
		function createState$5(seed) {
			const rng = mulberry32$18(seed);
			const state = {
				blocks: [{
					x: 90,
					w: 240
				}],
				slider: {
					x: 0,
					w: 240,
					dir: 1,
					speed: sliderSpeed(0)
				},
				falling: [],
				layers: 0,
				score: 0,
				streak: 0,
				over: false,
				rng
			};
			const dir = rng() < .5 ? -1 : 1;
			state.slider.dir = dir;
			state.slider.x = dir > 0 ? 0 : 180;
			state.slider.speed = sliderSpeed(0) * (.92 + rng() * .16);
			return state;
		}
		/**
		* Advance the ping-pong slider and the falling pieces by `dt` ms. No input
		* here — dropping is {@link drop}. Does nothing once the tower collapsed.
		* @param state - the run (mutated in place).
		* @param dt - elapsed milliseconds (clamp upstream).
		*/
		function step$8(state, dt) {
			if (state.over) return;
			const dtSec = dt / 1e3;
			const s = state.slider;
			s.x += s.dir * s.speed * dtSec;
			const maxX = 420 - s.w;
			if (s.x <= 0) {
				s.x = Math.min(maxX, -s.x);
				s.dir = 1;
			} else if (s.x >= maxX) {
				s.x = Math.max(0, 2 * maxX - s.x);
				s.dir = -1;
			}
			const alive = [];
			for (const p of state.falling) {
				p.vy += GRAVITY$1 * dtSec;
				p.y += p.vy * dtSec;
				if (p.y < 916) alive.push(p);
			}
			state.falling = alive;
		}
		/**
		* Drop the slider onto the block below. The overlap becomes the new placed
		* block; the overhang (if any) detaches as a falling piece. Perfect drops
		* (offset ≤ PERFECT_TOL) keep the full width, score +PERFECT_SCORE, and pay
		* +STREAK_BONUS on every STREAK_BONUS_EVERY-th consecutive perfect; normal
		* drops score +NORMAL_SCORE and reset the streak. When the overlap is ≤ 0
		* the tower collapses. A new slider then enters from the alternating side.
		* @param state - the run (mutated in place; also returned).
		* @returns the outcome with the same state reference.
		*/
		function drop$1(state) {
			const top = state.blocks[state.blocks.length - 1];
			const s = state.slider;
			const left = Math.max(top.x, s.x);
			const right = Math.min(top.x + top.w, s.x + s.w);
			const overlap = right - left;
			const offset = Math.abs(s.x - top.x);
			if (overlap <= 0) {
				state.over = true;
				state.falling.push({
					x: s.x,
					w: s.w,
					y: layerTopY(state.layers),
					vy: 0
				});
				return {
					state,
					result: "gameover",
					overlap
				};
			}
			const dropY = layerTopY(state.layers);
			if (offset <= 3) {
				state.blocks.push({
					x: top.x,
					w: top.w
				});
				state.streak += 1;
				state.score += 3;
				if (state.streak % 5 === 0) state.score += 10;
			} else {
				state.blocks.push({
					x: left,
					w: overlap
				});
				state.falling.push({
					x: s.x < top.x ? s.x : right,
					w: s.w - overlap,
					y: dropY,
					vy: 0
				});
				state.streak = 0;
				state.score += 1;
			}
			state.layers += 1;
			const newTop = state.blocks[state.blocks.length - 1];
			const dir = s.dir === 1 ? -1 : 1;
			state.slider = {
				x: dir > 0 ? 0 : 420 - newTop.w,
				w: newTop.w,
				dir,
				speed: sliderSpeed(state.layers) * (.92 + state.rng() * .16)
			};
			return {
				state,
				result: offset <= 3 ? "perfect" : "ok",
				overlap
			};
		}
		//#endregion
		//#region src/client/games/stack/render.ts
		const STACK_W = 420;
		const STACK_H = 640;
		/** Layers kept on screen before the camera starts scrolling. */
		const VISIBLE_LAYERS = Math.floor(518 / 24);
		let prevNow = 0;
		let prevLayers = -1;
		let flash = 0;
		/** Perfect-drop flash decay, ms to fade from full to zero. */
		const FLASH_MS = 220;
		/** Camera offset: tower coordinates → screen coordinates (y grows downward). */
		function camOffset(state) {
			return Math.max(0, state.layers - VISIBLE_LAYERS) * 24;
		}
		/** Draw one frame. */
		function renderStack(ctx, state) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow));
			prevNow = now;
			drawBackground(ctx, 420, 640);
			const cam = camOffset(state);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(0, 596 + cam);
			ctx.lineTo(420, 596 + cam);
			ctx.stroke();
			ctx.fillStyle = THEME.panel;
			ctx.lineWidth = 1;
			roundRectPath(ctx, 24, 596 + cam, 372, 24, 4);
			ctx.fill();
			ctx.stroke();
			for (let i = 1; i < state.blocks.length; i += 1) drawBlock(ctx, state.blocks[i], i, cam);
			if (state.layers !== prevLayers) {
				if (prevLayers >= 0 && state.streak > 0) flash = 1;
				prevLayers = state.layers;
			}
			if (flash > 0) {
				flash = Math.max(0, flash - dt / FLASH_MS);
				const top = state.blocks[state.blocks.length - 1];
				ctx.save();
				ctx.globalAlpha = flash * .85;
				ctx.fillStyle = "#ffffff";
				roundRectPath(ctx, top.x, layerTopY(state.layers - 1) + cam, top.w, 24, 4);
				ctx.fill();
				ctx.restore();
			}
			for (const p of state.falling) drawFalling(ctx, p, cam);
			const s = state.slider;
			if (!state.over) {
				const y = layerTopY(state.layers) + cam;
				const color = accent(state.layers);
				glow(ctx, color, 14);
				ctx.fillStyle = color;
				roundRectPath(ctx, s.x, y, s.w, 24, 4);
				ctx.fill();
				noGlow(ctx);
				ctx.fillStyle = "rgba(255,255,255,0.25)";
				ctx.fillRect(s.x + 4, y + 4, s.w - 8, 3);
			}
			ctx.fillStyle = "rgba(13,13,20,0.45)";
			ctx.fillRect(0, 0, 420, 30);
			hudPair(ctx, 10, 20, "层数", String(state.layers), "left");
			hudPair(ctx, 210, 20, "得分", String(state.score), "left");
			hudPair(ctx, 410, 20, "连击", String(state.streak), "right", THEME.gold);
			if (state.over) drawOverlay(ctx, 420, 640, `倒塌了 · ${state.layers} 层`, `得分 ${state.score} · 点击或按空格重新开始`, THEME.bad);
		}
		/** One tower slab, colored by its layer index. */
		function drawBlock(ctx, b, layer, cam) {
			const y = layerTopY(layer - 1) + cam;
			ctx.fillStyle = accent(layer);
			roundRectPath(ctx, b.x, y, b.w, 24, 4);
			ctx.fill();
			ctx.fillStyle = "rgba(255,255,255,0.18)";
			ctx.fillRect(b.x + 3, y + 3, b.w - 6, 3);
		}
		/** A cut-off overhang piece tumbling down. */
		function drawFalling(ctx, p, cam) {
			ctx.save();
			ctx.globalAlpha = .85;
			ctx.fillStyle = THEME.textMuted;
			roundRectPath(ctx, p.x, p.y + cam, p.w, 24, 4);
			ctx.fill();
			ctx.restore();
		}
		//#endregion
		//#region src/client/games/stack/index.ts
		function createStackGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, STACK_W, STACK_H);
			if (fit === null) throw new Error("dsh-minigames: stack needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createState$5(Math.random() * 4294967295 >>> 0);
			let running = false;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const doDrop = () => {
				if (state.over || !running) return;
				drop$1(state);
				reportScore();
			};
			const onPointerDown = (event) => {
				event.preventDefault();
				if (state.over) {
					reset();
					return;
				}
				if (running) doDrop();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.ctrlKey || event.altKey || event.metaKey) return;
				switch (event.code) {
					case "Space":
					case "ArrowDown":
						event.preventDefault();
						if (state.over) reset();
						else if (running) doDrop();
						break;
					case "KeyR":
						event.preventDefault();
						reset();
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
				}
			};
			const frame = (f) => {
				if (!running) return;
				step$8(state, f.dt * 1e3);
				if (f.render) renderStack(ctx, state);
			};
			const loop = createFrameLoop(frame);
			const reset = () => {
				state = createState$5(Math.random() * 4294967295 >>> 0);
				lastScore = -1;
				reportScore();
				renderStack(ctx, state);
				loop.markDirty();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				loop.pause();
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.start();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderStack(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const stackGame = {
			id: "stack",
			title: "Tower Stack 堆塔",
			icon: "🏗️",
			description: "在滑动的方块落下时精准堆叠，完美对齐保持宽度，偏移越多塔越窄。",
			controls: [
				"点击 / 空格 / ↓：落下",
				"R：重开",
				"P：暂停"
			],
			create: createStackGame
		};
		//#endregion
		//#region src/client/games/wordle/words.ts
		/**
		* Wordle 词表：按长度分池的候选答案（ANSWERS_4 / ANSWERS_5 / ANSWERS_6）。
		* 猜测不再要求在词表内——任意等长纯字母词均合法，词表仅用于选答案。
		*/
		/** 常见 4 字母候选答案（大写，120 个）。 */
		const ANSWERS_4 = [
			"ABLE",
			"ACHE",
			"ACTS",
			"AGED",
			"AJAR",
			"ALLY",
			"ALSO",
			"AREA",
			"ARMY",
			"ATOM",
			"AWAY",
			"BABY",
			"BACK",
			"BALL",
			"BAND",
			"BANK",
			"BASE",
			"BATH",
			"BEAN",
			"BEAR",
			"BEAT",
			"BELL",
			"BELT",
			"BEST",
			"BILL",
			"BIRD",
			"BITE",
			"BLUE",
			"BOAT",
			"BODY",
			"BONE",
			"BOOK",
			"BOOT",
			"BORN",
			"BOSS",
			"BOTH",
			"BOWL",
			"BURN",
			"BUSY",
			"CAFE",
			"CAGE",
			"CALL",
			"CALM",
			"CAME",
			"CAMP",
			"CARD",
			"CARE",
			"CASE",
			"CASH",
			"CAST",
			"CELL",
			"CHAT",
			"CHIP",
			"CITY",
			"CLUB",
			"COAL",
			"COAT",
			"CODE",
			"COOK",
			"COOL",
			"COPY",
			"CORE",
			"COST",
			"CREW",
			"CROP",
			"CUTE",
			"DARK",
			"DATA",
			"DATE",
			"DEAD",
			"DEAL",
			"DEAR",
			"DEEP",
			"DESK",
			"DICE",
			"DIRT",
			"DISH",
			"DOES",
			"DONE",
			"DOOR",
			"DOWN",
			"DRAW",
			"DREW",
			"DROP",
			"DRUM",
			"DUCK",
			"DUST",
			"DUTY",
			"EACH",
			"EARN",
			"EASE",
			"EAST",
			"EASY",
			"EDGE",
			"ELSE",
			"EVEN",
			"EVER",
			"EVIL",
			"EXIT",
			"FACE",
			"FACT",
			"FADE",
			"FAIL",
			"FAIR",
			"FALL",
			"FARM",
			"FAST",
			"FATE",
			"FEAR",
			"FEED",
			"FEEL",
			"FEET",
			"FELL",
			"FILM",
			"FIND",
			"FINE",
			"FIRE",
			"FISH",
			"FIVE",
			"FLAG"
		];
		/** 常见 5 字母候选答案（大写，150 个）。 */
		const ANSWERS_5 = [
			"ABOUT",
			"ABOVE",
			"ACTOR",
			"ADMIT",
			"ADOPT",
			"ADULT",
			"AFTER",
			"AGAIN",
			"AGENT",
			"AGREE",
			"AHEAD",
			"ALARM",
			"ALBUM",
			"ALERT",
			"ALIVE",
			"ALLOW",
			"ALONE",
			"ALONG",
			"ANGER",
			"ANGLE",
			"APPLE",
			"APPLY",
			"ARGUE",
			"ARISE",
			"ARRAY",
			"ASIDE",
			"ASSET",
			"AUDIO",
			"AVOID",
			"AWARD",
			"BAKER",
			"BASIC",
			"BEACH",
			"BEGIN",
			"BELOW",
			"BENCH",
			"BIRTH",
			"BLACK",
			"BLAME",
			"BLANK",
			"BLOCK",
			"BLOOD",
			"BOARD",
			"BOOST",
			"BOUND",
			"BRAIN",
			"BRAND",
			"BRAVE",
			"BREAD",
			"BREAK",
			"BRICK",
			"BRIEF",
			"BRING",
			"BROAD",
			"BROWN",
			"BUILD",
			"CABLE",
			"CANDY",
			"CARRY",
			"CATCH",
			"CAUSE",
			"CHAIN",
			"CHAIR",
			"CHARM",
			"CHART",
			"CHASE",
			"CHEAP",
			"CHECK",
			"CHESS",
			"CHIEF",
			"CHILD",
			"CLAIM",
			"CLASS",
			"CLEAN",
			"CLEAR",
			"CLICK",
			"CLIMB",
			"CLOCK",
			"CLOSE",
			"CLOUD",
			"COACH",
			"COAST",
			"COUNT",
			"COURT",
			"COVER",
			"CRAFT",
			"CRASH",
			"CRAZY",
			"CREAM",
			"CRIME",
			"CROSS",
			"CROWD",
			"CROWN",
			"CYCLE",
			"DAILY",
			"DANCE",
			"DIARY",
			"DOUBT",
			"DOZEN",
			"DRAFT",
			"DRAMA",
			"DREAM",
			"DRESS",
			"DRINK",
			"DRIVE",
			"EAGLE",
			"EARLY",
			"EARTH",
			"EIGHT",
			"ELITE",
			"EMPTY",
			"ENEMY",
			"ENJOY",
			"ENTER",
			"EQUAL",
			"ERROR",
			"EVENT",
			"EVERY",
			"EXACT",
			"EXTRA",
			"FAITH",
			"FALSE",
			"FAULT",
			"FIELD",
			"FIFTY",
			"FIGHT",
			"FINAL",
			"FIRST",
			"FLASH",
			"FLOOR",
			"FOCUS",
			"FORCE",
			"FORTY",
			"FORUM",
			"FOUND",
			"FRAME",
			"FRESH",
			"FRONT",
			"FRUIT",
			"FUNNY"
		];
		//#endregion
		//#region src/client/games/wordle/logic.ts
		/**
		* Wordle 纯逻辑：判绿/黄/灰（含重复字母的正确消耗）、键盘提示合并、
		* 猜测合法性（任意等长纯字母词）、mulberry32 种子随机选词。全部为确定性纯函数。
		*/
		/** 各词长对应的候选答案池。 */
		const ANSWERS_BY_LEN = {
			4: ANSWERS_4,
			5: ANSWERS_5,
			6: [
				"ABROAD",
				"ACCEPT",
				"ACCESS",
				"ACROSS",
				"ACTION",
				"ACTIVE",
				"ACTUAL",
				"ADVICE",
				"AFFECT",
				"AFRAID",
				"ANCHOR",
				"ANYWAY",
				"AROUND",
				"ARTIST",
				"ASSUME",
				"ATTACK",
				"AUGUST",
				"AUTHOR",
				"AUTUMN",
				"AVENUE",
				"BACKED",
				"BAKERY",
				"BANKER",
				"BARELY",
				"BATTLE",
				"BEAUTY",
				"BECOME",
				"BEFORE",
				"BEGINS",
				"BEHIND",
				"BELIEF",
				"BETTER",
				"BEYOND",
				"BIGGER",
				"BIRTHS",
				"BLAMED",
				"BOARDS",
				"BORROW",
				"BOTTLE",
				"BOTTOM",
				"BOUGHT",
				"BRANCH",
				"BREATH",
				"BRIDGE",
				"BRIGHT",
				"BROKEN",
				"BUBBLE",
				"BUDGET",
				"BUFFER",
				"BUNDLE",
				"BURNER",
				"BURDEN",
				"BUTTER",
				"BUYING",
				"CABINS",
				"CAMERA",
				"CAMPUS",
				"CANCEL",
				"CANDLE",
				"CANVAS",
				"CARBON",
				"CAREER",
				"CASTLE",
				"CASUAL",
				"CATCHY",
				"CAUGHT",
				"CENTER",
				"CHANGE",
				"CHARGE",
				"CHERRY",
				"CHOOSE",
				"CHOSEN",
				"CHURCH",
				"CIRCLE",
				"CLIENT",
				"CLOSED",
				"CLOTHS",
				"COFFEE",
				"COLUMN",
				"COMBAT",
				"COMING",
				"COMMIT",
				"COMMON",
				"CORNER",
				"COUPLE",
				"COURSE",
				"COUSIN",
				"CREATE",
				"CREDIT",
				"CRISIS",
				"CUSTOM",
				"DAMAGE",
				"DANGER",
				"DEALER",
				"DEBATE",
				"DECADE",
				"DECIDE",
				"DEFEAT",
				"DEFINE",
				"DEGREE",
				"DEMAND",
				"DEPART",
				"DEPEND",
				"DEPUTY",
				"DESIGN",
				"DESIRE",
				"DETAIL",
				"DETECT",
				"DEVICE",
				"DINNER",
				"DIRECT",
				"DIVIDE",
				"DOCTOR",
				"DOLLAR",
				"DOMAIN",
				"DOUBLE",
				"DRIVER",
				"DURING",
				"EARNED",
				"EFFECT"
			]
		};
		/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
		function mulberry32$17(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/**
		* 标准 Wordle 判定：先标绿并消耗对应答案字母，非绿位再按剩余计数标黄；
		* 每个答案字母至多被消耗一次，重复字母不会多标黄。
		* @param guess - 大写字母的猜测词。
		* @param answer - 与 guess 等长的答案。
		* @returns 与 guess 逐位对应的判定。
		*/
		function judge$1(guess, answer) {
			const n = guess.length;
			const verdicts = new Array(n).fill("gray");
			const remaining = /* @__PURE__ */ new Map();
			for (let i = 0; i < n; i += 1) if (guess[i] === answer[i]) verdicts[i] = "green";
			else {
				const a = answer[i];
				remaining.set(a, (remaining.get(a) ?? 0) + 1);
			}
			for (let i = 0; i < n; i += 1) {
				if (verdicts[i] === "green") continue;
				const g = guess[i];
				const left = remaining.get(g) ?? 0;
				if (left > 0) {
					verdicts[i] = "yellow";
					remaining.set(g, left - 1);
				}
			}
			return verdicts;
		}
		/** 判定强度：green > yellow > gray。 */
		const VERDICT_RANK = {
			gray: 1,
			yellow: 2,
			green: 3
		};
		/**
		* 将一次猜测的判定合并进键盘提示：只升级、不降级（green 最强）。
		* @param prev - 现有键盘提示。
		* @param guess - 刚提交的猜测词（与 verdicts 逐位对应）。
		* @param verdicts - judge 对该猜测的判定。
		* @returns 新提示表；不修改 prev。
		*/
		function mergeKeyHints(prev, guess, verdicts) {
			const next = { ...prev };
			for (let i = 0; i < verdicts.length && i < guess.length; i += 1) {
				const letter = guess[i];
				const verdict = verdicts[i];
				const cur = next[letter];
				if (cur === void 0 || VERDICT_RANK[verdict] > VERDICT_RANK[cur]) next[letter] = verdict;
			}
			return next;
		}
		/**
		* 猜测是否合法：恰好 len 个大写字母 A–Z，不要求在词表内。
		* @param w - 待检查的词。
		* @param len - 本关的词长。
		*/
		function isValidGuess(w, len) {
			return new RegExp(`^[A-Z]{${len}}$`).test(w);
		}
		/**
		* 用种子确定性选一个指定词长的答案。
		* @param seed - 整数种子（同种子同词）。
		* @param len - 词长（4 / 5 / 6）。
		* @returns 对应词表中的一个答案。
		*/
		function pickAnswer(seed, len) {
			const answers = ANSWERS_BY_LEN[len] ?? ANSWERS_5;
			const rng = mulberry32$17(seed);
			return answers[Math.floor(rng() * answers.length)];
		}
		/** 屏幕键盘布局；ENTER/BACK 为宽键。 */
		const KEY_ROWS = [
			[
				"Q",
				"W",
				"E",
				"R",
				"T",
				"Y",
				"U",
				"I",
				"O",
				"P"
			],
			[
				"A",
				"S",
				"D",
				"F",
				"G",
				"H",
				"J",
				"K",
				"L"
			],
			[
				"ENTER",
				"Z",
				"X",
				"C",
				"V",
				"B",
				"N",
				"M",
				"BACK"
			]
		];
		const TILE_GAP = 8;
		const GRID_Y0$1 = 48;
		/** 6 列或 7 行时缩小格子，避免与键盘重叠。 */
		const TILE_LARGE = 56;
		const TILE_SMALL = 48;
		const GAP_SMALL = 6;
		const KB_MARGIN = 10;
		const KB_GAP = 6;
		const KEY_H = 44;
		const KB_Y0 = 448;
		const WIDE_KEY_WEIGHT = 1.5;
		/** 键盘按键矩形，按行布局；宽键（ENTER/BACK）占 1.5 个字母位。 */
		const KEY_RECTS = KEY_ROWS.map((row, rowIdx) => {
			const totalWeight = row.reduce((sum, key) => sum + (key.length > 1 ? WIDE_KEY_WEIGHT : 1), 0);
			const unit = (460 - (row.length - 1) * KB_GAP) / totalWeight;
			const y = KB_Y0 + rowIdx * 50;
			let x = KB_MARGIN;
			return row.map((key) => {
				const w = unit * (key.length > 1 ? WIDE_KEY_WEIGHT : 1);
				const rect = {
					key,
					x,
					y,
					w,
					h: KEY_H
				};
				x += w + KB_GAP;
				return rect;
			});
		}).flat();
		/**
		* 屏幕键盘命中检测。
		* @returns 按键名（字母 / 'ENTER' / 'BACK'），未命中返回 null。
		*/
		function keyAt(x, y) {
			for (const rect of KEY_RECTS) if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return rect.key;
			return null;
		}
		const TILE_FONT = "bold 28px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
		const KEY_FONT = "600 14px system-ui, sans-serif";
		/** 判定 → 格子填充色；灰格用暗块。 */
		const VERDICT_FILL = {
			green: THEME.good,
			yellow: THEME.gold,
			gray: "#3c3c50"
		};
		function drawTile$2(ctx, x, y, tile, letter, fill) {
			roundRectPath(ctx, x, y, tile, tile, 8);
			if (fill === null) {
				ctx.fillStyle = THEME.panel;
				ctx.fill();
				ctx.strokeStyle = THEME.panelEdge;
				ctx.lineWidth = 1.5;
				ctx.stroke();
			} else {
				ctx.fillStyle = fill;
				ctx.fill();
			}
			if (letter !== "") {
				ctx.fillStyle = THEME.text;
				ctx.font = TILE_FONT;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(letter, x + tile / 2, y + tile / 2 + 2);
			}
		}
		function drawKeyboard(ctx, view) {
			ctx.font = KEY_FONT;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			for (const rect of KEY_RECTS) {
				const hint = view.keyHints[rect.key];
				roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 7);
				ctx.fillStyle = hint === void 0 ? THEME.panel : VERDICT_FILL[hint];
				ctx.fill();
				ctx.strokeStyle = rect.key.length > 1 ? THEME.accents[1] : THEME.panelEdge;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.fillStyle = THEME.text;
				ctx.fillText(rect.key === "BACK" ? "⌫" : rect.key === "ENTER" ? "ENTER" : rect.key, rect.x + rect.w / 2, rect.y + rect.h / 2);
			}
			ctx.textBaseline = "alphabetic";
		}
		/**
		* 绘制一帧。
		* @param shakeDx - 无效猜测的水平抖动偏移（px）。
		*/
		function renderWordle(ctx, view, shakeDx = 0) {
			ctx.clearRect(0, 0, 480, 620);
			drawBackground(ctx, 480, 620);
			const compact = view.len >= 6 || view.tries >= 7;
			const tile = compact ? TILE_SMALL : TILE_LARGE;
			const gap = compact ? GAP_SMALL : TILE_GAP;
			const gridX0 = (480 - (view.len * tile + (view.len - 1) * gap)) / 2;
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, 480, 30);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.strokeRect(.5, .5, 479, 29);
			hudPair(ctx, 10, 20, "关卡 ", String(view.level), "left");
			hudPair(ctx, 214, 20, "连胜 ", String(view.streak), "left", view.streak > 0 ? THEME.gold : THEME.text);
			hudPair(ctx, 470, 20, "行 ", `${Math.min(view.rows.length + 1, view.tries)}/${view.tries}`, "right");
			ctx.save();
			ctx.translate(shakeDx, 0);
			for (let r = 0; r < view.tries; r += 1) {
				const y = GRID_Y0$1 + r * (tile + gap);
				const done = view.rows[r];
				if (done !== void 0) for (let c = 0; c < view.len; c += 1) drawTile$2(ctx, gridX0 + c * (tile + gap), y, tile, done.guess[c] ?? "", VERDICT_FILL[done.verdicts[c] ?? "gray"]);
				else if (r === view.rows.length && view.status === "playing") for (let c = 0; c < view.len; c += 1) {
					const x = gridX0 + c * (tile + gap);
					const ch = view.current[c] ?? "";
					if (ch !== "") {
						glow(ctx, THEME.accents[1], 8);
						drawTile$2(ctx, x, y, tile, ch, THEME.panel);
						noGlow(ctx);
					} else drawTile$2(ctx, x, y, tile, "", null);
				}
				else for (let c = 0; c < view.len; c += 1) drawTile$2(ctx, gridX0 + c * (tile + gap), y, tile, "", null);
			}
			ctx.restore();
			drawKeyboard(ctx, view);
			if (view.toast !== "") {
				ctx.font = "600 14px system-ui, sans-serif";
				ctx.textAlign = "center";
				glow(ctx, THEME.bad, 8);
				ctx.fillStyle = THEME.bad;
				ctx.fillText(view.toast, 240, 434);
				noGlow(ctx);
			}
			if (view.status === "won") drawOverlay(ctx, 480, 620, "猜对了！", `${view.rows.length}/${view.tries} · 空格 / 点击再来一局`, THEME.good);
			else if (view.status === "lost") drawOverlay(ctx, 480, 620, `答案是 ${view.answer}`, "空格 / 点击再来一局", THEME.bad);
			else if (view.paused) drawOverlay(ctx, 480, 620, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/level-progress.ts
		/**
		* Shared level-progress persistence for the games panel: the highest level
		* reached per game id, stored under `dsh-minigames:level:<gameId>` in
		* localStorage. Games read it at mount (start where the player left off)
		* and write it whenever they advance. A page refresh or game switch keeps
		* the progress; the stored value is a plain integer ≥ 1.
		*
		* The storage backend is injectable so the logic is unit-testable without a
		* DOM (production callers pass nothing and get the browser's localStorage).
		*/
		const PREFIX = "dsh-minigames:level:";
		function defaultStorage() {
			try {
				if (typeof window !== "undefined" && window.localStorage !== void 0) return window.localStorage;
			} catch {}
			return null;
		}
		/** Highest level reached for `gameId` (1 when nothing is stored). */
		function readLevel(gameId, storage = defaultStorage()) {
			try {
				const saved = storage?.getItem(PREFIX + gameId) ?? null;
				if (saved !== null) {
					const n = Number(saved);
					if (Number.isFinite(n) && n >= 1) return Math.floor(n);
				}
			} catch {}
			return 1;
		}
		/** Persist `level` when it exceeds the stored value (progress never regresses). */
		function saveLevel(gameId, level, storage = defaultStorage()) {
			if (level <= readLevel(gameId, storage)) return;
			try {
				storage?.setItem(PREFIX + gameId, String(Math.floor(level)));
			} catch {}
		}
		//#endregion
		//#region src/client/games/wordle/index.ts
		const SHAKE_MS$1 = 260;
		const TOAST_MS$3 = 1300;
		/** 关卡循环：L1=4 字母/6 次，L2=5 字母/6 次，L3=6 字母/7 次，L4 起循环。 */
		const LEVEL_CYCLE = [
			{
				len: 4,
				tries: 6
			},
			{
				len: 5,
				tries: 6
			},
			{
				len: 6,
				tries: 7
			}
		];
		/** 关卡（1 起）对应的词长与机会数。 */
		function levelConfig(level) {
			return LEVEL_CYCLE[(level - 1) % LEVEL_CYCLE.length];
		}
		/** 每局新种子的来源：时间戳异或递增计数器。 */
		let restartCounter$1 = 0;
		function nextSeed$1() {
			restartCounter$1 = restartCounter$1 + 1 >>> 0;
			return (Date.now() ^ Math.imul(restartCounter$1, 2654435769)) >>> 0;
		}
		function createWordleGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 620);
			if (fit === null) throw new Error("dsh-minigames: wordle needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = readLevel("wordle");
			let { len, tries } = levelConfig(level);
			let answer = "";
			let rows = [];
			let current = "";
			let keyHints = {};
			let status = "playing";
			let streak = 0;
			let shakeMs = 0;
			let toast = "";
			let toastMs = 0;
			let running = false;
			let lastScore = -1;
			const particles = createParticles();
			const newRound = () => {
				({len, tries} = levelConfig(level));
				answer = pickAnswer(nextSeed$1(), len);
				rows = [];
				current = "";
				keyHints = {};
				status = "playing";
				shakeMs = 0;
				toast = "";
				toastMs = 0;
			};
			newRound();
			const reportScore = () => {
				if (streak === lastScore) return;
				lastScore = streak;
				options?.onScore?.(streak);
			};
			/** 无效输入：抖动 + 短提示，不消耗行。 */
			const reject = (text) => {
				shakeMs = SHAKE_MS$1;
				toast = text;
				toastMs = TOAST_MS$3;
				loop.markDirty();
			};
			const submit = () => {
				if (current.length < len) {
					reject(`不足 ${len} 个字母`);
					return;
				}
				if (!isValidGuess(current, len)) {
					reject("仅限 A–Z 字母");
					return;
				}
				const verdicts = judge$1(current, answer);
				keyHints = mergeKeyHints(keyHints, current, verdicts);
				rows = [...rows, {
					guess: current,
					verdicts
				}];
				if (verdicts.every((v) => v === "green")) {
					status = "won";
					streak += 1;
					level += 1;
					saveLevel("wordle", level);
					reportScore();
					const rowY = 48 + (rows.length - 1) * 64 + 28;
					particles.burst(240, rowY, accent(2), 26, 170);
				} else if (rows.length >= tries) {
					status = "lost";
					level = 1;
				}
				current = "";
			};
			/** 处理一次按键：字母 / 'ENTER' / 'BACK'。 */
			const inputKey = (key) => {
				if (status !== "playing") return;
				if (key === "ENTER") submit();
				else if (key === "BACK") current = current.slice(0, -1);
				else if (/^[A-Z]$/.test(key) && current.length < len) current += key;
				else return;
				loop.markDirty();
			};
			const restart = () => {
				if (status === "lost" && streak !== 0) {
					streak = 0;
					reportScore();
				}
				newRound();
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.ctrlKey || event.altKey || event.metaKey) return;
				const letter = /^[a-zA-Z]$/.test(event.key) ? event.key.toUpperCase() : null;
				if (event.code === "Space") {
					if (status !== "playing") {
						event.preventDefault();
						restart();
					}
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					if (running && status === "playing") inputKey("ENTER");
					return;
				}
				if (event.key === "Backspace") {
					event.preventDefault();
					if (running && status === "playing") inputKey("BACK");
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					newRound();
					loop.markDirty();
					return;
				}
				if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
					return;
				}
				if (letter !== null) {
					event.preventDefault();
					if (running && status === "playing") inputKey(letter);
				}
			};
			const onMouseDown = (event) => {
				if (!running) return;
				if (status !== "playing") {
					restart();
					return;
				}
				const rect = canvas.getBoundingClientRect();
				const key = keyAt((event.clientX - rect.left) * 480 / rect.width, (event.clientY - rect.top) * 620 / rect.height);
				if (key !== null) inputKey(key);
			};
			const view = () => ({
				rows,
				current,
				keyHints,
				status,
				answer,
				len,
				tries,
				level,
				streak,
				toast,
				paused: !running
			});
			const loop = createFrameLoop((f) => {
				const dtMs = f.dt * 1e3;
				shakeMs = Math.max(0, shakeMs - dtMs);
				toastMs = Math.max(0, toastMs - dtMs);
				if (toastMs === 0) toast = "";
				const animating = shakeMs > 0 || toastMs > 0 || particles.size() > 0;
				if (f.render || animating) {
					const shakeDx = shakeMs > 0 ? Math.sin(shakeMs / 16) * 5 : 0;
					renderWordle(ctx, view(), shakeDx);
					particles.tick(ctx, dtMs);
					if (animating) loop.markDirty();
				}
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				loop.pause();
				renderWordle(ctx, view());
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderWordle(ctx, view());
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const wordleGame = {
			id: "wordle",
			title: "Wordle 猜词",
			icon: "🔤",
			description: "按关卡猜 4/5/6 字母单词，任意等长字母词都可提交，绿=位置对，黄=字母对，灰=没有。",
			controls: [
				"键盘 / 点击屏幕键盘：输入",
				"Enter：提交 · Backspace：删除",
				"空格 / 点击：再来一局",
				"R：重开本关 · P：暂停"
			],
			create: createWordleGame
		};
		/** Run lengths of one line; an all-empty line yields [0]. */
		function lineClue(line) {
			const runs = [];
			let run = 0;
			for (const v of line) if (v) run += 1;
			else if (run > 0) {
				runs.push(run);
				run = 0;
			}
			if (run > 0) runs.push(run);
			return runs.length === 0 ? [0] : runs;
		}
		/** Derive the row and column clues of a square pattern. */
		function cluesFrom(pattern) {
			const rows = pattern.map(lineClue);
			const cols = [];
			for (let c = 0; c < 10; c += 1) cols.push(lineClue(pattern.map((row) => row[c])));
			return {
				rows,
				cols
			};
		}
		/** mulberry32 PRNG: small, fast, deterministic per seed. */
		function mulberry32$16(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 >>> 0;
				let t = a;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** All fillings of a line that satisfy `runs` and contradict no known cell. */
		function enumeratePlacements(runs, known) {
			const n = known.length;
			const out = [];
			const line = Array(n).fill(false);
			/** Space the remaining runs (incl. separators) need from `pos` on. */
			const needFrom = (idx) => {
				let need = -1;
				for (let i = idx; i < runs.length; i += 1) need += runs[i] + 1;
				return need;
			};
			const rec = (idx, pos) => {
				if (idx === runs.length) {
					for (let i = pos; i < n; i += 1) {
						if (known[i] === true) return;
						line[i] = false;
					}
					out.push([...line]);
					return;
				}
				const run = runs[idx];
				const slack = n - pos - needFrom(idx);
				for (let s = 0; s <= slack; s += 1) {
					let ok = true;
					for (let i = 0; i < s; i += 1) {
						if (known[pos + i] === true) {
							ok = false;
							break;
						}
						line[pos + i] = false;
					}
					if (!ok) continue;
					const start = pos + s;
					for (let i = 0; i < run; i += 1) {
						if (known[start + i] === false) {
							ok = false;
							break;
						}
						line[start + i] = true;
					}
					if (!ok) continue;
					const after = start + run;
					if (idx < runs.length - 1) {
						if (after < n && known[after] !== true) {
							line[after] = false;
							rec(idx + 1, after + 1);
						}
					} else rec(idx + 1, after);
				}
			};
			rec(0, 0);
			return out;
		}
		/**
		* Deduce every cell of a line that all valid placements agree on.
		* Contradictory input (no valid placement) returns `known` unchanged.
		* @param clue - run lengths for the line ([0] means empty).
		* @param known - current deductions for the line.
		* @returns the refined line (null where still ambiguous).
		*/
		function lineSolveLine(clue, known) {
			const placements = enumeratePlacements(clue.length === 1 && clue[0] === 0 ? [] : clue, known);
			if (placements.length === 0) return [...known];
			return placements[0].map((v, i) => placements.every((p) => p[i] === v) ? v : null);
		}
		/**
		* Iterate the line solver over all rows and columns from an empty grid
		* until no cell changes; classic nonogram line-deduction convergence.
		* @returns the deduced grid, null where the clues are insufficient.
		*/
		function solveFromClues(clues) {
			const grid = Array.from({ length: 10 }, () => Array(10).fill(null));
			let changed = true;
			while (changed) {
				changed = false;
				for (let r = 0; r < 10; r += 1) {
					const solved = lineSolveLine(clues.rows[r], grid[r]);
					if (solved.some((v, c) => v !== null && grid[r][c] === null)) changed = true;
					grid[r] = solved;
				}
				for (let c = 0; c < 10; c += 1) {
					const col = grid.map((row) => row[c]);
					const solved = lineSolveLine(clues.cols[c], col);
					for (let r = 0; r < 10; r += 1) {
						const v = solved[r];
						if (v !== void 0 && v !== null) {
							if (grid[r][c] === null) changed = true;
							grid[r][c] = v;
						}
					}
				}
			}
			return grid;
		}
		/** Whether the line solver alone recovers the whole pattern from its clues. */
		function uniquelySolvable(pattern) {
			return solveFromClues(cluesFrom(pattern)).every((row, r) => row.every((v, c) => v === pattern[r][c]));
		}
		/** Cap on uniqueness re-rolls; levels are 10x10 so this always terminates early. */
		const MAX_RETRIES = 64;
		/**
		* A deterministic 10x10 pattern for one seed: ~50-60% density, re-rolled
		* (advancing the PRNG) until its clues uniquely determine it by line solving.
		*/
		function makePattern(seed) {
			const rng = mulberry32$16(seed);
			let pattern = [];
			for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
				const p = .5 + rng() * .1;
				pattern = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => rng() < p));
				const density = pattern.flat().filter(Boolean).length / 100;
				if (density < .45 || density > .65) continue;
				if (uniquelySolvable(pattern)) return pattern;
			}
			return pattern;
		}
		/**
		* Win check: filled cells must exactly match the pattern; crosses (2) and
		* empties (0) are both "not filled" and never block or grant a win.
		*/
		function checkWin(cells, pattern) {
			return cells.every((row, r) => row.every((cell, c) => cell === 1 === pattern[r][c]));
		}
		const LOGICAL_W$16 = 432;
		const LOGICAL_H$13 = 446;
		const FILL = accent(0);
		const GRID = THEME.panelEdge;
		const EDGE = THEME.gold;
		/** Board origin (past HUD + column clues). */
		const OX$1 = 92;
		const OY$1 = 106;
		const particles$3 = createParticles();
		let prevWon$1 = false;
		let lastFrame$2 = 0;
		/** Grid cell at logical coordinates, or null outside the board. */
		function cellAt$3(x, y) {
			const c = Math.floor((x - OX$1) / 34);
			const r = Math.floor((y - OY$1) / 34);
			if (r < 0 || r >= 10 || c < 0 || c >= 10) return null;
			return {
				r,
				c
			};
		}
		/** Whether the player's current marks in a line already satisfy its clue. */
		function lineSatisfied(cells, index, vertical, clue) {
			const line = [];
			for (let i = 0; i < 10; i += 1) {
				const cell = vertical ? cells[i][index] : cells[index][i];
				line.push(cell === 1);
			}
			const runs = [];
			let run = 0;
			for (const v of line) if (v) run += 1;
			else if (run > 0) {
				runs.push(run);
				run = 0;
			}
			if (run > 0) runs.push(run);
			const got = runs.length === 0 ? [0] : runs;
			return got.length === clue.length && got.every((v, i) => v === clue[i]);
		}
		/** Draw one frame. */
		function renderNonogram(ctx, cells, clues, cursor, level, elapsed, paused, winText) {
			ctx.clearRect(0, 0, LOGICAL_W$16, LOGICAL_H$13);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$2 === 0 ? 16 : now - lastFrame$2);
			lastFrame$2 = now;
			drawBackground(ctx, LOGICAL_W$16, LOGICAL_H$13);
			ctx.fillStyle = THEME.panel;
			roundRectPath(ctx, 94, 108, 336, 336, 10);
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.stroke();
			if (cursor !== null && winText === null) {
				ctx.fillStyle = "rgba(122,162,247,0.14)";
				glow(ctx, accent(0), 12);
				roundRectPath(ctx, OX$1 + cursor.c * 34 + 2, OY$1 + cursor.r * 34 + 2, 30, 30, 8);
				ctx.fill();
				noGlow(ctx);
			}
			for (let r = 0; r < 10; r += 1) for (let c = 0; c < 10; c += 1) {
				const cell = cells[r][c];
				if (cell === 0) continue;
				const x = OX$1 + c * 34;
				const y = OY$1 + r * 34;
				if (cell === 1) {
					ctx.fillStyle = FILL;
					glow(ctx, FILL, 5);
					roundRectPath(ctx, x + 4, y + 4, 26, 26, 6);
					ctx.fill();
					noGlow(ctx);
				} else {
					ctx.strokeStyle = THEME.bad;
					ctx.lineWidth = 2.5;
					ctx.beginPath();
					ctx.moveTo(x + 9, y + 9);
					ctx.lineTo(x + 34 - 9, y + 34 - 9);
					ctx.moveTo(x + 34 - 9, y + 9);
					ctx.lineTo(x + 9, y + 34 - 9);
					ctx.stroke();
				}
			}
			ctx.strokeStyle = GRID;
			ctx.lineWidth = 1;
			for (let i = 0; i <= 10; i += 1) {
				if (i % 5 === 0) continue;
				ctx.beginPath();
				ctx.moveTo(OX$1 + i * 34, OY$1);
				ctx.lineTo(OX$1 + i * 34, 446);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(OX$1, OY$1 + i * 34);
				ctx.lineTo(432, OY$1 + i * 34);
				ctx.stroke();
			}
			ctx.strokeStyle = EDGE;
			ctx.lineWidth = 2.5;
			for (let i = 0; i <= 10; i += 5) {
				ctx.beginPath();
				ctx.moveTo(OX$1 + i * 34, OY$1);
				ctx.lineTo(OX$1 + i * 34, 446);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(OX$1, OY$1 + i * 34);
				ctx.lineTo(432, OY$1 + i * 34);
				ctx.stroke();
			}
			ctx.font = "bold 13px ui-monospace, monospace";
			ctx.textBaseline = "middle";
			const rowClues = clues.rows;
			for (let r = 0; r < 10; r += 1) {
				const clue = rowClues[r];
				ctx.fillStyle = lineSatisfied(cells, r, false, clue) ? THEME.textMuted : THEME.text;
				ctx.textAlign = "right";
				const text = clue.join(" ");
				ctx.fillText(text, 84, OY$1 + r * 34 + 17);
			}
			for (let c = 0; c < 10; c += 1) {
				const clue = clues.cols[c];
				ctx.fillStyle = lineSatisfied(cells, c, true, clue) ? THEME.textMuted : THEME.text;
				ctx.textAlign = "center";
				const top = 100 - clue.length * 14;
				clue.forEach((n, i) => {
					ctx.fillText(String(n), OX$1 + c * 34 + 17, top + i * 14 + 7);
				});
			}
			ctx.textBaseline = "alphabetic";
			const won = winText !== null;
			if (won && !prevWon$1) particles$3.burst(262, 276, THEME.gold, 26, 170);
			prevWon$1 = won;
			particles$3.tick(ctx, dt);
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, LOGICAL_W$16, 30);
			const s = Math.floor(elapsed);
			const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
			hudPair(ctx, 10, 20, "关卡", String(level), "left");
			hudPair(ctx, 422, 20, "⏱ ", clock, "right");
			if (winText !== null) {
				ctx.save();
				ctx.translate(0, 30);
				drawOverlay(ctx, LOGICAL_W$16, 416, "完成！", `${winText} · 即将进入下一关`, THEME.gold);
				ctx.restore();
			} else if (paused) {
				ctx.save();
				ctx.translate(0, 30);
				drawOverlay(ctx, LOGICAL_W$16, 416, "已暂停", "面板恢复后继续", THEME.text);
				ctx.restore();
			}
		}
		//#endregion
		//#region src/client/games/nonogram/index.ts
		const ADVANCE_MS$10 = 1500;
		/** Deterministic per-level seed; one seed per level keeps replays identical. */
		function levelSeed$6(level) {
			return level * 2654435769 >>> 0;
		}
		function emptyCells() {
			return Array.from({ length: 10 }, () => Array(10).fill(0));
		}
		function createNonogramGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$16, LOGICAL_H$13);
			if (fit === null) throw new Error("dsh-minigames: nonogram needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = readLevel("nonogram");
			let pattern = makePattern(levelSeed$6(level));
			let clues = cluesFrom(pattern);
			let cells = emptyCells();
			let cursor = {
				r: 0,
				c: 0
			};
			let elapsed = 0;
			/** HUD 当前已显示的整秒数，用于按秒置脏。 */
			let shownSec = 0;
			let winText = null;
			let running = false;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (level === lastScore) return;
				lastScore = level;
				options?.onScore?.(level);
			};
			const startLevel = (next) => {
				level = next;
				pattern = makePattern(levelSeed$6(level));
				clues = cluesFrom(pattern);
				cells = emptyCells();
				cursor = {
					r: 0,
					c: 0
				};
				elapsed = 0;
				winText = null;
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					const next = level % 6 + 1;
					saveLevel("nonogram", next);
					startLevel(next);
				}, delayMs);
			};
			/** Toggle fill at a cell (empty/crossed → filled, filled → empty). */
			const fillAt = (r, c) => {
				cells[r][c] = cells[r][c] === 1 ? 0 : 1;
				loop.markDirty();
				checkWinNow();
			};
			/** Toggle the X mark at a cell (empty → crossed, crossed → empty). */
			const crossAt = (r, c) => {
				cells[r][c] = cells[r][c] === 2 ? 0 : 2;
				loop.markDirty();
			};
			const checkWinNow = () => {
				if (winText !== null || !checkWin(cells, pattern)) return;
				winText = `第 ${level} 关完成 · 用时 ${Math.floor(elapsed)} 秒`;
				loop.markDirty();
				reportScore();
				if (running) scheduleAdvance(ADVANCE_MS$10);
				else advanceRemaining = ADVANCE_MS$10;
			};
			const onMouseDown = (event) => {
				if (!running || winText !== null) return;
				const rect = canvas.getBoundingClientRect();
				const cell = cellAt$3((event.clientX - rect.left) * LOGICAL_W$16 / rect.width, (event.clientY - rect.top) * LOGICAL_H$13 / rect.height);
				if (cell === null) return;
				cursor = cell;
				loop.markDirty();
				if (event.button === 2 || event.shiftKey) crossAt(cell.r, cell.c);
				else if (event.button === 0) fillAt(cell.r, cell.c);
			};
			const onContextMenu = (event) => {
				event.preventDefault();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					startLevel(level);
					return;
				}
				if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
					return;
				}
				if (!running || winText !== null) return;
				if (event.code.startsWith("Arrow")) {
					event.preventDefault();
					if (event.code === "ArrowUp") cursor = {
						r: Math.max(0, cursor.r - 1),
						c: cursor.c
					};
					else if (event.code === "ArrowDown") cursor = {
						r: Math.min(9, cursor.r + 1),
						c: cursor.c
					};
					else if (event.code === "ArrowLeft") cursor = {
						r: cursor.r,
						c: Math.max(0, cursor.c - 1)
					};
					else cursor = {
						r: cursor.r,
						c: Math.min(9, cursor.c + 1)
					};
					loop.markDirty();
				} else if (event.code === "Space") {
					event.preventDefault();
					if (event.shiftKey) crossAt(cursor.r, cursor.c);
					else fillAt(cursor.r, cursor.c);
				}
			};
			const loop = createFrameLoop((f) => {
				if (winText === null) {
					elapsed += f.dt;
					if (Math.floor(elapsed) !== shownSec) {
						shownSec = Math.floor(elapsed);
						loop.markDirty();
					}
				}
				if (f.render) renderNonogram(ctx, cells, clues, cursor, level, elapsed, false, winText);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderNonogram(ctx, cells, clues, cursor, level, elapsed, true, winText);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("contextmenu", onContextMenu);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					canvas.removeEventListener("contextmenu", onContextMenu);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const nonogramGame = {
			id: "nonogram",
			title: "数织 Nonogram",
			icon: "🧩",
			description: "按行列数字提示涂满方格，还原隐藏图案；每关唯一解。",
			controls: [
				"点击 / 空格：涂格（再按取消）",
				"右键 / Shift+空格：标记 ✗",
				"方向键：移动光标",
				"R：重开本关",
				"P：暂停"
			],
			create: createNonogramGame
		};
		/** True where (row, col) is a hole of the English cross. */
		function isCrossHole(r, c) {
			return r >= 2 && r <= 4 || c >= 2 && c <= 4;
		}
		/** 49 flags: 1 at each of the 33 holes, 0 at the four corner blocks. */
		const BOARD_MASK = (() => {
			const mask = /* @__PURE__ */ new Uint8Array(49);
			for (let r = 0; r < 7; r += 1) for (let c = 0; c < 7; c += 1) if (isCrossHole(r, c)) mask[r * 7 + c] = 1;
			return mask;
		})();
		/** Is `index` a hole of the board? */
		function isHole(index) {
			return index >= 0 && index < 49 && BOARD_MASK[index] === 1;
		}
		/** Number of pegs currently on the board. */
		function pegCount(board) {
			let n = 0;
			for (let i = 0; i < board.length; i += 1) n += board[i] ?? 0;
			return n;
		}
		const LEVELS$2 = [
			{
				name: "标准局 · 中心收官",
				goal: "center"
			},
			{
				name: "标准局 · 任意收官",
				goal: "any"
			},
			{
				name: "十字局",
				goal: "any"
			}
		];
		function boardWithPegs(pegAt) {
			const board = /* @__PURE__ */ new Uint8Array(49);
			for (let r = 0; r < 7; r += 1) for (let c = 0; c < 7; c += 1) if (isCrossHole(r, c) && pegAt(r, c)) board[r * 7 + c] = 1;
			return board;
		}
		/** Start board per level index (0..2); matches {@link LEVELS}. */
		const START_BOARDS = [
			boardWithPegs((r, c) => r * 7 + c !== 24),
			boardWithPegs((r, c) => r * 7 + c !== 24),
			boardWithPegs((r, c) => (r === 3 || c === 3) && r * 7 + c !== 24)
		];
		/** The index jumped over when moving from `from` to `to`, or null if not a 2-step orthogonal line. */
		function jumpedPeg(from, to) {
			const fr = Math.floor(from / 7), fc = from % 7;
			const tr = Math.floor(to / 7), tc = to % 7;
			const dr = tr - fr, dc = tc - fc;
			if (Math.abs(dr) === 2 && dc === 0) return (fr + dr / 2) * 7 + fc;
			if (Math.abs(dc) === 2 && dr === 0) return fr * 7 + (fc + dc / 2);
			return null;
		}
		/**
		* Apply a jump: peg at `from` leaps over the adjacent peg into empty `to`,
		* removing the jumped peg.
		* @returns the new board, or null when the move is illegal (off-board,
		*   off-mask, no source peg, no jumped peg, or occupied landing).
		*/
		function applyMove$2(board, from, to) {
			if (!isHole(from) || !isHole(to) || from === to) return null;
			const mid = jumpedPeg(from, to);
			if (mid === null || !isHole(mid)) return null;
			if (board[from] !== 1 || board[mid] !== 1 || board[to] !== 0) return null;
			const next = board.slice();
			next[from] = 0;
			next[mid] = 0;
			next[to] = 1;
			return next;
		}
		/** All legal [from, to] jumps on `board`. */
		function legalMoves$2(board) {
			const moves = [];
			for (let from = 0; from < board.length; from += 1) {
				if (board[from] !== 1) continue;
				const r = Math.floor(from / 7), c = from % 7;
				for (const [dr, dc] of [
					[-2, 0],
					[2, 0],
					[0, -2],
					[0, 2]
				]) {
					const tr = r + dr, tc = c + dc;
					if (tr < 0 || tr >= 7 || tc < 0 || tc >= 7) continue;
					if (applyMove$2(board, from, tr * 7 + tc) !== null) moves.push([from, tr * 7 + tc]);
				}
			}
			return moves;
		}
		/**
		* Win check for a level index into {@link LEVELS}.
		* @returns true when the board meets the level goal (1 peg; L1 also requires it at center).
		*/
		function isWin$1(board, level) {
			const goal = LEVELS$2[level]?.goal;
			if (goal === void 0) return false;
			if (pegCount(board) !== 1) return false;
			return goal === "any" || board[24] === 1;
		}
		const LOGICAL_W$15 = 258;
		const LOGICAL_H$12 = 308;
		/** Center of hole `index` in logical space. */
		function holeCenter(index) {
			return {
				x: 10 + index % 7 * 34 + 17,
				y: 42 + Math.floor(index / 7) * 34 + 17
			};
		}
		/** Which hole index a logical-space point lands on (or null outside holes). */
		function holeAt(x, y) {
			const c = Math.floor((x - 10) / 34);
			const r = Math.floor((y - 32 - 10) / 34);
			if (r < 0 || r >= 7 || c < 0 || c >= 7) return null;
			const index = r * 7 + c;
			return BOARD_MASK[index] === 1 ? index : null;
		}
		/** Draw one frame of the board; overlays cover the scene on win/stuck/pause. */
		function renderPeg(ctx, state, paused) {
			const { board, cursor, selected, hints } = state;
			ctx.clearRect(0, 0, LOGICAL_W$15, LOGICAL_H$12);
			drawBackground(ctx, LOGICAL_W$15, LOGICAL_H$12);
			hudPair(ctx, 10, 21, `关卡 ${state.levelDisplay} `, state.levelName);
			hudPair(ctx, 248, 21, "剩余棋子 ", String(pegCount(board)), "right", THEME.gold);
			for (let i = 0; i < board.length; i += 1) {
				if (BOARD_MASK[i] !== 1) continue;
				const { x, y } = holeCenter(i);
				ctx.fillStyle = THEME.panel;
				ctx.beginPath();
				ctx.arc(x, y, 13, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = THEME.panelEdge;
				ctx.lineWidth = 1;
				ctx.stroke();
				if (board[i] === 1) {
					const isSelected = selected === i;
					const color = isSelected ? THEME.gold : accent(i);
					glow(ctx, color, isSelected ? 18 : 6);
					ctx.fillStyle = color;
					ctx.beginPath();
					ctx.arc(x, y, isSelected ? 11 : 9, 0, Math.PI * 2);
					ctx.fill();
					noGlow(ctx);
				}
				if (hints.includes(i)) {
					ctx.strokeStyle = THEME.gold;
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.arc(x, y, 5, 0, Math.PI * 2);
					ctx.stroke();
				}
				if (cursor === i && selected !== i) {
					ctx.strokeStyle = THEME.text;
					ctx.lineWidth = 1.5;
					ctx.setLineDash([4, 3]);
					ctx.beginPath();
					ctx.arc(x, y, 15, 0, Math.PI * 2);
					ctx.stroke();
					ctx.setLineDash([]);
				}
			}
			if (state.toast !== null) {
				ctx.textAlign = "center";
				ctx.font = "600 12px system-ui, sans-serif";
				ctx.fillStyle = THEME.bad;
				ctx.fillText(state.toast, LOGICAL_W$15 / 2, 304);
			}
			if (state.win) drawOverlay(ctx, LOGICAL_W$15, LOGICAL_H$12, "完美！", "剩 1 子 · 即将进入下一关 · R 重开本关", THEME.gold);
			else if (state.stuck) drawOverlay(ctx, LOGICAL_W$15, LOGICAL_H$12, "无路可走", `清掉 ${String(state.cleared)} 子 · Z 回退 · R 重开`, THEME.bad);
			else if (paused) drawOverlay(ctx, LOGICAL_W$15, LOGICAL_H$12, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/peg/index.ts
		const ADVANCE_MS$9 = 1500;
		const TOAST_MS$2 = 900;
		/** Undo history cap: rewind stays bounded and cheap. */
		const MAX_HISTORY$2 = 200;
		function createPegGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$15, LOGICAL_H$12);
			if (fit === null) throw new Error("dsh-minigames: peg needs a 2d canvas context");
			const ctx = fit.ctx;
			const history = [];
			let level = 0;
			let board = START_BOARDS[0].slice();
			let cursor = 24;
			let selected = null;
			let toast = null;
			let toastTimer = 0;
			let running = false;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScore = -1;
			const particles = createParticles();
			const won = () => isWin$1(board, level);
			const stuck = () => !won() && pegCount(board) > 1 && legalMoves$2(board).length === 0;
			const clearedPegs = () => pegCount(START_BOARDS[level]) - pegCount(board);
			const reportScore = () => {
				const score = clearedPegs();
				if (score <= lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const showToast = (text) => {
				toast = text;
				clearTimeout(toastTimer);
				toastTimer = window.setTimeout(() => {
					toast = null;
					toastTimer = 0;
					loop.markDirty();
				}, TOAST_MS$2);
			};
			const startLevel = (next) => {
				level = (next % LEVELS$2.length + LEVELS$2.length) % LEVELS$2.length;
				board = START_BOARDS[level].slice();
				cursor = 24;
				selected = null;
				history.length = 0;
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					startLevel(level + 1);
				}, delayMs);
			};
			const hints = () => selected === null ? [] : legalMoves$2(board).filter(([from]) => from === selected).map(([, to]) => to);
			/** Click/Enter on a hole: pick a peg, re-pick another peg, or land a jump. */
			const activate = (index) => {
				if (won() || stuck()) return;
				if (selected === null) {
					if (board[index] === 1) selected = index;
					else {
						showToast("先选一枚棋子");
						return;
					}
					loop.markDirty();
					return;
				}
				if (board[index] === 1) {
					selected = index;
					loop.markDirty();
					return;
				}
				const next = applyMove$2(board, selected, index);
				if (next === null) {
					showToast("不能跳到这里");
					return;
				}
				history.push({ board });
				if (history.length > MAX_HISTORY$2) history.shift();
				const center = holeCenter(index);
				const mid = jumpedPeg(selected, index);
				const midC = holeCenter(mid);
				particles.burst(midC.x, midC.y, accent(mid), 8, 110);
				board = next;
				selected = null;
				cursor = index;
				if (won() || stuck()) reportScore();
				if (won()) {
					particles.burst(center.x, center.y, THEME.gold, 16, 150);
					if (running) scheduleAdvance(ADVANCE_MS$9);
					else advanceRemaining = ADVANCE_MS$9;
				}
				loop.markDirty();
			};
			/**
			* Rewind the last jump. A STUCK (dead-end) board is rewindable — that is
			* the whole point of undo after a dead end. A WIN is final (reverting it
			* would let the player re-play the winning move for score).
			*/
			const undo = () => {
				if (won()) return;
				const entry = history.pop();
				if (entry === void 0) return;
				board = entry.board;
				selected = null;
				loop.markDirty();
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const index = holeAt((event.clientX - rect.left) * LOGICAL_W$15 / rect.width, (event.clientY - rect.top) * LOGICAL_H$12 / rect.height);
				if (index !== null) {
					cursor = index;
					loop.markDirty();
					activate(index);
				}
			};
			/** Step the cursor to the nearest hole in a direction, or stay if none. */
			const stepCursor = (dr, dc) => {
				let r = Math.floor(cursor / 7);
				let c = cursor % 7;
				for (;;) {
					r += dr;
					c += dc;
					if (r < 0 || r >= 7 || c < 0 || c >= 7) return;
					const index = r * 7 + c;
					if (BOARD_MASK[index] === 1) {
						cursor = index;
						loop.markDirty();
						return;
					}
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					startLevel(level);
				} else if (event.code === "KeyZ" || event.code === "Backspace") {
					event.preventDefault();
					if (!running) return;
					undo();
				} else if (event.code === "Escape") {
					event.preventDefault();
					if (!running) return;
					selected = null;
					loop.markDirty();
				} else if (event.code === "Enter" || event.code === "Space") {
					event.preventDefault();
					if (!running) return;
					activate(cursor);
				} else if (event.code.startsWith("Arrow")) {
					event.preventDefault();
					if (!running) return;
					if (event.code === "ArrowUp") stepCursor(-1, 0);
					else if (event.code === "ArrowDown") stepCursor(1, 0);
					else if (event.code === "ArrowLeft") stepCursor(0, -1);
					else if (event.code === "ArrowRight") stepCursor(0, 1);
				}
			};
			const loop = createFrameLoop((f) => {
				const animating = particles.size() > 0;
				if (f.render || animating) {
					renderPeg(ctx, {
						board,
						cursor,
						selected,
						hints: hints(),
						levelDisplay: level + 1,
						levelName: LEVELS$2[level].name,
						toast,
						win: won(),
						stuck: stuck(),
						cleared: clearedPegs()
					}, false);
					particles.tick(ctx, f.dt * 1e3);
					if (animating) loop.markDirty();
				}
			}, { mode: "dirty" });
			const pause = () => {
				if (!running) return;
				running = false;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderPeg(ctx, {
					board,
					cursor,
					selected,
					hints: [],
					levelDisplay: level + 1,
					levelName: LEVELS$2[level].name,
					toast,
					win: won(),
					stuck: stuck(),
					cleared: clearedPegs()
				}, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					clearTimeout(toastTimer);
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const pegGame = {
			id: "peg",
			title: "孔明棋 Peg Solitaire",
			icon: "🔻",
			description: "跳过相邻棋子落入空位并吃掉它——清掉的棋子越多得分越高，满盘下到只剩一枚为完美。",
			controls: [
				"点击 / 方向键 + 回车：选子并落子",
				"Z / Backspace：回退一步",
				"R：重开本关"
			],
			create: createPegGame
		};
		/**
		* The opening position: discs n..1 stacked on rod 0, rods 1..2 empty.
		* @param n - disc count (>= 1).
		*/
		function createStart(n) {
			const first = [];
			for (let size = n; size >= 1; size -= 1) first.push(size);
			return { rods: [
				first,
				[],
				[]
			] };
		}
		/**
		* Apply one move: lift the top disc of `from` and drop it on `to`.
		* @returns the new state, or null when the move is illegal (rod out of range,
		*   same rod, empty source, or a bigger disc onto a smaller one). The input
		*   state is never mutated.
		*/
		function applyMove$1(state, from, to) {
			if (from < 0 || from >= 3 || to < 0 || to >= 3 || from === to) return null;
			const source = state.rods[from];
			const target = state.rods[to];
			const disc = source[source.length - 1];
			if (disc === void 0) return null;
			const top = target[target.length - 1];
			if (top !== void 0 && top < disc) return null;
			return { rods: state.rods.map((rod, i) => {
				if (i === from) return rod.slice(0, -1);
				if (i === to) return [...rod, disc];
				return [...rod];
			}) };
		}
		/** True when every disc sits on the rightmost rod. */
		function isWin(state) {
			return state.rods[0].length === 0 && state.rods[1].length === 0 && state.rods[2].length > 0;
		}
		/** The minimum move count to solve n discs: 2^n - 1. */
		function optimalFor(n) {
			return 2 ** n - 1;
		}
		/**
		* Whether the play path can still finish in optimal moves: with the optimal
		* total fixed at 2^n - 1, any move beyond it has already spoiled perfection.
		*/
		function perfectSoFar(moveCount, n) {
			return moveCount <= optimalFor(n);
		}
		/** Center x of a rod in logical space. */
		function rodCenterX(rod) {
			return 460 / 3 * (rod + .5);
		}
		/** Which rod a logical-space x lands on, or null (any height: rods are columns). */
		function rodAt(x) {
			for (let i = 0; i < 3; i += 1) if (Math.abs(x - rodCenterX(i)) <= 460 / 3 / 2) return i;
			return null;
		}
		function discWidth(size) {
			return 44 + (size - 1) * 13;
		}
		/** Y of a disc stacked at `level` (0 = bottom) on a rod. */
		function discY(level) {
			return 218 - (level + 1) * 23;
		}
		function drawDisc(ctx, cx, y, size, lifted) {
			const w = discWidth(size);
			const color = accent(size - 1);
			glow(ctx, color, lifted ? 22 : 8);
			ctx.fillStyle = color;
			roundRectPath(ctx, cx - w / 2, y, w, 18, 9);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = "rgba(13,13,20,0.5)";
			ctx.lineWidth = 1;
			ctx.stroke();
		}
		/**
		* Draw one frame.
		* @param selected - keyboard-focused rod index, or null to hide the ring.
		* @param heldRod - rod whose top disc is lifted, or null when none is held.
		* @param par - optimal move count for the level (HUD 最少).
		* @param perfect - show the 完美线 marker (path still optimal).
		* @param toast - transient illegal-move message, or null.
		* @param paused - show the pause overlay.
		* @param winText - level-clear overlay subtitle, or null while playing.
		*/
		function renderHanoi(ctx, w, h, state, selected, heldRod, level, moves, par, perfect, paused, winText, toast) {
			ctx.clearRect(0, 0, w, h);
			drawBackground(ctx, w, h);
			hudPair(ctx, 6, 21, "层数 ", String(level));
			hudPair(ctx, w - 6, 21, "步数 ", `${moves} / 最少 ${par}`, "right", THEME.gold);
			if (perfect && winText === null) {
				ctx.font = "600 12px system-ui, sans-serif";
				ctx.textAlign = "center";
				ctx.fillStyle = THEME.good;
				glow(ctx, THEME.good, 8);
				ctx.fillText("完美线", w / 2, 21);
				noGlow(ctx);
			}
			const baseY = 218;
			for (let rod = 0; rod < 3; rod += 1) {
				const cx = rodCenterX(rod);
				ctx.strokeStyle = rod === selected ? THEME.text : THEME.panelEdge;
				ctx.lineWidth = rod === selected ? 3 : 2;
				if (rod === selected) glow(ctx, THEME.text, 10);
				ctx.beginPath();
				ctx.moveTo(cx, 52);
				ctx.lineTo(cx, baseY);
				ctx.stroke();
				noGlow(ctx);
				ctx.fillStyle = rod === selected ? THEME.panelEdge : THEME.panel;
				roundRectPath(ctx, cx - 72, baseY, 144, 8, 4);
				ctx.fill();
				const discs = state.rods[rod];
				const topLifted = rod === heldRod;
				for (let i = 0; i < discs.length; i += 1) {
					const size = discs[i];
					if (topLifted && i === discs.length - 1) drawDisc(ctx, cx, 34, size, true);
					else drawDisc(ctx, cx, discY(i), size, false);
				}
			}
			if (toast !== null) {
				ctx.textAlign = "center";
				ctx.font = "600 14px system-ui, sans-serif";
				ctx.fillStyle = THEME.bad;
				glow(ctx, THEME.bad, 10);
				ctx.fillText(toast, w / 2, h - 14);
				noGlow(ctx);
			}
			if (winText !== null) drawOverlay(ctx, w, h, "完成", winText, THEME.good);
			else if (paused) drawOverlay(ctx, w, h, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/hanoi/index.ts
		const ADVANCE_MS$8 = 1500;
		/** Discs per level; level index into this table, not a raw count. */
		const LEVEL_DISCS = [
			3,
			4,
			5,
			6,
			7
		];
		const TOAST_MS$1 = 900;
		/** Undo history cap: rewind stays bounded and cheap. */
		const MAX_HISTORY$1 = 200;
		function createHanoiGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 460, 262);
			if (fit === null) throw new Error("dsh-minigames: hanoi needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = Math.min(readLevel("hanoi"), LEVEL_DISCS.length);
			let discs = LEVEL_DISCS[level - 1];
			let state = createStart(discs);
			let selected = 0;
			let heldRod = null;
			let moves = 0;
			let toast = null;
			let toastUntil = 0;
			let winText = null;
			let running = false;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScore = -1;
			const history = [];
			const particles = createParticles();
			const reportScore = () => {
				if (level === lastScore) return;
				lastScore = level;
				options?.onScore?.(level);
			};
			const startLevel = (next) => {
				level = next;
				saveLevel("hanoi", level);
				discs = LEVEL_DISCS[Math.min(next, LEVEL_DISCS.length) - 1];
				state = createStart(discs);
				selected = 0;
				heldRod = null;
				moves = 0;
				toast = null;
				winText = null;
				history.length = 0;
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					startLevel(level + 1);
				}, delayMs);
			};
			const showToast = () => {
				toast = "大盘不能压小盘";
				toastUntil = performance.now() + TOAST_MS$1;
				loop.markDirty();
			};
			/** Try to drop the held disc on `to`; illegal drops shake with a toast. */
			const dropOn = (to) => {
				if (heldRod === null) return;
				if (to === heldRod) {
					heldRod = null;
					loop.markDirty();
					return;
				}
				const next = applyMove$1(state, heldRod, to);
				if (next === null) {
					showToast();
					return;
				}
				history.push({
					state,
					moves
				});
				if (history.length > MAX_HISTORY$1) history.shift();
				state = next;
				moves += 1;
				heldRod = null;
				selected = to;
				loop.markDirty();
				if (isWin(state)) {
					winText = `完成 · ${moves} 步（最少 ${optimalFor(discs)} 步）`;
					reportScore();
					particles.burst(460 / 3 * 2.5, 120, THEME.gold, 16, 150);
					for (let rod = 0; rod < 3; rod += 1) particles.burst(460 / 3 * (rod + .5), 160, THEME.good, 4, 90);
					if (running) scheduleAdvance(ADVANCE_MS$8);
					else advanceRemaining = ADVANCE_MS$8;
				}
			};
			/** Pick up the top disc of `rod`, or attempt a drop when already holding. */
			const actOn = (rod) => {
				if (winText !== null) return;
				if (heldRod === null) {
					if (state.rods[rod].length === 0) {
						showToast();
						return;
					}
					heldRod = rod;
					loop.markDirty();
				} else dropOn(rod);
			};
			/** Rewind the last completed move; no-op at level start. */
			const undo = () => {
				if (winText !== null) return;
				const entry = history.pop();
				if (entry === void 0) return;
				state = entry.state;
				moves = entry.moves;
				heldRod = null;
				loop.markDirty();
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const rod = rodAt((event.clientX - rect.left) * 460 / rect.width);
				if (rod !== null) {
					selected = rod;
					loop.markDirty();
					actOn(rod);
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					startLevel(level);
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				} else if (event.code === "KeyZ" || event.code === "Backspace") {
					event.preventDefault();
					if (!running) return;
					undo();
				} else if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "KeyA" || event.code === "KeyD" || event.code === "ArrowUp" || event.code === "Space" || event.code === "Enter") {
					event.preventDefault();
					if (!running) return;
					if (event.code === "ArrowLeft" || event.code === "KeyA") selected = Math.max(0, selected - 1);
					else if (event.code === "ArrowRight" || event.code === "KeyD") selected = Math.min(2, selected + 1);
					else actOn(selected);
					loop.markDirty();
				}
			};
			const loop = createFrameLoop((f) => {
				if (toast !== null && performance.now() > toastUntil) {
					toast = null;
					loop.markDirty();
				}
				const animating = particles.size() > 0;
				if (f.render || animating) {
					renderHanoi(ctx, 460, 262, state, selected, heldRod, discs, moves, optimalFor(discs), perfectSoFar(moves, discs), false, winText, toast);
					particles.tick(ctx, f.dt * 1e3);
					if (animating) loop.markDirty();
				}
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderHanoi(ctx, 460, 262, state, selected, heldRod, discs, moves, optimalFor(discs), perfectSoFar(moves, discs), true, winText, toast);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const hanoiGame = {
			id: "hanoi",
			title: "河内塔 Tower of Hanoi",
			icon: "🗼",
			description: "在三根柱子间搬圆盘，大盘不压小盘，把整座塔移到最右侧。",
			controls: [
				"←→ / AD：选柱 · 点击或 ↑/空格/回车：拿起 / 落下",
				"Z / Backspace：回退一步",
				"R：重开本关",
				"P：暂停"
			],
			create: createHanoiGame
		};
		//#endregion
		//#region src/client/games/fifteen/logic.ts
		/**
		* 15-Puzzle 数字华容道 pure logic: an n×n board of tiles 1..n²-1 plus one
		* blank (0). A slide moves the tile adjacent to the blank into the blank; the
		* arrow direction names the TILE's movement (pressing ← slides the tile right
		* of the blank leftward). Scrambles apply seeded random legal moves from the
		* solved state, so every scramble is solvable by construction.
		*/
		/** mulberry32 PRNG (same construction as lightsout/logic.ts). */
		function mulberry32$15(seed) {
			let s = seed >>> 0;
			return () => {
				s = s + 1831565813 >>> 0;
				let t = s;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** The four arrow directions in a stable order (scramble choices). */
		const DIRS$1 = [
			"up",
			"down",
			"left",
			"right"
		];
		/** A solved board for `size`: 1..size²-1 in order, blank (0) last. */
		function createSolved(size) {
			return Array.from({ length: size * size }, (_, i) => (i + 1) % (size * size));
		}
		/** Flat index of the blank (0). */
		function blankIndex(board) {
			return board.indexOf(0);
		}
		/**
		* Slide by direction: move the tile that sits `dir` of the blank's neighbor
		* position into the blank (the direction names the tile's movement).
		* @returns a new board, or null when no tile lies in that direction.
		*/
		function slideDir(board, size, dir) {
			const b = blankIndex(board);
			const r = Math.floor(b / size);
			const c = b % size;
			const tr = dir === "up" ? r + 1 : dir === "down" ? r - 1 : r;
			const tc = dir === "left" ? c + 1 : dir === "right" ? c - 1 : c;
			if (tr < 0 || tr >= size || tc < 0 || tc >= size) return null;
			const t = tr * size + tc;
			const next = [...board];
			next[b] = next[t];
			next[t] = 0;
			return next;
		}
		/**
		* Apply one slide (direction or adjacent tile index).
		* @returns a new board, or null for an illegal move; the input is unchanged.
		*/
		function slide(board, move) {
			const size = Math.round(Math.sqrt(board.length));
			if (typeof move === "number") {
				if (move < 0 || move >= board.length || move === blankIndex(board)) return null;
				const b = blankIndex(board);
				const r = Math.floor(move / size);
				const c = move % size;
				const br = Math.floor(b / size);
				const bc = b % size;
				if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return null;
				const next = [...board];
				next[b] = next[move];
				next[move] = 0;
				return next;
			}
			return slideDir(board, size, move);
		}
		/** True when the tiles are in solved order (blank last). */
		function isSolved$2(board) {
			return board.every((v, i) => v === (i + 1) % board.length);
		}
		/** Scramble move count for a board size: 40 × size/4 (30/40/50 for 3/4/5). */
		function scrambleMovesFor(size) {
			return Math.round(40 * size / 4);
		}
		/**
		* Scramble from `board` by n seeded random legal moves (re-rolling whenever
		* the result would be solved, so the output is never already-solved).
		* @returns the scrambled board and the number of moves actually applied (par).
		*/
		function scrambleFrom(board, seed, n) {
			const rng = mulberry32$15(seed);
			const size = Math.round(Math.sqrt(board.length));
			let current = board;
			let applied = 0;
			for (let i = 0; i < n; i += 1) {
				const candidates = DIRS$1.filter((d) => slideDir(current, size, d) !== null);
				const dir = candidates[Math.floor(rng() * candidates.length)];
				current = slideDir(current, size, dir);
				applied += 1;
			}
			while (isSolved$2(current)) {
				const candidates = DIRS$1.filter((d) => slideDir(current, size, d) !== null);
				const dir = candidates[Math.floor(rng() * candidates.length)];
				current = slideDir(current, size, dir);
				applied += 1;
			}
			return {
				board: current,
				moves: applied
			};
		}
		/** Board origin for a given size (centered horizontally). */
		function boardOrigin(size) {
			return {
				x: (350 - (size * 58 + (size + 1) * 10)) / 2,
				y: 32
			};
		}
		/** Tile rect for a flat index. */
		function tileRect(size, i) {
			const { x: ox, y: oy } = boardOrigin(size);
			const r = Math.floor(i / size);
			const c = i % size;
			return {
				x: ox + 10 + c * 68,
				y: oy + 10 + r * 68
			};
		}
		/** Which tile a logical-space point lands on, or null. */
		function tileAt$1(x, y, size) {
			for (let i = 0; i < size * size; i += 1) {
				const { x: px, y: py } = tileRect(size, i);
				if (x >= px && x <= px + 58 && y >= py && y <= py + 58) return i;
			}
			return null;
		}
		/**
		* Draw one frame.
		* @param par - scramble move count shown next to the HUD.
		* @param paused - show the pause overlay.
		* @param winText - level-clear subtitle, or null while playing.
		*/
		function renderFifteen(ctx, w, h, board, size, level, moves, par, paused, winText) {
			ctx.clearRect(0, 0, w, h);
			drawBackground(ctx, w, h);
			hudPair(ctx, 10, 21, "关卡 ", String(level));
			hudPair(ctx, w / 2, 21, "步数 ", String(moves), "left", THEME.gold);
			hudPair(ctx, w - 10, 21, "打乱 ", String(par), "right");
			const { x: ox, y: oy } = boardOrigin(size);
			const bw = size * 58 + (size + 1) * 10;
			ctx.fillStyle = THEME.panel;
			glow(ctx, THEME.panelEdge, 8);
			roundRectPath(ctx, ox, oy, bw, bw, 10);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			roundRectPath(ctx, ox + .5, oy + .5, bw - 1, bw - 1, 10);
			ctx.stroke();
			for (let i = 0; i < board.length; i += 1) {
				const { x, y } = tileRect(size, i);
				const value = board[i];
				if (value === 0) {
					ctx.fillStyle = THEME.bgBottom;
					roundRectPath(ctx, x, y, 58, 58, 8);
					ctx.fill();
					continue;
				}
				const color = accent(value % (size * size));
				ctx.fillStyle = color;
				glow(ctx, color, 6);
				roundRectPath(ctx, x, y, 58, 58, 8);
				ctx.fill();
				noGlow(ctx);
				ctx.fillStyle = "#ffffff";
				ctx.font = `bold ${size >= 5 ? 20 : 24}px system-ui, sans-serif`;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(String(value), x + 29, y + 29);
			}
			ctx.textBaseline = "alphabetic";
			if (winText !== null) drawOverlay(ctx, w, h, "完成", winText, THEME.good);
			else if (paused) drawOverlay(ctx, w, h, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/fifteen/index.ts
		const ADVANCE_MS$7 = 1500;
		/** Undo history cap: rewind stays bounded and cheap. */
		const MAX_HISTORY = 200;
		/** In-order board sizes per level (cycles 3 → 4 → 5 → 3 → ...). */
		const SIZES = [
			3,
			4,
			5
		];
		function createFifteenGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 350, 398);
			if (fit === null) throw new Error("dsh-minigames: fifteen needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = readLevel("fifteen");
			let moves = 0;
			let par = 0;
			const firstSize = SIZES[(level - 1) % SIZES.length];
			let board = scrambleFrom(createSolved(firstSize), level * 2654435769, scrambleMovesFor(firstSize)).board;
			let winText = null;
			let running = false;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScore = -1;
			const history = [];
			const particles = createParticles();
			const size = () => SIZES[(level - 1) % SIZES.length];
			const reportScore = () => {
				if (level === lastScore) return;
				lastScore = level;
				options?.onScore?.(level);
			};
			const startLevel = (next) => {
				level = next;
				saveLevel("fifteen", level);
				moves = 0;
				const s = size();
				par = scrambleMovesFor(s);
				board = scrambleFrom(createSolved(s), level * 2654435769, par).board;
				winText = null;
				history.length = 0;
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					startLevel(level + 1);
				}, delayMs);
			};
			/** Try one slide (direction or tile index); a legal slide counts a move. */
			const move = (m) => {
				if (winText !== null) return;
				const next = slide(board, m);
				if (next === null) return;
				history.push({
					board,
					moves
				});
				if (history.length > MAX_HISTORY) history.shift();
				moves += 1;
				board = next;
				loop.markDirty();
				if (isSolved$2(board)) {
					winText = `完成 · ${moves} 步（打乱 ${par} 步）`;
					reportScore();
					particles.burst(175, 199, THEME.gold, 16, 150);
					if (running) scheduleAdvance(ADVANCE_MS$7);
					else advanceRemaining = ADVANCE_MS$7;
				}
			};
			/** Rewind the last slide (board + move counter); no-op at level start. */
			const undo = () => {
				if (winText !== null) return;
				const entry = history.pop();
				if (entry === void 0) return;
				board = entry.board;
				moves = entry.moves;
				loop.markDirty();
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const tile = tileAt$1((event.clientX - rect.left) * 350 / rect.width, (event.clientY - rect.top) * 398 / rect.height, size());
				if (tile !== null) move(tile);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					winText = null;
					startLevel(level);
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				} else if (event.code === "KeyZ" || event.code === "Backspace") {
					event.preventDefault();
					if (!running) return;
					undo();
				} else if (event.code.startsWith("Arrow")) {
					event.preventDefault();
					if (!running) return;
					if (event.code === "ArrowUp") move("up");
					else if (event.code === "ArrowDown") move("down");
					else if (event.code === "ArrowLeft") move("left");
					else if (event.code === "ArrowRight") move("right");
				}
			};
			const loop = createFrameLoop((f) => {
				const animating = particles.size() > 0;
				if (f.render || animating) {
					renderFifteen(ctx, 350, 398, board, size(), level, moves, par, false, winText);
					particles.tick(ctx, f.dt * 1e3);
					if (animating) loop.markDirty();
				}
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderFifteen(ctx, 350, 398, board, size(), level, moves, par, true, winText);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const fifteenGame = {
			id: "fifteen",
			title: "数字华容道 15-Puzzle",
			icon: "🔢",
			description: "滑动数字方块，把打乱的盘面恢复成 1 到 N 的顺序，关卡从 3×3 递进到 5×5。",
			controls: [
				"方向键：向该方向滑动紧邻空格的方块（也可点击）",
				"Z / Backspace：撤销一步",
				"R：重开本关",
				"P：暂停"
			],
			create: createFifteenGame
		};
		//#endregion
		//#region src/client/games/mastermind/logic.ts
		/**
		* Mastermind 猜码纯逻辑：黑/白钉判定（重复颜色安全，同 wordle 的两遍
		* 消耗算法族：先黑钉消耗答案色，再按剩余计数封顶白钉）、mulberry32
		* 种子生成密码、行合法性与关卡配置。全部为确定性纯函数。
		*/
		/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
		function mulberry32$14(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/**
		* 关卡序列：重复颜色在所有关卡都允许（标准 Mastermind 规则，实现最简）；
		* 难度靠次数与长度爬坡 —— L1 给足 10 次，L2 收紧到 8 次，L3 加长到 5 钉 9 次。
		*/
		const LEVELS$1 = [
			{
				pegs: 4,
				colors: 6,
				tries: 10,
				label: "L1"
			},
			{
				pegs: 4,
				colors: 6,
				tries: 8,
				label: "L2"
			},
			{
				pegs: 5,
				colors: 6,
				tries: 9,
				label: "L3"
			}
		];
		/**
		* 标准 Mastermind 判定：先数黑钉（颜色与位置都对）并消耗对应答案钉，
		* 其余猜测钉按答案剩余计数标白钉（颜色对位置不对），重复颜色不会多计。
		* @param guess - 猜测色号数组。
		* @param secret - 密码色号数组（与 guess 等长）。
		* @returns 黑钉数与白钉数。
		*/
		function judge(guess, secret) {
			const remaining = /* @__PURE__ */ new Map();
			let black = 0;
			for (let i = 0; i < secret.length; i += 1) if (guess[i] === secret[i]) black += 1;
			else {
				const s = secret[i];
				remaining.set(s, (remaining.get(s) ?? 0) + 1);
			}
			let white = 0;
			for (let i = 0; i < guess.length; i += 1) {
				if (guess[i] === secret[i]) continue;
				const g = guess[i];
				const left = remaining.get(g) ?? 0;
				if (left > 0) {
					white += 1;
					remaining.set(g, left - 1);
				}
			}
			return {
				black,
				white
			};
		}
		/**
		* 用种子确定性生成一条密码（每个钉独立取自 0..colors-1，允许重复）。
		* @param seed - 整数种子（同种子同密码）。
		* @param len - 密码长度。
		* @param colors - 颜色数。
		* @returns 长度为 len 的色号数组。
		*/
		function makeSecret(seed, len, colors) {
			const rng = mulberry32$14(seed);
			const secret = [];
			for (let i = 0; i < len; i += 1) secret.push(Math.min(colors - 1, Math.floor(rng() * colors)));
			return secret;
		}
		/**
		* 一行输入是否合法：长度恰为 len 且每个色号为 0..5 的整数（全关卡共用 6 色）。
		* @param row - 当前行的色号数组。
		* @param len - 本关密码长度。
		*/
		function validRow(row, len) {
			if (row.length !== len) return false;
			return row.every((c) => Number.isInteger(c) && c >= 0 && c <= 5);
		}
		const GRID_Y0 = 44;
		const ROW_H$3 = 42;
		const CELL$6 = 34;
		const CELL_GAP = 6;
		const MARKER_GAP = 12;
		const MARKER_W = 28;
		const PIN_R$1 = 4.5;
		const PALETTE_Y = 492;
		const PALETTE_R = 17;
		const PALETTE_STEP = 56;
		const PALETTE_X0 = 100;
		const ACTION_Y = 560;
		const ACTION_H = 40;
		const ACTION_W = 96;
		const ACTION_X0 = 136;
		/** 某关一行（色钉 + 钉标记）的整体宽度，用于水平居中。 */
		function rowWidth(pegs) {
			return pegs * CELL$6 + (pegs - 1) * CELL_GAP + MARKER_GAP + MARKER_W;
		}
		/**
		* 调色盘 / 操作键命中检测。
		* @returns 色号 0..5，或 'BACK' / 'ENTER'，未命中返回 null。
		*/
		function paletteAt(x, y) {
			for (let c = 0; c < 6; c += 1) if ((x - (PALETTE_X0 + c * PALETTE_STEP)) ** 2 + (y - PALETTE_Y) ** 2 <= 529) return c;
			const rects = [{
				key: "BACK",
				x: ACTION_X0
			}, {
				key: "ENTER",
				x: 248
			}];
			for (const rect of rects) if (x >= rect.x && x <= rect.x + ACTION_W && y >= ACTION_Y && y <= 600) return rect.key;
			return null;
		}
		/** 色钉圆点：fill 为 null 画空位描边，否则填充颜色并高光描边。 */
		function drawDot(ctx, cx, cy, r, fill) {
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			if (fill === null) {
				ctx.fillStyle = THEME.panel;
				ctx.fill();
				ctx.strokeStyle = THEME.panelEdge;
				ctx.lineWidth = 1.5;
				ctx.stroke();
			} else {
				ctx.fillStyle = fill;
				ctx.fill();
				ctx.strokeStyle = "rgba(0,0,0,0.35)";
				ctx.lineWidth = 1;
				ctx.stroke();
			}
		}
		/** 一行的反馈钉标记：绿钉（颜色与位置都对）在前、黄钉（颜色对位置
		* 不对）补后，最多两列小圆——配色与 wordle 的绿/黄一致。 */
		function drawMarkers(ctx, x0, cy, black, white) {
			for (let i = 0; i < black + white; i += 1) {
				const col = Math.floor(i / 3);
				const row = i % 3;
				const cx = x0 + col * 13 + PIN_R$1;
				const cyy = cy - 15 / 2 + row * 12;
				const exact = i < black;
				ctx.beginPath();
				ctx.arc(cx, cyy, PIN_R$1, 0, Math.PI * 2);
				ctx.fillStyle = exact ? "#3ecf6e" : "#e7c94f";
				ctx.fill();
				ctx.strokeStyle = exact ? "#1d7a3f" : "#8a7222";
				ctx.lineWidth = 1;
				ctx.stroke();
			}
		}
		function drawGrid(ctx, view) {
			const pegs = view.level.pegs;
			const pegsW = pegs * CELL$6 + (pegs - 1) * CELL_GAP;
			const x0 = (480 - rowWidth(pegs)) / 2;
			for (let r = 0; r < view.level.tries; r += 1) {
				const cy = GRID_Y0 + r * ROW_H$3 + ROW_H$3 / 2;
				const done = view.rows[r];
				if (done !== void 0) {
					for (let c = 0; c < pegs; c += 1) drawDot(ctx, x0 + c * 40 + CELL$6 / 2, cy, CELL$6 / 2, accent(done.guess[c] ?? 0));
					drawMarkers(ctx, x0 + pegsW + MARKER_GAP, cy, done.black, done.white);
				} else if (r === view.rows.length && view.status === "playing") for (let c = 0; c < pegs; c += 1) {
					const cx = x0 + c * 40 + CELL$6 / 2;
					const color = view.current[c];
					if (color !== void 0) {
						glow(ctx, accent(color), 8);
						drawDot(ctx, cx, cy, CELL$6 / 2, accent(color));
						noGlow(ctx);
					} else if (c === view.current.length) {
						drawDot(ctx, cx, cy, CELL$6 / 2, null);
						ctx.beginPath();
						ctx.arc(cx, cy, 20, 0, Math.PI * 2);
						ctx.strokeStyle = THEME.accents[1];
						ctx.lineWidth = 2;
						ctx.stroke();
					} else drawDot(ctx, cx, cy, CELL$6 / 2, null);
				}
				else for (let c = 0; c < pegs; c += 1) drawDot(ctx, x0 + c * 40 + CELL$6 / 2, cy, CELL$6 / 2, null);
			}
		}
		function drawPalette(ctx) {
			ctx.font = "600 12px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			for (let c = 0; c < 6; c += 1) {
				const cx = PALETTE_X0 + c * PALETTE_STEP;
				glow(ctx, accent(c), 6);
				drawDot(ctx, cx, PALETTE_Y, PALETTE_R, accent(c));
				noGlow(ctx);
				ctx.fillStyle = THEME.textMuted;
				ctx.fillText(String(c + 1), cx, 521);
			}
			const buttons = [{
				label: "⌫",
				x: ACTION_X0,
				edge: THEME.panelEdge
			}, {
				label: "提交",
				x: 248,
				edge: THEME.accents[1]
			}];
			ctx.font = "600 15px system-ui, sans-serif";
			for (const btn of buttons) {
				roundRectPath(ctx, btn.x, ACTION_Y, ACTION_W, ACTION_H, 8);
				ctx.fillStyle = THEME.panel;
				ctx.fill();
				ctx.strokeStyle = btn.edge;
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.fillStyle = THEME.text;
				ctx.fillText(btn.label, btn.x + ACTION_W / 2, 580);
			}
			ctx.textBaseline = "alphabetic";
		}
		/** 失败覆盖层：揭示密码的彩色圆点（drawOverlay 之外的本地变体）。 */
		function drawRevealOverlay(ctx, view) {
			ctx.fillStyle = "rgba(13,13,20,0.74)";
			ctx.fillRect(0, 0, 480, 620);
			ctx.textAlign = "center";
			ctx.font = "bold 26px system-ui, sans-serif";
			ctx.fillStyle = THEME.bad;
			ctx.fillText(spaced("答案是"), 240, 280);
			const pegs = view.secret.length;
			const step = 46;
			const x0 = 240 - (pegs - 1) * step / 2;
			for (let c = 0; c < pegs; c += 1) {
				glow(ctx, accent(view.secret[c] ?? 0), 8);
				drawDot(ctx, x0 + c * step, 314, 16, accent(view.secret[c] ?? 0));
				noGlow(ctx);
			}
			ctx.font = "600 13px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText("空格 / 点击再来一局", 240, 354);
		}
		/**
		* 绘制一帧。
		* @param shakeDx - 无效输入的水平抖动偏移（px）。
		*/
		function renderMastermind(ctx, view, shakeDx = 0) {
			ctx.clearRect(0, 0, 480, 620);
			drawBackground(ctx, 480, 620);
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, 480, 30);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.strokeRect(.5, .5, 479, 29);
			hudPair(ctx, 10, 20, "连胜 ", String(view.streak), "left", view.streak > 0 ? THEME.gold : THEME.text);
			hudPair(ctx, 470, 20, `${view.level.label} `, `${Math.min(view.rows.length + 1, view.level.tries)}/${view.level.tries}`, "right");
			ctx.save();
			ctx.translate(shakeDx, 0);
			drawGrid(ctx, view);
			ctx.restore();
			drawPalette(ctx);
			if (view.toast !== "") {
				ctx.font = "600 14px system-ui, sans-serif";
				ctx.textAlign = "center";
				glow(ctx, THEME.bad, 8);
				ctx.fillStyle = THEME.bad;
				ctx.fillText(view.toast, 240, 466);
				noGlow(ctx);
			}
			if (view.status === "won") drawOverlay(ctx, 480, 620, "破解！", `${view.rows.length}/${view.level.tries} · 空格 / 点击再来一局`, THEME.good);
			else if (view.status === "lost") drawRevealOverlay(ctx, view);
			else if (view.paused) drawOverlay(ctx, 480, 620, "已暂停", "面板恢复后继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/mastermind/index.ts
		const SHAKE_MS = 260;
		const TOAST_MS = 1300;
		const GRID_TOP = 44;
		const ROW_H$2 = 42;
		/** 每局新种子的来源：时间戳异或递增计数器。 */
		let restartCounter = 0;
		function nextSeed() {
			restartCounter = restartCounter + 1 >>> 0;
			return (Date.now() ^ Math.imul(restartCounter, 2654435769)) >>> 0;
		}
		function createMastermindGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 620);
			if (fit === null) throw new Error("dsh-minigames: mastermind needs a 2d canvas context");
			const ctx = fit.ctx;
			let levelIdx = 0;
			let roundSeed = 0;
			let secret = [];
			let rows = [];
			let current = [];
			let status = "playing";
			let streak = 0;
			let shakeMs = 0;
			let toast = "";
			let toastMs = 0;
			let running = false;
			let lastScore = -1;
			const particles = createParticles();
			const level = () => LEVELS$1[levelIdx];
			const newRound = (seed) => {
				roundSeed = seed;
				let next = makeSecret(roundSeed, level().pegs, level().colors);
				if (secret.length === next.length && next.join("") === secret.join("")) for (let bump = 1; bump <= 32; bump += 1) {
					next = makeSecret(roundSeed + Math.imul(bump, 2654435769) >>> 0, level().pegs, level().colors);
					if (next.join("") !== secret.join("")) break;
				}
				secret = next;
				rows = [];
				current = [];
				status = "playing";
				shakeMs = 0;
				toast = "";
				toastMs = 0;
			};
			const reportScore = () => {
				if (streak === lastScore) return;
				lastScore = streak;
				options?.onScore?.(streak);
			};
			/** 无效输入：抖动 + 短提示，不消耗行。 */
			const reject = (text) => {
				shakeMs = SHAKE_MS;
				toast = text;
				toastMs = TOAST_MS;
				loop.markDirty();
			};
			const submit = () => {
				if (!validRow(current, level().pegs)) {
					reject("未填满");
					return;
				}
				const { black, white } = judge(current, secret);
				rows = [...rows, {
					guess: current,
					black,
					white
				}];
				if (black === level().pegs) {
					status = "won";
					streak += 1;
					levelIdx = Math.min(levelIdx + 1, LEVELS$1.length - 1);
					reportScore();
					const rowY = GRID_TOP + (rows.length - 1) * ROW_H$2 + ROW_H$2 / 2;
					particles.burst(240, rowY, accent(2), 26, 170);
				} else if (rows.length >= level().tries) {
					status = "lost";
					levelIdx = 0;
				}
				current = [];
			};
			/** 处理一次输入：色号 / 'ENTER' / 'BACK'。 */
			const inputKey = (key) => {
				if (status !== "playing") return;
				if (key === "ENTER") submit();
				else if (key === "BACK") current = current.slice(0, -1);
				else if (current.length < level().pegs) current = [...current, key];
				else return;
				loop.markDirty();
			};
			const restart = () => {
				if (status === "lost" && streak !== 0) {
					streak = 0;
					reportScore();
				}
				newRound(nextSeed());
				loop.markDirty();
			};
			const replay = () => {
				streak = 0;
				reportScore();
				newRound(roundSeed);
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.ctrlKey || event.altKey || event.metaKey) return;
				if (event.code === "Space") {
					if (status !== "playing") {
						event.preventDefault();
						restart();
					}
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					if (running && status === "playing") inputKey("ENTER");
					return;
				}
				if (event.key === "Backspace") {
					event.preventDefault();
					if (running && status === "playing") inputKey("BACK");
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					replay();
					return;
				}
				if (/^[1-6]$/.test(event.key)) {
					event.preventDefault();
					if (running && status === "playing") inputKey(Number(event.key) - 1);
				}
			};
			const onMouseDown = (event) => {
				if (!running) return;
				if (status !== "playing") {
					restart();
					return;
				}
				const rect = canvas.getBoundingClientRect();
				const hit = paletteAt((event.clientX - rect.left) * 480 / rect.width, (event.clientY - rect.top) * 620 / rect.height);
				if (hit !== null) inputKey(hit);
			};
			const view = () => ({
				level: level(),
				levelIdx,
				rows,
				current,
				status,
				secret,
				streak,
				toast,
				paused: !running
			});
			const loop = createFrameLoop((f) => {
				const dtMs = f.dt * 1e3;
				shakeMs = Math.max(0, shakeMs - dtMs);
				toastMs = Math.max(0, toastMs - dtMs);
				if (toastMs === 0) toast = "";
				const animating = shakeMs > 0 || toastMs > 0 || particles.size() > 0;
				if (f.render || animating) {
					const shakeDx = shakeMs > 0 ? Math.sin(shakeMs / 16) * 5 : 0;
					renderMastermind(ctx, view(), shakeDx);
					particles.tick(ctx, dtMs);
					if (animating) loop.markDirty();
				}
			}, { mode: "dirty" });
			const pause = () => {
				running = false;
				loop.pause();
				renderMastermind(ctx, view());
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.markDirty();
				loop.resume();
			};
			newRound(nextSeed());
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderMastermind(ctx, view());
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const mastermindGame = {
			id: "mastermind",
			title: "Mastermind 猜码",
			icon: "🎯",
			description: "破解彩色密码：绿点=颜色位置都对，黄点=颜色对位置不对，重复颜色可能出现。",
			controls: [
				"点击调色盘 / 数字键 1–6：填色",
				"Enter：提交 · Backspace：删除",
				"空格 / 点击：再来一局 · R：同局重打"
			],
			create: createMastermindGame
		};
		/** Direction → (dx, dy, my wall bit, neighbor's opposite wall bit). */
		const DIRS = [
			{
				dx: 0,
				dy: -1,
				bit: 1,
				opp: 4
			},
			{
				dx: 1,
				dy: 0,
				bit: 2,
				opp: 8
			},
			{
				dx: 0,
				dy: 1,
				bit: 4,
				opp: 1
			},
			{
				dx: -1,
				dy: 0,
				bit: 8,
				opp: 2
			}
		];
		/** Mulberry32: tiny deterministic 32-bit PRNG. */
		function rng(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/**
		* Generate a perfect maze of w×h cells with randomized DFS (iterative, own
		* stack). Same seed → identical wall bitmask.
		* @param seed deterministic RNG seed
		* @param w cell columns (≥ 3)
		* @param h cell rows (≥ 3)
		*/
		function generateMaze(seed, w, h) {
			const walls = new Uint8Array(w * h);
			const rand = rng(seed);
			const visited = new Uint8Array(w * h);
			const stack = [0];
			visited[0] = 1;
			while (stack.length > 0) {
				const cur = stack[stack.length - 1];
				const cx = cur % w;
				const cy = cur / w | 0;
				const options = [];
				for (let d = 0; d < 4; d += 1) {
					const { dx, dy } = DIRS[d];
					const nx = cx + dx;
					const ny = cy + dy;
					if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
					if (visited[ny * w + nx] === 1) continue;
					options.push(d);
				}
				if (options.length === 0) {
					stack.pop();
					continue;
				}
				const d = options[Math.floor(rand() * options.length)];
				const { dx, dy, bit, opp } = DIRS[d];
				const next = (cy + dy) * w + (cx + dx);
				walls[cur] = walls[cur] | bit;
				walls[next] = walls[next] | opp;
				visited[next] = 1;
				stack.push(next);
			}
			return {
				w,
				h,
				walls
			};
		}
		/**
		* Whether the player at cell (x, y) may step one cell toward `dir`.
		* @returns true when the shared wall is open and the target is in bounds.
		*/
		function canMove(maze, x, y, dir) {
			const dirIndex = {
				up: 0,
				right: 1,
				down: 2,
				left: 3
			}[dir];
			const { dx, dy, bit } = DIRS[dirIndex];
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= maze.w || ny >= maze.h) return false;
			return (maze.walls[y * maze.w + x] & bit) !== 0;
		}
		/**
		* BFS shortest-path length in cells between two cells of a perfect maze
		* (always connected, so every pair resolves).
		* @param from start cell {x,y}
		* @param to target cell {x,y}
		* @returns number of steps; -1 only if a cell is out of bounds
		*/
		function bfsDistance(maze, from, to) {
			const { w, h } = maze;
			if (from.x < 0 || from.y < 0 || from.x >= w || from.y >= h) return -1;
			if (to.x < 0 || to.y < 0 || to.x >= w || to.y >= h) return -1;
			const dist = new Int32Array(w * h).fill(-1);
			const queue = [from.y * w + from.x];
			dist[queue[0]] = 0;
			for (let head = 0; head < queue.length; head += 1) {
				const cur = queue[head];
				if (cur === to.y * w + to.x) return dist[cur];
				const cx = cur % w;
				const cy = cur / w | 0;
				const mask = maze.walls[cur];
				for (let d = 0; d < 4; d += 1) {
					const { dx, dy, bit } = DIRS[d];
					if ((mask & bit) === 0) continue;
					const next = (cy + dy) * w + (cx + dx);
					if (dist[next] !== -1) continue;
					dist[next] = dist[cur] + 1;
					queue.push(next);
				}
			}
			return dist[to.y * w + to.x];
		}
		/**
		* Shortest solution length: top-left (0,0) → bottom-right (w-1,h-1).
		* @returns BFS distance in steps; positive for any w,h ≥ 2
		*/
		function solveLength(maze) {
			return bfsDistance(maze, {
				x: 0,
				y: 0
			}, {
				x: maze.w - 1,
				y: maze.h - 1
			});
		}
		const PLAYER_ACCENT = accent(0);
		const WALL_COLOR = accent(5);
		const GOAL_COLOR = THEME.gold;
		/** All four wall bits (closed-wall computation). */
		const ALL = 15;
		/** Top-left pixel of the maze grid region for a w×h maze. */
		function gridOffset(maze) {
			return {
				ox: (19 - maze.w) / 2 * 34,
				oy: 44 + (17 - maze.h) / 2 * 34
			};
		}
		/** Cell center in canvas pixels. */
		function cellCenter$3(maze, x, y) {
			const { ox, oy } = gridOffset(maze);
			return {
				px: ox + x * 34 + 17,
				py: oy + y * 34 + 17
			};
		}
		const particles$2 = createParticles();
		let prevWin = false;
		/** Draw one frame. */
		function renderMaze(ctx, maze, view) {
			const now = typeof performance !== "undefined" ? performance.now() : 0;
			const { ox, oy } = gridOffset(maze);
			const wallLen = {
				[1]: (x, y) => [
					ox + x * 34,
					oy + y * 34,
					ox + (x + 1) * 34,
					oy + y * 34
				],
				[4]: (x, y) => [
					ox + x * 34,
					oy + (y + 1) * 34,
					ox + (x + 1) * 34,
					oy + (y + 1) * 34
				],
				[8]: (x, y) => [
					ox + x * 34,
					oy + y * 34,
					ox + x * 34,
					oy + (y + 1) * 34
				],
				[2]: (x, y) => [
					ox + (x + 1) * 34,
					oy + y * 34,
					ox + (x + 1) * 34,
					oy + (y + 1) * 34
				]
			};
			drawBackground(ctx, 646, 622);
			hudPair(ctx, 12, 18, "关卡 ", `${view.level}/5`);
			hudPair(ctx, 100, 18, "步数 ", String(view.moves));
			hudPair(ctx, 634, 18, "最短 ", String(view.shortest), "right");
			ctx.fillStyle = THEME.textMuted;
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("方向键/WASD 移动 · R 重开本关 · P 暂停", 12, 36);
			ctx.fillStyle = "rgba(255,255,255,0.02)";
			for (let y = 0; y < maze.h; y += 1) for (let x = 0; x < maze.w; x += 1) ctx.fillRect(ox + x * 34, oy + y * 34, 34, 34);
			ctx.strokeStyle = WALL_COLOR;
			ctx.lineWidth = 2;
			ctx.lineCap = "round";
			glow(ctx, WALL_COLOR, 5);
			ctx.beginPath();
			for (let y = 0; y < maze.h; y += 1) for (let x = 0; x < maze.w; x += 1) {
				const mask = maze.walls[y * maze.w + x];
				const closed = ALL & ~mask;
				const segs = [];
				if (closed & 1) segs.push(wallLen[1](x, y));
				if (closed & 4) segs.push(wallLen[4](x, y));
				if (closed & 8) segs.push(wallLen[8](x, y));
				if (closed & 2) segs.push(wallLen[2](x, y));
				for (const seg of segs) {
					ctx.moveTo(seg[0], seg[1]);
					ctx.lineTo(seg[2], seg[3]);
				}
			}
			ctx.stroke();
			noGlow(ctx);
			const goal = cellCenter$3(maze, maze.w - 1, maze.h - 1);
			const pulse = .5 + .5 * Math.sin(now / 260);
			ctx.strokeStyle = GOAL_COLOR;
			ctx.lineWidth = 2;
			glow(ctx, GOAL_COLOR, 6 + pulse * 8);
			const r = 5 + pulse * 3;
			ctx.beginPath();
			ctx.arc(goal.px, goal.py, r, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fillStyle = GOAL_COLOR;
			ctx.globalAlpha = .25 + .35 * pulse;
			ctx.beginPath();
			ctx.arc(goal.px, goal.py, r - 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = 1;
			noGlow(ctx);
			for (let i = 0; i < view.trail.length; i += 1) {
				const t = view.trail[i];
				const c = cellCenter$3(maze, t.x, t.y);
				ctx.globalAlpha = (i + 1) / view.trail.length * .4;
				ctx.fillStyle = PLAYER_ACCENT;
				glow(ctx, PLAYER_ACCENT, 5);
				ctx.beginPath();
				ctx.arc(c.px, c.py, 4, 0, Math.PI * 2);
				ctx.fill();
				noGlow(ctx);
			}
			ctx.globalAlpha = 1;
			const p = cellCenter$3(maze, view.player.x, view.player.y);
			glow(ctx, PLAYER_ACCENT, 14);
			ctx.fillStyle = PLAYER_ACCENT;
			ctx.beginPath();
			ctx.arc(p.px, p.py, 7, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			if (view.winText === null) prevWin = false;
			if (view.winText !== null && !prevWin) particles$2.burst(goal.px, goal.py, THEME.gold, 26, 180);
			prevWin = view.winText !== null;
			particles$2.tick(ctx, 16);
			if (view.winText !== null) drawOverlay(ctx, 646, 622, "过关", view.winText, THEME.good);
			else if (view.paused) drawOverlay(ctx, 646, 622, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/maze/index.ts
		const ADVANCE_MS$6 = 1500;
		/** Cell grid size per level: L1 11×9, +2×2 per level up to L5 19×17. */
		function levelSize$2(level) {
			const step = Math.min(level, 5) - 1;
			return {
				w: 11 + step * 2,
				h: 9 + step * 2
			};
		}
		/** Deterministic per-level seed: replays of a level are identical. */
		function levelSeed$5(level) {
			return level * 2654435769 >>> 0;
		}
		/** The direction each key maps to. */
		const KEY_DIR = {
			ArrowUp: "up",
			ArrowDown: "down",
			ArrowLeft: "left",
			ArrowRight: "right",
			KeyW: "up",
			KeyS: "down",
			KeyA: "left",
			KeyD: "right"
		};
		function createMazeGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 646, 622);
			if (fit === null) throw new Error("dsh-minigames: maze needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = Math.min(readLevel("maze"), 5);
			const startSize = levelSize$2(level);
			let maze = generateMaze(levelSeed$5(level), startSize.w, startSize.h);
			let shortest = solveLength(maze);
			let player = {
				x: 0,
				y: 0
			};
			const trail = [];
			let moves = 0;
			let winText = null;
			let running = false;
			let lastScore = -1;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			const reportScore = () => {
				if (level === lastScore) return;
				lastScore = level;
				options?.onScore?.(level);
			};
			const startLevel = (next) => {
				level = next > 5 ? 1 : next;
				saveLevel("maze", level);
				const { w, h } = levelSize$2(level);
				maze = generateMaze(levelSeed$5(level), w, h);
				shortest = solveLength(maze);
				player = {
					x: 0,
					y: 0
				};
				trail.length = 0;
				moves = 0;
				winText = null;
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					startLevel(level + 1);
				}, delayMs);
			};
			const tryMove = (dir) => {
				if (winText !== null) return;
				if (!canMove(maze, player.x, player.y, dir)) return;
				trail.push({ ...player });
				if (trail.length > 14) trail.shift();
				const delta = {
					up: [0, -1],
					right: [1, 0],
					down: [0, 1],
					left: [-1, 0]
				}[dir];
				player = {
					x: player.x + delta[0],
					y: player.y + delta[1]
				};
				moves += 1;
				loop.markDirty();
				if (player.x === maze.w - 1 && player.y === maze.h - 1) {
					winText = `第 ${level} 关完成 · ${moves} 步（最短 ${shortest} 步）`;
					reportScore();
					if (running) scheduleAdvance(ADVANCE_MS$6);
					else advanceRemaining = ADVANCE_MS$6;
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					if (advanceTimer !== 0) {
						window.clearTimeout(advanceTimer);
						advanceTimer = 0;
					}
					advanceRemaining = 0;
					const { w, h } = levelSize$2(level);
					maze = generateMaze(levelSeed$5(level), w, h);
					shortest = solveLength(maze);
					player = {
						x: 0,
						y: 0
					};
					trail.length = 0;
					moves = 0;
					winText = null;
					loop.markDirty();
					return;
				}
				if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
					return;
				}
				if (!running) return;
				const dir = KEY_DIR[event.code];
				if (dir === void 0) return;
				event.preventDefault();
				tryMove(dir);
			};
			const loop = createFrameLoop((f) => {
				if (f.render) renderMaze(ctx, maze, {
					player,
					trail,
					level,
					moves,
					shortest,
					winText,
					paused: false
				});
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				if (advanceTimer !== 0) {
					advanceRemaining = Math.max(0, advanceAt - performance.now());
					window.clearTimeout(advanceTimer);
					advanceTimer = 0;
				}
				renderMaze(ctx, maze, {
					player,
					trail,
					level,
					moves,
					shortest,
					winText,
					paused: true
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			renderMaze(ctx, maze, {
				player,
				trail,
				level,
				moves,
				shortest,
				winText,
				paused: false
			});
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					if (advanceTimer !== 0) window.clearTimeout(advanceTimer);
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const mazeGame = {
			id: "maze",
			title: "迷宫",
			icon: "🌀",
			description: "随机完美迷宫：穿过唯一通路走到右下角出口，5 关逐渐变大。",
			controls: [
				"方向键 / WASD：移动",
				"R：重开本关（同一迷宫）",
				"P：暂停"
			],
			create: createMazeGame
		};
		/** Score headroom: a run at this total time (or slower) scores the clamp of 1. */
		const SCORE_BASE_MS = 6e4;
		/** Deterministic mulberry32 PRNG (see lightsout/logic.ts precedent). */
		function mulberry32$13(seed) {
			let s = seed >>> 0;
			return () => {
				s = s + 1831565813 >>> 0;
				let t = s;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Grid side for a level: 3 at level 1, +1 per level, capped at 7. */
		function gridSizeFor(level) {
			return Math.min(2 + Math.max(1, level), 7);
		}
		/**
		* The shuffled 1..n² cell values, deterministically from the seed
		* (Fisher–Yates over mulberry32). Same seed → same grid.
		*/
		function makeGrid(seed, n) {
			const rng = mulberry32$13(seed);
			const cells = Array.from({ length: n * n }, (_, i) => i + 1);
			for (let i = cells.length - 1; i > 0; i -= 1) {
				const j = Math.floor(rng() * (i + 1));
				const tmp = cells[i];
				cells[i] = cells[j];
				cells[j] = tmp;
			}
			return cells;
		}
		/**
		* Whether clicking cell `cellIndex` is the next correct step.
		* @param grid - the shuffled values from {@link makeGrid}.
		* @param expected - the number that must be found next (1-based).
		* @param cellIndex - flat index of the clicked cell.
		*/
		function isCorrectClick(grid, expected, cellIndex) {
			return grid[cellIndex] === expected;
		}
		/**
		* Score for a finished run. The choice documented here: the +500ms penalty
		* per wrong click is applied INSIDE this function, so callers pass raw
		* wall-clock elapsed time. Faster → higher, monotonically non-increasing,
		* clamped at 1 once the penalized total reaches the 60s cap.
		*/
		function scoreFor(elapsedMs, wrongCount) {
			const total = elapsedMs + wrongCount * 500;
			return Math.max(1, SCORE_BASE_MS - Math.floor(total));
		}
		/** Cell side for a level's grid side. */
		function cellSize$1(level) {
			return 336 / gridSizeFor(level);
		}
		function cellRect(index, level) {
			const n = gridSizeFor(level);
			const s = cellSize$1(level);
			const r = Math.floor(index / n);
			return {
				x: 6 + index % n * s,
				y: 38 + r * s,
				s
			};
		}
		/** Which cell a logical-space point lands on, or -1. */
		function cellAt$2(x, y, level) {
			const n = gridSizeFor(level);
			const s = cellSize$1(level);
			const c = Math.floor((x - 6) / s);
			const r = Math.floor((y - 32 - 6) / s);
			if (r < 0 || r >= n || c < 0 || c >= n) return -1;
			if (x > 6 + n * s || y > 38 + n * s) return -1;
			return r * n + c;
		}
		/** Center of a cell in logical space (particle bursts). */
		function cellCenter$2(index, level) {
			const { x, y, s } = cellRect(index, level);
			return {
				x: x + s / 2,
				y: y + s / 2
			};
		}
		function formatSeconds(ms) {
			return `${(ms / 1e3).toFixed(1)}`;
		}
		/**
		* Draw one frame.
		* @param grid - shuffled 1..n² values from makeGrid.
		* @param level - 1-based level (derives the grid size and seed).
		* @param lockedCount - numbers 1..lockedCount are already locked (next = +1).
		* @param wrong - active wrong-click red flash, or null.
		* @param elapsedMs - penalized elapsed time for the 用时 HUD.
		* @param wrongCount - total wrong clicks for the 误点 HUD.
		* @param paused - show the pause overlay.
		* @param winText - finish overlay subtitle, or null while playing.
		*/
		function renderSchulte(ctx, w, h, grid, level, lockedCount, wrong, elapsedMs, wrongCount, paused, winText) {
			ctx.clearRect(0, 0, w, h);
			drawBackground(ctx, w, h);
			hudPair(ctx, 6, 21, "关卡 ", `${level} (${gridSizeFor(level)}×${gridSizeFor(level)})`);
			hudPair(ctx, w / 2, 21, "用时 ", `${formatSeconds(elapsedMs)} 秒`, "left", THEME.gold);
			hudPair(ctx, w - 6, 21, "误点 ", String(wrongCount), "right", wrongCount > 0 ? THEME.bad : THEME.text);
			for (let i = 0; i < grid.length; i += 1) {
				const { x, y, s } = cellRect(i, level);
				const locked = grid[i] <= lockedCount;
				const flashing = wrong !== null && wrong.index === i && wrong.ageMs <= 200;
				const color = flashing ? THEME.bad : locked ? THEME.good : THEME.panelEdge;
				glow(ctx, flashing ? THEME.bad : locked ? THEME.good : THEME.panelEdge, flashing ? 22 : locked ? 14 : 3);
				ctx.fillStyle = flashing || locked ? color : THEME.panel;
				roundRectPath(ctx, x + 3, y + 3, s - 6, s - 6, 10);
				ctx.fill();
				noGlow(ctx);
				ctx.strokeStyle = locked || flashing ? color : THEME.panelEdge;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.font = `bold ${Math.floor(s * .34)}px system-ui, sans-serif`;
				ctx.fillStyle = locked || flashing ? "#14141c" : THEME.text;
				ctx.fillText(String(grid[i]), x + s / 2, y + s / 2);
			}
			if (winText !== null) drawOverlay(ctx, w, h, "完成", winText, THEME.good);
			else if (paused) drawOverlay(ctx, w, h, "已暂停", "面板恢复后继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/schulte/index.ts
		const ADVANCE_MS$5 = 1500;
		function createSchulteGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 348, 396);
			if (fit === null) throw new Error("dsh-minigames: schulte needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = readLevel("schulte");
			const seedFor = (lv) => lv * 2654435769;
			let grid = makeGrid(seedFor(level), gridSizeFor(level));
			let lockedCount = 0;
			let wrongCount = 0;
			let startAt = 0;
			let pausedElapsed = 0;
			let wrong = null;
			let wrongAt = 0;
			let winText = null;
			/** HUD 当前已显示的 0.1 秒计数，用于计时显示变化时置脏。 */
			let shownTenth = 0;
			let running = false;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			const particles = createParticles();
			const wallElapsed = () => startAt === 0 ? 0 : performance.now() - startAt;
			/** Penalized elapsed: wall clock + 500ms per wrong click (HUD + overlay). */
			const penalizedElapsed = () => wallElapsed() + wrongCount * 500;
			const startLevel = (next) => {
				level = next;
				grid = makeGrid(seedFor(level), gridSizeFor(level));
				lockedCount = 0;
				wrongCount = 0;
				startAt = 0;
				pausedElapsed = 0;
				wrong = null;
				winText = null;
				loop.markDirty();
			};
			const finishLevel = () => {
				const score = scoreFor(wallElapsed(), wrongCount);
				winText = `完成 · ${(penalizedElapsed() / 1e3).toFixed(1)} 秒`;
				options?.onScore?.(score);
				const center = cellCenter$2(grid.length - 1, level);
				particles.burst(center.x, center.y, THEME.gold, 16, 150);
				if (running) scheduleAdvance(ADVANCE_MS$5);
				else advanceRemaining = ADVANCE_MS$5;
			};
			const click = (index) => {
				if (winText !== null) return;
				if (startAt === 0) startAt = performance.now();
				const expected = lockedCount + 1;
				if (isCorrectClick(grid, expected, index)) {
					lockedCount = expected;
					if (lockedCount === grid.length) finishLevel();
				} else {
					wrongCount += 1;
					wrong = {
						index,
						ageMs: 0
					};
					wrongAt = performance.now();
				}
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					const next = level + 1;
					saveLevel("schulte", next);
					startLevel(next);
				}, delayMs);
			};
			const onPointerDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const index = cellAt$2((event.clientX - rect.left) * 348 / rect.width, (event.clientY - rect.top) * 396 / rect.height, level);
				if (index >= 0) click(index);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					startLevel(level);
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				const now = performance.now();
				if (wrong !== null) {
					const ageMs = now - wrongAt;
					if (ageMs > 200) wrong = null;
					else wrong = {
						index: wrong.index,
						ageMs
					};
				}
				if (startAt !== 0) {
					const tenth = Math.floor(penalizedElapsed() / 100);
					if (tenth !== shownTenth) {
						shownTenth = tenth;
						loop.markDirty();
					}
				}
				const animating = wrong !== null || particles.size() > 0;
				if (f.render || animating) {
					renderSchulte(ctx, 348, 396, grid, level, lockedCount, wrong, penalizedElapsed(), wrongCount, false, winText);
					particles.tick(ctx, f.dt * 1e3);
					if (animating) loop.markDirty();
				}
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				pausedElapsed = wallElapsed();
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderSchulte(ctx, 348, 396, grid, level, lockedCount, wrong, penalizedElapsed(), wrongCount, true, winText);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (startAt !== 0) startAt = performance.now() - pausedElapsed;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					fit.dispose();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const schulteGame = {
			id: "schulte",
			title: "舒尔特方格 Schulte Grid",
			icon: "🔲",
			description: "按 1 到 N² 的顺序依次点击打乱数字，越快越好。",
			controls: [
				"点击 / 触摸：按顺序点数字",
				"R：重开本关",
				"P：暂停"
			],
			create: createSchulteGame
		};
		//#endregion
		//#region src/client/games/hashi/logic.ts
		/**
		* 桥 (Hashi / Hashiwokakero) pure logic. Islands numbered 1-8 sit on a grid;
		* bridges (1 or 2 per pair, horizontal or vertical only, never crossing) must
		* give every island exactly its number of bridge ends and leave all islands
		* in one connected group.
		*
		* Generation: a seeded random spanning tree (randomized DFS, short edges
		* preferred) over random grid cells, then extended — some tree edges upgraded
		* to double bridges plus a few extra non-crossing edges, degrees capped at 8.
		* Island numbers are the final degrees, so a solution always exists. Every
		* roll is verified by a node-budgeted backtracking solver that stops at two
		* solutions; a level ships only when exactly one is proven, otherwise the
		* seed advances (see {@link puzzleFromSeed}).
		*
		* Placed-bridge encoding: a Map from {@link bridgeKey} ("min:max" island
		* indices) to 1|2. Insertion order is the placement order, so the last key is
		* the most recently added bridge (that is what Backspace/Z undoes).
		*/
		/** Board edge lengths of the five levels. */
		const LEVEL_SIZES$2 = [
			5,
			6,
			7,
			8,
			9
		];
		/** mulberry32 PRNG: small, fast, deterministic per seed. */
		function mulberry32$12(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 >>> 0;
				let t = a;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Key of the bridge between islands a and b (order-independent). */
		function bridgeKey(a, b) {
			return a < b ? `${a}:${b}` : `${b}:${a}`;
		}
		/** Island indices encoded in a bridge key. */
		function keyPair(key) {
			const dash = key.indexOf(":");
			return [Number(key.slice(0, dash)), Number(key.slice(dash + 1))];
		}
		/** Bridge ends touching each island, indexed like `islands`. */
		function degrees(islands, placed) {
			const out = islands.map(() => 0);
			for (const [key, count] of placed) {
				const [a, b] = keyPair(key);
				out[a] += count;
				out[b] += count;
			}
			return out;
		}
		/**
		* Cycle the bridge between a and b: 0 → 1 → 2 → 0. Pure — returns a new map,
		* whose insertion order doubles as the undo order. The caller must have
		* checked {@link legalLine}; cycling an illegal pair is undefined.
		* @param placed - current bridges.
		* @param a - first island index.
		* @param b - second island index.
		* @returns the updated bridges.
		*/
		function cycleBridge(placed, a, b) {
			const key = bridgeKey(a, b);
			const next = ((placed.get(key) ?? 0) + 1) % 3;
			const out = new Map(placed);
			if (next === 0) out.delete(key);
			else out.set(key, next);
			return out;
		}
		/** Drop the most recently placed bridge (Backspace / Z). */
		function removeLastBridge(placed) {
			const last = [...placed.keys()].pop();
			if (last === void 0) return placed;
			const out = new Map(placed);
			out.delete(last);
			return out;
		}
		/**
		* Whether islands a and b may carry a bridge: same row or column, distinct
		* cells, and no other island strictly between them.
		* @param islands - the level's islands.
		* @param a - first island index.
		* @param b - second island index.
		*/
		function legalLine(islands, a, b) {
			const from = islands[a];
			const to = islands[b];
			if (from === void 0 || to === void 0) return false;
			if (from.x === to.x && from.y === to.y) return false;
			if (from.x !== to.x && from.y !== to.y) return false;
			for (let i = 0; i < islands.length; i += 1) {
				if (i === a || i === b) continue;
				const c = islands[i];
				if (from.x === to.x) {
					if (c.x === from.x && c.y > Math.min(from.y, to.y) && c.y < Math.max(from.y, to.y)) return false;
				} else if (c.y === from.y && c.x > Math.min(from.x, to.x) && c.x < Math.max(from.x, to.x)) return false;
			}
			return true;
		}
		/** Whether the segment a-b crosses the segment c-d (endpoints never count). */
		function segmentsCross(islands, a, b, c, d) {
			const p = islands[a];
			const q = islands[b];
			const r = islands[c];
			const s = islands[d];
			const h = p.y === q.y ? [p, q] : r.y === s.y ? [r, s] : null;
			const v = p.x === q.x ? [p, q] : r.x === s.x ? [r, s] : null;
			if (h === null || v === null || h[0] === v[0] || h[0] === v[1]) return false;
			const hy = h[0].y;
			const vx = v[0].x;
			const [hx0, hx1] = [Math.min(h[0].x, h[1].x), Math.max(h[0].x, h[1].x)];
			const [vy0, vy1] = [Math.min(v[0].y, v[1].y), Math.max(v[0].y, v[1].y)];
			return hx0 < vx && vx < hx1 && vy0 < hy && hy < vy1;
		}
		/** Whether two placed bridges cross (impossible for legal play, verified anyway). */
		function bridgesCross(islands, e1, e2) {
			return segmentsCross(islands, e1.a, e1.b, e2.a, e2.b);
		}
		/** Placed bridges as Bridge records, in placement order. */
		function placedBridges(islands, placed) {
			const out = [];
			for (const [key, count] of placed) {
				const [a, b] = keyPair(key);
				if (legalLine(islands, a, b)) out.push({
					a,
					b,
					count
				});
			}
			return out;
		}
		/** Whether all islands are reachable from island 0 over the placed bridges. */
		function connectedCheck(islands, placed) {
			const n = islands.length;
			if (n <= 1) return true;
			const adj = Array.from({ length: n }, () => []);
			for (const { a, b } of placedBridges(islands, placed)) {
				adj[a].push(b);
				adj[b].push(a);
			}
			const seen = new Uint8Array(n);
			seen[0] = 1;
			const stack = [0];
			let visited = 1;
			while (stack.length > 0) {
				const i = stack.pop();
				for (const j of adj[i]) if (seen[j] === 0) {
					seen[j] = 1;
					visited += 1;
					stack.push(j);
				}
			}
			return visited === n;
		}
		/**
		* Win check: every island has exactly its number of bridge ends, the bridges
		* form one connected group, and no two bridges cross.
		* @param islands - the level's islands.
		* @param placed - the player's bridges.
		*/
		function isSolved$1(islands, placed) {
			const deg = degrees(islands, placed);
			for (let i = 0; i < islands.length; i += 1) if (deg[i] !== islands[i].n) return false;
			if (!connectedCheck(islands, placed)) return false;
			const list = placedBridges(islands, placed);
			for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) if (bridgesCross(islands, list[i], list[j])) return false;
			return true;
		}
		/**
		* Count the solutions of a puzzle's island/number set (the generator's own
		* `bridges` field is ignored — a player only ever sees the numbers).
		*
		* Backtracking over the legal pairs with constraint propagation: branch on the
		* island with the fewest open bridge options, enumerate the ways to spend its
		* remaining count, prune on over-bridged islands, unreachable remainders,
		* crossings, and an odd total remainder.
		* @param puzzle - the level to solve.
		* @param budget - search-node cap.
		* @returns 0, 1, or 2 (capped: 2 means "at least two"), or -1 when the budget
		* ran out before the search completed.
		*/
		function countSolutions(puzzle, budget = 5e4) {
			const { islands } = puzzle;
			const n = islands.length;
			const edges = [];
			for (let a = 0; a < n; a += 1) for (let b = a + 1; b < n; b += 1) if (legalLine(islands, a, b)) edges.push([a, b]);
			const m = edges.length;
			const adj = Array.from({ length: n }, () => []);
			const cross = Array.from({ length: m }, () => Array(m).fill(false));
			for (let e = 0; e < m; e += 1) {
				const [a, b] = edges[e];
				adj[a].push(e);
				adj[b].push(e);
				for (let f = e + 1; f < m; f += 1) if (segmentsCross(islands, a, b, edges[f][0], edges[f][1])) {
					cross[e][f] = true;
					cross[f][e] = true;
				}
			}
			const counts = new Int8Array(m);
			const deg = new Int8Array(n);
			let left = budget;
			let found = 0;
			let exhausted = false;
			/** Connectivity over the currently positive edges (shared with the leaf test). */
			const allConnected = () => {
				const seen = new Uint8Array(n);
				seen[0] = 1;
				const stack = [0];
				let visited = 1;
				while (stack.length > 0) {
					const i = stack.pop();
					for (const e of adj[i]) {
						if (counts[e] === 0) continue;
						const [a, b] = edges[e];
						const j = a === i ? b : a;
						if (seen[j] === 0) {
							seen[j] = 1;
							visited += 1;
							stack.push(j);
						}
					}
				}
				return visited === n;
			};
			const search = () => {
				if (found >= 2) return;
				if (left <= 0) {
					exhausted = true;
					return;
				}
				left -= 1;
				let best = -1;
				let bestOpen = Infinity;
				for (let i = 0; i < n; i += 1) {
					const rem = islands[i].n - deg[i];
					if (rem < 0) return;
					if (rem === 0) continue;
					let open = 0;
					for (const e of adj[i]) if (counts[e] === 0) open += 1;
					if (open === 0 || rem > open * 2) return;
					if (open < bestOpen) {
						bestOpen = open;
						best = i;
						if (open === 1) break;
					}
				}
				if (best === -1) {
					if (allConnected()) found += 1;
					return;
				}
				const rem = islands[best].n - deg[best];
				const open = adj[best].filter((e) => counts[e] === 0);
				const assign = (idx, sum) => {
					if (found >= 2 || exhausted) return;
					if (idx === open.length) {
						if (sum === rem) search();
						return;
					}
					if (sum + 2 * (open.length - idx) < rem) return;
					const e = open[idx];
					const [a, b] = edges[e];
					const other = a === best ? b : a;
					for (const v of [
						0,
						1,
						2
					]) {
						if (v > 0) {
							if (deg[other] + v > islands[other].n) continue;
							let blocked = false;
							for (let f = 0; f < m; f += 1) if (counts[f] > 0 && cross[e][f]) {
								blocked = true;
								break;
							}
							if (blocked) continue;
						}
						counts[e] = v;
						deg[best] += v;
						deg[other] += v;
						assign(idx + 1, sum + v);
						counts[e] = 0;
						deg[best] -= v;
						deg[other] -= v;
					}
				};
				assign(0, 0);
			};
			search();
			return exhausted ? -1 : found;
		}
		/** Islands needed on a board of `size` cells (~20% density, at least 4). */
		function islandTarget(size) {
			return Math.max(4, Math.min(size * size, Math.round(size * size * .2)));
		}
		/**
		* A randomized-DFS spanning tree over the islands, preferring short edges
		* (which keeps the tree local and rarely self-crossing).
		* @returns tree edges, or null when some island is unreachable by a legal line.
		*/
		function spanningTree(islands, rng) {
			const n = islands.length;
			const start = Math.floor(rng() * n);
			const visited = new Uint8Array(n);
			visited[start] = 1;
			const stack = [start];
			const edges = [];
			let seen = 1;
			while (seen < n) {
				const cur = stack[stack.length - 1];
				const cands = [];
				for (let j = 0; j < n; j += 1) if (visited[j] === 0 && legalLine(islands, cur, j)) cands.push(j);
				if (cands.length === 0) {
					stack.pop();
					if (stack.length === 0) return null;
					continue;
				}
				const weights = cands.map((c) => 1 / (1 + Math.abs(islands[cur].x - islands[c].x) + Math.abs(islands[cur].y - islands[c].y)));
				let roll = rng() * weights.reduce((s, w) => s + w, 0);
				let pick = cands[cands.length - 1];
				for (let i = 0; i < cands.length; i += 1) {
					roll -= weights[i];
					if (roll <= 0) {
						pick = cands[i];
						break;
					}
				}
				edges.push([cur, pick]);
				visited[pick] = 1;
				seen += 1;
				stack.push(pick);
			}
			return edges;
		}
		/** One random roll: islands, a crossing-free spanning tree, extensions, numbers. */
		function rollOnce(seed, size) {
			const rng = mulberry32$12(seed);
			const target = islandTarget(size);
			const taken = /* @__PURE__ */ new Set();
			const islands = [];
			while (islands.length < target) {
				const cell = Math.floor(rng() * size * size);
				if (taken.has(cell)) continue;
				taken.add(cell);
				islands.push({
					x: cell % size,
					y: Math.floor(cell / size),
					n: 0
				});
			}
			const tree = spanningTree(islands, rng);
			if (tree === null) return null;
			for (let i = 0; i < tree.length; i += 1) for (let j = i + 1; j < tree.length; j += 1) {
				const [a, b] = tree[i];
				const [c, d] = tree[j];
				if (segmentsCross(islands, a, b, c, d)) return null;
			}
			const deg = islands.map(() => 0);
			const links = /* @__PURE__ */ new Map();
			const link = (a, b, count) => {
				const key = bridgeKey(a, b);
				if (links.has(key)) return;
				links.set(key, {
					a,
					b,
					count
				});
				deg[a] += count;
				deg[b] += count;
			};
			for (const [a, b] of tree) link(a, b, 1);
			const upgrade = [...tree];
			for (let i = upgrade.length - 1; i > 0; i -= 1) {
				const j = Math.floor(rng() * (i + 1));
				const tmp = upgrade[i];
				upgrade[i] = upgrade[j];
				upgrade[j] = tmp;
			}
			for (const [a, b] of upgrade) if (rng() < .35 && deg[a] < 8 && deg[b] < 8) {
				links.get(bridgeKey(a, b)).count = 2;
				deg[a] += 1;
				deg[b] += 1;
			}
			const extras = Math.max(1, Math.round(target * .35));
			const pairs = [];
			for (let a = 0; a < islands.length; a += 1) for (let b = a + 1; b < islands.length; b += 1) if (legalLine(islands, a, b) && !links.has(bridgeKey(a, b))) pairs.push([a, b]);
			for (let i = pairs.length - 1; i > 0; i -= 1) {
				const j = Math.floor(rng() * (i + 1));
				const tmp = pairs[i];
				pairs[i] = pairs[j];
				pairs[j] = tmp;
			}
			let added = 0;
			for (const [a, b] of pairs) {
				if (added >= extras) break;
				if (rng() > .55) continue;
				if (deg[a] >= 8 || deg[b] >= 8) continue;
				const count = rng() < .25 && deg[a] < 7 && deg[b] < 7 ? 2 : 1;
				let crosses = false;
				for (const other of links.values()) if (bridgesCross(islands, {
					a,
					b,
					count
				}, other)) {
					crosses = true;
					break;
				}
				if (crosses) continue;
				link(a, b, count);
				added += 1;
			}
			for (let i = 0; i < islands.length; i += 1) islands[i].n = deg[i];
			return {
				size,
				islands,
				bridges: [...links.values()],
				unique: false
			};
		}
		/** Solver node budget per roll: enough to prove uniqueness at 9x9, cheap enough to retry. */
		const ROLL_BUDGET = 2e4;
		/** Re-rolls per level before relaxing to "solvable, uniqueness unproven". */
		const MAX_ATTEMPTS = 60;
		/**
		* A deterministic level for one seed: random rolls at `seed`, `seed+1`, …,
		* each verified by {@link countSolutions}; the first roll proven unique wins.
		*
		* RELAXATION: if no roll is proven unique within {@link MAX_ATTEMPTS} the best
		* roll is kept with `unique: false` — it is still solvable (the generator's own
		* bridges are a solution), so the level stays playable and the badge reads
		* 「多解」 instead of lying with 「唯一解」.
		* @param seed - base seed; attempts advance it by one.
		* @param size - board edge length in cells (see {@link LEVEL_SIZES}).
		*/
		function puzzleFromSeed$2(seed, size) {
			let fallback = null;
			let fallbackUnproven = false;
			for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
				let puzzle = null;
				for (let retry = 0; retry < 12 && puzzle === null; retry += 1) puzzle = rollOnce(seed + attempt + retry * 65536, size);
				if (puzzle === null) continue;
				const count = countSolutions(puzzle, ROLL_BUDGET);
				if (count === 1) return {
					...puzzle,
					unique: true
				};
				const unproven = count === -1;
				if (fallback === null || unproven && !fallbackUnproven) {
					fallback = puzzle;
					fallbackUnproven = unproven;
				}
			}
			return fallback ?? linePuzzle(size);
		}
		/** Spaced islands in one row: the guaranteed-unique safety net. */
		function linePuzzle(size) {
			const islands = [];
			for (let x = 0; x + 1 < size; x += 2) islands.push({
				x,
				y: 0,
				n: 0
			});
			const bridges = [];
			for (let i = 0; i + 1 < islands.length; i += 1) bridges.push({
				a: i,
				b: i + 1,
				count: 1
			});
			const deg = islands.map(() => 0);
			for (const { a, b, count } of bridges) {
				deg[a] += count;
				deg[b] += count;
			}
			for (let i = 0; i < islands.length; i += 1) islands[i].n = deg[i];
			return {
				size,
				islands,
				bridges,
				unique: true
			};
		}
		//#endregion
		//#region src/client/games/hashi/render.ts
		const BOARD = 414;
		const PAD = 22;
		const HUD_H$7 = 34;
		/** Board origin (below the HUD, inside the padding). */
		const OX = PAD;
		const OY = 56;
		const BRIDGE = accent(1);
		const ISLAND = accent(0);
		/** Cell edge for one level's board size. */
		function cellSize(size) {
			return BOARD / size;
		}
		/** Logical centre of an island. */
		function centerOf(island, size) {
			const cs = cellSize(size);
			return {
				x: OX + (island.x + .5) * cs,
				y: OY + (island.y + .5) * cs
			};
		}
		/**
		* The island under a logical point, or null. The hit radius is generous so
		* small 9x9 cells stay clickable.
		* @param islands - the level's islands.
		* @param size - board edge length in cells.
		* @param x - logical x.
		* @param y - logical y.
		*/
		function islandAt(islands, size, x, y) {
			const cs = cellSize(size);
			const r = Math.max(10, cs * .42);
			for (let i = 0; i < islands.length; i += 1) {
				const c = centerOf(islands[i], size);
				if (Math.hypot(x - c.x, y - c.y) <= r) return i;
			}
			return null;
		}
		const particles$1 = createParticles();
		let prevWon = false;
		let lastFrame$1 = 0;
		/** Draw one frame. */
		function renderHashi(ctx, puzzle, placed, selected, level, elapsed, paused, winText) {
			const { size, islands } = puzzle;
			const cs = cellSize(size);
			ctx.clearRect(0, 0, 458, 492);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$1 === 0 ? 16 : now - lastFrame$1);
			lastFrame$1 = now;
			drawBackground(ctx, 458, 492);
			ctx.fillStyle = THEME.panel;
			roundRectPath(ctx, 24, 58, 410, 410, 12);
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = "rgba(226,226,238,0.13)";
			for (let gx = 0; gx <= size; gx += 1) for (let gy = 0; gy <= size; gy += 1) {
				ctx.beginPath();
				ctx.arc(OX + gx * cs, OY + gy * cs, 1.3, 0, Math.PI * 2);
				ctx.fill();
			}
			const deg = degrees(islands, placed);
			const r = Math.max(9, cs * .3);
			ctx.lineCap = "round";
			for (const bridge of placedBridges(islands, placed)) {
				const a = centerOf(islands[bridge.a], size);
				const b = centerOf(islands[bridge.b], size);
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const len = Math.hypot(dx, dy) || 1;
				const ux = dx / len;
				const uy = dy / len;
				const trim = r + 4;
				const sx = a.x + ux * trim;
				const sy = a.y + uy * trim;
				const ex = b.x - ux * trim;
				const ey = b.y - uy * trim;
				const gap = bridge.count === 2 ? 4.5 : 0;
				ctx.strokeStyle = BRIDGE;
				ctx.lineWidth = bridge.count === 2 ? 3 : 4;
				glow(ctx, BRIDGE, 6);
				for (const sign of bridge.count === 2 ? [-1, 1] : [0]) {
					ctx.beginPath();
					ctx.moveTo(sx - uy * gap * sign, sy + ux * gap * sign);
					ctx.lineTo(ex - uy * gap * sign, ey + ux * gap * sign);
					ctx.stroke();
				}
				noGlow(ctx);
			}
			const pulse = .5 + .5 * Math.sin(now / 260);
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			for (let i = 0; i < islands.length; i += 1) {
				const island = islands[i];
				const c = centerOf(island, size);
				const over = deg[i] > island.n;
				const done = deg[i] === island.n;
				const color = over ? THEME.bad : done ? THEME.good : ISLAND;
				ctx.fillStyle = THEME.panel;
				ctx.beginPath();
				ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = color;
				ctx.lineWidth = 2.5;
				glow(ctx, color, done ? 10 : 6);
				ctx.stroke();
				noGlow(ctx);
				if (i === selected && winText === null) {
					ctx.strokeStyle = THEME.gold;
					ctx.lineWidth = 2;
					glow(ctx, THEME.gold, 14);
					ctx.beginPath();
					ctx.arc(c.x, c.y, r + 4 + pulse * 2, 0, Math.PI * 2);
					ctx.stroke();
					noGlow(ctx);
				}
				ctx.fillStyle = over ? THEME.bad : THEME.text;
				ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
				ctx.fillText(String(island.n), c.x, c.y + .5);
			}
			ctx.textBaseline = "alphabetic";
			const won = winText !== null;
			if (won && !prevWon) particles$1.burst(229, 263, THEME.gold, 26, 170);
			prevWon = won;
			particles$1.tick(ctx, dt);
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, 458, HUD_H$7);
			hudPair(ctx, PAD, 22, "关卡", `${level}/${LEVEL_SIZES$2.length}`, "left");
			hudPair(ctx, 436, 22, "桥数 ", String(placed.size), "right");
			const badge = puzzle.unique ? "唯一解" : "多解";
			ctx.font = "600 12px system-ui, sans-serif";
			const badgeW = ctx.measureText(badge).width + 16;
			ctx.fillStyle = puzzle.unique ? "rgba(158,206,106,0.16)" : "rgba(226,226,238,0.08)";
			roundRectPath(ctx, 229 - badgeW / 2, 8, badgeW, 18, 9);
			ctx.fill();
			ctx.fillStyle = puzzle.unique ? THEME.good : THEME.textMuted;
			ctx.textAlign = "center";
			ctx.fillText(badge, 229, 22);
			if (winText !== null) {
				ctx.save();
				ctx.translate(0, HUD_H$7);
				drawOverlay(ctx, 458, 458, "完成！", `${winText} · 即将进入下一关`, THEME.gold);
				ctx.restore();
			} else if (paused) {
				ctx.save();
				ctx.translate(0, HUD_H$7);
				drawOverlay(ctx, 458, 458, "已暂停", "面板恢复后继续", THEME.text);
				ctx.restore();
			}
		}
		//#endregion
		//#region src/client/games/hashi/index.ts
		const ADVANCE_MS$4 = 1500;
		/** Board edge in cells per level: L1 5x5 … L5 9x9. */
		function levelSize$1(level) {
			return LEVEL_SIZES$2[Math.min(level, LEVEL_SIZES$2.length) - 1];
		}
		/** Deterministic per-level seed; one seed per level keeps replays identical. */
		function levelSeed$4(level) {
			return level * 2654435769 >>> 0;
		}
		function createHashiGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 458, 492);
			if (fit === null) throw new Error("dsh-minigames: hashi needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = Math.min(readLevel("hashi"), LEVEL_SIZES$2.length);
			let puzzle = puzzleFromSeed$2(levelSeed$4(level), levelSize$1(level));
			let placed = /* @__PURE__ */ new Map();
			let selected = null;
			let elapsed = 0;
			let winText = null;
			let running = false;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (level === lastScore) return;
				lastScore = level;
				options?.onScore?.(level);
			};
			const startLevel = (next) => {
				level = next > LEVEL_SIZES$2.length ? 1 : next;
				saveLevel("hashi", level);
				puzzle = puzzleFromSeed$2(levelSeed$4(level), levelSize$1(level));
				placed = /* @__PURE__ */ new Map();
				selected = null;
				elapsed = 0;
				winText = null;
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					startLevel(level + 1);
				}, delayMs);
			};
			const checkWinNow = () => {
				if (winText !== null || !isSolved$1(puzzle.islands, placed)) return;
				winText = `第 ${level} 关完成 · 用时 ${Math.floor(elapsed)} 秒`;
				loop.markDirty();
				reportScore();
				if (running) scheduleAdvance(ADVANCE_MS$4);
				else advanceRemaining = ADVANCE_MS$4;
			};
			/** Pick an island, or bridge the current selection to it (0→1→2→0 cycle). */
			const pickIsland = (index) => {
				if (selected === null) {
					selected = index;
					loop.markDirty();
					return;
				}
				if (selected === index) {
					selected = null;
					loop.markDirty();
					return;
				}
				if (!legalLine(puzzle.islands, selected, index)) {
					selected = index;
					loop.markDirty();
					return;
				}
				placed = cycleBridge(placed, selected, index);
				loop.markDirty();
				checkWinNow();
			};
			const onMouseDown = (event) => {
				if (!running || winText !== null) return;
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * 458 / rect.width;
				const y = (event.clientY - rect.top) * 492 / rect.height;
				const index = islandAt(puzzle.islands, puzzle.size, x, y);
				if (index === null) {
					selected = null;
					loop.markDirty();
					return;
				}
				pickIsland(index);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					startLevel(level);
					return;
				}
				if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
					return;
				}
				if (!running || winText !== null) return;
				if (event.code === "Backspace" || event.code === "KeyZ") {
					event.preventDefault();
					placed = removeLastBridge(placed);
					loop.markDirty();
					checkWinNow();
				} else if (event.code === "Escape") {
					event.preventDefault();
					selected = null;
					loop.markDirty();
				}
			};
			const loop = createFrameLoop((f) => {
				if (winText === null) elapsed += f.dt;
				if (f.render) renderHashi(ctx, puzzle, placed, selected, level, elapsed, false, winText);
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderHashi(ctx, puzzle, placed, selected, level, elapsed, true, winText);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const hashiGame = {
			id: "hashi",
			title: "桥 Hashi",
			icon: "🌉",
			description: "按数字搭桥连接所有小岛：每岛桥数等于其数字，且全图连通。",
			controls: [
				"点击岛屿 A 再点同一直线岛屿 B：搭桥（再点加双桥，第三次拆除）",
				"Backspace / Z：拆除上一座桥",
				"Esc：取消选择",
				"R：重开本关",
				"P：暂停"
			],
			create: createHashiGame
		};
		/** Komi for White under area scoring (9x9 uses the standard 6.5). */
		const KOMI = 6.5;
		/** Black wins when its area exceeds half the board plus komi compensation. */
		const WIN_THRESHOLD = 40.5;
		/** Create an empty size×size board. */
		function createBoard$1(size = 9) {
			return {
				size,
				cells: new Int8Array(size * size)
			};
		}
		function rc(board, i) {
			return {
				r: Math.floor(i / board.size),
				c: i % board.size
			};
		}
		/** Orthogonal neighbors of a point, clipped to the board. */
		function neighbors$1(board, i) {
			const { r, c } = rc(board, i);
			const out = [];
			if (r > 0) out.push(i - board.size);
			if (r < board.size - 1) out.push(i + board.size);
			if (c > 0) out.push(i - 1);
			if (c < board.size - 1) out.push(i + 1);
			return out;
		}
		/** The connected stone group containing i plus its liberty set. */
		function groupAndLiberties(board, i) {
			const color = board.cells[i];
			const stones = [];
			const liberties = /* @__PURE__ */ new Set();
			if (color === 0) return {
				stones,
				liberties
			};
			const seen = /* @__PURE__ */ new Set([i]);
			const stack = [i];
			while (stack.length > 0) {
				const cur = stack.pop();
				stones.push(cur);
				for (const n of neighbors$1(board, cur)) {
					const v = board.cells[n];
					if (v === 0) liberties.add(n);
					else if (v === color && !seen.has(n)) {
						seen.add(n);
						stack.push(n);
					}
				}
			}
			return {
				stones,
				liberties
			};
		}
		/**
		* Place color at i. Returns the new board plus the captured stones, or null
		* when the move is illegal (occupied or suicide — ko is checked by the
		* caller against the previous position).
		*/
		function play(board, i, color) {
			if (board.cells[i] !== 0) return null;
			const cells = board.cells.slice();
			cells[i] = color;
			const next = {
				size: board.size,
				cells
			};
			const captured = [];
			const opp = color === 1 ? 2 : 1;
			for (const n of neighbors$1(next, i)) {
				if (next.cells[n] !== opp) continue;
				const g = groupAndLiberties(next, n);
				if (g.liberties.size === 0) {
					for (const s of g.stones) if (next.cells[s] === opp) {
						next.cells[s] = 0;
						captured.push(s);
					}
				}
			}
			if (captured.length === 0 && groupAndLiberties(next, i).liberties.size === 0) return null;
			return {
				board: next,
				captured
			};
		}
		/** All legal moves for color (ignores ko; the caller applies it). */
		function legalMoves$1(board, color) {
			const out = [];
			for (let i = 0; i < board.cells.length; i += 1) {
				if (board.cells[i] !== 0) continue;
				let suicide = true;
				for (const n of neighbors$1(board, i)) {
					const v = board.cells[n];
					if (v === 0) {
						suicide = false;
						break;
					}
					if (v === color) {
						if (groupAndLiberties(board, n).liberties.size > 1) {
							suicide = false;
							break;
						}
					} else if (groupAndLiberties(board, n).liberties.size === 1) {
						suicide = false;
						break;
					}
				}
				if (!suicide) out.push(i);
			}
			return out;
		}
		/** Whether playing at i is fully legal (occupancy, suicide, simple ko). */
		function isLegal(board, i, color, prev) {
			if (i < 0 || i >= board.cells.length) return false;
			if (board.cells[i] !== 0) return false;
			const res = play(board, i, color);
			if (res === null) return false;
			if (prev !== null && res.board.cells.every((v, k) => v === prev.cells[k])) return false;
			return true;
		}
		/**
		* Area (Chinese) scoring: each color scores its stones plus the empty points
		* reachable from only that color. Returns the two areas and the winner.
		*/
		function areaScore(board, komi = KOMI) {
			const { size, cells } = board;
			const territory = new Int8Array(cells.length);
			const seen = /* @__PURE__ */ new Set();
			for (let i = 0; i < cells.length; i += 1) {
				if (cells[i] !== 0 || seen.has(i)) continue;
				const region = [];
				const touches = /* @__PURE__ */ new Set();
				const stack = [i];
				seen.add(i);
				while (stack.length > 0) {
					const cur = stack.pop();
					region.push(cur);
					for (const n of neighbors$1(board, cur)) {
						const v = cells[n];
						if (v === 0) {
							if (!seen.has(n)) {
								seen.add(n);
								stack.push(n);
							}
						} else touches.add(v);
					}
				}
				if (touches.size === 1) {
					const owner = [...touches][0];
					for (const p of region) territory[p] = owner;
				}
			}
			let black = 0;
			let white = 0;
			for (let i = 0; i < cells.length; i += 1) if (cells[i] === 1) black += 1;
			else if (cells[i] === 2) white += 1;
			else if (territory[i] === 1) black += 1;
			else if (territory[i] === 2) white += 1;
			const whiteWithKomi = white + komi;
			return {
				black,
				white: whiteWithKomi,
				winner: black > whiteWithKomi ? 1 : 2
			};
		}
		/** Per-level AI configuration (ply search depth / node budget). */
		const AI_LEVELS = [
			{
				label: "L1",
				depth: 0
			},
			{
				label: "L2",
				depth: 1
			},
			{
				label: "L3",
				depth: 2
			}
		];
		//#endregion
		//#region src/client/games/minigo/ai.ts
		/**
		* Mini Go AI: a heuristic evaluator plus a shallow 2-ply local search.
		* Level 0 = greedy heuristic, 1 = + capture/atari handling, 2 = 2-ply search
		* with a node budget. All tie-breaks are deterministic (lowest board index).
		*/
		const NODE_BUDGET$2 = 3e3;
		/** Count of own groups currently in atari (exactly one liberty). */
		function atariGroups(board, color) {
			const seen = /* @__PURE__ */ new Set();
			let n = 0;
			for (let i = 0; i < board.cells.length; i += 1) {
				if (board.cells[i] !== color || seen.has(i)) continue;
				const g = groupAndLiberties(board, i);
				for (const s of g.stones) seen.add(s);
				if (g.liberties.size === 1) n += 1;
			}
			return n;
		}
		function libertySum(board, color) {
			const seen = /* @__PURE__ */ new Set();
			let total = 0;
			for (let i = 0; i < board.cells.length; i += 1) {
				if (board.cells[i] !== color || seen.has(i)) continue;
				const g = groupAndLiberties(board, i);
				for (const s of g.stones) seen.add(s);
				total += g.liberties.size;
			}
			return total;
		}
		function stoneCount(board, color) {
			let n = 0;
			for (let i = 0; i < board.cells.length; i += 1) if (board.cells[i] === color) n += 1;
			return n;
		}
		/** True when the point touches a friendly stone (shapes play). */
		function adjacentToColor(board, i, color) {
			return neighbors$1(board, i).some((n) => board.cells[n] === color);
		}
		/**
		* Static evaluation from aiColor's perspective (positive = good for the AI):
		* stone and liberty balance, atari pressure both ways, local shape, and a
		* mild center preference while the board is still empty.
		*/
		function evaluate$2(board, aiColor) {
			const opp = aiColor === 1 ? 2 : 1;
			let score = 0;
			score += (stoneCount(board, aiColor) - stoneCount(board, opp)) * 3;
			score += (libertySum(board, aiColor) - libertySum(board, opp)) * 2;
			score += atariGroups(board, opp) * 60;
			score -= atariGroups(board, aiColor) * 55;
			const empties = board.cells.filter((v) => v === 0).length;
			const center = (board.size - 1) / 2;
			let contact = 0;
			for (let i = 0; i < board.cells.length; i += 1) {
				if (board.cells[i] !== aiColor) continue;
				if (adjacentToColor(board, i, aiColor)) contact += 1;
			}
			score += contact * 4;
			if (empties > board.cells.length * .7) {
				const mid = Math.round(center) * board.size + Math.round(center);
				const d = Math.abs(mid % board.size - center) + Math.abs(Math.floor(mid / board.size) - center);
				score += Math.max(0, 12 - d * 2);
			}
			return score;
		}
		/** Heuristic delta of playing at i (captures score big; self-atari punished). */
		function moveDelta(board, i, color) {
			const res = play(board, i, color);
			if (res === null) return -Infinity;
			let delta = evaluate$2(res.board, color) - evaluate$2(board, color);
			delta += res.captured.length * 80;
			if (groupAndLiberties(res.board, i).liberties.size === 1) delta -= 40;
			return delta;
		}
		/**
		* Choose the AI move: a point index, or -1 to pass.
		* @param level - 0 greedy, 1 with capture/atari handling, 2 two-ply search.
		*/
		function chooseMove$2(board, aiColor, level, prev) {
			const moves = legalMoves$1(board, aiColor).filter((m) => {
				if (prev === null) return true;
				const res = play(board, m, aiColor);
				return res !== null && !res.board.cells.every((v, k) => v === prev.cells[k]);
			});
			if (moves.length === 0) return -1;
			const opp = aiColor === 1 ? 2 : 1;
			if (level <= 0) {
				let best = -1;
				let bestScore = 0;
				for (const m of moves) {
					const d = moveDelta(board, m, aiColor);
					if (d > bestScore) {
						bestScore = d;
						best = m;
					}
				}
				return best;
			}
			if (level === 1) {
				let best = -1;
				let bestScore = -Infinity;
				for (const m of moves) {
					const res = play(board, m, aiColor);
					let s = moveDelta(board, m, aiColor);
					if (res.captured.length > 0) s += 1e3;
					if (groupAndLiberties(res.board, m).liberties.size >= 2) s += 30;
					if (s > bestScore) {
						bestScore = s;
						best = m;
					}
				}
				return bestScore <= 0 ? -1 : best;
			}
			let nodes = 0;
			const opponentBest = (b) => {
				nodes += 1;
				if (nodes > NODE_BUDGET$2) return 0;
				let best = -Infinity;
				const oppMoves = legalMoves$1(b, opp).slice(0, 12);
				for (const m of oppMoves) {
					const res = play(b, m, opp);
					if (res === null) continue;
					const v = evaluate$2(res.board, aiColor);
					if (v > best) best = v;
				}
				return best === -Infinity ? evaluate$2(b, aiColor) : best;
			};
			let best = -1;
			let bestScore = -Infinity;
			for (const m of moves) {
				const res = play(board, m, aiColor);
				const s = evaluate$2(res.board, aiColor) - .9 * opponentBest(res.board);
				if (s > bestScore) {
					bestScore = s;
					best = m;
				}
			}
			return bestScore <= -500 ? -1 : best;
		}
		const MARGIN$5 = 26;
		const HUD_H$6 = 40;
		const CELL$4 = 34;
		const STAR_POINTS = [
			2,
			4,
			6
		];
		function pointX(c) {
			return MARGIN$5 + c * CELL$4;
		}
		function pointY(r) {
			return 66 + r * CELL$4;
		}
		/** Board index under the pointer, or -1. */
		function pointAt(x, y) {
			const c = Math.round((x - MARGIN$5) / CELL$4);
			const r = Math.round((y - HUD_H$6 - MARGIN$5) / CELL$4);
			if (r < 0 || r >= 9 || c < 0 || c >= 9) return -1;
			return r * 9 + c;
		}
		function renderMiniGo(ctx, view) {
			const { board } = view;
			drawBackground(ctx, 324, 364);
			ctx.strokeStyle = THEME.textMuted;
			ctx.lineWidth = 1;
			ctx.beginPath();
			for (let i = 0; i < 9; i += 1) {
				ctx.moveTo(pointX(0), pointY(i));
				ctx.lineTo(pointX(8), pointY(i));
				ctx.moveTo(pointX(i), pointY(0));
				ctx.lineTo(pointX(i), pointY(8));
			}
			ctx.stroke();
			ctx.fillStyle = THEME.textMuted;
			for (const r of STAR_POINTS) for (const c of STAR_POINTS) {
				ctx.beginPath();
				ctx.arc(pointX(c), pointY(r), 2.5, 0, Math.PI * 2);
				ctx.fill();
			}
			if (view.hover >= 0 && !view.over && board.cells[view.hover] === 0) {
				const hr = Math.floor(view.hover / 9);
				const hc = view.hover % 9;
				ctx.strokeStyle = THEME.good;
				ctx.globalAlpha = .5;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(pointX(hc) - 12, pointY(hr));
				ctx.lineTo(pointX(hc) + 12, pointY(hr));
				ctx.moveTo(pointX(hc), pointY(hr) - 12);
				ctx.lineTo(pointX(hc), pointY(hr) + 12);
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
			for (let i = 0; i < board.cells.length; i += 1) {
				const v = board.cells[i];
				if (v === 0) continue;
				const r = Math.floor(i / 9);
				const cx = pointX(i % 9);
				const cy = pointY(r);
				const radius = CELL$4 * .44;
				if (v === 1) glow(ctx, "#0a0a12", 8);
				else glow(ctx, "#f2f2fa", 8);
				ctx.beginPath();
				ctx.arc(cx, cy, radius, 0, Math.PI * 2);
				ctx.fillStyle = v === 1 ? "#101018" : "#f4f4fa";
				ctx.fill();
				noGlow(ctx);
				ctx.strokeStyle = v === 1 ? "#3a3a4e" : "#c8c8d8";
				ctx.lineWidth = 1;
				ctx.stroke();
				if (i === view.lastMove) {
					ctx.beginPath();
					ctx.arc(cx, cy, 17.96, 0, Math.PI * 2);
					ctx.strokeStyle = THEME.gold;
					ctx.lineWidth = 2;
					ctx.stroke();
				}
			}
			hudPair(ctx, 298, 22, `${view.levelLabel} `, `提子 黑${view.captures.black} 白${view.captures.white} · ${view.moves} 手`, "right", THEME.gold);
			if (view.over) drawOverlay(ctx, 324, 364, "终局", `${view.winner === 1 ? "你赢了" : "你输了"} · 黑 ${view.blackArea} : ${view.whiteArea.toFixed(1)} 白（含贴目）· R 重开`, view.winner === 1 ? THEME.good : THEME.bad);
		}
		//#endregion
		//#region src/client/games/minigo/index.ts
		const AI_DELAY_MS$2 = 450;
		function createMiniGoGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 324, 364);
			if (fit === null) throw new Error("dsh-minigames: minigo needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = 0;
			let board = createBoard$1(9);
			let prev = null;
			let lastMove = -1;
			let captures = {
				black: 0,
				white: 0
			};
			let moves = 0;
			let hover = -1;
			let over = false;
			let winner = 0;
			let blackArea = 0;
			let whiteArea = 0;
			let passes = 0;
			let running = false;
			let aiAt = 0;
			let lastScore = -1;
			const particles = createParticles();
			const reportScore = () => {
				if (!over) return;
				const score = (winner === 1 ? 110 : 11) + (winner === 1 ? Math.min(40, Math.max(0, Math.floor(blackArea - WIN_THRESHOLD))) : 0);
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const restart = () => {
				board = createBoard$1(9);
				prev = null;
				lastMove = -1;
				captures = {
					black: 0,
					white: 0
				};
				moves = 0;
				over = false;
				winner = 0;
				blackArea = 0;
				whiteArea = 0;
				passes = 0;
				aiAt = 0;
				lastScore = -1;
				loop.markDirty();
			};
			const finish = () => {
				const s = areaScore(board, KOMI);
				blackArea = s.black;
				whiteArea = s.white;
				winner = s.winner;
				over = true;
				reportScore();
				const mid = rc(board, Math.floor(board.cells.length / 2));
				particles.burst(162, 40 + mid.r * 30, THEME.gold, 18, 160);
				loop.markDirty();
			};
			const applyPlay = (i, color) => {
				const res = play(board, i, color);
				if (res === null) return false;
				prev = board;
				board = res.board;
				if (res.captured.length > 0) {
					if (color === 1) captures.black += res.captured.length;
					else captures.white += res.captured.length;
					for (const s of res.captured) {
						const p = rc(board, s);
						particles.burst(20 + p.c * 30, 40 + p.r * 30, color === 1 ? THEME.good : THEME.bad, 6, 90);
					}
				}
				lastMove = i;
				moves += 1;
				passes = 0;
				loop.markDirty();
				return true;
			};
			const aiMove = () => {
				const m = chooseMove$2(board, 2, level, prev);
				if (m < 0) {
					passes += 1;
					if (passes >= 2) {
						finish();
						return;
					}
					return;
				}
				if (!applyPlay(m, 2)) {
					if ((isLegal(board, m, 2, prev) ? m : -1) < 0) {
						passes += 1;
						if (passes >= 2) finish();
					}
				}
			};
			const onMouseDown = (event) => {
				if (!running || over) return;
				const rect = canvas.getBoundingClientRect();
				const i = pointAt((event.clientX - rect.left) * 324 / rect.width, (event.clientY - rect.top) * 364 / rect.height);
				hover = i;
				loop.markDirty();
				if (i < 0) return;
				if (board.cells[i] !== 0) return;
				if (!isLegal(board, i, 1, prev)) return;
				if (applyPlay(i, 1)) aiAt = performance.now() + AI_DELAY_MS$2;
			};
			const onMouseMove = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const i = pointAt((event.clientX - rect.left) * 324 / rect.width, (event.clientY - rect.top) * 364 / rect.height);
				if (i !== hover) {
					hover = i;
					loop.markDirty();
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					restart();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					if (over || !running) return;
					passes += 1;
					if (passes >= 2) finish();
					else aiAt = performance.now() + AI_DELAY_MS$2;
				}
			};
			const frame = (f) => {
				if (!running) return;
				const now = performance.now();
				if (!over && aiAt > 0 && now >= aiAt) {
					aiAt = 0;
					aiMove();
				}
				if (!f.render && particles.size() === 0) return;
				const view = {
					board,
					lastMove,
					levelLabel: AI_LEVELS[level].label,
					captures,
					moves,
					hover,
					over,
					winner,
					blackArea,
					whiteArea
				};
				renderMiniGo(ctx, view);
				particles.tick(ctx, f.dt * 1e3);
			};
			const loop = createFrameLoop(frame);
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("mousemove", onMouseMove);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: () => {
					running = true;
				},
				pause: () => {
					running = false;
					loop.markDirty();
				},
				resume: () => {
					running = true;
					loop.markDirty();
				},
				destroy: () => {
					running = false;
					loop.destroy();
					canvas.removeEventListener("mousedown", onMouseDown);
					canvas.removeEventListener("mousemove", onMouseMove);
					window.removeEventListener("keydown", onKeyDown);
					fit.dispose();
				}
			};
		}
		const miniGoGame = {
			id: "minigo",
			title: "迷你围棋",
			icon: "⚫",
			description: "9×9 迷你围棋：气、提子、禁自杀、劫，AI 随关卡加深（L1 贪心 / L2 提子 / L3 两层搜索）。",
			controls: [
				"点击交点落子",
				"P：弃一手（连续两手终局）",
				"R：重开"
			],
			create: createMiniGoGame
		};
		function createBoard() {
			return /* @__PURE__ */ new Int8Array(42);
		}
		function inBounds(col, row) {
			return col >= 0 && col < 7 && row >= 0 && row < 6;
		}
		function at(board, col, row) {
			return board[col * 6 + row];
		}
		/** The row a disc dropped into `col` would land on, or -1 when full. */
		function dropRow(board, col) {
			if (col < 0 || col >= 7) return -1;
			for (let r = 0; r < 6; r += 1) if (at(board, col, r) === 0) return r;
			return -1;
		}
		function legalColumns(board) {
			const out = [];
			for (let c = 0; c < 7; c += 1) if (dropRow(board, c) >= 0) out.push(c);
			return out;
		}
		function isFull(board) {
			return legalColumns(board).length === 0;
		}
		/** Drop color into col; returns the new board and the landing row, or null. */
		function drop(board, col, color) {
			const row = dropRow(board, col);
			if (row < 0) return null;
			const next = board.slice();
			next[col * 6 + row] = color;
			return {
				board: next,
				row
			};
		}
		/** All 69 length-4 windows as flat index quadruples (computed once). */
		const WINDOWS = (() => {
			const out = [];
			const dirs = [
				[1, 0],
				[0, 1],
				[1, 1],
				[1, -1]
			];
			for (let c = 0; c < 7; c += 1) for (let r = 0; r < 6; r += 1) for (const [dc, dr] of dirs) {
				if (!inBounds(c + dc * 3, r + dr * 3)) continue;
				const idx = [
					0,
					1,
					2,
					3
				].map((k) => (c + dc * k) * 6 + (r + dr * k));
				out.push(idx);
			}
			return out;
		})();
		/** The winning line's four cells, or null. */
		function findWinner(board) {
			for (const w of WINDOWS) {
				const v = board[w[0]];
				if (v === 0) continue;
				if (board[w[1]] === v && board[w[2]] === v && board[w[3]] === v) return {
					color: v,
					cells: w
				};
			}
			return null;
		}
		/** Convert a flat index to column/row. */
		function toColRow(i) {
			return {
				col: Math.floor(i / 6),
				row: i % 6
			};
		}
		//#endregion
		//#region src/client/games/connect4/ai.ts
		/**
		* Connect Four AI: negamax with alpha-beta pruning, window-based evaluation,
		* center-first move ordering, iterative deepening, and a node budget. Fully
		* deterministic — the same position and depth always yield the same column.
		*/
		const NODE_BUDGET$1 = 2e5;
		const WIN_SCORE = 1e6;
		/** Column preference order (center out) for move ordering and tie-breaks. */
		const CENTER_ORDER = [
			3,
			2,
			4,
			1,
			5,
			0,
			6
		];
		/** Static evaluation from `color`'s perspective (positive = good for color). */
		function evaluate$1(board, color) {
			const opp = color === 1 ? 2 : 1;
			let score = 0;
			for (const w of WINDOWS) {
				let mine = 0;
				let theirs = 0;
				for (const i of w) {
					const v = board[i];
					if (v === color) mine += 1;
					else if (v === opp) theirs += 1;
				}
				if (mine > 0 && theirs > 0) continue;
				if (mine === 4) score += WIN_SCORE;
				else if (mine === 3) score += 5e3;
				else if (mine === 2) score += 200;
				if (theirs === 4) score -= WIN_SCORE;
				else if (theirs === 3) score -= 6e3;
				else if (theirs === 2) score -= 220;
			}
			for (let r = 0; r < 6; r += 1) {
				const v = at(board, 3, r);
				if (v === color) score += 10;
				else if (v === opp) score -= 10;
			}
			return score;
		}
		/** Immediate-win columns for color, if any. */
		function winningColumns(board, color) {
			const out = [];
			for (const c of legalColumns(board)) {
				const row = dropRow(board, c);
				board[c * 6 + row] = color;
				const win = findWinner(board) !== null;
				board[c * 6 + row] = 0;
				if (win) out.push(c);
			}
			return out;
		}
		/** Ordered candidate columns: wins, blocks, then center-out. */
		function orderedMoves(board, color) {
			const opp = color === 1 ? 2 : 1;
			const wins = winningColumns(board, color);
			if (wins.length > 0) return wins;
			const blocks = winningColumns(board, opp);
			const rest = CENTER_ORDER.filter((c) => dropRow(board, c) >= 0 && !blocks.includes(c));
			return [...blocks, ...rest];
		}
		/**
		* Negamax with alpha-beta. Returns the score from the SIDE-TO-MOVE's
		* perspective (standard negamax convention); callers negate when unwinding.
		* `nodes` is a mutable counter so the budget can abort mid-search.
		*/
		function negamax$1(board, color, depth, alpha, beta, nodes) {
			nodes.n += 1;
			const w = findWinner(board);
			if (w !== null) return w.color === color ? WIN_SCORE - (10 - depth) : -1e6 + (10 - depth);
			if (isFull(board)) return 0;
			if (depth === 0 || nodes.n > 2e5) return evaluate$1(board, color);
			const opp = color === 1 ? 2 : 1;
			let best = -Infinity;
			let a = alpha;
			for (const c of orderedMoves(board, color)) {
				const row = dropRow(board, c);
				board[c * 6 + row] = color;
				const v = -negamax$1(board, opp, depth - 1, -beta, -a, nodes);
				board[c * 6 + row] = 0;
				if (v > best) best = v;
				if (best > a) a = best;
				if (a >= beta) break;
			}
			return best;
		}
		/**
		* Choose the AI's column. Iterative deepening to maxDepth with the node
		* budget; ties break by center-first column order (deterministic).
		*/
		function chooseMove$1(board, aiColor, maxDepth, budget = NODE_BUDGET$1) {
			const legal = legalColumns(board);
			if (legal.length === 0) return -1;
			const nodes = { n: 0 };
			let bestCol = CENTER_ORDER.find((c) => legal.includes(c)) ?? legal[0];
			for (let depth = 1; depth <= maxDepth; depth += 1) {
				let localBest = -Infinity;
				let localCol = bestCol;
				let aborted = false;
				for (const c of orderedMoves(board, aiColor)) {
					const row = dropRow(board, c);
					board[c * 6 + row] = aiColor;
					const v = -negamax$1(board, aiColor === 1 ? 2 : 1, depth - 1, -Infinity, Infinity, nodes);
					board[c * 6 + row] = 0;
					if (v > localBest) {
						localBest = v;
						localCol = c;
					}
					if (nodes.n > budget) {
						aborted = true;
						break;
					}
				}
				if (!aborted || depth === 1) bestCol = localCol;
				if (nodes.n > budget) break;
			}
			return bestCol;
		}
		//#endregion
		//#region src/client/games/connect4/render.ts
		/**
		* Connect Four renderer: board frame, glowing discs, column hover, the
		* last-move ring, the winning-line pulse, and the HUD/overlays. Uses the
		* shared visual kit (../theme.ts).
		*/
		const MARGIN$4 = 20;
		const HUD_H$5 = 40;
		const CELL$3 = 52;
		const LOGICAL_W$8 = 404;
		const LOGICAL_H$7 = 392;
		function cellX$1(col) {
			return MARGIN$4 + col * CELL$3;
		}
		function cellY$1(row) {
			return 60 + (5 - row) * CELL$3;
		}
		/** Column under the pointer, or -1. */
		function colAt(x, y) {
			if (y < HUD_H$5) return -1;
			const c = Math.floor((x - MARGIN$4) / CELL$3);
			return c >= 0 && c < 7 ? c : -1;
		}
		function renderConnect4(ctx, view) {
			drawBackground(ctx, LOGICAL_W$8, LOGICAL_H$7);
			if (view.hoverCol >= 0 && view.result === "playing") {
				ctx.fillStyle = "rgba(255,255,255,0.05)";
				ctx.fillRect(cellX$1(view.hoverCol), HUD_H$5, CELL$3, 352);
			}
			for (let c = 0; c < 7; c += 1) for (let r = 0; r < 6; r += 1) {
				const cx = cellX$1(c) + CELL$3 / 2;
				const cy = cellY$1(r) + CELL$3 / 2;
				ctx.beginPath();
				ctx.arc(cx, cy, CELL$3 * .4, 0, Math.PI * 2);
				ctx.fillStyle = "#0c0c12";
				ctx.fill();
				ctx.strokeStyle = "#26262e";
				ctx.lineWidth = 1;
				ctx.stroke();
			}
			for (let i = 0; i < view.board.length; i += 1) {
				const v = view.board[i];
				if (v === 0) continue;
				const { col, row } = toColRow(i);
				const cx = cellX$1(col) + CELL$3 / 2;
				const cy = cellY$1(row) + CELL$3 / 2;
				if (v === 1) glow(ctx, "#ff5a6e", 10);
				else glow(ctx, "#ffd24a", 10);
				ctx.beginPath();
				ctx.arc(cx, cy, CELL$3 * .38, 0, Math.PI * 2);
				ctx.fillStyle = v === 1 ? "#ff5a6e" : "#ffd24a";
				ctx.fill();
				noGlow(ctx);
				if (i === view.lastMove) {
					ctx.beginPath();
					ctx.arc(cx, cy, CELL$3 * .44, 0, Math.PI * 2);
					ctx.strokeStyle = THEME.text;
					ctx.lineWidth = 2;
					ctx.stroke();
				}
			}
			if (view.winCells !== null && view.winCells.length === 4) {
				const pts = view.winCells.map((i) => {
					const p = toColRow(i);
					return [cellX$1(p.col) + CELL$3 / 2, cellY$1(p.row) + CELL$3 / 2];
				});
				ctx.strokeStyle = THEME.gold;
				ctx.lineWidth = 4;
				ctx.beginPath();
				ctx.moveTo(pts[0][0], pts[0][1]);
				for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
				ctx.stroke();
			}
			hudPair(ctx, 384, 22, `${view.levelLabel} `, `战绩 ${view.record.w}胜 ${view.record.d}平 ${view.record.l}负`, "right", THEME.gold);
			if (view.result === "red") drawOverlay(ctx, LOGICAL_W$8, LOGICAL_H$7, "你赢了！", "即将进入下一关 · R 重开", THEME.good);
			else if (view.result === "yellow") drawOverlay(ctx, LOGICAL_W$8, LOGICAL_H$7, "你输了", "同一关再来 · R 重开", THEME.bad);
			else if (view.result === "draw") drawOverlay(ctx, LOGICAL_W$8, LOGICAL_H$7, "平局", "R 重开", THEME.text);
		}
		//#endregion
		//#region src/client/games/connect4/index.ts
		const AI_DELAY_MS$1 = 350;
		/** Per-level AI search depth (ply). */
		const LEVEL_DEPTH$1 = [
			1,
			3,
			5,
			7
		];
		const WIN_STREAK_MULT = [
			1,
			1.5,
			2,
			3
		];
		function createConnect4Game(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$8, LOGICAL_H$7);
			if (fit === null) throw new Error("dsh-minigames: connect4 needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = 0;
			let board = createBoard();
			let lastMove = -1;
			let hoverCol = -1;
			let over = "playing";
			let winCells = null;
			let record = {
				w: 0,
				d: 0,
				l: 0
			};
			let winStreak = 0;
			let running = false;
			let aiAt = 0;
			let lastScore = -1;
			const particles = createParticles();
			const depth = () => LEVEL_DEPTH$1[Math.min(level, LEVEL_DEPTH$1.length - 1)];
			const reportScore = () => {
				if (over === "playing") return;
				const d = depth();
				let score;
				if (over === "red") {
					const mult = WIN_STREAK_MULT[Math.min(winStreak, WIN_STREAK_MULT.length - 1)];
					score = Math.round((10 * d + 10) * mult);
				} else if (over === "draw") score = 5 * d;
				else score = 1;
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const restart = () => {
				board = createBoard();
				lastMove = -1;
				over = "playing";
				winCells = null;
				aiAt = 0;
				lastScore = -1;
				loop.markDirty();
			};
			const settle = () => {
				const w = findWinner(board);
				if (w !== null) {
					winCells = w.cells;
					over = w.color === 1 ? "red" : "yellow";
					if (over === "red") {
						record.w += 1;
						winStreak += 1;
					} else {
						record.l += 1;
						winStreak = 0;
					}
				} else if (isFull(board)) {
					over = "draw";
					record.d += 1;
					winStreak = 0;
				} else return;
				reportScore();
				if (over === "red") window.setTimeout(() => {
					if (level < LEVEL_DEPTH$1.length - 1) level += 1;
					restart();
				}, 1400);
			};
			const aiMove = () => {
				const col = chooseMove$1(board, 2, depth());
				if (col < 0) {
					settle();
					return;
				}
				const res = drop(board, col, 2);
				if (res === null) {
					settle();
					return;
				}
				board = res.board;
				lastMove = col * 6 + res.row;
				settle();
				loop.markDirty();
			};
			const playerDrop = (col) => {
				if (over !== "playing" || aiAt > 0) return;
				const res = drop(board, col, 1);
				if (res === null) return;
				board = res.board;
				lastMove = col * 6 + res.row;
				settle();
				loop.markDirty();
				if (over === "playing") aiAt = performance.now() + AI_DELAY_MS$1;
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const col = colAt((event.clientX - rect.left) * LOGICAL_W$8 / rect.width, (event.clientY - rect.top) * LOGICAL_H$7 / rect.height);
				hoverCol = col;
				loop.markDirty();
				if (col >= 0) playerDrop(col);
			};
			const onMouseMove = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const col = colAt((event.clientX - rect.left) * LOGICAL_W$8 / rect.width, (event.clientY - rect.top) * LOGICAL_H$7 / rect.height);
				if (col !== hoverCol) {
					hoverCol = col;
					loop.markDirty();
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					restart();
					return;
				}
				const m = /^Digit([1-7])$/.exec(event.code);
				if (m !== null) {
					event.preventDefault();
					playerDrop(Number(m[1]) - 1);
				}
			};
			const frame = (f) => {
				if (!running) return;
				const now = performance.now();
				if (over === "playing" && aiAt > 0 && now >= aiAt) {
					aiAt = 0;
					aiMove();
				}
				if (!f.render && particles.size() === 0) return;
				const view = {
					board,
					hoverCol,
					lastMove,
					levelLabel: `L${level + 1}·深度${depth()}`,
					record,
					result: over,
					winCells
				};
				renderConnect4(ctx, view);
				particles.tick(ctx, f.dt * 1e3);
			};
			const loop = createFrameLoop(frame);
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("mousemove", onMouseMove);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: () => {
					running = true;
				},
				pause: () => {
					running = false;
					loop.markDirty();
				},
				resume: () => {
					running = true;
					loop.markDirty();
				},
				destroy: () => {
					running = false;
					loop.destroy();
					canvas.removeEventListener("mousedown", onMouseDown);
					canvas.removeEventListener("mousemove", onMouseMove);
					window.removeEventListener("keydown", onKeyDown);
					fit.dispose();
				}
			};
		}
		const connect4Game = {
			id: "connect4",
			title: "四子棋",
			icon: "🔴",
			description: "七列落子四连即胜：AI 用 α-β 剪枝搜索，关卡越深越强（深度 1→7）。",
			controls: ["点击列 / 数字键 1-7：落子", "R：重开"],
			create: createConnect4Game
		};
		//#endregion
		//#region src/client/games/slitherlink/logic.ts
		function hEdgeIndex(w, h, col, row) {
			return row * w + col;
		}
		function vEdgeIndex(w, h, col, row) {
			return hEdgeCount(w, h) + row * (w + 1) + col;
		}
		/** Horizontal edge count: w edges on each of the (h+1) dot-rows. */
		function hEdgeCount(w, h) {
			return w * (h + 1);
		}
		function edgeCount(w, h) {
			return hEdgeCount(w, h) + (w + 1) * h;
		}
		/** The four edge indices around cell (c, r): [N, E, S, W]. */
		function cellEdges(w, h, c, r) {
			return [
				hEdgeIndex(w, h, c, r),
				vEdgeIndex(w, h, c + 1, r),
				hEdgeIndex(w, h, c, r + 1),
				vEdgeIndex(w, h, c, r)
			];
		}
		/** mulberry32 seeded PRNG. */
		function mulberry32$11(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Every clue cell exactly satisfied. */
		function checkClues(edges, clues, w, h) {
			for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) {
				const clue = clues[r * w + c];
				if (clue < 0) continue;
				if (cellEdges(w, h, c, r).filter((i) => edges[i] === 1).length !== clue) return false;
			}
			return true;
		}
		/**
		* Cycle check: every dot touched by drawn edges has degree exactly 2, and all
		* drawn edges form one connected component.
		*/
		function cycleCheck(edges, w, h) {
			const dots = (w + 1) * (h + 1);
			const degree = new Array(dots).fill(0);
			const drawn = [];
			for (let i = 0; i < edges.length; i += 1) {
				if (edges[i] !== 1) continue;
				drawn.push(i);
				const [a, b] = edgeDots(w, h, i);
				degree[a] += 1;
				degree[b] += 1;
			}
			const degreeOk = drawn.length > 0 && degree.every((d) => d === 0 || d === 2);
			const adj = Array.from({ length: dots }, () => []);
			for (const i of drawn) {
				const [a, b] = edgeDots(w, h, i);
				adj[a].push(b);
				adj[b].push(a);
			}
			let singleCycle = false;
			if (degreeOk && drawn.length > 0) {
				const start = edgeDots(w, h, drawn[0])[0];
				const seen = /* @__PURE__ */ new Set([start]);
				const stack = [start];
				while (stack.length > 0) {
					const cur = stack.pop();
					for (const n of adj[cur]) if (!seen.has(n)) {
						seen.add(n);
						stack.push(n);
					}
				}
				singleCycle = seen.size === degree.filter((d) => d > 0).length;
			}
			return {
				singleCycle,
				degreeOk
			};
		}
		/** The two dot indices an edge connects. */
		function edgeDots(w, h, i) {
			const hCount = hEdgeCount(w, h);
			if (i < hCount) {
				const row = Math.floor(i / w);
				const col = i % w;
				const a = row * (w + 1) + col;
				return [a, a + 1];
			}
			const j = i - hCount;
			const row = Math.floor(j / (w + 1));
			const col = j % (w + 1);
			const a = row * (w + 1) + col;
			return [a, a + (w + 1)];
		}
		function isSolved(edges, clues, w, h) {
			if (!checkClues(edges, clues, w, h)) return false;
			const { singleCycle, degreeOk } = cycleCheck(edges, w, h);
			return degreeOk && singleCycle;
		}
		/**
		* Pure line-logic deduction pass over one clue line (a maximal run of edges
		* whose cells all share a boundary clue constraint): enumerate placements of
		* the clue's lines among the candidate edges consistent with the known
		* states; mark forced lines and forced crosses. Returns the updated edges;
		* returns the input unchanged when a contradiction is found.
		*/
		function deduceLine(edges, candidates, clue) {
			const n = candidates.length;
			const combos = [];
			const choose = (start, left, picked) => {
				if (left === 0) {
					combos.push([...picked]);
					return;
				}
				for (let i = start; i <= n - left; i += 1) {
					if (edges[candidates[i]] === 2) continue;
					picked.push(candidates[i]);
					choose(i + 1, left - 1, picked);
					picked.pop();
				}
			};
			choose(0, clue, []);
			if (combos.length === 0) return edges;
			const out = edges.slice();
			for (const e of candidates) {
				const alwaysLine = combos.every((c) => c.includes(e));
				const neverLine = combos.every((c) => !c.includes(e));
				if (alwaysLine && out[e] === 0) out[e] = 1;
				else if (neverLine && out[e] === 0) out[e] = 2;
				else if (out[e] === 1 && neverLine) return edges;
			}
			return out;
		}
		/**
		* Fixpoint line solving. Two deduction families iterate to convergence:
		*  1. per-clue placement enumeration (deduceLine);
		*  2. cross-cell edge propagation — a dot where two edges are already lines
		*     forces the other two to crosses, and a dot where two are crosses
		*     forces the other two to lines (degree-2 rule at every dot).
		* Contradictions abort and return the input unchanged.
		*/
		function lineSolve(clues, known, w, h) {
			let edges = known.slice();
			const contradict = (next) => next.some((v, i) => edges[i] === 1 && v === 2 || edges[i] === 2 && v === 1);
			for (let iter = 0; iter < 400; iter += 1) {
				let changed = false;
				for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) {
					const clue = clues[r * w + c];
					if (clue < 0) continue;
					const es = cellEdges(w, h, c, r);
					const knownLines = es.filter((i) => edges[i] === 1).length;
					if (knownLines > clue) return known;
					if (knownLines === clue) {
						for (const i of es) if (edges[i] === 0) {
							edges[i] = 2;
							changed = true;
						}
						continue;
					}
					if (es.filter((i) => edges[i] === 0).length === clue - knownLines) {
						for (const i of es) if (edges[i] === 0) {
							edges[i] = 1;
							changed = true;
						}
						continue;
					}
					const next = deduceLine(edges, es.filter((i) => edges[i] !== 1), clue - knownLines);
					if (contradict(next)) return known;
					if (next.some((v, i) => v !== edges[i])) {
						edges = next;
						changed = true;
					}
				}
				const dots = (w + 1) * (h + 1);
				for (let d = 0; d < dots; d += 1) {
					const incident = edgesAtDot(w, h, d);
					const lines = incident.filter((i) => edges[i] === 1).length;
					const crosses = incident.filter((i) => edges[i] === 2).length;
					if (lines === 2 && incident.some((i) => edges[i] === 0)) {
						for (const i of incident) if (edges[i] === 0) {
							edges[i] = 2;
							changed = true;
						}
					} else if (crosses === 2 && incident.some((i) => edges[i] === 0)) {
						for (const i of incident) if (edges[i] === 0) {
							edges[i] = 1;
							changed = true;
						}
					}
				}
				if (!changed) break;
			}
			return edges;
		}
		/** Edge indices incident to a dot. */
		function edgesAtDot(w, h, dot) {
			const r = Math.floor(dot / (w + 1));
			const c = dot % (w + 1);
			const out = [];
			if (c > 0) out.push(hEdgeIndex(w, h, c - 1, r));
			if (c < w) out.push(hEdgeIndex(w, h, c, r));
			if (r > 0) out.push(vEdgeIndex(w, h, c, r - 1));
			if (r < h) out.push(vEdgeIndex(w, h, c, r));
			return out;
		}
		/** Generate a puzzle: random single cycle over the lattice, clues from it,
		* verified (optionally) by line solving. */
		function puzzleFromSeed$1(seed, w, h, requireUnique = true) {
			const attempts = requireUnique ? w * h <= 36 ? 200 : 40 : 1;
			let fallback = null;
			for (let s = 0; s < attempts; s += 1) {
				const puzzle = tryGenerate$1(seed + s * 2654435769 >>> 0, w, h);
				if (puzzle === null) continue;
				if (fallback === null) fallback = puzzle;
				if (lineSolve(puzzle.clues, new Array(edgeCount(w, h)).fill(0), w, h).every((v, i) => v === puzzle.solution[i]) && puzzle.solution.every((v) => v === 1 || v === 0)) return {
					...puzzle,
					unique: true
				};
				if (!requireUnique) return {
					...puzzle,
					unique: false
				};
			}
			return fallback ?? tryGenerate$1(seed, w, h) ?? {
				w,
				h,
				clues: [],
				solution: [],
				unique: false
			};
		}
		/** One generation attempt; null on internal failure. */
		function tryGenerate$1(seed, w, h) {
			const rng = mulberry32$11(seed);
			const total = edgeCount(w, h);
			const dots = (w + 1) * (h + 1);
			for (let round = 0; round < 60; round += 1) {
				const adj = Array.from({ length: dots }, () => []);
				const connect = (a, b) => {
					if (adj[a].length < 2 && adj[b].length < 2 && !adj[a].includes(b)) {
						adj[a].push(b);
						adj[b].push(a);
					}
				};
				const parent = Array.from({ length: dots }, (_, i) => i);
				const find = (x) => {
					while (parent[x] !== x) {
						parent[x] = parent[parent[x]];
						x = parent[x];
					}
					return x;
				};
				const candidates = [];
				for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) {
					candidates.push([r * (w + 1) + c, r * (w + 1) + c + 1]);
					candidates.push([r * (w + 1) + c, (r + 1) * (w + 1) + c]);
				}
				for (let i = candidates.length - 1; i > 0; i -= 1) {
					const j = Math.floor(rng() * (i + 1));
					[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
				}
				let edgesTaken = 0;
				for (const [a, b] of candidates) {
					if (edgesTaken >= total) break;
					if (adj[a].length >= 2 || adj[b].length >= 2) continue;
					const ra = find(a);
					const rb = find(b);
					if (ra === rb) continue;
					parent[ra] = rb;
					connect(a, b);
					edgesTaken += 1;
				}
				const deg1 = adj.map((n, i) => n.length === 1 ? i : -1).filter((i) => i >= 0);
				if (deg1.length < 2) continue;
				const start = deg1[0];
				const path = [start];
				const prevOf = /* @__PURE__ */ new Map();
				let cur = start;
				let prevDot = -1;
				while (true) {
					const nexts = adj[cur].filter((n) => n !== prevDot);
					if (nexts.length === 0) break;
					const nx = nexts[0];
					prevOf.set(nx, cur);
					path.push(nx);
					prevDot = cur;
					cur = nx;
				}
				if (path.length < 4) continue;
				const end = path[path.length - 1];
				const es = path[0];
				if (!(Math.abs(es % (w + 1) - end % (w + 1)) + Math.floor(es / (w + 1)) - Math.floor(end / (w + 1)) === 1)) continue;
				connect(es, end);
				const solution = new Array(total).fill(0);
				for (const i of path) for (const j of adj[i]) {
					const e = dotEdgeIndex(w, h, i, j);
					if (e >= 0) solution[e] = 1;
				}
				const clues = [];
				for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) {
					const es4 = cellEdges(w, h, c, r);
					clues.push(es4.filter((i) => solution[i] === 1).length);
				}
				if (!checkClues(solution, clues, w, h)) continue;
				const { singleCycle, degreeOk } = cycleCheck(solution, w, h);
				if (!singleCycle || !degreeOk) continue;
				const cells = w * h;
				const blankBudget = Math.floor(cells * (.1 + .0875 * (w - 5)));
				const order = [];
				for (let i = 0; i < cells; i += 1) order.push(i);
				for (let i = order.length - 1; i > 0; i -= 1) {
					const j = rng() * (i + 1) | 0;
					[order[i], order[j]] = [order[j], order[i]];
				}
				order.sort((a, b) => clues[a] - clues[b]);
				const hardClues = clues.slice();
				let blanks = 0;
				for (const cell of order) {
					if (blanks >= blankBudget) break;
					const saved = hardClues[cell];
					hardClues[cell] = -1;
					if (lineSolve(hardClues, new Array(edgeCount(w, h)).fill(0), w, h).some((v, i) => v === 1 && solution[i] !== 1 || v === 2 && solution[i] === 1)) hardClues[cell] = saved;
					else blanks += 1;
				}
				return {
					w,
					h,
					clues: hardClues,
					solution,
					unique: false
				};
			}
			return null;
		}
		/** Flat edge index connecting two adjacent dots, or -1 when not adjacent. */
		function dotEdgeIndex(w, h, a, b) {
			const ar = Math.floor(a / (w + 1));
			const ac = a % (w + 1);
			const br = Math.floor(b / (w + 1));
			const bc = b % (w + 1);
			if (ar === br && Math.abs(ac - bc) === 1) return hEdgeIndex(w, h, Math.min(ac, bc), ar);
			if (ac === bc && Math.abs(ar - br) === 1) return vEdgeIndex(w, h, ac, Math.min(ar, br));
			return -1;
		}
		/** Level sizes for the five levels. */
		const LEVEL_SIZES$1 = [
			[5, 5],
			[6, 6],
			[7, 7],
			[8, 8],
			[9, 9]
		];
		//#endregion
		//#region src/client/games/slitherlink/render.ts
		/**
		* Slitherlink renderer: clue numbers in cells, edge segments with line/cross
		* states, the hover highlight, HUD, and the win overlay. Edges are drawn as
		* segments between lattice dots. Uses the shared visual kit (../theme.ts).
		*/
		const HUD_H$4 = 40;
		const CELL$2 = 46;
		const MARGIN$3 = 22;
		function logicalW$1(w) {
			return 44 + CELL$2 * w;
		}
		function logicalH$1(h) {
			return 84 + CELL$2 * h;
		}
		/** Pixel position of lattice dot (col, row). */
		function dotX(col) {
			return MARGIN$3 + col * CELL$2;
		}
		function dotY(row) {
			return 62 + row * CELL$2;
		}
		/** Edge index under the pointer, or -1.
		*
		* Nearest-edge matching: convert the pointer to lattice-float coordinates,
		* then pick the closest edge element (horizontal or vertical) within
		* HIT_CELLS of a cell; ties break toward the closer axis. This is robust
		* against small coordinate drift (CSS border, subpixel scaling) that a
		* fixed-band test can miss near the outer rows. */
		function edgeAt(w, h, x, y) {
			if (y < HUD_H$4) return -1;
			const fx = (x - MARGIN$3) / CELL$2;
			const fy = (y - HUD_H$4 - MARGIN$3) / CELL$2;
			if (fx < -HIT_CELLS || fx > w + HIT_CELLS || fy < -HIT_CELLS || fy > h + HIT_CELLS) return -1;
			const hRow = Math.round(fy);
			const hCol = Math.floor(fx);
			const vCol = Math.round(fx);
			const vRow = Math.floor(fy);
			const distH = hRow >= 0 && hRow <= h && hCol >= 0 && hCol < w ? Math.abs(fy - hRow) : Infinity;
			const distV = vCol >= 0 && vCol <= w && vRow >= 0 && vRow < h ? Math.abs(fx - vCol) : Infinity;
			if (distH <= distV) {
				if (distH <= HIT_CELLS) return hEdgeIndex(w, h, hCol, hRow);
			} else if (distV <= HIT_CELLS) return vEdgeIndex(w, h, vCol, vRow);
			return -1;
		}
		/** Hit tolerance in cell units (0.30 of a cell ≈ 14 px at CELL 46). */
		const HIT_CELLS = .3;
		/** Endpoints of an edge index. */
		function edgeEnds(w, h, i) {
			const hCount = w * (h + 1);
			if (i < hCount) {
				const row = Math.floor(i / w);
				const col = i % w;
				return [
					dotX(col),
					dotY(row),
					dotX(col + 1),
					dotY(row)
				];
			}
			const j = i - hCount;
			const row = Math.floor(j / (w + 1));
			const col = j % (w + 1);
			return [
				dotX(col),
				dotY(row),
				dotX(col),
				dotY(row + 1)
			];
		}
		/** The two dot indices an edge index connects (render-side twin of logic's edgeDots). */
		function edgeDotsOf(w, h, i) {
			const hCount = w * (h + 1);
			if (i < hCount) {
				const row = Math.floor(i / w);
				const col = i % w;
				const a = row * (w + 1) + col;
				return [a, a + 1];
			}
			const j = i - hCount;
			const row = Math.floor(j / (w + 1));
			const col = j % (w + 1);
			const a = row * (w + 1) + col;
			return [a, a + (w + 1)];
		}
		function renderSlitherlink(ctx, view) {
			const { w, h, clues, edges } = view;
			drawBackground(ctx, logicalW$1(w), logicalH$1(h));
			ctx.fillStyle = THEME.textMuted;
			for (let r = 0; r <= h; r += 1) for (let c = 0; c <= w; c += 1) {
				ctx.beginPath();
				ctx.arc(dotX(c), dotY(r), 2.2, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = "700 15px system-ui, sans-serif";
			for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) {
				const clue = clues[r * w + c];
				if (clue < 0) continue;
				ctx.fillStyle = cellEdges(w, h, c, r).filter((i) => edges[i] === 1).length === clue ? THEME.good : THEME.text;
				ctx.fillText(String(clue), dotX(c) + CELL$2 / 2, dotY(r) + CELL$2 / 2);
			}
			for (let i = 0; i < edgeCount(w, h); i += 1) {
				const v = edges[i];
				if (v === 0) {
					if (i === view.hover) {
						const [x1, y1, x2, y2] = edgeEnds(w, h, i);
						ctx.strokeStyle = "rgba(255,255,255,0.25)";
						ctx.lineWidth = 3;
						ctx.beginPath();
						ctx.moveTo(x1, y1);
						ctx.lineTo(x2, y2);
						ctx.stroke();
					}
					continue;
				}
				const [x1, y1, x2, y2] = edgeEnds(w, h, i);
				if (v === 1) {
					glow(ctx, THEME.good, 8);
					ctx.strokeStyle = THEME.good;
					ctx.lineWidth = 3.5;
				} else {
					ctx.strokeStyle = THEME.bad;
					ctx.lineWidth = 1.6;
				}
				ctx.beginPath();
				ctx.moveTo(x1, y1);
				ctx.lineTo(x2, y2);
				ctx.stroke();
				noGlow(ctx);
				if (v === 2) {
					const mx = (x1 + x2) / 2;
					const my = (y1 + y2) / 2;
					const horizontal = y1 === y2;
					ctx.beginPath();
					if (horizontal) {
						ctx.moveTo(mx - 4, my - 4);
						ctx.lineTo(mx + 4, my + 4);
						ctx.moveTo(mx + 4, my - 4);
						ctx.lineTo(mx - 4, my + 4);
					} else {
						ctx.moveTo(mx - 4, my - 4);
						ctx.lineTo(mx + 4, my + 4);
						ctx.moveTo(mx - 4, my + 4);
						ctx.lineTo(mx + 4, my - 4);
					}
					ctx.stroke();
				}
			}
			const dotDegree = /* @__PURE__ */ new Map();
			for (let i = 0; i < edges.length; i += 1) {
				if (edges[i] !== 1) continue;
				for (const d of edgeDotsOf(w, h, i)) dotDegree.set(d, (dotDegree.get(d) ?? 0) + 1);
			}
			for (const [dot, deg] of dotDegree) {
				if (deg === 2) continue;
				const col = dot % (w + 1);
				const row = Math.floor(dot / (w + 1));
				ctx.beginPath();
				ctx.arc(dotX(col), dotY(row), 5, 0, Math.PI * 2);
				ctx.fillStyle = deg === 1 ? THEME.gold : THEME.bad;
				ctx.globalAlpha = .85;
				ctx.fill();
				ctx.globalAlpha = 1;
			}
			if (!view.solved && view.cluesAllSatisfied && dotDegree.size > 0) {
				ctx.textAlign = "center";
				ctx.font = "600 12px system-ui, sans-serif";
				ctx.fillStyle = THEME.gold;
				ctx.fillText("线索已全部满足——还需闭合成一个环", logicalW$1(w) / 2, logicalH$1(h) - 8);
			}
			hudPair(ctx, logicalW$1(w) - MARGIN$3, 22, `${view.levelLabel} `, `${view.unique ? "唯一解" : "多解"} · ${view.elapsed}`, "right", THEME.gold);
			if (view.solved) drawOverlay(ctx, logicalW$1(w), logicalH$1(h), "解开！", "即将进入下一关 · R 重开本关", THEME.good);
			else if (view.paused) drawOverlay(ctx, logicalW$1(w), logicalH$1(h), "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/slitherlink/index.ts
		const ADVANCE_MS$3 = 1500;
		function createSlitherlinkGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			let level = readLevel("slitherlink") - 1;
			let puzzle = puzzleFromSeed$1((level + 1) * 2654435769, ...LEVEL_SIZES$1[level % LEVEL_SIZES$1.length]);
			let edges = new Array(edgeCount(puzzle.w, puzzle.h)).fill(0);
			let hover = -1;
			let solved = false;
			let running = false;
			let startedAt = 0;
			let pausedAt = 0;
			let elapsed = "0:00";
			/** HUD 当前已显示的整秒数，用于按秒置脏。 */
			let shownSec = -1;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScore = -1;
			const particles = createParticles();
			const initialFit = fitCanvas(host, canvas, logicalW$1(puzzle.w), logicalH$1(puzzle.h));
			if (initialFit === null) throw new Error("dsh-minigames: slitherlink needs a 2d canvas context");
			let fit = initialFit;
			let ctx = fit.ctx;
			const refit = (w, h) => {
				fit.dispose();
				const next = fitCanvas(host, canvas, logicalW$1(w), logicalH$1(h));
				if (next === null) throw new Error("dsh-minigames: slitherlink needs a 2d canvas context");
				fit = next;
				ctx = next.ctx;
			};
			const startLevel = (next) => {
				level = next;
				const [w, h] = LEVEL_SIZES$1[level % LEVEL_SIZES$1.length];
				puzzle = puzzleFromSeed$1((level + 1) * 2654435769, w, h);
				edges = new Array(edgeCount(w, h)).fill(0);
				solved = false;
				hover = -1;
				startedAt = performance.now();
				refit(w, h);
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					const next = level + 1;
					saveLevel("slitherlink", next + 1);
					startLevel(next);
				}, delayMs);
			};
			const checkSolved = () => {
				if (solved || !isSolved(edges, puzzle.clues, puzzle.w, puzzle.h)) return;
				solved = true;
				if (level + 1 !== lastScore) {
					lastScore = level + 1;
					options?.onScore?.(level + 1);
				}
				const cx = logicalW$1(puzzle.w) / 2;
				const cy = logicalH$1(puzzle.h) / 2;
				particles.burst(cx, cy, THEME.gold, 18, 170);
				loop.markDirty();
				if (running) scheduleAdvance(ADVANCE_MS$3);
				else advanceRemaining = ADVANCE_MS$3;
			};
			const toggleEdge = (i, mode) => {
				if (solved || i < 0 || i >= edges.length) return;
				edges[i] = mode === "line" ? edges[i] === 1 ? 0 : 1 : edges[i] === 2 ? 0 : 2;
				loop.markDirty();
				checkSolved();
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * logicalW$1(puzzle.w) / rect.width;
				const y = (event.clientY - rect.top) * logicalH$1(puzzle.h) / rect.height;
				const i = edgeAt(puzzle.w, puzzle.h, x, y);
				if (i < 0) return;
				const cross = event.button === 2 || event.shiftKey;
				toggleEdge(i, cross ? "cross" : "line");
			};
			const onContextMenu = (event) => {
				event.preventDefault();
			};
			const onMouseMove = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * logicalW$1(puzzle.w) / rect.width;
				const y = (event.clientY - rect.top) * logicalH$1(puzzle.h) / rect.height;
				const next = edgeAt(puzzle.w, puzzle.h, x, y);
				if (next !== hover) {
					hover = next;
					loop.markDirty();
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					startLevel(level);
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				if (!solved && startedAt > 0) {
					const secs = Math.floor((performance.now() - startedAt) / 1e3);
					if (secs !== shownSec) {
						shownSec = secs;
						elapsed = `${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, "0")}`;
						loop.markDirty();
					}
				}
				const animating = particles.size() > 0;
				if (f.render || animating) {
					renderSlitherlink(ctx, {
						w: puzzle.w,
						h: puzzle.h,
						clues: puzzle.clues,
						edges,
						hover,
						levelLabel: `第 ${level + 1} 关`,
						unique: puzzle.unique,
						elapsed,
						solved,
						paused: false,
						cluesAllSatisfied: checkClues(edges, puzzle.clues, puzzle.w, puzzle.h)
					});
					particles.tick(ctx, f.dt * 1e3);
					if (animating) loop.markDirty();
				}
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				pausedAt = performance.now();
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderSlitherlink(ctx, {
					w: puzzle.w,
					h: puzzle.h,
					clues: puzzle.clues,
					edges,
					hover,
					levelLabel: `第 ${level + 1} 关`,
					unique: puzzle.unique,
					elapsed,
					solved,
					paused: true,
					cluesAllSatisfied: checkClues(edges, puzzle.clues, puzzle.w, puzzle.h)
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (pausedAt > 0) {
					startedAt += performance.now() - pausedAt;
					pausedAt = 0;
				}
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("contextmenu", onContextMenu);
			canvas.addEventListener("mousemove", onMouseMove);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startedAt = performance.now();
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					canvas.removeEventListener("mousedown", onMouseDown);
					canvas.removeEventListener("contextmenu", onContextMenu);
					canvas.removeEventListener("mousemove", onMouseMove);
					window.removeEventListener("keydown", onKeyDown);
					fit.dispose();
				}
			};
		}
		const slitherlinkGame = {
			id: "slitherlink",
			title: "数回 Slitherlink",
			icon: "⭕",
			description: "画一条闭合线圈：每个数字表示它四周边线的条数，5×5 起步逐关变大。",
			controls: [
				"左键：画线/取消",
				"右键或 Shift+左键：标记叉",
				"R：重开本关",
				"P：暂停"
			],
			create: createSlitherlinkGame
		};
		//#endregion
		//#region src/client/games/racing/logic.ts
		/**
		* Neon Racing pure logic: a pseudo-3D lane racer. The player car sits at a
		* fixed perspective distance (PD) on a curving road; traffic spawns ahead and
		* drives slower; the player changes lanes, accelerates, brakes, and scores
		* for distance, passes, and near-miss combos until a collision.
		*
		* All randomness flows through an injected mulberry32 rng so runs are
		* deterministic under a seed. The renderer (render.ts) only draws state.
		*/
		const LANES = [
			-1.7,
			0,
			1.7
		];
		const ROAD_HW = 3.4;
		const RUMBLE_W = .35;
		const CAR_H = .75;
		const COMBO_WINDOW_S = 3.2;
		const DIST_POINTS_PER_UNIT = .5;
		/** Road centre lateral offset at world z (two summed sines = curves). */
		function centreAt(z) {
			return 1.8 * Math.sin(z * .01) + .9 * Math.sin(z * .023 + 1.3);
		}
		/** mulberry32 seeded PRNG. */
		function mulberry32$10(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		const ENEMY_COLORS = [
			"#ff3b5c",
			"#ffd23f",
			"#f4f4f5",
			"#8b5cf6",
			"#34d399",
			"#fb923c",
			"#2563eb"
		];
		/** A fresh run in the ready (attract) state. */
		function createState$4(seed = 1) {
			return {
				result: "ready",
				t: 0,
				worldZ: 0,
				speed: 22,
				dist: 0,
				score: 0,
				passCount: 0,
				laneIdx: 1,
				playerLat: 0,
				latVel: 0,
				enemies: [],
				particles: [],
				spawnTimer: .9,
				crashed: false,
				crashTimer: 0,
				combo: 0,
				comboTimer: 0,
				msgTimer: 0,
				msg: "",
				events: [],
				rng: mulberry32$10(seed)
			};
		}
		/** Start (or restart) a run from the ready/over states. */
		function startRun$2(state) {
			const fresh = createState$4(state.rng() * 4294967295 >>> 0);
			Object.assign(state, fresh, { result: "playing" });
		}
		/** Toggle between playing and paused; no-op otherwise. */
		function togglePause$6(state) {
			if (state.result === "playing") state.result = "paused";
			else if (state.result === "paused") state.result = "playing";
		}
		/** Request a lane change; clamped and only while playing. */
		function changeLane(state, dir) {
			if (state.result !== "playing" || state.crashed) return false;
			const n = Math.min(Math.max(state.laneIdx + dir, 0), LANES.length - 1);
			if (n === state.laneIdx) return false;
			state.laneIdx = n;
			state.events.push({ kind: "lane" });
			return true;
		}
		/** Base speed target for the current time (ramps with survival time). */
		function baseSpeedAt(t) {
			return 34 + Math.min(30, t * .35);
		}
		function randBetween(rng, a, b) {
			return a + rng() * (b - a);
		}
		function spawnEnemy$1(state, li) {
			state.enemies.push({
				li,
				lane: LANES[li],
				z: 170 + state.rng() * 8,
				v: Math.min(40, randBetween(state.rng, 6, 26) + state.t * .1),
				color: ENEMY_COLORS[state.rng() * ENEMY_COLORS.length | 0],
				near: false,
				passed: false
			});
		}
		/**
		* Spawn a wave of 1-2 enemies, never blocking all three lanes within the
		* spawn horizon (so the player always has a way through).
		*/
		function spawnWave(state) {
			const blocked = /* @__PURE__ */ new Set();
			for (const e of state.enemies) if (e.z > 130) blocked.add(e.li);
			const free = [
				0,
				1,
				2
			].filter((i) => !blocked.has(i));
			if (free.length <= 1) return;
			for (let i = free.length - 1; i > 0; i -= 1) {
				const j = state.rng() * (i + 1) | 0;
				[free[i], free[j]] = [free[j], free[i]];
			}
			let n = 1;
			if (free.length >= 3 && state.rng() < Math.min(.4, .08 + state.t * .006)) n = 2;
			for (let i = 0; i < n; i += 1) spawnEnemy$1(state, free[i]);
		}
		function startCrash(state) {
			state.crashed = true;
			state.crashTimer = 0;
			state.combo = 0;
			state.comboTimer = 0;
			state.events.push({ kind: "crash" });
			state.msg = "撞车了！";
			state.msgTimer = 1.6;
		}
		/**
		* Advance the world by dt seconds under the player's held inputs. Mutates the
		* state in place (the renderer reads it directly). Only runs while playing.
		*/
		function step$7(state, dt, input) {
			state.events = [];
			if (state.result !== "playing") return;
			state.t += dt;
			const base = baseSpeedAt(state.t);
			let target = base;
			if (state.crashed) target = 0;
			else if (input.accel) target = Math.min(92, base + 28);
			else if (input.brake) target = base * .45;
			const rate = state.crashed ? 3 : input.accel ? 2.2 : 1.5;
			state.speed += (target - state.speed) * Math.min(1, dt * rate);
			state.worldZ += state.speed * dt;
			if (!state.crashed) {
				state.dist += state.speed * dt;
				state.score += state.speed * dt * DIST_POINTS_PER_UNIT;
			}
			const prevLat = state.playerLat;
			state.playerLat += (LANES[state.laneIdx] - state.playerLat) * Math.min(1, dt * 11);
			state.latVel = dt > 0 ? (state.playerLat - prevLat) / dt : 0;
			if (!state.crashed) {
				state.spawnTimer -= dt;
				if (state.spawnTimer <= 0) {
					spawnWave(state);
					state.spawnTimer = Math.max(.45, 1.2 - state.t * .008) * randBetween(state.rng, .75, 1.25);
				}
			}
			for (const e of state.enemies) {
				e.z -= (state.speed - e.v) * dt;
				if (!state.crashed) {
					if (Math.abs(e.z - 3) < 1.25) {
						const dx = Math.abs(state.playerLat - e.lane);
						if (dx < .8) startCrash(state);
						else if (dx < 1.35 && !e.near) {
							e.near = true;
							state.combo = Math.min(state.combo + 1, 9);
							state.comboTimer = COMBO_WINDOW_S;
							const points = 100 * state.combo;
							state.score += points;
							state.msg = `擦身而过！ +${points}`;
							state.msgTimer = 1.2;
							state.events.push({
								kind: "near-miss",
								points,
								side: e.lane > state.playerLat ? 1 : -1
							});
						}
					}
					if (!e.passed && e.z < 1.75) {
						e.passed = true;
						state.passCount += 1;
						state.score += 30;
						state.events.push({ kind: "pass" });
					}
				}
			}
			state.enemies = state.enemies.filter((e) => e.z > -10);
			if (state.comboTimer > 0) {
				state.comboTimer -= dt;
				if (state.comboTimer <= 0) state.combo = 0;
			}
			if (state.msgTimer > 0) state.msgTimer -= dt;
			if (state.crashed) {
				state.crashTimer += dt;
				if (state.crashTimer > 1.6) {
					state.result = "over";
					state.events.push({ kind: "over" });
				}
			}
		}
		/** Attract-mode step: the road scrolls behind the start screen. */
		function attractStep$1(state, dt) {
			if (state.result !== "ready") return;
			state.speed += (22 - state.speed) * Math.min(1, dt * 2);
			state.worldZ += state.speed * dt;
		}
		/** The player's smoothed world position at the perspective plane. */
		function playerWorldX(state) {
			return centreAt(state.worldZ + 3) + state.playerLat;
		}
		/** Camera lateral offset (partially follows the player). */
		function cameraX(state) {
			const rc = centreAt(state.worldZ);
			return rc + (playerWorldX(state) - rc) * .6;
		}
		const HORIZON = Math.round(243.2);
		const CX = 240;
		/** Base focal length derived from the logical size (the reference used W/H). */
		const BASE_F = Math.min(544, 312);
		const SCEN_SP = 9;
		function projX(wx, d, camX, F) {
			return CX + (wx - camX) * F / d;
		}
		function projY(d, F) {
			return HORIZON + 2 * F / d;
		}
		/** Focal length stretched slightly at speed (sense of velocity). */
		function focal(state) {
			return BASE_F * (1 + .08 * Math.min(1, state.speed / 92));
		}
		/** Screen position of the player car. */
		function playerScreen(state) {
			const F = focal(state);
			return {
				x: projX(playerWorldX(state), 3, cameraX(state), F),
				y: projY(3, F),
				s: F / 3
			};
		}
		function rr(ctx, x, y, w, h, r) {
			const rad = Math.min(r, w / 2, h / 2);
			ctx.beginPath();
			ctx.moveTo(x + rad, y);
			ctx.arcTo(x + w, y, x + w, y + h, rad);
			ctx.arcTo(x + w, y + h, x, y + h, rad);
			ctx.arcTo(x, y + h, x, y + h, rad);
			ctx.arcTo(x, y, x, y, rad);
			ctx.closePath();
		}
		function drawSky(ctx, state) {
			const camX = cameraX(state);
			const g = ctx.createLinearGradient(0, 0, 0, 245);
			g.addColorStop(0, "#05010f");
			g.addColorStop(.45, "#1d0837");
			g.addColorStop(.8, "#5b1a5e");
			g.addColorStop(1, "#ff4f7b");
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, 480, 245);
			const sunX = CX - camX * 35;
			const sunY = 140.6;
			const r = 96;
			ctx.save();
			ctx.beginPath();
			ctx.arc(sunX, sunY, r, 0, Math.PI * 2);
			ctx.clip();
			const sg = ctx.createLinearGradient(0, 44.599999999999994, 0, HORIZON);
			sg.addColorStop(0, "#fff27a");
			sg.addColorStop(.5, "#ff9a3c");
			sg.addColorStop(1, "#ff2d75");
			ctx.fillStyle = sg;
			ctx.fillRect(sunX - r, 44.599999999999994, 192, 192);
			ctx.fillStyle = "#5a1a5c";
			for (let i = 0; i < 6; i += 1) {
				const y = 155 + i * r * .13 + i * i * r * .02;
				const h = r * .02 + i * r * .012;
				ctx.fillRect(sunX - r, y, 192, h);
			}
			ctx.restore();
		}
		function drawGround(ctx, state) {
			const F = focal(state);
			const camX = cameraX(state);
			for (let y = 244; y < 640; y += 1) {
				const d = 2 * F / (y - HORIZON);
				const tz = state.worldZ + d;
				const rc = centreAt(tz);
				const band = Math.floor(tz / 6) & 1;
				const lx = CX + (rc - ROAD_HW - camX) * F / d;
				const rx = CX + (rc + ROAD_HW - camX) * F / d;
				const rrw = RUMBLE_W * F / d;
				ctx.fillStyle = band ? "#0c4f2a" : "#0f5d32";
				ctx.fillRect(0, y, 480, 1);
				ctx.fillStyle = band ? "#e11d3a" : "#f5f5f5";
				ctx.fillRect(lx - rrw, y, rrw, 1);
				ctx.fillRect(rx, y, rrw, 1);
				ctx.fillStyle = band ? "#3b3e4b" : "#444856";
				ctx.fillRect(lx, y, rx - lx, 1);
				if (tz % 8 < 4) {
					ctx.fillStyle = "#e8ecf5";
					const dw = Math.max(1, .14 * F / d);
					for (const bx of [-.85, .85]) {
						const x = CX + (rc + bx - camX) * F / d;
						ctx.fillRect(x - dw / 2, y, dw, 1);
					}
				}
			}
		}
		function drawFog(ctx) {
			const h = 204.8;
			const g = ctx.createLinearGradient(0, HORIZON, 0, 447.8);
			g.addColorStop(0, "rgba(255,79,123,0.95)");
			g.addColorStop(.5, "rgba(255,79,123,0.25)");
			g.addColorStop(1, "rgba(255,79,123,0)");
			ctx.fillStyle = g;
			ctx.fillRect(0, HORIZON, 480, h);
		}
		function drawTree(ctx, x, y, s, kind) {
			const h = (3 + kind % 3 * .6) * s;
			const w = 1.5 * s;
			ctx.fillStyle = "#3b2412";
			ctx.fillRect(x - .08 * s, y - h * .32, .16 * s, h * .32);
			ctx.fillStyle = "#0a3d2a";
			ctx.beginPath();
			ctx.moveTo(x, y - h);
			ctx.lineTo(x - w * .5, y - h * .3);
			ctx.lineTo(x + w * .5, y - h * .3);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = "#137a4d";
			ctx.beginPath();
			ctx.moveTo(x, y - h * .8);
			ctx.lineTo(x - w * .38, y - h * .4);
			ctx.lineTo(x + w * .38, y - h * .4);
			ctx.closePath();
			ctx.fill();
		}
		function drawPole(ctx, x, y, s) {
			const h = 5 * s;
			ctx.fillStyle = "#7d8599";
			ctx.fillRect(x - .06 * s, y - h, .12 * s, h);
			ctx.fillStyle = "rgba(255,226,140,0.22)";
			ctx.beginPath();
			ctx.arc(x, y - h, .5 * s, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#ffe38a";
			ctx.fillRect(x - .22 * s, y - h, .44 * s, .09 * s);
		}
		function drawScenery(ctx, state) {
			const F = focal(state);
			const camX = cameraX(state);
			const kMin = Math.floor(state.worldZ / SCEN_SP) + 1;
			const kMax = Math.floor((state.worldZ + 240) / SCEN_SP);
			for (let k = kMax; k >= kMin; k -= 1) {
				const zW = k * SCEN_SP;
				const d = zW - state.worldZ;
				if (d < 1.2) continue;
				const rc = centreAt(zW);
				const y = projY(d, F);
				const s = F / d;
				for (const side of [-1, 1]) {
					const kind = (k * 73 + (side > 0 ? 41 : 7)) % 11;
					if (kind === 4 || kind === 9) drawPole(ctx, projX(rc + side * 4.8, d, camX, F), y, s);
					else if (kind <= 3 || kind === 7) drawTree(ctx, projX(rc + side * 5.2, d, camX, F), y, s, kind);
				}
			}
		}
		/** One rear-view car (bottom centre at x, y). */
		function drawCar(ctx, x, y, w, h, color, isPlayer, roll, speedFrac, crashed) {
			const hw = w / 2;
			ctx.save();
			ctx.translate(x, y);
			if (roll) ctx.rotate(Math.max(-.25, Math.min(.25, roll)));
			ctx.fillStyle = "rgba(0,0,0,0.45)";
			ctx.beginPath();
			ctx.ellipse(0, h * .04, hw * 1.15, h * .12, 0, 0, Math.PI * 2);
			ctx.fill();
			if (isPlayer && speedFrac > .6 && !crashed) {
				const L = h * (.25 + speedFrac * .5 + Math.random() * .2);
				const g = ctx.createLinearGradient(0, 0, 0, L);
				g.addColorStop(0, "rgba(255,245,180,0.95)");
				g.addColorStop(.35, "rgba(255,150,40,0.85)");
				g.addColorStop(1, "rgba(255,40,0,0)");
				ctx.fillStyle = g;
				for (const fx of [-.25, .25]) {
					ctx.beginPath();
					ctx.moveTo(w * (fx - .08), -h * .05);
					ctx.lineTo(w * (fx + .08), -h * .05);
					ctx.lineTo(w * fx, L);
					ctx.closePath();
					ctx.fill();
				}
			}
			ctx.fillStyle = "#050507";
			ctx.fillRect(-hw * .98, -h * .2, w * .24, h * .2);
			ctx.fillRect(hw * .74, -h * .2, w * .24, h * .2);
			rr(ctx, -hw, -h * .66, w, h * .56, w * .12);
			ctx.fillStyle = color;
			ctx.fill();
			const bg = ctx.createLinearGradient(-hw, 0, hw, 0);
			bg.addColorStop(0, "rgba(0,0,0,0.45)");
			bg.addColorStop(.25, "rgba(0,0,0,0)");
			bg.addColorStop(.75, "rgba(0,0,0,0)");
			bg.addColorStop(1, "rgba(0,0,0,0.45)");
			ctx.fillStyle = bg;
			ctx.fill();
			if (isPlayer) {
				ctx.fillStyle = "rgba(255,255,255,0.85)";
				ctx.fillRect(-w * .035, -h * .64, w * .07, h * .52);
			}
			ctx.fillStyle = "#12121a";
			ctx.fillRect(-hw * .9, -h * .22, w * .9, h * .12);
			ctx.fillStyle = "#0a0c16";
			ctx.beginPath();
			ctx.moveTo(-hw * .62, -h * .62);
			ctx.lineTo(hw * .62, -h * .62);
			ctx.lineTo(hw * .46, -h * .98);
			ctx.lineTo(-hw * .46, -h * .98);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = "rgba(140,210,255,0.14)";
			ctx.beginPath();
			ctx.moveTo(-hw * .5, -h * .64);
			ctx.lineTo(-hw * .18, -h * .64);
			ctx.lineTo(-hw * .06, -h * .95);
			ctx.lineTo(-hw * .34, -h * .95);
			ctx.closePath();
			ctx.fill();
			if (isPlayer) {
				ctx.fillStyle = "#0b0b10";
				ctx.fillRect(-hw * .95, -h * .72, w * .95, h * .04);
				ctx.fillRect(-hw * .7, -h * .72, w * .06, h * .1);
				ctx.fillRect(hw * .64, -h * .72, w * .06, h * .1);
			}
			ctx.shadowColor = "#ff1a3c";
			ctx.shadowBlur = 12;
			ctx.fillStyle = "#ff2446";
			ctx.fillRect(-hw * .88, -h * .52, w * .3, h * .1);
			ctx.fillRect(hw * .58, -h * .52, w * .3, h * .1);
			ctx.fillRect(-hw * .58, -h * .5, hw * 1.16, h * .04);
			ctx.shadowBlur = 0;
			ctx.restore();
		}
		function drawEnemies$1(ctx, state) {
			const F = focal(state);
			const camX = cameraX(state);
			const speedFrac = Math.min(1, state.speed / 92);
			const far = [];
			const near = [];
			for (const e of state.enemies) if (e.z > 1) (e.z >= 3 ? far : near).push(e);
			far.sort((a, b) => b.z - a.z);
			near.sort((a, b) => b.z - a.z);
			const drawList = (list) => {
				for (const e of list) {
					const d = e.z;
					const x = projX(centreAt(state.worldZ + d) + e.lane, d, camX, F);
					const y = projY(d, F);
					const s = F / d;
					drawCar(ctx, x, y, 1 * s, CAR_H * s, e.color, false, 0, speedFrac, state.crashed);
				}
			};
			drawList(far);
			const p = playerScreen(state);
			const ps = p.s;
			if (!(state.crashed && state.crashTimer > .12)) drawCar(ctx, p.x, p.y, 1 * ps, CAR_H * ps, "#22d3ee", true, -state.latVel * .012, speedFrac, state.crashed);
			drawList(near);
		}
		function drawParticles(ctx, state) {
			for (const p of state.particles) {
				ctx.globalAlpha = Math.max(0, p.life);
				ctx.fillStyle = p.color;
				ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
			}
			ctx.globalAlpha = 1;
		}
		/** Speed lines radiating outward at high speed. */
		const streaks = [];
		function drawStreaks(ctx, state) {
			const frac = Math.min(1, state.speed / 92);
			if (frac < .3) return;
			if (streaks.length === 0) for (let i = 0; i < 60; i += 1) streaks.push({
				a: Math.random() * Math.PI * 2,
				r: 20 + Math.random() * 200,
				k: .6 + Math.random() * .9,
				len: .4 + Math.random() * .8
			});
			const alpha = Math.min(1, (frac - .3) * 1.5);
			const cy = 320;
			ctx.lineCap = "round";
			for (const s of streaks) {
				s.r += (80 + state.speed * .02) * s.k;
				if (s.r > 420) s.r = 20 + Math.random() * 60;
				const len = (20 + s.r * .12 * s.len) * (.4 + frac * .6);
				const c = Math.cos(s.a);
				const sn = Math.sin(s.a);
				ctx.strokeStyle = `rgba(190,235,255,${(alpha * .5 * Math.min(1, s.r / 120)).toFixed(3)})`;
				ctx.lineWidth = 1 + s.r / 400;
				ctx.beginPath();
				ctx.moveTo(CX + c * s.r, cy + sn * s.r);
				ctx.lineTo(CX + c * (s.r + len), cy + sn * (s.r + len));
				ctx.stroke();
			}
		}
		/** Draw one frame. */
		function renderRacing(ctx, view) {
			const state = view.state;
			drawBackground(ctx, 480, 640);
			drawSky(ctx, state);
			drawGround(ctx, state);
			drawScenery(ctx, state);
			drawFog(ctx);
			drawEnemies$1(ctx, state);
			drawParticles(ctx, state);
			drawStreaks(ctx, state);
			const vg = ctx.createRadialGradient(CX, 320, Math.min(480, 640) * .35, CX, 320, Math.hypot(480, 640) * .6);
			vg.addColorStop(0, "rgba(0,0,0,0)");
			vg.addColorStop(1, "rgba(0,0,0,0.65)");
			ctx.fillStyle = vg;
			ctx.fillRect(0, 0, 480, 640);
			hudPair(ctx, 12, 22, "分数 ", String(Math.floor(state.score)), "left", THEME.gold);
			hudPair(ctx, 12, 46, "距离 ", `${String(Math.floor(state.dist))} m · 超车 ${String(state.passCount)}`, "left", THEME.text);
			hudPair(ctx, 468, 22, "速度 ", `${String(Math.round(state.speed * 3.6))} km/h`, "right", "#7fdfff");
			hudPair(ctx, 468, 46, "最高 ", String(view.best), "right", THEME.text);
			if (state.combo > 1 && state.comboTimer > 0) {
				ctx.textAlign = "center";
				ctx.font = "800 16px system-ui, sans-serif";
				ctx.fillStyle = "#5ff7ff";
				ctx.fillText(`COMBO ×${state.combo}`, CX, 235);
			}
			if (state.msgTimer > 0 && state.msg !== "") {
				ctx.textAlign = "center";
				ctx.font = "900 20px system-ui, sans-serif";
				ctx.fillStyle = "#ffe066";
				ctx.globalAlpha = Math.min(1, state.msgTimer * 2.5);
				ctx.fillText(state.msg, CX, 213);
				ctx.globalAlpha = 1;
			}
			if (state.result === "over") drawOverlay(ctx, 480, 640, "撞车了！", `分数 ${String(Math.floor(state.score))} · 距离 ${String(Math.floor(state.dist))} m · Enter 再来一局`, THEME.bad);
			else if (state.result === "ready") drawOverlay(ctx, 480, 640, "霓虹疾驰", "Enter 开始 · ← → 换道 · ↑ 加速", THEME.gold);
			else if (view.paused) drawOverlay(ctx, 480, 640, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/racing/index.ts
		const BEST_KEY$3 = "dsh-minigames:best:racing";
		function loadBest$3() {
			try {
				const v = Number(window.localStorage.getItem(BEST_KEY$3));
				return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
			} catch {
				return 0;
			}
		}
		function saveBest$3(v) {
			try {
				window.localStorage.setItem(BEST_KEY$3, String(Math.floor(v)));
			} catch {}
		}
		function createRacingGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 640);
			if (fit === null) throw new Error("dsh-minigames: racing needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createState$4((Date.now() ^ 2654435769) >>> 0);
			const input = {
				left: false,
				right: false,
				accel: false,
				brake: false
			};
			let running = false;
			let best = loadBest$3();
			let lastScore = -1;
			const reportScore = () => {
				const s = Math.floor(state.score);
				if (s === lastScore) return;
				lastScore = s;
				options?.onScore?.(s);
				if (s > best) {
					best = s;
					saveBest$3(best);
				}
			};
			let actx = null;
			let engOsc = null;
			let engGain = null;
			const initAudio = () => {
				if (actx !== null) {
					if (actx.state === "suspended") actx.resume();
					return;
				}
				try {
					const Ctor = window.AudioContext ?? window.webkitAudioContext;
					if (Ctor === void 0) return;
					actx = new Ctor();
					engOsc = actx.createOscillator();
					engOsc.type = "sawtooth";
					engOsc.frequency.value = 60;
					const lp = actx.createBiquadFilter();
					lp.type = "lowpass";
					lp.frequency.value = 500;
					engGain = actx.createGain();
					engGain.gain.value = 0;
					engOsc.connect(lp);
					lp.connect(engGain);
					engGain.connect(actx.destination);
					engOsc.start();
				} catch {
					actx = null;
				}
			};
			const beep = (freq, dur, type, vol) => {
				if (actx === null) return;
				try {
					const o = actx.createOscillator();
					const g = actx.createGain();
					const now = actx.currentTime;
					o.type = type;
					o.frequency.value = freq;
					g.gain.setValueAtTime(vol, now);
					g.gain.exponentialRampToValueAtTime(.001, now + dur);
					o.connect(g);
					g.connect(actx.destination);
					o.start(now);
					o.stop(now + dur + .02);
				} catch {}
			};
			const noiseBurst = (dur, vol) => {
				if (actx === null) return;
				try {
					const n = Math.floor(actx.sampleRate * dur);
					const buf = actx.createBuffer(1, n, actx.sampleRate);
					const data = buf.getChannelData(0);
					for (let i = 0; i < n; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
					const src = actx.createBufferSource();
					src.buffer = buf;
					const g = actx.createGain();
					g.gain.value = vol;
					src.connect(g);
					g.connect(actx.destination);
					src.start();
				} catch {}
			};
			const updateEngine = () => {
				if (actx === null || engOsc === null || engGain === null) return;
				const now = actx.currentTime;
				const on = state.result === "playing" && !state.crashed;
				engOsc.frequency.setTargetAtTime(55 + state.speed * 2.4, now, .15);
				engGain.gain.setTargetAtTime(on ? .02 + state.speed / 92 * .035 : 0, now, .15);
			};
			const spawnBurst = (x, y, color, n, power) => {
				for (let i = 0; i < n; i += 1) {
					const a = Math.random() * Math.PI * 2;
					const sp = power * (.3 + Math.random() * .7);
					state.particles.push({
						x,
						y,
						vx: Math.cos(a) * sp,
						vy: Math.sin(a) * sp - power * .4,
						life: 1,
						max: .3 + Math.random() * .6,
						size: 2 + Math.random() * 4,
						color,
						grav: power
					});
				}
			};
			const handleEvents = () => {
				for (const ev of state.events) if (ev.kind === "lane") beep(520, .06, "square", .03);
				else if (ev.kind === "near-miss") {
					beep(1046, .14, "triangle", .14);
					spawnBurst(240, 640 * .72, "#ffe066", 10, 220);
				} else if (ev.kind === "crash") {
					noiseBurst(.8, .5);
					beep(140, .5, "sawtooth", .15);
					spawnBurst(240, 640 * .72, "#ff8a00", 40, 500);
				} else if (ev.kind === "pass") {} else if (ev.kind === "over") reportScore();
			};
			const restart = () => {
				startRun$2(state);
				lastScore = -1;
				reportScore();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const k = event.code;
				if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === "Space") event.preventDefault();
				switch (k) {
					case "ArrowLeft":
					case "KeyA":
						if (!event.repeat && state.result === "playing") changeLane(state, -1);
						break;
					case "ArrowRight":
					case "KeyD":
						if (!event.repeat && state.result === "playing") changeLane(state, 1);
						break;
					case "ArrowUp":
					case "KeyW":
						input.accel = true;
						break;
					case "ArrowDown":
					case "KeyS":
						input.brake = true;
						break;
					case "Enter":
					case "NumpadEnter":
					case "Space":
						if (!event.repeat) {
							if (state.result === "ready" || state.result === "over") {
								initAudio();
								restart();
							} else if (state.result === "paused") togglePause$6(state);
						}
						break;
					case "KeyP":
					case "Escape": if (!event.repeat && state.result !== "ready") togglePause$6(state);
				}
			};
			const onKeyUp = (event) => {
				if (event.code === "ArrowUp" || event.code === "KeyW") input.accel = false;
				if (event.code === "ArrowDown" || event.code === "KeyS") input.brake = false;
			};
			const onPointerDown = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * 480 / rect.width;
				if (state.result === "ready" || state.result === "over") {
					initAudio();
					restart();
					return;
				}
				if (state.result === "paused") {
					togglePause$6(state);
					return;
				}
				changeLane(state, x < 240 ? -1 : 1);
			};
			const frame = (f) => {
				if (!running) return;
				const dt = f.dt;
				step$7(state, dt, input);
				handleEvents();
				for (const p of state.particles) {
					p.vy += p.grav * dt;
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					p.life -= dt / p.max;
				}
				state.particles = state.particles.filter((p) => p.life > 0);
				attractStep$1(state, dt);
				if (state.result === "playing") reportScore();
				if (f.render) renderRacing(ctx, {
					state,
					paused: false,
					best
				});
				updateEngine();
			};
			const loop = createFrameLoop(frame);
			const pause = () => {
				if (!running) return;
				running = false;
				renderRacing(ctx, {
					state,
					paused: true,
					best
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.markDirty();
			};
			const togglePauseLocal = () => {
				togglePause$6(state);
				if (state.result === "paused") pause();
				else resume();
			};
			const keyHandler = (event) => {
				if (event.code === "KeyP" || event.code === "Escape") {
					if (!event.repeat && state.result !== "ready") togglePauseLocal();
					return;
				}
				onKeyDown(event);
			};
			const keyUpHandler = (event) => onKeyUp(event);
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", keyHandler);
			window.addEventListener("keyup", keyUpHandler);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", keyHandler);
					window.removeEventListener("keyup", keyUpHandler);
					if (actx !== null) try {
						actx.close();
					} catch {}
					fit.dispose();
				}
			};
		}
		const racingGame = {
			id: "racing",
			title: "霓虹疾驰",
			icon: "🏎️",
			description: "伪 3D 视角赛车躲避：变道躲开来车，擦身而过触发连击加分，速度越快越刺激。",
			controls: [
				"← → / A D：换道",
				"↑ / W：加速 · ↓ / S：减速",
				"Enter：开始 · P：暂停",
				"触屏点击左右半屏换道"
			],
			create: createRacingGame
		};
		const ROW_H$1 = 36 * Math.sqrt(3) / 2;
		/** Fire nudges a near-horizontal aim up by this so shots always rise. */
		const AIM_EPS = .02;
		/** Center distance at which a flying bubble counts as touching the stack. */
		const COLLIDE_D = 36 * .92;
		/** mulberry32 seeded PRNG. */
		function mulberry32$9(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Center x of cell (r, c); odd rows are offset right by half a bubble. */
		function cellX(r, c) {
			return 38 + c * 36 + r % 2 * 18;
		}
		/** Center y of row r (row 0 hangs from the ceiling). */
		function cellY(r) {
			return 72 + r * ROW_H$1;
		}
		function cellCenter$1(r, c) {
			return {
				x: cellX(r, c),
				y: cellY(r)
			};
		}
		function inGrid(r, c) {
			const cols = r % 2 === 0 ? 8 : 7;
			return r >= 0 && r < 13 && c >= 0 && c < cols;
		}
		/** Columns present in row r (even rows COLS, odd rows COLS - 1). */
		function colsIn(r) {
			return r % 2 === 0 ? 8 : 7;
		}
		/** The up to 6 hex neighbors of (r, c) that exist in the grid. */
		function neighborsOf(r, c) {
			const out = [];
			const push = (nr, nc) => {
				if (inGrid(nr, nc)) out.push({
					r: nr,
					c: nc
				});
			};
			push(r, c - 1);
			push(r, c + 1);
			if (r % 2 === 0) {
				push(r - 1, c - 1);
				push(r - 1, c);
				push(r + 1, c - 1);
				push(r + 1, c);
			} else {
				push(r - 1, c);
				push(r - 1, c + 1);
				push(r + 1, c);
				push(r + 1, c + 1);
			}
			return out;
		}
		/** Rows of bubbles a level starts with: level N → 4+N rows, wrapping at 5. */
		function initialRows(level) {
			return 5 + (level - 1) % 5;
		}
		/** Distinct palette size: 5 colors early, 6 from level 4 on. */
		function colorsForLevel(level) {
			return Math.min(6, 5 + Math.floor((level - 1) / 3));
		}
		function emptyGrid() {
			return Array.from({ length: 13 }, () => Array(8).fill(null));
		}
		function levelSeed$3(seed, level) {
			return (seed ^ Math.imul(level, 2654435769)) >>> 0;
		}
		/** Build the opening board: the level's first rows fully filled. */
		function buildBoard(seed, level) {
			const rng = mulberry32$9(levelSeed$3(seed, level));
			const grid = emptyGrid();
			const colors = colorsForLevel(level);
			for (let r = 0; r < initialRows(level); r += 1) for (let c = 0; c < colsIn(r); c += 1) grid[r][c] = rng() * colors | 0;
			return grid;
		}
		/** Color index for the next loaded bubble: only colors still on the board. */
		function nextColor(state) {
			const present = /* @__PURE__ */ new Set();
			for (const row of state.grid) for (const v of row) if (v !== null) present.add(v);
			if (present.size === 0) return state.rng() * colorsForLevel(state.level) | 0;
			const list = [...present];
			return list[state.rng() * list.length | 0];
		}
		/** A fresh state at `level` (defaults to 1) playing immediately. */
		function createState$3(seed = 1, level = 1) {
			const state = {
				result: "playing",
				level,
				score: 0,
				grid: emptyGrid(),
				current: 0,
				next: 0,
				aim: Math.PI / 2,
				flying: null,
				seed,
				rng: mulberry32$9(0),
				events: []
			};
			loadLevel(state, level);
			return state;
		}
		/** Rebuild the board for `level` against the stored seed (shared reset path). */
		function loadLevel(state, level) {
			state.level = level;
			state.result = "playing";
			state.grid = buildBoard(state.seed, level);
			state.rng = mulberry32$9(levelSeed$3(state.seed, level) ^ 1374496523);
			state.flying = null;
			state.aim = Math.PI / 2;
			state.current = nextColor(state);
			state.next = nextColor(state);
		}
		/** Enter the next level with a fresh board, keeping the running score. */
		function advanceLevel$1(state) {
			loadLevel(state, state.level + 1);
		}
		/** Restart the CURRENT level: same seed → the identical initial board, score 0. */
		function restartLevel$3(state) {
			loadLevel(state, state.level);
			state.score = 0;
			state.events = [];
		}
		/**
		* Clamp an aim angle to [0, π]. Downward angles in atan2's range fold to
		* the nearer horizontal; anything further under truncates to 0 (plain
		* clamp, e.g. a large negative adjustAim delta).
		*/
		function clampAim(a) {
			if (a < -Math.PI) return 0;
			if (a < 0) return a < -Math.PI / 2 ? Math.PI : 0;
			return Math.min(Math.PI, a);
		}
		/** Move the aim by `delta` radians, clamped to [0, π]; ← increases it. */
		function adjustAim(state, delta) {
			state.aim = clampAim(state.aim + delta);
		}
		/** Aim the shooter at a logical-space point (mouse aiming). */
		function aimAt(state, x, y) {
			state.aim = clampAim(Math.atan2(480 - y, x - 164));
		}
		/**
		* Fire the loaded bubble along the aim. Only while playing and with no shot
		* in flight; near-horizontal aims are nudged up so the shot always rises.
		*/
		function fire$2(state) {
			if (state.result !== "playing" || state.flying !== null) return false;
			const a = Math.min(Math.PI - AIM_EPS, Math.max(AIM_EPS, state.aim));
			state.flying = {
				x: 164,
				y: 480,
				vx: Math.cos(a) * 520,
				vy: -Math.sin(a) * 520,
				color: state.current
			};
			state.current = state.next;
			state.next = nextColor(state);
			return true;
		}
		/**
		* The empty cell a bubble at (x, y) snaps to: the nearest empty cell that is
		* in the ceiling row or adjacent to an occupied cell. Ties resolve to the
		* smallest (r, c) so the snap is deterministic. Null when no cell qualifies.
		*/
		function findSnapCell(grid, x, y) {
			let best = null;
			let bestD = Infinity;
			for (let r = 0; r < 13; r += 1) for (let c = 0; c < colsIn(r); c += 1) {
				if (grid[r][c] !== null) continue;
				if (r !== 0 && !neighborsOf(r, c).some((n) => grid[n.r][n.c] !== null)) continue;
				const dx = cellX(r, c) - x;
				const dy = cellY(r) - y;
				const d = dx * dx + dy * dy;
				if (d < bestD) {
					bestD = d;
					best = {
						r,
						c
					};
				}
			}
			return best;
		}
		/** All same-color cells connected to (r, c) (including it), by BFS. */
		function connectedSameColor(grid, r, c) {
			const color = grid[r][c];
			if (color === null) return [];
			const seen = /* @__PURE__ */ new Set([`${r},${c}`]);
			const out = [{
				r,
				c
			}];
			for (let i = 0; i < out.length; i += 1) {
				const cur = out[i];
				for (const n of neighborsOf(cur.r, cur.c)) {
					const key = `${n.r},${n.c}`;
					if (seen.has(key)) continue;
					if (grid[n.r][n.c] !== color) continue;
					seen.add(key);
					out.push(n);
				}
			}
			return out;
		}
		/** Occupied cells connected to the ceiling (directly or through neighbors). */
		function attachedCells(grid) {
			const attached = /* @__PURE__ */ new Set();
			const queue = [];
			for (let c = 0; c < 8; c += 1) if (grid[0][c] !== null) {
				attached.add(`0,${c}`);
				queue.push({
					r: 0,
					c
				});
			}
			for (let i = 0; i < queue.length; i += 1) {
				const cur = queue[i];
				for (const n of neighborsOf(cur.r, cur.c)) {
					const key = `${n.r},${n.c}`;
					if (attached.has(key)) continue;
					if (grid[n.r][n.c] === null) continue;
					attached.add(key);
					queue.push(n);
				}
			}
			return attached;
		}
		/** Pop matches and drop hangers after a bubble settled at (r, c). */
		function resolveSettle(state, r, c, color) {
			const cluster = connectedSameColor(state.grid, r, c);
			let popped = false;
			if (cluster.length >= 3) {
				popped = true;
				for (const cell of cluster) state.grid[cell.r][cell.c] = null;
				state.score += 10 * cluster.length;
				state.events.push({
					kind: "pop",
					cells: cluster,
					color
				});
				const attached = attachedCells(state.grid);
				const fallen = [];
				for (let rr = 0; rr < 13; rr += 1) for (let cc = 0; cc < colsIn(rr); cc += 1) if (state.grid[rr][cc] !== null && !attached.has(`${rr},${cc}`)) fallen.push({
					r: rr,
					c: cc
				});
				for (const cell of fallen) state.grid[cell.r][cell.c] = null;
				if (fallen.length > 0) {
					state.score += 20 * fallen.length;
					state.events.push({
						kind: "fall",
						cells: fallen
					});
				}
			}
			return popped;
		}
		function settle(state, x, y, color) {
			const cell = findSnapCell(state.grid, x, y);
			if (cell === null || cell.r >= 12) {
				state.result = "over";
				state.events.push({ kind: "over" });
				return;
			}
			state.grid[cell.r][cell.c] = color;
			state.events.push({
				kind: "snap",
				cell,
				color
			});
			const popped = resolveSettle(state, cell.r, cell.c, color);
			if (state.grid.every((row) => row.every((v) => v === null))) {
				state.result = "won";
				state.events.push({ kind: "clear" });
				return;
			}
			if (!popped && cell.r >= 12) {
				state.result = "over";
				state.events.push({ kind: "over" });
			}
		}
		/**
		* Advance the simulation by dt seconds: move the flying bubble, bounce it
		* off the side walls, and settle it on ceiling/stack contact. Mutates the
		* state in place (the renderer reads it directly).
		*/
		function step$6(state, dt) {
			state.events = [];
			if (state.result !== "playing") return;
			const f = state.flying;
			if (f === null) return;
			f.x += f.vx * dt;
			f.y += f.vy * dt;
			const left = 38;
			const right = 290;
			if (f.x < left) {
				f.x = left + (left - f.x);
				f.vx = -f.vx;
				state.events.push({
					kind: "bounce",
					side: -1
				});
			} else if (f.x > right) {
				f.x = right - (f.x - right);
				f.vx = -f.vx;
				state.events.push({
					kind: "bounce",
					side: 1
				});
			}
			if (f.y - 18 <= 54) {
				const color = f.color;
				state.flying = null;
				settle(state, f.x, 72, color);
				return;
			}
			const hitD2 = COLLIDE_D * COLLIDE_D;
			for (let r = 0; r < 13; r += 1) for (let c = 0; c < colsIn(r); c += 1) {
				if (state.grid[r][c] === null) continue;
				const dx = f.x - cellX(r, c);
				const dy = f.y - cellY(r);
				if (dx * dx + dy * dy <= hitD2) {
					const { x, y, color } = f;
					state.flying = null;
					settle(state, x, y, color);
					return;
				}
			}
		}
		/** Toggle between playing and paused; no-op otherwise. */
		function togglePause$5(state) {
			if (state.result === "playing") state.result = "paused";
			else if (state.result === "paused") state.result = "playing";
		}
		//#endregion
		//#region src/client/games/bubble/render.ts
		/**
		* 泡泡龙 canvas renderer: the walled hex playfield with a ceiling, the
		* danger line, glowing bubbles, the rotating shooter with its loaded and
		* next bubble, a dotted aim guide, and overlays for pause / game over /
		* level clear. The renderer stays stateless and draws caller-owned logic
		* state using the shared visual kit (../theme.ts); geometry constants come
		* from logic.ts so tests and rendering share one truth.
		*/
		const LOSE_LINE_Y = cellY(12) - 18;
		const NEXT_X = 226;
		const NEXT_Y = 466;
		/** Draw one bubble (grid, flying, or preview) at a logical position. */
		function drawBubble(ctx, x, y, color) {
			const fill = accent(color);
			glow(ctx, fill, 12);
			ctx.fillStyle = fill;
			ctx.beginPath();
			ctx.arc(x, y, 18, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = "rgba(16,16,26,0.55)";
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.fillStyle = "rgba(255,255,255,0.35)";
			ctx.beginPath();
			ctx.arc(x - 5.76, y - 6.12, 18 * .28, 0, Math.PI * 2);
			ctx.fill();
		}
		/**
		* Draw one frame.
		* @param paused - show the 已暂停 overlay.
		*/
		function renderBubble(ctx, w, h, state, paused) {
			ctx.clearRect(0, 0, w, h);
			drawBackground(ctx, w, h);
			hudPair(ctx, 20, 21, "关卡 ", String(state.level));
			hudPair(ctx, w - 20, 21, "分 数 ", String(state.score), "right", THEME.gold);
			ctx.fillStyle = "rgba(255,255,255,0.028)";
			ctx.fillRect(20, 54, 288, LOSE_LINE_Y - 54);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(20, LOSE_LINE_Y);
			ctx.lineTo(20, 54);
			ctx.lineTo(308, 54);
			ctx.lineTo(308, LOSE_LINE_Y);
			ctx.stroke();
			ctx.strokeStyle = THEME.bad;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([6, 6]);
			ctx.beginPath();
			ctx.moveTo(22, LOSE_LINE_Y);
			ctx.lineTo(306, LOSE_LINE_Y);
			ctx.stroke();
			ctx.setLineDash([]);
			for (let r = 0; r < Math.min(13, 12); r += 1) for (let c = 0; c < colsIn(r); c += 1) {
				const color = state.grid[r][c];
				if (color != null) drawBubble(ctx, cellX(r, c), cellY(r), color);
			}
			const dx = Math.cos(state.aim);
			const dy = -Math.sin(state.aim);
			ctx.strokeStyle = accent(state.current);
			ctx.globalAlpha = .55;
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 9]);
			ctx.beginPath();
			ctx.moveTo(164 + dx * 24, 480 + dy * 24);
			ctx.lineTo(164 + dx * 122, 480 + dy * 122);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.globalAlpha = 1;
			ctx.strokeStyle = THEME.text;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(164 + dx * 20, 480 + dy * 20);
			ctx.lineTo(164 + dx * 32, 480 + dy * 32);
			ctx.stroke();
			drawBubble(ctx, 164, 480, state.current);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(164, 480, 23, 0, Math.PI * 2);
			ctx.stroke();
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText("下一个", NEXT_X, 498);
			drawBubble(ctx, NEXT_X, NEXT_Y, state.next);
			const f = state.flying;
			if (f !== null) drawBubble(ctx, f.x, f.y, f.color);
			if (state.result === "over") drawOverlay(ctx, w, h, "游戏结束", `得分 ${state.score} · 按 R 重开本关`, THEME.bad);
			else if (state.result === "won") drawOverlay(ctx, w, h, "过关", `即将进入第 ${state.level + 1} 关…`, THEME.good);
			else if (paused || state.result === "paused") drawOverlay(ctx, w, h, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/bubble/index.ts
		const ADVANCE_MS$2 = 1500;
		/** Held-key aim rotation speed (rad/s). */
		const AIM_RATE$2 = 1.8;
		const GAME_ID$7 = "bubble";
		function createBubbleGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 328, 540);
			if (fit === null) throw new Error("dsh-minigames: bubble needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createState$3((Date.now() ^ 1542469173) >>> 0, readLevel(GAME_ID$7));
			let running = false;
			let lastScore = -1;
			let aimLeft = false;
			let aimRight = false;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			const particles = createParticles();
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const burstCells = (cells, color, count) => {
				for (const cell of cells) {
					const p = cellCenter$1(cell.r, cell.c);
					particles.burst(p.x, p.y, color === null ? THEME.gold : accent(color), count);
				}
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					advanceLevel$1(state);
					saveLevel(GAME_ID$7, state.level);
				}, delayMs);
			};
			const handleEvents = () => {
				for (const ev of state.events) if (ev.kind === "pop") burstCells(ev.cells, ev.color, 6);
				else if (ev.kind === "fall") burstCells(ev.cells, null, 4);
				else if (ev.kind === "clear") {
					reportScore();
					if (running) scheduleAdvance(ADVANCE_MS$2);
					else advanceRemaining = ADVANCE_MS$2;
				} else if (ev.kind === "over") reportScore();
			};
			const restart = () => {
				clearTimeout(advanceTimer);
				advanceTimer = 0;
				advanceRemaining = 0;
				restartLevel$3(state);
				lastScore = -1;
				reportScore();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "Space") event.preventDefault();
				if (event.repeat && event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
				switch (event.code) {
					case "ArrowLeft":
						aimLeft = true;
						break;
					case "ArrowRight":
						aimRight = true;
						break;
					case "Space":
					case "Enter":
						if (state.result === "over") restart();
						else fire$2(state);
						break;
					case "KeyR":
						restart();
						break;
					case "KeyP":
					case "Escape": if (!event.repeat) togglePauseLocal();
				}
			};
			const onKeyUp = (event) => {
				if (event.code === "ArrowLeft") aimLeft = false;
				if (event.code === "ArrowRight") aimRight = false;
			};
			const toLogical = (event) => {
				const rect = canvas.getBoundingClientRect();
				return {
					x: (event.clientX - rect.left) * 328 / rect.width,
					y: (event.clientY - rect.top) * 540 / rect.height
				};
			};
			const onPointerMove = (event) => {
				if (!running || state.result !== "playing") return;
				const p = toLogical(event);
				aimAt(state, p.x, p.y);
			};
			const onPointerDown = (event) => {
				if (state.result === "over") {
					restart();
					return;
				}
				if (state.result === "paused") {
					togglePauseLocal();
					return;
				}
				if (!running) return;
				const p = toLogical(event);
				aimAt(state, p.x, p.y);
				fire$2(state);
			};
			const frame = (f) => {
				if (!running) return;
				if (state.result === "playing") {
					if (aimLeft) adjustAim(state, AIM_RATE$2 * f.dt);
					if (aimRight) adjustAim(state, -1.8 * f.dt);
					step$6(state, f.dt);
					handleEvents();
				}
				reportScore();
				if (!f.render && particles.size() === 0) return;
				renderBubble(ctx, 328, 540, state, false);
				particles.tick(ctx, f.dt * 1e3);
			};
			const loop = createFrameLoop(frame);
			const pause = () => {
				if (!running) return;
				running = false;
				aimLeft = false;
				aimRight = false;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderBubble(ctx, 328, 540, state, true);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.start();
			};
			const togglePauseLocal = () => {
				if (state.result === "playing" || state.result === "paused") togglePause$5(state);
				if (state.result === "paused") pause();
				else resume();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			canvas.addEventListener("pointermove", onPointerMove);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			reportScore();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					fit.dispose();
					canvas.removeEventListener("pointerdown", onPointerDown);
					canvas.removeEventListener("pointermove", onPointerMove);
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
				}
			};
		}
		const bubbleGame = {
			id: "bubble",
			title: "泡泡龙",
			icon: "🫧",
			description: "经典泡泡龙：瞄准发射同色泡泡，三颗相连即消除，切断的泡泡会坠落加分，清空全场进入下一关。",
			controls: [
				"← →：微调瞄准 · 鼠标移动：指向",
				"Space / 点击：发射",
				"R：重开本关 · P：暂停"
			],
			create: createBubbleGame
		};
		const DIR_DX = [
			0,
			1,
			0,
			-1
		];
		const DIR_DY = [
			-1,
			0,
			1,
			0
		];
		const FUSE_S = 2.2;
		/** Seconds the "level cleared" overlay waits before auto-advancing. */
		const ADVANCE_DELAY = 1.5;
		const AI_TICK = .45;
		const PLAYER_SPEED = 110;
		const ENEMY_SPEED = 66;
		/** Actor collision inset in px: the effective body is TILE - 2*INSET. */
		const INSET = 3;
		/** Perpendicular-axis snap range after a turn (px) — keeps actors on-grid. */
		const LANE_SNAP = 4;
		/** Flame visual lifetime in seconds. */
		const FLAME_LIFE = .4;
		/** Player spawn corner (bottom-left pocket). */
		const PLAYER_START = [1, 9];
		/** Enemy spawn tiles (3 far corners + center), used in order. */
		const ENEMY_SPAWNS = [
			[11, 1],
			[1, 1],
			[11, 9],
			[Math.floor(13 / 2), Math.floor(11 / 2)]
		];
		/** 3×3 corner pockets kept clear so spawns are never walled in. */
		const CORNER_POCKETS = [
			[1, 1],
			[11, 1],
			[1, 9],
			[11, 9]
		];
		/** Deterministic mulberry32 PRNG (same construction as lightsout/logic.ts). */
		function mulberry32$8(seed) {
			let a = seed >>> 0;
			return () => {
				a |= 0;
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Brick density for a level: denser bricks on higher levels (0.32 → 0.56). */
		function brickDensity(level) {
			return Math.min(.32 + (level - 1) * .06, .56);
		}
		/**
		* Seeded level layout: indestructible border, fixed pillars on even/even
		* inner tiles, rng-scattered bricks, clear 3×3 spawn pockets.
		* @param level - 1-based level number (drives density).
		* @param rng - injected seeded rng (layout is deterministic per seed).
		*/
		function generateLayout(level, rng) {
			const grid = [];
			for (let ty = 0; ty < 11; ty += 1) {
				const row = [];
				for (let tx = 0; tx < 13; tx += 1) if (tx === 0 || tx === 12 || ty === 0 || ty === 10) row.push(2);
				else if (tx % 2 === 0 && ty % 2 === 0) row.push(2);
				else row.push(rng() < brickDensity(level) ? 1 : 0);
				grid.push(row);
			}
			for (const [cx, cy] of CORNER_POCKETS) for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
				const tx = cx + dx;
				const ty = cy + dy;
				if (tx > 0 && tx < 12 && ty > 0 && ty < 10) grid[ty][tx] = 0;
			}
			return grid;
		}
		/** Enemies fielded on a level (2 at level 1, 3 at 2, 4 at 3+). */
		function enemiesForLevel(level) {
			return Math.min(1 + level, 4);
		}
		/**
		* A fresh world at `level` (score starts at 0; use {@link startLevel} to
		* advance while keeping the accumulated score).
		* @param level - 1-based level number.
		* @param rng - injected seeded rng, stored on the world for AI decisions.
		*/
		function createWorld(level, rng) {
			const state = {
				grid: generateLayout(level, rng),
				level,
				player: {
					x: PLAYER_START[0] * 32,
					y: PLAYER_START[1] * 32,
					dir: 0,
					targetDir: 0,
					alive: true
				},
				enemies: [],
				bombs: [],
				flames: [],
				score: 0,
				result: "none",
				advanceTimer: 0,
				t: 0,
				aiTimer: 0,
				flow: null,
				rng
			};
			const count = enemiesForLevel(level);
			for (let i = 0; i < count; i += 1) {
				const [tx, ty] = ENEMY_SPAWNS[i % ENEMY_SPAWNS.length];
				state.enemies.push({
					x: tx * 32,
					y: ty * 32,
					dir: 2,
					targetDir: 2,
					alive: true
				});
			}
			if (count > 3) {
				const [ctx0, cty] = ENEMY_SPAWNS[3];
				state.grid[cty][ctx0] = 0;
			}
			return state;
		}
		/** Reset to `nextLevel` keeping the score (auto-advance uses it). */
		function startLevel$1(state, nextLevel, rng) {
			const fresh = createWorld(nextLevel, rng);
			fresh.score = state.score;
			Object.assign(state, fresh);
		}
		/** Restart a level from scratch: same layout seed, score back to 0 (R and
		* death-restart both use it — a fresh attempt must not inherit the aborted
		* run's score). */
		function resetLevel(state, rng) {
			const fresh = createWorld(state.level, rng);
			Object.assign(state, fresh);
		}
		/** Grid tile at tile coords; out of bounds counts as solid wall. */
		function tileAt(grid, tx, ty) {
			if (tx < 0 || tx >= 13 || ty < 0 || ty >= 11) return 2;
			return grid[ty][tx];
		}
		/** Tile an actor's center sits on. */
		function actorTile(actor) {
			return [Math.floor((actor.x + 16) / 32), Math.floor((actor.y + 16) / 32)];
		}
		/** Tile span of an actor's (inset) collision body. */
		function insetTiles(x, y) {
			return {
				tx0: Math.floor((x + INSET) / 32),
				tx1: Math.floor((x + 32 - 1 - INSET) / 32),
				ty0: Math.floor((y + INSET) / 32),
				ty1: Math.floor((y + 32 - 1 - INSET) / 32)
			};
		}
		/** Whether every tile the actor's (inset) body overlaps is open ground. */
		function rectWalkable(grid, x, y) {
			const { tx0, tx1, ty0, ty1 } = insetTiles(x, y);
			for (let ty = ty0; ty <= ty1; ty += 1) for (let tx = tx0; tx <= tx1; tx += 1) if (tileAt(grid, tx, ty) !== 0) return false;
			return true;
		}
		/** AABB overlap between two actors (shrunk so neighbours can pass). */
		function actorsOverlap(a, b) {
			const pad = INSET;
			return a.x + pad < b.x + 32 - pad && a.x + 32 - pad > b.x + pad && a.y + pad < b.y + 32 - pad && a.y + 32 - pad > b.y + pad;
		}
		/**
		* Lethal touch: centers closer than ~0.94 tile on both axes. Deliberately
		* more generous than the movement overlap — the inset movement bodies can
		* block each other with a few px of air left, and that must still kill.
		*/
		function touching$1(a, b) {
			const threshold = 30.08;
			return Math.abs(a.x + 16 - (b.x + 16)) < threshold && Math.abs(a.y + 16 - (b.y + 16)) < threshold;
		}
		/** Actors that block movement (living enemies + player, minus the mover). */
		function blockers(state, self) {
			return [state.player, ...state.enemies].filter((other) => other !== self && other.alive);
		}
		/** Whether a candidate (x, y) is free of walls/bricks and other actors. */
		function positionFree(state, self, x, y) {
			if (!rectWalkable(state.grid, x, y)) return false;
			const probe = {
				...self,
				x,
				y
			};
			for (const other of blockers(state, self)) if (actorsOverlap(probe, other)) return false;
			return true;
		}
		/** Snap an actor to the next boundary in its driving direction when within
		* `range` px of it, so it arrives exactly on-grid instead of parking at a
		* half-tile offset where a turn is impossible. */
		function snapToNextBoundary(actor, dir, range) {
			if (dir === 1) {
				const boundary = Math.floor(actor.x / 32) * 32 + 32;
				if (boundary - actor.x <= range) actor.x = boundary;
			} else if (dir === 3) {
				const boundary = Math.floor(actor.x / 32) * 32;
				if (actor.x - boundary <= range) actor.x = boundary;
			} else if (dir === 2) {
				const boundary = Math.floor(actor.y / 32) * 32 + 32;
				if (boundary - actor.y <= range) actor.y = boundary;
			} else {
				const boundary = Math.floor(actor.y / 32) * 32;
				if (actor.y - boundary <= range) actor.y = boundary;
			}
		}
		/**
		* Try to move an actor by `dist` px in `dir`; blocked by walls, bricks and
		* other living actors. A blocked move still snaps to the approached tile
		* boundary (tanks-engine convention).
		* @returns whether the actor actually moved.
		*/
		function tryMove(state, actor, dir, dist) {
			const nx = actor.x + DIR_DX[dir] * dist;
			const ny = actor.y + DIR_DY[dir] * dist;
			if (!rectWalkable(state.grid, nx, ny)) {
				snapToNextBoundary(actor, dir, dist + INSET);
				return false;
			}
			const probe = {
				...actor,
				x: nx,
				y: ny
			};
			for (const other of blockers(state, actor)) if (actorsOverlap(probe, other)) return false;
			actor.x = nx;
			actor.y = ny;
			actor.dir = dir;
			snapToNextBoundary(actor, dir, dist);
			return true;
		}
		/** Whether the actor can advance nearly a full tile in dir (geometry clear). */
		function canAdvance(state, actor, dir) {
			const step = 30.4;
			return positionFree(state, actor, actor.x + DIR_DX[dir] * step, actor.y + DIR_DY[dir] * step);
		}
		/** Snap a just-turned actor's perpendicular axis onto the nearest grid line. */
		function snapPerpendicularIfClose(actor, newDir) {
			const vertical = newDir === 0 || newDir === 2;
			const value = vertical ? actor.x : actor.y;
			const boundary = Math.round(value / 32) * 32;
			if (Math.abs(value - boundary) <= LANE_SNAP) {
				if (vertical) actor.x = boundary;
				else actor.y = boundary;
			}
		}
		/**
		* Move an actor toward its desired heading. Turning is free: the actor turns
		* the moment its (inset) body fits the new lane; before stepping, the
		* perpendicular axis slides onto the nearest lane centre when walkable.
		* @returns whether the actor actually moved.
		*/
		function moveActor(state, actor, targetDir, dist) {
			const turning = targetDir !== actor.dir;
			if (turning) {
				if (targetDir === 0 || targetDir === 2) {
					const gx = Math.round(actor.x / 32) * 32;
					if (rectWalkable(state.grid, gx, actor.y)) actor.x = gx;
				} else {
					const gy = Math.round(actor.y / 32) * 32;
					if (rectWalkable(state.grid, actor.x, gy)) actor.y = gy;
				}
			}
			const moved = tryMove(state, actor, targetDir, dist);
			if (turning && moved) snapPerpendicularIfClose(actor, targetDir);
			return moved;
		}
		/** Flow-field distance at tile coords (-1 = wall/unreachable/out of grid). */
		function flowAt(flow, tx, ty) {
			if (tx < 0 || tx >= 13 || ty < 0 || ty >= 11) return -1;
			return flow[ty * 13 + tx];
		}
		/**
		* BFS flow field of walking distances from one tile over OPEN tiles only
		* (bricks block the enemies — they cannot dig). Used by the enemy AI to
		* chase the player around walls.
		*/
		function buildFlowField(grid, tx, ty) {
			const flow = (/* @__PURE__ */ new Int16Array(143)).fill(-1);
			if (tileAt(grid, tx, ty) !== 0) return flow;
			flow[ty * 13 + tx] = 0;
			const queue = [ty * 13 + tx];
			for (let qi = 0; qi < queue.length; qi += 1) {
				const cur = queue[qi];
				const cx = cur % 13;
				const cy = cur / 13 | 0;
				for (let dir = 0; dir < 4; dir += 1) {
					const nx = cx + DIR_DX[dir];
					const ny = cy + DIR_DY[dir];
					if (nx < 0 || nx >= 13 || ny < 0 || ny >= 11) continue;
					const ni = ny * 13 + nx;
					if (flow[ni] !== -1 || grid[ny][nx] !== 0) continue;
					flow[ni] = flow[cur] + 1;
					queue.push(ni);
				}
			}
			return flow;
		}
		/**
		* The blast of a bomb at (tx, ty): a cross of `range` tiles per arm. Walls
		* stop an arm with no flame; the first brick on an arm is destroyed and the
		* flame stops there. Pure — returns the flame tiles and the bricks hit.
		*/
		function computeBlast(grid, tx, ty, range = 2) {
			const tiles = [[tx, ty]];
			const bricks = [];
			for (let dir = 0; dir < 4; dir += 1) for (let step = 1; step <= range; step += 1) {
				const nx = tx + DIR_DX[dir] * step;
				const ny = ty + DIR_DY[dir] * step;
				const tile = tileAt(grid, nx, ny);
				if (tile === 2) break;
				tiles.push([nx, ny]);
				if (tile === 1) {
					bricks.push([nx, ny]);
					break;
				}
			}
			return {
				tiles,
				bricks
			};
		}
		/**
		* Recursive core of a detonation: consume `bomb` (plus any bombs
		* chain-caught by its blast) and accumulate their flame tiles and hit
		* bricks; effects are applied once by {@link explode}.
		*/
		function detonate(state, bomb, tiles, bricks) {
			const index = state.bombs.indexOf(bomb);
			if (index < 0) return;
			state.bombs.splice(index, 1);
			const blast = computeBlast(state.grid, bomb.tx, bomb.ty);
			tiles.push(...blast.tiles);
			bricks.push(...blast.bricks);
			const chained = state.bombs.filter((other) => blast.tiles.some(([fx, fy]) => other.tx === fx && other.ty === fy));
			for (const other of chained) detonate(state, other, tiles, bricks);
		}
		/** Detonate `bomb` (plus chained bombs), then apply bricks, flames and kills. */
		function explode$1(state, bomb) {
			const tiles = [];
			const bricks = [];
			detonate(state, bomb, tiles, bricks);
			for (const [bx, by] of bricks) {
				state.grid[by][bx] = 0;
				state.score += 10;
			}
			for (const [fx, fy] of tiles) state.flames.push({
				tx: fx,
				ty: fy,
				t: 0
			});
			const inBlast = (actor) => {
				const [ax, ay] = actorTile(actor);
				return tiles.some(([fx, fy]) => ax === fx && ay === fy);
			};
			const before = state.enemies.length;
			state.enemies = state.enemies.filter((enemy) => enemy.alive && !inBlast(enemy));
			state.score += (before - state.enemies.length) * 100;
			if (state.player.alive && inBlast(state.player)) state.player.alive = false;
		}
		/**
		* Place a bomb at the player's tile (max {@link MAX_BOMBS} active, one per
		* tile). Called by the instance on Space keydown and directly by tests.
		* @returns whether a bomb was placed.
		*/
		function placeBomb(state) {
			if (!state.player.alive || state.result !== "none") return false;
			if (state.bombs.length >= 2) return false;
			const [tx, ty] = actorTile(state.player);
			if (state.bombs.some((bomb) => bomb.tx === tx && bomb.ty === ty)) return false;
			state.bombs.push({
				tx,
				ty,
				fuse: FUSE_S
			});
			return true;
		}
		/** One enemy decision: follow the flow-field gradient toward the player;
		* random walk among advanceable dirs when the player is unreachable. */
		function decideEnemy(state, enemy) {
			const flow = state.flow;
			if (flow !== null) {
				const [etx, ety] = actorTile(enemy);
				const here = flowAt(flow, etx, ety);
				if (here > 0) {
					const ahead = flowAt(flow, etx + DIR_DX[enemy.targetDir], ety + DIR_DY[enemy.targetDir]);
					if (ahead >= 0 && ahead <= here && canAdvance(state, enemy, enemy.targetDir)) return;
					let best = null;
					let bestDist = Number.POSITIVE_INFINITY;
					for (let dir = 0; dir < 4; dir += 1) {
						const dist = flowAt(flow, etx + DIR_DX[dir], ety + DIR_DY[dir]);
						if (dist < 0 || dist >= bestDist) continue;
						if (!canAdvance(state, enemy, dir)) continue;
						best = dir;
						bestDist = dist;
					}
					if (best !== null) {
						enemy.targetDir = best;
						return;
					}
				}
			}
			const open = [];
			for (let dir = 0; dir < 4; dir += 1) if (canAdvance(state, enemy, dir)) open.push(dir);
			if (open.length > 0) enemy.targetDir = open[Math.floor(state.rng() * open.length)];
		}
		/**
		* Advance the world by dt seconds under the player's held inputs. Inert once
		* the player is dead ('lose'): the world only ticks visual flame decay.
		* @param state - the world (mutated in place).
		* @param dt - elapsed seconds (clamp to <=1/30 upstream).
		* @param input - player held keys this frame.
		*/
		function stepWorld(state, dt, input) {
			state.t += dt;
			if (state.flames.length > 0) {
				for (const flame of state.flames) flame.t += dt;
				state.flames = state.flames.filter((flame) => flame.t < FLAME_LIFE);
			}
			if (state.result === "lose") return;
			if (state.result === "cleared") {
				state.advanceTimer -= dt;
				if (state.advanceTimer <= 0) {
					const next = state.level % 5 + 1;
					startLevel$1(state, next, mulberry32$8(next * 2654435761 >>> 0));
				}
				return;
			}
			const player = state.player;
			if (player.alive) {
				let dir = null;
				if (input.up) dir = 0;
				else if (input.down) dir = 2;
				else if (input.left) dir = 3;
				else if (input.right) dir = 1;
				if (dir !== null) {
					player.targetDir = dir;
					moveActor(state, player, player.targetDir, PLAYER_SPEED * dt);
				} else player.targetDir = player.dir;
			}
			state.aiTimer += dt;
			const decide = state.aiTimer >= AI_TICK;
			if (decide) {
				state.aiTimer = 0;
				const [ptx, pty] = actorTile(state.player);
				state.flow = buildFlowField(state.grid, ptx, pty);
			}
			for (const enemy of state.enemies) {
				if (decide) decideEnemy(state, enemy);
				moveActor(state, enemy, enemy.targetDir, ENEMY_SPEED * dt);
				if (player.alive && touching$1(enemy, player)) player.alive = false;
			}
			for (const bomb of [...state.bombs]) bomb.fuse -= dt;
			for (const bomb of [...state.bombs]) if (bomb.fuse <= 0) explode$1(state, bomb);
			if (!player.alive) {
				state.result = "lose";
				return;
			}
			if (state.enemies.length === 0) {
				state.result = "cleared";
				state.advanceTimer = ADVANCE_DELAY;
			}
		}
		//#endregion
		//#region src/client/games/bomber/render.ts
		/**
		* Bomberman canvas renderer on the shared theme kit: gradient field, themed
		* brick/wall tiles, glowing bombs and cross flames, chase particles, a
		* hudPair HUD, and themed end/pause overlays.
		*/
		const BRICK = "#8a5a3a";
		const BRICK_LIGHT = "#9c6a46";
		const BRICK_DARK = "#5f3c26";
		const WALL = "#5c5c68";
		const WALL_LIGHT = "#8a8a98";
		const PLAYER_COLOR = accent(0);
		const ENEMY_COLOR = accent(4);
		const BOMB_COLOR = accent(3);
		const FLAME_CORE = "#ffffff";
		const FLAME_OUT = "#f7768e";
		const BOARD_W = 416;
		const BOARD_H = 352;
		const particles = createParticles();
		let prevScore = -1;
		let prevFlames = 0;
		let lastFrame = 0;
		function drawTile$1(ctx, tx, ty, tile) {
			const x = tx * 32;
			const y = ty * 32;
			if (tile === 1) {
				ctx.fillStyle = (tx + ty) % 2 === 0 ? BRICK : BRICK_DARK;
				ctx.fillRect(x, y, 32, 32);
				ctx.fillStyle = BRICK_LIGHT;
				ctx.fillRect(x, y, 32, 3);
				ctx.strokeStyle = BRICK_DARK;
				ctx.lineWidth = 1;
				for (let i = 1; i < 4; i += 1) {
					ctx.beginPath();
					ctx.moveTo(x, y + 8 * i + .5);
					ctx.lineTo(x + 32, y + 8 * i + .5);
					ctx.stroke();
				}
				ctx.beginPath();
				ctx.moveTo(x + 16 + .5, y);
				ctx.lineTo(x + 16 + .5, y + 32);
				ctx.stroke();
			} else if (tile === 2) {
				roundRectPath(ctx, x + 1, y + 1, 30, 30, 4);
				ctx.fillStyle = WALL;
				ctx.fill();
				ctx.strokeStyle = WALL_LIGHT;
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.fillStyle = WALL_LIGHT;
				for (const [rx, ry] of [
					[8, 8],
					[23, 8],
					[8, 23],
					[23, 23]
				]) ctx.fillRect(x + rx, y + ry, 3, 3);
			}
		}
		function drawActor(ctx, actor, isPlayer) {
			const color = isPlayer ? PLAYER_COLOR : ENEMY_COLOR;
			glow(ctx, color, 10);
			ctx.fillStyle = color;
			roundRectPath(ctx, actor.x + 6, actor.y + 6, 20, 20, 6);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = "rgba(13,13,20,0.7)";
			ctx.lineWidth = 1;
			ctx.stroke();
			const [tx, ty] = actorTile(actor);
			const cx = tx * 32 + 16;
			const cy = ty * 32 + 16;
			ctx.fillStyle = "#15151b";
			ctx.fillRect(cx - 6 + (actor.dir === 1 ? 4 : actor.dir === 3 ? -4 : 0), cy - 5, 4, 4);
			ctx.fillRect(cx + 2 + (actor.dir === 1 ? 4 : actor.dir === 3 ? -4 : 0), cy - 5, 4, 4);
		}
		function drawBomb(ctx, bomb, t) {
			const cx = bomb.tx * 32 + 16;
			const cy = bomb.ty * 32 + 16;
			const pulse = .75 + .25 * Math.sin(t * (6 + 14 * (1 - bomb.fuse / FUSE_S)));
			glow(ctx, BOMB_COLOR, 12 * pulse);
			ctx.fillStyle = "#22222c";
			ctx.beginPath();
			ctx.arc(cx, cy, 11 * pulse, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = BOMB_COLOR;
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.fillStyle = BOMB_COLOR;
			ctx.fillRect(cx - 1, cy - 15, 2, 5);
		}
		function drawFlame(ctx, flame) {
			const x = flame.tx * 32;
			const y = flame.ty * 32;
			const k = Math.max(0, 1 - flame.t / .4);
			glow(ctx, FLAME_OUT, 14);
			ctx.fillStyle = FLAME_OUT;
			ctx.globalAlpha = .55 + .45 * k;
			ctx.fillRect(x + 2, y + 2, 28, 28);
			noGlow(ctx);
			ctx.globalAlpha = k;
			ctx.fillStyle = FLAME_CORE;
			ctx.fillRect(x + 8, y + 8, 16, 16);
			ctx.globalAlpha = 1;
		}
		/** Draw one frame of the game; `paused` veils the scene. */
		function renderBomber(ctx, state, paused) {
			ctx.clearRect(0, 0, BOARD_W, BOARD_H);
			const now = performance.now();
			const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame);
			lastFrame = now;
			drawBackground(ctx, BOARD_W, BOARD_H);
			for (let ty = 0; ty < 11; ty += 1) for (let tx = 0; tx < 13; tx += 1) {
				const tile = state.grid[ty][tx];
				if (tile !== 0) drawTile$1(ctx, tx, ty, tile);
			}
			ctx.strokeStyle = "rgba(255,255,255,0.05)";
			ctx.lineWidth = 1;
			for (let tx = 1; tx < 13; tx += 1) {
				ctx.beginPath();
				ctx.moveTo(tx * 32 + .5, 0);
				ctx.lineTo(tx * 32 + .5, BOARD_H);
				ctx.stroke();
			}
			for (let ty = 1; ty < 11; ty += 1) {
				ctx.beginPath();
				ctx.moveTo(0, ty * 32 + .5);
				ctx.lineTo(BOARD_W, ty * 32 + .5);
				ctx.stroke();
			}
			if (state.score > prevScore && state.flames.length > 0) {
				const f = state.flames[state.flames.length - 1];
				particles.burst(f.tx * 32 + 16, f.ty * 32 + 16, accent(7), 16, 140);
			} else if (state.flames.length > prevFlames) {
				const f = state.flames[state.flames.length - 1];
				particles.burst(f.tx * 32 + 16, f.ty * 32 + 16, THEME.gold, 8, 90);
			}
			prevScore = state.score;
			prevFlames = state.flames.length;
			particles.tick(ctx, dt);
			for (const flame of state.flames) drawFlame(ctx, flame);
			for (const bomb of state.bombs) drawBomb(ctx, bomb, state.t);
			for (const enemy of state.enemies) drawActor(ctx, enemy, false);
			if (state.player.alive) drawActor(ctx, state.player, true);
			hudPair(ctx, 8, 16, `第 ${(state.level - 1) % 5 + 1}/5 关 · `, `敌人 ${state.enemies.length}`);
			hudPair(ctx, 8, 32, "炸弹 ", `${state.bombs.length}/2`, "left", BOMB_COLOR);
			hudPair(ctx, 8, 48, "得分 ", String(state.score), "left", THEME.gold);
			if (state.result === "lose") drawOverlay(ctx, BOARD_W, BOARD_H, "GAME OVER", `得分 ${state.score} · 按 回车/R 重开本关`, THEME.bad);
			else if (state.result === "cleared") drawOverlay(ctx, BOARD_W, BOARD_H, "过关！", `得分 ${state.score} · 即将进入下一关`, THEME.good);
			else if (paused) drawOverlay(ctx, BOARD_W, BOARD_H, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/bomber/index.ts
		const GAME_ID$6 = "bomber";
		/** Deterministic per-level seed (same construction as lightsout). */
		function levelRng(level) {
			return mulberry32$8(level * 2654435769 >>> 0);
		}
		function createBomberGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, BOARD_W, BOARD_H);
			if (fit === null) throw new Error("dsh-minigames: bomber needs a 2d canvas context");
			const ctx = fit.ctx;
			let world = createWorld(readLevel(GAME_ID$6), levelRng(readLevel(GAME_ID$6)));
			let lastScore = -1;
			const input = {
				up: false,
				down: false,
				left: false,
				right: false
			};
			const reportScore = () => {
				if (world.score === lastScore) return;
				lastScore = world.score;
				options?.onScore?.(world.score);
			};
			const restartLevel = () => {
				const level = world.level;
				resetLevel(world, levelRng(level));
				lastScore = -1;
				input.up = input.down = input.left = input.right = false;
				reportScore();
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				switch (event.code) {
					case "ArrowUp":
					case "KeyW":
						event.preventDefault();
						input.up = true;
						break;
					case "ArrowDown":
					case "KeyS":
						event.preventDefault();
						input.down = true;
						break;
					case "ArrowLeft":
					case "KeyA":
						event.preventDefault();
						input.left = true;
						break;
					case "ArrowRight":
					case "KeyD":
						event.preventDefault();
						input.right = true;
						break;
					case "Space":
						event.preventDefault();
						if (world.result === "none") placeBomb(world);
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
						break;
					case "KeyR":
						event.preventDefault();
						restartLevel();
						break;
					case "Enter":
						event.preventDefault();
						if (world.result === "lose") restartLevel();
				}
			};
			const onKeyUp = (event) => {
				switch (event.code) {
					case "ArrowUp":
					case "KeyW":
						input.up = false;
						break;
					case "ArrowDown":
					case "KeyS":
						input.down = false;
						break;
					case "ArrowLeft":
					case "KeyA":
						input.left = false;
						break;
					case "ArrowRight":
					case "KeyD": input.right = false;
				}
			};
			const loop = createFrameLoop((f) => {
				stepWorld(world, f.dt, input);
				if (world.result === "cleared") saveLevel(GAME_ID$6, world.level % 5 + 1);
				reportScore();
				if (f.render) renderBomber(ctx, world, false);
			});
			const togglePause = () => {
				if (loop.running) pause();
				else resume();
			};
			const pause = () => {
				if (!loop.running) return;
				loop.pause();
				renderBomber(ctx, world, true);
			};
			const resume = () => {
				loop.resume();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			loop.start();
			renderBomber(ctx, world, false);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
				}
			};
		}
		const bomberGame = {
			id: "bomber",
			title: "炸弹人",
			icon: "💣",
			description: "经典炸弹人：放置炸弹炸开砖墙、消灭敌人，清空 5 关循环关卡。",
			controls: [
				"WASD / 方向键：移动",
				"空格：放炸弹",
				"回车：失败后重开本关",
				"R：重开本关",
				"P：暂停"
			],
			create: createBomberGame
		};
		/** Seconds the grade text stays on screen. */
		const GRADE_SHOW_S = .9;
		/** Grade for a press whose tile-center sits `offset` px from the judge line. */
		function gradeFor(offset) {
			const d = Math.abs(offset);
			if (d <= 32) return "PERFECT";
			if (d <= 64) return "GREAT";
			return "GOOD";
		}
		/** Score multiplier by grade (timing reward on top of the combo multiplier). */
		function gradeMultiplier(grade) {
			if (grade === "PERFECT") return 3;
			if (grade === "GREAT") return 2;
			return 1;
		}
		/** mulberry32 seeded PRNG. */
		function mulberry32$7(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Scroll speed for a hit count: ramps linearly, capped. */
		function speedAt(hits) {
			return 340 + Math.min(460, hits * 7);
		}
		/** Combo multiplier: 1 at combo 0, +1 every 8 combo, capped at 8. */
		function comboMultiplier(combo) {
			return Math.min(8, 1 + Math.floor(Math.max(0, combo) / 8));
		}
		/**
		* Spawn one row: exactly one lane is active; occasionally the tile is long
		* (len 2, a hold). Long tiles do not consume an extra row slot — spacing is
		* uniform.
		*/
		function spawnTile(rng, y) {
			return {
				lane: rng() * 4 | 0,
				y,
				len: rng() < .18 ? 2 : 1,
				hit: false,
				holding: false,
				held: false
			};
		}
		/** A fresh state in the ready (attract) state, prefilled deterministically.
		* The prefilled field starts ABOVE the screen: the lowest tile's top sits a
		* full row above y=0 so the first press is ~1.8s away at base speed — the
		* player gets a lead-in instead of an instant judgment. */
		function createState$2(seed = 1) {
			const rng = mulberry32$7(seed);
			const tiles = [];
			let topY = -480;
			for (let i = 0; i < 8; i += 1) {
				tiles.push(spawnTile(rng, topY));
				topY -= 160;
			}
			return {
				result: "ready",
				seed,
				rng,
				t: 0,
				speed: 340,
				score: 0,
				combo: 0,
				hits: 0,
				misses: 0,
				tiles,
				laneFlash: new Array(4).fill(0),
				judge: null,
				failReason: "",
				events: []
			};
		}
		/** Start (or restart) the run from ready/over with the SAME seed. */
		function startRun$1(state) {
			const fresh = createState$2(state.seed);
			Object.assign(state, fresh, { result: "playing" });
		}
		/** Toggle between playing and paused; no-op otherwise. */
		function togglePause$4(state) {
			if (state.result === "playing") state.result = "paused";
			else if (state.result === "paused") state.result = "playing";
		}
		/** Spend one life; ends the run at LIVES. Returns true when the run ended. */
		function spendLife(state, lane, reason, grade) {
			state.misses += 1;
			state.combo = 0;
			state.judge = {
				grade,
				lane,
				at: state.t
			};
			state.events.push({
				kind: "miss-life",
				lane,
				reason,
				grade
			});
			if (state.misses >= 5) {
				state.result = "over";
				state.failReason = "lives";
				state.events.push({ kind: "over" });
				return true;
			}
			return false;
		}
		/** Whether a tile overlaps the judge window (the hittable test). */
		function overlapsWindow(tile) {
			return tile.y <= 612 && tile.y + tile.len * 160 >= 468;
		}
		/**
		* Press a lane.
		* - A tile overlapping the judge window: normal tiles resolve for combo
		*   score; long tiles ENTER a hold (hold-start) and complete when their
		*   tail passes the line while still held.
		* - No tile in the window, but a same-lane tile within EARLY_RANGE above
		*   it: an early press — costs one life.
		* - Nothing nearby: a free empty tap (combo resets, no life lost).
		*/
		function pressLane(state, lane) {
			if (state.result !== "playing") return false;
			state.laneFlash[lane] = .18;
			let candidate = null;
			let approaching = null;
			for (const tile of state.tiles) {
				if (tile.lane !== lane || tile.hit || tile.holding) continue;
				if (overlapsWindow(tile)) {
					if (candidate === null || tile.y > candidate.y) candidate = tile;
				} else if (tile.y < 468 && tile.y >= 148) {
					if (approaching === null || tile.y > approaching.y) approaching = tile;
				}
			}
			if (candidate !== null) {
				if (candidate.len === 1) {
					candidate.hit = true;
					const grade = gradeFor(candidate.y + candidate.len * 160 / 2 - 540);
					state.judge = {
						grade,
						lane,
						at: state.t
					};
					state.hits += 1;
					state.combo += 1;
					state.score += comboMultiplier(state.combo) * gradeMultiplier(grade);
					state.events.push({
						kind: "hit",
						lane,
						note: state.hits,
						grade
					});
				} else {
					candidate.holding = true;
					state.events.push({
						kind: "hold-start",
						lane
					});
				}
				state.events.push({
					kind: "press",
					lane,
					empty: false
				});
				return true;
			}
			if (approaching !== null) {
				spendLife(state, lane, "early", "BAD");
				state.events.push({
					kind: "press",
					lane,
					empty: false
				});
				return false;
			}
			state.combo = 0;
			state.events.push({
				kind: "press",
				lane,
				empty: true
			});
			return false;
		}
		/**
		* Release a lane key. Releasing while a hold's head has not yet crossed the
		* judge line drops the hold and costs a life; after the head crosses, the
		* release is irrelevant (completion is handled in step).
		*/
		function releaseLane(state, lane) {
			if (state.result !== "playing") return;
			for (const tile of state.tiles) {
				if (tile.lane !== lane || !tile.holding) continue;
				if (tile.y < 540) {
					tile.holding = false;
					tile.hit = true;
					spendLife(state, lane, "drop", "BAD");
					return;
				}
			}
		}
		/**
		* Advance by dt seconds: scroll tiles, spawn rows above the top, decay the
		* lane-press flashes, complete holds whose tails pass the line, and spend a
		* life when an unhit tile leaves the judge window. No-op unless playing, so
		* a paused or over state never advances.
		*/
		function step$5(state, dt) {
			state.events = [];
			if (state.result !== "playing") return;
			state.t += dt;
			state.speed = speedAt(state.hits);
			for (let i = 0; i < 4; i += 1) if (state.laneFlash[i] > 0) state.laneFlash[i] = Math.max(0, state.laneFlash[i] - dt);
			for (const tile of state.tiles) tile.y += state.speed * dt;
			let minY = Infinity;
			for (const tile of state.tiles) minY = Math.min(minY, tile.y);
			while (minY > -160) {
				const tile = spawnTile(state.rng, minY - 160);
				state.tiles.push(tile);
				minY = tile.y;
			}
			for (const tile of state.tiles) {
				if (tile.holding && tile.y >= 540) {
					tile.holding = false;
					tile.hit = true;
					tile.held = true;
					state.hits += 1;
					state.combo += 1;
					const points = comboMultiplier(state.combo) * 3;
					state.score += points;
					state.judge = {
						grade: "PERFECT",
						lane: tile.lane,
						at: state.t
					};
					state.events.push({
						kind: "hold-done",
						lane: tile.lane,
						points
					});
					continue;
				}
				if (!tile.hit && !tile.holding && tile.y > 612) {
					tile.hit = true;
					if (spendLife(state, tile.lane, "miss", "MISS")) break;
				}
			}
			state.tiles = state.tiles.filter((tile) => tile.y < 1120);
		}
		/**
		* Attract-mode step: the tile field scrolls behind the start screen without
		* spawning or failing; hit tiles never appear (nothing is pressed).
		*/
		function attractStep(state, dt) {
			if (state.result !== "ready") return;
			for (const tile of state.tiles) tile.y += 170 * dt;
			let minY = Infinity;
			for (const tile of state.tiles) minY = Math.min(minY, tile.y);
			while (minY > -160) {
				const tile = spawnTile(state.rng, minY - 160);
				state.tiles.push(tile);
				minY = tile.y;
			}
			state.tiles = state.tiles.filter((tile) => tile.y < 1120);
		}
		const LOGICAL_H$5 = 640;
		/** Center x of a lane column. */
		function laneCenter(lane) {
			return 90 * (lane + .5);
		}
		function drawLanes(ctx, state) {
			const laneW = 90;
			for (let i = 0; i < 4; i += 1) {
				ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.045)";
				ctx.fillRect(i * laneW, 0, laneW, 640);
			}
			for (let i = 0; i < 4; i += 1) {
				const holding = state.tiles.some((t) => t.holding && t.lane === i);
				const flash = state.laneFlash[i] ?? 0;
				const a = holding ? .2 : flash > 0 ? flash / .18 * .16 : 0;
				if (a <= .005) continue;
				const g = ctx.createLinearGradient(0, 288, 0, 640);
				g.addColorStop(0, "rgba(122,162,247,0)");
				g.addColorStop(1, `rgba(122,162,247,${a.toFixed(3)})`);
				ctx.fillStyle = g;
				ctx.fillRect(i * laneW, 288, laneW, 352);
				ctx.fillStyle = `rgba(122,162,247,${(a * .4).toFixed(3)})`;
				ctx.fillRect(i * laneW, 0, laneW, 288);
			}
			ctx.strokeStyle = "rgba(226,226,238,0.10)";
			ctx.lineWidth = 1;
			for (let i = 1; i < 4; i += 1) {
				ctx.beginPath();
				ctx.moveTo(i * laneW, 0);
				ctx.lineTo(i * laneW, 640);
				ctx.stroke();
			}
		}
		function drawHitZone(ctx) {
			const h = 144;
			const g = ctx.createLinearGradient(0, 468, 0, 612);
			g.addColorStop(0, "rgba(122,162,247,0.02)");
			g.addColorStop(.5, "rgba(122,162,247,0.14)");
			g.addColorStop(1, "rgba(122,162,247,0.02)");
			ctx.fillStyle = g;
			ctx.fillRect(0, 468, 360, h);
			ctx.strokeStyle = "rgba(122,162,247,0.28)";
			ctx.lineWidth = 1;
			ctx.setLineDash([6, 8]);
			ctx.beginPath();
			ctx.moveTo(0, 468);
			ctx.lineTo(360, 468);
			ctx.moveTo(0, 612);
			ctx.lineTo(360, 612);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.strokeStyle = "rgba(122,162,247,0.75)";
			ctx.lineWidth = 2.5;
			ctx.beginPath();
			ctx.moveTo(0, 540);
			ctx.lineTo(360, 540);
			ctx.stroke();
		}
		function drawTile(ctx, tile) {
			const laneW = 90;
			const pad = 5;
			const x = tile.lane * laneW + pad;
			const w = 80;
			const h = tile.len * 160 - 10;
			const color = accent(tile.lane);
			ctx.globalAlpha = tile.hit ? .18 : 1;
			glow(ctx, color, tile.holding ? 26 : tile.hit ? 0 : 14);
			roundRectPath(ctx, x, tile.y + pad, w, h, 8);
			ctx.fillStyle = tile.hit ? "#2a2a38" : color;
			ctx.fill();
			noGlow(ctx);
			if (!tile.hit) {
				ctx.fillStyle = "rgba(255,255,255,0.35)";
				ctx.fillRect(x + 4, tile.y + pad + 2, 72, 3);
			}
			if (tile.holding && tile.len > 1) {
				const held = Math.min(h, Math.max(0, 540 - (tile.y + pad)));
				if (held > 4) {
					ctx.fillStyle = "rgba(255,255,255,0.30)";
					ctx.fillRect(x + 4, tile.y + pad + 4, 72, held - 4);
				}
				ctx.fillStyle = "rgba(255,255,255,0.9)";
				ctx.font = "700 11px system-ui, sans-serif";
				ctx.textAlign = "center";
				ctx.fillText("按住", x + w / 2, tile.y + pad + h / 2 + 4);
			}
			ctx.globalAlpha = 1;
		}
		const LANE_KEYS = [
			"D",
			"F",
			"J",
			"K"
		];
		function drawKeyLabels(ctx, state) {
			const laneW = 90;
			ctx.textAlign = "center";
			ctx.font = "700 14px system-ui, sans-serif";
			for (let i = 0; i < 4; i += 1) {
				const active = state.laneFlash[i] > 0 || state.tiles.some((t) => t.holding && t.lane === i);
				ctx.fillStyle = active ? accent(i) : "rgba(226,226,238,0.4)";
				ctx.fillText(LANE_KEYS[i], laneCenter(i), 630);
				ctx.globalAlpha = active ? .7 : .25;
				ctx.fillStyle = accent(i);
				ctx.fillRect(i * laneW, 0, laneW, 4);
				ctx.globalAlpha = 1;
			}
		}
		/** Grade text: color per grade. */
		const GRADE_COLORS = {
			PERFECT: "#ffe066",
			GREAT: "#7dcfff",
			GOOD: "#c0caf5",
			BAD: "#ff9e64",
			MISS: "#f7768e"
		};
		function drawJudge(ctx, state) {
			const j = state.judge;
			if (j === null) return;
			const age = state.t - j.at;
			if (age < 0 || age > .9) return;
			const pop = Math.min(1, age / .1);
			const rise = age * 26;
			const alpha = age < .54 ? 1 : 1 - (age - GRADE_SHOW_S * .6) / (GRADE_SHOW_S * .4);
			const size = (j.grade === "PERFECT" ? 26 : 21) * (.6 + .4 * pop);
			ctx.save();
			ctx.globalAlpha = Math.max(0, alpha);
			ctx.translate(laneCenter(j.lane), 494 - rise);
			ctx.scale(1, 1);
			ctx.font = `900 ${size.toFixed(0)}px system-ui, sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			const color = GRADE_COLORS[j.grade];
			if (j.grade === "PERFECT" || j.grade === "MISS" || j.grade === "BAD") {
				ctx.shadowColor = color;
				ctx.shadowBlur = 14;
			}
			ctx.fillStyle = color;
			ctx.fillText(j.grade, 0, 0);
			ctx.restore();
		}
		/** Draw one frame. */
		function renderPiano(ctx, view) {
			const state = view.state;
			drawBackground(ctx, 360, 640);
			drawLanes(ctx, state);
			const ordered = [...state.tiles].sort((a, b) => a.y - b.y);
			for (const tile of ordered) drawTile(ctx, tile);
			drawHitZone(ctx);
			drawJudge(ctx, state);
			drawKeyLabels(ctx, state);
			hudPair(ctx, 12, 22, "分数 ", String(state.score), "left", THEME.gold);
			hudPair(ctx, 12, 46, "连击 ", `${String(state.combo)} · ×${String(Math.min(8, 1 + Math.floor(state.combo / 8)))}`, "left", THEME.text);
			hudPair(ctx, 348, 22, "命 ", "♥".repeat(Math.max(0, 5 - state.misses)) + "·".repeat(Math.min(5, state.misses)), "right", THEME.bad);
			hudPair(ctx, 348, 46, "最高 ", String(view.best), "right", THEME.text);
			if (state.result === "over") drawOverlay(ctx, 360, 640, "游戏结束", `失误 ${String(state.misses)} 次 · 分数 ${String(state.score)} · Enter 再来一局`, THEME.bad);
			else if (state.result === "ready") drawOverlay(ctx, 360, 640, "钢琴块", "Enter 开始 · D F J K · 长块按住 · 空按免罚", THEME.gold);
			else if (view.paused) drawOverlay(ctx, 360, 640, "已暂停", "按 P 或面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/piano/index.ts
		const BEST_KEY$2 = "dsh-minigames:best:piano";
		function loadBest$2() {
			try {
				const v = Number(window.localStorage.getItem(BEST_KEY$2));
				return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
			} catch {
				return 0;
			}
		}
		function saveBest$2(v) {
			try {
				window.localStorage.setItem(BEST_KEY$2, String(Math.floor(v)));
			} catch {}
		}
		/** C-major pentatonic across two octaves; hits ascend and wrap. */
		const SCALE$2 = [
			261.63,
			293.66,
			329.63,
			392,
			440,
			523.25,
			587.33,
			659.25,
			784,
			880
		];
		function createPianoGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 360, LOGICAL_H$5);
			if (fit === null) throw new Error("dsh-minigames: piano needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createState$2((Date.now() ^ 1369637349) >>> 0);
			let running = false;
			let best = loadBest$2();
			let lastScore = -1;
			const particles = createParticles();
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
				if (state.score > best) {
					best = state.score;
					saveBest$2(best);
				}
			};
			let actx = null;
			/** Lane held by the current touch (for touch holds); null when released. */
			let pointerLane = null;
			const initAudio = () => {
				if (actx !== null) {
					if (actx.state === "suspended") actx.resume();
					return;
				}
				try {
					const Ctor = window.AudioContext ?? window.webkitAudioContext;
					if (Ctor === void 0) return;
					actx = new Ctor();
				} catch {
					actx = null;
				}
			};
			const note = (freq, dur, vol) => {
				if (actx === null) return;
				try {
					const o = actx.createOscillator();
					const o2 = actx.createOscillator();
					const g = actx.createGain();
					const now = actx.currentTime;
					o.type = "triangle";
					o2.type = "sine";
					o.frequency.value = freq;
					o2.frequency.value = freq * 2;
					g.gain.setValueAtTime(vol, now);
					g.gain.exponentialRampToValueAtTime(.001, now + dur);
					o.connect(g);
					const g2 = actx.createGain();
					g2.gain.value = .3;
					o2.connect(g2);
					g2.connect(g);
					g.connect(actx.destination);
					o.start(now);
					o2.start(now);
					o.stop(now + dur + .02);
					o2.stop(now + dur + .02);
				} catch {}
			};
			const failSound = () => {
				if (actx === null) return;
				note(130.81, .5, .16);
				note(98, .7, .12);
			};
			const handleEvents = () => {
				for (const ev of state.events) if (ev.kind === "hit") {
					note(SCALE$2[(ev.note - 1) % SCALE$2.length], .28, .12);
					particles.burst(90 * (ev.lane + .5), 610, accent(ev.lane), 8, 160);
				} else if (ev.kind === "hold-start") note(SCALE$2[state.hits % SCALE$2.length], .15, .1);
				else if (ev.kind === "hold-done") {
					note(SCALE$2[(state.hits + 2) % SCALE$2.length], .3, .12);
					particles.burst(90 * (ev.lane + .5), 610, THEME.gold, 10, 180);
				} else if (ev.kind === "miss-life") {
					failSound();
					particles.burst(90 * (ev.lane + .5), 610, THEME.bad, 12, 200);
				} else if (ev.kind === "over") reportScore();
			};
			const restart = () => {
				startRun$1(state);
				lastScore = -1;
				reportScore();
			};
			const laneForCode = (code) => {
				switch (code) {
					case "KeyD": return 0;
					case "KeyF": return 1;
					case "KeyJ": return 2;
					case "KeyK": return 3;
					default: return -1;
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const lane = laneForCode(event.code);
				if (lane >= 0) {
					event.preventDefault();
					if (!event.repeat && state.result === "playing") pressLane(state, lane);
					return;
				}
				switch (event.code) {
					case "Enter":
					case "NumpadEnter":
					case "Space":
						event.preventDefault();
						if (!event.repeat) {
							if (state.result === "ready" || state.result === "over") {
								initAudio();
								restart();
							} else if (state.result === "paused") togglePauseLocal();
						}
						break;
					case "KeyR":
						event.preventDefault();
						if (!event.repeat && (state.result === "playing" || state.result === "over" || state.result === "paused")) {
							if (state.result === "paused") resume();
							initAudio();
							restart();
						}
						break;
					case "KeyP":
					case "Escape":
						event.preventDefault();
						if (!event.repeat && (state.result === "playing" || state.result === "paused")) togglePauseLocal();
				}
			};
			const onKeyUp = (event) => {
				const lane = laneForCode(event.code);
				if (lane >= 0 && state.result === "playing") releaseLane(state, lane);
			};
			const laneAtPointer = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * 360 / rect.width;
				return Math.min(3, Math.max(0, Math.floor(x / 90)));
			};
			const onPointerDown = (event) => {
				const rect = canvas.getBoundingClientRect();
				(event.clientX - rect.left) * 360 / rect.width;
				if (state.result === "ready" || state.result === "over") {
					initAudio();
					restart();
					return;
				}
				if (state.result === "paused") {
					togglePauseLocal();
					return;
				}
				initAudio();
				pointerLane = laneAtPointer(event);
				pressLane(state, pointerLane);
			};
			const onPointerUp = () => {
				if (pointerLane !== null && state.result === "playing") releaseLane(state, pointerLane);
				pointerLane = null;
			};
			const frame = (f) => {
				if (!running) return;
				step$5(state, f.dt);
				attractStep(state, f.dt);
				handleEvents();
				if (state.result === "playing" || state.result === "over") reportScore();
				if (f.render) {
					renderPiano(ctx, {
						state,
						paused: false,
						best
					});
					particles.tick(ctx, f.dt * 1e3);
				}
			};
			const loop = createFrameLoop(frame);
			const pause = () => {
				if (!running) return;
				running = false;
				renderPiano(ctx, {
					state,
					paused: true,
					best
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.markDirty();
			};
			function togglePauseLocal() {
				togglePause$4(state);
				if (state.result === "paused") pause();
				else resume();
			}
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("pointerup", onPointerUp);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("pointerup", onPointerUp);
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
					if (actx !== null) try {
						actx.close();
					} catch {}
					fit.dispose();
				}
			};
		}
		const pianoGame = {
			id: "piano",
			title: "钢琴块",
			icon: "🎹",
			description: "四轨钢琴块：块压住判定线时按 D F J K 或点击轨道，长块需要按住；空按免罚，失误 5 次才结束。",
			controls: [
				"D F J K / 点击轨道：击打判定线的块",
				"长块：按住直到块尾过线",
				"Enter：开始 · R：同种子重开 · P：暂停"
			],
			create: createPianoGame
		};
		const AIM_SPEED = 2.2;
		/** Shooter mount (screen center of the lower half, clear of the track). */
		const SHOOTER = {
			x: 250,
			y: 430
		};
		/** Stable palette; per-level color count slices a prefix. */
		const PALETTE = [
			"#f7768e",
			"#7aa2f7",
			"#9ece6a",
			"#e0af68",
			"#bb9af7"
		];
		const SEGMENTS = [{
			p0: [60, 70],
			c1: [430, 40],
			c2: [450, 300],
			p1: [140, 330]
		}, {
			p0: [140, 330],
			c1: [30, 380],
			c2: [90, 610],
			p1: [440, 590]
		}];
		function bezierPoint(seg, t) {
			const u = 1 - t;
			const a = u * u * u;
			const b = 3 * u * u * t;
			const c = 3 * u * t * t;
			const d = t * t * t;
			return {
				x: a * seg.p0[0] + b * seg.c1[0] + c * seg.c2[0] + d * seg.p1[0],
				y: a * seg.p0[1] + b * seg.c1[1] + c * seg.c2[1] + d * seg.p1[1]
			};
		}
		function buildTrack() {
			const xs = [];
			const ys = [];
			const cum = [];
			let total = 0;
			let prevX = NaN;
			let prevY = NaN;
			const PER_SEG = 800;
			for (const seg of SEGMENTS) for (let i = 0; i <= PER_SEG; i += 1) {
				const p = bezierPoint(seg, i / PER_SEG);
				if (Number.isFinite(prevX)) total += Math.hypot(p.x - prevX, p.y - prevY);
				if (p.x === prevX && p.y === prevY) continue;
				xs.push(p.x);
				ys.push(p.y);
				cum.push(total);
				prevX = p.x;
				prevY = p.y;
			}
			return {
				xs,
				ys,
				cum,
				length: total
			};
		}
		const TRACK = buildTrack();
		/** Total track length in px (fixed; the track itself has no randomness). */
		const TRACK_LENGTH = TRACK.length;
		/** A point on the track at arc length s (clamped), with the tangent angle. */
		function trackAt(s) {
			const clamped = Math.min(Math.max(s, 0), TRACK.length);
			let lo = 0;
			let hi = TRACK.cum.length - 1;
			while (lo < hi) {
				const mid = lo + hi >> 1;
				if (TRACK.cum[mid] < clamped) lo = mid + 1;
				else hi = mid;
			}
			const i = lo;
			if (i === 0) {
				const a = Math.atan2(TRACK.ys[1] - TRACK.ys[0], TRACK.xs[1] - TRACK.xs[0]);
				return {
					x: TRACK.xs[0],
					y: TRACK.ys[0],
					a
				};
			}
			const c0 = TRACK.cum[i - 1];
			const c1 = TRACK.cum[i];
			const f = c1 > c0 ? (clamped - c0) / (c1 - c0) : 0;
			const j = Math.min(i + 1, TRACK.xs.length - 1);
			const a = Math.atan2(TRACK.ys[j] - TRACK.ys[i - 1], TRACK.xs[j] - TRACK.xs[i - 1]);
			return {
				x: TRACK.xs[i - 1] + (TRACK.xs[i] - TRACK.xs[i - 1]) * f,
				y: TRACK.ys[i - 1] + (TRACK.ys[i] - TRACK.ys[i - 1]) * f,
				a
			};
		}
		/** mulberry32 seeded PRNG. */
		function mulberry32$6(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Level speed in px/s: 26 + 4N, capped at MAX_SPEED. */
		function levelSpeed(level) {
			return Math.min(26 + 4 * level, 66);
		}
		/** Color count: 4 on levels 1-2, 5 from level 3. */
		function colorCount(level) {
			return level <= 2 ? 4 : 5;
		}
		/** Spawn interval grows slightly with the level. */
		function spawnInterval(level) {
			return .8 + level * .05;
		}
		/** Total chain balls a level spawns. */
		function levelBallCount(level) {
			return 36 + level * 6;
		}
		/** Deterministic per-level seed: restart replays the same layout. */
		function levelSeed$2(baseSeed, level) {
			return (baseSeed >>> 0 ^ Math.imul(level, 2654435769)) >>> 0;
		}
		function pickColor(state) {
			const present = new Set(state.balls.map((b) => b.color));
			const pool = present.size > 0 ? [...present] : Array.from({ length: colorCount(state.level) }, (_, i) => i);
			return pool[state.rng() * pool.length | 0];
		}
		/**
		* Spawn color for the chain TAIL: from the level's FULL palette, excluding a
		* color that would make a third consecutive run at the tail (when the palette
		* allows). Two traps the old pick-a-present-color rule fell into:
		* (1) a monochrome start chain can never diversify — every spawn repeats the
		* only present color, self-assembling 3-runs the player clears by accident;
		* (2) those natural runs plus one shot cascaded gap-merge reactions that
		* emptied whole boards untouched.
		*/
		function spawnColor(state) {
			const all = Array.from({ length: colorCount(state.level) }, (_, i) => i);
			const n = state.balls.length;
			if (n >= 2) {
				const a = state.balls[n - 2];
				const b = state.balls[n - 1];
				if (a.color === b.color) {
					const pool = all.filter((c) => c !== b.color);
					if (pool.length > 0) return pool[state.rng() * pool.length | 0];
				}
			}
			return all[state.rng() * all.length | 0];
		}
		/** (Re)start a level: fresh chain, deterministic rng, shooter reloaded. */
		function startLevel(state, level) {
			state.level = level;
			state.rng = mulberry32$6(levelSeed$2(state.baseSeed, level));
			state.balls = [];
			state.remaining = levelBallCount(level);
			state.spawnTimer = .45;
			state.shot = null;
			state.chainDepth = 1;
			state.current = pickColor(state);
			state.next = pickColor(state);
			state.msg = `第 ${level} 关`;
			state.msgTimer = 1.4;
		}
		/** A fresh game in the ready state at level 1 (glue overrides the level). */
		function createState$1(seed = 1) {
			const state = {
				result: "ready",
				baseSeed: seed >>> 0,
				level: 1,
				score: 0,
				chainDepth: 1,
				balls: [],
				remaining: 0,
				spawnTimer: 0,
				shot: null,
				angle: -Math.PI / 2,
				current: 0,
				next: 1,
				t: 0,
				msg: "",
				msgTimer: 0,
				events: [],
				rng: mulberry32$6(seed)
			};
			startLevel(state, 1);
			state.result = "ready";
			return state;
		}
		/** Start (or restart after over) the current level; resets the score. */
		function startRun(state) {
			if (state.result !== "ready" && state.result !== "over") return;
			state.score = 0;
			startLevel(state, state.level);
			state.result = "playing";
		}
		/** Toggle between playing and paused; no-op otherwise. */
		function togglePause$3(state) {
			if (state.result === "playing") state.result = "paused";
			else if (state.result === "paused") state.result = "playing";
		}
		function touching(a, b) {
			return a.s - b.s <= 22.5;
		}
		/** Maximal same-color run (of touching balls) containing index idx: [lo, hi]. */
		function runAround(balls, idx) {
			const color = balls[idx].color;
			let lo = idx;
			let hi = idx;
			while (lo > 0 && balls[lo - 1].color === color && touching(balls[lo - 1], balls[lo])) lo -= 1;
			while (hi < balls.length - 1 && balls[hi + 1].color === color && touching(balls[hi], balls[hi + 1])) hi += 1;
			return [lo, hi];
		}
		/**
		* Resolve a potential match around idx; explodes a 3+ run and awards
		* 10/ball × depth. Returns the exploded count (0 when no match).
		*/
		function resolveMatches(state, idx, depth) {
			const balls = state.balls;
			if (idx < 0 || idx >= balls.length) return 0;
			const [lo, hi] = runAround(balls, idx);
			const count = hi - lo + 1;
			if (count < 3) return 0;
			const mid = balls[lo + hi >> 1];
			const p = trackAt(mid.s);
			balls.splice(lo, count);
			const points = 10 * count * depth;
			state.score += points;
			state.chainDepth = depth;
			state.events.push({
				kind: "match",
				count,
				depth,
				points,
				x: p.x,
				y: p.y
			});
			return count;
		}
		/**
		* Advance the chain one dt: the head group moves at the level speed; each
		* trailing group gains GAP_CLOSE_SPEED so its gap to the group ahead closes
		* at a constant rate. On contact the group snaps flush, a gap-closed merge
		* awards 5/ball of the trailing segment, and matching junction colors
		* chain-react (explode at depth+1).
		*/
		function advanceChain(state, dt) {
			const balls = state.balls;
			if (balls.length === 0) return;
			const spd = levelSpeed(state.level);
			let i = 0;
			while (i < balls.length) {
				let j = i + 1;
				while (j < balls.length && touching(balls[j - 1], balls[j])) j += 1;
				const v = i === 0 ? spd : spd + 70;
				for (let k = i; k < j; k += 1) balls[k].s += v * dt;
				if (i > 0) {
					const prevTail = balls[i - 1];
					const front = balls[i];
					const gapLeft = prevTail.s - 22 - front.s;
					if (gapLeft < .5) {
						const size = j - i;
						for (let k = i; k < j; k += 1) balls[k].s += gapLeft;
						const p = trackAt(front.s);
						const points = 5 * size * state.chainDepth;
						state.score += points;
						state.events.push({
							kind: "merge",
							count: size,
							points,
							x: p.x,
							y: p.y
						});
						if (prevTail.color === front.color) resolveMatches(state, i, state.chainDepth + 1);
					}
				}
				i = j;
			}
		}
		/**
		* Insert a fired ball directly after chain ball hitIdx: it takes position
		* hit.s - SPACING and the whole tail side shifts back by SPACING (spacing
		* behind is preserved). Then the insertion match resolves at depth 1.
		*/
		function insertBall(state, hitIdx, color) {
			const balls = state.balls;
			const hit = balls[hitIdx];
			balls.splice(hitIdx + 1, 0, {
				s: hit.s - 22,
				color
			});
			for (let k = hitIdx + 2; k < balls.length; k += 1) balls[k].s -= 22;
			state.events.push({
				kind: "insert",
				at: hitIdx + 1
			});
			state.chainDepth = 1;
			resolveMatches(state, hitIdx + 1, 1);
		}
		/** Aim the shooter at a logical-space point. */
		function setAim(state, x, y) {
			state.angle = Math.atan2(y - SHOOTER.y, x - SHOOTER.x);
		}
		/**
		* Fire the current ball along the aim angle. The shooter never fires a
		* color absent from the chain (rerolled from chain colors when stale).
		*/
		function fire$1(state) {
			if (state.result !== "playing" || state.shot !== null) return false;
			const present = new Set(state.balls.map((b) => b.color));
			if (present.size > 0 && !present.has(state.current)) state.current = pickColor(state);
			state.shot = {
				x: SHOOTER.x,
				y: SHOOTER.y,
				vx: Math.cos(state.angle) * 460,
				vy: Math.sin(state.angle) * 460,
				color: state.current
			};
			state.current = state.next;
			state.next = pickColor(state);
			state.events.push({ kind: "fire" });
			return true;
		}
		function updateShot(state, dt) {
			const shot = state.shot;
			if (shot === null) return;
			shot.x += shot.vx * dt;
			shot.y += shot.vy * dt;
			if (shot.x < -40 || shot.x > 520 || shot.y < -40 || shot.y > 680) {
				state.shot = null;
				state.events.push({ kind: "miss" });
				return;
			}
			let best = -1;
			let bestD = 22;
			for (let i = 0; i < state.balls.length; i += 1) {
				const p = trackAt(Math.min(Math.max(state.balls[i].s, 0), TRACK_LENGTH));
				const d = Math.hypot(p.x - shot.x, p.y - shot.y);
				if (d <= bestD) {
					bestD = d;
					best = i;
				}
			}
			if (best >= 0) {
				insertBall(state, best, shot.color);
				state.shot = null;
			}
		}
		/**
		* Advance the game by dt seconds under the held aim inputs. Mutates the
		* state in place; only runs while playing.
		*/
		function step$4(state, dt, input) {
			state.events = [];
			if (state.result !== "playing") return;
			state.t += dt;
			if (input?.left === true) state.angle -= AIM_SPEED * dt;
			if (input?.right === true) state.angle += AIM_SPEED * dt;
			advanceChain(state, dt);
			state.spawnTimer -= dt;
			for (;;) {
				if (state.remaining <= 0) break;
				const tail = state.balls[state.balls.length - 1];
				if (tail !== void 0 && tail.s < 21.999) break;
				if (state.spawnTimer > 0) break;
				state.balls.push({
					s: 0,
					color: spawnColor(state)
				});
				state.remaining -= 1;
				state.spawnTimer = spawnInterval(state.level);
			}
			updateShot(state, dt);
			const head = state.balls[0];
			if (head !== void 0 && head.s >= TRACK_LENGTH - 20) {
				state.result = "over";
				state.msg = "彩珠掉进了黑洞…";
				state.events.push({ kind: "over" });
				return;
			}
			if (state.remaining === 0 && state.balls.length === 0) {
				state.events.push({
					kind: "level",
					level: state.level + 1
				});
				startLevel(state, state.level + 1);
			}
			if (state.msgTimer > 0) state.msgTimer -= dt;
		}
		//#endregion
		//#region src/client/games/zuma/render.ts
		/**
		* Zuma renderer: the S-curve track ribbon, the sink hole, the chain balls
		* (tail-first so the head paints on top), the flying shot with an aim
		* guide, the shooter with the next-ball preview, HUD, and overlays. All
		* drawing happens in the fixed logical space (LOGICAL_W x LOGICAL_H).
		*/
		function ballPos(s) {
			const p = trackAt(Math.min(Math.max(s, 0), TRACK_LENGTH));
			return {
				x: p.x,
				y: p.y
			};
		}
		function drawBall$2(ctx, x, y, colorIdx, r) {
			const color = PALETTE[colorIdx] ?? THEME.text;
			ctx.fillStyle = "rgba(0,0,0,0.4)";
			ctx.beginPath();
			ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2);
			ctx.fill();
			glow(ctx, color, 8);
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = "rgba(255,255,255,0.35)";
			ctx.beginPath();
			ctx.arc(x - r * .3, y - r * .35, r * .32, 0, Math.PI * 2);
			ctx.fill();
		}
		function drawTrack(ctx) {
			const step = 8;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			for (const [width, color] of [[36, THEME.panelEdge], [28, THEME.panel]]) {
				ctx.strokeStyle = color;
				ctx.lineWidth = width;
				ctx.beginPath();
				for (let s = 0; s <= TRACK_LENGTH; s += step) {
					const p = trackAt(s);
					if (s === 0) ctx.moveTo(p.x, p.y);
					else ctx.lineTo(p.x, p.y);
				}
				const end = trackAt(TRACK_LENGTH);
				ctx.lineTo(end.x, end.y);
				ctx.stroke();
			}
		}
		function drawSink(ctx) {
			const p = trackAt(TRACK_LENGTH);
			glow(ctx, THEME.bad, 16);
			ctx.fillStyle = "#05050a";
			ctx.beginPath();
			ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = THEME.bad;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
			ctx.stroke();
		}
		function drawSpawn(ctx) {
			const p = trackAt(0);
			ctx.fillStyle = THEME.textMuted;
			ctx.font = "600 10px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("出珠口", p.x, p.y - 26);
		}
		function drawShooter(ctx, state) {
			const { x, y } = SHOOTER;
			ctx.save();
			ctx.strokeStyle = "rgba(226,226,238,0.28)";
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 7]);
			ctx.beginPath();
			ctx.moveTo(x + Math.cos(state.angle) * 22, y + Math.sin(state.angle) * 22);
			ctx.lineTo(x + Math.cos(state.angle) * 130, y + Math.sin(state.angle) * 130);
			ctx.stroke();
			ctx.restore();
			glow(ctx, THEME.gold, 12);
			ctx.fillStyle = THEME.panelEdge;
			ctx.beginPath();
			ctx.arc(x, y, 21, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = THEME.gold;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(x, y, 21, 0, Math.PI * 2);
			ctx.stroke();
			drawBall$2(ctx, x, y, state.current, 11);
			ctx.fillStyle = THEME.textMuted;
			ctx.font = "600 10px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("下一个", x + 44, y + 22);
			drawBall$2(ctx, x + 44, y + 6, state.next, 11 * .7);
		}
		/** Draw one frame. */
		function renderZuma(ctx, view) {
			const state = view.state;
			drawBackground(ctx, 480, 640);
			drawTrack(ctx);
			drawSink(ctx);
			drawSpawn(ctx);
			for (let i = state.balls.length - 1; i >= 0; i -= 1) {
				const b = state.balls[i];
				const p = ballPos(b.s);
				drawBall$2(ctx, p.x, p.y, b.color, 11);
			}
			if (state.shot !== null) drawBall$2(ctx, state.shot.x, state.shot.y, state.shot.color, 11);
			drawShooter(ctx, state);
			hudPair(ctx, 12, 22, "分数 ", String(Math.floor(state.score)), "left", THEME.gold);
			hudPair(ctx, 12, 42, "关卡 ", String(state.level), "left", THEME.text);
			hudPair(ctx, 468, 22, "剩余 ", String(state.balls.length + state.remaining), "right", "#7fdfff");
			if (state.msgTimer > 0 && state.msg !== "") {
				ctx.textAlign = "center";
				ctx.font = "900 20px system-ui, sans-serif";
				ctx.fillStyle = "#ffe066";
				ctx.globalAlpha = Math.min(1, state.msgTimer * 2);
				ctx.fillText(state.msg, 240, 70);
				ctx.globalAlpha = 1;
			}
			if (state.result === "over") drawOverlay(ctx, 480, 640, "游戏结束", `分数 ${String(Math.floor(state.score))} · Enter 再来一局`, THEME.bad);
			else if (state.result === "ready") drawOverlay(ctx, 480, 640, "祖玛", "Enter 开始 · ← → 瞄准 · 空格发射", THEME.gold);
			else if (view.paused) drawOverlay(ctx, 480, 640, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/zuma/index.ts
		const GAME_ID$5 = "zuma";
		function createZumaGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 640);
			if (fit === null) throw new Error("dsh-minigames: zuma needs a 2d canvas context");
			const ctx = fit.ctx;
			const state = createState$1((Date.now() ^ 625341585) >>> 0);
			state.level = readLevel(GAME_ID$5);
			startLevel(state, state.level);
			state.result = "ready";
			const input = {
				left: false,
				right: false
			};
			let running = false;
			let lastScore = -1;
			const particles = createParticles();
			const reportScore = () => {
				const s = Math.floor(state.score);
				if (s === lastScore) return;
				lastScore = s;
				options?.onScore?.(s);
			};
			let actx = null;
			const initAudio = () => {
				if (actx !== null) {
					if (actx.state === "suspended") actx.resume();
					return;
				}
				try {
					const Ctor = window.AudioContext ?? window.webkitAudioContext;
					if (Ctor === void 0) return;
					actx = new Ctor();
				} catch {
					actx = null;
				}
			};
			const beep = (freq, dur, type, vol) => {
				if (actx === null) return;
				try {
					const o = actx.createOscillator();
					const g = actx.createGain();
					const now = actx.currentTime;
					o.type = type;
					o.frequency.setValueAtTime(freq, now);
					o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * .6), now + dur);
					g.gain.setValueAtTime(vol, now);
					g.gain.exponentialRampToValueAtTime(.001, now + dur);
					o.connect(g);
					g.connect(actx.destination);
					o.start(now);
					o.stop(now + dur + .02);
				} catch {}
			};
			const handleEvents = () => {
				for (const ev of state.events) if (ev.kind === "insert") beep(300, .07, "square", .05);
				else if (ev.kind === "match") {
					beep(520 + ev.depth * 160, .16, "triangle", .12);
					particles.burst(ev.x, ev.y, "#ffe066", 8 + ev.count * 3, 180);
				} else if (ev.kind === "merge") {
					beep(420, .1, "sine", .08);
					particles.burst(ev.x, ev.y, "#7dcfff", 6, 120);
				} else if (ev.kind === "fire") beep(760, .05, "square", .03);
				else if (ev.kind === "over") {
					beep(160, .5, "sawtooth", .12);
					reportScore();
				} else if (ev.kind === "level") {
					beep(880, .2, "triangle", .1);
					saveLevel(GAME_ID$5, ev.level);
				}
			};
			const restartLevel = () => {
				startLevel(state, state.level);
				state.result = "playing";
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const k = event.code;
				if (k === "ArrowLeft" || k === "ArrowRight" || k === "Space" || k === "Enter") event.preventDefault();
				switch (k) {
					case "ArrowLeft":
						input.left = true;
						break;
					case "ArrowRight":
						input.right = true;
						break;
					case "Space":
					case "Enter":
						if (!event.repeat) {
							if (state.result === "ready" || state.result === "over") {
								initAudio();
								startRun(state);
							} else if (state.result === "playing") fire$1(state);
						}
						break;
					case "KeyR":
						if (!event.repeat && state.result !== "ready") {
							initAudio();
							restartLevel();
						}
						break;
					case "KeyP": if (!event.repeat && state.result !== "ready") togglePauseLocal();
				}
			};
			const onKeyUp = (event) => {
				if (event.code === "ArrowLeft") input.left = false;
				if (event.code === "ArrowRight") input.right = false;
			};
			const toLogical = (event) => {
				const rect = canvas.getBoundingClientRect();
				return {
					x: (event.clientX - rect.left) * 480 / rect.width,
					y: (event.clientY - rect.top) * 640 / rect.height
				};
			};
			const onPointerMove = (event) => {
				if (state.result !== "playing") return;
				const p = toLogical(event);
				setAim(state, p.x, p.y);
			};
			const onPointerDown = (event) => {
				const p = toLogical(event);
				setAim(state, p.x, p.y);
				if (state.result === "ready" || state.result === "over") {
					initAudio();
					startRun(state);
					return;
				}
				if (state.result === "paused") {
					togglePauseLocal();
					return;
				}
				fire$1(state);
			};
			const frame = (f) => {
				if (!running) return;
				step$4(state, f.dt, input);
				handleEvents();
				if (state.result === "playing") reportScore();
				if (f.render) {
					renderZuma(ctx, {
						state,
						paused: false
					});
					particles.tick(ctx, f.dt * 1e3);
				}
			};
			const loop = createFrameLoop(frame);
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				renderZuma(ctx, {
					state,
					paused: true
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				loop.resume();
				loop.markDirty();
			};
			const togglePauseLocal = () => {
				togglePause$3(state);
				if (state.result === "paused") pause();
				else resume();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			canvas.addEventListener("pointermove", onPointerMove);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					canvas.removeEventListener("pointerdown", onPointerDown);
					canvas.removeEventListener("pointermove", onPointerMove);
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
					if (actx !== null) try {
						actx.close();
					} catch {}
					fit.dispose();
				}
			};
		}
		const zumaGame = {
			id: "zuma",
			title: "祖玛",
			icon: "🔮",
			description: "祖玛连珠：转动发射器射出彩球，三颗同色相连即爆裂，小心彩珠滚进终点的黑洞。",
			controls: [
				"← →：瞄准 · 空格：发射",
				"鼠标移动瞄准 · 点击发射",
				"R：重开本关 · P：暂停"
			],
			create: createZumaGame
		};
		const BALL_R$1 = 3.2;
		/** Pocket radius ≈ 1.6 × ball radius: a ball pots when its center enters. */
		const POCKET_R = BALL_R$1 * 1.6;
		/** Exponential friction rate per second at level 1 (v *= exp(-k·dt)). */
		const BASE_FRICTION_K = .9;
		/** Friction increase per level above 1 (harder tables run heavier cloth). */
		const FRICTION_K_PER_LEVEL = .06;
		const FRICTION_K_MAX = 1.5;
		/** Cushion restitution (axis-aligned walls, except pocket mouths). */
		const CUSHION_RESTITUTION = .92;
		/** Ball-ball collision restitution (equal masses). */
		const BALL_RESTITUTION = .95;
		const MAX_SUBSTEP_DT$1 = 1 / 48;
		/** Rack positional jitter amplitude (fraction of ball radius). */
		const RACK_JITTER$1 = .05;
		/** mulberry32 seeded PRNG (identical to the other games' rng). */
		function mulberry32$5(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** The six pocket centers: four corners plus two side middles on the long rails. */
		function pocketPositions() {
			return [
				{
					x: 0,
					y: 0
				},
				{
					x: 100,
					y: 0
				},
				{
					x: 200,
					y: 0
				},
				{
					x: 0,
					y: 100
				},
				{
					x: 100,
					y: 100
				},
				{
					x: 200,
					y: 100
				}
			];
		}
		/** Shot budget for a level: 12 + level*2. */
		function shotsAllowed(level) {
			return 12 + level * 2;
		}
		/** Exponential friction rate for a level (grows with level, capped). */
		function frictionK(level) {
			return Math.min(FRICTION_K_MAX, BASE_FRICTION_K + (level - 1) * FRICTION_K_PER_LEVEL);
		}
		/** Level seed for a (level, runSeed) pair: same inputs → same rack. */
		function levelSeed$1(level, seed) {
			return (seed ^ Math.imul(level, 2654435769)) >>> 0 || 1;
		}
		/** True when the point is inside any pocket (ball center pots). */
		function inPocket(x, y) {
			for (const p of pocketPositions()) {
				const dx = x - p.x;
				const dy = y - p.y;
				if (dx * dx + dy * dy < 26.214400000000012) return true;
			}
			return false;
		}
		/**
		* Build the 9-ball diamond rack (rows 1-2-3-2-1; the 9 sits in the center)
		* at the foot spot with tiny seeded positional jitter.
		*/
		function rackBalls(seed) {
			const rng = mulberry32$5(seed);
			const s = 6.45;
			const dx = s * Math.sqrt(3) / 2;
			const layout = [
				{
					id: 1,
					row: 0,
					col: 0
				},
				{
					id: 2,
					row: 1,
					col: 0
				},
				{
					id: 3,
					row: 1,
					col: 1
				},
				{
					id: 4,
					row: 2,
					col: 0
				},
				{
					id: 9,
					row: 2,
					col: 1
				},
				{
					id: 5,
					row: 2,
					col: 2
				},
				{
					id: 6,
					row: 3,
					col: 0
				},
				{
					id: 7,
					row: 3,
					col: 1
				},
				{
					id: 8,
					row: 4,
					col: 0
				}
			];
			const balls = [{
				id: 0,
				x: 50,
				y: 50,
				vx: 0,
				vy: 0,
				potted: false,
				atRest: true
			}];
			for (const e of layout) {
				const j = () => (rng() * 2 - 1) * RACK_JITTER$1 * BALL_R$1;
				balls.push({
					id: e.id,
					x: 144 + e.row * dx + j(),
					y: 50 + (e.col - e.row / 2) * s + j(),
					vx: 0,
					vy: 0,
					potted: false,
					atRest: true
				});
			}
			return balls;
		}
		/** Fresh state for a level (used at mount, restart, and level advance). */
		function createLevel$1(level, seed) {
			return {
				result: "aiming",
				level,
				shotsUsed: 0,
				score: 0,
				pottedCount: 0,
				balls: rackBalls(levelSeed$1(level, seed)),
				aimAngle: 0,
				power: 0,
				msg: `第 ${level} 关 · ${shotsAllowed(level)} 杆内清台`,
				msgTimer: 2.5,
				events: [],
				rng: mulberry32$5(seed >>> 0 || 1),
				pausedFrom: null
			};
		}
		/**
		* Equal-mass elastic collision along the contact normal with restitution e:
		* the normal velocity components are exchanged scaled by e (a head-on hit
		* swaps them); tangential components are untouched. Positions are separated
		* along the normal when the balls overlap. Returns true when a collision
		* (approaching pair in contact) was resolved.
		* @param a - first ball (mutated).
		* @param b - second ball (mutated).
		* @param e - restitution in [0, 1].
		*/
		function resolveBallCollision(a, b, e) {
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const d2 = dx * dx + dy * dy;
			const minD = BALL_R$1 * 2;
			if (d2 >= minD * minD || d2 === 0) return false;
			const d = Math.sqrt(d2);
			const nx = dx / d;
			const ny = dy / d;
			const van = a.vx * nx + a.vy * ny;
			const vbn = b.vx * nx + b.vy * ny;
			if (van - vbn <= 0) return false;
			const c1 = (1 - e) / 2;
			const c2 = (1 + e) / 2;
			const van2 = c1 * van + c2 * vbn;
			const vbn2 = c2 * van + c1 * vbn;
			a.vx += (van2 - van) * nx;
			a.vy += (van2 - van) * ny;
			b.vx += (vbn2 - vbn) * nx;
			b.vy += (vbn2 - vbn) * ny;
			const overlap = (minD - d) / 2;
			a.x -= nx * overlap;
			a.y -= ny * overlap;
			b.x += nx * overlap;
			b.y += ny * overlap;
			a.atRest = false;
			b.atRest = false;
			return true;
		}
		/** True when the point is in the mouth of a pocket on the given axis wall. */
		function inPocketMouth(x, y) {
			const r = POCKET_R;
			for (const p of pocketPositions()) if (Math.abs(x - p.x) < r && Math.abs(y - p.y) < r) return true;
			return false;
		}
		/**
		* Cushion bounce for one ball against the four rails, skipping wall segments
		* inside pocket mouths (the ball there rolls into the pocket instead).
		*/
		function applyCushions(b) {
			const e = CUSHION_RESTITUTION;
			if (b.x - 3.2 < 0 && !inPocketMouth(b.x, b.y) && b.vx < 0) {
				b.x = BALL_R$1;
				b.vx = -b.vx * e;
				b.atRest = false;
			}
			if (b.x + 3.2 > 200 && !inPocketMouth(b.x, b.y) && b.vx > 0) {
				b.x = 196.8;
				b.vx = -b.vx * e;
				b.atRest = false;
			}
			if (b.y - 3.2 < 0 && !inPocketMouth(b.x, b.y) && b.vy < 0) {
				b.y = BALL_R$1;
				b.vy = -b.vy * e;
				b.atRest = false;
			}
			if (b.y + 3.2 > 100 && !inPocketMouth(b.x, b.y) && b.vy > 0) {
				b.y = 96.8;
				b.vy = -b.vy * e;
				b.atRest = false;
			}
		}
		/**
		* Advance the simulation by dt seconds using fixed substeps (each ≤
		* MAX_SUBSTEP_DT) for tunneling-free cushions and stable contacts. Only runs
		* while balls are moving; pausing freezes everything.
		*/
		function step$3(state, dt) {
			state.events = [];
			if (state.result !== "moving") return;
			if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt);
			const k = frictionK(state.level);
			const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_DT$1));
			const h = dt / n;
			const damp = Math.exp(-k * h);
			for (let s = 0; s < n; s += 1) {
				for (const b of state.balls) {
					if (b.potted) continue;
					b.x += b.vx * h;
					b.y += b.vy * h;
					applyCushions(b);
				}
				for (let i = 0; i < state.balls.length; i += 1) {
					const a = state.balls[i];
					if (a.potted) continue;
					for (let j = i + 1; j < state.balls.length; j += 1) {
						const b = state.balls[j];
						if (!b.potted) resolveBallCollision(a, b, BALL_RESTITUTION);
					}
				}
				for (const b of state.balls) {
					if (b.potted) continue;
					if (inPocket(b.x, b.y) || b.x < -1 || b.x > 201 || b.y < -1 || b.y > 101) {
						b.potted = true;
						b.vx = 0;
						b.vy = 0;
						b.atRest = true;
						if (b.id !== 0) {
							state.pottedCount += 1;
							state.score += 100;
							state.events.push({
								kind: "pot",
								id: b.id
							});
						}
						continue;
					}
					b.vx *= damp;
					b.vy *= damp;
					if (Math.hypot(b.vx, b.vy) < .6) {
						b.vx = 0;
						b.vy = 0;
						b.atRest = true;
					} else b.atRest = false;
				}
			}
			if (state.balls.every((b) => b.potted || b.atRest)) finishShot(state);
		}
		/** Respot the cue ball at the head spot (nudged if occupied). */
		function respotCue(state) {
			const cue = state.balls[0];
			cue.potted = false;
			cue.vx = 0;
			cue.vy = 0;
			cue.atRest = true;
			let x = 50;
			let y = 50;
			for (let guard = 0; guard < 64; guard += 1) {
				if (!state.balls.some((b) => b.id !== 0 && !b.potted && Math.hypot(b.x - x, b.y - y) < 6.4)) break;
				x += BALL_R$1 * .5;
				if (x > 193.6) {
					x = 50;
					y += BALL_R$1;
				}
			}
			cue.x = x;
			cue.y = y;
		}
		/**
		* Called once every ball is at rest or potted: applies the scratch penalty,
		* then resolves win (all nine potted → bonus) / lose (budget exhausted).
		*/
		function finishShot(state) {
			if (state.balls[0].potted) {
				respotCue(state);
				state.shotsUsed += 1;
				state.msg = "白球落袋 · 罚 1 杆";
				state.msgTimer = 2;
				state.events.push({ kind: "foul" });
			}
			if (state.balls.every((b) => b.id === 0 || b.potted)) {
				const bonus = Math.max(0, shotsAllowed(state.level) - state.shotsUsed) * 20;
				state.score += bonus;
				state.result = "levelWon";
				state.msg = `清台！奖励 +${bonus}`;
				state.msgTimer = 3;
				state.events.push({
					kind: "win",
					bonus
				});
				return;
			}
			if (state.shotsUsed >= shotsAllowed(state.level)) {
				state.result = "gameOver";
				state.msg = "杆数用尽";
				state.msgTimer = 3;
				state.events.push({ kind: "lose" });
				return;
			}
			state.result = "aiming";
			state.power = 0;
		}
		/**
		* Fire the cue ball: charges one shot, sets the cue velocity from the clamped
		* power, and enters the moving state. Only legal while aiming.
		* @param state - the game state (mutated).
		* @param angle - shot direction in radians (0 = +x).
		* @param power - 0..1 charge; clamped.
		*/
		function shoot(state, angle, power) {
			if (state.result !== "aiming") return false;
			const cue = state.balls[0];
			if (cue.potted) return false;
			const p = Math.min(1, Math.max(0, power));
			const v = p * 260;
			cue.vx = Math.cos(angle) * v;
			cue.vy = Math.sin(angle) * v;
			cue.atRest = false;
			state.aimAngle = angle;
			state.power = p;
			state.shotsUsed += 1;
			state.result = "moving";
			state.msgTimer = 0;
			return true;
		}
		/** Restart the CURRENT level: same seed → the identical rack. */
		function restartLevel$2(state, seed) {
			const fresh = createLevel$1(state.level, seed);
			Object.assign(state, fresh);
		}
		/** Advance to the next level (keeps the cumulative score and run seed). */
		function nextLevel$1(state, seed) {
			const level = state.level + 1;
			const score = state.score;
			Object.assign(state, createLevel$1(level, seed), { score });
		}
		/** Toggle pause; remembers the result to restore (stored-remainder pattern). */
		function togglePause$2(state) {
			if (state.result === "paused") {
				state.result = state.pausedFrom ?? "aiming";
				state.pausedFrom = null;
			} else if (state.result === "aiming" || state.result === "moving") {
				state.pausedFrom = state.result;
				state.result = "paused";
			}
		}
		/**
		* Ray-circle intersection: smallest t > 0 where the ray hits a circle of
		* radius r around c, or null. Pure geometry, shared with tests.
		*/
		function rayCircle(ox, oy, dx, dy, cx, cy, r) {
			const fx = ox - cx;
			const fy = oy - cy;
			const b = fx * dx + fy * dy;
			const c = fx * fx + fy * fy - r * r;
			if (c > 0 && b > 0) return null;
			const disc = b * b - c;
			if (disc < 0) return null;
			const sq = Math.sqrt(disc);
			const t = -b - sq;
			if (t > 1e-9) return t;
			const t2 = -b + sq;
			if (t2 > 1e-9) return t2;
			return null;
		}
		/** Smallest t > 0 where the ray hits an axis-aligned wall (0..TABLE_W/H box). */
		function rayWall(ox, oy, dx, dy) {
			let t = Infinity;
			if (dx > 0) t = Math.min(t, (200 - ox) / dx);
			else if (dx < 0) t = Math.min(t, -ox / dx);
			if (dy > 0) t = Math.min(t, (100 - oy) / dy);
			else if (dy < 0) t = Math.min(t, -oy / dy);
			return Number.isFinite(t) && t > 0 ? t : 0;
		}
		/**
		* Aim guide: cast the aim ray from the cue ball until the first ball contact
		* (inflated to 2R center distance) or wall, then show one bounce beyond it.
		* Pure — no state mutation.
		*/
		function computeAimGuide(balls, angle, maxLen = 400) {
			const cue = balls.find((b) => b.id === 0 && !b.potted);
			const zero = {
				path: [],
				hitBallId: null,
				impact: {
					x: 0,
					y: 0
				}
			};
			if (cue === void 0) return zero;
			let ox = cue.x;
			let oy = cue.y;
			let dx = Math.cos(angle);
			let dy = Math.sin(angle);
			const path = [{
				x: ox,
				y: oy
			}];
			let hitBallId = null;
			for (let leg = 0; leg < 2; leg += 1) {
				let best = maxLen;
				const tw = rayWall(ox, oy, dx, dy);
				if (tw > 0 && tw < best) best = tw;
				for (const b of balls) {
					if (b.id === 0 || b.potted) continue;
					const t = rayCircle(ox, oy, dx, dy, b.x, b.y, BALL_R$1 * 2);
					if (t !== null && t < best && leg === 0) {
						best = t;
						hitBallId = b.id;
					}
				}
				const ix = ox + dx * best;
				const iy = oy + dy * best;
				path.push({
					x: ix,
					y: iy
				});
				if (leg === 0) {
					if (hitBallId !== null || best >= maxLen) break;
					if (ix <= 0 || ix >= 200) dx = -dx;
					if (iy <= 0 || iy >= 100) dy = -dy;
					ox = ix;
					oy = iy;
				}
			}
			const impact = path[1] ?? {
				x: cue.x,
				y: cue.y
			};
			return {
				path,
				hitBallId,
				impact
			};
		}
		/** World→logical pixel scale (world units are ~2.6 logical px each). */
		const SCALE$1 = 612 / 200;
		const TABLE_X = (680 - 200 * SCALE$1) / 2;
		const TABLE_Y = (400 - 100 * SCALE$1) / 2;
		const BALL_COLORS = {
			1: "#f7768e",
			2: "#e0af68",
			3: "#e06c75",
			4: "#7dcfff",
			5: "#bb9af7",
			6: "#9ece6a",
			7: "#c94f6d",
			8: "#33334a",
			9: "#ff9e64"
		};
		/** Convert world (table) coordinates to logical canvas coordinates. */
		function worldToLogical(x, y) {
			return {
				x: TABLE_X + x * SCALE$1,
				y: TABLE_Y + y * SCALE$1
			};
		}
		/** Convert logical canvas coordinates back to world coordinates. */
		function logicalToWorld(x, y) {
			return {
				x: (x - TABLE_X) / SCALE$1,
				y: (y - TABLE_Y) / SCALE$1
			};
		}
		function drawTable(ctx) {
			const w = 200 * SCALE$1;
			const h = 100 * SCALE$1;
			roundRectPath(ctx, 12, 25, 656, 350, 14);
			ctx.fillStyle = "#2a1f14";
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 2;
			ctx.stroke();
			const felt = ctx.createRadialGradient(340, 200, h * .2, 340, 200, w * .7);
			felt.addColorStop(0, "#1f4d3d");
			felt.addColorStop(1, "#12332a");
			roundRectPath(ctx, TABLE_X, TABLE_Y, w, h, 4);
			ctx.fillStyle = felt;
			ctx.fill();
			ctx.strokeStyle = "rgba(226,226,238,0.10)";
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
		function drawPockets(ctx) {
			ctx.fillStyle = "#05050a";
			for (let i = 0; i <= 200; i += 100) for (let j = 0; j <= 100; j += 100) {
				const p = worldToLogical(i, j);
				glow(ctx, "#000", 8);
				ctx.beginPath();
				ctx.arc(p.x, p.y, POCKET_R * SCALE$1, 0, Math.PI * 2);
				ctx.fill();
				noGlow(ctx);
			}
		}
		function drawBall$1(ctx, ball) {
			const p = worldToLogical(ball.x, ball.y);
			const r = BALL_R$1 * SCALE$1;
			const color = ball.id === 0 ? "#f4f4f5" : BALL_COLORS[ball.id] ?? accent(ball.id);
			glow(ctx, color, 7);
			const g = ctx.createRadialGradient(p.x - r * .35, p.y - r * .35, r * .1, p.x, p.y, r);
			g.addColorStop(0, "#ffffff");
			g.addColorStop(.25, color);
			g.addColorStop(1, ball.id === 0 ? "#c9c9d4" : "#111122");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			if (ball.id !== 0) {
				ctx.fillStyle = "#f4f4f5";
				ctx.beginPath();
				ctx.arc(p.x, p.y, r * .52, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = "#181825";
				ctx.font = `bold ${Math.round(r * .78)}px system-ui, sans-serif`;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(String(ball.id), p.x, p.y + .5);
			}
		}
		function drawAim$1(ctx, state, aim) {
			const angle = aim?.angle ?? state.aimAngle;
			const power = aim?.power ?? 0;
			const guide = computeAimGuide(state.balls, angle);
			if (guide.path.length >= 2) {
				ctx.strokeStyle = "rgba(226,226,238,0.55)";
				ctx.lineWidth = 1.5;
				ctx.setLineDash([6, 6]);
				ctx.beginPath();
				const first = worldToLogical(guide.path[0].x, guide.path[0].y);
				ctx.moveTo(first.x, first.y);
				for (let i = 1; i < guide.path.length; i += 1) {
					const p = worldToLogical(guide.path[i].x, guide.path[i].y);
					ctx.lineTo(p.x, p.y);
				}
				ctx.stroke();
				ctx.setLineDash([]);
				const impact = worldToLogical(guide.impact.x, guide.impact.y);
				ctx.fillStyle = "rgba(226,226,238,0.8)";
				ctx.beginPath();
				ctx.arc(impact.x, impact.y, 3, 0, Math.PI * 2);
				ctx.fill();
			}
			const cue = state.balls.find((b) => b.id === 0 && !b.potted);
			if (cue !== void 0) {
				const c = worldToLogical(cue.x, cue.y);
				const pull = 26 + power * 60;
				ctx.strokeStyle = "#d9c58a";
				ctx.lineWidth = 4;
				ctx.lineCap = "round";
				ctx.beginPath();
				ctx.moveTo(c.x - Math.cos(angle) * 13.792000000000002, c.y - Math.sin(angle) * 13.792000000000002);
				ctx.lineTo(c.x - Math.cos(angle) * (BALL_R$1 * SCALE$1 + pull), c.y - Math.sin(angle) * (BALL_R$1 * SCALE$1 + pull));
				ctx.stroke();
				ctx.lineCap = "butt";
			}
		}
		function drawPowerBar(ctx, power) {
			roundRectPath(ctx, 260, 376, 160, 10, 5);
			ctx.fillStyle = THEME.panel;
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.stroke();
			roundRectPath(ctx, 261.5, 377.5, Math.max(0, 157 * power), 7, 3.5);
			ctx.fillStyle = power > .8 ? THEME.bad : power > .5 ? THEME.gold : THEME.good;
			ctx.fill();
		}
		/** Render one frame of the pool game (pure drawing; no state mutation). */
		function renderPool(ctx, view) {
			const { state, paused, aim, best } = view;
			drawBackground(ctx, 680, 400);
			drawTable(ctx);
			drawPockets(ctx);
			if (state.result === "aiming" || state.result === "paused" && state.pausedFrom === "aiming") drawAim$1(ctx, state, aim);
			for (const b of state.balls) if (!b.potted) drawBall$1(ctx, b);
			const remaining = Math.max(0, shotsAllowed(state.level) - state.shotsUsed);
			hudPair(ctx, 16, 24, "关卡", String(state.level));
			hudPair(ctx, 16, 44, "得分", String(Math.floor(state.score)));
			hudPair(ctx, 664, 24, "剩余杆数", String(remaining), "right", remaining <= 2 ? THEME.bad : THEME.text);
			hudPair(ctx, 664, 44, "最佳", String(best), "right", THEME.gold);
			if (state.result === "aiming" && aim !== null && aim.power > 0) drawPowerBar(ctx, aim.power);
			if (state.msgTimer > 0 && state.msg !== "") {
				ctx.textAlign = "center";
				ctx.font = "600 15px system-ui, sans-serif";
				ctx.fillStyle = THEME.text;
				ctx.fillText(state.msg, 340, 28);
			}
			if (paused) drawOverlay(ctx, 680, 400, "暂停", "按 P 继续");
			else if (state.result === "levelWon") drawOverlay(ctx, 680, 400, "清台成功", state.msg, THEME.good);
			else if (state.result === "gameOver") drawOverlay(ctx, 680, 400, "游戏结束", "按 R 重试本关", THEME.bad);
			else if (state.result === "ready") drawOverlay(ctx, 680, 400, "迷你台球", "拖拽白球方向击球，或 ← → 瞄准 + 长按空格蓄力");
		}
		//#endregion
		//#region src/client/games/pool/index.ts
		const GAME_ID$4 = "pool";
		const BEST_KEY$1 = "dsh-minigames:best:pool";
		/** Pull distance (world units) that maps to full power. */
		const FULL_POWER_PULL = 90;
		/** Keyboard charge rate (power per second while Space is held). */
		const CHARGE_RATE$1 = .9;
		/** Aim rotation rate (radians per second while ←/→ is held). */
		const AIM_RATE$1 = 1.8;
		const AIM_STEP = .03;
		/** Minimum power that actually fires (taps do not shoot). */
		const MIN_FIRE_POWER = .05;
		function loadBest$1() {
			try {
				const v = Number(window.localStorage.getItem(BEST_KEY$1));
				return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
			} catch {
				return 0;
			}
		}
		function saveBest$1(v) {
			try {
				window.localStorage.setItem(BEST_KEY$1, String(Math.floor(v)));
			} catch {}
		}
		function createPoolGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 680, 400);
			if (fit === null) throw new Error("dsh-minigames: pool needs a 2d canvas context");
			const ctx = fit.ctx;
			let seedState = (Date.now() ^ 5370206) >>> 0;
			const nextSeed = () => {
				seedState = Math.imul(seedState ^ 2654435769, 2246822507) >>> 0 || 2;
				return seedState;
			};
			const startSeed = nextSeed();
			let state = createLevel$1(readLevel(GAME_ID$4), startSeed);
			let running = false;
			let best = loadBest$1();
			let lastScore = -1;
			const particles = createParticles();
			const keys = {
				left: false,
				right: false,
				charge: false
			};
			/** Active drag aim (angle + power) while the pointer is held. */
			let drag = null;
			const reportScore = () => {
				const s = Math.floor(state.score);
				if (s === lastScore) return;
				lastScore = s;
				options?.onScore?.(s);
				if (s > best) {
					best = s;
					saveBest$1(best);
				}
			};
			const handleEvents = () => {
				for (const ev of state.events) if (ev.kind === "pot") particles.burst(340, 200, THEME.gold, 10, 140);
				else if (ev.kind === "win") {
					saveLevel(GAME_ID$4, state.level + 1);
					particles.burst(340, 200, THEME.good, 24, 220);
					reportScore();
				} else if (ev.kind === "foul") particles.burst(340, 200, THEME.bad, 10, 120);
			};
			const frame = (f) => {
				if (!running) return;
				const dt = f.dt;
				if (state.result === "aiming" && drag === null) {
					if (keys.left) state.aimAngle -= AIM_RATE$1 * dt;
					if (keys.right) state.aimAngle += AIM_RATE$1 * dt;
					if (keys.charge) state.power = Math.min(1, state.power + CHARGE_RATE$1 * dt);
				}
				step$3(state, dt);
				handleEvents();
				if (state.result === "levelWon" || state.result === "gameOver") reportScore();
				if (f.render) {
					renderPool(ctx, {
						state,
						paused: false,
						aim: drag,
						best
					});
					particles.tick(ctx, dt * 1e3);
				}
			};
			const loop = createFrameLoop(frame);
			const pointerWorld = (event) => {
				const rect = canvas.getBoundingClientRect();
				return logicalToWorld((event.clientX - rect.left) * 680 / rect.width, (event.clientY - rect.top) * 400 / rect.height);
			};
			const cueBallPos = () => {
				const cue = state.balls.find((b) => b.id === 0 && !b.potted);
				return cue === void 0 ? null : {
					x: cue.x,
					y: cue.y
				};
			};
			const onPointerDown = (event) => {
				if (!running || state.result !== "aiming") return;
				const cue = cueBallPos();
				const p = pointerWorld(event);
				if (cue === null) return;
				if (Math.hypot(p.x - cue.x, p.y - cue.y) < 24) {
					drag = {
						angle: state.aimAngle,
						power: 0
					};
					try {
						canvas.setPointerCapture(event.pointerId);
					} catch {}
					loop.markDirty();
				}
			};
			const onPointerMove = (event) => {
				if (drag === null) return;
				const cue = cueBallPos();
				if (cue === null) {
					drag = null;
					return;
				}
				const p = pointerWorld(event);
				const dx = cue.x - p.x;
				const dy = cue.y - p.y;
				const dist = Math.hypot(dx, dy);
				if (dist < 2) return;
				drag = {
					angle: Math.atan2(dy, dx),
					power: Math.min(1, dist / FULL_POWER_PULL)
				};
				loop.markDirty();
			};
			const onPointerUp = () => {
				if (drag === null) return;
				const { angle, power } = drag;
				drag = null;
				if (power > MIN_FIRE_POWER) shoot(state, angle, power);
				loop.markDirty();
			};
			const advance = () => {
				nextLevel$1(state, nextSeed());
				lastScore = -1;
				reportScore();
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const k = event.code;
				if (k === "ArrowLeft" || k === "ArrowRight" || k === "Space" || k === "ArrowUp" || k === "ArrowDown") event.preventDefault();
				switch (k) {
					case "ArrowLeft":
					case "KeyA":
						if (state.result === "aiming" && !event.repeat && !keys.left) state.aimAngle -= AIM_STEP;
						keys.left = true;
						break;
					case "ArrowRight":
					case "KeyD":
						if (state.result === "aiming" && !event.repeat && !keys.right) state.aimAngle += AIM_STEP;
						keys.right = true;
						break;
					case "Space":
						if (state.result === "levelWon" && !event.repeat) advance();
						else if (state.result === "aiming") keys.charge = true;
						break;
					case "Enter":
					case "NumpadEnter":
						if (state.result === "levelWon" && !event.repeat) advance();
						break;
					case "KeyR":
						if (!event.repeat && (state.result === "aiming" || state.result === "moving" || state.result === "gameOver")) {
							restartLevel$2(state, startSeed);
							lastScore = -1;
							reportScore();
							loop.markDirty();
						}
						break;
					case "KeyP":
					case "Escape": if (!event.repeat) togglePauseLocal();
				}
			};
			const onKeyUp = (event) => {
				if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = false;
				if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = false;
				if (event.code === "Space" && keys.charge) {
					keys.charge = false;
					if (state.result === "aiming" && state.power > MIN_FIRE_POWER) {
						shoot(state, state.aimAngle, state.power);
						state.power = 0;
						loop.markDirty();
					}
				}
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				togglePause$2(state);
				renderPool(ctx, {
					state,
					paused: true,
					aim: drag,
					best
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (state.result === "paused") togglePause$2(state);
				loop.resume();
				loop.markDirty();
			};
			const togglePauseLocal = () => {
				if (state.result === "paused") resume();
				else pause();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			canvas.addEventListener("pointermove", onPointerMove);
			canvas.addEventListener("pointerup", onPointerUp);
			canvas.addEventListener("pointercancel", onPointerUp);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					canvas.removeEventListener("pointerdown", onPointerDown);
					canvas.removeEventListener("pointermove", onPointerMove);
					canvas.removeEventListener("pointerup", onPointerUp);
					canvas.removeEventListener("pointercancel", onPointerUp);
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
					fit.dispose();
				}
			};
		}
		const poolGame = {
			id: "pool",
			title: "迷你台球",
			icon: "🎱",
			description: "九球单挑：拖拽白球或 ← → 瞄准、长按空格蓄力击球，在限定杆数内清空全部彩球。",
			controls: [
				"拖拽白球方向松手击球（拉得越远越大力）",
				"← / → 瞄准 · 长按空格蓄力，松开击球",
				"R：重开本关（同一球局）· P：暂停",
				"空格 / 回车：清台后进入下一关"
			],
			create: createPoolGame
		};
		//#endregion
		//#region src/client/games/td/logic.ts
		/**
		* Tower-defense pure logic: an 11×9 tile map with a seeded corridor path
		* (left edge → right edge), three tower kinds, waves of enemies following
		* the waypoints, homing/lobbed projectiles, and a gold/lives/score economy.
		* Deterministic given (seed, commands, dt sequence); the game instance in
		* index.ts drives it with the frame loop and the unit tests drive it
		* directly.
		*/
		/** Deterministic 32-bit rng (map generation + spawn jitter). */
		function mulberry32$4(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 >>> 0;
				let t = a;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		const SPAWN_FIRST_DELAY = .4;
		const EARLY_BONUS_PER_SECOND = 10;
		const TOWER_INFO = {
			arrow: {
				cost: 50,
				upgrades: [40, 60],
				name: "箭塔"
			},
			frost: {
				cost: 70,
				upgrades: [50, 75],
				name: "冰霜塔"
			},
			cannon: {
				cost: 90,
				upgrades: [70, 100],
				name: "炮塔"
			}
		};
		const ARROW_STATS = [
			{
				dmg: 8,
				cooldown: .5,
				range: 2.2
			},
			{
				dmg: 12,
				cooldown: .4,
				range: 2.2
			},
			{
				dmg: 18,
				cooldown: .3,
				range: 2.2
			}
		];
		const FROST_STATS = [
			{
				dmg: 2,
				cooldown: .5,
				range: 2,
				slowFactor: .4,
				slowDuration: 1.2
			},
			{
				dmg: 2,
				cooldown: .5,
				range: 2,
				slowFactor: .55,
				slowDuration: 1.2
			},
			{
				dmg: 2,
				cooldown: .5,
				range: 2,
				slowFactor: .7,
				slowDuration: 1.2
			}
		];
		const CANNON_STATS = [
			{
				dmg: 20,
				cooldown: 1.2,
				range: 1.8,
				splash: .8
			},
			{
				dmg: 32,
				cooldown: 1.1,
				range: 1.8,
				splash: 1
			},
			{
				dmg: 50,
				cooldown: 1,
				range: 1.8,
				splash: 1.2
			}
		];
		/** Combat stats of `kind` at `level` (1-3). */
		function towerStats(kind, level) {
			return (kind === "arrow" ? ARROW_STATS : kind === "frost" ? FROST_STATS : CANNON_STATS)[Math.min(2, Math.max(0, level - 1))];
		}
		/** Upgrade price from `level` to the next (0 when already Lv3). */
		function upgradeCost(kind, level) {
			if (level >= 3) return 0;
			return TOWER_INFO[kind].upgrades[level - 1];
		}
		/** Map seed for a (base seed, level) pair — the same pair replays identically. */
		function mapSeed(seed, level) {
			return seed + level * 7919 >>> 0;
		}
		/**
		* Dig the fixed corridor path for a map seed: an alternating right/vertical
		* walk from the left edge to the right edge. Consecutive waypoints share a
		* row or column; the walk always ends at x = GRID_W - 1.
		*/
		function generatePath(seed) {
			const rng = mulberry32$4(seed);
			const waypoints = [];
			let x = 0;
			let y = 1 + Math.floor(rng() * 7);
			waypoints.push({
				x,
				y
			});
			while (x < 10) {
				const remaining = 10 - x;
				const len = Math.min(remaining, 1 + Math.floor(rng() * 3));
				x += len;
				waypoints.push({
					x,
					y
				});
				if (x >= 10) break;
				if (rng() < .8) {
					const up = rng() < .5;
					const dy = 1 + Math.floor(rng() * 3);
					const ny = Math.max(0, Math.min(8, up ? y - dy : y + dy));
					if (ny !== y) {
						y = ny;
						waypoints.push({
							x,
							y
						});
					}
				}
			}
			return waypoints;
		}
		/** Boolean corridor grid (true = path tile; towers cannot be placed there). */
		function pathTilesOf(path) {
			const tiles = Array.from({ length: 9 }, () => Array.from({ length: 11 }, () => false));
			for (let i = 0; i + 1 < path.length; i += 1) {
				const a = path[i];
				const b = path[i + 1];
				const x0 = Math.min(a.x, b.x);
				const x1 = Math.max(a.x, b.x);
				const y0 = Math.min(a.y, b.y);
				const y1 = Math.max(a.y, b.y);
				for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) tiles[y][x] = true;
			}
			return tiles;
		}
		/** Total corridor length in tiles (axis-aligned segments). */
		function pathLength(path) {
			let len = 0;
			for (let i = 0; i + 1 < path.length; i += 1) {
				const a = path[i];
				const b = path[i + 1];
				len += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
			}
			return len;
		}
		/** Point on the corridor polyline at arc distance `dist` (tile units). */
		function positionAt(path, dist) {
			let remaining = Math.max(0, dist);
			for (let i = 0; i + 1 < path.length; i += 1) {
				const a = path[i];
				const b = path[i + 1];
				const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
				if (remaining <= seg || i + 2 === path.length) {
					const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
					return {
						x: a.x + (b.x - a.x) * t,
						y: a.y + (b.y - a.y) * t
					};
				}
				remaining -= seg;
			}
			const last = path[path.length - 1];
			return {
				x: last.x,
				y: last.y
			};
		}
		/** Enemy count of wave `wave`. */
		function waveSize(wave) {
			return Math.min(4 + wave, 20);
		}
		function waveHp(wave, level) {
			return 30 * (1 + .25 * wave) * (1 + .6 * (level - 1));
		}
		function waveSpeed(wave, level) {
			return (.8 + .03 * wave) * (1 + .12 * (level - 1));
		}
		/** Gold granted for killing an enemy during wave `wave`. */
		function killGold(wave) {
			return 6 + Math.floor(wave / 2);
		}
		/** Gold granted for clearing wave `wave`. */
		function waveClearBonus(wave) {
			return 20 + 2 * wave;
		}
		/** Early-send bonus for sending the wave with `remaining` build seconds left. */
		function earlySendBonus(remaining) {
			return Math.max(0, Math.floor(remaining)) * EARLY_BONUS_PER_SECOND;
		}
		function resetBoard(state, level) {
			state.level = level;
			state.wave = 1;
			state.path = generatePath(mapSeed(state.seed, level));
			state.pathTiles = pathTilesOf(state.path);
			state.towers = [];
			state.enemies = [];
			state.projectiles = [];
			state.effects = [];
			state.phase = "build";
			state.buildTimer = 15;
			state.callTimer = 12;
			state.spawnQueue = 0;
			state.spawnTimer = 0;
			state.brutePending = false;
		}
		/** A fresh game state at `level` (defaults to 1) on the seeded map. */
		function createState(seed, level = 1) {
			const state = {
				seed,
				level: 1,
				wave: 1,
				path: [],
				pathTiles: [],
				towers: [],
				enemies: [],
				projectiles: [],
				effects: [],
				gold: 120,
				lives: 3,
				score: 0,
				phase: "build",
				buildTimer: 15,
				callTimer: 12,
				spawnQueue: 0,
				spawnTimer: 0,
				brutePending: false,
				result: "none",
				t: 0,
				nextId: 1,
				rng: mulberry32$4((mapSeed(seed, level) ^ 1542469173) >>> 0)
			};
			resetBoard(state, level);
			state.rng = mulberry32$4((mapSeed(seed, level) ^ 1542469173) >>> 0);
			return state;
		}
		/** Restart the current level: same map seed, gold back to start, wave 1. */
		function restartLevel$1(state) {
			state.gold = 120;
			state.lives = 3;
			state.score = 0;
			state.result = "none";
			state.t = 0;
			state.nextId = 1;
			resetBoard(state, state.level);
			state.rng = mulberry32$4((mapSeed(state.seed, state.level) ^ 1542469173) >>> 0);
		}
		/** Arm a fresh wave spawn (wave counter already points at the wave to run). */
		function beginWave(state) {
			state.phase = "wave";
			state.spawnQueue = waveSize(state.wave);
			state.spawnTimer = SPAWN_FIRST_DELAY;
			state.brutePending = state.wave % 3 === 0;
			state.callTimer = 12;
		}
		/**
		* Start the wave now. From the build phase this runs the pending wave; from
		* combat (queue drained, a next wave exists) it OVERLAPS: the next wave's
		* enemies join the fight immediately. The early-call bonus is granted by
		* {@link sendWaveEarly}, which routes both paths.
		*/
		function startWave(state) {
			if (state.result !== "none") return;
			if (state.phase === "build") {
				beginWave(state);
				return;
			}
			if (state.phase === "wave" && state.spawnQueue === 0 && state.wave < 10) {
				state.wave += 1;
				beginWave(state);
			}
		}
		/**
		* Send the next wave early: grants +10 gold per remaining second and starts
		* the wave immediately. In the build phase that just skips the countdown; in
		* combat (queue drained) it overlaps the next wave onto the survivors —
		* harder fight, paid for with the bonus. Calling mid-combat trades the
		* overlapped wave's clear bonus for the early bonus.
		*/
		function sendWaveEarly(state) {
			if (state.result !== "none") return;
			if (state.phase === "build") {
				const bonus = earlySendBonus(state.buildTimer);
				state.gold += bonus;
				state.score += bonus;
				startWave(state);
				return;
			}
			if (state.phase === "wave" && state.spawnQueue === 0 && state.wave < 10) {
				const bonus = earlySendBonus(state.callTimer);
				state.gold += bonus;
				state.score += bonus;
				state.wave += 1;
				beginWave(state);
			}
		}
		function spawnEnemy(state) {
			const brute = state.brutePending && state.spawnQueue === 1;
			const hp = waveHp(state.wave, state.level) * (brute ? 3 : 1);
			const speed = waveSpeed(state.wave, state.level) * (brute ? .7 : 1);
			state.enemies.push({
				id: state.nextId,
				hp,
				maxHp: hp,
				speed,
				brute,
				dist: 0,
				slowTime: 0,
				slowFactor: 0,
				alive: true
			});
			state.nextId += 1;
			state.spawnQueue -= 1;
		}
		/** Whether a tower may be built on tile (tx, ty): in bounds, off the path,
		* on a free tile. Gold is checked separately by {@link buildTower}. */
		function canBuild(state, tx, ty) {
			if (tx < 0 || tx >= 11 || ty < 0 || ty >= 9) return false;
			if (state.pathTiles[ty][tx]) return false;
			return !state.towers.some((tower) => tower.tx === tx && tower.ty === ty);
		}
		/** Build `kind` on (tx, ty) when allowed and affordable; adds cost to score. */
		function buildTower(state, kind, tx, ty) {
			const cost = TOWER_INFO[kind].cost;
			if (!canBuild(state, tx, ty) || state.gold < cost) return false;
			state.gold -= cost;
			state.score += cost;
			state.towers.push({
				id: state.nextId,
				kind,
				tx,
				ty,
				level: 1,
				cooldown: 0,
				spent: cost
			});
			state.nextId += 1;
			return true;
		}
		/** Sell a tower for 60% of everything paid for it. */
		function sellTower(state, towerId) {
			const index = state.towers.findIndex((tower) => tower.id === towerId);
			if (index < 0) return false;
			const tower = state.towers[index];
			state.gold += Math.floor(tower.spent * .6);
			state.towers.splice(index, 1);
			return true;
		}
		/** Upgrade a tower one level (max Lv3) when affordable; adds price to score. */
		function upgradeTower(state, towerId) {
			const tower = state.towers.find((t) => t.id === towerId);
			if (tower === void 0 || tower.level >= 3) return false;
			const cost = upgradeCost(tower.kind, tower.level);
			if (state.gold < cost) return false;
			state.gold -= cost;
			state.score += cost;
			tower.spent += cost;
			tower.level += 1;
			return true;
		}
		/** Apply damage (+ optional slow) to an enemy; kills grant gold. Slow stacks
		* duration at the same magnitude; a stronger magnitude replaces and resets. */
		function hitEnemy(state, enemy, dmg, slowFactor = 0, slowDuration = 0) {
			if (!enemy.alive) return;
			if (slowFactor > 0 && slowDuration > 0) {
				if (enemy.slowTime > 0 && enemy.slowFactor >= slowFactor) enemy.slowTime += slowDuration;
				else if (enemy.slowTime > 0 && enemy.slowFactor < slowFactor) {
					enemy.slowFactor = slowFactor;
					enemy.slowTime = slowDuration;
				} else {
					enemy.slowFactor = slowFactor;
					enemy.slowTime = slowDuration;
				}
			}
			enemy.hp -= dmg;
			if (enemy.hp <= 0) {
				enemy.alive = false;
				state.gold += killGold(state.wave);
			}
		}
		/** Effective enemy speed in tiles/s (base × slow reduction while slowed). */
		function enemySpeed(enemy) {
			return enemy.slowTime > 0 ? enemy.speed * (1 - enemy.slowFactor) : enemy.speed;
		}
		function findEnemy(state, id) {
			return state.enemies.find((enemy) => enemy.id === id);
		}
		/** Tower target: the enemy furthest along the corridor within range. */
		function acquireTarget(state, tower, stats) {
			let best = null;
			for (const enemy of state.enemies) {
				if (!enemy.alive) continue;
				const pos = positionAt(state.path, enemy.dist);
				const dx = pos.x - tower.tx;
				const dy = pos.y - tower.ty;
				if (dx * dx + dy * dy > stats.range * stats.range) continue;
				if (best === null || enemy.dist > best.dist) best = enemy;
			}
			return best;
		}
		function fire(state, tower, stats, target) {
			tower.cooldown = stats.cooldown;
			if (tower.kind === "cannon") {
				const to = positionAt(state.path, target.dist);
				state.projectiles.push({
					kind: "lob",
					x: tower.tx,
					y: tower.ty,
					dmg: stats.dmg,
					targetId: target.id,
					speed: 0,
					slowFactor: 0,
					slowDuration: 0,
					fromX: tower.tx,
					fromY: tower.ty,
					toX: to.x,
					toY: to.y,
					t: 0,
					flight: .5,
					splash: stats.splash ?? .8
				});
				return;
			}
			state.projectiles.push({
				kind: "homing",
				x: tower.tx,
				y: tower.ty,
				dmg: stats.dmg,
				targetId: target.id,
				speed: tower.kind === "arrow" ? 6 : 4,
				slowFactor: stats.slowFactor ?? 0,
				slowDuration: stats.slowDuration ?? 0,
				fromX: tower.tx,
				fromY: tower.ty,
				toX: 0,
				toY: 0,
				t: 0,
				flight: 0,
				splash: 0
			});
		}
		/** Explode a cannon shell at (x, y): every enemy within the splash radius
		* takes the full damage. */
		function explode(state, x, y, dmg, splash) {
			state.effects.push({
				x,
				y,
				t: 0,
				life: .3
			});
			for (const enemy of state.enemies) {
				if (!enemy.alive) continue;
				const pos = positionAt(state.path, enemy.dist);
				const dx = pos.x - x;
				const dy = pos.y - y;
				if (dx * dx + dy * dy <= splash * splash) hitEnemy(state, enemy, dmg);
			}
		}
		function advanceLevel(state) {
			resetBoard(state, state.level % 5 + 1);
			state.lives = 3;
		}
		function waveCleared(state) {
			const bonus = waveClearBonus(state.wave);
			state.gold += bonus;
			state.score += bonus;
			if (state.wave >= 10) {
				advanceLevel(state);
				return;
			}
			state.wave += 1;
			state.phase = "build";
			state.buildTimer = 15;
			state.callTimer = 12;
		}
		/**
		* Advance the game by dt seconds (clamp to <= 1/20 upstream).
		* @param state - the game state (mutated in place).
		* @param dt - elapsed seconds.
		*/
		function step$2(state, dt) {
			if (state.result !== "none") return;
			state.t += dt;
			if (state.phase === "build") {
				state.buildTimer -= dt;
				if (state.buildTimer <= 0) startWave(state);
			}
			if (state.phase === "wave" && state.spawnQueue > 0) {
				state.spawnTimer -= dt;
				if (state.spawnTimer <= 0) {
					spawnEnemy(state);
					state.spawnTimer = .9 + state.rng() * .3;
				}
			}
			if (state.phase === "wave" && state.spawnQueue === 0 && state.enemies.length > 0 && state.callTimer > 0) state.callTimer = Math.max(0, state.callTimer - dt);
			let leaked = 0;
			const total = pathLength(state.path);
			for (const enemy of state.enemies) {
				if (!enemy.alive) continue;
				if (enemy.slowTime > 0) enemy.slowTime = Math.max(0, enemy.slowTime - dt);
				enemy.dist += enemySpeed(enemy) * dt;
				if (enemy.dist >= total) {
					enemy.alive = false;
					leaked += 1;
				}
			}
			if (leaked > 0) {
				state.lives -= leaked;
				state.enemies = state.enemies.filter((enemy) => enemy.alive);
				if (state.lives <= 0) {
					state.lives = 0;
					state.result = "lose";
					return;
				}
			}
			for (const tower of state.towers) {
				tower.cooldown = Math.max(0, tower.cooldown - dt);
				if (tower.cooldown > 0) continue;
				const stats = towerStats(tower.kind, tower.level);
				const target = acquireTarget(state, tower, stats);
				if (target !== null) fire(state, tower, stats, target);
			}
			const aliveProjectiles = [];
			for (const p of state.projectiles) if (p.kind === "homing") {
				const target = findEnemy(state, p.targetId);
				if (target === void 0 || !target.alive) continue;
				const pos = positionAt(state.path, target.dist);
				const dx = pos.x - p.x;
				const dy = pos.y - p.y;
				const dist = Math.hypot(dx, dy);
				const travel = p.speed * dt;
				if (dist <= travel + .05) {
					hitEnemy(state, target, p.dmg, p.slowFactor, p.slowDuration);
					continue;
				}
				p.x += dx / dist * travel;
				p.y += dy / dist * travel;
				aliveProjectiles.push(p);
			} else {
				p.t += dt;
				const t = Math.min(1, p.t / p.flight);
				p.x = p.fromX + (p.toX - p.fromX) * t;
				p.y = p.fromY + (p.toY - p.fromY) * t;
				if (p.t >= p.flight) {
					explode(state, p.toX, p.toY, p.dmg, p.splash);
					continue;
				}
				aliveProjectiles.push(p);
			}
			state.projectiles = aliveProjectiles;
			state.enemies = state.enemies.filter((enemy) => enemy.alive);
			if (state.phase === "wave" && state.spawnQueue === 0 && state.enemies.length === 0) waveCleared(state);
			for (const effect of state.effects) effect.t += dt;
			state.effects = state.effects.filter((effect) => effect.t < effect.life);
		}
		const LOGICAL_W$3 = 528;
		const LOGICAL_H$3 = 544;
		const BOARD_X = 0;
		const BOARD_Y = 44;
		const TOWER_ORDER = [
			"arrow",
			"frost",
			"cannon"
		];
		const TOWER_GLYPH = {
			arrow: "🏹",
			frost: "❄️",
			cannon: "💣"
		};
		/**
		* Five buttons must fit LOGICAL_W = 528px: 3 tower + upgrade + sell.
		* 5 × 96 + 4 × 10 gaps = 520 + 2 × 4 margin = 528 — a compact grid the
		* previous 128px-wide buttons could never fit (they stacked 3 + overlapped
		* the right pair onto the cannon button).
		*/
		const BTN_W = 96;
		const BTN_H = 52;
		const BTN_Y = 484;
		/** Left x of button slot i (0-2 towers, 3 upgrade, 4 sell). */
		const btnX = (i) => 4 + i * 106;
		/** Board tile under logical point (x, y), or null outside the board. */
		function cellAt$1(x, y) {
			const tx = Math.floor((x - BOARD_X) / 48);
			const ty = Math.floor((y - BOARD_Y) / 48);
			if (tx < 0 || tx >= 11 || ty < 0 || ty >= 9) return null;
			return {
				tx,
				ty
			};
		}
		/** Toolbar button under logical point (x, y), or null outside the toolbar. */
		function toolbarAt(x, y) {
			if (y < BTN_Y || y > 536) return null;
			for (let i = 0; i < 5; i += 1) {
				const bx = btnX(i);
				if (x >= bx && x <= bx + BTN_W) {
					if (i <= 2) return { kind: TOWER_ORDER[i] };
					return { kind: i === 3 ? "upgrade" : "sell" };
				}
			}
			return null;
		}
		function drawBoard(ctx, view) {
			const { state } = view;
			for (let ty = 0; ty < 9; ty += 1) for (let tx = 0; tx < 11; tx += 1) {
				const px = BOARD_X + tx * 48;
				const py = BOARD_Y + ty * 48;
				ctx.fillStyle = state.pathTiles[ty][tx] ? "#262637" : THEME.panel;
				ctx.fillRect(px + 1, py + 1, 46, 46);
				ctx.strokeStyle = "rgba(52,52,74,0.5)";
				ctx.strokeRect(px + 1.5, py + 1.5, 45, 45);
			}
			ctx.strokeStyle = accent(6);
			ctx.lineWidth = 4;
			ctx.setLineDash([7, 7]);
			ctx.beginPath();
			for (let i = 0; i < state.path.length; i += 1) {
				const wp = state.path[i];
				const px = BOARD_X + wp.x * 48 + 24;
				const py = BOARD_Y + wp.y * 48 + 24;
				if (i === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.lineWidth = 1;
			const first = state.path[0];
			const last = state.path[state.path.length - 1];
			ctx.font = "16px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.fillStyle = THEME.good;
			ctx.fillText("▶", BOARD_X + first.x * 48 + 24 - 10, BOARD_Y + first.y * 48 + 24 + 6);
			ctx.fillStyle = THEME.bad;
			ctx.fillText("🚩", BOARD_X + last.x * 48 + 24, BOARD_Y + last.y * 48 + 24 + 6);
		}
		function drawTowers(ctx, view) {
			const { state } = view;
			const selected = state.towers.find((t) => t.id === view.selectedTowerId);
			if (selected !== void 0) {
				const stats = towerStats(selected.kind, selected.level);
				const cx = BOARD_X + selected.tx * 48 + 24;
				const cy = BOARD_Y + selected.ty * 48 + 24;
				ctx.strokeStyle = THEME.gold;
				ctx.setLineDash([5, 5]);
				ctx.beginPath();
				ctx.arc(cx, cy, stats.range * 48, 0, Math.PI * 2);
				ctx.stroke();
				ctx.setLineDash([]);
			}
			for (let i = 0; i < state.towers.length; i += 1) {
				const tower = state.towers[i];
				const px = BOARD_X + tower.tx * 48 + 3;
				const py = BOARD_Y + tower.ty * 48 + 3;
				const color = tower.kind === "arrow" ? accent(0) : tower.kind === "frost" ? accent(5) : accent(4);
				roundRectPath(ctx, px, py, 42, 42, 8);
				ctx.fillStyle = THEME.panelEdge;
				ctx.fill();
				ctx.strokeStyle = color;
				ctx.stroke();
				ctx.font = "18px system-ui, sans-serif";
				ctx.textAlign = "center";
				ctx.fillStyle = THEME.text;
				ctx.fillText(TOWER_GLYPH[tower.kind], px + 21, py + 22);
				for (let lv = 0; lv < tower.level; lv += 1) {
					ctx.fillStyle = color;
					ctx.fillRect(px + 7 + lv * 9, py + 48 - 14, 6, 4);
				}
			}
		}
		function drawEnemies(ctx, view) {
			const { state } = view;
			for (const enemy of state.enemies) {
				const pos = positionAt(state.path, enemy.dist);
				const cx = BOARD_X + pos.x * 48 + 24;
				const cy = BOARD_Y + pos.y * 48 + 24;
				const r = enemy.brute ? 13 : 9;
				const color = enemy.brute ? THEME.bad : accent(3);
				glow(ctx, color, 8);
				ctx.fillStyle = color;
				ctx.beginPath();
				ctx.arc(cx, cy, r, 0, Math.PI * 2);
				ctx.fill();
				noGlow(ctx);
				ctx.fillStyle = "rgba(13,13,20,0.8)";
				ctx.fillRect(cx - r, cy - r - 7, r * 2, 4);
				ctx.fillStyle = THEME.good;
				ctx.fillRect(cx - r, cy - r - 7, r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 4);
				if (enemy.slowTime > 0) {
					ctx.strokeStyle = accent(5);
					ctx.beginPath();
					ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
					ctx.stroke();
				}
			}
		}
		function drawProjectiles(ctx, view) {
			for (const p of view.state.projectiles) {
				const px = BOARD_X + p.x * 48 + 24;
				const py = BOARD_Y + p.y * 48 + 24;
				const color = p.kind === "lob" ? accent(4) : p.slowFactor > 0 ? accent(5) : accent(0);
				glow(ctx, color, 8);
				ctx.fillStyle = color;
				ctx.beginPath();
				ctx.arc(px, py, p.kind === "lob" ? 5 : 3.5, 0, Math.PI * 2);
				ctx.fill();
				noGlow(ctx);
			}
			for (const fx of view.state.effects) {
				const px = BOARD_X + fx.x * 48 + 24;
				const py = BOARD_Y + fx.y * 48 + 24;
				const a = 1 - fx.t / fx.life;
				ctx.globalAlpha = a;
				ctx.strokeStyle = accent(7);
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(px, py, (1 - a) * 26 + 4, 0, Math.PI * 2);
				ctx.stroke();
				ctx.globalAlpha = 1;
				ctx.lineWidth = 1;
			}
		}
		function drawHud$2(ctx, view) {
			const { state } = view;
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, LOGICAL_W$3, 44);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.beginPath();
			ctx.moveTo(0, 43.5);
			ctx.lineTo(LOGICAL_W$3, 43.5);
			ctx.stroke();
			ctx.textAlign = "left";
			hudPair(ctx, 10, 27, "金币", String(state.gold), "left", THEME.gold);
			hudPair(ctx, 100, 27, "生命", `${"❤".repeat(state.lives) || "—"}`, "left", state.lives > 1 ? THEME.bad : THEME.text);
			hudPair(ctx, 186, 27, "波次", `${state.wave}/10`);
			hudPair(ctx, 264, 27, "关卡", String(state.level));
			hudPair(ctx, 518, 27, "分数", String(state.score), "right");
			if (state.phase === "build") hudPair(ctx, 398, 27, "来袭", `${Math.ceil(state.buildTimer)}s`, "right", THEME.textMuted);
			else if (state.phase === "wave" && state.spawnQueue === 0 && state.enemies.length > 0 && state.wave < 10) {
				const bonus = earlySendBonus(state.callTimer);
				hudPair(ctx, 398, 27, "空格 召唤", bonus > 0 ? `+${String(bonus)}` : "可叠波", "right", THEME.gold);
			}
		}
		function drawToolbar(ctx, view) {
			const { state } = view;
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 476, LOGICAL_W$3, 68);
			for (let i = 0; i < TOWER_ORDER.length; i += 1) {
				const kind = TOWER_ORDER[i];
				const bx = btnX(i);
				const affordable = state.gold >= TOWER_INFO[kind].cost;
				const active = view.selectedKind === kind;
				roundRectPath(ctx, bx, BTN_Y, BTN_W, BTN_H, 8);
				ctx.fillStyle = active ? "#2c2c40" : THEME.panelEdge;
				ctx.fill();
				ctx.strokeStyle = active ? THEME.gold : affordable ? accent(i) : THEME.textMuted;
				ctx.stroke();
				ctx.textAlign = "left";
				ctx.fillStyle = affordable ? THEME.text : THEME.textMuted;
				ctx.font = "600 12px system-ui, sans-serif";
				ctx.fillText(`${TOWER_GLYPH[kind]} ${TOWER_INFO[kind].name} ${TOWER_INFO[kind].cost}`, bx + 8, 504);
				ctx.font = "600 11px system-ui, sans-serif";
				ctx.fillStyle = THEME.textMuted;
				ctx.fillText(kind === "arrow" ? "快速单体" : kind === "frost" ? "减速控制" : "范围溅射", bx + 8, 522);
			}
			const ux = btnX(3);
			const tower = state.towers.find((t) => t.id === view.selectedTowerId);
			const upCost = tower !== void 0 && tower.level < 3 ? TOWER_INFO[tower.kind].upgrades[tower.level - 1] : null;
			roundRectPath(ctx, ux, BTN_Y, BTN_W, BTN_H, 8);
			ctx.fillStyle = THEME.panelEdge;
			ctx.fill();
			ctx.strokeStyle = upCost !== null && state.gold >= upCost ? accent(2) : THEME.textMuted;
			ctx.stroke();
			ctx.fillStyle = upCost !== null ? THEME.text : THEME.textMuted;
			ctx.font = "600 12px system-ui, sans-serif";
			ctx.fillText(upCost !== null ? `⬆ 升级 ${upCost}` : "⬆ 已满级", ux + 8, 504);
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText("按 U", ux + 8, 522);
			const sx = btnX(4);
			roundRectPath(ctx, sx, BTN_Y, BTN_W, BTN_H, 8);
			ctx.fillStyle = THEME.panelEdge;
			ctx.fill();
			ctx.strokeStyle = tower !== void 0 ? THEME.bad : THEME.textMuted;
			ctx.stroke();
			ctx.fillStyle = tower !== void 0 ? THEME.text : THEME.textMuted;
			ctx.font = "600 12px system-ui, sans-serif";
			ctx.fillText("💰 出售", sx + 8, 504);
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText("返还 60%", sx + 8, 522);
			if (view.hover !== null && view.selectedKind !== null) {
				const htx = view.hover.tx;
				const hty = view.hover.ty;
				const px = BOARD_X + htx * 48 + 3;
				const py = BOARD_Y + hty * 48 + 3;
				ctx.strokeStyle = !view.state.pathTiles[hty][htx] && !view.state.towers.some((t) => t.tx === htx && t.ty === hty) ? THEME.good : THEME.bad;
				roundRectPath(ctx, px, py, 42, 42, 8);
				ctx.stroke();
				const stats = towerStats(view.selectedKind, 1);
				ctx.setLineDash([4, 4]);
				ctx.beginPath();
				ctx.arc(px + 24, py + 24, stats.range * 48, 0, Math.PI * 2);
				ctx.stroke();
				ctx.setLineDash([]);
			}
		}
		/** Draw the full game frame (board + HUD + toolbar + overlays). */
		function renderTd(ctx, view) {
			drawBackground(ctx, LOGICAL_W$3, LOGICAL_H$3);
			drawBoard(ctx, view);
			drawTowers(ctx, view);
			drawEnemies(ctx, view);
			drawProjectiles(ctx, view);
			drawHud$2(ctx, view);
			drawToolbar(ctx, view);
			if (view.state.result === "lose") drawOverlay(ctx, LOGICAL_W$3, LOGICAL_H$3, "防守失败", `最终分数 ${view.state.score} · 按 Enter 重开本关`, THEME.bad);
			else if (view.paused) drawOverlay(ctx, LOGICAL_W$3, LOGICAL_H$3, spaced("暂停"), "按 P 继续", THEME.textMuted);
		}
		//#endregion
		//#region src/client/games/td/index.ts
		const GAME_ID$3 = "td";
		function createTdGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$3, LOGICAL_H$3);
			if (fit === null) throw new Error("dsh-minigames: td needs a 2d canvas context");
			const ctx = fit.ctx;
			const startLevel = readLevel(GAME_ID$3);
			let state = createState((Date.now() ^ 494885435) >>> 0, startLevel);
			let selectedKind = null;
			let selectedTowerId = null;
			let hover = null;
			let running = false;
			let paused = false;
			let lastScore = -1;
			let lastLevel = -1;
			const reportScore = () => {
				if (state.score === lastScore && state.level === lastLevel) return;
				lastScore = state.score;
				lastLevel = state.level;
				options?.onScore?.(Math.max(state.score, state.level * 1e3));
			};
			const selectPlaced = (towerId) => {
				selectedTowerId = towerId;
				if (towerId !== null) selectedKind = null;
			};
			const doBuild = (tx, ty) => {
				const towerHere = state.towers.find((t) => t.tx === tx && t.ty === ty);
				if (towerHere !== void 0) {
					selectPlaced(towerHere.id === selectedTowerId ? null : towerHere.id);
					return;
				}
				if (selectedKind === null) return;
				if (buildTower(state, selectedKind, tx, ty)) selectPlaced(null);
			};
			const restart = () => {
				restartLevel$1(state);
				selectedKind = null;
				selectedTowerId = null;
				lastScore = -1;
				reportScore();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const k = event.code;
				if (k === "Space" || k.startsWith("Digit")) event.preventDefault();
				if (event.repeat) return;
				switch (k) {
					case "Digit1":
						selectedKind = selectedKind === "arrow" ? null : "arrow";
						selectPlaced(null);
						break;
					case "Digit2":
						selectedKind = selectedKind === "frost" ? null : "frost";
						selectPlaced(null);
						break;
					case "Digit3":
						selectedKind = selectedKind === "cannon" ? null : "cannon";
						selectPlaced(null);
						break;
					case "KeyU":
						if (selectedTowerId !== null) upgradeTower(state, selectedTowerId);
						break;
					case "KeyX":
						if (selectedTowerId !== null) {
							sellTower(state, selectedTowerId);
							selectPlaced(null);
						}
						break;
					case "Space":
						if (state.result === "none") sendWaveEarly(state);
						break;
					case "KeyR":
						restart();
						break;
					case "Enter":
					case "NumpadEnter":
						if (state.result === "lose") restart();
						break;
					case "KeyP":
					case "Escape": togglePause();
				}
			};
			const onPointerMove = (event) => {
				const rect = canvas.getBoundingClientRect();
				hover = cellAt$1((event.clientX - rect.left) * LOGICAL_W$3 / rect.width, (event.clientY - rect.top) * LOGICAL_H$3 / rect.height);
			};
			const onPointerDown = (event) => {
				focusGameHost(host);
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$3 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$3 / rect.height;
				const btn = toolbarAt(x, y);
				if (btn !== null) {
					if (btn.kind === "upgrade") {
						if (selectedTowerId !== null) upgradeTower(state, selectedTowerId);
					} else if (btn.kind === "sell") {
						if (selectedTowerId !== null) {
							sellTower(state, selectedTowerId);
							selectPlaced(null);
						}
					} else {
						selectedKind = selectedKind === btn.kind ? null : btn.kind;
						selectPlaced(null);
					}
					return;
				}
				const cell = cellAt$1(x, y);
				if (cell !== null) doBuild(cell.tx, cell.ty);
			};
			const frame = (f) => {
				if (!running) return;
				step$2(state, f.dt);
				if (state.result === "none" && state.wave === 1 && state.phase === "build") saveLevel(GAME_ID$3, state.level);
				reportScore();
				if (f.render) renderTd(ctx, {
					state,
					paused,
					selectedKind,
					selectedTowerId,
					hover
				});
			};
			const loop = createFrameLoop(frame);
			const pause = () => {
				if (!running) return;
				running = false;
				paused = true;
				loop.pause();
				renderTd(ctx, {
					state,
					paused: true,
					selectedKind,
					selectedTowerId,
					hover
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				paused = false;
				loop.resume();
			};
			const togglePause = () => {
				if (state.result !== "none") return;
				if (running) pause();
				else resume();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			canvas.addEventListener("pointermove", onPointerMove);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					canvas.removeEventListener("pointerdown", onPointerDown);
					canvas.removeEventListener("pointermove", onPointerMove);
					window.removeEventListener("keydown", onKeyDown);
					fit.dispose();
				}
			};
		}
		const tdGame = {
			id: "td",
			title: "塔防",
			icon: "🏹",
			description: "在固定路径旁建塔：箭塔速射、冰霜减速、炮塔溅射，守住十波敌人即可进入下一关。",
			controls: [
				"1/2/3 或点工具栏：选塔 · 点击空地建造",
				"点已有塔查看射程 · U 升级（最多3级）· X 出售",
				"空格：提前开战/战斗中召唤下一波（按剩余秒数奖励金币，叠波更难）",
				"R：重开本关 · P：暂停 · 失败后 Enter 重开"
			],
			create: createTdGame
		};
		/** True when `sq` is an on-board 0x88 index. */
		function onBoard(sq) {
			return (sq & 136) === 0;
		}
		function fileOf(sq) {
			return sq & 7;
		}
		function rankOf(sq) {
			return sq >> 4;
		}
		function colorOf(p) {
			return p === p.toUpperCase() ? "w" : "b";
		}
		function other(c) {
			return c === "w" ? "b" : "w";
		}
		/** The standard starting position. */
		function createStartPosition() {
			const board = new Array(128).fill("");
			const back = [
				"R",
				"N",
				"B",
				"Q",
				"K",
				"B",
				"N",
				"R"
			];
			for (let f = 0; f < 8; f += 1) {
				const backPiece = back[f];
				board[f] = backPiece;
				board[16 + f] = "P";
				board[96 + f] = "p";
				board[112 + f] = backPiece.toLowerCase();
			}
			return {
				board,
				turn: "w",
				castling: 15,
				ep: -1,
				halfmove: 0
			};
		}
		const KNIGHT_DIRS = [
			-33,
			-31,
			-18,
			-14,
			14,
			18,
			31,
			33
		];
		const KING_DIRS = [
			-17,
			-16,
			-15,
			-1,
			1,
			15,
			16,
			17
		];
		const BISHOP_DIRS = [
			-17,
			-15,
			15,
			17
		];
		const ROOK_DIRS = [
			-16,
			-1,
			1,
			16
		];
		/**
		* Whether `by` attacks `target` on this board (pawn diagonals, knights,
		* adjacency, and sliding bishops/rooks/queens).
		*/
		function isSquareAttacked(board, target, by) {
			const pawn = by === "w" ? "P" : "p";
			for (const d of by === "w" ? [-15, -17] : [15, 17]) {
				const s = target + d;
				if (onBoard(s) && board[s] === pawn) return true;
			}
			const knight = by === "w" ? "N" : "n";
			for (const d of KNIGHT_DIRS) {
				const s = target + d;
				if (onBoard(s) && board[s] === knight) return true;
			}
			const king = by === "w" ? "K" : "k";
			for (const d of KING_DIRS) {
				const s = target + d;
				if (onBoard(s) && board[s] === king) return true;
			}
			const diag1 = by === "w" ? "B" : "b";
			const diag2 = by === "w" ? "Q" : "q";
			for (const d of BISHOP_DIRS) {
				let s = target + d;
				while (onBoard(s)) {
					const p = board[s];
					if (p !== "") {
						if (p === diag1 || p === diag2) return true;
						break;
					}
					s += d;
				}
			}
			const ortho1 = by === "w" ? "R" : "r";
			const ortho2 = by === "w" ? "Q" : "q";
			for (const d of ROOK_DIRS) {
				let s = target + d;
				while (onBoard(s)) {
					const p = board[s];
					if (p !== "") {
						if (p === ortho1 || p === ortho2) return true;
						break;
					}
					s += d;
				}
			}
			return false;
		}
		/** 0x88 index of `color`'s king, or -1 (should not happen in legal games). */
		function findKing(board, color) {
			const k = color === "w" ? "K" : "k";
			for (let s = 0; s < 128; s += 1) if ((s & 136) === 0 && board[s] === k) return s;
			return -1;
		}
		/** Whether the side to move is in check. */
		function inCheck(pos) {
			const k = findKing(pos.board, pos.turn);
			return k >= 0 && isSquareAttacked(pos.board, k, other(pos.turn));
		}
		/** All pseudo-legal moves for the side to move (castling is fully checked here). */
		function generatePseudoMoves(pos) {
			const moves = [];
			const me = pos.turn;
			const opp = other(me);
			const push = (m) => {
				moves.push(m);
			};
			for (let from = 0; from < 128; from += 1) {
				if ((from & 136) !== 0) continue;
				const p = pos.board[from];
				if (p === "" || colorOf(p) !== me) continue;
				const upper = p.toUpperCase();
				if (upper === "P") {
					const dir = me === "w" ? 16 : -16;
					const startRank = me === "w" ? 1 : 6;
					const promoRank = me === "w" ? 7 : 0;
					const one = from + dir;
					if (onBoard(one) && pos.board[one] === "") {
						emitPawn(push, pos, from, one, "", promoRank);
						const two = one + dir;
						if (rankOf(from) === startRank && pos.board[two] === "") push({
							from,
							to: two,
							piece: p,
							capture: "",
							promo: "",
							castle: "",
							enPassant: false,
							double: true
						});
					}
					for (const dd of me === "w" ? [15, 17] : [-15, -17]) {
						const to = from + dd;
						if (!onBoard(to)) continue;
						const t = pos.board[to];
						if (t !== "" && colorOf(t) === opp) emitPawn(push, pos, from, to, t, promoRank);
						else if (t === "" && to === pos.ep) push({
							from,
							to,
							piece: p,
							capture: me === "w" ? "p" : "P",
							promo: "",
							castle: "",
							enPassant: true,
							double: false
						});
					}
				} else if (upper === "N" || upper === "K") {
					const dirs = upper === "N" ? KNIGHT_DIRS : KING_DIRS;
					for (const d of dirs) {
						const to = from + d;
						if (!onBoard(to)) continue;
						const t = pos.board[to];
						if (t !== "" && colorOf(t) === me) continue;
						push({
							from,
							to,
							piece: p,
							capture: t,
							promo: "",
							castle: "",
							enPassant: false,
							double: false
						});
					}
				} else {
					const dirs = upper === "B" ? BISHOP_DIRS : upper === "R" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
					for (const d of dirs) {
						let to = from + d;
						while (onBoard(to)) {
							const t = pos.board[to];
							if (t !== "" && colorOf(t) === me) break;
							push({
								from,
								to,
								piece: p,
								capture: t,
								promo: "",
								castle: "",
								enPassant: false,
								double: false
							});
							if (t !== "") break;
							to += d;
						}
					}
				}
			}
			emitCastling(push, pos);
			return moves;
		}
		function emitPawn(push, pos, from, to, capture, promoRank) {
			const piece = pos.board[from];
			if (rankOf(to) === promoRank) for (const promo of [
				"q",
				"r",
				"b",
				"n"
			]) push({
				from,
				to,
				piece,
				capture,
				promo,
				castle: "",
				enPassant: false,
				double: false
			});
			else push({
				from,
				to,
				piece,
				capture,
				promo: "",
				castle: "",
				enPassant: false,
				double: false
			});
		}
		/** Castling moves with the full through-check rule (not out of, through, or into check). */
		function emitCastling(push, pos) {
			const board = pos.board;
			const white = pos.turn === "w";
			const kingFrom = white ? 4 : 116;
			const opp = white ? "b" : "w";
			const king = white ? "K" : "k";
			const rook = white ? "R" : "r";
			if (board[kingFrom] !== king) return;
			if (isSquareAttacked(board, kingFrom, opp)) return;
			const ks = white ? 1 : 4;
			const qs = white ? 2 : 8;
			const base = white ? 0 : 112;
			if ((pos.castling & ks) !== 0 && board[base + 5] === "" && board[base + 6] === "" && board[base + 7] === rook && !isSquareAttacked(board, base + 5, opp) && !isSquareAttacked(board, base + 6, opp)) push({
				from: kingFrom,
				to: base + 6,
				piece: king,
				capture: "",
				promo: "",
				castle: "k",
				enPassant: false,
				double: false
			});
			if ((pos.castling & qs) !== 0 && board[base + 1] === "" && board[base + 2] === "" && board[base + 3] === "" && board[base] === rook && !isSquareAttacked(board, base + 3, opp) && !isSquareAttacked(board, base + 2, opp)) push({
				from: kingFrom,
				to: base + 2,
				piece: king,
				capture: "",
				promo: "",
				castle: "q",
				enPassant: false,
				double: false
			});
		}
		/**
		* Apply a pseudo-legal move, returning the next position (pure). Castling
		* rights, ep square, and the halfmove clock are updated.
		*/
		function applyMove(pos, m) {
			const board = pos.board.slice();
			const me = pos.turn;
			board[m.from] = "";
			if (m.enPassant) board[m.to + (me === "w" ? -16 : 16)] = "";
			if (m.promo !== "") board[m.to] = me === "w" ? m.promo.toUpperCase() : m.promo;
			else board[m.to] = m.piece;
			if (m.castle === "k") {
				const base = me === "w" ? 0 : 112;
				board[base + 7] = "";
				board[base + 5] = me === "w" ? "R" : "r";
			} else if (m.castle === "q") {
				const base = me === "w" ? 0 : 112;
				board[base] = "";
				board[base + 3] = me === "w" ? "R" : "r";
			}
			let castling = pos.castling;
			if (m.piece === "K") castling &= -4;
			if (m.piece === "k") castling &= -13;
			for (const corner of [
				0,
				7,
				112,
				119
			]) if (m.from === corner || m.to === corner) {
				if (corner === 0) castling &= -3;
				else if (corner === 7) castling &= -2;
				else if (corner === 112) castling &= -9;
				else castling &= -5;
			}
			const pawnMove = m.piece === "P" || m.piece === "p";
			return {
				board,
				turn: other(me),
				castling,
				ep: m.double ? (m.from + m.to) / 2 : -1,
				halfmove: pawnMove || m.capture !== "" ? 0 : pos.halfmove + 1
			};
		}
		/** Fully legal moves: pseudo moves that leave the mover's king unattacked. */
		function legalMoves(pos) {
			const me = pos.turn;
			const opp = other(me);
			return generatePseudoMoves(pos).filter((m) => {
				const next = applyMove(pos, m);
				const k = findKing(next.board, me);
				return k < 0 || !isSquareAttacked(next.board, k, opp);
			});
		}
		/** FEN-ish position key (placement, turn, castling, ep) for repetition counting. */
		function positionKey(pos) {
			let s = "";
			for (let r = 7; r >= 0; r -= 1) for (let f = 0; f < 8; f += 1) {
				const p = pos.board[r * 16 + f];
				s += p === "" ? "." : p;
			}
			return `${s} ${pos.turn} ${pos.castling} ${pos.ep}`;
		}
		/**
		* Draw by bare kings or a single bishop/knight (K vs K, K+B/N vs K).
		* Everything else (including two minors) plays on.
		*/
		function insufficientMaterial(pos) {
			const rest = [];
			for (let s = 0; s < 128; s += 1) {
				if ((s & 136) !== 0) continue;
				const p = pos.board[s];
				if (p === "" || p === "K" || p === "k") continue;
				rest.push(p);
			}
			if (rest.length === 0) return true;
			if (rest.length === 1) {
				const u = rest[0].toUpperCase();
				return u === "B" || u === "N";
			}
			return false;
		}
		/**
		* Game status for the side to move.
		* @param pos - the position to judge.
		* @param repetitions - how many times the current position (by positionKey)
		*   has occurred, including this one; ≥ 3 is a draw.
		*/
		function status(pos, repetitions = 1) {
			if (insufficientMaterial(pos)) return { kind: "draw-insufficient" };
			if (repetitions >= 3) return { kind: "draw-repetition" };
			if (legalMoves(pos).length === 0) return inCheck(pos) ? {
				kind: "checkmate",
				winner: other(pos.turn)
			} : { kind: "stalemate" };
			return { kind: "playing" };
		}
		//#endregion
		//#region src/client/games/chess/ai.ts
		/**
		* Chess AI: negamax with alpha-beta pruning, MVV-LVA move ordering,
		* quiescence search over captures/promotions, iterative deepening with a
		* node budget, and material + piece-square-table evaluation. Fully
		* deterministic for identical position/depth/budget/seed — a seeded
		* mulberry32 stream breaks ties among equal-scored root moves only.
		*/
		/** Hard cap on visited nodes per chooseMove call (all levels share it). */
		const NODE_BUDGET = 5e4;
		/** Per-level search depths (ply): L1 d2, L2 d3, L3 d4, L4 d5. */
		const LEVEL_DEPTH = [
			2,
			3,
			4,
			5
		];
		const VAL = {
			P: 100,
			N: 320,
			B: 330,
			R: 500,
			Q: 900,
			K: 0,
			p: 100,
			n: 320,
			b: 330,
			r: 500,
			q: 900,
			k: 0
		};
		const PST = {
			P: [
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				50,
				50,
				50,
				50,
				50,
				50,
				50,
				50,
				10,
				10,
				20,
				30,
				30,
				20,
				10,
				10,
				5,
				5,
				10,
				25,
				25,
				10,
				5,
				5,
				0,
				0,
				0,
				20,
				20,
				0,
				0,
				0,
				5,
				-5,
				-10,
				0,
				0,
				-10,
				-5,
				5,
				5,
				10,
				10,
				-20,
				-20,
				10,
				10,
				5,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0
			],
			N: [
				-50,
				-40,
				-30,
				-30,
				-30,
				-30,
				-40,
				-50,
				-40,
				-20,
				0,
				0,
				0,
				0,
				-20,
				-40,
				-30,
				0,
				10,
				15,
				15,
				10,
				0,
				-30,
				-30,
				5,
				15,
				20,
				20,
				15,
				5,
				-30,
				-30,
				0,
				15,
				20,
				20,
				15,
				0,
				-30,
				-30,
				5,
				10,
				15,
				15,
				10,
				5,
				-30,
				-40,
				-20,
				0,
				5,
				5,
				0,
				-20,
				-40,
				-50,
				-40,
				-30,
				-30,
				-30,
				-30,
				-40,
				-50
			],
			B: [
				-20,
				-10,
				-10,
				-10,
				-10,
				-10,
				-10,
				-20,
				-10,
				0,
				0,
				0,
				0,
				0,
				0,
				-10,
				-10,
				0,
				5,
				10,
				10,
				5,
				0,
				-10,
				-10,
				5,
				5,
				10,
				10,
				5,
				5,
				-10,
				-10,
				0,
				10,
				10,
				10,
				10,
				0,
				-10,
				-10,
				10,
				10,
				10,
				10,
				10,
				10,
				-10,
				-10,
				5,
				0,
				0,
				0,
				0,
				5,
				-10,
				-20,
				-10,
				-10,
				-10,
				-10,
				-10,
				-10,
				-20
			],
			R: [
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				5,
				10,
				10,
				10,
				10,
				10,
				10,
				5,
				-5,
				0,
				0,
				0,
				0,
				0,
				0,
				-5,
				-5,
				0,
				0,
				0,
				0,
				0,
				0,
				-5,
				-5,
				0,
				0,
				0,
				0,
				0,
				0,
				-5,
				-5,
				0,
				0,
				0,
				0,
				0,
				0,
				-5,
				-5,
				0,
				0,
				0,
				0,
				0,
				0,
				-5,
				0,
				0,
				0,
				5,
				5,
				0,
				0,
				0
			],
			Q: [
				-20,
				-10,
				-10,
				-5,
				-5,
				-10,
				-10,
				-20,
				-10,
				0,
				0,
				0,
				0,
				0,
				0,
				-10,
				-10,
				0,
				5,
				5,
				5,
				5,
				0,
				-10,
				-5,
				0,
				5,
				5,
				5,
				5,
				0,
				-5,
				0,
				0,
				5,
				5,
				5,
				5,
				0,
				-5,
				-10,
				5,
				5,
				5,
				5,
				5,
				0,
				-10,
				-10,
				0,
				5,
				0,
				0,
				0,
				0,
				-10,
				-20,
				-10,
				-10,
				-5,
				-5,
				-10,
				-10,
				-20
			],
			K: [
				-30,
				-40,
				-40,
				-50,
				-50,
				-40,
				-40,
				-30,
				-30,
				-40,
				-40,
				-50,
				-50,
				-40,
				-40,
				-30,
				-30,
				-40,
				-40,
				-50,
				-50,
				-40,
				-40,
				-30,
				-30,
				-40,
				-40,
				-50,
				-50,
				-40,
				-40,
				-30,
				-20,
				-30,
				-30,
				-40,
				-40,
				-30,
				-30,
				-20,
				-10,
				-20,
				-20,
				-20,
				-20,
				-20,
				-20,
				-10,
				20,
				20,
				0,
				0,
				0,
				0,
				20,
				20,
				20,
				30,
				10,
				0,
				0,
				10,
				30,
				20
			]
		};
		/** 64-array index for a 0x88 square in a White-perspective table (rank 8 first). */
		function pstIndex(s, white) {
			const r = rankOf(s);
			return (white ? 7 - r : r) * 8 + fileOf(s);
		}
		/**
		* Static evaluation (centipawns) from the SIDE-TO-MOVE's perspective:
		* material + piece-square tables, White-positive then sign-flipped for Black.
		*/
		function evaluate(pos) {
			let s = 0;
			for (let i = 0; i < 128; i += 1) {
				if ((i & 136) !== 0) continue;
				const p = pos.board[i];
				if (p === "") continue;
				const white = colorOf(p) === "w";
				s += (white ? 1 : -1) * (VAL[p] + PST[p.toUpperCase()][pstIndex(i, white)]);
			}
			return pos.turn === "w" ? s : -s;
		}
		/** MVV-LVA: capture the most valuable piece with the least valuable attacker first. */
		function moveScore(m) {
			let s = 0;
			if (m.capture !== "") s += 1e6 + VAL[m.capture] * 16 - VAL[m.piece];
			if (m.promo !== "") s += 1e6 + VAL[m.promo === "q" ? "Q" : m.promo === "r" ? "R" : m.promo === "b" ? "B" : "N"];
			return s;
		}
		function orderedLegal(pos) {
			return legalMoves(pos).sort((a, b) => moveScore(b) - moveScore(a));
		}
		/**
		* Quiescence search: stand-pat eval, then captures/promotions only, so the
		* eval never sees a mid-capture position. `caps` reuses the caller's
		* already-generated capture list when available.
		*/
		function quiesce(pos, alpha, beta, qdepth, nodes, budget, caps) {
			nodes.n += 1;
			const stand = evaluate(pos);
			if (qdepth === 0 || nodes.n > budget) return stand;
			if (stand >= beta) return stand;
			if (stand > alpha) alpha = stand;
			let best = stand;
			const list = caps ?? legalMoves(pos).filter((m) => m.capture !== "" || m.promo !== "").sort((a, b) => moveScore(b) - moveScore(a));
			for (const m of list) {
				if (nodes.n > budget) break;
				const v = -quiesce(applyMove(pos, m), -beta, -alpha, qdepth - 1, nodes, budget);
				if (v > best) best = v;
				if (best > alpha) alpha = best;
				if (alpha >= beta) break;
			}
			return best;
		}
		/**
		* Negamax with alpha-beta; scores are from the side-to-move's perspective
		* (callers negate when unwinding). Mate scores are MATE minus ply so faster
		* mates win ties. Aborts (returns the static eval) once the node budget is hit.
		*/
		function negamax(pos, depth, alpha, beta, ply, nodes, budget) {
			nodes.n += 1;
			if (nodes.n > budget) return evaluate(pos);
			const moves = orderedLegal(pos);
			if (moves.length === 0) return inCheck(pos) ? -1e5 + ply : 0;
			if (insufficientMaterial(pos)) return 0;
			if (depth === 0) {
				const caps = moves.filter((m) => m.capture !== "" || m.promo !== "");
				return caps.length === 0 ? evaluate(pos) : quiesce(pos, alpha, beta, 2, nodes, budget, caps);
			}
			let best = -Infinity;
			let a = alpha;
			for (const m of moves) {
				const v = -negamax(applyMove(pos, m), depth - 1, -beta, -a, ply + 1, nodes, budget);
				if (v > best) best = v;
				if (best > a) a = best;
				if (a >= beta) break;
				if (nodes.n > budget) break;
			}
			return best;
		}
		/** Seeded PRNG (mulberry32): deterministic tie-breaking among equal-scored root moves. */
		function mulberry32$3(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 >>> 0;
				let t = a;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/**
		* Pick a move by iterative deepening to `maxDepth` under `budget` nodes.
		* Root moves each search a FULL window: a narrowed window would return
		* fail-soft bounds incomparable across siblings. Ties among equal-scored
		* root moves break via the seeded rng (deterministic per seed).
		*/
		function chooseMove(pos, maxDepth, budget = NODE_BUDGET, seed = 2654435769) {
			const moves = orderedLegal(pos);
			if (moves.length === 0) return {
				move: null,
				nodes: 0,
				depth: 0
			};
			const nodes = { n: 0 };
			const rng = mulberry32$3(seed);
			let best = [moves[0]];
			let bestScore = -Infinity;
			let completed = 0;
			for (let depth = 1; depth <= maxDepth; depth += 1) {
				const scored = [];
				let aborted = false;
				for (const m of moves) {
					const v = -negamax(applyMove(pos, m), depth - 1, -Infinity, Infinity, 1, nodes, budget);
					scored.push({
						move: m,
						score: v
					});
					if (nodes.n > budget) {
						aborted = true;
						break;
					}
				}
				if (scored.length > 0 && (!aborted || depth === 1)) {
					let top = -Infinity;
					for (const s of scored) if (s.score > top) top = s.score;
					best = scored.filter((s) => s.score === top).map((s) => s.move);
					bestScore = top;
					completed = depth;
				}
				if (aborted || Math.abs(bestScore) > 99e3) break;
			}
			return {
				move: best.length === 1 ? best[0] : best[Math.floor(rng() * best.length)],
				nodes: nodes.n,
				depth: completed
			};
		}
		//#endregion
		//#region src/client/games/chess/render.ts
		/**
		* Chess renderer: checkered 8x8 board, unicode pieces, selection + legal-move
		* highlights, last-move markers, check ring, promotion picker, HUD and
		* overlays. Uses the shared visual kit (../theme.ts).
		*/
		const MARGIN$2 = 20;
		const HUD_H$2 = 40;
		const CELL$1 = 52;
		const GLYPH = {
			K: "♔",
			Q: "♕",
			R: "♖",
			B: "♗",
			N: "♘",
			P: "♙",
			k: "♚",
			q: "♛",
			r: "♜",
			b: "♝",
			n: "♞",
			p: "♟"
		};
		function squareX(s) {
			return MARGIN$2 + fileOf(s) * CELL$1;
		}
		function squareY(s) {
			return 60 + (7 - rankOf(s)) * CELL$1;
		}
		/** 0x88 square under the pointer, or -1. */
		function squareAt(x, y) {
			if (x < MARGIN$2 || x >= 436 || y < 60 || y >= 476) return -1;
			const f = Math.floor((x - MARGIN$2) / CELL$1);
			return (7 - Math.floor((y - HUD_H$2 - MARGIN$2) / CELL$1)) * 16 + f;
		}
		const PROMO_PIECES = [
			"q",
			"r",
			"b",
			"n"
		];
		/** Promotion-picker button under the pointer, or null (picker at the top rank). */
		function promotionAt(x, y) {
			const w = 56;
			const h = 56;
			const x0 = 116;
			if (y < 248 - h / 2 || y >= 276) return null;
			const i = Math.floor((x - x0) / w);
			if (i < 0 || i >= 4) return null;
			return PROMO_PIECES[i];
		}
		function drawPromotionPicker(ctx, white) {
			const w = 56;
			const x0 = 116;
			ctx.fillStyle = "rgba(13,13,20,0.6)";
			ctx.fillRect(0, 0, 456, 496);
			for (let i = 0; i < 4; i += 1) {
				const x = x0 + i * w;
				roundRectPath(ctx, x + 4, 224, 48, 48, 8);
				ctx.fillStyle = THEME.panel;
				ctx.fill();
				ctx.strokeStyle = THEME.panelEdge;
				ctx.lineWidth = 1;
				ctx.stroke();
				const glyph = GLYPH[white ? PROMO_PIECES[i].toUpperCase() : PROMO_PIECES[i]];
				ctx.font = "38px system-ui, sans-serif";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillStyle = THEME.text;
				ctx.fillText(glyph, x + w / 2, 250);
			}
			ctx.textBaseline = "alphabetic";
		}
		function renderChess(ctx, view) {
			drawBackground(ctx, 456, 496);
			for (let r = 0; r < 8; r += 1) for (let f = 0; f < 8; f += 1) {
				const x = MARGIN$2 + f * CELL$1;
				const y = 60 + (7 - r) * CELL$1;
				ctx.fillStyle = (r + f) % 2 === 0 ? "#2b2b3a" : "#1b1b26";
				ctx.fillRect(x, y, CELL$1, CELL$1);
			}
			if (view.lastMove !== null) {
				ctx.fillStyle = "rgba(224,175,104,0.22)";
				ctx.fillRect(squareX(view.lastMove.from), squareY(view.lastMove.from), CELL$1, CELL$1);
				ctx.fillRect(squareX(view.lastMove.to), squareY(view.lastMove.to), CELL$1, CELL$1);
			}
			if (view.selected >= 0) {
				ctx.fillStyle = "rgba(122,162,247,0.28)";
				ctx.fillRect(squareX(view.selected), squareY(view.selected), CELL$1, CELL$1);
			}
			for (const t of view.targets) {
				const cx = squareX(t) + CELL$1 / 2;
				const cy = squareY(t) + CELL$1 / 2;
				if (view.pos.board[t] !== "") {
					ctx.strokeStyle = "rgba(159,206,106,0.9)";
					ctx.lineWidth = 4;
					ctx.strokeRect(squareX(t) + 2, squareY(t) + 2, 48, 48);
				} else {
					ctx.beginPath();
					ctx.arc(cx, cy, 8, 0, Math.PI * 2);
					ctx.fillStyle = "rgba(159,206,106,0.75)";
					ctx.fill();
				}
			}
			if (view.checkSquare >= 0) {
				glow(ctx, THEME.bad, 14);
				ctx.strokeStyle = THEME.bad;
				ctx.lineWidth = 3;
				ctx.beginPath();
				ctx.arc(squareX(view.checkSquare) + CELL$1 / 2, squareY(view.checkSquare) + CELL$1 / 2, CELL$1 * .44, 0, Math.PI * 2);
				ctx.stroke();
				noGlow(ctx);
			}
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			for (let s = 0; s < 128; s += 1) {
				if (!onBoard(s)) continue;
				const p = view.pos.board[s];
				if (p === "") continue;
				const cx = squareX(s) + CELL$1 / 2;
				const cy = squareY(s) + CELL$1 / 2 + 2;
				ctx.font = "38px \"Segoe UI Symbol\", system-ui, sans-serif";
				if (colorOf(p) === "w") {
					ctx.fillStyle = "#f2f2f8";
					glow(ctx, "rgba(242,242,248,0.5)", 6);
					ctx.fillText(GLYPH[p], cx, cy);
					noGlow(ctx);
				} else {
					ctx.lineWidth = 2.5;
					ctx.lineJoin = "round";
					ctx.strokeStyle = "rgba(235,235,245,0.92)";
					ctx.strokeText(GLYPH[p], cx, cy);
					ctx.fillStyle = "#101018";
					ctx.fillText(GLYPH[p], cx, cy);
				}
			}
			ctx.textBaseline = "alphabetic";
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			for (let f = 0; f < 8; f += 1) {
				ctx.textAlign = "center";
				ctx.fillText(String.fromCharCode(97 + f), MARGIN$2 + f * CELL$1 + CELL$1 / 2, 489);
			}
			for (let r = 0; r < 8; r += 1) {
				ctx.textAlign = "left";
				ctx.fillText(String(r + 1), 7, 60 + (7 - r) * CELL$1 + CELL$1 / 2 + 4);
			}
			hudPair(ctx, 436, 22, `${view.levelLabel} `, view.thinking ? "思考中…" : "你执白棋", "right", THEME.gold);
			if (view.promotion !== null) drawPromotionPicker(ctx, view.promotion.white);
			else if (view.statusText !== null) drawOverlay(ctx, 456, 496, view.statusText, view.statusSub, view.statusColor);
			if (view.paused) drawOverlay(ctx, 456, 496, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/chess/index.ts
		const AI_DELAY_MS = 400;
		const ADVANCE_MS$1 = 1600;
		const GAME_ID$2 = "chess";
		function createChessGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 456, 496);
			if (fit === null) throw new Error("dsh-minigames: chess needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = Math.min(Math.max(readLevel(GAME_ID$2), 1), LEVEL_DEPTH.length);
			let pos = createStartPosition();
			let selected = -1;
			let targets = /* @__PURE__ */ new Set();
			let lastMove = null;
			let over = { kind: "playing" };
			/** positionKey → occurrence count (this game only). */
			const repetitions = /* @__PURE__ */ new Map();
			let promotion = null;
			let running = false;
			let thinking = false;
			let aiAt = 0;
			let ply = 0;
			let lastScore = -1;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			const particles = createParticles();
			const depth = () => LEVEL_DEPTH[level - 1];
			const checkSquare = () => {
				if (!inCheck(pos)) return -1;
				return findKing(pos.board, pos.turn);
			};
			const overlayFor = () => {
				if (over.kind === "playing") return null;
				if (over.kind === "checkmate" && over.winner === "w") return {
					text: "将杀！你赢了",
					sub: `即将进入第 ${Math.min(level + 1, LEVEL_DEPTH.length)} 关 · R 重开`,
					color: THEME.good
				};
				if (over.kind === "checkmate") return {
					text: "你被将杀",
					sub: "同一关再来 · R 重开",
					color: THEME.bad
				};
				if (over.kind === "stalemate") return {
					text: "逼和",
					sub: "平局重玩本关 · R 重开",
					color: THEME.text
				};
				return {
					text: "和棋",
					sub: "平局重玩本关 · R 重开",
					color: THEME.text
				};
			};
			const reportScore = () => {
				if (over.kind !== "checkmate" || over.winner !== "w") return;
				if (level === lastScore) return;
				lastScore = level;
				options?.onScore?.(level);
			};
			const restart = () => {
				clearTimeout(advanceTimer);
				advanceTimer = 0;
				advanceRemaining = 0;
				pos = createStartPosition();
				selected = -1;
				targets = /* @__PURE__ */ new Set();
				lastMove = null;
				over = { kind: "playing" };
				repetitions.clear();
				repetitions.set(positionKey(pos), 1);
				promotion = null;
				thinking = false;
				aiAt = 0;
				ply = 0;
				loop.markDirty();
			};
			/** Apply a move, update repetition counts and the game status. */
			const play = (m) => {
				pos = applyMove(pos, m);
				lastMove = m;
				selected = -1;
				targets = /* @__PURE__ */ new Set();
				ply += 1;
				const key = positionKey(pos);
				repetitions.set(key, (repetitions.get(key) ?? 0) + 1);
				over = status(pos, repetitions.get(key));
				if (over.kind === "checkmate" && over.winner === "w") {
					particles.burst(342, 248, THEME.gold, 18, 160);
					reportScore();
					saveLevel(GAME_ID$2, Math.min(level + 1, LEVEL_DEPTH.length));
					if (running) scheduleAdvance();
					else advanceRemaining = ADVANCE_MS$1;
				}
				loop.markDirty();
			};
			const scheduleAdvance = () => {
				advanceAt = performance.now() + ADVANCE_MS$1;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					if (level < LEVEL_DEPTH.length) level += 1;
					restart();
				}, ADVANCE_MS$1);
			};
			const aiMove = () => {
				thinking = true;
				const res = chooseMove(pos, depth(), NODE_BUDGET, 1372454912 + level * 977 + ply);
				thinking = false;
				if (res.move === null) {
					over = status(pos, repetitions.get(positionKey(pos)) ?? 1);
					return;
				}
				play(res.move);
			};
			const tryPlayerMove = (from, to) => {
				const matches = legalMoves(pos).filter((m) => m.from === from && m.to === to);
				if (matches.length === 0) return false;
				if (matches.length > 1 && matches[0].promo !== "") {
					promotion = {
						from,
						to,
						white: true
					};
					loop.markDirty();
					return true;
				}
				play(matches[0]);
				return true;
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * 456 / rect.width;
				const y = (event.clientY - rect.top) * 496 / rect.height;
				if (promotion !== null) {
					const pick = promotionAt(x, y);
					if (pick !== null) {
						const m = legalMoves(pos).find((mm) => mm.from === promotion.from && mm.to === promotion.to && mm.promo === pick);
						promotion = null;
						if (m !== void 0) play(m);
					} else {
						promotion = null;
						loop.markDirty();
					}
					return;
				}
				if (over.kind !== "playing" || aiAt > 0) return;
				const s = squareAt(x, y);
				if (s < 0) return;
				const p = pos.board[s];
				if (selected >= 0 && targets.has(s)) {
					tryPlayerMove(selected, s);
					if (over.kind === "playing") aiAt = performance.now() + AI_DELAY_MS;
					return;
				}
				if (p !== "" && colorOf(p) === "w") {
					selected = s;
					targets = new Set(legalMoves(pos).filter((m) => m.from === s).map((m) => m.to));
				} else {
					selected = -1;
					targets = /* @__PURE__ */ new Set();
				}
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					restart();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (f) => {
				if (!running) return;
				const now = performance.now();
				if (over.kind === "playing" && aiAt > 0 && now >= aiAt) {
					aiAt = 0;
					aiMove();
				}
				if (!f.render && particles.size() === 0) return;
				const overlay = overlayFor();
				const view = {
					pos,
					selected,
					targets,
					lastMove,
					checkSquare: checkSquare(),
					levelLabel: `L${level}·深度${depth()}`,
					statusText: overlay?.text ?? null,
					statusSub: overlay?.sub ?? "",
					statusColor: overlay?.color ?? THEME.text,
					paused: false,
					promotion,
					thinking
				};
				renderChess(ctx, view);
				particles.tick(ctx, f.dt * 1e3);
			};
			const loop = createFrameLoop(frame, { mode: "dirty" });
			const pause = () => {
				if (!running) return;
				running = false;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderPausedFrame();
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					advanceAt = performance.now() + advanceRemaining;
					advanceTimer = window.setTimeout(() => {
						advanceTimer = 0;
						advanceRemaining = 0;
						if (level < LEVEL_DEPTH.length) level += 1;
						restart();
					}, advanceRemaining);
					advanceRemaining = 0;
				}
				loop.start();
				loop.markDirty();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			/** Final paused frame (matches the lightsout pause pattern). */
			const renderPausedFrame = () => {
				const overlay = overlayFor();
				const view = {
					pos,
					selected,
					targets,
					lastMove,
					checkSquare: checkSquare(),
					levelLabel: `L${level}·深度${depth()}`,
					statusText: overlay?.text ?? null,
					statusSub: overlay?.sub ?? "",
					statusColor: overlay?.color ?? THEME.text,
					paused: true,
					promotion,
					thinking
				};
				renderChess(ctx, view);
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			repetitions.set(positionKey(pos), 1);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					fit.dispose();
					canvas.removeEventListener("mousedown", onMouseDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const chessGame = {
			id: "chess",
			title: "国际象棋",
			icon: "♞",
			description: "执白对弈 α-β 剪枝搜索的 AI：四档棋力（深度 2→5），支持王车易位、吃过路兵、升变与三次重复判和。",
			controls: [
				"点击棋子再点目标格：走子",
				"升变时点击选择新棋子",
				"R：重开本局",
				"P：暂停"
			],
			create: createChessGame
		};
		/** Baseline substep rate (dt ≤ 1/240 at rest; speed adds more substeps). */
		const BASE_SUBSTEP_DT = 1 / 240;
		/** Max ball travel per substep (fraction of the radius) — anti-tunneling. */
		const MAX_SUBSTEP_TRAVEL = 4.5;
		/** Absolute speed clamp (also bounds the substep count). */
		const MAX_SPEED = 2400;
		/** Wall / slant restitution. */
		const WALL_E = .55;
		/** Bumper: restitution, min outward kick px/s, score, re-trigger cooldown. */
		const BUMPER_E = 1.4;
		const BUMPER_COOLDOWN = .12;
		const SLING_COOLDOWN = .2;
		/** Flippers: pivot capsule radius, swing speed, spring return speed. */
		const FLIPPER_R = 8.5;
		const FLIPPER_SURFACE_FACTOR = .45;
		/** Plunger: charge time to full, launch speed range px/s. */
		const PLUNGER_CHARGE_S = 1.4;
		/** Score needed to advance from level l (cumulative within one game). */
		function levelThreshold$1(level) {
			return 2e3 * level;
		}
		const TRAP_CLEAR = .35;
		/** While sated the bumper only nudges the ball out (no kick, no score). */
		const SATED_E = .45;
		/** mulberry32 seeded PRNG (identical to the other games' rng). */
		function mulberry32$2(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Left flipper pivot (bottom-left of the playfield, just past the outlane). */
		const LEFT_PIVOT = {
			x: 146,
			y: 612
		};
		const RIGHT_PIVOT = {
			x: 274,
			y: 612
		};
		/** Flipper rest droop and raised angle magnitudes (rad from horizontal). */
		const FLIPPER_DROOP = .55;
		const FLIPPER_LIFT = .6;
		function makeFlipper(side) {
			if (side === "left") return {
				side,
				px: LEFT_PIVOT.x,
				py: LEFT_PIVOT.y,
				len: 68,
				angle: FLIPPER_DROOP,
				rest: FLIPPER_DROOP,
				active: -.6,
				held: false,
				omega: 0
			};
			return {
				side,
				px: RIGHT_PIVOT.x,
				py: RIGHT_PIVOT.y,
				len: 68,
				angle: Math.PI - FLIPPER_DROOP,
				rest: Math.PI - FLIPPER_DROOP,
				active: Math.PI + FLIPPER_LIFT,
				held: false,
				omega: 0
			};
		}
		/** Tip of a flipper at its current angle. */
		function flipperTip(f) {
			return {
				x: f.px + Math.cos(f.angle) * f.len,
				y: f.py + Math.sin(f.angle) * f.len
			};
		}
		/** The three seeded bumper layouts; level N uses preset (N-1) % 3. */
		const BUMPER_PRESETS = [
			[
				{
					x: 140,
					y: 200
				},
				{
					x: 280,
					y: 200
				},
				{
					x: 210,
					y: 290
				}
			],
			[
				{
					x: 120,
					y: 250
				},
				{
					x: 300,
					y: 250
				},
				{
					x: 210,
					y: 150
				}
			],
			[
				{
					x: 150,
					y: 140
				},
				{
					x: 270,
					y: 240
				},
				{
					x: 200,
					y: 320
				}
			]
		];
		function makeBumpers(level) {
			return BUMPER_PRESETS[(level - 1) % BUMPER_PRESETS.length].map((p) => ({
				x: p.x,
				y: p.y,
				r: 16,
				cd: 0,
				trapHits: 0,
				trapT: 0,
				sated: false,
				clearT: TRAP_CLEAR
			}));
		}
		/** Slingshot active faces (the angled kickers above each flipper). */
		function makeSlings() {
			return [{
				ax: 86,
				ay: 534,
				bx: 114,
				by: 566,
				cd: 0
			}, {
				ax: 334,
				ay: 534,
				bx: 306,
				by: 566,
				cd: 0
			}];
		}
		/** Drop-target bank: three horizontal plates under the bumpers. */
		function makeTargets() {
			return [
				172,
				210,
				248
			].map((cx) => ({
				x1: cx - 13,
				y1: 430,
				x2: cx + 13,
				y2: 430,
				down: false
			}));
		}
		/** Static wall polyline list: outer box, launch lane, and the bottom slants. */
		function makeWalls() {
			return [
				{
					ax: 64,
					ay: 60,
					bx: 356,
					by: 60
				},
				{
					ax: 12,
					ay: 150,
					bx: 64,
					by: 60
				},
				{
					ax: 12,
					ay: 500,
					bx: 12,
					by: 150
				},
				{
					ax: 356,
					ay: 60,
					bx: 408,
					by: 150
				},
				{
					ax: 408,
					ay: 650,
					bx: 408,
					by: 150
				},
				{
					ax: 378,
					ay: 640,
					bx: 378,
					by: 260
				},
				{
					ax: 378,
					ay: 645,
					bx: 408,
					by: 645
				},
				{
					ax: 12,
					ay: 500,
					bx: 128,
					by: 598
				},
				{
					ax: 378,
					ay: 500,
					bx: 292,
					by: 598
				}
			];
		}
		/** Ball spawn: resting on the launch-lane floor. */
		const BALL_SPAWN = {
			x: 393,
			y: 636
		};
		/** True while the ball sits at the launch-lane bottom (plunger may fire). */
		function ballInLaunchZone(ball) {
			return ball.x > 378 && ball.x < 408 && ball.y > 600;
		}
		/** Fresh state: one game at `level` with the preset rack and a live ball. */
		function createGame(level, seed) {
			return {
				result: "playing",
				pausedFrom: null,
				level,
				score: 0,
				ballsLeft: 3,
				ball: {
					x: BALL_SPAWN.x,
					y: BALL_SPAWN.y,
					vx: 0,
					vy: 0
				},
				flippers: {
					left: makeFlipper("left"),
					right: makeFlipper("right")
				},
				bumpers: makeBumpers(level),
				slings: makeSlings(),
				targets: makeTargets(),
				walls: makeWalls(),
				plunger: 0,
				plungerHeld: false,
				nudges: [],
				tiltTimer: 0,
				stuckT: 0,
				stuckKicks: 0,
				time: 0,
				msg: `第 ${level} 关 · ${levelThreshold$1(level)} 分升级`,
				msgTimer: 2.5,
				events: [],
				rng: mulberry32$2(seed >>> 0 || 1)
			};
		}
		/** Restart the table: same level and preset, zeroed score and balls. */
		function restart(state) {
			Object.assign(state, createGame(state.level, 1));
		}
		/**
		* Closest point on segment (a→b) to p, with the squared distance.
		* @returns the closest point and d² (pure geometry).
		*/
		function closestPointOnSegment(px, py, ax, ay, bx, by) {
			const abx = bx - ax;
			const aby = by - ay;
			const len2 = abx * abx + aby * aby;
			let t = len2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / len2;
			t = Math.min(1, Math.max(0, t));
			const cx = ax + abx * t;
			const cy = ay + aby * t;
			return {
				x: cx,
				y: cy,
				d2: (px - cx) * (px - cx) + (py - cy) * (py - cy)
			};
		}
		/**
		* Circle-vs-segment collision against a static surface: push the ball out
		* along the contact normal and reflect the normal velocity with restitution
		* `e`. Surfaces with `minKick > 0` (bumpers/slingshots) always leave at least
		* that much outward speed; plain walls settle below {@link REST_SPEED}.
		* @param ball - the ball (mutated on contact).
		* @param r - ball radius.
		* @param e - restitution.
		* @param minKick - minimum outward normal speed after the bounce (0 = none).
		* @param cx - closest point on the segment.
		* @param cy - its y coordinate.
		* @returns true when a contact was resolved.
		*/
		function bounceOffPoint(ball, r, e, minKick, cx, cy) {
			let nx = ball.x - cx;
			let ny = ball.y - cy;
			const d2 = nx * nx + ny * ny;
			if (d2 >= r * r) return false;
			const d = Math.sqrt(d2);
			if (d < 1e-6) {
				nx = 0;
				ny = -1;
			} else {
				nx /= d;
				ny /= d;
			}
			ball.x = cx + nx * r;
			ball.y = cy + ny * r;
			const vn = ball.vx * nx + ball.vy * ny;
			if (vn < 0) {
				let out;
				if (minKick > 0) out = Math.max(-e * vn, minKick);
				else if (-vn < 40) out = 0;
				else out = -e * vn;
				ball.vx += (out - vn) * nx;
				ball.vy += (out - vn) * ny;
			}
			return true;
		}
		/** Ball vs one wall segment (restitution {@link WALL_E}). */
		function collideWall(ball, w) {
			const cp = closestPointOnSegment(ball.x, ball.y, w.ax, w.ay, w.bx, w.by);
			return bounceOffPoint(ball, 9, WALL_E, 0, cp.x, cp.y);
		}
		/** True while the flipper responds to input (tilt penalty disables them). */
		function flippersEnabled(state) {
			return state.tiltTimer <= 0;
		}
		/**
		* Ball vs flipper capsule (segment pivot→tip with radius {@link FLIPPER_R}).
		* The contact point's surface velocity ω×r participates in the bounce: the
		* normal relative velocity is reflected with restitution, then a fraction of
		* the surface velocity along the normal is added — a rising flipper throws
		* the ball up.
		* @param ball - the ball (mutated on contact).
		* @param f - the flipper at its current angle and omega.
		* @returns true when a contact was resolved.
		*/
		function resolveFlipper(ball, f) {
			const tip = flipperTip(f);
			const cp = closestPointOnSegment(ball.x, ball.y, f.px, f.py, tip.x, tip.y);
			const minD = 17.5;
			let nx = ball.x - cp.x;
			let ny = ball.y - cp.y;
			const d2 = nx * nx + ny * ny;
			if (d2 >= minD * minD) return false;
			const d = Math.sqrt(d2);
			if (d < 1e-6) {
				nx = 0;
				ny = -1;
			} else {
				nx /= d;
				ny /= d;
			}
			ball.x = cp.x + nx * minD;
			ball.y = cp.y + ny * minD;
			const rx = cp.x - f.px;
			const ry = cp.y - f.py;
			const svx = f.omega * -ry;
			const svy = f.omega * rx;
			const svn = svx * nx + svy * ny;
			const vn = ball.vx * nx + ball.vy * ny;
			const vrel = vn - svn;
			if (vrel < 0) {
				let out;
				if (-vrel < 40 && Math.abs(f.omega) < .5) out = 0;
				else out = -.4 * vrel + Math.max(0, svn) * FLIPPER_SURFACE_FACTOR;
				ball.vx += (out - vn) * nx;
				ball.vy += (out - vn) * ny;
			}
			return true;
		}
		/**
		* Advance one flipper by h seconds: swing to the active angle while held
		* (and not tilted) at {@link FLIPPER_OMEGA}, spring back at
		* {@link FLIPPER_RETURN}; records the effective angular velocity.
		*/
		function stepFlipper(f, held, h) {
			const prev = f.angle;
			if (f.side === "left") {
				if (held) f.angle = Math.max(f.angle - 18 * h, f.active);
				else f.angle = Math.min(f.angle + 12 * h, f.rest);
			} else if (held) f.angle = Math.min(f.angle + 18 * h, f.active);
			else f.angle = Math.max(f.angle - 12 * h, f.rest);
			f.omega = h > 0 ? (f.angle - prev) / h : 0;
		}
		/** Advance the whole simulation by dt seconds (adaptive fixed substeps). */
		function step$1(state, dt) {
			if (state.result !== "playing") return;
			state.events = [];
			state.time += dt;
			if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt);
			if (state.tiltTimer > 0) state.tiltTimer = Math.max(0, state.tiltTimer - dt);
			if (state.plungerHeld) state.plunger = Math.min(1, state.plunger + dt / PLUNGER_CHARGE_S);
			const speed = Math.hypot(state.ball.vx, state.ball.vy);
			const n = Math.min(96, Math.max(1, Math.ceil(dt / BASE_SUBSTEP_DT), Math.ceil(dt * speed / MAX_SUBSTEP_TRAVEL)));
			const h = dt / n;
			const damp = Math.exp(-.12 * h);
			for (let i = 0; i < n; i += 1) {
				const enabled = flippersEnabled(state);
				stepFlipper(state.flippers.left, enabled && state.flippers.left.held, h);
				stepFlipper(state.flippers.right, enabled && state.flippers.right.held, h);
				for (const b of state.bumpers) if (b.cd > 0) b.cd = Math.max(0, b.cd - h);
				for (const s of state.slings) if (s.cd > 0) s.cd = Math.max(0, s.cd - h);
				const ball = state.ball;
				ball.vy += 980 * h;
				ball.x += ball.vx * h;
				ball.y += ball.vy * h;
				for (const w of state.walls) collideWall(ball, w);
				for (const b of state.bumpers) {
					b.trapT += h;
					if (b.trapT >= 1) {
						b.trapT = 0;
						b.trapHits = 0;
					}
					const nearR = 9 + b.r + 8;
					const dxw = ball.x - b.x;
					const dyw = ball.y - b.y;
					if (dxw * dxw + dyw * dyw < nearR * nearR) b.clearT = 0;
					else {
						b.clearT += h;
						if (b.sated && b.clearT >= .35) {
							b.sated = false;
							b.trapHits = 0;
							b.trapT = 0;
						}
					}
					const cp = {
						x: b.x,
						y: b.y
					};
					const dx = ball.x - b.x;
					const dy = ball.y - b.y;
					if (dx * dx + dy * dy >= (9 + b.r) * (9 + b.r)) continue;
					if (b.sated) {
						bounceOffPoint(ball, 9 + b.r, SATED_E, 0, cp.x, cp.y);
						continue;
					}
					if (b.cd <= 0) {
						b.cd = BUMPER_COOLDOWN;
						bounceOffPoint(ball, 9 + b.r, BUMPER_E, 260, cp.x, cp.y);
						state.score += 150;
						state.events.push({
							kind: "bumper",
							x: b.x,
							y: b.y
						});
						b.trapHits += 1;
						if (b.trapHits >= 3) {
							b.trapHits = 0;
							b.sated = true;
							b.clearT = 0;
						}
					} else bounceOffPoint(ball, 9 + b.r, 0, 0, cp.x, cp.y);
				}
				for (const s of state.slings) {
					const cp = closestPointOnSegment(ball.x, ball.y, s.ax, s.ay, s.bx, s.by);
					if (cp.d2 >= 81) continue;
					if (s.cd <= 0) {
						s.cd = SLING_COOLDOWN;
						bounceOffPoint(ball, 9, 2, 380, cp.x, cp.y);
						state.score += 75;
						state.events.push({
							kind: "sling",
							x: (s.ax + s.bx) / 2,
							y: (s.ay + s.by) / 2
						});
					} else bounceOffPoint(ball, 9, 0, 0, cp.x, cp.y);
				}
				for (const t of state.targets) {
					if (t.down) continue;
					const cp = closestPointOnSegment(ball.x, ball.y, t.x1, t.y1, t.x2, t.y2);
					if (cp.d2 >= 81) continue;
					if (bounceOffPoint(ball, 9, .55, 0, cp.x, cp.y)) {
						t.down = true;
						state.score += 50;
						state.events.push({
							kind: "target",
							x: (t.x1 + t.x2) / 2,
							y: t.y1
						});
						if (state.targets.every((dt2) => dt2.down)) {
							state.score += 500;
							state.msg = `击落全部目标 +500`;
							state.msgTimer = 2;
							state.events.push({
								kind: "bank",
								x: 210,
								y: 430
							});
							for (const dt2 of state.targets) dt2.down = false;
						}
					}
				}
				resolveFlipper(ball, state.flippers.left);
				resolveFlipper(ball, state.flippers.right);
				ball.vx *= damp;
				ball.vy *= damp;
				const sp = Math.hypot(ball.vx, ball.vy);
				if (sp > 2400) {
					ball.vx *= MAX_SPEED / sp;
					ball.vy *= MAX_SPEED / sp;
				}
				if (ball.y > 710) {
					loseBall(state);
					break;
				}
			}
			while (state.result === "playing" && state.score >= levelThreshold$1(state.level)) {
				state.level += 1;
				state.bumpers = makeBumpers(state.level);
				state.msg = `升级！第 ${state.level} 关`;
				state.msgTimer = 2;
				state.events.push({
					kind: "levelUp",
					level: state.level
				});
			}
			if (state.result === "playing" && !ballInLaunchZone(state.ball) && !state.plungerHeld) {
				const sp = Math.hypot(state.ball.vx, state.ball.vy);
				if (sp <= 60) {
					state.stuckT += dt;
					if (state.stuckT >= 1.5) {
						state.stuckT = 0;
						state.stuckKicks += 1;
						if (state.stuckKicks > 3) {
							state.stuckKicks = 0;
							loseBall(state);
						} else {
							const angle = -Math.PI / 2 + (state.rng() - .5) * 1.2;
							state.ball.vx += Math.cos(angle) * 320;
							state.ball.vy += Math.sin(angle) * 320;
							state.events.push({
								kind: "bumper",
								x: state.ball.x,
								y: state.ball.y
							});
						}
					}
				} else {
					state.stuckT = 0;
					if (sp > 160) state.stuckKicks = 0;
				}
			} else state.stuckT = 0;
		}
		/** Ball drained: consume a ball, respawn in the lane or end the game. */
		function loseBall(state) {
			state.ballsLeft -= 1;
			state.events.push({ kind: "drain" });
			if (state.ballsLeft <= 0) {
				state.result = "gameOver";
				state.msg = "游戏结束";
				state.msgTimer = 3;
				return;
			}
			state.ball.x = BALL_SPAWN.x;
			state.ball.y = BALL_SPAWN.y;
			state.ball.vx = 0;
			state.ball.vy = 0;
			state.plunger = 0;
			state.stuckT = 0;
			state.stuckKicks = 0;
			state.msg = `损失一球 · 剩 ${state.ballsLeft} 球`;
			state.msgTimer = 2;
		}
		/** Hold or release a flipper (ignored while tilted — flippers are dead then). */
		function setFlipper(state, side, held) {
			state.flippers[side].held = held;
		}
		/**
		* Nudge the table: a tiny seeded-random impulse. Three nudges inside
		* {@link NUDGE_WINDOW} seconds tilt the machine for {@link TILT_SECONDS}.
		* @returns true when the nudge applied.
		*/
		function nudge(state) {
			if (state.result !== "playing") return false;
			const r = state.rng();
			const r2 = state.rng();
			state.ball.vx += (r - .5) * 130;
			state.ball.vy -= 50 + r2 * 50;
			state.nudges.push(state.time);
			state.nudges = state.nudges.filter((t) => state.time - t <= 5);
			if (state.nudges.length >= 3) {
				state.tiltTimer = 2;
				state.nudges = [];
				state.msg = "TILT！挡板暂时失灵";
				state.msgTimer = 2;
				state.events.push({ kind: "tilt" });
			}
			return true;
		}
		/**
		* Release the plunger: fire the lane ball upward with speed proportional to
		* the clamped charge. No-op (charge discarded) when the ball is elsewhere.
		* @returns the launch speed, or 0 when nothing fired.
		*/
		function plungerRelease(state) {
			const p = Math.min(1, Math.max(0, state.plunger));
			state.plunger = 0;
			state.plungerHeld = false;
			if (state.result !== "playing" || !ballInLaunchZone(state.ball)) return 0;
			const speed = 650 + p * 800;
			state.ball.vx = 0;
			state.ball.vy = -speed;
			state.events.push({
				kind: "launch",
				speed
			});
			return speed;
		}
		/** Toggle pause; remembers the result to restore (stored-remainder pattern). */
		function togglePause$1(state) {
			if (state.result === "paused") {
				state.result = state.pausedFrom ?? "playing";
				state.pausedFrom = null;
			} else if (state.result === "playing" || state.result === "gameOver") {
				state.pausedFrom = state.result;
				state.result = "paused";
			}
		}
		//#endregion
		//#region src/client/games/pinball/render.ts
		/**
		* 弹球台 renderer: pure canvas drawing of the pinball state — walls, launch
		* lane, glowing bumpers, slingshot triangles, drop targets, capsule flippers,
		* the ball, plunger charge bar, HUD, and pause/game-over overlays. No state
		* beyond what logic.ts owns; every function here is a pure paint.
		*/
		const LOGICAL_W$1 = 420;
		const LOGICAL_H$1 = 680;
		/** One static wall segment drawn as a rounded neon strut. */
		function drawWalls(ctx, state) {
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 6;
			ctx.lineCap = "round";
			ctx.beginPath();
			for (const w of state.walls) {
				ctx.moveTo(w.ax, w.ay);
				ctx.lineTo(w.bx, w.by);
			}
			ctx.stroke();
		}
		/** Bumpers: glowing discs that flash while on cooldown (recently hit). */
		function drawBumpers(ctx, state) {
			for (let i = 0; i < state.bumpers.length; i += 1) {
				const b = state.bumpers[i];
				const color = accent(i + 2);
				const hot = b.cd > 0;
				ctx.fillStyle = hot ? color : THEME.panel;
				glow(ctx, color, hot ? 18 : 9);
				ctx.beginPath();
				ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
				ctx.fill();
				noGlow(ctx);
				ctx.strokeStyle = color;
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
				ctx.stroke();
				ctx.fillStyle = hot ? THEME.text : color;
				ctx.font = "bold 11px system-ui, sans-serif";
				ctx.textAlign = "center";
				ctx.fillText("150", b.x, b.y + 4);
			}
		}
		/** Slingshots: filled triangles with a bright active face. */
		function drawSlings(ctx, state) {
			for (let i = 0; i < state.slings.length; i += 1) {
				const s = state.slings[i];
				const color = accent(i + 5);
				const hot = s.cd > 0;
				const mx = (s.ax + s.bx) / 2;
				const my = (s.ay + s.by) / 2;
				const back = i === 0 ? {
					x: mx - 16,
					y: my + 8
				} : {
					x: mx + 16,
					y: my + 8
				};
				ctx.fillStyle = hot ? color : THEME.panel;
				glow(ctx, color, hot ? 16 : 7);
				ctx.beginPath();
				ctx.moveTo(s.ax, s.ay);
				ctx.lineTo(s.bx, s.by);
				ctx.lineTo(back.x, back.y);
				ctx.closePath();
				ctx.fill();
				noGlow(ctx);
				ctx.strokeStyle = color;
				ctx.lineWidth = 2.5;
				ctx.lineCap = "round";
				ctx.beginPath();
				ctx.moveTo(s.ax, s.ay);
				ctx.lineTo(s.bx, s.by);
				ctx.stroke();
			}
		}
		/** Drop targets: bright plates that dim and sink when down. */
		function drawTargets(ctx, state) {
			for (const t of state.targets) {
				const cx = (t.x1 + t.x2) / 2;
				const w = t.x2 - t.x1;
				const h = t.down ? 4 : 9;
				const y = t.y1 - h;
				ctx.fillStyle = t.down ? THEME.panelEdge : THEME.gold;
				glow(ctx, THEME.gold, t.down ? 0 : 8);
				roundRectPath(ctx, cx - w / 2, y, w, h, 2);
				ctx.fill();
				noGlow(ctx);
			}
		}
		/** Flippers: thick capsule strokes pivoting around their base. */
		function drawFlippers(ctx, state) {
			for (const f of [state.flippers.left, state.flippers.right]) {
				const tip = flipperTip(f);
				const dead = state.tiltTimer > 0;
				const color = dead ? THEME.bad : THEME.accents[0];
				ctx.strokeStyle = THEME.panel;
				ctx.lineWidth = FLIPPER_R * 2;
				ctx.lineCap = "round";
				ctx.beginPath();
				ctx.moveTo(f.px, f.py);
				ctx.lineTo(tip.x, tip.y);
				ctx.stroke();
				ctx.strokeStyle = color;
				ctx.lineWidth = FLIPPER_R * 2 - 4;
				glow(ctx, color, f.held && !dead ? 12 : 4);
				ctx.beginPath();
				ctx.moveTo(f.px, f.py);
				ctx.lineTo(tip.x, tip.y);
				ctx.stroke();
				noGlow(ctx);
			}
		}
		/** Plunger: charge bar in the lane plus a compressed-spring look. */
		function drawPlunger(ctx, state) {
			if (state.plunger <= 0) return;
			const y0 = 645;
			const hgt = 60 * state.plunger;
			ctx.fillStyle = accent(3);
			glow(ctx, accent(3), 8);
			roundRectPath(ctx, 409, y0 - hgt, 6, hgt, 3);
			ctx.fill();
			noGlow(ctx);
		}
		/** HUD strip at the top: score, balls, level + threshold, best. */
		function drawHud$1(ctx, o) {
			const s = o.state;
			hudPair(ctx, 12, 22, "分数", String(Math.floor(s.score)));
			ctx.textAlign = "center";
			ctx.font = "600 13px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText(`🎯 × ${s.ballsLeft}`, 210, 22);
			ctx.textAlign = "right";
			ctx.font = "600 13px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText(`第 ${s.level} 关 · ${levelThreshold$1(s.level)} 分升级 · 最佳 ${o.best}`, 408, 22);
		}
		/** The whole frame: background, table, actors, HUD, message, overlays. */
		function renderPinball(ctx, o) {
			const s = o.state;
			drawBackground(ctx, LOGICAL_W$1, LOGICAL_H$1);
			drawWalls(ctx, s);
			drawBumpers(ctx, s);
			drawSlings(ctx, s);
			drawTargets(ctx, s);
			drawFlippers(ctx, s);
			drawPlunger(ctx, s);
			const inLane = ballInLaunchZone(s.ball);
			glow(ctx, "#ffffff", 12);
			ctx.fillStyle = "#f8f8ff";
			ctx.beginPath();
			ctx.arc(s.ball.x, s.ball.y, 9, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			if (inLane && s.plungerHeld) {
				ctx.fillStyle = "rgba(122,162,247,0.10)";
				ctx.fillRect(378, 260, 30, 385);
			}
			drawHud$1(ctx, o);
			if (s.tiltTimer > 0) {
				ctx.textAlign = "center";
				ctx.font = "bold 22px system-ui, sans-serif";
				ctx.fillStyle = THEME.bad;
				glow(ctx, THEME.bad, 14);
				ctx.fillText("TILT", 210, 120);
				noGlow(ctx);
			}
			if (s.msgTimer > 0 && s.msg !== "") {
				ctx.textAlign = "center";
				ctx.font = "600 14px system-ui, sans-serif";
				ctx.fillStyle = THEME.text;
				ctx.globalAlpha = Math.min(1, s.msgTimer);
				ctx.fillText(s.msg, 210, 96);
				ctx.globalAlpha = 1;
			}
			if (s.result === "gameOver") drawOverlay(ctx, LOGICAL_W$1, LOGICAL_H$1, "游戏结束", `${Math.floor(s.score)} 分 · 按 R 重开`, THEME.bad);
			else if (o.paused) drawOverlay(ctx, LOGICAL_W$1, LOGICAL_H$1, "已暂停", "按 P 或空格继续");
		}
		//#endregion
		//#region src/client/games/pinball/index.ts
		const GAME_ID$1 = "pinball";
		const BEST_KEY = "dsh-minigames:best:pinball";
		/** A fresh launch must clear this much charge (taps should not fire hard). */
		const MIN_LAUNCH_POWER = .08;
		function loadBest() {
			try {
				const v = Number(window.localStorage.getItem(BEST_KEY));
				return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
			} catch {
				return 0;
			}
		}
		function saveBest(v) {
			try {
				window.localStorage.setItem(BEST_KEY, String(Math.floor(v)));
			} catch {}
		}
		function createPinballGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$1, LOGICAL_H$1);
			if (fit === null) throw new Error("dsh-minigames: pinball needs a 2d canvas context");
			const ctx = fit.ctx;
			const runSeed = (Date.now() ^ 9557425) >>> 0;
			let state = createGame(readLevel(GAME_ID$1), runSeed);
			let running = false;
			let best = loadBest();
			let lastScore = -1;
			const particles = createParticles();
			const reportScore = () => {
				const s = Math.floor(state.score);
				if (s === lastScore) return;
				lastScore = s;
				options?.onScore?.(s);
				if (s > best) {
					best = s;
					saveBest(best);
				}
			};
			const handleEvents = () => {
				for (const ev of state.events) if (ev.kind === "bumper") particles.burst(ev.x, ev.y, THEME.gold, 8, 150);
				else if (ev.kind === "sling") particles.burst(ev.x, ev.y, THEME.bad, 7, 130);
				else if (ev.kind === "target") particles.burst(ev.x, ev.y, THEME.good, 6, 110);
				else if (ev.kind === "bank") particles.burst(ev.x, ev.y, THEME.gold, 20, 220);
				else if (ev.kind === "levelUp") {
					saveLevel(GAME_ID$1, ev.level);
					particles.burst(LOGICAL_W$1 / 2, 260, THEME.good, 24, 240);
				} else if (ev.kind === "drain") particles.burst(LOGICAL_W$1 / 2, 640, THEME.bad, 14, 160);
				else if (ev.kind === "tilt") particles.burst(LOGICAL_W$1 / 2, 120, THEME.bad, 16, 180);
			};
			const frame = (f) => {
				if (!running) return;
				step$1(state, f.dt);
				handleEvents();
				reportScore();
				if (f.render) {
					renderPinball(ctx, {
						state,
						paused: false,
						best
					});
					particles.tick(ctx, f.dt * 1e3);
				}
			};
			const loop = createFrameLoop(frame);
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const k = event.code;
				if (k === "Space" || k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") event.preventDefault();
				if (event.repeat) return;
				switch (k) {
					case "KeyA":
					case "ArrowLeft":
						setFlipper(state, "left", true);
						break;
					case "KeyD":
					case "ArrowRight":
						setFlipper(state, "right", true);
						break;
					case "Space":
						if (state.result === "paused") togglePauseLocal();
						else if (state.result === "playing") state.plungerHeld = true;
						break;
					case "KeyN":
						nudge(state);
						break;
					case "KeyR":
						if (state.result !== "paused") {
							restart(state);
							lastScore = -1;
							reportScore();
						}
						break;
					case "KeyP":
					case "Escape": togglePauseLocal();
				}
			};
			const onKeyUp = (event) => {
				const k = event.code;
				if (k === "KeyA" || k === "ArrowLeft") setFlipper(state, "left", false);
				else if (k === "KeyD" || k === "ArrowRight") setFlipper(state, "right", false);
				else if (k === "Space" && state.plungerHeld) {
					if (state.plunger >= MIN_LAUNCH_POWER) plungerRelease(state);
					else {
						state.plunger = 0;
						state.plungerHeld = false;
					}
				}
			};
			const pause = () => {
				if (!running) return;
				running = false;
				loop.pause();
				setFlipper(state, "left", false);
				setFlipper(state, "right", false);
				state.plungerHeld = false;
				togglePause$1(state);
				renderPinball(ctx, {
					state,
					paused: true,
					best
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (state.result === "paused") togglePause$1(state);
				loop.resume();
				loop.markDirty();
			};
			const togglePauseLocal = () => {
				if (state.result === "paused") resume();
				else pause();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
					fit.dispose();
				}
			};
		}
		const pinballGame = {
			id: "pinball",
			title: "弹球台",
			icon: "🎯",
			description: "真实物理弹球：弹射器发球、挡板击打、缓冲柱与反弹板得分，小心出局通道和 TILT。",
			controls: [
				"A / ← 左挡板 · D / → 右挡板",
				"长按空格蓄力发射 · 松开发球",
				"N 轻推台面（5 秒内 3 次 → TILT）",
				"P 暂停 · R 重开本桌"
			],
			create: createPinballGame
		};
		//#endregion
		//#region src/client/games/flow/logic.ts
		/**
		* 管道连线 (Flow Free) pure logic. An n×n grid holds K color pairs; the
		* player draws a simple path between each pair so that the K paths partition
		* the grid — every cell filled, no cell shared (the classic Flow Free rule).
		*
		* Generation: K random seed cells grow simultaneously into self-avoiding
		* walks (most-constrained head first) until the walks partition the grid;
		* each walk's two ends become that color's dots, so a solution always
		* exists. Every roll is verified by a node-budgeted DFS solver that counts
		* solutions up to two (endpoint-reachability, free-cell coverage, and
		* dead-cell pruning); a level ships only when exactly one solution is
		* proven, otherwise the seed advances — after the attempt cap the first
		* solvable roll ships with a 多解 badge (mirroring the slitherlink approach).
		*/
		/** Board edge lengths of the five levels. */
		const LEVEL_SIZES = [
			5,
			6,
			7,
			8,
			9
		];
		/** Color-pair count of the five levels (index-aligned with LEVEL_SIZES). */
		const LEVEL_PAIRS = [
			4,
			5,
			6,
			7,
			8
		];
		/** mulberry32 PRNG: small, fast, deterministic per seed. */
		function mulberry32$1(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 >>> 0;
				let t = a;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/** Orthogonal neighbors of a cell (grid edges only). */
		function neighbors(size, cell) {
			const r = Math.floor(cell / size);
			const c = cell % size;
			const out = [];
			if (r > 0) out.push(cell - size);
			if (r < size - 1) out.push(cell + size);
			if (c > 0) out.push(cell - 1);
			if (c < size - 1) out.push(cell + 1);
			return out;
		}
		/** True when two distinct cells share a grid edge. */
		function adjacent(size, a, b) {
			if (a === b || a < 0 || b < 0 || a >= size * size || b >= size * size) return false;
			return Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs(a % size - b % size) === 1;
		}
		/** Board edge length of a 1-based level (levels wrap after 9×9). */
		function levelSize(level) {
			return LEVEL_SIZES[(level - 1) % LEVEL_SIZES.length];
		}
		/** Color-pair count of a 1-based level. */
		function levelPairs(level) {
			return LEVEL_PAIRS[(level - 1) % LEVEL_PAIRS.length];
		}
		/** Win score: base 100×level plus a time bonus that decays 10/second. */
		function computeScore(level, seconds) {
			return 100 * level + Math.max(0, 3e3 - Math.floor(seconds) * 10);
		}
		/**
		* First free cell that can no longer lie on any path, or -1.
		*
		* A free interior cell needs ≥2 neighbors that are free or the active head
		* (the one cell the current path can still extend from); `head` = -1 when no
		* path is mid-extension. Unfinished endpoints (`endpoints`, free dot cells)
		* need only ≥1 — they terminate their path. Sound necessary condition used
		* by the solver's dead-end pruning; a pure helper for tests.
		*/
		function findDeadCell(size, occ, head = -1, endpoints = []) {
			const total = size * size;
			const isEndpoint = new Set(endpoints);
			for (let cell = 0; cell < total; cell += 1) {
				if (occ[cell] !== -1) continue;
				let count = 0;
				for (const n of neighbors(size, cell)) if (occ[n] === -1 || n === head) count += 1;
				const need = isEndpoint.has(cell) ? 1 : 2;
				if (count < need) return cell;
			}
			return -1;
		}
		/**
		* Begin (or re-grab) a color's path at a dot cell.
		*
		* If the color already has a path ending at `cell`, it is returned unchanged
		* or reversed so `cell` becomes the head (extendable end); otherwise a fresh
		* one-cell path starts there — dropping any previous path for the color.
		* Non-dot cells and foreign dots are rejected (state returned unchanged).
		*/
		function grabPath(puzzle, paths, color, cell) {
			const [a, b] = puzzle.dots[color];
			const path = paths[color] ?? null;
			if (cell !== a && cell !== b) return paths;
			if (path !== null && path.length > 0) {
				if (path[path.length - 1] === cell) return paths;
				if (path[0] === cell) {
					const next = paths.slice();
					next[color] = [...path].reverse();
					return next;
				}
			}
			const next = paths.slice();
			next[color] = [cell];
			return next;
		}
		/**
		* Extend (or truncate) a color's path to an adjacent cell.
		*
		* Rules: a cell already on the own path truncates it at that cell; another
		* path's cell or another color's dot is rejected; otherwise the cell joins
		* at the head or the tail (whichever is adjacent). Non-adjacent cells and
		* colors without a path leave the state unchanged.
		*/
		function extendPath(puzzle, paths, color, cell) {
			const path = paths[color] ?? null;
			if (path === null || path.length === 0) return paths;
			const size = puzzle.size;
			const hit = path.indexOf(cell);
			if (hit >= 0) {
				if (hit === path.length - 1) return paths;
				const next = paths.slice();
				next[color] = path.slice(0, hit + 1);
				return next;
			}
			for (let c2 = 0; c2 < puzzle.dots.length; c2 += 1) {
				if (c2 === color) continue;
				if (puzzle.dots[c2].includes(cell)) return paths;
				const other = paths[c2] ?? null;
				if (other !== null && other.includes(cell)) return paths;
			}
			const head = path[path.length - 1];
			const tail = path[0];
			const next = paths.slice();
			if (adjacent(size, head, cell)) next[color] = [...path, cell];
			else if (adjacent(size, tail, cell)) next[color] = [cell, ...path];
			else return paths;
			return next;
		}
		/** A color is connected when its path runs dot-to-dot (both ends are dots). */
		function pathComplete(puzzle, color, path) {
			if (path === null || path.length < 2) return false;
			const [a, b] = puzzle.dots[color];
			const first = path[0];
			const last = path[path.length - 1];
			return first === a && last === b || first === b && last === a;
		}
		/** Win: every pair connected dot-to-dot and every cell covered exactly once. */
		function isWon(puzzle, paths) {
			const seen = /* @__PURE__ */ new Set();
			for (let c = 0; c < puzzle.dots.length; c += 1) {
				const path = paths[c] ?? null;
				if (path === null || !pathComplete(puzzle, c, path)) return false;
				for (const cell of path) {
					if (seen.has(cell)) return false;
					seen.add(cell);
				}
			}
			return seen.size === puzzle.size * puzzle.size;
		}
		/** Count of colors whose path currently runs dot-to-dot. */
		function connectedCount(puzzle, paths) {
			let n = 0;
			for (let c = 0; c < puzzle.dots.length; c += 1) if (pathComplete(puzzle, c, paths[c] ?? null)) n += 1;
			return n;
		}
		/** Sentinel: stop the DFS (two solutions found or budget exhausted). */
		const STOP = -1;
		/**
		* Count solutions up to two via DFS with pruning.
		*
		* Colors route in fixed order; each branch grows a simple path from the
		* color's first dot to its partner over free cells. After every placement a
		* sound prune runs: one flood from the growing head plus every future dot
		* must reach the partner and cover all free cells, and no free cell may be
		* a dead end ({@link findDeadCell}). The generated solution always sits in
		* the search space, so a full search reports solutions ≥ 1.
		*/
		function solveCount(puzzle, maxNodes = 6e4) {
			const { size, dots } = puzzle;
			const total = size * size;
			const colors = dots.length;
			const occ = new Array(total).fill(-1);
			const dotColor = new Int8Array(total).fill(-1);
			for (let c = 0; c < colors; c += 1) {
				dotColor[dots[c][0]] = c;
				dotColor[dots[c][1]] = c;
			}
			let nodes = 0;
			let solutions = 0;
			let exhausted = false;
			/** Flood free cells from `seeds` (seed cells themselves may be occupied). */
			const flood = (seeds) => {
				const visited = new Uint8Array(total);
				const stack = [];
				for (const s of seeds) if (occ[s] === -1 && !visited[s]) {
					visited[s] = 1;
					stack.push(s);
				} else if (occ[s] !== -1) stack.push(s);
				while (stack.length > 0) {
					const cur = stack.pop();
					for (const n of neighbors(size, cur)) if (occ[n] === -1 && !visited[n]) {
						visited[n] = 1;
						stack.push(n);
					}
				}
				return visited;
			};
			/**
			* Sound necessary-condition check after the latest placement, while color
			* `color` grows from `head` (head is dots[color][0] at path start, a
			* non-dot interior cell afterwards — the partner is always dots[color][1]):
			* future dots free, partner reachable, all free cells covered from
			* {head ∪ future dots}, and no dead free cell.
			*/
			const prune = (color, head) => {
				const partner = dots[color][1];
				if (occ[partner] !== -1) return true;
				const seeds = [head, partner];
				const endpoints = [partner];
				for (let c = color + 1; c < colors; c += 1) {
					const [da, db] = dots[c];
					if (occ[da] !== -1 || occ[db] !== -1) return true;
					seeds.push(da, db);
					endpoints.push(da, db);
				}
				const visited = flood(seeds);
				for (let i = 0; i < total; i += 1) if (occ[i] === -1 && !visited[i]) return true;
				return findDeadCell(size, occ, head, endpoints) !== -1;
			};
			const dfsColor = (color) => {
				if (color === colors) {
					if (occ.every((v) => v !== -1)) solutions += 1;
					return solutions >= 2 ? STOP : 0;
				}
				const [start, partner] = dots[color];
				if (occ[start] !== -1 || occ[partner] !== -1) return 0;
				const path = [start];
				occ[start] = color;
				let done = 0;
				if (!prune(color, start)) done = dfsExtend(color, partner, start, path);
				occ[start] = -1;
				return done;
			};
			const dfsExtend = (color, partner, head, path) => {
				nodes += 1;
				if (nodes > maxNodes) {
					exhausted = true;
					return STOP;
				}
				for (const n of neighbors(size, head)) {
					if (n === partner) {
						path.push(n);
						occ[n] = color;
						const done = dfsColor(color + 1);
						occ[n] = -1;
						path.pop();
						if (done !== 0) return done;
						continue;
					}
					if (occ[n] !== -1) continue;
					if (dotColor[n] !== -1 && dotColor[n] !== color) continue;
					occ[n] = color;
					path.push(n);
					const done = prune(color, n) ? 0 : dfsExtend(color, partner, n, path);
					path.pop();
					occ[n] = -1;
					if (done !== 0) return done;
				}
				return 0;
			};
			dfsColor(0);
			return {
				solutions,
				exhausted,
				nodes
			};
		}
		/** Generation attempts per puzzle: uniqueness re-rolls, larger boards fewer. */
		function attemptCap(size) {
			return size <= 6 ? 40 : size <= 8 ? 25 : 12;
		}
		/** Solver node budget per board size: decisions on 8×8 need ~1M nodes. */
		function solveBudget(size) {
			return size <= 5 ? 6e4 : size === 6 ? 15e4 : size === 7 ? 4e5 : size === 8 ? 8e5 : 7e5;
		}
		/**
		* Generation budget per board size, in TOTAL solver nodes across all re-roll
		* attempts (a deterministic proxy for wall-clock: proofs cost seconds each on
		* big boards, so the loop is budget-boxed rather than count-boxed — same seed
		* always replays the same rolls in the same order).
		*/
		function genNodeBudget(size) {
			return size <= 7 ? 4e5 : 6e5;
		}
		/**
		* Generate a puzzle deterministically from `seed`.
		*
		* Re-rolls derived seeds until the solver proves exactly one solution
		* (unique: true); the loop stops at the attempt cap OR the cumulative node
		* budget, whichever first — on big boards proofs cost ~1M nodes each, so the
		* budget bounds the hang. After that the first solvable roll ships with
		* unique: false (the 多解 badge). Fully deterministic: no wall-clock input.
		*/
		function puzzleFromSeed(seed, size, pairs, requireUnique = true) {
			const attempts = requireUnique ? attemptCap(size) : 1;
			const budget = genNodeBudget(size);
			let spent = 0;
			let fallback = null;
			for (let s = 0; s < attempts; s += 1) {
				const roll = tryGenerate(seed + s * 2654435769 >>> 0, size, pairs);
				if (roll === null) continue;
				if (fallback === null) fallback = roll;
				const { solutions, exhausted, nodes } = solveCount(roll, solveBudget(size));
				spent += nodes;
				if (!exhausted && solutions === 1) return {
					...roll,
					unique: true
				};
				if (spent >= budget) break;
			}
			if (fallback !== null) return fallback;
			return stripePuzzle(size, pairs);
		}
		/** Deterministic fallback: K vertical stripes, each one snaked path. */
		function stripePuzzle(size, pairs) {
			const stripeW = Math.max(1, Math.floor(size / pairs));
			const paths = [];
			let col = 0;
			for (let p = 0; p < pairs; p += 1) {
				const last = p === pairs - 1 ? size - 1 : Math.min(size - 1, col + stripeW - 1);
				const path = [];
				for (let c = col; c <= last; c += 1) if ((c - col) % 2 === 0) for (let r = 0; r < size; r += 1) path.push(r * size + c);
				else for (let r = size - 1; r >= 0; r -= 1) path.push(r * size + c);
				if (path.length >= 2) paths.push(path);
				col = last + 1;
				if (col >= size) break;
			}
			const covered = new Set(paths.flat());
			if (covered.size !== size * size) {
				const coveredCols = /* @__PURE__ */ new Set();
				for (let i = 0; i < size * size; i += 1) if (!covered.has(i)) coveredCols.add(i % size);
				const lastPath = paths[paths.length - 1];
				const cols = [...coveredCols].sort((a, b) => a - b);
				for (const c of cols) {
					const prev = lastPath[lastPath.length - 1];
					if (Math.floor(prev / size) === 0) for (let r = 0; r < size; r += 1) lastPath.push(r * size + c);
					else for (let r = size - 1; r >= 0; r -= 1) lastPath.push(r * size + c);
				}
			}
			return {
				size,
				dots: paths.map((p) => [p[0], p[p.length - 1]]),
				solution: paths,
				unique: false
			};
		}
		/**
		* One generation attempt: grow K self-avoiding walks from spread seed cells
		* until they partition the grid, most-constrained head first. Null when a
		* round deadlocks (cells remain but no head can move) or seeds won't spread.
		*/
		function tryGenerate(seed, size, pairs) {
			const rng = mulberry32$1(seed);
			const total = size * size;
			for (let round = 0; round < 60; round += 1) {
				const cells = [];
				for (let i = 0; i < total; i += 1) cells.push(i);
				for (let i = cells.length - 1; i > 0; i -= 1) {
					const j = Math.floor(rng() * (i + 1));
					[cells[i], cells[j]] = [cells[j], cells[i]];
				}
				const starts = [];
				for (const c of cells) {
					if (starts.every((s) => {
						const dr = Math.abs(Math.floor(s / size) - Math.floor(c / size));
						const dc = Math.abs(s % size - c % size);
						return Math.max(dr, dc) >= 2;
					})) starts.push(c);
					if (starts.length === pairs) break;
				}
				if (starts.length < pairs) continue;
				const occupied = new Array(total).fill(-1);
				const paths = starts.map((s) => [s]);
				starts.forEach((s, p) => {
					occupied[s] = p;
				});
				let free = total - pairs;
				let deadlocked = false;
				while (free > 0) {
					let best = -1;
					let bestOpts = [];
					let bestScore = Infinity;
					for (let p = 0; p < paths.length; p += 1) {
						const head = paths[p][paths[p].length - 1];
						const opts = neighbors(size, head).filter((n) => occupied[n] === -1);
						if (opts.length === 0) continue;
						const score = opts.length + rng() * .5;
						if (score < bestScore) {
							bestScore = score;
							best = p;
							bestOpts = opts;
						}
					}
					if (best === -1) {
						deadlocked = true;
						break;
					}
					const next = bestOpts[Math.floor(rng() * bestOpts.length)];
					paths[best].push(next);
					occupied[next] = best;
					free -= 1;
				}
				if (deadlocked || free > 0) continue;
				if (paths.some((p) => p.length < 2)) continue;
				return {
					size,
					dots: paths.map((p) => [p[0], p[p.length - 1]]),
					solution: paths,
					unique: false
				};
			}
			return null;
		}
		//#endregion
		//#region src/client/games/flow/render.ts
		const HUD_H$1 = 40;
		const CELL = 46;
		const MARGIN$1 = 22;
		function logicalW(size) {
			return 44 + CELL * size;
		}
		function logicalH(size) {
			return 84 + CELL * size;
		}
		/** Center pixel of a cell index. */
		function cellCenter(size, cell) {
			const r = Math.floor(cell / size);
			const c = cell % size;
			return {
				x: MARGIN$1 + c * CELL + CELL / 2,
				y: 62 + r * CELL + CELL / 2
			};
		}
		/** Cell index under the pointer, or -1 (generous half-cell tolerance). */
		function cellAt(size, x, y) {
			const c = Math.floor((x - MARGIN$1) / CELL);
			const r = Math.floor((y - HUD_H$1 - MARGIN$1) / CELL);
			if (c < 0 || c >= size || r < 0 || r >= size) return -1;
			return r * size + c;
		}
		/** One color's pipe: rounded joints, slight glow, active head highlighted. */
		function drawPipe(ctx, size, cells, color, active, headCell) {
			if (cells.length === 1) return;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.strokeStyle = color;
			ctx.globalAlpha = active ? .95 : .72;
			ctx.lineWidth = CELL * .34;
			glow(ctx, color, active ? 12 : 6);
			ctx.beginPath();
			const first = cellCenter(size, cells[0]);
			ctx.moveTo(first.x, first.y);
			for (let i = 1; i < cells.length; i += 1) {
				const p = cellCenter(size, cells[i]);
				ctx.lineTo(p.x, p.y);
			}
			ctx.stroke();
			noGlow(ctx);
			ctx.globalAlpha = 1;
			if (active) {
				const head = cellCenter(size, headCell);
				ctx.beginPath();
				ctx.arc(head.x, head.y, CELL * .16, 0, Math.PI * 2);
				ctx.fillStyle = THEME.text;
				ctx.fill();
			}
		}
		function renderFlow(ctx, view) {
			const { puzzle, paths } = view;
			const size = puzzle.size;
			const w = logicalW(size);
			const h = logicalH(size);
			drawBackground(ctx, w, h);
			ctx.strokeStyle = "rgba(226,226,238,0.08)";
			ctx.lineWidth = 1;
			for (let i = 0; i <= size; i += 1) {
				ctx.beginPath();
				ctx.moveTo(MARGIN$1, 62 + i * CELL);
				ctx.lineTo(w - MARGIN$1, 62 + i * CELL);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(MARGIN$1 + i * CELL, 62);
				ctx.lineTo(MARGIN$1 + i * CELL, h - MARGIN$1);
				ctx.stroke();
			}
			if (view.hoverCell >= 0 && !view.solved) {
				const p = cellCenter(size, view.hoverCell);
				ctx.fillStyle = "rgba(255,255,255,0.06)";
				ctx.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL);
			}
			const order = paths.map((_, c) => c).filter((c) => c !== view.activeColor);
			if (view.activeColor >= 0) order.push(view.activeColor);
			for (const c of order) {
				const path = paths[c] ?? null;
				if (path === null) continue;
				drawPipe(ctx, size, path, THEME.accents[c % THEME.accents.length], c === view.activeColor, path[path.length - 1]);
			}
			for (let c = 0; c < puzzle.dots.length; c += 1) {
				const color = THEME.accents[c % THEME.accents.length];
				for (const dot of puzzle.dots[c]) {
					const p = cellCenter(size, dot);
					glow(ctx, color, 10);
					ctx.beginPath();
					ctx.arc(p.x, p.y, CELL * .26, 0, Math.PI * 2);
					ctx.fillStyle = color;
					ctx.fill();
					noGlow(ctx);
				}
			}
			hudPair(ctx, MARGIN$1, 22, `${view.levelLabel} `, `${view.connected} 已连 · ${view.elapsed}`, "left", THEME.gold);
			hudPair(ctx, w - MARGIN$1, 22, "解 ", view.puzzle.unique ? "唯一" : "多", "right", view.puzzle.unique ? THEME.good : THEME.textMuted);
			if (view.solved) drawOverlay(ctx, w, h, "连通！", "即将进入下一关 · R 重开本关", THEME.good);
			else if (view.paused) drawOverlay(ctx, w, h, "已暂停", "面板继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/flow/index.ts
		const ADVANCE_MS = 1500;
		function createFlowGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			let level = readLevel("flow") - 1;
			let puzzle = makePuzzle(level);
			let paths = puzzle.dots.map(() => null);
			let dragging = -1;
			let hoverCell = -1;
			let solved = false;
			let running = false;
			let elapsedSecs = 0;
			let shownSec = -1;
			let elapsed = "0:00";
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScoreLevel = -1;
			const particles = createParticles();
			function makePuzzle(lv) {
				const display = lv + 1;
				return puzzleFromSeed(display * 2654435769, levelSize(display), levelPairs(display));
			}
			const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size));
			if (initialFit === null) throw new Error("dsh-minigames: flow needs a 2d canvas context");
			let fit = initialFit;
			let ctx = fit.ctx;
			const refit = (size) => {
				fit.dispose();
				const next = fitCanvas(host, canvas, logicalW(size), logicalH(size));
				if (next === null) throw new Error("dsh-minigames: flow needs a 2d canvas context");
				fit = next;
				ctx = next.ctx;
			};
			const startLevel = (next) => {
				level = next;
				puzzle = makePuzzle(level);
				paths = puzzle.dots.map(() => null);
				dragging = -1;
				hoverCell = -1;
				solved = false;
				elapsedSecs = 0;
				shownSec = -1;
				elapsed = "0:00";
				refit(puzzle.size);
				loop.markDirty();
			};
			const scheduleAdvance = (delayMs) => {
				advanceAt = performance.now() + delayMs;
				advanceTimer = window.setTimeout(() => {
					advanceTimer = 0;
					const next = level + 1;
					saveLevel("flow", next + 1);
					startLevel(next);
				}, delayMs);
			};
			const view = () => ({
				puzzle,
				paths,
				activeColor: dragging,
				hoverCell,
				levelLabel: `第 ${level + 1} 关`,
				elapsed,
				connected: `${connectedCount(puzzle, paths)}/${puzzle.dots.length}`,
				solved,
				paused: false
			});
			const checkSolved = () => {
				if (solved || !isWon(puzzle, paths)) return;
				solved = true;
				dragging = -1;
				if (level !== lastScoreLevel) {
					lastScoreLevel = level;
					options?.onScore?.(computeScore(level + 1, elapsedSecs));
				}
				const center = cellCenter(puzzle.size, Math.floor(puzzle.size * puzzle.size / 2));
				particles.burst(center.x, center.y, THEME.gold, 20, 170);
				loop.markDirty();
				if (running) scheduleAdvance(ADVANCE_MS);
				else advanceRemaining = ADVANCE_MS;
			};
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * logicalW(puzzle.size) / rect.width;
				const y = (event.clientY - rect.top) * logicalH(puzzle.size) / rect.height;
				return cellAt(puzzle.size, x, y);
			};
			const onPointerDown = (event) => {
				if (!running || solved) return;
				const cell = cellFromEvent(event);
				if (cell < 0) return;
				for (let c = 0; c < puzzle.dots.length; c += 1) if (puzzle.dots[c].includes(cell)) {
					dragging = c;
					paths = grabPath(puzzle, paths, c, cell);
					canvas.setPointerCapture(event.pointerId);
					loop.markDirty();
					return;
				}
			};
			const onPointerMove = (event) => {
				if (!running) return;
				const cell = cellFromEvent(event);
				if (cell !== hoverCell) {
					hoverCell = cell;
					loop.markDirty();
				}
				if (dragging < 0 || solved || cell < 0) return;
				const next = extendPath(puzzle, paths, dragging, cell);
				if (next !== paths) {
					paths = next;
					loop.markDirty();
					checkSolved();
				}
			};
			const onPointerUp = () => {
				if (dragging < 0) return;
				dragging = -1;
				loop.markDirty();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = 0;
					startLevel(level);
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const loop = createFrameLoop((f) => {
				if (running && !solved) {
					elapsedSecs += f.dt;
					const secs = Math.floor(elapsedSecs);
					if (secs !== shownSec) {
						shownSec = secs;
						elapsed = `${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, "0")}`;
						loop.markDirty();
					}
				}
				const animating = particles.size() > 0;
				if (f.render || animating) {
					renderFlow(ctx, view());
					particles.tick(ctx, f.dt * 1e3);
					if (animating) loop.markDirty();
				}
			}, { mode: "dirty" });
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				if (!running) return;
				running = false;
				dragging = -1;
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				loop.pause();
				renderFlow(ctx, {
					...view(),
					activeColor: -1,
					paused: true
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				loop.markDirty();
				loop.resume();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			canvas.addEventListener("pointermove", onPointerMove);
			canvas.addEventListener("pointerup", onPointerUp);
			canvas.addEventListener("pointercancel", onPointerUp);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					canvas.removeEventListener("pointerdown", onPointerDown);
					canvas.removeEventListener("pointermove", onPointerMove);
					canvas.removeEventListener("pointerup", onPointerUp);
					canvas.removeEventListener("pointercancel", onPointerUp);
					window.removeEventListener("keydown", onKeyDown);
					fit.dispose();
				}
			};
		}
		const flowGame = {
			id: "flow",
			title: "管道连线 Flow",
			icon: "🔵",
			description: "把同色圆点用管道连起来并填满整个棋盘，管道路径不能交叉重叠。",
			controls: [
				"从圆点拖动画线，松开保留",
				"回到自己的线上可截断",
				"R：重开本关",
				"P：暂停"
			],
			create: createFlowGame
		};
		const PIN_MASS = .25;
		const BALL_PIN_E = .75;
		const PIN_PIN_E = .8;
		/** Substep ceiling: the ball is fast and pins are small — no tunneling. */
		const MAX_SUBSTEP_DT = 1 / 240;
		/** Throws below this power are ignored (taps do not launch the ball). */
		const MIN_THROW_POWER = .2;
		/** Aim range: ±25° from straight up-lane. */
		const MAX_AIM = 25 * Math.PI / 180;
		/** Hook region starts here (back third of the lane, y grows downward). */
		const HOOK_Y = 640 / 3;
		const LEVEL_THRESHOLDS = [
			60,
			80,
			100,
			120,
			150
		];
		/** Rack positional jitter amplitude (fraction of pin radius). */
		const RACK_JITTER = .04;
		/** Kickback wall restitution for pins (lane sides and the back wall). */
		const KICKBACK_E = .35;
		/** mulberry32 seeded PRNG (identical to the other games' rng). */
		function mulberry32(seed) {
			let a = seed >>> 0;
			return () => {
				a = a + 1831565813 | 0;
				let t = Math.imul(a ^ a >>> 15, 1 | a);
				t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		/**
		* Real ten-pin scoring over a flat rolls array (10 per frame, strike = one
		* roll). Frame N < last: strike scores 10 + next two rolls, else two rolls
		* with spare = 10 + next roll. The LAST frame grants bonus rolls
		* (strike/spare → a third roll) exactly like the 10th frame, so a perfect
		* sheet scores 30 × frames. Missing future rolls count 0, so a partial sheet
		* scores its resolved frames only.
		* @param rolls - flat pinfall per roll.
		* @param frames - frame count (10 for a full game, 5 for a level).
		* @returns the cumulative score.
		*/
		function scoreGame(rolls, frames = 10) {
			let i = 0;
			let total = 0;
			for (let f = 0; f < frames; f += 1) {
				const last = f === frames - 1;
				const r0 = rolls[i] ?? 0;
				const r1 = rolls[i + 1] ?? 0;
				const r2 = rolls[i + 2] ?? 0;
				if (last) {
					if (r0 === 10 || r0 + r1 === 10) total += r0 + r1 + r2;
					else total += r0 + r1;
				} else if (r0 === 10) {
					total += 10 + r1 + r2;
					i += 1;
				} else if (r0 + r1 === 10) {
					total += 10 + r2;
					i += 2;
				} else {
					total += r0 + r1;
					i += 2;
				}
			}
			return total;
		}
		/** Score threshold a level's 5-frame game must reach to advance. */
		function levelThreshold(level) {
			return LEVEL_THRESHOLDS[(level - 1) % LEVEL_THRESHOLDS.length];
		}
		/** Level seed for a (level, runSeed) pair: same inputs → same racks. */
		function levelSeed(level, seed) {
			return (seed ^ Math.imul(level, 2654435769)) >>> 0 || 1;
		}
		/**
		* The standard 10-pin triangle: 4 rows (1-2-3-4) with the head pin nearest
		* the foul line, seeded micro-jitter that never overlaps pins.
		* @param seed - seed for the jitter stream.
		*/
		function rackPins(seed) {
			const rng = mulberry32(seed);
			const rowGap = 30 * Math.sqrt(3) / 2;
			const pins = [];
			let id = 0;
			for (let row = 0; row < 4; row += 1) for (let col = 0; col <= row; col += 1) {
				const j = () => (rng() * 2 - 1) * RACK_JITTER * 7;
				const x = 100 + (col - row / 2) * 30 + j();
				const y = 110 - row * rowGap + j();
				pins.push({
					id: id += 1,
					x,
					y,
					vx: 0,
					vy: 0,
					spotX: 100 + (col - row / 2) * 30,
					spotY: 110 - row * rowGap,
					knocked: false,
					swept: false,
					atRest: true
				});
			}
			return pins;
		}
		function freshBall() {
			return {
				x: 100,
				y: 591,
				vx: 0,
				vy: 0,
				gutter: false,
				live: true,
				atRest: true
			};
		}
		/** Fresh state for a level (mount, restart, and level advance). */
		function createLevel(level, seed) {
			return {
				phase: "aiming",
				level,
				rolls: [],
				frame: 0,
				frameRolls: [],
				rollKnocked: 0,
				pins: rackPins(levelSeed(level, seed)),
				ball: freshBall(),
				aimAngle: 0,
				power: 0,
				spin: 0,
				msg: `第 ${level} 关 · 5 局 ${levelThreshold(level)} 分过关`,
				msgTimer: 2.5,
				events: [],
				rng: mulberry32((seed >>> 0 || 1) ^ Math.imul(level, 2246822507)),
				seed,
				pausedFrom: null
			};
		}
		/**
		* Elastic collision between two circles with masses ma/mb and restitution e,
		* along the contact normal. Positions are separated proportionally to inverse
		* mass when overlapping. Returns true when an approaching pair in contact was
		* resolved.
		* @param a - first body (mutated).
		* @param b - second body (mutated).
		* @param ra - radius of a.
		* @param rb - radius of b.
		* @param ma - mass of a.
		* @param mb - mass of b.
		* @param e - restitution in [0, 1].
		*/
		function resolveCircleCollision(a, b, ra, rb, ma, mb, e) {
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const minD = ra + rb;
			const d2 = dx * dx + dy * dy;
			if (d2 >= minD * minD || d2 === 0) return false;
			const d = Math.sqrt(d2);
			const nx = dx / d;
			const ny = dy / d;
			const van = a.vx * nx + a.vy * ny;
			const vbn = b.vx * nx + b.vy * ny;
			if (van - vbn <= 0) return false;
			const j = (1 + e) * (van - vbn) / (1 / ma + 1 / mb);
			a.vx -= j / ma * nx;
			a.vy -= j / ma * ny;
			b.vx += j / mb * nx;
			b.vy += j / mb * ny;
			const share = (minD - d) / (1 / ma + 1 / mb);
			a.x -= nx * share / ma;
			a.y -= ny * share / ma;
			b.x += nx * share / mb;
			b.y += ny * share / mb;
			return true;
		}
		/** Mark a pin knocked the moment it is fast or displaced beyond tolerance. */
		function checkKnock(state, pin) {
			if (pin.knocked) return;
			const speed = Math.hypot(pin.vx, pin.vy);
			const disp = Math.hypot(pin.x - pin.spotX, pin.y - pin.spotY);
			if (speed > 40 || disp > 4) {
				pin.knocked = true;
				state.rollKnocked += 1;
				state.events.push({
					kind: "pin",
					x: pin.x,
					y: pin.y
				});
			}
		}
		/** Kickback walls: pins stay on the lane (sides + back wall), low bounce. */
		function applyPinWalls(pin) {
			const e = KICKBACK_E;
			if (pin.x - 7 < 0 && pin.vx < 0) {
				pin.x = 7;
				pin.vx = -pin.vx * e;
			}
			if (pin.x + 7 > 200 && pin.vx > 0) {
				pin.x = 193;
				pin.vx = -pin.vx * e;
			}
			if (pin.y - 7 < 0 && pin.vy < 0) {
				pin.y = 7;
				pin.vy = -pin.vy * e;
			}
		}
		/** Ball leaves the lane through a side gutter: straight, hook off, no hits. */
		function checkGutter(ball) {
			if (ball.gutter || !ball.live) return;
			if (ball.x < 13 || ball.x > 187) {
				ball.gutter = true;
				ball.vx = 0;
				ball.x = Math.min(Math.max(ball.x, 13 / 2), 200 - 13 / 2);
			}
		}
		/**
		* Advance the simulation by dt seconds using fixed substeps (each ≤
		* MAX_SUBSTEP_DT). Runs only while a roll is in flight; pausing freezes
		* everything. Ends the roll (via {@link finishRoll}) once the ball is gone
		* or at rest and every live pin has settled.
		*/
		function step(state, dt) {
			state.events = [];
			if (state.phase !== "rolling") return;
			if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt);
			const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_DT));
			const h = dt / n;
			const ballDamp = Math.exp(-.35 * h);
			const pinDamp = Math.exp(-3.2 * h);
			for (let s = 0; s < n; s += 1) {
				const ball = state.ball;
				if (ball.live) {
					ball.x += ball.vx * h;
					ball.y += ball.vy * h;
					checkGutter(ball);
					if (!ball.gutter && ball.y < 213.33333333333334) ball.vx += state.spin * 40 * h;
					ball.vx *= ballDamp;
					ball.vy *= ballDamp;
					if (Math.hypot(ball.vx, ball.vy) < 6) {
						ball.vx = 0;
						ball.vy = 0;
						ball.atRest = true;
					} else ball.atRest = false;
					if (ball.y < -13) ball.live = false;
				}
				for (const pin of state.pins) {
					if (pin.swept) continue;
					pin.x += pin.vx * h;
					pin.y += pin.vy * h;
					applyPinWalls(pin);
					pin.vx *= pinDamp;
					pin.vy *= pinDamp;
					if (Math.hypot(pin.vx, pin.vy) < 6) {
						pin.vx = 0;
						pin.vy = 0;
						pin.atRest = true;
					} else pin.atRest = false;
					checkKnock(state, pin);
				}
				if (state.ball.live && !state.ball.gutter) for (const pin of state.pins) {
					if (pin.swept) continue;
					resolveCircleCollision(state.ball, pin, 13, 7, 1, PIN_MASS, BALL_PIN_E);
				}
				for (let i = 0; i < state.pins.length; i += 1) {
					const a = state.pins[i];
					if (a.swept) continue;
					for (let k = i + 1; k < state.pins.length; k += 1) {
						const b = state.pins[k];
						if (!b.swept) resolveCircleCollision(a, b, 7, 7, PIN_MASS, PIN_MASS, PIN_PIN_E);
					}
				}
				if (state.ball.y < 20) {
					for (const pin of state.pins) if (pin.knocked && !pin.swept) {
						pin.swept = true;
						pin.vx = 0;
						pin.vy = 0;
					}
				}
			}
			if ((!state.ball.live || state.ball.atRest || state.ball.gutter) && state.pins.every((p) => p.swept || p.atRest)) finishRoll(state);
		}
		/** Standing pins back on their spots (they survived the roll untouched). */
		function respotStanding(pins) {
			for (const pin of pins) {
				if (pin.knocked) {
					pin.swept = true;
					continue;
				}
				pin.x = pin.spotX;
				pin.y = pin.spotY;
				pin.vx = 0;
				pin.vy = 0;
				pin.atRest = true;
			}
		}
		/** Full fresh rack for the next frame / bonus roll (seeded, deterministic). */
		function rerack(state) {
			state.pins = rackPins(Math.floor(state.rng() * 4294967295) >>> 0 || 1);
		}
		/**
		* Called once the roll settles: records pinfall, sweeps the fallen pins, and
		* advances the frame bookkeeping (10th-frame rules on the last frame). Ends
		* the level game after FRAMES_PER_LEVEL frames and grades it against the
		* level threshold.
		*/
		function finishRoll(state) {
			const count = state.rollKnocked;
			state.rolls.push(count);
			state.frameRolls.push(count);
			const fr = state.frameRolls;
			const last = state.frame === 4;
			const strike = fr.length === 1 && fr[0] === 10;
			const spare = fr.length === 2 && fr[0] + fr[1] === 10;
			if (state.ball.gutter) state.events.push({ kind: "gutter" });
			if (strike) state.events.push({ kind: "strike" });
			else if (spare) state.events.push({ kind: "spare" });
			let frameOver;
			if (last) frameOver = fr.length === 3 || fr.length === 2 && fr[0] + fr[1] < 10;
			else frameOver = strike || fr.length === 2;
			if (frameOver) {
				state.frame += 1;
				state.frameRolls = [];
			}
			const standing = state.pins.filter((p) => !p.knocked).length;
			if (frameOver || standing === 0) rerack(state);
			else respotStanding(state.pins);
			state.rollKnocked = 0;
			state.ball = freshBall();
			state.power = 0;
			state.spin = 0;
			if (state.frame >= 5) {
				const score = scoreGame(state.rolls, 5);
				if (score >= levelThreshold(state.level)) {
					state.phase = "levelWon";
					state.msg = `过关！本局 ${score} 分`;
					state.msgTimer = 3;
					state.events.push({
						kind: "levelWon",
						score
					});
				} else {
					state.phase = "gameOver";
					state.msg = `${score} 分 · 未达 ${levelThreshold(state.level)} 分`;
					state.msgTimer = 3;
					state.events.push({
						kind: "gameOver",
						score
					});
				}
				return;
			}
			state.phase = "aiming";
		}
		/**
		* Throw the ball with the current aim, power, and spin. Only legal while
		* aiming; power is clamped to [MIN_THROW_POWER, 1].
		* @param state - the game state (mutated).
		* @returns true when the throw fired.
		*/
		function throwBall(state) {
			if (state.phase !== "aiming") return false;
			const p = Math.min(1, Math.max(MIN_THROW_POWER, state.power));
			const v = p * 400;
			const a = Math.min(MAX_AIM, Math.max(-MAX_AIM, state.aimAngle));
			state.ball = {
				x: 100,
				y: 591,
				vx: Math.sin(a) * v,
				vy: -Math.cos(a) * v,
				gutter: false,
				live: true,
				atRest: false
			};
			state.aimAngle = a;
			state.power = p;
			state.phase = "rolling";
			state.rollKnocked = 0;
			state.msgTimer = 0;
			return true;
		}
		/** Current running score of the level game (resolved frames only). */
		function currentScore(state) {
			return scoreGame(state.rolls, 5);
		}
		/** Restart the CURRENT level: same seed → identical rack sequence. */
		function restartLevel(state) {
			Object.assign(state, createLevel(state.level, state.seed));
		}
		/** Advance to the next level (fresh 5-frame game, thresholds wrap). */
		function nextLevel(state) {
			Object.assign(state, createLevel(state.level + 1, state.seed));
		}
		/** Toggle pause; remembers the phase to restore (stored-remainder pattern). */
		function togglePause(state) {
			if (state.phase === "paused") {
				state.phase = state.pausedFrom ?? "aiming";
				state.pausedFrom = null;
			} else if (state.phase === "aiming" || state.phase === "rolling") {
				state.pausedFrom = state.phase;
				state.phase = "paused";
			}
		}
		const MARGIN = 14;
		const SCALE = Math.min(312 / 200, 598 / 640);
		const LANE_X = (340 - 200 * SCALE) / 2;
		const LANE_Y = 81;
		const wx = (x) => LANE_X + x * SCALE;
		const wy = (y) => LANE_Y + y * SCALE;
		function drawLane(ctx) {
			const x = wx(0);
			const y = wy(0);
			const w = 200 * SCALE;
			const h = 640 * SCALE;
			roundRectPath(ctx, x - 8, y - 8, 202.875, 614, 10);
			ctx.fillStyle = "#2a1f14";
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.fillStyle = "#0b0b12";
			ctx.fillRect(x - 7, y, 7, h);
			ctx.fillRect(x + w, y, 7, h);
			const wood = ctx.createLinearGradient(x, y, x + w, y);
			wood.addColorStop(0, "#8a6a3f");
			wood.addColorStop(.5, "#c89a5a");
			wood.addColorStop(1, "#8a6a3f");
			ctx.fillStyle = wood;
			ctx.fillRect(x, y, w, h);
			ctx.strokeStyle = "rgba(60,36,14,0.35)";
			ctx.lineWidth = .7;
			for (let i = 1; i < 10; i += 1) {
				const bx = x + w * i / 10;
				ctx.beginPath();
				ctx.moveTo(bx, y);
				ctx.lineTo(bx, y + h);
				ctx.stroke();
			}
			const sheen = ctx.createLinearGradient(x, y, x, y + h);
			sheen.addColorStop(0, "rgba(255,255,255,0.14)");
			sheen.addColorStop(.4, "rgba(255,255,255,0)");
			sheen.addColorStop(1, "rgba(0,0,0,0.22)");
			ctx.fillStyle = sheen;
			ctx.fillRect(x, y, w, h);
			ctx.fillStyle = "rgba(122,162,247,0.06)";
			ctx.fillRect(x, wy(HOOK_Y), w, wy(0) - wy(HOOK_Y));
			ctx.fillStyle = "rgba(13,13,20,0.30)";
			ctx.fillRect(x, y, w, wy(20) - y);
			ctx.fillStyle = "rgba(60,36,14,0.8)";
			for (let i = -2; i <= 2; i += 1) {
				const ax = wx(100 + i * 30);
				const ay = wy(488 + Math.abs(i) * 26);
				ctx.beginPath();
				ctx.moveTo(ax, ay - 9);
				ctx.lineTo(ax - 4, ay);
				ctx.lineTo(ax + 4, ay);
				ctx.closePath();
				ctx.fill();
			}
			ctx.strokeStyle = "#f7768e";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(x, wy(608));
			ctx.lineTo(x + w, wy(608));
			ctx.stroke();
		}
		function drawPin(ctx, pin) {
			if (pin.swept) return;
			const px = wx(pin.x);
			const py = wy(pin.y);
			const r = 7 * SCALE;
			glow(ctx, pin.knocked ? THEME.bad : "#f4f4f5", 6);
			const g = ctx.createRadialGradient(px - r * .3, py - r * .3, r * .15, px, py, r);
			g.addColorStop(0, "#ffffff");
			g.addColorStop(.6, pin.knocked ? "#d9a9b4" : "#e8e8f0");
			g.addColorStop(1, "#8a8a9a");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(px, py, r, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.strokeStyle = "#f7768e";
			ctx.lineWidth = 1.6;
			ctx.beginPath();
			ctx.arc(px, py, r * .55, 0, Math.PI * 2);
			ctx.stroke();
		}
		function drawBall(ctx, state) {
			const ball = state.ball;
			if (!ball.live) return;
			const bx = wx(ball.x);
			const by = wy(ball.y);
			const r = 13 * SCALE;
			glow(ctx, "#7dcfff", 8);
			const g = ctx.createRadialGradient(bx - r * .35, by - r * .35, r * .1, bx, by, r);
			g.addColorStop(0, "#5f7ea8");
			g.addColorStop(.55, "#27354d");
			g.addColorStop(1, "#101826");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(bx, by, r, 0, Math.PI * 2);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = "#0a0f18";
			for (const [ox, oy] of [
				[-.3, -.3],
				[.28, -.34],
				[-.02, .16]
			]) {
				ctx.beginPath();
				ctx.arc(bx + ox * r, by + oy * r, r * .11, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		/** Aim arrow + dotted guide while aiming/charging. */
		function drawAim(ctx, state) {
			if (state.phase !== "aiming") return;
			const bx = wx(100);
			const by = wy(state.ball.y);
			const a = state.aimAngle;
			const dx = Math.sin(a);
			const dy = -Math.cos(a);
			ctx.save();
			ctx.setLineDash([4, 6]);
			ctx.strokeStyle = "rgba(226,226,238,0.5)";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(bx + dx * 13 * SCALE * 1.4, by + dy * 13 * SCALE * 1.4);
			ctx.lineTo(bx + dx * 90, by + dy * 90);
			ctx.stroke();
			ctx.restore();
			const hx = bx + dx * 100;
			const hy = by + dy * 100;
			ctx.fillStyle = accent(0);
			glow(ctx, accent(0), 8);
			ctx.beginPath();
			ctx.moveTo(hx + dx * 12, hy + dy * 12);
			ctx.lineTo(hx - dy * 6, hy + dx * 6);
			ctx.lineTo(hx + dy * 6, hy - dx * 6);
			ctx.closePath();
			ctx.fill();
			noGlow(ctx);
		}
		function drawMeters(ctx, state) {
			const mx = wx(200) + 14;
			const top = wy(448);
			const h = 150;
			roundRectPath(ctx, mx - 5, top - 6, 14, 162, 6);
			ctx.fillStyle = THEME.panel;
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.stroke();
			const p = state.power;
			const grad = ctx.createLinearGradient(mx, top + h, mx, top);
			grad.addColorStop(0, THEME.good);
			grad.addColorStop(.6, THEME.gold);
			grad.addColorStop(1, THEME.bad);
			ctx.fillStyle = grad;
			ctx.fillRect(mx - 3, top + h * (1 - p), 10, h * p);
			const sx = wx(0) - 16;
			const sy = top + h / 2;
			const spin = state.spin;
			ctx.fillStyle = spin === 0 ? THEME.textMuted : accent(1);
			const len = 6 + Math.abs(spin) * 16;
			const dir = spin >= 0 ? 1 : -1;
			ctx.beginPath();
			ctx.moveTo(sx + dir * len, sy);
			ctx.lineTo(sx - dir * 6, sy - 6);
			ctx.lineTo(sx - dir * 6, sy + 6);
			ctx.closePath();
			ctx.fill();
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText("旋", sx, sy + 22);
		}
		function drawHud(ctx, state, best) {
			const shown = currentScore(state);
			hudPair(ctx, MARGIN, 22, `等级 ${state.level}`, `${shown} / ${levelThreshold(state.level)}`);
			hudPair(ctx, 326, 22, `最佳`, `${best}`, "right");
			const bw = 46;
			const x0 = 43;
			const y0 = 34;
			ctx.font = "600 11px system-ui, sans-serif";
			for (let f = 0; f < 5; f += 1) {
				const x = x0 + f * 52;
				roundRectPath(ctx, x, y0, bw, 30, 5);
				ctx.fillStyle = f === state.frame ? "rgba(122,162,247,0.14)" : THEME.panel;
				ctx.fill();
				ctx.strokeStyle = f === state.frame ? accent(0) : THEME.panelEdge;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.textAlign = "center";
				ctx.fillStyle = THEME.textMuted;
				ctx.fillText(`${f + 1}`, x + bw / 2, 46);
				ctx.fillStyle = THEME.text;
				const marks = frameMarks(state, f);
				ctx.fillText(marks, x + bw / 2, 59);
			}
			if (state.msgTimer > 0 && state.msg !== "") {
				ctx.textAlign = "center";
				ctx.font = "600 13px system-ui, sans-serif";
				ctx.fillStyle = THEME.gold;
				ctx.fillText(state.msg, 170, 690);
			}
		}
		/** Roll marks for one HUD frame box ('X', '8 /', '3 4', ''). */
		function frameMarks(state, f) {
			const frames = [];
			let i = 0;
			for (let k = 0; k < 5 && i < state.rolls.length; k += 1) if (k === 4) {
				const take = state.rolls.length - i;
				frames.push(state.rolls.slice(i, i + Math.min(3, take)));
				i += 3;
			} else if (state.rolls[i] === 10) {
				frames.push([10]);
				i += 1;
			} else {
				frames.push(state.rolls.slice(i, i + 2));
				i += 2;
			}
			const fr = frames[f];
			if (fr === void 0 || fr.length === 0) return "";
			if (fr.length === 1) return fr[0] === 10 ? "X" : `${fr[0]}`;
			if (fr.length === 2) {
				if (fr[0] === 10) return `X ${fr[1] === 10 ? "X" : fr[1]}`;
				return fr[0] + fr[1] === 10 ? `${fr[0]} /` : `${fr[0]} ${fr[1]}`;
			}
			const third = fr[2] === 10 ? "X" : `${fr[2]}`;
			return `${fr[0] === 10 ? "X" : fr[0]}${fr[1] === 10 || fr[0] + fr[1] === 10 ? fr[1] === 10 ? "X" : "/" : fr[1]}${third}`;
		}
		/** Draw the whole scene (call once per rendered frame). */
		function renderBowling(ctx, view) {
			const { state, paused, best } = view;
			drawBackground(ctx, 340, 700);
			drawHud(ctx, state, best);
			drawLane(ctx);
			for (const pin of state.pins) drawPin(ctx, pin);
			drawBall(ctx, state);
			drawAim(ctx, state);
			drawMeters(ctx, state);
			if (paused) drawOverlay(ctx, 340, 700, "暂停", "按 P 继续");
			else if (state.phase === "levelWon") drawOverlay(ctx, 340, 700, "过关！", `${state.msg} · 空格下一关`, THEME.good);
			else if (state.phase === "gameOver") drawOverlay(ctx, 340, 700, "游戏结束", `${state.msg} · 空格重试`, THEME.bad);
		}
		//#endregion
		//#region src/client/games/bowling/index.ts
		const GAME_ID = "bowling";
		/** Keyboard charge rate (power per second while Space is held). */
		const CHARGE_RATE = .85;
		/** Aim rotation rate (radians per second while ←/→ is held). */
		const AIM_RATE = 1.2;
		/** Spin adjustment rate (spin units per second while A/D is held). */
		const SPIN_RATE = 1.6;
		function createBowlingGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 340, 700);
			if (fit === null) throw new Error("dsh-minigames: bowling needs a 2d canvas context");
			const ctx = fit.ctx;
			const runSeed = (Date.now() ^ 185078245) >>> 0;
			let state = createLevel(readLevel(GAME_ID), runSeed);
			/** Banked score of completed levels (the panel score is cumulative). */
			let banked = 0;
			let running = false;
			let lastScore = -1;
			const particles = createParticles();
			const keys = {
				left: false,
				right: false,
				charge: false,
				spinL: false,
				spinR: false
			};
			const reportScore = () => {
				const s = Math.floor(banked + currentScore(state));
				if (s === lastScore) return;
				lastScore = s;
				options?.onScore?.(s);
			};
			const handleEvents = () => {
				for (const ev of state.events) if (ev.kind === "pin") particles.burst(170 + (ev.x - 100) * .9, 504 - ev.y * .9, THEME.gold, 8, 130);
				else if (ev.kind === "strike") particles.burst(170, 210, THEME.good, 26, 220);
				else if (ev.kind === "spare") particles.burst(170, 210, accent(1), 18, 180);
				else if (ev.kind === "levelWon") {
					saveLevel(GAME_ID, state.level + 1);
					banked += ev.score;
					particles.burst(170, 350, THEME.good, 30, 240);
				} else if (ev.kind === "gameOver") particles.burst(170, 350, THEME.bad, 20, 180);
			};
			const frame = (f) => {
				if (!running) return;
				const dt = f.dt;
				if (state.phase === "aiming") {
					if (keys.left) state.aimAngle = Math.max(-MAX_AIM, state.aimAngle - AIM_RATE * dt);
					if (keys.right) state.aimAngle = Math.min(MAX_AIM, state.aimAngle + AIM_RATE * dt);
					if (keys.charge) state.power = Math.min(1, state.power + CHARGE_RATE * dt);
					if (keys.spinL) state.spin = Math.max(-1, state.spin - SPIN_RATE * dt);
					if (keys.spinR) state.spin = Math.min(1, state.spin + SPIN_RATE * dt);
				}
				step(state, dt);
				handleEvents();
				if (state.phase === "levelWon" || state.phase === "gameOver") reportScore();
				if (state.phase === "rolling" || keys.left || keys.right || keys.charge || keys.spinL || keys.spinR || state.msgTimer > 0 || particles.size() > 0) loop.markDirty();
				if (f.render) {
					renderBowling(ctx, {
						state,
						paused: false,
						best: 0
					});
					particles.tick(ctx, dt * 1e3);
				}
			};
			const loop = createFrameLoop(frame, { mode: "dirty" });
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyP") {
					event.preventDefault();
					if (state.phase !== "levelWon" && state.phase !== "gameOver") togglePause(state);
					loop.markDirty();
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					restartLevel(state);
					reportScore();
					loop.markDirty();
					return;
				}
				if (event.code === "Space") {
					event.preventDefault();
					if (state.phase === "levelWon") {
						nextLevel(state);
						loop.markDirty();
					} else if (state.phase === "gameOver") {
						restartLevel(state);
						reportScore();
						loop.markDirty();
					} else if (state.phase === "aiming") {
						keys.charge = true;
						loop.markDirty();
					}
					return;
				}
				if (state.phase === "paused" || state.phase === "levelWon" || state.phase === "gameOver") return;
				if (event.code === "ArrowLeft") {
					event.preventDefault();
					keys.left = true;
				} else if (event.code === "ArrowRight") {
					event.preventDefault();
					keys.right = true;
				} else if (event.code === "KeyA") {
					event.preventDefault();
					keys.spinL = true;
				} else if (event.code === "KeyD") {
					event.preventDefault();
					keys.spinR = true;
				}
				loop.markDirty();
			};
			const onKeyUp = (event) => {
				if (event.code === "ArrowLeft") keys.left = false;
				else if (event.code === "ArrowRight") keys.right = false;
				else if (event.code === "KeyA") keys.spinL = false;
				else if (event.code === "KeyD") keys.spinR = false;
				else if (event.code === "Space") {
					if (keys.charge && state.phase === "aiming") {
						if (state.power >= .2) throwBall(state);
						else state.power = 0;
					}
					keys.charge = false;
					loop.markDirty();
				}
			};
			const pause = () => {
				if (!running) return;
				running = false;
				keys.left = keys.right = keys.charge = keys.spinL = keys.spinR = false;
				if (state.phase === "aiming" || state.phase === "rolling") togglePause(state);
				loop.pause();
				renderBowling(ctx, {
					state,
					paused: true,
					best: 0
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (state.phase === "paused") togglePause(state);
				loop.start();
				loop.markDirty();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			loop.start();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					loop.destroy();
					fit.dispose();
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("keyup", onKeyUp);
				}
			};
		}
		const bowlingGame = {
			id: "bowling",
			title: "迷你保龄球 Bowling",
			icon: "🎳",
			description: "瞄准蓄力掷球，勾球旋转一击全倒，真实十瓶计分冲满分。",
			controls: [
				"← →：瞄准（±25°）",
				"空格：按住蓄力，松开掷球",
				"A / D：蓄力时设置勾球方向",
				"P：暂停 · R：重开本关"
			],
			create: createBowlingGame
		};
		//#endregion
		//#region src/client/games/index.ts
		/**
		* Built-in game collection: the single registration point for the games that
		* ship with the plugin. Adding a game = implement {@link MiniGameDefinition}
		* (see games/types.ts) and add one registerGame call here — the panel, the
		* registry, and the other games never change.
		*/
		function registerBuiltinGames() {
			for (const game of [
				dinoGame,
				tetrisGame,
				tanksGame,
				match3Game,
				snakeGame,
				game2048,
				minesweeperGame,
				memoryGame,
				gomokuGame,
				hopGame,
				breakoutGame,
				whackGame,
				othelloGame,
				flappyGame,
				sudokuGame,
				pacmanGame,
				aimTrackGame,
				simonGame,
				sokobanGame,
				asteroidsGame,
				pipesGame,
				colorLinesGame,
				dodgerGame,
				typingGame,
				lightsOutGame,
				pongGame,
				stackGame,
				wordleGame,
				nonogramGame,
				pegGame,
				hanoiGame,
				fifteenGame,
				mastermindGame,
				mazeGame,
				schulteGame,
				hashiGame,
				miniGoGame,
				connect4Game,
				slitherlinkGame,
				racingGame,
				bubbleGame,
				bomberGame,
				pianoGame,
				zumaGame,
				poolGame,
				tdGame,
				chessGame,
				pinballGame,
				flowGame,
				bowlingGame
			]) if (getGame(game.id) === void 0) registerGame(game);
		}
		//#endregion
		//#region src/client/panel/Panel.tsx
		/**
		* The minigames floating window: a draggable, edge-snapping ("dockable")
		* floating window with a hide toggle. Dragging the header moves the window;
		* releasing near a screen edge snaps it to that edge (left/right/top/bottom).
		* A ✕ button hides the window entirely, leaving a small floating 🎮 launcher
		* button; position, width, and dock state persist in localStorage. The game
		* picker and game area mount inside the window with full lifecycle
		* management (pause on hide / tab hidden / user pause, destroy on switch).
		*/
		registerBuiltinGames();
		const LS_OPEN = "dsh-minigames:open";
		const LS_GAME = "dsh-minigames:game";
		const LS_WIDTH = "dsh-minigames:width";
		const LS_POS = "dsh-minigames:pos";
		const LS_DOCK = "dsh-minigames:dock";
		const LS_LAUNCHER = "dsh-minigames:launcher";
		const LS_BEST_PREFIX = "dsh-minigames:best:";
		/** Snap distance to a screen edge (px). */
		const SNAP_PX = 24;
		const WINDOW_MARGIN = 8;
		/** Launcher button diameter (kept in sync with the .dmg-launcher CSS). */
		const LAUNCHER_SIZE = 46;
		/** Pointer travel that counts as a launcher drag instead of a click (px). */
		const DRAG_THRESHOLD = 5;
		function loadBool(key, fallback) {
			try {
				const value = localStorage.getItem(key);
				return value === null ? fallback : value === "1";
			} catch {
				return fallback;
			}
		}
		function loadStr(key, fallback) {
			try {
				return localStorage.getItem(key);
			} catch {
				return fallback;
			}
		}
		function save(key, value) {
			try {
				localStorage.setItem(key, value);
			} catch {}
		}
		function loadPos() {
			return loadJsonPos(LS_POS);
		}
		function loadLauncherPos() {
			return loadJsonPos(LS_LAUNCHER);
		}
		function loadJsonPos(key) {
			try {
				const raw = localStorage.getItem(key);
				if (raw === null) return null;
				const parsed = JSON.parse(raw);
				if (typeof parsed.x === "number" && Number.isFinite(parsed.x) && typeof parsed.y === "number" && Number.isFinite(parsed.y)) return {
					x: parsed.x,
					y: parsed.y
				};
			} catch {}
			return null;
		}
		function loadDock() {
			try {
				const value = localStorage.getItem(LS_DOCK);
				return value === "left" || value === "right" ? value : "free";
			} catch {
				return "free";
			}
		}
		/** Clamp a floating-window width to the viewport. */
		function clampPanelWidth(px, viewport) {
			return Math.min(Math.max(px, 360), Math.max(360, viewport * .8));
		}
		function windowHeight(viewport) {
			return Math.min(viewport * .65, 680);
		}
		/** Clamp the floating window inside the viewport for its rendered size. */
		function clampWindowPos(p, w, h) {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			return {
				x: Math.min(Math.max(p.x, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vw - w - WINDOW_MARGIN)),
				y: Math.min(Math.max(p.y, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vh - h - WINDOW_MARGIN))
			};
		}
		/** Clamp the launcher button inside the viewport. */
		function clampLauncherPos(p) {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			return {
				x: Math.min(Math.max(p.x, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vw - LAUNCHER_SIZE - WINDOW_MARGIN)),
				y: Math.min(Math.max(p.y, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vh - LAUNCHER_SIZE - WINDOW_MARGIN))
			};
		}
		function MiniGamePanel() {
			const [open, setOpen] = (0, react.useState)(() => loadBool(LS_OPEN, false));
			const [gameId, setGameId] = (0, react.useState)(() => loadStr(LS_GAME, null));
			const [width, setWidth] = (0, react.useState)(() => {
				const saved = loadStr(LS_WIDTH, null);
				const fallback = Math.min(Math.round(window.innerWidth / 2), 640);
				return saved === null ? fallback : clampPanelWidth(Number(saved) || fallback, window.innerWidth);
			});
			const [pos, setPos] = (0, react.useState)(() => {
				const saved = loadPos();
				if (saved !== null) return clampWindowPos(saved, width, windowHeight(window.innerHeight));
				const fallbackWidth = Math.min(Math.round(window.innerWidth / 2), 640);
				return {
					x: Math.max(WINDOW_MARGIN, window.innerWidth - fallbackWidth - 12),
					y: 80
				};
			});
			const [dock, setDock] = (0, react.useState)(() => loadDock());
			const [launcherPos, setLauncherPos] = (0, react.useState)(() => {
				const saved = loadLauncherPos();
				if (saved !== null) return clampLauncherPos(saved);
				return {
					x: window.innerWidth - LAUNCHER_SIZE - 18,
					y: window.innerHeight - LAUNCHER_SIZE - 18
				};
			});
			const [best, setBest] = (0, react.useState)(() => {
				const out = {};
				for (const game of getGames()) try {
					const value = localStorage.getItem(LS_BEST_PREFIX + game.id);
					if (value !== null) out[game.id] = Number(value);
				} catch {}
				return out;
			});
			const panelRef = (0, react.useRef)(null);
			const widthRef = (0, react.useRef)(width);
			const posRef = (0, react.useRef)(pos);
			const dockRef = (0, react.useRef)(dock);
			const launcherPosRef = (0, react.useRef)(launcherPos);
			const suppressClick = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				widthRef.current = width;
			}, [width]);
			(0, react.useEffect)(() => {
				posRef.current = pos;
			}, [pos]);
			(0, react.useEffect)(() => {
				dockRef.current = dock;
			}, [dock]);
			(0, react.useEffect)(() => {
				launcherPosRef.current = launcherPos;
			}, [launcherPos]);
			(0, react.useEffect)(() => {
				const onResize = () => {
					setLauncherPos((prev) => {
						const next = clampLauncherPos(prev);
						if (next.x !== prev.x || next.y !== prev.y) save(LS_LAUNCHER, JSON.stringify(next));
						return next;
					});
					setWidth((prev) => {
						const next = clampPanelWidth(prev, window.innerWidth);
						if (next !== prev) save(LS_WIDTH, String(next));
						return next;
					});
					setPos((prev) => {
						const w = clampPanelWidth(widthRef.current, window.innerWidth);
						const next = clampWindowPos({
							x: dockRef.current === "right" ? Math.max(WINDOW_MARGIN, window.innerWidth - w - WINDOW_MARGIN) : prev.x,
							y: prev.y
						}, w, windowHeight(window.innerHeight));
						if (next.x !== prev.x || next.y !== prev.y) save(LS_POS, JSON.stringify(next));
						return next;
					});
				};
				onResize();
				window.addEventListener("resize", onResize);
				return () => window.removeEventListener("resize", onResize);
			}, []);
			const activeGame = gameId === null ? void 0 : getGame(gameId);
			const selectGame = (id) => {
				setGameId(id);
				save(LS_GAME, id);
			};
			const toggleOpen = (next) => {
				setOpen(next);
				save(LS_OPEN, next ? "1" : "0");
			};
			const onScore = (game, score) => {
				setBest((prev) => {
					if (score <= (prev[game.id] ?? 0)) return prev;
					const next = {
						...prev,
						[game.id]: score
					};
					try {
						localStorage.setItem(LS_BEST_PREFIX + game.id, String(score));
					} catch {}
					return next;
				});
			};
			/** Drag the window by its header; releasing near an edge snaps it there. */
			const startDrag = (event) => {
				if (event.target.closest("button, [data-dmg-resize]") !== null) return;
				event.preventDefault();
				const startX = event.clientX;
				const startY = event.clientY;
				const start = posRef.current;
				if (dockRef.current !== "free") {
					setDock("free");
					save(LS_DOCK, "free");
				}
				const onMove = (move) => {
					setPos({
						x: start.x + move.clientX - startX,
						y: start.y + move.clientY - startY
					});
				};
				const onUp = (up) => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
					const vw = window.innerWidth;
					const vh = window.innerHeight;
					const w = widthRef.current;
					const h = windowHeight(vh);
					const nearLeft = up.clientX <= SNAP_PX;
					const nearRight = up.clientX >= vw - SNAP_PX;
					const nearTop = up.clientY <= SNAP_PX;
					const nearBottom = up.clientY >= vh - SNAP_PX;
					const nextDock = nearLeft ? "left" : nearRight ? "right" : "free";
					const current = posRef.current;
					let x = current.x;
					let y = current.y;
					if (nearLeft) x = WINDOW_MARGIN;
					else if (nearRight) x = vw - w - WINDOW_MARGIN;
					else x = Math.min(Math.max(x, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vw - w - WINDOW_MARGIN));
					if (nearTop) y = WINDOW_MARGIN;
					else if (nearBottom) y = vh - h - WINDOW_MARGIN;
					else y = Math.min(Math.max(y, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vh - h - WINDOW_MARGIN));
					const next = {
						x,
						y
					};
					setPos(next);
					setDock(nextDock);
					save(LS_POS, JSON.stringify(next));
					save(LS_DOCK, nextDock);
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
			};
			/** Cycle dock: free -> right -> left -> free. */
			const cycleDock = () => {
				setDock((prev) => {
					const next = prev === "free" ? "right" : prev === "right" ? "left" : "free";
					save(LS_DOCK, next);
					if (next !== "free") {
						const w = widthRef.current;
						const p = {
							x: next === "right" ? window.innerWidth - w - WINDOW_MARGIN : WINDOW_MARGIN,
							y: posRef.current.y
						};
						setPos(p);
						save(LS_POS, JSON.stringify(p));
					}
					return next;
				});
			};
			(0, react.useEffect)(() => {
				if (!open) return void 0;
				const panel = panelRef.current;
				if (panel === null) return void 0;
				let startRight = 0;
				const onMove = (event) => {
					const next = clampPanelWidth(startRight - event.clientX, window.innerWidth);
					setWidth(next);
					save(LS_WIDTH, String(next));
					setPos((prev) => {
						const p = {
							x: dockRef.current === "right" ? window.innerWidth - next - WINDOW_MARGIN : startRight - next,
							y: prev.y
						};
						save(LS_POS, JSON.stringify(p));
						return p;
					});
				};
				const onUp = () => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
				};
				const handle = panel.querySelector("[data-dmg-resize]");
				if (handle === null) return void 0;
				const onDown = (event) => {
					event.preventDefault();
					startRight = panel.getBoundingClientRect().right;
					window.addEventListener("pointermove", onMove);
					window.addEventListener("pointerup", onUp);
				};
				handle.addEventListener("pointerdown", onDown);
				return () => {
					handle.removeEventListener("pointerdown", onDown);
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
				};
			}, [open]);
			/** Drag the launcher button; a click (no travel) opens the window instead. */
			const startLauncherDrag = (event) => {
				event.preventDefault();
				const startX = event.clientX;
				const startY = event.clientY;
				const start = launcherPosRef.current;
				let moved = false;
				const onMove = (move) => {
					const dx = move.clientX - startX;
					const dy = move.clientY - startY;
					if (!moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) moved = true;
					if (moved) setLauncherPos(() => clampLauncherPos({
						x: start.x + dx,
						y: start.y + dy
					}));
				};
				const onUp = (up) => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
					if (!moved) return;
					suppressClick.current = true;
					const next = clampLauncherPos({
						x: start.x + up.clientX - startX,
						y: start.y + up.clientY - startY
					});
					setLauncherPos(next);
					save(LS_LAUNCHER, JSON.stringify(next));
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
			};
			if (!open) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dmg-launcher",
				style: {
					left: `${launcherPos.x}px`,
					top: `${launcherPos.y}px`
				},
				"aria-label": "打开小游戏",
				title: "小游戏",
				onPointerDown: startLauncherDrag,
				onClick: () => {
					if (suppressClick.current) {
						suppressClick.current = false;
						return;
					}
					toggleOpen(true);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					children: "🎮"
				})
			});
			const games = getGames();
			const height = windowHeight(window.innerHeight);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: panelRef,
				className: "dmg-float",
				style: {
					left: `${pos.x}px`,
					top: `${pos.y}px`,
					width: `${width}px`,
					height: `${height}px`
				},
				"data-dock": dock,
				"data-open": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						"data-dmg-resize": true,
						className: "dmg-resize",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dmg-header dmg-float-header",
						onPointerDown: startDrag,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dmg-title",
								children: "🎮 小游戏"
							}),
							activeGame !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dmg-score",
								children: `${activeGame.title} · 最高 ${best[activeGame.id] ?? 0}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dmg-header-actions",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dmg-icon-btn",
										title: dock === "free" ? "吸附到屏幕边缘" : "取消吸附，恢复自由浮动",
										onClick: cycleDock,
										children: dock === "free" ? "📌 吸附" : "📌 已吸附"
									}),
									activeGame !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dmg-icon-btn",
										onClick: () => setGameId(null),
										children: "选游戏"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dmg-icon-btn",
										onClick: () => toggleOpen(false),
										children: "✕ 隐藏"
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dmg-body",
						children: activeGame === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dmg-picker",
							children: games.map((game) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dmg-card",
								onClick: () => selectGame(game.id),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dmg-card-icon",
										children: game.icon
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dmg-card-title",
										children: game.title
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dmg-card-desc",
										children: game.description
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dmg-card-best",
										children: ["最高分 ", best[game.id] ?? 0]
									})
								]
							}, game.id))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GameArea, {
							game: activeGame,
							onScore: (score) => onScore(activeGame, score)
						}, activeGame.id)
					})
				]
			});
		}
		/**
		* Mounts one game into a sized host div and drives its lifecycle: create +
		* start on mount, pause whenever the window is hidden or the tab is hidden
		* or the user paused, resume otherwise, destroy on unmount. The host div is
		* focusable and owns keyboard input while focused, so typing in the chat
		* composer is never hijacked by the game.
		*/
		function GameArea({ game, onScore }) {
			const hostRef = (0, react.useRef)(null);
			const instanceRef = (0, react.useRef)(null);
			const [userPaused, setUserPaused] = (0, react.useState)(false);
			const [announcing, setAnnouncing] = (0, react.useState)(true);
			(0, react.useEffect)(() => {
				const host = hostRef.current;
				if (host === null) return void 0;
				const instance = game.create(host, { onScore });
				instanceRef.current = instance;
				instance.start();
				host.focus({ preventScroll: true });
				return () => {
					instance.destroy();
					instanceRef.current = null;
				};
			}, [game]);
			(0, react.useEffect)(() => {
				setAnnouncing(true);
			}, [game.id]);
			(0, react.useEffect)(() => {
				if (!announcing) return void 0;
				const timer = window.setTimeout(() => {
					setAnnouncing(false);
				}, 1e4);
				return () => {
					window.clearTimeout(timer);
				};
			}, [announcing]);
			(0, react.useEffect)(() => {
				if (!announcing) return void 0;
				const onKey = () => {
					setAnnouncing(false);
				};
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("keydown", onKey);
				};
			}, [announcing]);
			(0, react.useEffect)(() => {
				const apply = () => {
					const instance = instanceRef.current;
					if (instance === null) return;
					if (userPaused || document.hidden || announcing) instance.pause();
					else instance.resume();
				};
				apply();
				document.addEventListener("visibilitychange", apply);
				return () => document.removeEventListener("visibilitychange", apply);
			}, [
				userPaused,
				announcing,
				game.id
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dmg-game-area",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dmg-game-toolbar",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dmg-game-name",
							children: [
								game.icon,
								" ",
								game.title
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dmg-icon-btn",
							onClick: () => setUserPaused((prev) => !prev),
							children: userPaused ? "继续 ▶" : "暂停 ⏸"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dmg-game-host-wrap",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: hostRef,
							className: "dmg-game-host",
							tabIndex: 0,
							"data-dmg-host": true
						}), announcing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dmg-announce",
							onClick: () => {
								setAnnouncing(false);
								hostRef.current?.focus({ preventScroll: true });
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dmg-announce-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dmg-announce-title",
										children: [
											game.icon,
											" ",
											game.title
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dmg-announce-desc",
										children: game.description
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dmg-announce-controls",
										children: game.controls.map((control) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dmg-control-tag",
											children: control
										}, control))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dmg-announce-hint",
										children: "点击此处或按任意键开始"
									})
								]
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dmg-game-controls",
						children: [game.controls.map((control) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dmg-control-tag",
							children: control
						}, control)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dmg-control-tag dmg-control-muted",
							children: "点击游戏区域获取键盘焦点"
						})]
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:E:\deepseek-harness\dsh-minigames\src\client\app.css.mjs
		const css = "/* dsh-minigames panel styles. All classes are dmg- prefixed to stay\n * collision-free in the host page; the stylesheet is injected by the client\n * bundle as one <style data-plugin> tag. Palette matches the DSH dark shell. */\n\n/* Floating window: draggable, edge-snapping, hideable. */\n.dmg-float {\n  position: fixed;\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  min-width: 360px;\n  min-height: 320px;\n  max-width: calc(100vw - 16px);\n  background: #15151b;\n  color: #d8d8e0;\n  border: 1px solid #3a3a45;\n  border-radius: 12px;\n  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);\n  overflow: hidden;\n  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;\n}\n\n.dmg-float-header {\n  cursor: grab;\n  touch-action: none;\n  user-select: none;\n}\n\n.dmg-float-header:active {\n  cursor: grabbing;\n}\n\n/* Floating launcher shown while the window is hidden; draggable (left/top\n * come from inline styles), a click without travel opens the window. */\n.dmg-launcher {\n  position: fixed;\n  z-index: 2147482900;\n  width: 46px;\n  height: 46px;\n  border-radius: 50%;\n  border: 1px solid #3a3a45;\n  background: #1b1b22;\n  color: #d8d8e0;\n  font-size: 22px;\n  line-height: 1;\n  cursor: grab;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);\n  transition: transform 0.12s ease, background 0.12s ease;\n  padding: 0;\n  touch-action: none;\n  user-select: none;\n  -webkit-user-select: none;\n}\n\n.dmg-launcher:hover {\n  transform: scale(1.08);\n  background: #23232c;\n}\n\n.dmg-launcher:active {\n  cursor: grabbing;\n}\n\n.dmg-rail {\n  position: fixed;\n  right: 0;\n  top: 50%;\n  transform: translateY(-50%);\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 4px;\n  width: 36px;\n  padding: 10px 0;\n  background: #1b1b22;\n  border: 1px solid #3a3a45;\n  border-right: none;\n  border-radius: 10px 0 0 10px;\n  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.35);\n  color: #d8d8e0;\n  cursor: pointer;\n  user-select: none;\n}\n\n.dmg-rail:hover {\n  background: #23232c;\n}\n\n.dmg-rail-icon {\n  font-size: 18px;\n  line-height: 1;\n}\n\n.dmg-rail-text {\n  writing-mode: vertical-rl;\n  font-size: 11px;\n  letter-spacing: 2px;\n  color: #9a9aa5;\n}\n\n.dmg-panel {\n  position: fixed;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  min-width: 360px;\n  background: #15151b;\n  color: #d8d8e0;\n  border-left: 1px solid #3a3a45;\n  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);\n  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;\n}\n\n.dmg-resize {\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  width: 5px;\n  cursor: ew-resize;\n  z-index: 1;\n}\n\n.dmg-header {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 12px;\n  background: #1b1b22;\n  border-bottom: 1px solid #26262e;\n  flex: 0 0 auto;\n}\n\n.dmg-title {\n  font-weight: 600;\n  font-size: 14px;\n  white-space: nowrap;\n}\n\n.dmg-score {\n  margin-left: auto;\n  font-size: 12px;\n  color: #9a9aa5;\n  white-space: nowrap;\n}\n\n.dmg-header-actions {\n  display: flex;\n  gap: 6px;\n  flex: 0 0 auto;\n}\n\n.dmg-icon-btn {\n  background: none;\n  border: 1px solid #3a3a45;\n  color: #d8d8e0;\n  border-radius: 6px;\n  padding: 3px 10px;\n  cursor: pointer;\n  font-size: 12px;\n  font-family: inherit;\n}\n\n.dmg-icon-btn:hover {\n  background: #23232c;\n}\n\n.dmg-body {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  overflow: auto;\n  padding: 12px;\n  min-height: 0;\n}\n\n.dmg-picker {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));\n  gap: 10px;\n}\n\n.dmg-card {\n  background: #1b1b22;\n  border: 1px solid #3a3a45;\n  border-radius: 10px;\n  padding: 14px 10px;\n  cursor: pointer;\n  text-align: center;\n  color: inherit;\n  font-family: inherit;\n}\n\n.dmg-card:hover {\n  border-color: #5a5a6a;\n  background: #23232c;\n}\n\n.dmg-card-icon {\n  font-size: 30px;\n  line-height: 1;\n}\n\n.dmg-card-title {\n  font-weight: 600;\n  margin: 8px 0 4px;\n  font-size: 13px;\n}\n\n.dmg-card-desc {\n  font-size: 11px;\n  color: #9a9aa5;\n  line-height: 1.45;\n  min-height: 48px;\n}\n\n.dmg-card-best {\n  margin-top: 8px;\n  font-size: 11px;\n  color: #7a7a8a;\n}\n\n.dmg-game-area {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  min-height: 0;\n}\n\n.dmg-game-toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  flex: 0 0 auto;\n}\n\n.dmg-game-name {\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.dmg-game-toolbar .dmg-icon-btn {\n  margin-left: auto;\n}\n\n.dmg-game-host {\n  flex: 1;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 100%;\n  min-height: 0;\n  outline: none;\n}\n\n.dmg-game-canvas {\n  width: 100%;\n  max-width: 640px;\n  height: auto;\n  background: #15151b;\n  border-radius: 6px;\n  border: 1px solid #26262e;\n}\n\n.dmg-game-controls {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  justify-content: center;\n  flex: 0 0 auto;\n  max-width: 100%;\n}\n\n.dmg-control-tag {\n  font-size: 11px;\n  color: #9a9aa5;\n  background: #1b1b22;\n  border: 1px solid #2e2e38;\n  border-radius: 4px;\n  padding: 2px 8px;\n  white-space: nowrap;\n}\n\n.dmg-control-muted {\n  color: #7a7a8a;\n  border-style: dashed;\n}\n\n/* Entry announcement: covers the game host until dismissed. */\n.dmg-game-host-wrap {\n  position: relative;\n  flex: 1;\n  display: flex;\n  width: 100%;\n  min-height: 0;\n}\n\n.dmg-game-host-wrap .dmg-game-host {\n  flex: 1;\n}\n\n.dmg-announce {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: rgba(10, 10, 14, 0.72);\n  backdrop-filter: blur(2px);\n  border-radius: 6px;\n  cursor: pointer;\n  z-index: 5;\n}\n\n.dmg-announce-card {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 10px;\n  max-width: min(420px, 88%);\n  background: #1b1b22;\n  border: 1px solid #3a3a46;\n  border-radius: 10px;\n  padding: 18px 22px;\n  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);\n}\n\n.dmg-announce-title {\n  font-size: 16px;\n  font-weight: 700;\n}\n\n.dmg-announce-desc {\n  font-size: 13px;\n  line-height: 1.6;\n  color: #b8b8c2;\n  text-align: center;\n}\n\n.dmg-announce-controls {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  justify-content: center;\n  max-width: 100%;\n}\n\n.dmg-announce-hint {\n  font-size: 11px;\n  color: #7a7a8a;\n}\n";
		const tagId = "@dsh-external/dsh-minigames/app.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-external/dsh-minigames";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/update-check.ts
		/**
		* Client-side version check + click-to-update for the whale update chip.
		* Version query prefers the host same-origin endpoint (no GitHub CORS), then
		* the GitHub tags API / raw package.json as fallback.
		*/
		const PLUGIN_VERSION = "0.10.0";
		const MIRROR = "lhh010/dsh-minigames";
		const UPDATE_ID = "dsh-minigames";
		const PACKAGE_SPEC = "@dsh-external/dsh-minigames";
		function compareSemver(a, b) {
			const parse = (v) => {
				const p = v.replace(/^v/, "").split(".").map((x) => Number(x) || 0);
				while (p.length < 3) p.push(0);
				return p;
			};
			const pa = parse(a);
			const pb = parse(b);
			return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
		}
		async function latestFromHost() {
			try {
				const res = await fetch(`/${UPDATE_ID}/latest`, {
					method: "GET",
					signal: AbortSignal.timeout(9e3)
				});
				if (!res.ok) return void 0;
				const raw = await res.json();
				const latest = typeof raw.latest === "string" && /^v\d+\.\d+\.\d+$/.test(raw.latest) ? raw.latest : void 0;
				if (latest === void 0) return void 0;
				return {
					latest,
					dshVersion: typeof raw.dshVersion === "string" && raw.dshVersion !== "" ? raw.dshVersion : void 0,
					latestSupported: typeof raw.latestSupported === "string" && /^v\d+\.\d+\.\d+$/.test(raw.latestSupported) ? raw.latestSupported : void 0,
					compat: raw.compat === true
				};
			} catch {
				return;
			}
		}
		async function latestFromTags() {
			try {
				const res = await fetch(`https://api.github.com/repos/${MIRROR}/tags?per_page=10`, {
					headers: { accept: "application/vnd.github+json" },
					signal: AbortSignal.timeout(8e3)
				});
				if (!res.ok) return void 0;
				const tags = await res.json();
				if (!Array.isArray(tags)) return void 0;
				const stable = tags.map((e) => e.name).filter((n) => typeof n === "string" && /^v\d+\.\d+\.\d+$/.test(n));
				if (stable.length === 0) return void 0;
				return stable.reduce((newest, t) => compareSemver(t, newest) > 0 ? t : newest);
			} catch {
				return;
			}
		}
		async function latestFromRaw() {
			try {
				const res = await fetch(`https://raw.githubusercontent.com/${MIRROR}/main/package.json`, { signal: AbortSignal.timeout(8e3) });
				if (!res.ok) return void 0;
				const version = (await res.json()).version;
				return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? `v${version}` : void 0;
			} catch {
				return;
			}
		}
		async function fetchUpdateInfo() {
			const [host, tags, raw] = await Promise.all([
				latestFromHost(),
				latestFromTags(),
				latestFromRaw()
			]);
			const latest = host?.latest ?? tags ?? raw;
			if (latest === void 0) return void 0;
			return {
				latest,
				dshVersion: host?.dshVersion,
				latestSupported: host?.latestSupported,
				compat: host?.compat
			};
		}
		/** Decide the update-chip message from the local version and the gated remote info. */
		function decideUpdate(local, info) {
			const { latest } = info;
			if (compareSemver(latest, local) <= 0) return {
				kind: "current",
				tag: latest
			};
			const dshVersion = info.dshVersion;
			if (dshVersion === void 0 || info.compat !== true) return {
				kind: "available",
				tag: latest
			};
			const supported = info.latestSupported !== void 0 && compareSemver(info.latestSupported, local) > 0 ? info.latestSupported : void 0;
			if (supported === void 0) return {
				kind: "blocked",
				tag: latest,
				dshVersion
			};
			if (compareSemver(supported, latest) >= 0) return {
				kind: "available",
				tag: latest
			};
			return {
				kind: "partial",
				tag: supported,
				blocked: latest,
				dshVersion
			};
		}
		function updatePrompt(tag) {
			return [
				`帮我更新 ${UPDATE_ID} 插件到 ${tag}，步骤：`,
				`0. 先执行 dsh --version 确认本地 DSH 版本，并对照 https://github.com/${MIRROR} 的 README「版本兼容」表——不同 DSH 版本需安装不同插件 tag，装错版本会启动崩溃；若本提示词给的 tag 与你的 DSH 版本不匹配，请改装表中对应 tag`,
				`1. 执行 dsh plugin --profile web add '${PACKAGE_SPEC}@github:${MIRROR}#${tag}'（首次可能被 pnpm 11 拦截构建脚本，则先在 ~/.dsh/profiles/web 执行 pnpm approve-builds --all）`,
				"2. 完成后提醒我硬刷新浏览器（Ctrl/Cmd+Shift+R）",
				`3. 遇到安装失败 / 版本不匹配 / 启动报错：先查 https://github.com/${MIRROR} README 的「版本兼容」与「已知限制」章节再排查`
			].join("\n");
		}
		async function runUpdate(tag) {
			try {
				const res = await fetch(`/${UPDATE_ID}/update`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-dsh-plugin-update": "click"
					},
					body: JSON.stringify({ tag }),
					signal: AbortSignal.timeout(13e4)
				});
				const parsed = await res.json().catch(() => ({}));
				return {
					ok: res.ok && parsed.ok === true,
					detail: typeof parsed.output === "string" ? parsed.output : parsed.error ?? String(res.status),
					link: parsed.link === true,
					...typeof parsed.recovery === "string" ? { recovery: parsed.recovery } : {},
					...parsed.hostChanged === true ? { hostChanged: true } : {}
				};
			} catch (e) {
				return {
					ok: false,
					detail: String(e?.message ?? e)
				};
			}
		}
		//#endregion
		//#region src/client/update-chip.ts
		/**
		* Floating update chip: appears once when a newer version exists; click updates
		* via the host endpoint (falling back to copying the prompt). Self-contained
		* fixed DOM with a close (×) button; all `[data-update-chip]` elements across
		* plugins are stacked into one non-overlapping column by a shared relayout, so
		* update prompts never overlap each other. When the version check fails
		* (network unreachable), a neutral gray chip with a retry button shows instead.
		*/
		let started = false;
		function startUpdateChip() {
			if (started) return;
			started = true;
			checkOnce();
		}
		async function checkOnce() {
			const info = await fetchUpdateInfo();
			if (info === void 0) {
				renderOfflineChip();
				return;
			}
			const notice = decideUpdate(PLUGIN_VERSION, info);
			if (notice.kind === "current") {
				renderCurrentChip(notice.tag);
				return notice;
			}
			if (notice.kind === "available") {
				renderChip(notice.tag);
				return notice;
			}
			if (notice.kind === "partial") {
				renderChip(notice.tag, notice);
				return notice;
			}
			renderBlockedChip(notice.tag, notice.dshVersion);
			return notice;
		}
		/** Reflow every visible update chip into a non-overlapping vertical column. */
		function relayout() {
			const chips = Array.from(document.querySelectorAll("[data-update-chip]"));
			let next = 12;
			for (const chip of chips) {
				chip.style.bottom = `${next}px`;
				next += chip.getBoundingClientRect().height + 8;
			}
		}
		const LABEL = "小游戏";
		function renderChip(tag, partial) {
			if (document.querySelector(`[data-update-chip="dsh-minigames"]`) !== null) return;
			const el = document.createElement("div");
			el.setAttribute("data-update-chip", UPDATE_ID);
			el.setAttribute("role", "button");
			el.setAttribute("title", partial === void 0 ? `更新到 ${tag}` : `更新到 ${tag}（另有 ${partial.blocked} 需要更高 DSH 版本，当前 DSH ${partial.dshVersion} 不支持）`);
			el.style.cssText = "position:fixed;left:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #4a7dff;border-radius:10px;background:#1e2430;color:#cfe0ff;font:12px/1.4 system-ui,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);";
			const label = document.createElement("span");
			label.style.cssText = "pointer-events:none;";
			label.textContent = partial === void 0 ? `⟳ ${LABEL} 新版本 ${tag} 可用，点击更新` : `⟳ ${LABEL} 新版本 ${tag} 可用（${partial.blocked} 需更高 DSH）`;
			const close = document.createElement("button");
			close.textContent = "×";
			close.setAttribute("aria-label", "关闭");
			close.title = "关闭";
			close.style.cssText = "pointer-events:auto;border:0;background:transparent;color:#8fa3c8;font:inherit;cursor:pointer;padding:0 2px;line-height:1;";
			close.addEventListener("click", (event) => {
				event.stopPropagation();
				el.remove();
				relayout();
			});
			el.appendChild(label);
			el.appendChild(close);
			el.addEventListener("pointerdown", (event) => {
				event.stopPropagation();
			});
			el.addEventListener("click", () => {
				label.textContent = "更新中…";
				runUpdate(tag).then((result) => {
					if (result.ok) {
						label.textContent = result.hostChanged === true ? `已更新到 ${tag}（含宿主侧变更），请重启 dsh 生效` : `已更新到 ${tag}，客户端自动刷新生效（未见变化可硬刷新 Ctrl/Cmd+Shift+R）`;
						el.setAttribute("title", "已更新，硬刷新生效");
						return;
					}
					if (result.link) {
						navigator.clipboard?.writeText(updatePrompt(tag)).then(() => {
							label.textContent = `本地 link 安装：已跳过自动更新，更新提示词已复制到剪贴板`;
						}).catch(() => {
							label.textContent = `本地 link：请手动执行 pnpm add '${PACKAGE_SPEC}@github:${MIRROR}#${tag}'`;
						});
						el.setAttribute("title", "悬停查看本地 link 说明");
						return;
					}
					navigator.clipboard?.writeText(updatePrompt(tag)).then(() => {
						label.textContent = `自动更新失败（详见剪贴板提示词）：${result.detail.slice(0, 80)}`;
					}).catch(() => {
						label.textContent = `自动更新失败：${result.detail.slice(0, 80)}`;
					});
					el.setAttribute("title", result.recovery !== void 0 ? `${result.detail}\n恢复命令：${result.recovery}` : result.detail);
				});
			});
			document.body.appendChild(el);
			relayout();
		}
		/** Neutral gray chip shown when the version check cannot reach the network. */
		function renderOfflineChip() {
			if (document.querySelector(`[data-update-chip="dsh-minigames"]`) !== null) return;
			const el = document.createElement("div");
			el.setAttribute("data-update-chip", UPDATE_ID);
			el.setAttribute("title", "无法连接宿主端点 / GitHub 查询新版本（可能是网络不可达）");
			el.style.cssText = "position:fixed;left:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #4a5060;border-radius:10px;background:#22252c;color:#9aa3b5;font:12px/1.4 system-ui,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);";
			const label = document.createElement("span");
			label.style.cssText = "pointer-events:none;";
			label.textContent = `⚠ ${LABEL} 版本检查失败（网络不可达），点击重试`;
			const retry = document.createElement("button");
			retry.textContent = "重试";
			retry.setAttribute("aria-label", "重试版本检查");
			retry.style.cssText = "pointer-events:auto;border:0;background:transparent;color:#8fa3c8;font:inherit;cursor:pointer;padding:0 2px;line-height:1;";
			const close = document.createElement("button");
			close.textContent = "×";
			close.setAttribute("aria-label", "关闭");
			close.title = "关闭";
			close.style.cssText = "pointer-events:auto;border:0;background:transparent;color:#8fa3c8;font:inherit;cursor:pointer;padding:0 2px;line-height:1;";
			close.addEventListener("click", (event) => {
				event.stopPropagation();
				el.remove();
				relayout();
			});
			el.appendChild(label);
			el.appendChild(retry);
			el.appendChild(close);
			let retrying = false;
			const retryOnce = () => {
				if (retrying) return;
				retrying = true;
				label.textContent = "版本检查中…";
				checkOnce().then((notice) => {
					retrying = false;
					if (notice === void 0) {
						label.textContent = `⚠ ${LABEL} 仍无法查询新版本`;
						return;
					}
					el.remove();
					relayout();
				});
			};
			retry.addEventListener("click", (event) => {
				event.stopPropagation();
				retryOnce();
			});
			el.addEventListener("click", (event) => {
				if (event.target.closest("button") === null) retryOnce();
			});
			document.body.appendChild(el);
			relayout();
		}
		/** Amber informational chip: the newest release needs a DSH version this host does not run. */
		function renderBlockedChip(tag, dshVersion) {
			if (document.querySelector(`[data-update-chip="dsh-minigames"]`) !== null) return;
			const el = document.createElement("div");
			el.setAttribute("data-update-chip", UPDATE_ID);
			el.setAttribute("title", `新版本 ${tag} 支持更高的 DSH 版本，但不支持当前 DSH ${dshVersion}；升级 DSH 后再更新插件`);
			el.style.cssText = "position:fixed;left:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #8a6d2f;border-radius:10px;background:#2d2718;color:#e8cf9a;font:12px/1.4 system-ui,Segoe UI,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);";
			const label = document.createElement("span");
			label.style.cssText = "pointer-events:none;";
			label.textContent = `⧗ ${LABEL} 新版本 ${tag} 支持更高 DSH 版本，当前 DSH ${dshVersion} 暂不可用`;
			const close = document.createElement("button");
			close.textContent = "×";
			close.setAttribute("aria-label", "关闭");
			close.title = "关闭";
			close.style.cssText = "pointer-events:auto;border:0;background:transparent;color:#b7a677;font:inherit;cursor:pointer;padding:0 2px;line-height:1;";
			close.addEventListener("click", (event) => {
				event.stopPropagation();
				el.remove();
				relayout();
			});
			el.appendChild(label);
			el.appendChild(close);
			el.addEventListener("pointerdown", (event) => {
				event.stopPropagation();
			});
			document.body.appendChild(el);
			relayout();
		}
		/** Transient confirmation when the check succeeds and we are already current. */
		function renderCurrentChip(tag) {
			if (document.querySelector(`[data-update-chip="dsh-minigames"]`) !== null) return;
			const el = document.createElement("div");
			el.setAttribute("data-update-chip", UPDATE_ID);
			el.setAttribute("title", "版本检查成功，当前已是最新版本");
			el.style.cssText = "position:fixed;left:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #2f5d3a;border-radius:10px;background:#1c2a22;color:#9fd8ae;font:12px/1.4 system-ui,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);";
			const label = document.createElement("span");
			label.style.cssText = "pointer-events:none;";
			label.textContent = `✓ ${LABEL} 已是最新版本 ${tag}`;
			el.appendChild(label);
			el.addEventListener("pointerdown", (event) => {
				event.stopPropagation();
			});
			el.addEventListener("click", () => {
				el.remove();
				relayout();
			});
			document.body.appendChild(el);
			relayout();
			setTimeout(() => {
				el.remove();
				relayout();
			}, 4e3);
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* dsh-minigames client half: mounts the right-side game panel as a
		* self-contained DOM portal (no host services, no layout slots — the panel
		* lives on document.body and manages its own geometry). The bundle registers
		* via window.__ModuleLoader__.load with id = package name; the client runtime
		* mounts it as a cordis plugin and calls apply once the loader tree settles.
		*/
		/**
		* Mount the panel portal for the lifetime of the plugin fiber. The effect
		* returns the disposer cordis runs on teardown (HMR, plugin unload).
		* @param ctx - the browser-side cordis context.
		*/
		/** No host services are required. */
		const inject = [];
		/** Bundle identity (informational; the module loader keys on the package name). */
		const name = "dsh-minigames-client";
		function apply(ctx) {
			startUpdateChip();
			ctx.effect(() => {
				const host = document.createElement("div");
				host.setAttribute("data-dsh-minigames", "");
				document.body.appendChild(host);
				let root;
				try {
					root = (0, react_dom_client.createRoot)(host);
					root.render((0, react.createElement)(MiniGamePanel));
				} catch (error) {
					ctx.logger.error("[dsh-minigames] panel mount failed:", error);
				}
				return () => {
					root?.unmount();
					host.remove();
				};
			}, "dsh-minigames: panel mount");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map