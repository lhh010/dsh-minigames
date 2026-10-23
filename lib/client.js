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
		const GRAVITY$3 = 2100;
		const JUMP_V = -640;
		const BASE_SPEED$2 = 320;
		const MAX_SPEED$1 = 760;
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
				speed: BASE_SPEED$2,
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
		function step$2(state, dt, input) {
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
			state.speed = Math.min(MAX_SPEED$1, BASE_SPEED$2 + state.score * SPEED_PER_SCORE);
			const dino = state.dino;
			if (input.jump && dino.onGround) {
				dino.vy = JUMP_V;
				dino.onGround = false;
			}
			if (!dino.onGround) {
				dino.vy += GRAVITY$3 * dt;
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
		const particles$23 = createParticles();
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
			drawGround(ctx, state, p);
			for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.t, p);
			drawDino(ctx, state, p);
			if (state.raining) {
				drawFog(ctx, state, p);
				drawRain(ctx, state, p);
			}
			if (state.over && !prevOver$3) particles$23.burst(state.dino.x + 23, state.dino.y + 25, THEME.bad, 16, 170);
			prevOver$3 = state.over;
			particles$23.tick(ctx, dt);
			hudPair(ctx, 588, 22, "", String(Math.floor(state.score)).padStart(5, "0"), "right", p.text);
			if (state.over) drawGameOver(ctx, state);
			if (state.lightning > 0) {
				ctx.fillStyle = `rgba(255,255,255,${Math.min(.95, state.lightning).toFixed(3)})`;
				ctx.fillRect(0, 0, 600, 185);
			}
		}
		/** Drifting fog: a translucent wash plus soft blobs that obscure the view. */
		function drawFog(ctx, state, p) {
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
		function drawGround(ctx, state, p) {
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
			let running = false;
			let raf = 0;
			let last = 0;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				step$2(state, dt, {
					jump: jumpEdge,
					duck: duckHeld
				});
				jumpEdge = false;
				if (state.over && overSince === 0) {
					overSince = now;
					reportScore();
				}
				reportScore();
				renderDino(ctx, state);
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
			const reset = () => {
				state = createDinoState();
				overSince = 0;
				jumpEdge = false;
				duckHeld = false;
				lastScore = -1;
				reportScore();
				if (running) startLoop();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			canvas.addEventListener("click", onClick);
			focusGameHost(host);
			running = true;
			startLoop();
			renderDino(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const CELL$15 = 22;
		const MINI = 14;
		const BOARD_W$12 = 220;
		const BOARD_H$10 = 440;
		/** Full logical canvas width: the board plus the preview column. */
		const LOGICAL_W$21 = 332;
		const PREVIEW_X = 236;
		const PREVIEW_W = 88;
		/** Kind id -> fill color (stable accent per piece type). */
		function kindColor(kind) {
			return accent(kind);
		}
		const GRID_LINE$1 = THEME.panelEdge;
		const particles$22 = createParticles();
		let prevLines = -1;
		let lastFrame$5 = 0;
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
				ctx.fillRect(x + 3, y + CELL$15 - 5, 16, 2);
			}
			ctx.globalAlpha = 1;
		}
		function drawShape(ctx, shape, px, py, kind, alpha = 1, ghost = false) {
			for (let r = 0; r < shape.length; r += 1) for (let c = 0; c < shape[r].length; c += 1) {
				if (shape[r][c] === 0) continue;
				drawCell(ctx, px + c * CELL$15, py + r * CELL$15, kindColor(kind), alpha, ghost);
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
			drawShape(ctx, shape, PREVIEW_X + Math.floor((PREVIEW_W - shape[0].length * CELL$15) / 2), y + 6 + Math.floor((66 - shape.length * CELL$15) / 2), piece.kind);
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
		/** Draw one frame of the game. */
		function renderTetris(ctx, state) {
			const width = LOGICAL_W$21;
			ctx.clearRect(0, 0, width, 448);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$5 === 0 ? 16 : now - lastFrame$5);
			lastFrame$5 = now;
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
				ctx.moveTo(c * CELL$15 + .5, 0);
				ctx.lineTo(c * CELL$15 + .5, BOARD_H$10);
				ctx.stroke();
			}
			for (let r = 1; r < 20; r += 1) {
				ctx.beginPath();
				ctx.moveTo(0, r * CELL$15 + .5);
				ctx.lineTo(BOARD_W$12, r * CELL$15 + .5);
				ctx.stroke();
			}
			for (let r = 0; r < 20; r += 1) for (let c = 0; c < 10; c += 1) {
				const kind = state.grid[r][c];
				if (kind !== 0) drawCell(ctx, c * CELL$15, r * CELL$15, kindColor(kind), 1, false, false);
			}
			if (state.current !== null) {
				const piece = state.current;
				const gy = ghostY(state);
				if (gy !== piece.y) drawShape(ctx, piece.shape, piece.x * CELL$15, gy * CELL$15, piece.kind, .35, true);
				drawShape(ctx, piece.shape, piece.x * CELL$15, piece.y * CELL$15, piece.kind);
			}
			if (prevLines >= 0 && state.lines > prevLines) for (let i = 0; i < 3; i += 1) particles$22.burst(BOARD_W$12 / 2 + (i - 1) * BOARD_W$12 / 3, BOARD_H$10 * .75, THEME.gold, 12, 160);
			prevLines = state.lines;
			particles$22.tick(ctx, dt);
			drawNextQueue(ctx, state);
			drawHold(ctx, state.hold, 276);
			hudPair(ctx, PREVIEW_X, 372, "得分 ", String(state.score), "left", THEME.text);
			hudPair(ctx, PREVIEW_X, 390, "行数 ", `${state.lines}`, "left", THEME.text);
			hudPair(ctx, PREVIEW_X, 408, "等级 ", String(state.level), "left", THEME.text);
			if (state.over) drawOverlay(ctx, BOARD_W$12, BOARD_H$10, "GAME OVER", `得分 ${state.score} · R 重新开始`, THEME.bad);
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$21, 448);
			if (fit === null) throw new Error("dsh-minigames: tetris needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createTetrisState();
			let running = false;
			let raf = 0;
			let last = 0;
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
				if (!running && event.code !== "KeyP" && event.code !== "KeyR") return;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				if (!state.over && state.current !== null && isLanded(state)) {
					if (landedAt === null) landedAt = now;
					if (now - landedAt >= LOCK_DELAY_MS) {
						lock(state);
						landedAt = null;
						lockResets = 0;
						gravityAcc = 0;
						reportScore();
					}
					renderTetris(ctx, state);
					return;
				}
				landedAt = null;
				lockResets = 0;
				gravityAcc += dt * 1e3;
				const interval = gravityInterval(state.level);
				while (gravityAcc >= interval && !state.over) {
					gravityAcc -= interval;
					if (!move(state, 0, 1)) {
						gravityAcc = 0;
						reportScore();
						if (state.over) break;
					}
				}
				renderTetris(ctx, state);
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
			const reset = () => {
				state = createTetrisState();
				gravityAcc = 0;
				landedAt = null;
				lockResets = 0;
				lastScore = -1;
				reportScore();
				if (running) startLoop();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				stopLoop();
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
			renderTetris(ctx, state);
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
		/** Tank collision inset in px: the effective body is TILE - 2*INSET, letting
		* tanks fit and turn in lanes a hair tighter than a full tile. */
		const TANK_INSET = 3;
		/** Perpendicular-axis snap range after a turn (px) — keeps the tank on-grid. */
		const LANE_SNAP = 4;
		const SPAWN_INTERVAL = 1.6;
		const PLAYER_SPEED$2 = 120;
		const ENEMY_SPEED = 82;
		/** Seconds of invulnerability a freshly spawned enemy gets (spawn flash). */
		const ENEMY_SPAWN_INVULN = .7;
		const PLAYER_FIRE_CD = .4;
		const ENEMY_FIRE_CD_MIN = 1.2;
		const BULLET_SPEED_PLAYER = 260;
		const BULLET_SPEED_ENEMY = 170;
		const AI_TICK = .7;
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
		const PLAYER_START = [7, 11];
		/** Symmetric field; the three spawn tiles and the player start are cleared below. */
		const BASE_MAP = [
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
		];
		function buildGrid() {
			const grid = BASE_MAP.map((row) => [...row]);
			for (const [tx, ty] of SPAWN_POCKETS) grid[ty][tx] = 0;
			return grid;
		}
		/** A fresh world at wave 1. */
		function createWorld(rng = Math.random) {
			return {
				grid: buildGrid(),
				player: {
					id: 0,
					kind: "player",
					x: PLAYER_START[0] * 32,
					y: PLAYER_START[1] * 32,
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
				result: "none",
				t: 0,
				rng
			};
		}
		/** Grid tile at tile coords; out of bounds counts as solid steel. */
		function tileAt(grid, tx, ty) {
			if (tx < 0 || tx >= 15 || ty < 0 || ty >= 13) return 2;
			return grid[ty][tx];
		}
		/**
		* Tile span of a tank's effective collision body: the full tile inset by
		* {@link TANK_INSET} on every side, so the tank fits lanes that are a hair
		* tighter than a full tile and can still turn there.
		*/
		function insetTiles(x, y) {
			return {
				tx0: Math.floor((x + TANK_INSET) / 32),
				tx1: Math.floor((x + 32 - 1 - TANK_INSET) / 32),
				ty0: Math.floor((y + TANK_INSET) / 32),
				ty1: Math.floor((y + 32 - 1 - TANK_INSET) / 32)
			};
		}
		/** Whether every tile the tank's (inset) body overlaps is walkable. */
		function rectWalkable(grid, x, y) {
			const { tx0, tx1, ty0, ty1 } = insetTiles(x, y);
			for (let ty = ty0; ty <= ty1; ty += 1) for (let tx = tx0; tx <= tx1; tx += 1) if (tileAt(grid, tx, ty) !== 0) return false;
			return true;
		}
		/** AABB overlap between two tanks (shrunk so neighbours can pass). */
		function tanksOverlap(a, b) {
			const pad = TANK_INSET;
			return a.x + pad < b.x + 32 - pad && a.x + 32 - pad > b.x + pad && a.y + pad < b.y + 32 - pad && a.y + 32 - pad > b.y + pad;
		}
		/** Try to move a tank by dist px in dir; blocked by walls and other tanks. */
		function tryMove(state, tank, dir, dist) {
			const nx = tank.x + DIR_DX[dir] * dist;
			const ny = tank.y + DIR_DY[dir] * dist;
			if (!rectWalkable(state.grid, nx, ny)) {
				snapToNextBoundary(tank, dir, dist + TANK_INSET);
				return false;
			}
			for (const other of [state.player, ...state.enemies]) {
				if (other === tank || !other.alive) continue;
				if (tanksOverlap({
					...tank,
					x: nx,
					y: ny
				}, other)) {
					snapToNextBoundary(tank, dir, dist + TANK_INSET);
					return false;
				}
			}
			tank.x = nx;
			tank.y = ny;
			tank.dir = dir;
			snapToNextBoundary(tank, dir, dist);
			return true;
		}
		/** Snap the tank to the next boundary in its driving direction when within
		* `range` px of it (the "boundary ahead"): the tank arrives exactly on-grid
		* instead of overshooting or parking at a half-tile offset. */
		function snapToNextBoundary(tank, dir, range) {
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
		function canAdvance(state, tank, dir) {
			const step = 30.4;
			const nx = tank.x + DIR_DX[dir] * step;
			const ny = tank.y + DIR_DY[dir] * step;
			if (!rectWalkable(state.grid, nx, ny)) return false;
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
			const moved = tryMove(state, tank, targetDir, dist);
			if (turning && moved) snapPerpendicularIfClose(tank, targetDir);
			return moved;
		}
		/** Snap a just-turned tank's perpendicular axis onto the nearest grid line. */
		function snapPerpendicularIfClose(tank, newDir) {
			const vertical = newDir === 0 || newDir === 2;
			const value = vertical ? tank.x : tank.y;
			const boundary = Math.round(value / 32) * 32;
			if (Math.abs(value - boundary) <= LANE_SNAP) {
				if (vertical) tank.x = boundary;
				else tank.y = boundary;
			}
		}
		/** Spawn a bullet just outside the tank's front face in its facing direction. */
		function fire(state, tank, speed) {
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
				for (let ty = r0 + 1; ty < r1; ty += 1) if (tileAt(state.grid, tx, ty) !== 0) return false;
				return true;
			}
			const ty = Math.floor(ay / 32);
			const c0 = Math.min(Math.floor(ax / 32), Math.floor(bx / 32));
			const c1 = Math.max(Math.floor(ax / 32), Math.floor(bx / 32));
			for (let tx = c0 + 1; tx < c1; tx += 1) if (tileAt(state.grid, tx, ty) !== 0) return false;
			return true;
		}
		/** One enemy decision: shoot when aligned with a clear lane, else chase. */
		function decideEnemy(state, enemy) {
			const player = state.player;
			if (losClear(state, enemy, player)) {
				const ex = enemy.x + 16;
				const ey = enemy.y + 16;
				const px = player.x + 16;
				const py = player.y + 16;
				const facing = Math.abs(ex - px) < Math.abs(ey - py) ? py < ey ? 0 : 2 : px > ex ? 1 : 3;
				enemy.dir = facing;
				enemy.targetDir = facing;
				if (enemy.cooldown <= 0) fire(state, enemy, BULLET_SPEED_ENEMY);
				return;
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
			for (const dir of candidates) if (canAdvance(state, enemy, dir)) {
				enemy.targetDir = dir;
				return;
			}
		}
		function spawnEnemy(state) {
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
					invuln: ENEMY_SPAWN_INVULN
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
		function stepWorld(state, dt, input) {
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
					moveTank(state, player, player.targetDir, PLAYER_SPEED$2 * dt);
				} else player.targetDir = player.dir;
				if (input.fire) {
					player.cooldown = Math.max(0, player.cooldown - dt);
					if (player.cooldown <= 0) fire(state, player, BULLET_SPEED_PLAYER);
				}
				player.invuln = Math.max(0, player.invuln - dt);
			}
			state.aiTimer += dt;
			const decide = state.aiTimer >= AI_TICK;
			if (decide) state.aiTimer = 0;
			for (const enemy of state.enemies) {
				if (decide) decideEnemy(state, enemy);
				moveTank(state, enemy, enemy.targetDir, ENEMY_SPEED * dt);
				enemy.cooldown = Math.max(0, enemy.cooldown - dt);
				enemy.invuln = Math.max(0, enemy.invuln - dt);
			}
			if (state.spawnQueue > 0 && state.enemies.length < 3) {
				state.spawnTimer -= dt;
				if (state.spawnTimer <= 0) {
					spawnEnemy(state);
					state.spawnTimer = SPAWN_INTERVAL;
				}
			}
			const aliveBullets = [];
			for (const bullet of state.bullets) {
				const speed = bullet.owner === "player" ? BULLET_SPEED_PLAYER : BULLET_SPEED_ENEMY;
				bullet.x += DIR_DX[bullet.dir] * speed * dt;
				bullet.y += DIR_DY[bullet.dir] * speed * dt;
				let dead = false;
				const tx = Math.floor(bullet.x / 32);
				const ty = Math.floor(bullet.y / 32);
				const tile = tileAt(state.grid, tx, ty);
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
					state.spawnQueue = 5;
					state.spawnTimer = .8;
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
		const BRICK = "#8a5a3a";
		const BRICK_LIGHT = "#9c6a46";
		const BRICK_DARK = "#5f3c26";
		const STEEL = "#8a8a98";
		const STEEL_DARK = "#5c5c68";
		const TREAD = "#3a3a44";
		const BULLET_CORE = "#ffffff";
		const PLAYER = accent(0);
		const ENEMY = accent(4);
		const TANK_W = 480;
		const TANK_H = 416;
		const particles$21 = createParticles();
		let prevScore$9 = -1;
		let prevEffects = 0;
		let lastFrame$4 = 0;
		function drawTile$2(ctx, tx, ty, tile) {
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
			ctx.fillRect(cx - 4 + DIR_DX[tank.dir] * 12, cy - 4 + DIR_DY[tank.dir] * 12, 8, 8);
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
		/** Draw one frame of the battle. */
		function renderTanks(ctx, state) {
			ctx.clearRect(0, 0, TANK_W, TANK_H);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$4 === 0 ? 16 : now - lastFrame$4);
			lastFrame$4 = now;
			drawBackground(ctx, TANK_W, TANK_H);
			for (let ty = 0; ty < 13; ty += 1) for (let tx = 0; tx < 15; tx += 1) {
				const tile = state.grid[ty][tx];
				if (tile !== 0) drawTile$2(ctx, tx, ty, tile);
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
			if (state.score > prevScore$9 && state.effects.length > 0) {
				const e = state.effects[state.effects.length - 1];
				particles$21.burst(e.x, e.y, accent(7), 18, 150);
			} else if (state.effects.length > prevEffects) {
				const e = state.effects[state.effects.length - 1];
				particles$21.burst(e.x, e.y, THEME.gold, 8, 90);
			}
			prevScore$9 = state.score;
			prevEffects = state.effects.length;
			particles$21.tick(ctx, dt);
			for (const bullet of state.bullets) drawBullet$1(ctx, bullet);
			for (const enemy of state.enemies) drawTank(ctx, enemy, state.t);
			if (state.player.alive) drawTank(ctx, state.player, state.t);
			hudPair(ctx, 8, 16, `第 ${state.wave}/3 波 · `, `剩余敌人 ${state.enemies.length + state.spawnQueue}`);
			hudPair(ctx, 8, 32, "生命 ", "♥".repeat(Math.max(0, state.player.hp)), "left", THEME.bad);
			hudPair(ctx, 8, 48, "得分 ", String(state.score), "left", THEME.gold);
			if (state.result !== "none") drawOverlay(ctx, TANK_W, TANK_H, state.result === "win" ? "胜利！" : "GAME OVER", `得分 ${state.score} · 按 R 重新开始`, state.result === "win" ? THEME.good : THEME.bad);
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
			let world = createWorld();
			let running = false;
			let raf = 0;
			let last = 0;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				stepWorld(world, dt, input);
				reportScore();
				renderTanks(ctx, world);
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
			const reset = () => {
				world = createWorld();
				lastScore = -1;
				input.up = input.down = input.left = input.right = input.fire = false;
				reportScore();
				if (running) startLoop();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			startLoop();
			renderTanks(ctx, world);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		function shuffle$2(state) {
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
			shuffle$2(state);
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
		function advanceLevel$1(state) {
			state.level += 1;
			state.target = levelTarget(state.level);
			state.score = 0;
			state.result = "none";
			shuffle$2(state);
		}
		/** Restart the whole run from level 1. */
		function restart(state) {
			state.level = 1;
			state.target = levelTarget(1);
			state.score = 0;
			state.result = "none";
			shuffle$2(state);
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
		const particles$20 = createParticles();
		let prevScore$8 = -1;
		let prevFrameMs$11 = 0;
		function cellX$1(c) {
			return c * 44 + 22;
		}
		function cellY$1(r) {
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
		function drawHud(ctx, state) {
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
			const dtMs = prevFrameMs$11 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$11);
			prevFrameMs$11 = nowMs;
			ctx.clearRect(0, 0, 352, 392);
			drawBackground(ctx, 352, 392);
			ctx.fillStyle = BOARD_BG;
			ctx.fillRect(0, 40, 352, 352);
			drawHud(ctx, state);
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
					drawGem(ctx, kind, cellX$1(fall.from.c), cellY$1(fall.from.r) + (cellY$1(fall.to.r) - cellY$1(fall.from.r)) * k, 18.48);
				} else drawGem(ctx, kind, cellX$1(c), cellY$1(r), 18.48);
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
				ctx.fillText(clear.scoreText, 176, cellY$1(bottomRow) - 8 - clear.t * 22);
				ctx.globalAlpha = 1;
			}
			if (clear !== null && prevScore$8 >= 0 && state.score > prevScore$8 && clear.t < .2) {
				const cx = clear.removed.reduce((s, p) => s + cellX$1(p.c), 0) / clear.removed.length;
				const cy = clear.removed.reduce((s, p) => s + cellY$1(p.r), 0) / clear.removed.length;
				const kind = grid[clear.removed[0].r][clear.removed[0].c];
				particles$20.burst(cx, cy, GEM_COLORS[kind] ?? THEME.gold, 16, 150);
			}
			prevScore$8 = state.score;
			particles$20.tick(ctx, dtMs);
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
			}
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
			let raf = 0;
			let last = 0;
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
			};
			const onPointerDown = (event) => {
				if (!running) return;
				const cell = cellFromEvent(event);
				if (cell !== null) pop(cell);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
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
							restart(state);
							displayGrid = state.grid;
							reportScore();
							phase = "idle";
							phaseT = 0;
						}
						break;
					case "KeyP":
						event.preventDefault();
						togglePause();
				}
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
					advanceLevel$1(state);
					displayGrid = state.grid;
					reportScore();
					phase = "idle";
					phaseT = 0;
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				advancePhase(dt);
				const view = {
					cursor,
					clear: phase === "clear" && clearPlan !== null ? {
						removed: clearPlan.removed,
						falls: clearPlan.falls,
						t: Math.min(1, phaseT / CLEAR_MS$1),
						scoreText: clearScoreText
					} : null,
					result: phase === "win" || phase === "lose" ? state.result : "none"
				};
				renderMatch3(ctx, state, displayGrid, view);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderMatch3(ctx, state, state.grid, {
				cursor,
				clear: null,
				result: "none"
			});
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		//#region src/client/games/huarong/logic.ts
		/** A solved 1..15 board with the empty at the bottom-right. */
		function solvedBoard(rows, cols) {
			const board = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => r * cols + c + 1));
			board[rows - 1][cols - 1] = 0;
			return board;
		}
		/** Whether the board reads 1..n-1 with the empty last. */
		function isSolved$1(state) {
			let expected = 1;
			for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
				const last = r === state.rows - 1 && c === state.cols - 1;
				const value = state.board[r][c];
				if (last) return value === 0;
				if (value !== expected) return false;
				expected += 1;
			}
			return true;
		}
		/**
		* Shuffle by performing random valid slides from the solved state — every
		* shuffle produced this way is solvable (unlike swapping tiles at random).
		* @param state - the board (mutated to a fresh shuffled state).
		* @param steps - number of random slides.
		*/
		function shuffle$1(state, steps = 200) {
			state.board = solvedBoard(state.rows, state.cols);
			state.empty = {
				r: state.rows - 1,
				c: state.cols - 1
			};
			state.moves = 0;
			state.elapsed = 0;
			state.solved = false;
			let lastDir = null;
			for (let i = 0; i < steps; i += 1) {
				const choices = [];
				if (state.empty.r < state.rows - 1) choices.push(0);
				if (state.empty.c > 0) choices.push(1);
				if (state.empty.r > 0) choices.push(2);
				if (state.empty.c < state.cols - 1) choices.push(3);
				const reverse = lastDir === null ? -1 : (lastDir + 2) % 4;
				const usable = choices.filter((d) => d !== reverse);
				const dir = usable[Math.floor(Math.random() * usable.length)];
				slideDirection(state, dir);
				lastDir = dir;
			}
			state.moves = 0;
			state.elapsed = 0;
			state.solved = isSolved$1(state);
		}
		/** A fresh, shuffled, solvable 4x4 puzzle. */
		function createHuarongState() {
			const state = {
				rows: 4,
				cols: 4,
				board: [],
				empty: {
					r: 3,
					c: 3
				},
				moves: 0,
				solved: false,
				elapsed: 0
			};
			shuffle$1(state);
			return state;
		}
		/**
		* Slide the tile(s) between `(r, c)` and the empty toward the empty — the tile
		* at `(r, c)` must share a row or column with the empty. Returns the slide
		* animation entries (the board is already updated), or null when the move is
		* invalid.
		*/
		function slideAt(state, r, c) {
			const e = state.empty;
			if (r !== e.r && c !== e.c || r === e.r && c === e.c) return null;
			const slides = [];
			if (r === e.r) {
				const step = c < e.c ? 1 : -1;
				let cur = e.c;
				while (cur !== c) {
					const fromC = cur - step;
					const tile = state.board[r][fromC];
					slides.push({
						tile,
						from: {
							r,
							c: fromC
						},
						to: {
							r,
							c: cur
						}
					});
					state.board[r][cur] = tile;
					cur = fromC;
				}
				state.board[r][c] = 0;
			} else {
				const step = r < e.r ? 1 : -1;
				let cur = e.r;
				while (cur !== r) {
					const fromR = cur - step;
					const tile = state.board[fromR][c];
					slides.push({
						tile,
						from: {
							r: fromR,
							c
						},
						to: {
							r: cur,
							c
						}
					});
					state.board[cur][c] = tile;
					cur = fromR;
				}
				state.board[r][c] = 0;
			}
			state.empty = {
				r,
				c
			};
			state.moves += 1;
			state.solved = isSolved$1(state);
			return slides;
		}
		/**
		* Slide a tile adjacent to the empty in the given direction (the tile moves
		* that way into the empty). dir: 0 up, 1 right, 2 down, 3 left.
		*/
		function slideDirection(state, dir) {
			const e = state.empty;
			let r = e.r;
			let c = e.c;
			if (dir === 0) r = e.r + 1;
			else if (dir === 1) c = e.c - 1;
			else if (dir === 2) r = e.r - 1;
			else c = e.c + 1;
			if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null;
			return slideAt(state, r, c);
		}
		const particles$19 = createParticles();
		let prevSolved = false;
		let prevFrameMs$10 = 0;
		function cellCenter$2(pos) {
			return {
				x: pos.c * 72 + 36,
				y: 40 + pos.r * 72 + 36
			};
		}
		/** Whether tile `value` is in its solved position. */
		function inSolvedSpot(state, value, r, c) {
			return value === r * state.cols + c + 1;
		}
		/** Draw a single rounded tile with its number; color by tile id (stable). */
		function drawTile$1(ctx, state, value, cx, cy, r, c) {
			const correct = inSolvedSpot(state, value, r, c);
			const base = correct ? THEME.good : accent(value);
			const size = 64;
			glow(ctx, base, correct ? 12 : 6);
			ctx.fillStyle = base;
			roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, 10);
			ctx.fill();
			noGlow(ctx);
			ctx.fillStyle = "rgba(255,255,255,0.18)";
			roundRectPath(ctx, cx - size / 2 + 4, cy - size / 2 + 4, 56, 8, 5);
			ctx.fill();
			ctx.fillStyle = "#10101a";
			ctx.font = "bold 26px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(String(value), cx, cy + 2);
		}
		/** Draw one frame. `board` is the (already-updated) logical board. */
		function renderHuarong(ctx, state, view) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$10 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$10);
			prevFrameMs$10 = nowMs;
			ctx.clearRect(0, 0, 288, 328);
			drawBackground(ctx, 288, 328);
			hudPair(ctx, 10, 16, "步数 ", String(state.moves));
			const seconds = Math.floor(state.elapsed);
			hudPair(ctx, 278, 16, "用时 ", `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, "right", accent(1));
			ctx.fillStyle = THEME.textMuted;
			ctx.font = "600 10px system-ui, sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("点击/方向键滑动方块，按 1..15 顺序排列", 10, 37);
			ctx.fillStyle = THEME.bgBottom;
			roundRectPath(ctx, 2, 42, 284, 284, 10);
			ctx.fill();
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.strokeStyle = THEME.panelEdge;
			for (let i = 1; i < 4; i += 1) {
				ctx.beginPath();
				ctx.moveTo(i * 72 + .5, 40);
				ctx.lineTo(i * 72 + .5, 328);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, 40 + i * 72 + .5);
				ctx.lineTo(288, 40 + i * 72 + .5);
				ctx.stroke();
			}
			const sliding = /* @__PURE__ */ new Set();
			if (view.slides !== null) for (const s of view.slides.entries) sliding.add(s.tile);
			for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
				const value = state.board[r][c];
				if (value === 0 || sliding.has(value)) continue;
				const { x, y } = cellCenter$2({
					r,
					c
				});
				drawTile$1(ctx, state, value, x, y, r, c);
			}
			if (view.slides !== null) {
				const k = view.slides.t;
				for (const s of view.slides.entries) {
					const from = cellCenter$2(s.from);
					const to = cellCenter$2(s.to);
					drawTile$1(ctx, state, s.tile, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, s.to.r, s.to.c);
				}
			}
			if (view.solved && !prevSolved) particles$19.burst(144, 184, THEME.good, 30, 180);
			prevSolved = view.solved;
			particles$19.tick(ctx, dtMs);
			if (view.solved) {
				const seconds2 = Math.floor(state.elapsed);
				ctx.save();
				ctx.translate(0, 40);
				drawOverlay(ctx, 288, 288, "完成！", `${state.moves} 步 · ${Math.floor(seconds2 / 60)}:${String(seconds2 % 60).padStart(2, "0")} · 按 R 或点击 重新开始`, THEME.gold);
				ctx.restore();
			}
			ctx.textBaseline = "alphabetic";
		}
		//#endregion
		//#region src/client/games/huarong/index.ts
		const SLIDE_MS = 120;
		/** The arrow direction each key maps to (tile motion: 0 up, 1 right, 2 down, 3 left). */
		const KEY_DIR$2 = {
			ArrowUp: 0,
			ArrowRight: 1,
			ArrowDown: 2,
			ArrowLeft: 3
		};
		/** Time-based score: a faster solve -> a higher score (the panel keeps the max). */
		function solveScore$2(elapsed) {
			return Math.max(0, Math.round(1e3 - elapsed * 2));
		}
		function createHuarongGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 288, 328);
			if (fit === null) throw new Error("dsh-minigames: huarong needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createHuarongState();
			let running = false;
			let raf = 0;
			let last = 0;
			let lastScore = -1;
			let slideEntries = [];
			let slideT = 0;
			let reported = false;
			const reportScore = () => {
				const score = solveScore$2(state.elapsed);
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * 288 / rect.width;
				const y = (event.clientY - rect.top) * 328 / rect.height;
				const c = Math.floor(x / 72);
				const r = Math.floor((y - 40) / 72);
				if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null;
				return {
					r,
					c
				};
			};
			/** Apply a slide (logical) and start its animation; no-op while animating or solved. */
			const applySlide = (slides) => {
				if (slides === null || slides.length === 0 || slideEntries.length > 0 || state.solved) return;
				slideEntries = slides;
				slideT = 0;
			};
			const onPointerDown = (event) => {
				if (!running) return;
				if (slideEntries.length > 0) return;
				if (state.solved) {
					newPuzzle();
					return;
				}
				const cell = cellFromEvent(event);
				if (cell === null) return;
				applySlide(slideAt(state, cell.r, cell.c));
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
					newPuzzle();
					return;
				}
				if (state.solved || slideEntries.length > 0) return;
				const dir = KEY_DIR$2[event.code];
				if (dir === void 0) return;
				event.preventDefault();
				applySlide(slideDirection(state, dir));
			};
			/** Shuffle a fresh puzzle and reset the score reporting. */
			const newPuzzle = () => {
				shuffle$1(state);
				reported = false;
				lastScore = -1;
			};
			const advance = (dt) => {
				if (!state.solved) state.elapsed += dt;
				if (slideEntries.length > 0) {
					slideT += dt * 1e3;
					if (slideT >= SLIDE_MS) {
						slideEntries = [];
						slideT = 0;
						if (state.solved && !reported) {
							reported = true;
							reportScore();
						}
					}
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				advance(dt);
				const view = {
					slides: slideEntries.length > 0 ? {
						entries: slideEntries,
						t: Math.min(1, slideT / SLIDE_MS)
					} : null,
					solved: state.solved
				};
				renderHuarong(ctx, state, view);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderHuarong(ctx, state, {
				slides: null,
				solved: state.solved
			});
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
					fit.dispose();
					canvas.removeEventListener("pointerdown", onPointerDown);
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const huarongGame = {
			id: "huarong",
			title: "华容道",
			icon: "🔢",
			description: "16 格数字华容道（15-puzzle）：滑动方块按 1..15 排列，用时越短分数越高。",
			controls: [
				"点击 / 方向键：滑动方块",
				"R：重新打乱",
				"P：暂停"
			],
			create: createHuarongGame
		};
		//#endregion
		//#region src/client/games/snake/logic.ts
		const DIRS$4 = [
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
			const [dr, dc] = DIRS$4[state.dir];
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
		const particles$18 = createParticles();
		let prevScore$7 = 0;
		let prevFrameMs$9 = 0;
		/** Draw one frame. */
		function renderSnake(ctx, state) {
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
			if (state.score > prevScore$7) particles$18.burst(head.c * 26 + 13, 30 + head.r * 26 + 13, THEME.good, 14, 130);
			prevScore$7 = state.score;
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
			particles$18.tick(ctx, dtMs);
			if (state.over) drawOverlay(ctx, 416, 342, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
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
			let running = false;
			let raf = 0;
			let last = 0;
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
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				if (!state.over) {
					tickAcc += dt * 1e3;
					const interval = tickFor(state.score);
					while (tickAcc >= interval && !state.over) {
						tickAcc -= interval;
						stepSnake(state);
						reportScore();
					}
				}
				renderSnake(ctx, state);
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
				running = false;
				stopLoop();
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
			renderSnake(ctx, state);
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
		function emptyGrid$2() {
			return Array.from({ length: 4 }, () => Array(4).fill(null));
		}
		/** All empty cells. */
		function emptyCells$1(grid) {
			const out = [];
			for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) if (grid[r][c] === null) out.push({
				r,
				c,
				value: 0
			});
			return out;
		}
		/** Spawn a 2 (90%) or 4 (10%) on a random empty cell. */
		function spawnTile(state) {
			const empty = emptyCells$1(state.grid);
			if (empty.length === 0) return;
			const spot = empty[Math.floor(state.rng() * empty.length)];
			state.grid[spot.r][spot.c] = state.rng() < .9 ? 2 : 4;
		}
		/** A fresh board with two starting tiles. */
		function create2048State(rng = Math.random) {
			const state = {
				grid: emptyGrid$2(),
				score: 0,
				won: false,
				over: false,
				rng
			};
			spawnTile(state);
			spawnTile(state);
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
			spawnTile(state);
			if (!couldMove(state.grid)) state.over = true;
			return true;
		}
		const particles$17 = createParticles();
		let prevScore$6 = -1;
		let prevNow$5 = 0;
		/** Stable tile accent by exponent of 2 (2 → accent(0), 4 → accent(1), ...). */
		function tileColor(value) {
			return accent(Math.log2(value) - 1);
		}
		function tilePos(i) {
			return 8 + i * 72;
		}
		/** Draw one frame. */
		function render2048(ctx, state) {
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
			if (state.score !== prevScore$6) {
				if (prevScore$6 >= 0 && state.score > prevScore$6) particles$17.burst(148, 184, THEME.good, 12, 160);
				prevScore$6 = state.score;
			}
			particles$17.tick(ctx, dt);
			if (state.won && !state.over) drawOverlay(ctx, 296, 332, "达成 2048！", "继续挑战更高分 · R 重新开始", THEME.gold);
			else if (state.over) drawOverlay(ctx, 296, 332, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
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
			let raf = 0;
			let last = 0;
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
					if (move2048(state, dir)) reportScore();
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					state = create2048State();
					lastScore = -1;
					reportScore();
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				render2048(ctx, state);
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
				running = false;
				stopLoop();
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
			render2048(ctx, state);
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
		const LOGICAL_W$16 = 270;
		const LOGICAL_H$16 = 300;
		/** Seconds -> "mm:ss" (or "ss" under a minute). */
		function formatTime(seconds) {
			const s = Math.floor(seconds);
			const m = Math.floor(s / 60);
			return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
		}
		const particles$16 = createParticles();
		let prevOver$2 = false;
		let prevWon$2 = false;
		let prevFrameMs$8 = 0;
		/** Draw one frame. */
		function renderMinesweeper(ctx, state) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$8 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$8);
			prevFrameMs$8 = nowMs;
			drawBackground(ctx, LOGICAL_W$16, LOGICAL_H$16);
			if (state.won && !prevWon$2) particles$16.burst(LOGICAL_W$16 / 2, 165, THEME.gold, 26, 160);
			if (state.over && !prevOver$2) particles$16.burst(LOGICAL_W$16 / 2, 165, THEME.bad, 26, 160);
			prevWon$2 = state.won;
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
			particles$16.tick(ctx, dtMs);
			if (state.over) drawOverlay(ctx, LOGICAL_W$16, LOGICAL_H$16, "踩雷了", "按 R 重新开始", THEME.bad);
			else if (state.won) drawOverlay(ctx, LOGICAL_W$16, LOGICAL_H$16, "全部排雷！", `用时 ${formatTime(state.elapsed)} · 按 R 重新开始`, THEME.gold);
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$16, LOGICAL_H$16);
			if (fit === null) throw new Error("dsh-minigames: minesweeper needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createMinesweeperState();
			let running = false;
			let raf = 0;
			let last = 0;
			let reported = false;
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$16 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$16 / rect.height;
				const c = Math.floor(x / 30);
				const r = Math.floor((y - 30) / 30);
				if (r < 0 || r >= 9 || c < 0 || c >= 9) return null;
				return {
					r,
					c
				};
			};
			const onMouseDown = (event) => {
				const cell = cellFromEvent(event);
				if (cell === null) return;
				if (event.button === 2) {
					event.preventDefault();
					if (!state.over && !state.won) toggleFlag(state, cell.r, cell.c);
					return;
				}
				if (event.button !== 0 || state.over || state.won) return;
				if (reveal(state, cell.r, cell.c) && state.over) revealAllMines(state);
			};
			const onContextMenu = (event) => {
				event.preventDefault();
			};
			const onDoubleClick = (event) => {
				const cell = cellFromEvent(event);
				if (cell === null) return;
				chord(state, cell.r, cell.c);
				if (state.over) revealAllMines(state);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createMinesweeperState();
					reported = false;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				tick$2(state, dt);
				if (state.won && !reported) {
					reported = true;
					options?.onScore?.(solveScore$1(state.elapsed));
				}
				renderMinesweeper(ctx, state);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("contextmenu", onContextMenu);
			canvas.addEventListener("dblclick", onDoubleClick);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderMinesweeper(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const BOARD_W$6 = 192;
		const BOARD_H$5 = 192;
		const LOGICAL_W$15 = BOARD_W$6;
		const LOGICAL_H$15 = 224;
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
		const particles$15 = createParticles();
		let prevCards = [];
		let prevFrameMs$7 = 0;
		function cellCenter$1(i) {
			const r = Math.floor(i / 4);
			return {
				x: i % 4 * 48 + 24,
				y: 32 + r * 48 + 24
			};
		}
		/** Draw one frame. */
		function renderMemory(ctx, state) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$7 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$7);
			prevFrameMs$7 = nowMs;
			ctx.clearRect(0, 0, LOGICAL_W$15, LOGICAL_H$15);
			drawBackground(ctx, LOGICAL_W$15, LOGICAL_H$15);
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
					const { x, y } = cellCenter$1(i);
					particles$15.burst(x, y, THEME.good, 12, 120);
				}
			}
			prevCards = [...state.cards];
			particles$15.tick(ctx, dtMs);
			if (state.finished) {
				ctx.save();
				ctx.translate(0, 32);
				drawOverlay(ctx, BOARD_W$6, BOARD_H$5, "全部配对！", `${state.moves} 步完成 · 按 R 重新开始`, THEME.gold);
				ctx.restore();
			}
		}
		//#endregion
		//#region src/client/games/memory/index.ts
		const REVEAL_MS = 1e3;
		function createMemoryGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$15, LOGICAL_H$15);
			if (fit === null) throw new Error("dsh-minigames: memory needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createMemoryState();
			let running = false;
			let raf = 0;
			let last = 0;
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
				const x = (event.clientX - rect.left) * LOGICAL_W$15 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$15 / rect.height;
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
					}, REVEAL_MS);
				}
				reportScore();
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
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				renderMemory(ctx, state);
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
				running = false;
				if (flipTimer !== 0) {
					clearTimeout(flipTimer);
					flipTimer = 0;
					revealRemaining = Math.max(0, lockUntil - performance.now());
				}
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (revealRemaining > 0 && state.flipped.length >= 2) {
					lockUntil = performance.now() + revealRemaining;
					flipTimer = window.setTimeout(() => {
						resetFlip(state);
						reportScore();
					}, revealRemaining);
				}
				revealRemaining = 0;
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderMemory(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const DIRS$3 = [
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
		function checkWin$1(board, r, c) {
			const stone = board[r][c];
			if (stone === 0) return false;
			for (const [dr, dc] of DIRS$3) if (lineLength(board, r, c, dr, dc, stone) >= 5) return true;
			return false;
		}
		/** Place a stone for the current turn; advances the turn and checks the win. */
		function place$2(state, r, c) {
			if (state.over || state.board[r][c] !== 0) return false;
			state.board[r][c] = state.turn;
			if (checkWin$1(state.board, r, c)) {
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
			for (const [dr, dc] of DIRS$3) {
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
				if (checkWin$1(state.board, m.r, m.c)) {
					state.board[m.r][m.c] = 0;
					return m;
				}
				state.board[m.r][m.c] = 0;
			}
			for (const m of empties) {
				state.board[m.r][m.c] = 1;
				if (checkWin$1(state.board, m.r, m.c)) {
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
		const BOARD_W$5 = 360;
		const BOARD_H$4 = 360;
		const LOGICAL_W$14 = BOARD_W$5;
		const LOGICAL_H$14 = 392;
		const particles$14 = createParticles();
		let prevOver$1 = false;
		let prevFrameMs$6 = 0;
		const STAR_POINTS = [
			[3, 3],
			[3, 11],
			[11, 3],
			[11, 11],
			[7, 7]
		];
		/** Draw one frame. */
		function renderGomoku(ctx, state) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$6 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$6);
			prevFrameMs$6 = nowMs;
			ctx.clearRect(0, 0, LOGICAL_W$14, LOGICAL_H$14);
			drawBackground(ctx, LOGICAL_W$14, LOGICAL_H$14);
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
			for (const [r, c] of STAR_POINTS) {
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
				particles$14.burst(BOARD_W$5 / 2, 212, color, 26, 170);
			}
			prevOver$1 = state.over;
			particles$14.tick(ctx, dtMs);
			if (state.over) {
				ctx.save();
				ctx.translate(0, 32);
				drawOverlay(ctx, BOARD_W$5, BOARD_H$4, state.winner === 1 ? "你赢了！" : state.winner === 2 ? "AI 赢了" : "平局", "按 R 重新开始", state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.gold);
				ctx.restore();
			}
		}
		//#endregion
		//#region src/client/games/gomoku/index.ts
		const AI_DELAY_MS$1 = 500;
		function createGomokuGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$14, LOGICAL_H$14);
			if (fit === null) throw new Error("dsh-minigames: gomoku needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createGomokuState();
			let running = false;
			let raf = 0;
			let last = 0;
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
				const x = (event.clientX - rect.left) * LOGICAL_W$14 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$14 / rect.height;
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
					if (!state.over) aiAt = performance.now() + AI_DELAY_MS$1;
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createGomokuState();
					aiAt = 0;
					lastScore = -1;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				if (!state.over && state.turn === 2 && now >= aiAt) {
					const move = chooseAiMove$1(state);
					if (move !== null) place$2(state, move.r, move.c);
					reportScore();
				}
				renderGomoku(ctx, state);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderGomoku(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const GRAVITY$2 = 1320;
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
					state.vy += GRAVITY$2 * dt;
					state.y += state.vy * dt;
					if (state.y >= 150) state.falling = false;
				}
				return true;
			}
			if (!state.jumping) return false;
			const horizontalSpeed = 130 + state.power * 120;
			state.playerX += horizontalSpeed * dt;
			state.vy += GRAVITY$2 * dt;
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
		const particles$13 = createParticles();
		let prevScore$5 = -1;
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
			if (prevScore$5 >= 0 && state.score > prevScore$5) particles$13.burst(px, py, THEME.gold, 14, 140);
			prevScore$5 = state.score;
			particles$13.tick(ctx, dtMs);
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
			let raf = 0;
			let last = 0;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				charge(state, dt);
				stepHop(state, dt);
				reportScore();
				renderHop(ctx, state);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			canvas.addEventListener("mouseup", onMouseUp);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			startLoop();
			renderHop(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		function nextLevel(state) {
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
						nextLevel(state);
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
		const LOGICAL_W$13 = 480;
		const LOGICAL_H$13 = 320;
		const particles$12 = createParticles();
		let prevScore$4 = -1;
		let prevNow$4 = 0;
		/** Draw one frame. */
		function renderBreakout(ctx, state) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$4));
			prevNow$4 = now;
			drawBackground(ctx, LOGICAL_W$13, LOGICAL_H$13);
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
			if (state.score !== prevScore$4) {
				if (prevScore$4 >= 0 && state.score > prevScore$4) particles$12.burst(state.ball.x, state.ball.y, ballColor, 12, 150);
				prevScore$4 = state.score;
			}
			particles$12.tick(ctx, dt);
			hudPair(ctx, 10, 18, "关卡", String(state.level), "left");
			hudPair(ctx, 470, 18, "得分", `${state.score} · 生命 ${"♥".repeat(Math.max(0, state.lives))}`, "right");
			ctx.textAlign = "left";
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.fillStyle = THEME.textMuted;
			ctx.fillText("小球会变成所消除方块的颜色 · 同色得分 ×3", 10, 312);
			if (state.over) drawOverlay(ctx, LOGICAL_W$13, LOGICAL_H$13, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
		}
		//#endregion
		//#region src/client/games/breakout/index.ts
		function createBreakoutGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$13, LOGICAL_H$13);
			if (fit === null) throw new Error("dsh-minigames: breakout needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createBreakoutState();
			let running = false;
			let raf = 0;
			let last = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const paddleFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$13 / rect.width;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				if (!state.over) {
					stepBreakout(state, dt);
					reportScore();
				}
				renderBreakout(ctx, state);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("mousemove", onMouseMove);
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderBreakout(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const particles$11 = createParticles();
		let prevScore$3 = -1;
		let prevMoles = [];
		let lastFrame$3 = 0;
		/** Draw one frame. */
		function renderWhack(ctx, state) {
			ctx.clearRect(0, 0, 320, 350);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$3 === 0 ? 16 : now - lastFrame$3);
			lastFrame$3 = now;
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
			if (prevScore$3 >= 0 && state.score > prevScore$3) {
				const gone = prevMoles.filter((hole) => !state.moles.includes(hole));
				for (const hole of gone.slice(0, 3)) particles$11.burst((hole % 5 + .5) * 64, 30 + (Math.floor(hole / 5) + .5) * 64, accent(7), 14, 140);
			}
			prevScore$3 = state.score;
			prevMoles = [...state.moles];
			particles$11.tick(ctx, dt);
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
			let raf = 0;
			let last = 0;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				tickWhack(state, dt);
				reportScore();
				renderWhack(ctx, state);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderWhack(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const DIRS$2 = [
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
		function other(player) {
			return player === 1 ? 2 : 1;
		}
		function inBounds$1(r, c) {
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
			if (!inBounds$1(r, c) || board[r][c] !== 0) return [];
			const out = [];
			for (const [dr, dc] of DIRS$2) {
				const line = [];
				let nr = r + dr;
				let nc = c + dc;
				while (inBounds$1(nr, nc) && board[nr][nc] === other(player)) {
					line.push([nr, nc]);
					nr += dr;
					nc += dc;
				}
				if (line.length > 0 && inBounds$1(nr, nc) && board[nr][nc] === player) out.push(...line);
			}
			return out;
		}
		/** All legal moves for `player`. */
		function legalMoves(state, player) {
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
				if (legalMoves(state, state.turn).length > 0) return;
				state.passes += 1;
				state.turn = other(state.turn);
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
			state.turn = other(state.turn);
			resolve(state);
			return true;
		}
		/** The current side passes (used when it has no legal move). */
		function passTurn(state) {
			if (state.over) return;
			state.passes += 1;
			state.turn = other(state.turn);
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
			const moves = legalMoves(state, state.turn);
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
		const LOGICAL_W$11 = 352;
		const LOGICAL_H$11 = 382;
		const particles$10 = createParticles();
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
		/** Draw one frame. */
		function renderOthello(ctx, state) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$4 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$4);
			prevFrameMs$4 = nowMs;
			drawBackground(ctx, LOGICAL_W$11, LOGICAL_H$11);
			if (prevBoard.length === 8) {
				outer: for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if (state.board[r][c] === 1 && prevBoard[r][c] === 0) {
					particles$10.burst(c * 44 + 22, 30 + r * 44 + 22, accent(0), 14, 120);
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
			particles$10.tick(ctx, dtMs);
			if (state.over) {
				const title = state.winner === 1 ? "你赢了！" : state.winner === 2 ? "AI 赢了" : "平局";
				const color = state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.text;
				drawOverlay(ctx, LOGICAL_W$11, LOGICAL_H$11, title, `○ ${countDiscs(state, 1)} : ${countDiscs(state, 2)} ● · 按 R 重新开始`, color);
			}
		}
		//#endregion
		//#region src/client/games/othello/index.ts
		const AI_DELAY_MS = 500;
		function createOthelloGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$11, LOGICAL_H$11);
			if (fit === null) throw new Error("dsh-minigames: othello needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createOthelloState();
			let running = false;
			let raf = 0;
			let last = 0;
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
				const x = (event.clientX - rect.left) * LOGICAL_W$11 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$11 / rect.height;
				const c = Math.floor(x / 44);
				const r = Math.floor((y - 30) / 44);
				if (r < 0 || r >= 8 || c < 0 || c >= 8) return null;
				return {
					r,
					c
				};
			};
			const onMouseDown = (event) => {
				if (state.over || state.turn !== 1) return;
				const cell = cellFromEvent(event);
				if (cell === null) return;
				if (place$1(state, cell.r, cell.c)) {
					reportScore();
					if (!state.over) aiAt = performance.now() + AI_DELAY_MS;
				}
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createOthelloState();
					aiAt = 0;
					lastScore = -1;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				if (!state.over && state.turn === 2 && now >= aiAt) {
					const move = chooseAiMove(state);
					if (move !== null) place$1(state, move.r, move.c);
					else passTurn(state);
					reportScore();
				}
				renderOthello(ctx, state);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderOthello(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const LOGICAL_W$10 = 300;
		const LOGICAL_H$10 = 480;
		const PIPE_ACCENT = accent(2);
		const particles$9 = createParticles();
		let prevScore$2 = -1;
		let prevNow$3 = 0;
		/** Draw one frame. */
		function renderFlappy(ctx, state, wingT) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$3));
			prevNow$3 = now;
			drawBackground(ctx, LOGICAL_W$10, LOGICAL_H$10);
			for (const pipe of state.pipes) {
				drawPipe$1(ctx, pipe.x, 0, pipe.gapY - 75);
				drawPipe$1(ctx, pipe.x, pipe.gapY + 75, 450 - (pipe.gapY + 75));
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
			if (state.score !== prevScore$2) {
				if (prevScore$2 >= 0 && state.score > prevScore$2) particles$9.burst(90, 30 + state.y, THEME.gold, 10, 140);
				prevScore$2 = state.score;
			}
			particles$9.tick(ctx, dt);
			ctx.fillStyle = "rgba(13,13,20,0.45)";
			ctx.fillRect(0, 0, LOGICAL_W$10, 30);
			hudPair(ctx, 10, 20, "得分", String(state.score), "left");
			if (state.over) drawOverlay(ctx, LOGICAL_W$10, LOGICAL_H$10, "撞到了", `得分 ${state.score} · 按 R 重新开始`, THEME.gold);
		}
		function drawPipe$1(ctx, x, y, h) {
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$10, LOGICAL_H$10);
			if (fit === null) throw new Error("dsh-minigames: flappy needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createFlappyState();
			let running = false;
			let raf = 0;
			let last = 0;
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
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				wingT += dt;
				stepFlappy(state, dt);
				reportScore();
				renderFlappy(ctx, state, wingT);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderFlappy(ctx, state, 0);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		function emptyGrid$1() {
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
			const grid = emptyGrid$1();
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
		const BOARD_W$2 = 360;
		const BOARD_H$1 = 360;
		const LOGICAL_W$9 = BOARD_W$2;
		const LOGICAL_H$9 = 390;
		const ENTRY = accent(0);
		const GRID = THEME.panelEdge;
		const BOX = THEME.gold;
		const particles$8 = createParticles();
		let prevWon$1 = false;
		let lastFrame$2 = 0;
		/** Draw one frame; cursor is the selected cell or null. */
		function renderSudoku(ctx, state, difficulty, cursor) {
			ctx.clearRect(0, 0, LOGICAL_W$9, LOGICAL_H$9);
			const now = performance.now();
			const dt = Math.min(50, lastFrame$2 === 0 ? 16 : now - lastFrame$2);
			lastFrame$2 = now;
			drawBackground(ctx, LOGICAL_W$9, LOGICAL_H$9);
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
			ctx.strokeStyle = GRID;
			ctx.lineWidth = 1;
			for (let i = 0; i <= 9; i += 1) {
				if (i % 3 === 0) continue;
				ctx.beginPath();
				ctx.moveTo(i * 40, 30);
				ctx.lineTo(i * 40, LOGICAL_H$9);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, 30 + i * 40);
				ctx.lineTo(BOARD_W$2, 30 + i * 40);
				ctx.stroke();
			}
			ctx.strokeStyle = BOX;
			ctx.lineWidth = 2.5;
			for (let i = 0; i <= 9; i += 3) {
				ctx.beginPath();
				ctx.moveTo(i * 40, 30);
				ctx.lineTo(i * 40, LOGICAL_H$9);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, 30 + i * 40);
				ctx.lineTo(BOARD_W$2, 30 + i * 40);
				ctx.stroke();
			}
			if (state.won && !prevWon$1) particles$8.burst(BOARD_W$2 / 2, 210, THEME.gold, 26, 170);
			prevWon$1 = state.won;
			particles$8.tick(ctx, dt);
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, LOGICAL_W$9, 30);
			hudPair(ctx, 10, 20, `${difficulty === "easy" ? "简单" : difficulty === "normal" ? "普通" : "困难"} · D 切换`, "", "left");
			hudPair(ctx, 350, 20, "⏱ ", clock, "right");
			if (state.won) {
				ctx.save();
				ctx.translate(0, 30);
				drawOverlay(ctx, BOARD_W$2, BOARD_H$1, "解决！", `用时 ${clock} · 按 R 开新题`, THEME.gold);
				ctx.restore();
			}
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$9, LOGICAL_H$9);
			if (fit === null) throw new Error("dsh-minigames: sudoku needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createSudokuState();
			let difficulty = "normal";
			let cursor = {
				r: 0,
				c: 0
			};
			let running = false;
			let raf = 0;
			let last = 0;
			let reported = false;
			const newPuzzle = () => {
				state = createSudokuState(void 0, difficulty);
				reported = false;
			};
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$9 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$9 / rect.height;
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
					return;
				}
				const cell = cellFromEvent(event);
				if (cell === null) return;
				cursor = cell;
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					newPuzzle();
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
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				tick$1(state, dt);
				if (state.won && !reported) {
					reported = true;
					options?.onScore?.(solveScore(state.elapsed));
				}
				renderSudoku(ctx, state, difficulty, cursor);
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderSudoku(ctx, state, difficulty, cursor);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const DIRS$1 = [
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
				const [idx, idy] = DIRS$1[state.intent];
				const gr = Math.floor(state.py / 20);
				const gc = Math.floor(state.px / 20);
				if (!isWall(state, gr + idy, gc + idx)) state.dir = state.intent;
			}
			const [dx, dy] = DIRS$1[state.dir];
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
				const [dx, dy] = DIRS$1[d];
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
				const [dx, dy] = DIRS$1[ghost.dir];
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
		const LOGICAL_W$8 = 380;
		const LOGICAL_H$8 = 330;
		const WALL = "#23233a";
		const WALL_EDGE = "#34344e";
		const DOT = "#c8b088";
		const particles$7 = createParticles();
		let prevScore$1 = 0;
		let prevFrameMs$3 = 0;
		/** Draw one frame; `t` is a running seconds counter for flicker effects. */
		function renderPacman(ctx, state, t) {
			const nowMs = performance.now();
			const dtMs = prevFrameMs$3 === 0 ? 16 : Math.min(50, nowMs - prevFrameMs$3);
			prevFrameMs$3 = nowMs;
			drawBackground(ctx, LOGICAL_W$8, LOGICAL_H$8);
			if (state.score > prevScore$1) {
				const gain = state.score - prevScore$1;
				particles$7.burst(state.px, 30 + state.py, gain >= 100 ? accent(4) : THEME.gold, gain >= 100 ? 22 : 10, gain >= 100 ? 170 : 120);
			}
			prevScore$1 = state.score;
			for (let r = 0; r < 15; r += 1) for (let c = 0; c < 19; c += 1) {
				const x = c * 20;
				const y = 30 + r * 20;
				const cell = state.grid[r][c];
				if (cell === "#") {
					ctx.fillStyle = WALL;
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
			particles$7.tick(ctx, dtMs);
			if (state.over) drawOverlay(ctx, LOGICAL_W$8, LOGICAL_H$8, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
			else if (state.won) drawOverlay(ctx, LOGICAL_W$8, LOGICAL_H$8, "过关啦！", `得分 ${state.score} · 按 R 重新开始`, THEME.gold);
		}
		//#endregion
		//#region src/client/games/pacman/index.ts
		const KEY_DIR$1 = {
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$8, LOGICAL_H$8);
			if (fit === null) throw new Error("dsh-minigames: pacman needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createPacmanState();
			let running = false;
			let raf = 0;
			let last = 0;
			let t = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				const dir = KEY_DIR$1[event.code];
				if (dir !== void 0) {
					event.preventDefault();
					if (!state.over && !state.won) state.intent = dir;
					return;
				}
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createPacmanState();
					lastScore = -1;
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				t += dt;
				stepPacman(state, dt);
				reportScore();
				renderPacman(ctx, state, t);
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
				running = false;
				stopLoop();
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
			renderPacman(ctx, state, 0);
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
		function shoot(state) {
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
		const particles$6 = createParticles();
		let prevHits = -1;
		let lastFrame$1 = 0;
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
			const dt = Math.min(50, lastFrame$1 === 0 ? 16 : now - lastFrame$1);
			lastFrame$1 = now;
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
				particles$6.burst(hx ?? 240, hy ?? 150, THEME.gold, 14, 150);
			}
			prevHits = state.hits;
			particles$6.tick(ctx, dt);
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
			let raf = 0;
			let last = 0;
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
					last = performance.now();
					if (phase !== "playing") phase = "playing";
				} else if (phase === "playing") phase = "paused";
			};
			const onMouseMove = (event) => {
				if (phase !== "playing") return;
				if (document.pointerLockElement === canvas) turn(state, event.movementX, event.movementY);
			};
			const onMouseDown = (event) => {
				if (phase === "playing" && event.button === 0) {
					shoot(state);
					reportScore();
				}
			};
			const onClick = () => {
				if (phase === "over") {
					state = createFpsTrackState();
					lastScore = -1;
				}
				if (phase !== "playing") lockMouse();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				if (event.code === "KeyR") {
					event.preventDefault();
					state = createFpsTrackState();
					lastScore = -1;
					if (phase === "over") phase = "ready";
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (phase === "playing") {
					const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
					last = now;
					t += dt;
					tickFpsTrack(state, dt);
					reportScore();
					if (state.over && phase === "playing") {
						phase = "over";
						if (document.pointerLockElement === canvas) document.exitPointerLock();
					}
				}
				renderAimTrack(ctx, state, t, phase);
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
			const pause = () => {
				if (phase === "playing") {
					phase = "paused";
					if (document.pointerLockElement === canvas) document.exitPointerLock();
				}
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
			startLoop();
			renderAimTrack(ctx, state, 0, phase);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					stopLoop();
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
			let raf = 0;
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
				clearTimeout(litOffTimer);
				litOffAt = performance.now() + ms;
				litOffTimer = window.setTimeout(() => {
					lit = null;
					litOffTimer = 0;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				renderSimon(ctx, state, lit, false);
			};
			const startLoop = () => {
				if (raf !== 0) return;
				performance.now();
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
				stopLoop();
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
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startRound(state);
			scheduleStep(START_DELAY_MS);
			startLoop();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		* The 30 built-in levels, microban-style, ≤ 14x14, ordered by difficulty.
		* Levels 11-20 ramp through narrow corridors and goal rooms with forced
		* fill ordering (deepest goal first), up to 6 boxes; level 20 funnels six
		* boxes down a deep two-cell shaft into a wide goal row. Levels 21-30 are
		* the hard tier (6-8 boxes): goal-column parking order, left-edge shaft
		* rides, dual shafts into offset goal rows, split goal pockets, deep shafts
		* with a blocking box, side-chamber shuttles, a single-doorway two-room
		* shuttle, and a toothed divider column for the finale. Each hard level is
		* verified solvable by the budgeted solver in the unit tests.
		* Tiles: # wall, space floor, $ box, . goal, * box-on-goal, @ player,
		* + player-on-goal.
		*/
		const LEVELS = [
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
`
		];
		/** Direction name -> (dr, dc). */
		const DIRS = {
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
		function inBounds(state, r, c) {
			return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
		}
		/** Whether every box sits on a goal cell. */
		function isCleared(state) {
			for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) if (state.boxes[r][c] && !state.goals[r][c]) return false;
			return true;
		}
		/** Reset the state to the given level's initial layout, keeping the score. */
		function loadLevel(state, levelIndex) {
			const level = parseLevel(LEVELS[levelIndex]);
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
		function restartLevel(state) {
			state.score = state.entryScore;
			loadLevel(state, state.levelIndex);
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
			loadLevel(state, levelIndex);
			return state;
		}
		/**
		* Try to move the player one cell in `dir` (up/down/left/right), pushing a
		* single box when the target cell holds one and the cell beyond it is free
		* (floor or goal). Updates moves/score/history/cleared on success.
		* @returns the applied move, or null when blocked (wall, box-into-wall,
		*   box-into-box) or the level is already cleared.
		*/
		function applyMove(state, dir) {
			if (state.cleared) return null;
			const [dr, dc] = DIRS[dir];
			const from = state.player;
			const tr = from.r + dr;
			const tc = from.c + dc;
			if (!inBounds(state, tr, tc) || state.walls[tr][tc]) return null;
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
				if (!inBounds(state, br, bc) || state.walls[br][bc] || state.boxes[br][bc]) return null;
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
		const MAX_ROWS = Math.max(...LEVELS.map((t) => t.split("\n").filter((l) => l.trim().length > 0).length));
		const MAX_COLS = Math.max(...LEVELS.map((t) => Math.max(...t.split("\n").filter((l) => l.trim().length > 0).map((l) => l.length))));
		const LOGICAL_W$5 = MAX_COLS * 48;
		const LOGICAL_H$5 = 44 + MAX_ROWS * 48;
		const BOX_ACCENT = accent(1);
		const PLAYER_ACCENT = accent(0);
		const particles$5 = createParticles();
		let prevCleared = false;
		let prevFrameMs$2 = 0;
		function gridOffsets(state) {
			return {
				ox: (MAX_COLS - state.cols) / 2 * 48,
				oy: 44 + (MAX_ROWS - state.rows) / 2 * 48
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
			glow(ctx, PLAYER_ACCENT, 12);
			ctx.fillStyle = PLAYER_ACCENT;
			roundRectPath(ctx, cx - bodyW / 2, cy - bodyH / 2 + 4, bodyW, bodyH, 7);
			ctx.fill();
			noGlow(ctx);
			glow(ctx, PLAYER_ACCENT, 8);
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
			drawBackground(ctx, LOGICAL_W$5, LOGICAL_H$5);
			hudPair(ctx, 12, 18, "关卡 ", `${state.levelIndex + 1}/${view.totalLevels}`);
			hudPair(ctx, 130, 18, "步数 ", String(state.moves));
			hudPair(ctx, LOGICAL_W$5 - 12, 18, "得分 ", String(state.score), "right");
			ctx.fillStyle = THEME.textMuted;
			ctx.font = "600 11px system-ui, sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("方向键/WASD 移动 · Z 撤销 · R 重开 · [ ] 跳关", 12, 36);
			ctx.textAlign = "right";
			ctx.fillText(`${state.levelIndex + 1}/${view.totalLevels} · 已解锁 1–${view.unlockedThrough}`, LOGICAL_W$5 - 12, 36);
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
			if (state.cleared && !prevCleared) particles$5.burst(ox + state.player.c * 48 + 24, oy + state.player.r * 48 + 24, THEME.gold, 26, 180);
			prevCleared = state.cleared;
			particles$5.tick(ctx, dtMs);
			if (view.won) drawOverlay(ctx, LOGICAL_W$5, LOGICAL_H$5, "全部通关", `总分 ${state.score} · 按 R 重新开始`, THEME.gold);
			else if (state.cleared) drawOverlay(ctx, LOGICAL_W$5, LOGICAL_H$5, "过关", "按 N 或稍后进入下一关", THEME.good);
		}
		//#endregion
		//#region src/client/games/sokoban/index.ts
		const PUSH_MS = 110;
		const AUTO_ADVANCE_MS$1 = 1500;
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
		function createSokobanGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$5, LOGICAL_H$5);
			if (fit === null) throw new Error("dsh-minigames: sokoban needs a 2d canvas context");
			const ctx = fit.ctx;
			let reached = loadReached(LEVELS.length);
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
				const move = applyMove(state, dir);
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
				if (target < 0 || target > reached - 1 || target >= LEVELS.length) return;
				loadLevel(state, target);
				won = false;
				pushMove = null;
				pushT = 0;
				autoMs = -1;
				reportScore();
			};
			const nextLevel = () => {
				if (!state.cleared) return;
				if (state.levelIndex + 1 >= LEVELS.length) {
					won = true;
					reportScore();
					return;
				}
				loadLevel(state, state.levelIndex + 1);
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
					} else restartLevel(state);
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
				const dir = KEY_DIR[event.code];
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
				if (state.cleared && !won && state.levelIndex + 1 < LEVELS.length && autoMs >= 0) {
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
					totalLevels: LEVELS.length,
					unlockedThrough: Math.min(reached, LEVELS.length),
					won,
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
				running = false;
				stopLoop();
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
				totalLevels: LEVELS.length,
				unlockedThrough: Math.min(reached, LEVELS.length),
				won,
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
		const MAX_SPEED = 480;
		const START_LIVES$1 = 3;
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
		function spawnWave(state) {
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
				lives: START_LIVES$1,
				result: "none",
				fireCooldown: 0,
				invuln: RESPAWN_INVULN,
				waveClearTimer: null,
				t: 0,
				rng
			};
			spawnWave(state);
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
				if (speed > MAX_SPEED) {
					ship.vx = ship.vx / speed * MAX_SPEED;
					ship.vy = ship.vy / speed * MAX_SPEED;
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
					spawnWave(state);
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
		const particles$4 = createParticles();
		let lastT = -1;
		let lastFrame = 0;
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
		/** Draw one frame of the asteroid field. */
		function renderAsteroids(ctx, state) {
			ctx.clearRect(0, 0, 960, 600);
			const now = performance.now();
			const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame);
			lastFrame = now;
			drawBackground(ctx, 960, 600);
			if (state.t !== lastT) {
				for (const event of state.events) particles$4.burst(event.x, event.y, ROCK_COLOR[event.size], event.size === "small" ? 10 : 16, 140);
				lastT = state.t;
			}
			particles$4.tick(ctx, dt);
			for (const rock of state.rocks) drawRock(ctx, rock);
			for (const bullet of state.bullets) drawBullet(ctx, bullet.x, bullet.y);
			if (state.result === "none") drawShip(ctx, state);
			hudPair(ctx, 8, 16, "波次 ", String(state.wave));
			hudPair(ctx, 8, 32, "生命 ", "♥".repeat(Math.max(0, state.lives)), "left", THEME.bad);
			hudPair(ctx, 8, 48, "得分 ", String(state.score), "left", THEME.gold);
			if (state.result === "lose") drawOverlay(ctx, 960, 600, "GAME OVER", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
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
			let raf = 0;
			let last = 0;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(50, Math.max(0, now - last));
				last = now;
				updateAsteroids(world, dt, input);
				reportScore();
				renderAsteroids(ctx, world);
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
			const reset = () => {
				world = createAsteroids();
				lastScore = -1;
				input.left = input.right = input.thrust = input.fire = false;
				reportScore();
				if (running) startLoop();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			startLoop();
			renderAsteroids(ctx, world);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
			description: "矢量小行星：惯性驾驶飞船，击碎岩石群，一波接一波地生存下去。",
			controls: [
				"A/D 或 ←/→：旋转",
				"W 或 ↑：推进",
				"空格：开火",
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
		function levelSize(level) {
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
		function checkWin(state) {
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
		function advanceLevel(state) {
			if (state.status !== "won") return;
			state.level += 1;
			state.board = generateLevel(levelSize(state.level), state.rng);
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
				board: generateLevel(levelSize(level), rng),
				rng
			};
		}
		const MAX_SIZE$1 = 8;
		const WATER = accent(0);
		/** Low-time warning threshold in seconds. */
		const LOW_TIME_S = 15;
		const particles$3 = createParticles();
		let prevWon = false;
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
		function drawPipe(ctx, tile, x, y, connected, nowMs) {
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
			drawPipe(ctx, {
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
				else drawPipe(ctx, tile, x, y, connected, now);
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
			if (state.status === "won" && !prevWon) particles$3.burst(ox + sink.c * 52 + 26, oy + sink.r * 52 + 26, WATER, 26, 180);
			prevWon = state.status === "won";
			particles$3.tick(ctx, dtMs);
			if (view.paused) drawOverlay(ctx, 448, 492, "已暂停", "按 P 继续");
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
			let raf = 0;
			let last = 0;
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
			};
			/** Rotate the tile at the cursor/cell and check for the win transition. */
			const rotateAt = (r, c) => {
				if (state.status !== "playing") return;
				if (rotateTile(state, r, c)) {
					if (checkWin(state)) {
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
					return;
				}
				cursor.r = Math.min(size - 1, Math.max(0, cursor.r + dr));
				cursor.c = Math.min(size - 1, Math.max(0, cursor.c + dc));
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
						advanceLevel(state);
						cursor = null;
						wonElapsed = 0;
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
						advanceLevel(state);
						cursor = null;
						wonElapsed = 0;
					}
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				advance(dt);
				renderPipes(ctx, state, {
					paused: false,
					cursor
				});
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
				running = false;
				stopLoop();
				renderPipes(ctx, state, {
					paused: true,
					cursor
				});
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
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
					stopLoop();
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
		function emptyGrid() {
			return Array.from({ length: 9 }, () => Array(9).fill(0));
		}
		/** All empty cells in row-major order. */
		function emptyCells(grid) {
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
				const empty = emptyCells(state.grid);
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
				grid: emptyGrid(),
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
				if (emptyCells(state.grid).length === 0) state.over = true;
			}
			return {
				moved: true,
				cleared: cells,
				gained
			};
		}
		const BOARD_W$1 = 456;
		const BOARD_H = 456;
		const LOGICAL_W$3 = BOARD_W$1;
		const LOGICAL_H$3 = 496;
		const particles$2 = createParticles();
		let prevScore = -1;
		let prevFrameMs = 0;
		function cellX(c) {
			return 6 + c * 50 + 22;
		}
		function cellY(r) {
			return 46 + r * 50 + 22;
		}
		function drawBoardPanel(ctx) {
			ctx.fillStyle = THEME.panel;
			glow(ctx, THEME.panelEdge, 8);
			roundRectPath(ctx, 0, 40, BOARD_W$1, BOARD_H, 10);
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
		function drawBall$1(ctx, color, cx, cy, r) {
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
			ctx.clearRect(0, 0, LOGICAL_W$3, LOGICAL_H$3);
			drawBackground(ctx, LOGICAL_W$3, LOGICAL_H$3);
			hudPair(ctx, 10, 16, "五连珠", "", "left");
			hudPair(ctx, LOGICAL_W$3 / 2, 16, "得分 ", String(state.score), "left", THEME.gold);
			hudPair(ctx, 446, 16, "剩余空间 ", String(emptyCells(state.grid).length), "right");
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
					ctx.arc(cellX(c), cellY(r), 19.36, 0, Math.PI * 2);
					ctx.stroke();
					ctx.globalAlpha = 1;
				}
				drawBall$1(ctx, color, cellX(c), cellY(r), radius);
			}
			if (view.clearing !== null) {
				const flash = .35 + .55 * Math.abs(Math.sin(view.clearing.t * 22));
				for (const p of view.clearing.cells) {
					ctx.fillStyle = `rgba(255,255,255,${flash.toFixed(2)})`;
					roundRectPath(ctx, 6 + p.c * 50 + 2, 46 + p.r * 50 + 2, 40, 40, 8);
					ctx.fill();
				}
			}
			if (state.score !== prevScore) {
				if (prevScore >= 0 && state.score > prevScore) particles$2.burst(BOARD_W$1 / 2, 268, THEME.good, 14, 150);
				prevScore = state.score;
			}
			particles$2.tick(ctx, dtMs);
			const cur = view.cursor;
			ctx.strokeStyle = view.selected !== null && view.selected.r === cur.r && view.selected.c === cur.c ? THEME.text : THEME.gold;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 3]);
			roundRectPath(ctx, 6 + cur.c * 50 + 2, 46 + cur.r * 50 + 2, 40, 40, 8);
			ctx.stroke();
			ctx.setLineDash([]);
			if (state.over) drawOverlay(ctx, LOGICAL_W$3, LOGICAL_H$3, "游戏结束", `得分 ${state.score} · 按 R 重新开始`, THEME.bad);
		}
		//#endregion
		//#region src/client/games/colorlines/index.ts
		const CLEAR_MS = 300;
		function createColorLinesGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$3, LOGICAL_H$3);
			if (fit === null) throw new Error("dsh-minigames: colorlines needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createColorLinesState();
			let running = false;
			let raf = 0;
			let last = 0;
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
				const x = (event.clientX - rect.left) * LOGICAL_W$3 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$3 / rect.height;
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
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(.033, Math.max(0, (now - last) / 1e3));
				last = now;
				if (clearing !== null) {
					clearing.t += dt;
					if (clearing.t >= CLEAR_MS / 1e3) clearing = null;
				}
				renderColorLines(ctx, state, {
					selected,
					cursor,
					clearing
				});
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
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
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
					stopLoop();
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
		function spawnInterval$1(tMs) {
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
				spawnCooldown: spawnInterval$1(0),
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
				state.spawnCooldown += spawnInterval$1(state.t);
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
		const PLAYER_COLOR$1 = accent(0);
		const LASER_WARN_COLOR = accent(1);
		const LASER_FIRE_COLOR = accent(4);
		const HOMING_COLOR = accent(2);
		/** Bullet color by speed tier: slow amber → mid orange → fast red. */
		function bulletColor(speed) {
			if (speed < 130) return accent(3);
			if (speed < 175) return accent(6);
			return accent(4);
		}
		const particles$1 = createParticles();
		let prevNow$2 = 0;
		let prevOver = false;
		/** Draw one frame. */
		function renderDodger(ctx, state) {
			const now = performance.now();
			const dt = Math.min(50, Math.max(0, now - prevNow$2));
			prevNow$2 = now;
			drawBackground(ctx, 480, 600);
			for (const b of state.bullets) drawStreak(ctx, b);
			for (const l of state.lasers) drawLaser(ctx, l, state.t);
			if (!(state.grace > 0 && Math.floor(state.grace / 120) % 2 === 0)) {
				glow(ctx, PLAYER_COLOR$1, 16);
				ctx.fillStyle = PLAYER_COLOR$1;
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
			if (state.over && !prevOver) particles$1.burst(state.x, state.y, THEME.bad, 22, 200);
			prevOver = state.over;
			particles$1.tick(ctx, dt);
			ctx.fillStyle = "rgba(13,13,20,0.45)";
			ctx.fillRect(0, 0, 480, 30);
			hudPair(ctx, 10, 20, "时间", `${(state.t / 1e3).toFixed(1)}s`, "left");
			hudPair(ctx, 240, 20, "得分", String(state.score), "left");
			hudPair(ctx, 470, 20, "擦弹", String(state.grazes), "right", THEME.gold);
			if (state.over) drawOverlay(ctx, 480, 600, "被 击 中", `坚持 ${(state.t / 1e3).toFixed(1)} 秒 · 得分 ${state.score} · 按 R 重新开始`, THEME.bad);
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
			let raf = 0;
			let last = 0;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(50, Math.max(0, now - last));
				last = now;
				stepDodger(state, dt, input);
				reportScore();
				renderDodger(ctx, state);
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
			const reset = () => {
				state = createDodger();
				lastScore = -1;
				input.up = input.down = input.left = input.right = false;
				if (running) startLoop();
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("pointermove", onPointerMove);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			startLoop();
			renderDodger(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		function spawnInterval(elapsedMs) {
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
				state.spawnT += spawnInterval(state.elapsed);
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
			let raf = 0;
			let last = 0;
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(50, Math.max(0, now - last));
				last = now;
				tickTyping(state, dt);
				reportScore();
				const shakeDx = state.shake > 0 ? Math.sin(state.shake / 18) * 4 : 0;
				renderTyping(ctx, state, false, shakeDx);
				particles.tick(ctx, dt);
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
				running = false;
				stopLoop();
				renderTyping(ctx, state, true);
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
			renderTyping(ctx, state, false);
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
		function mulberry32$2(seed) {
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
		function neighbors(r, c) {
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
			for (const [nr, nc] of neighbors(r, c)) next[nr][nc] = !next[nr][nc];
			return next;
		}
		/** True when every light is off. */
		function isSolved(board) {
			return board.every((row) => row.every((cell) => !cell));
		}
		/** Scramble toggle count for a level: 4 at level 1, +1 per level, capped at 12. */
		function scrambleCount(level) {
			return Math.min(4 + Math.max(1, level) - 1, 12);
		}
		/** The N toggle cells a scramble applies, deterministically from the seed. */
		function scrambleMoves(seed, n) {
			const rng = mulberry32$2(seed);
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
		const LOGICAL_W$1 = 340;
		const LOGICAL_H$1 = 388;
		function cellRect(r, c) {
			return {
				x: 6 + c * 68,
				y: 38 + r * 68
			};
		}
		/** Which cell a logical-space point lands on, or null. */
		function cellAt(x, y) {
			for (let r = 0; r < 5; r += 1) for (let c = 0; c < 5; c += 1) {
				const { x: px, y: py } = cellRect(r, c);
				if (x >= px && x <= px + 56 && y >= py && y <= py + 56) return {
					r,
					c
				};
			}
			return null;
		}
		/** Center of a cell in logical space (particle bursts). */
		function cellCenter(r, c) {
			const { x, y } = cellRect(r, c);
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
				const { x, y } = cellRect(r, c);
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
		const ADVANCE_MS = 1500;
		function createLightsOutGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$1, LOGICAL_H$1);
			if (fit === null) throw new Error("dsh-minigames: lightsout needs a 2d canvas context");
			const ctx = fit.ctx;
			let level = 1;
			let moves = 0;
			let board = scramble(level * 2654435769, scrambleCount(level));
			let cursor = {
				r: 2,
				c: 2
			};
			let winText = null;
			let running = false;
			let raf = 0;
			let last = 0;
			let advanceTimer = 0;
			let advanceAt = 0;
			let advanceRemaining = 0;
			let lastScore = -1;
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
				moves += 1;
				board = toggleAt(board, r, c);
				if (isSolved(board)) {
					winText = `第 ${level} 关完成 · ${moves} 步`;
					reportScore();
					const center = cellCenter(r, c);
					particles.burst(center.x, center.y, THEME.gold, 14, 150);
					for (let i = 0; i < 5; i += 1) {
						const edge = cellCenter(i, c);
						particles.burst(edge.x, edge.y, THEME.good, 3, 90);
					}
					if (running) scheduleAdvance(ADVANCE_MS);
					else advanceRemaining = ADVANCE_MS;
				}
			};
			const onMouseDown = (event) => {
				if (!running) return;
				const rect = canvas.getBoundingClientRect();
				const cell = cellAt((event.clientX - rect.left) * LOGICAL_W$1 / rect.width, (event.clientY - rect.top) * LOGICAL_H$1 / rect.height);
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
					lastScore = -1;
					startLevel(1);
				} else if (event.code === "KeyP") {
					event.preventDefault();
					togglePause();
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
				}
			};
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(50, now - last);
				last = now;
				renderLights(ctx, LOGICAL_W$1, LOGICAL_H$1, board, cursor, level, moves, false, winText);
				particles.tick(ctx, dt);
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
				if (advanceTimer !== 0) {
					clearTimeout(advanceTimer);
					advanceTimer = 0;
					advanceRemaining = Math.max(0, advanceAt - performance.now());
				}
				stopLoop();
				renderLights(ctx, LOGICAL_W$1, LOGICAL_H$1, board, cursor, level, moves, true, winText);
			};
			const resume = () => {
				if (running) return;
				running = true;
				if (advanceRemaining > 0) {
					scheduleAdvance(advanceRemaining);
					advanceRemaining = 0;
				}
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
				"R：重开",
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
		function createState$1(seed = 1) {
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
		function step$1(state, dt, input) {
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
		const PLAYER_COLOR = accent(0);
		const AI_COLOR = accent(4);
		const BALL_COLOR = accent(2);
		const particles = createParticles();
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
			drawPaddle(ctx, state.playerX, 594, PLAYER_COLOR);
			drawBall(ctx, state);
			if (state.playerScore !== prevPlayerScore) particles.burst(state.ball.x, 30, THEME.good, 18, 180);
			if (state.aiScore !== prevAiScore) particles.burst(state.ball.x, 640, THEME.bad, 18, 180);
			prevPlayerScore = state.playerScore;
			prevAiScore = state.aiScore;
			particles.tick(ctx, dt);
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
		function drawBall(ctx, state) {
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
			let state = createState$1();
			let running = false;
			let raf = 0;
			let last = 0;
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
				state = createState$1(Math.random() * 4294967295 >>> 0);
				reported = false;
				input.left = input.right = false;
				if (running) startLoop();
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(50, Math.max(0, now - last));
				last = now;
				state = step$1(state, dt, input);
				reportScore();
				renderPong(ctx, state);
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
				running = false;
				stopLoop();
				renderPong(ctx, state);
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("pointermove", onPointerMove);
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			focusGameHost(host);
			running = true;
			startLoop();
			renderPong(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		const GRAVITY = 1100;
		/**
		* mulberry32 PRNG: small, fast, seedable — used for the initial slider side
		* and the per-layer speed jitter.
		* @param seed - any uint32; identical seeds produce identical streams.
		* @returns a () => number in [0, 1).
		*/
		function mulberry32$1(seed) {
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
		function createState(seed) {
			const rng = mulberry32$1(seed);
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
		function step(state, dt) {
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
				p.vy += GRAVITY * dtSec;
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
		function drop(state) {
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
			let state = createState(Math.random() * 4294967295 >>> 0);
			let running = false;
			let raf = 0;
			let last = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const doDrop = () => {
				if (state.over || !running) return;
				drop(state);
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
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(50, Math.max(0, now - last));
				last = now;
				step(state, dt);
				renderStack(ctx, state);
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
			const reset = () => {
				state = createState(Math.random() * 4294967295 >>> 0);
				lastScore = -1;
				reportScore();
				if (running) startLoop();
				renderStack(ctx, state);
			};
			const togglePause = () => {
				if (running) pause();
				else resume();
			};
			const pause = () => {
				running = false;
				stopLoop();
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("pointerdown", onPointerDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderStack(ctx, state);
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
		* Wordle 词表：ANSWERS 是候选答案池，EXTRA_GUESSES 是额外合法猜测词。
		* 一个猜测合法当且仅当它出现在 ANSWERS ∪ EXTRA_GUESSES 中；两表互不重叠。
		*/
		/** 常见 5 字母候选答案（大写，150 个）。 */
		const ANSWERS = [
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
		/** 额外合法猜测词（大写，150 个，不含 ANSWERS 中的词）。 */
		const EXTRA_GUESSES = [
			"GIANT",
			"GLASS",
			"GLOBE",
			"GRACE",
			"GRADE",
			"GRAND",
			"GRANT",
			"GRAPE",
			"GRASS",
			"GREAT",
			"GREEN",
			"GROUP",
			"GROWN",
			"GUARD",
			"GUESS",
			"GUEST",
			"GUIDE",
			"HAPPY",
			"HEART",
			"HEAVY",
			"HORSE",
			"HOTEL",
			"HOUSE",
			"HUMAN",
			"IDEAL",
			"IMAGE",
			"INDEX",
			"INNER",
			"INPUT",
			"ISSUE",
			"JOINT",
			"JUDGE",
			"JUICE",
			"KNIFE",
			"KNOWN",
			"LABEL",
			"LARGE",
			"LASER",
			"LATER",
			"LAUGH",
			"LAYER",
			"LEARN",
			"LEAST",
			"LEAVE",
			"LEGAL",
			"LEVEL",
			"LIGHT",
			"LIMIT",
			"LOCAL",
			"LOGIC",
			"LOOSE",
			"LOWER",
			"LUCKY",
			"LUNCH",
			"MAGIC",
			"MAJOR",
			"MAKER",
			"MARCH",
			"MATCH",
			"MAYBE",
			"MEDIA",
			"METAL",
			"MIGHT",
			"MINOR",
			"MODEL",
			"MONEY",
			"MONTH",
			"MORAL",
			"MOTOR",
			"MOUNT",
			"MOUSE",
			"MOUTH",
			"MUSIC",
			"NEVER",
			"NIGHT",
			"NOISE",
			"NORTH",
			"NOVEL",
			"NURSE",
			"OCCUR",
			"OCEAN",
			"OFFER",
			"OFTEN",
			"ORDER",
			"OTHER",
			"PAINT",
			"PANEL",
			"PAPER",
			"PARTY",
			"PEACE",
			"PHONE",
			"PHOTO",
			"PIANO",
			"PIECE",
			"PILOT",
			"PITCH",
			"PIZZA",
			"PLACE",
			"PLAIN",
			"PLANE",
			"PLANT",
			"PLATE",
			"POINT",
			"POUND",
			"POWER",
			"PRESS",
			"PRICE",
			"PRIDE",
			"PRIME",
			"PRINT",
			"PRIZE",
			"PROOF",
			"PROUD",
			"PROVE",
			"QUEEN",
			"QUICK",
			"QUIET",
			"QUITE",
			"RADIO",
			"RAISE",
			"RANGE",
			"RAPID",
			"RATIO",
			"REACH",
			"READY",
			"RIGHT",
			"RIVAL",
			"RIVER",
			"ROBOT",
			"ROUGH",
			"ROUND",
			"ROUTE",
			"ROYAL",
			"SALSA",
			"SAINT",
			"SCALE",
			"SCENE",
			"SCOPE",
			"SCORE",
			"SENSE"
		];
		//#endregion
		//#region src/client/games/wordle/logic.ts
		/**
		* Wordle 纯逻辑：判绿/黄/灰（含重复字母的正确消耗）、键盘提示合并、
		* 猜测合法性、mulberry32 种子随机选词。全部为确定性纯函数。
		*/
		/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
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
		* 标准 Wordle 判定：先标绿并消耗对应答案字母，非绿位再按剩余计数标黄；
		* 每个答案字母至多被消耗一次，重复字母不会多标黄。
		* @param guess - 5 个大写字母的猜测词。
		* @param answer - 5 个大写字母的答案。
		* @returns 与 guess 逐位对应的 5 个判定。
		*/
		function judge(guess, answer) {
			const verdicts = [
				"gray",
				"gray",
				"gray",
				"gray",
				"gray"
			];
			const remaining = /* @__PURE__ */ new Map();
			for (let i = 0; i < 5; i += 1) if (guess[i] === answer[i]) verdicts[i] = "green";
			else {
				const a = answer[i];
				remaining.set(a, (remaining.get(a) ?? 0) + 1);
			}
			for (let i = 0; i < 5; i += 1) {
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
		* 猜测是否合法：恰好 5 个大写字母，且在 answers ∪ extras 中。
		* @param w - 待检查的词。
		* @param answers - 答案词表。
		* @param extras - 额外猜测词表。
		*/
		function isValidGuess(w, answers, extras) {
			if (!/^[A-Z]{5}$/.test(w)) return false;
			return answers.includes(w) || extras.includes(w);
		}
		/**
		* 用种子确定性选一个答案。
		* @param seed - 整数种子（同种子同词）。
		* @param answers - 候选词表，默认 ANSWERS。
		* @returns 词表中的一个答案。
		*/
		function pickAnswer(seed, answers = ANSWERS) {
			const rng = mulberry32(seed);
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
		const TILE = 56;
		const GRID_X0 = 84;
		const GRID_Y0 = 48;
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
		function drawTile(ctx, x, y, letter, fill) {
			roundRectPath(ctx, x, y, TILE, TILE, 8);
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
				ctx.fillText(letter, x + TILE / 2, y + TILE / 2 + 2);
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
			ctx.fillStyle = THEME.panel;
			ctx.fillRect(0, 0, 480, 30);
			ctx.strokeStyle = THEME.panelEdge;
			ctx.lineWidth = 1;
			ctx.strokeRect(.5, .5, 479, 29);
			hudPair(ctx, 10, 20, "连胜 ", String(view.streak), "left", view.streak > 0 ? THEME.gold : THEME.text);
			hudPair(ctx, 470, 20, "行 ", `${Math.min(view.rows.length + 1, 6)}/6`, "right");
			ctx.save();
			ctx.translate(shakeDx, 0);
			for (let r = 0; r < 6; r += 1) {
				const y = GRID_Y0 + r * 64;
				const done = view.rows[r];
				if (done !== void 0) for (let c = 0; c < 5; c += 1) drawTile(ctx, GRID_X0 + c * 64, y, done.guess[c] ?? "", VERDICT_FILL[done.verdicts[c] ?? "gray"]);
				else if (r === view.rows.length && view.status === "playing") for (let c = 0; c < 5; c += 1) {
					const x = GRID_X0 + c * 64;
					const ch = view.current[c] ?? "";
					if (ch !== "") {
						glow(ctx, THEME.accents[1], 8);
						drawTile(ctx, x, y, ch, THEME.panel);
						noGlow(ctx);
					} else drawTile(ctx, x, y, "", null);
				}
				else for (let c = 0; c < 5; c += 1) drawTile(ctx, GRID_X0 + c * 64, y, "", null);
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
			if (view.status === "won") drawOverlay(ctx, 480, 620, "猜对了！", `${view.rows.length}/6 · 空格 / 点击再来一局`, THEME.good);
			else if (view.status === "lost") drawOverlay(ctx, 480, 620, `答案是 ${view.answer}`, "空格 / 点击再来一局", THEME.bad);
			else if (view.paused) drawOverlay(ctx, 480, 620, "已暂停", "按 P 继续", THEME.text);
		}
		//#endregion
		//#region src/client/games/wordle/index.ts
		const SHAKE_MS = 260;
		const TOAST_MS = 1300;
		/** 每局新种子的来源：时间戳异或递增计数器。 */
		let restartCounter = 0;
		function nextSeed() {
			restartCounter = restartCounter + 1 >>> 0;
			return (Date.now() ^ Math.imul(restartCounter, 2654435769)) >>> 0;
		}
		function createWordleGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, 480, 620);
			if (fit === null) throw new Error("dsh-minigames: wordle needs a 2d canvas context");
			const ctx = fit.ctx;
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
			let raf = 0;
			let last = 0;
			let lastScore = -1;
			const particles = createParticles();
			const newRound = () => {
				answer = pickAnswer(nextSeed());
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
				shakeMs = SHAKE_MS;
				toast = text;
				toastMs = TOAST_MS;
			};
			const submit = () => {
				if (current.length < 5) {
					reject("不足 5 个字母");
					return;
				}
				if (!isValidGuess(current, ANSWERS, EXTRA_GUESSES)) {
					reject("不在词表");
					return;
				}
				const verdicts = judge(current, answer);
				keyHints = mergeKeyHints(keyHints, current, verdicts);
				rows = [...rows, {
					guess: current,
					verdicts
				}];
				if (verdicts.every((v) => v === "green")) {
					status = "won";
					streak += 1;
					reportScore();
					const rowY = 48 + (rows.length - 1) * 64 + 28;
					particles.burst(240, rowY, accent(2), 26, 170);
				} else if (rows.length >= 6) status = "lost";
				current = "";
			};
			/** 处理一次按键：字母 / 'ENTER' / 'BACK'。 */
			const inputKey = (key) => {
				if (status !== "playing") return;
				if (key === "ENTER") submit();
				else if (key === "BACK") current = current.slice(0, -1);
				else if (/^[A-Z]$/.test(key) && current.length < 5) current += key;
			};
			const restart = () => {
				if (status === "lost" && streak !== 0) {
					streak = 0;
					reportScore();
				}
				newRound();
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
					streak = 0;
					reportScore();
					newRound();
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
				streak,
				toast,
				paused: !running
			});
			const frame = (now) => {
				raf = requestAnimationFrame(frame);
				if (!running) return;
				const dt = Math.min(50, Math.max(0, now - last));
				last = now;
				shakeMs = Math.max(0, shakeMs - dt);
				toastMs = Math.max(0, toastMs - dt);
				if (toastMs === 0) toast = "";
				const shakeDx = shakeMs > 0 ? Math.sin(shakeMs / 16) * 5 : 0;
				renderWordle(ctx, view(), shakeDx);
				particles.tick(ctx, dt);
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
				running = false;
				stopLoop();
				renderWordle(ctx, view());
			};
			const resume = () => {
				if (running) return;
				running = true;
				startLoop();
			};
			canvas.addEventListener("mousedown", onMouseDown);
			window.addEventListener("keydown", onKeyDown);
			focusGameHost(host);
			running = true;
			startLoop();
			renderWordle(ctx, view());
			return {
				start: resume,
				pause,
				resume,
				destroy: () => {
					running = false;
					stopLoop();
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
			description: "6 次机会猜出 5 字母英文单词，绿=位置对，黄=字母对，灰=没有。",
			controls: [
				"键盘 / 点击屏幕键盘：输入",
				"Enter：提交 · Backspace：删除",
				"空格 / 点击：再来一局",
				"R：重开 · P：暂停"
			],
			create: createWordleGame
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
				huarongGame,
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
				wordleGame
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
				const apply = () => {
					const instance = instanceRef.current;
					if (instance === null) return;
					if (userPaused || document.hidden) instance.pause();
					else instance.resume();
				};
				apply();
				document.addEventListener("visibilitychange", apply);
				return () => document.removeEventListener("visibilitychange", apply);
			}, [userPaused]);
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: hostRef,
						className: "dmg-game-host",
						tabIndex: 0,
						"data-dmg-host": true
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
		const css = "/* dsh-minigames panel styles. All classes are dmg- prefixed to stay\n * collision-free in the host page; the stylesheet is injected by the client\n * bundle as one <style data-plugin> tag. Palette matches the DSH dark shell. */\n\n/* Floating window: draggable, edge-snapping, hideable. */\n.dmg-float {\n  position: fixed;\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  min-width: 360px;\n  min-height: 320px;\n  max-width: calc(100vw - 16px);\n  background: #15151b;\n  color: #d8d8e0;\n  border: 1px solid #3a3a45;\n  border-radius: 12px;\n  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);\n  overflow: hidden;\n  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;\n}\n\n.dmg-float-header {\n  cursor: grab;\n  touch-action: none;\n  user-select: none;\n}\n\n.dmg-float-header:active {\n  cursor: grabbing;\n}\n\n/* Floating launcher shown while the window is hidden; draggable (left/top\n * come from inline styles), a click without travel opens the window. */\n.dmg-launcher {\n  position: fixed;\n  z-index: 2147482900;\n  width: 46px;\n  height: 46px;\n  border-radius: 50%;\n  border: 1px solid #3a3a45;\n  background: #1b1b22;\n  color: #d8d8e0;\n  font-size: 22px;\n  line-height: 1;\n  cursor: grab;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);\n  transition: transform 0.12s ease, background 0.12s ease;\n  padding: 0;\n  touch-action: none;\n  user-select: none;\n  -webkit-user-select: none;\n}\n\n.dmg-launcher:hover {\n  transform: scale(1.08);\n  background: #23232c;\n}\n\n.dmg-launcher:active {\n  cursor: grabbing;\n}\n\n.dmg-rail {\n  position: fixed;\n  right: 0;\n  top: 50%;\n  transform: translateY(-50%);\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 4px;\n  width: 36px;\n  padding: 10px 0;\n  background: #1b1b22;\n  border: 1px solid #3a3a45;\n  border-right: none;\n  border-radius: 10px 0 0 10px;\n  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.35);\n  color: #d8d8e0;\n  cursor: pointer;\n  user-select: none;\n}\n\n.dmg-rail:hover {\n  background: #23232c;\n}\n\n.dmg-rail-icon {\n  font-size: 18px;\n  line-height: 1;\n}\n\n.dmg-rail-text {\n  writing-mode: vertical-rl;\n  font-size: 11px;\n  letter-spacing: 2px;\n  color: #9a9aa5;\n}\n\n.dmg-panel {\n  position: fixed;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  min-width: 360px;\n  background: #15151b;\n  color: #d8d8e0;\n  border-left: 1px solid #3a3a45;\n  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);\n  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;\n}\n\n.dmg-resize {\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  width: 5px;\n  cursor: ew-resize;\n  z-index: 1;\n}\n\n.dmg-header {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 12px;\n  background: #1b1b22;\n  border-bottom: 1px solid #26262e;\n  flex: 0 0 auto;\n}\n\n.dmg-title {\n  font-weight: 600;\n  font-size: 14px;\n  white-space: nowrap;\n}\n\n.dmg-score {\n  margin-left: auto;\n  font-size: 12px;\n  color: #9a9aa5;\n  white-space: nowrap;\n}\n\n.dmg-header-actions {\n  display: flex;\n  gap: 6px;\n  flex: 0 0 auto;\n}\n\n.dmg-icon-btn {\n  background: none;\n  border: 1px solid #3a3a45;\n  color: #d8d8e0;\n  border-radius: 6px;\n  padding: 3px 10px;\n  cursor: pointer;\n  font-size: 12px;\n  font-family: inherit;\n}\n\n.dmg-icon-btn:hover {\n  background: #23232c;\n}\n\n.dmg-body {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  overflow: auto;\n  padding: 12px;\n  min-height: 0;\n}\n\n.dmg-picker {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));\n  gap: 10px;\n}\n\n.dmg-card {\n  background: #1b1b22;\n  border: 1px solid #3a3a45;\n  border-radius: 10px;\n  padding: 14px 10px;\n  cursor: pointer;\n  text-align: center;\n  color: inherit;\n  font-family: inherit;\n}\n\n.dmg-card:hover {\n  border-color: #5a5a6a;\n  background: #23232c;\n}\n\n.dmg-card-icon {\n  font-size: 30px;\n  line-height: 1;\n}\n\n.dmg-card-title {\n  font-weight: 600;\n  margin: 8px 0 4px;\n  font-size: 13px;\n}\n\n.dmg-card-desc {\n  font-size: 11px;\n  color: #9a9aa5;\n  line-height: 1.45;\n  min-height: 48px;\n}\n\n.dmg-card-best {\n  margin-top: 8px;\n  font-size: 11px;\n  color: #7a7a8a;\n}\n\n.dmg-game-area {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  min-height: 0;\n}\n\n.dmg-game-toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  flex: 0 0 auto;\n}\n\n.dmg-game-name {\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.dmg-game-toolbar .dmg-icon-btn {\n  margin-left: auto;\n}\n\n.dmg-game-host {\n  flex: 1;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 100%;\n  min-height: 0;\n  outline: none;\n}\n\n.dmg-game-canvas {\n  width: 100%;\n  max-width: 640px;\n  height: auto;\n  background: #15151b;\n  border-radius: 6px;\n  border: 1px solid #26262e;\n}\n\n.dmg-game-controls {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  justify-content: center;\n  flex: 0 0 auto;\n  max-width: 100%;\n}\n\n.dmg-control-tag {\n  font-size: 11px;\n  color: #9a9aa5;\n  background: #1b1b22;\n  border: 1px solid #2e2e38;\n  border-radius: 4px;\n  padding: 2px 8px;\n  white-space: nowrap;\n}\n\n.dmg-control-muted {\n  color: #7a7a8a;\n  border-style: dashed;\n}\n";
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
		const PLUGIN_VERSION = "0.5.0";
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