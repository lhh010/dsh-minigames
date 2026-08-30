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
		const GRAVITY$2 = 2100;
		const JUMP_V = -640;
		const BASE_SPEED = 320;
		const MAX_SPEED = 760;
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
				speed: BASE_SPEED,
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
		function step(state, dt, input) {
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
			state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.score * SPEED_PER_SCORE);
			const dino = state.dino;
			if (input.jump && dino.onGround) {
				dino.vy = JUMP_V;
				dino.onGround = false;
			}
			if (!dino.onGround) {
				dino.vy += GRAVITY$2 * dt;
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
		//#region src/client/games/dino/render.ts
		const DAY = {
			bg: "#f4f1e9",
			dino: "#2e2e35",
			dinoShade: "#8a8a96",
			cactus: "#5aa864",
			cactusDark: "#3d7a46",
			bird: "#8f8f9c",
			birdDark: "#5f5f6c",
			beak: "#e08a30",
			ground: "#6f6f7a",
			groundDash: "#c2bdb1",
			cloud: "#d9d5c9",
			text: "#4a4a55",
			eye: "#ffffff",
			fog: "#c8d2da",
			rain: "#6f86a0"
		};
		const NIGHT = {
			bg: "#13131a",
			dino: "#ececf2",
			dinoShade: "#b9b9c6",
			cactus: "#67b26f",
			cactusDark: "#45834d",
			bird: "#c6c6d2",
			birdDark: "#8f8fa0",
			beak: "#e8a04c",
			ground: "#8f8f9c",
			groundDash: "#5c5c68",
			cloud: "#2e2e38",
			text: "#d8d8e0",
			eye: "#ffffff",
			fog: "#8b96b5",
			rain: "#9fb8d8"
		};
		/** Draw one frame of the run. */
		function renderDino(ctx, state) {
			const p = state.night ? NIGHT : DAY;
			ctx.clearRect(0, 0, 600, 185);
			ctx.fillStyle = p.bg;
			ctx.fillRect(0, 0, 600, 185);
			drawClouds(ctx, state, p);
			drawGround(ctx, state, p);
			for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.t, p);
			drawDino(ctx, state, p);
			if (state.raining) {
				drawFog(ctx, state, p);
				drawRain(ctx, state, p);
			}
			ctx.fillStyle = p.text;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "right";
			ctx.fillText(String(Math.floor(state.score)).padStart(5, "0"), 588, 22);
			if (state.over) drawGameOver(ctx, state, p);
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
			ctx.beginPath();
			ctx.roundRect(x, y, w, h, [
				r,
				r,
				3,
				3
			]);
			ctx.fill();
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
		function drawGameOver(ctx, state, p) {
			ctx.fillStyle = p.text;
			ctx.font = "bold 20px ui-monospace, monospace";
			ctx.textAlign = "center";
			ctx.fillText("GAME OVER", 300, 73);
			ctx.font = "12px ui-monospace, monospace";
			ctx.fillText(`得分 ${Math.floor(state.score)} · 按空格或点击重新开始`, 300, 97);
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
				step(state, dt, {
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
				state.nextQueue.push(randomPiece(state.rng));
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
		* Tetris canvas renderer: the 10x20 board, the current piece with its ghost,
		* and the next/hold previews on the right. Palette tuned for the DSH dark
		* shell.
		*/
		const CELL$11 = 22;
		const MINI = 14;
		const BOARD_W$10 = 220;
		const BOARD_H$10 = 440;
		/** Full logical canvas width: the board plus the preview column. */
		const LOGICAL_W$14 = 332;
		const PREVIEW_X = 236;
		const PREVIEW_W = 88;
		/** Kind id -> fill color. */
		const COLORS = [
			"",
			"#e45756",
			"#4c9ae8",
			"#b07cc9",
			"#5abf6b",
			"#e8c84c",
			"#e88a4c",
			"#4cd0c9"
		];
		const GRID_LINE$2 = "#26262e";
		const BOARD_BG$1 = "#15151b";
		const BOARD_BORDER = "#3a3a45";
		const TEXT$16 = "#d8d8e0";
		function drawCell(ctx, x, y, color, alpha = 1) {
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.fillRect(x + 1, y + 1, 20, 20);
			ctx.fillStyle = "rgba(255,255,255,0.25)";
			ctx.fillRect(x + 2, y + 2, 18, 2);
			ctx.fillStyle = "rgba(0,0,0,0.25)";
			ctx.fillRect(x + 2, y + CELL$11 - 4, 18, 2);
			ctx.globalAlpha = 1;
		}
		function drawShape(ctx, shape, px, py, kind, alpha = 1) {
			for (let r = 0; r < shape.length; r += 1) for (let c = 0; c < shape[r].length; c += 1) {
				if (shape[r][c] === 0) continue;
				drawCell(ctx, px + c * CELL$11, py + r * CELL$11, COLORS[kind], alpha);
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
			ctx.fillStyle = COLORS[piece.kind];
			for (let r = 0; r < shape.length; r += 1) for (let c = 0; c < shape[r].length; c += 1) {
				if (shape[r][c] === 0) continue;
				ctx.fillRect(ox + c * MINI, oy + r * MINI, 13, 13);
			}
		}
		/** Draw a full-size piece preview (hold). */
		function drawHold(ctx, piece, y) {
			ctx.fillStyle = TEXT$16;
			ctx.font = "11px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText("暂存 C", PREVIEW_X, y);
			ctx.fillStyle = BOARD_BG$1;
			ctx.fillRect(PREVIEW_X, y + 6, PREVIEW_W, 66);
			ctx.strokeStyle = GRID_LINE$2;
			ctx.strokeRect(236.5, y + 6.5, PREVIEW_W, 66);
			if (piece === null) return;
			const shape = piece.shape;
			drawShape(ctx, shape, PREVIEW_X + Math.floor((PREVIEW_W - shape[0].length * CELL$11) / 2), y + 6 + Math.floor((66 - shape.length * CELL$11) / 2), piece.kind);
		}
		/** Draw the next-queue previews (up to PREVIEW_COUNT mini pieces). */
		function drawNextQueue(ctx, state) {
			ctx.fillStyle = TEXT$16;
			ctx.font = "11px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.textBaseline = "alphabetic";
			ctx.fillText("下一个", PREVIEW_X, 12);
			const itemH = 50;
			for (let i = 0; i < Math.min(5, state.nextQueue.length); i += 1) {
				const y = 18 + i * itemH;
				ctx.fillStyle = BOARD_BG$1;
				ctx.fillRect(PREVIEW_X, y, PREVIEW_W, 42);
				ctx.strokeStyle = GRID_LINE$2;
				ctx.strokeRect(236.5, y + .5, PREVIEW_W, 42);
				drawMiniPiece(ctx, state.nextQueue[i], PREVIEW_X, y, PREVIEW_W);
			}
		}
		/** Draw one frame of the game. */
		function renderTetris(ctx, state) {
			const width = LOGICAL_W$14;
			ctx.clearRect(0, 0, width, 448);
			ctx.fillStyle = BOARD_BG$1;
			ctx.fillRect(0, 0, BOARD_W$10, BOARD_H$10);
			ctx.strokeStyle = BOARD_BORDER;
			ctx.lineWidth = 2;
			ctx.strokeRect(1, 1, 218, 438);
			ctx.strokeStyle = GRID_LINE$2;
			ctx.lineWidth = 1;
			for (let c = 1; c < 10; c += 1) {
				ctx.beginPath();
				ctx.moveTo(c * CELL$11 + .5, 0);
				ctx.lineTo(c * CELL$11 + .5, BOARD_H$10);
				ctx.stroke();
			}
			for (let r = 1; r < 20; r += 1) {
				ctx.beginPath();
				ctx.moveTo(0, r * CELL$11 + .5);
				ctx.lineTo(BOARD_W$10, r * CELL$11 + .5);
				ctx.stroke();
			}
			for (let r = 0; r < 20; r += 1) for (let c = 0; c < 10; c += 1) {
				const kind = state.grid[r][c];
				if (kind !== 0) drawCell(ctx, c * CELL$11, r * CELL$11, COLORS[kind]);
			}
			if (state.current !== null) {
				const piece = state.current;
				const gy = ghostY(state);
				if (gy !== piece.y) drawShape(ctx, piece.shape, piece.x * CELL$11, gy * CELL$11, piece.kind, .25);
				drawShape(ctx, piece.shape, piece.x * CELL$11, piece.y * CELL$11, piece.kind);
			}
			drawNextQueue(ctx, state);
			drawHold(ctx, state.hold, 276);
			if (state.over) {
				ctx.fillStyle = TEXT$16;
				ctx.font = "bold 18px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("GAME OVER", BOARD_W$10 / 2, BOARD_H$10 / 2 - 8);
				ctx.font = "12px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · R 重新开始`, BOARD_W$10 / 2, 238);
			}
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$14, 448);
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
		const PLAYER_SPEED = 120;
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
					moveTank(state, player, player.targetDir, PLAYER_SPEED * dt);
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
		* Tank battle canvas renderer: brick/steel tiles, tanks with directional
		* turrets and animated treads, glowing bullets, and explosion effects.
		* Palette tuned for the DSH dark shell.
		*/
		const BRICK = "#8a5a3a";
		const BRICK_LIGHT = "#9c6a46";
		const BRICK_DARK = "#5f3c26";
		const STEEL = "#8a8a98";
		const STEEL_DARK = "#5c5c68";
		const PLAYER$1 = "#6aa7ff";
		const PLAYER_DARK = "#3f6ec0";
		const ENEMY = "#ff7a6a";
		const ENEMY_DARK = "#c04a3c";
		const TREAD = "#3a3a44";
		const BULLET_CORE = "#ffffff";
		const BULLET_PLAYER = "#ffe08a";
		const BULLET_ENEMY = "#ff9d6b";
		const TEXT$15 = "#d8d8e0";
		const TANK_W = 480;
		const TANK_H = 416;
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
				ctx.fillStyle = STEEL;
				ctx.fillRect(x, y, 32, 32);
				ctx.strokeStyle = STEEL_DARK;
				ctx.lineWidth = 2;
				ctx.strokeRect(x + 3, y + 3, 26, 26);
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
			const body = isPlayer ? PLAYER$1 : ENEMY;
			const dark = isPlayer ? PLAYER_DARK : ENEMY_DARK;
			const cx = x + 16;
			const cy = y + 16;
			ctx.fillStyle = TREAD;
			ctx.fillRect(x + 3, y + 3, 26, 26);
			const tick = Math.floor((t * 90 + (isPlayer ? 0 : 40)) % 32);
			ctx.fillStyle = dark;
			for (let i = 0; i < 3; i += 1) {
				const off = (tick + i * 12) % 32;
				ctx.fillRect(x + 6, y + 3 + off, 4, 5);
				ctx.fillRect(x + 32 - 10, y + 3 + off, 4, 5);
			}
			ctx.fillStyle = body;
			ctx.fillRect(x + 8, y + 8, 16, 16);
			ctx.strokeStyle = dark;
			ctx.lineWidth = 1;
			ctx.strokeRect(x + 8.5, y + 8.5, 15, 15);
			ctx.fillStyle = dark;
			ctx.fillRect(cx - 4 + DIR_DX[tank.dir] * 12, cy - 4 + DIR_DY[tank.dir] * 12, 8, 8);
			ctx.fillStyle = body;
			ctx.fillRect(cx - 3, cy - 3, 6, 6);
		}
		function drawBullet(ctx, bullet) {
			ctx.fillStyle = bullet.owner === "player" ? BULLET_PLAYER : BULLET_ENEMY;
			ctx.fillRect(bullet.x - 2, bullet.y - 2, 10, 10);
			ctx.fillStyle = BULLET_CORE;
			ctx.fillRect(bullet.x, bullet.y, 6, 6);
		}
		function drawEffects(ctx, state) {
			for (const effect of state.effects) {
				const k = effect.t / effect.life;
				ctx.globalAlpha = 1 - k;
				ctx.fillStyle = k < .5 ? "#ffe08a" : "#ff9d6b";
				const r = 3 + 16 * k;
				ctx.beginPath();
				ctx.arc(effect.x, effect.y, r, 0, Math.PI * 2);
				ctx.fill();
				ctx.globalAlpha = 1;
			}
		}
		/** Draw one frame of the battle. */
		function renderTanks(ctx, state) {
			ctx.clearRect(0, 0, TANK_W, TANK_H);
			ctx.fillStyle = "#131318";
			ctx.fillRect(0, 0, TANK_W, TANK_H);
			for (let ty = 0; ty < 13; ty += 1) for (let tx = 0; tx < 15; tx += 1) {
				const tile = state.grid[ty][tx];
				if (tile !== 0) drawTile$1(ctx, tx, ty, tile);
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
			drawEffects(ctx, state);
			for (const bullet of state.bullets) drawBullet(ctx, bullet);
			for (const enemy of state.enemies) drawTank(ctx, enemy, state.t);
			if (state.player.alive) drawTank(ctx, state.player, state.t);
			ctx.fillStyle = TEXT$15;
			ctx.font = "12px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`第 ${state.wave}/3 波`, 8, 16);
			ctx.fillText(`剩余敌人 ${state.enemies.length + state.spawnQueue}`, 8, 32);
			ctx.fillText(`生命 ${"♥".repeat(Math.max(0, state.player.hp))}`, 8, 48);
			if (state.result !== "none") {
				ctx.fillStyle = TEXT$15;
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText(state.result === "win" ? "胜 利 ！" : "G A M E  O V E R", TANK_W / 2, TANK_H / 2 - 10);
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, TANK_W / 2, 228);
			}
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
		/** Start the next level: fresh board, reset score, doubled target. */
		function advanceLevel(state) {
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
		/** Gem fill colors by kind (1..5). */
		const GEM_COLORS = [
			"",
			"#e45756",
			"#4c9ae8",
			"#5abf6b",
			"#e8c84c",
			"#b07cc9"
		];
		const GEM_DARK = [
			"",
			"#a83a3a",
			"#3a72b8",
			"#3f8f4e",
			"#b89a30",
			"#86579c"
		];
		const BOARD_BG = "#15151b";
		const GRID_LINE$1 = "rgba(255,255,255,0.05)";
		const CURSOR$1 = "#ffe08a";
		const TEXT$14 = "#d8d8e0";
		const MUTED$1 = "#7a7a8a";
		function cellX(c) {
			return c * 44 + 22;
		}
		function cellY(r) {
			return 40 + r * 44 + 22;
		}
		/** Draw one gem shape at (cx, cy), radius r. */
		function drawGem(ctx, kind, cx, cy, r) {
			const color = GEM_COLORS[kind];
			const dark = GEM_DARK[kind];
			ctx.fillStyle = color;
			switch (kind) {
				case 1:
					ctx.beginPath();
					ctx.arc(cx, cy, r * .62, 0, Math.PI * 2);
					ctx.fill();
					break;
				case 2:
					ctx.beginPath();
					ctx.roundRect(cx - r * .6, cy - r * .6, r * 1.2, r * 1.2, r * .25);
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
			ctx.strokeStyle = dark;
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.fillStyle = "rgba(255,255,255,0.28)";
			ctx.beginPath();
			ctx.arc(cx - r * .2, cy - r * .28, r * .18, 0, Math.PI * 2);
			ctx.fill();
		}
		function drawHud(ctx, state) {
			ctx.fillStyle = "#1b1b22";
			ctx.fillRect(0, 0, 352, 40);
			ctx.fillStyle = TEXT$14;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`第 ${state.level} 关`, 10, 16);
			ctx.textAlign = "right";
			ctx.fillText(`得分 ${state.score} / ${state.target}`, 342, 16);
			const progress = Math.min(1, state.score / state.target);
			ctx.fillStyle = "#26262e";
			ctx.fillRect(10, 24, 332, 6);
			ctx.fillStyle = "#5abf6b";
			ctx.fillRect(10, 24, 332 * progress, 6);
			ctx.fillStyle = MUTED$1;
			ctx.font = "10px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText("点击同色四连通块消除", 10, 37);
		}
		/** Draw one frame. `grid` is the display grid (pre-removal during the clear phase). */
		function renderMatch3(ctx, state, grid, view) {
			ctx.clearRect(0, 0, 352, 392);
			ctx.fillStyle = BOARD_BG;
			ctx.fillRect(0, 40, 352, 352);
			drawHud(ctx, state);
			ctx.strokeStyle = GRID_LINE$1;
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
					drawGem(ctx, kind, cellX(fall.from.c), cellY(fall.from.r) + (cellY(fall.to.r) - cellY(fall.from.r)) * k, 18.48);
				} else drawGem(ctx, kind, cellX(c), cellY(r), 18.48);
			}
			if (clear !== null) {
				const pulse = .4 + .5 * Math.abs(Math.sin(clear.t * 24));
				for (const p of clear.removed) {
					ctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(2)})`;
					ctx.fillRect(p.c * 44 + 2, 40 + p.r * 44 + 2, 40, 40);
				}
				const bottomRow = Math.max(...clear.removed.map((p) => p.r));
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 14px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.globalAlpha = Math.max(0, 1 - clear.t);
				ctx.fillText(clear.scoreText, 176, cellY(bottomRow) - 8 - clear.t * 22);
				ctx.globalAlpha = 1;
			}
			if (view.cursor !== null) {
				const p = view.cursor;
				ctx.strokeStyle = CURSOR$1;
				ctx.lineWidth = 1.5;
				ctx.setLineDash([4, 3]);
				ctx.strokeRect(p.c * 44 + 3, 40 + p.r * 44 + 3, 38, 38);
				ctx.setLineDash([]);
			}
			if (view.result === "win") {
				ctx.fillStyle = "rgba(21,21,27,0.55)";
				ctx.fillRect(0, 40, 352, 352);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 26px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("过 关 ！", 176, 210);
				ctx.fillStyle = TEXT$14;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`第 ${state.level} 关完成 · 目标 ${state.target}`, 176, 238);
			} else if (view.result === "lose") {
				ctx.fillStyle = "rgba(21,21,27,0.6)";
				ctx.fillRect(0, 40, 352, 352);
				ctx.fillStyle = "#e45756";
				ctx.font = "bold 26px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("游 戏 结 束", 176, 204);
				ctx.fillStyle = TEXT$14;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} / 目标 ${state.target} · 按 R 重新开始`, 176, 232);
			}
		}
		//#endregion
		//#region src/client/games/match3/index.ts
		const CLEAR_MS = 280;
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
				if (phase === "clear" && phaseT >= CLEAR_MS) {
					displayGrid = state.grid;
					updateResult(state);
					if (state.result === "win") {
						phase = "win";
						phaseT = 0;
					} else if (state.result === "lose") phase = "lose";
					else phase = "idle";
					clearPlan = null;
				} else if (phase === "win" && phaseT >= WIN_MS) {
					advanceLevel(state);
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
						t: Math.min(1, phaseT / CLEAR_MS),
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
			description: "点击同色四连通块消除，一次消得越多分越高；达到目标分过关，目标逐关翻倍。",
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
		function isSolved(state) {
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
			state.solved = isSolved(state);
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
			state.solved = isSolved(state);
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
		const TILE = "#3a4a6a";
		const TILE_LIGHT = "#5a7ab0";
		const TILE_SOLVED = "#3f7a4a";
		const TILE_SOLVED_LIGHT = "#5fa86a";
		const EMPTY = "#15151b";
		const GRID$1 = "#26262e";
		const TEXT$13 = "#f0f4ff";
		const MUTED = "#9aa3b8";
		function cellCenter(pos) {
			return {
				x: pos.c * 72 + 36,
				y: 40 + pos.r * 72 + 36
			};
		}
		/** Whether tile `value` is in its solved position. */
		function inSolvedSpot(state, value, r, c) {
			return value === r * state.cols + c + 1;
		}
		/** Draw a single rounded tile with its number. */
		function drawTile(ctx, state, value, cx, cy, r, c) {
			const correct = inSolvedSpot(state, value, r, c);
			const base = correct ? TILE_SOLVED : TILE;
			const light = correct ? TILE_SOLVED_LIGHT : TILE_LIGHT;
			const size = 64;
			const radius = 10;
			ctx.fillStyle = base;
			ctx.beginPath();
			ctx.roundRect(cx - size / 2, cy - size / 2, size, size, radius);
			ctx.fill();
			ctx.fillStyle = light;
			ctx.beginPath();
			ctx.roundRect(cx - size / 2 + 4, cy - size / 2 + 4, 56, 8, 5);
			ctx.fill();
			ctx.fillStyle = TEXT$13;
			ctx.font = "bold 26px ui-monospace, monospace";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(String(value), cx, cy + 2);
		}
		/** Draw one frame. `board` is the (already-updated) logical board. */
		function renderHuarong(ctx, state, view) {
			ctx.clearRect(0, 0, 288, 328);
			ctx.fillStyle = "#13131a";
			ctx.fillRect(0, 0, 288, 328);
			ctx.fillStyle = "#1b1b22";
			ctx.fillRect(0, 0, 288, 40);
			ctx.fillStyle = TEXT$13;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`步数 ${state.moves}`, 10, 16);
			ctx.textAlign = "right";
			const seconds = Math.floor(state.elapsed);
			ctx.fillText(`用时 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, 278, 16);
			ctx.fillStyle = MUTED;
			ctx.font = "10px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText("点击/方向键滑动方块，按 1..15 顺序排列", 10, 37);
			ctx.fillStyle = EMPTY;
			ctx.fillRect(0, 40, 288, 288);
			ctx.strokeStyle = GRID$1;
			ctx.lineWidth = 1;
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
				const { x, y } = cellCenter({
					r,
					c
				});
				drawTile(ctx, state, value, x, y, r, c);
			}
			if (view.slides !== null) {
				const k = view.slides.t;
				for (const s of view.slides.entries) {
					const from = cellCenter(s.from);
					const to = cellCenter(s.to);
					drawTile(ctx, state, s.tile, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, s.to.r, s.to.c);
				}
			}
			if (view.solved) {
				ctx.fillStyle = "rgba(19,19,26,0.7)";
				ctx.fillRect(0, 40, 288, 288);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 28px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText("完 成 ！", 144, 170);
				ctx.fillStyle = TEXT$13;
				ctx.font = "14px ui-monospace, monospace";
				const seconds2 = Math.floor(state.elapsed);
				ctx.fillText(`${state.moves} 步 · ${Math.floor(seconds2 / 60)}:${String(seconds2 % 60).padStart(2, "0")}`, 144, 202);
				ctx.fillStyle = MUTED;
				ctx.font = "12px ui-monospace, monospace";
				ctx.fillText("按 R 或点击 重新开始", 144, 226);
			}
			ctx.textBaseline = "alphabetic";
		}
		//#endregion
		//#region src/client/games/huarong/index.ts
		const SLIDE_MS = 120;
		/** The arrow direction each key maps to (tile motion: 0 up, 1 right, 2 down, 3 left). */
		const KEY_DIR$1 = {
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
				const dir = KEY_DIR$1[event.code];
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
		const DIRS$3 = [
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
			const [dr, dc] = DIRS$3[state.dir];
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
		const BG$6 = "#15151b";
		const GRID_LINE = "rgba(255,255,255,0.04)";
		const SNAKE = "#5abf6b";
		const SNAKE_HEAD = "#7ae08c";
		const FOOD = "#e45756";
		const TEXT$12 = "#d8d8e0";
		/** Draw one frame. */
		function renderSnake(ctx, state) {
			ctx.clearRect(0, 0, 416, 342);
			ctx.fillStyle = "#1b1b22";
			ctx.fillRect(0, 0, 416, 30);
			ctx.fillStyle = TEXT$12;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`得分 ${state.score}`, 10, 20);
			ctx.fillStyle = BG$6;
			ctx.fillRect(0, 30, 416, 312);
			ctx.strokeStyle = GRID_LINE;
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
			ctx.fillStyle = FOOD;
			ctx.beginPath();
			ctx.arc(state.food.c * 26 + 13, 30 + state.food.r * 26 + 13, 7.8, 0, Math.PI * 2);
			ctx.fill();
			state.snake.forEach((p, i) => {
				const x = p.c * 26;
				const y = 30 + p.r * 26;
				ctx.fillStyle = i === 0 ? SNAKE_HEAD : SNAKE;
				ctx.fillRect(x + 1, y + 1, 24, 24);
			});
			if (state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.6)";
				ctx.fillRect(0, 30, 416, 312);
				ctx.fillStyle = TEXT$12;
				ctx.font = "bold 22px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("游 戏 结 束", 208, 178);
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, 208, 204);
			}
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
		function emptyGrid$1() {
			return Array.from({ length: 4 }, () => Array(4).fill(null));
		}
		/** All empty cells. */
		function emptyCells(grid) {
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
			const empty = emptyCells(state.grid);
			if (empty.length === 0) return;
			const spot = empty[Math.floor(state.rng() * empty.length)];
			state.grid[spot.r][spot.c] = state.rng() < .9 ? 2 : 4;
		}
		/** A fresh board with two starting tiles. */
		function create2048State(rng = Math.random) {
			const state = {
				grid: emptyGrid$1(),
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
		const BG$5 = "#1b1b22";
		const CELL_BG = "#26262e";
		const TEXT$11 = "#d8d8e0";
		/** Tile background color by exponent of 2 (value). */
		function tileColor(value) {
			if (value === 2) return "#3a4a6a";
			if (value === 4) return "#4a6a9a";
			if (value === 8) return "#5a8ab0";
			if (value === 16) return "#5abf8a";
			if (value === 32) return "#e8a04c";
			if (value === 64) return "#e8864c";
			if (value === 128) return "#e8604c";
			if (value === 256) return "#e84c8a";
			if (value === 512) return "#b07cc9";
			if (value === 1024) return "#e8c84c";
			return "#4cd0c9";
		}
		function tilePos(i) {
			return 8 + i * 72;
		}
		/** Draw one frame. */
		function render2048(ctx, state) {
			ctx.clearRect(0, 0, 296, 332);
			ctx.fillStyle = "#15151b";
			ctx.fillRect(0, 0, 296, 36);
			ctx.fillStyle = TEXT$11;
			ctx.font = "bold 16px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText("2048", 10, 25);
			ctx.textAlign = "right";
			ctx.font = "13px ui-monospace, monospace";
			ctx.fillText(`得分 ${state.score}`, 286, 25);
			ctx.fillStyle = BG$5;
			ctx.fillRect(0, 36, 296, 296);
			for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) {
				const x = tilePos(c);
				const y = 36 + tilePos(r);
				const value = state.grid[r][c] ?? null;
				ctx.fillStyle = value === null ? CELL_BG : tileColor(value);
				ctx.fillRect(x, y, 64, 64);
				if (value !== null) {
					ctx.fillStyle = value <= 4 ? "#e8ecf4" : "#ffffff";
					ctx.font = value >= 1024 ? "bold 18px ui-monospace, monospace" : "bold 24px ui-monospace, monospace";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText(String(value), x + 32, y + 32);
				}
			}
			ctx.textBaseline = "alphabetic";
			if (state.won && !state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.55)";
				ctx.fillRect(0, 36, 296, 296);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("达 成 2048 ！", 148, 176);
				ctx.fillStyle = TEXT$11;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText("继续挑战更高分 · R 重新开始", 148, 204);
			} else if (state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.65)";
				ctx.fillRect(0, 36, 296, 296);
				ctx.fillStyle = TEXT$11;
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("游 戏 结 束", 148, 176);
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, 148, 204);
			}
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
		function tick$1(state, dt) {
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
		const BOARD_W$5 = 270;
		const BOARD_H$5 = 270;
		const LOGICAL_W$9 = BOARD_W$5;
		const LOGICAL_H$9 = 300;
		const HIDDEN = "#2e2e38";
		const HIDDEN_LIGHT = "#3a3a46";
		const REVEALED = "#1b1b22";
		const TEXT$10 = "#d8d8e0";
		const FLAG = "#e45756";
		const MINE = "#202028";
		const NUMBER_COLORS = [
			"",
			"#5abf6b",
			"#4c9ae8",
			"#e45756",
			"#7a4ce8",
			"#e88a4c",
			"#4cd0c9",
			"#e8c84c",
			"#9aa3b8"
		];
		/** Seconds -> "mm:ss" (or "ss" under a minute). */
		function formatTime(seconds) {
			const s = Math.floor(seconds);
			const m = Math.floor(s / 60);
			return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
		}
		/** Draw one frame. */
		function renderMinesweeper(ctx, state) {
			ctx.clearRect(0, 0, LOGICAL_W$9, LOGICAL_H$9);
			ctx.fillStyle = "#15151b";
			ctx.fillRect(0, 0, LOGICAL_W$9, 30);
			ctx.fillStyle = TEXT$10;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			const flagged = state.grid.flat().filter((c) => c.flagged).length;
			ctx.fillText(`💣 ${Math.max(0, 10 - flagged)}`, 10, 20);
			ctx.textAlign = "right";
			ctx.fillText(`⏱ ${formatTime(state.elapsed)}`, 260, 20);
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
				const x = c * 30;
				const y = 30 + r * 30;
				const cell = state.grid[r][c];
				if (!cell.revealed) {
					ctx.fillStyle = HIDDEN;
					ctx.fillRect(x + 1, y + 1, 28, 28);
					ctx.fillStyle = HIDDEN_LIGHT;
					ctx.fillRect(x + 1, y + 1, 28, 3);
					if (cell.flagged) {
						ctx.fillStyle = FLAG;
						ctx.beginPath();
						ctx.arc(x + 15, y + 15, 6.6, 0, Math.PI * 2);
						ctx.fill();
					}
				} else if (cell.mine) {
					ctx.fillStyle = REVEALED;
					ctx.fillRect(x + 1, y + 1, 28, 28);
					ctx.fillStyle = MINE;
					ctx.beginPath();
					ctx.arc(x + 15, y + 15, 8.4, 0, Math.PI * 2);
					ctx.fill();
					ctx.fillStyle = "#ffffff";
					ctx.beginPath();
					ctx.arc(x + 15 - 2, y + 15 - 2, 2.4, 0, Math.PI * 2);
					ctx.fill();
				} else {
					ctx.fillStyle = REVEALED;
					ctx.fillRect(x + 1, y + 1, 28, 28);
					if (cell.count > 0) {
						ctx.fillStyle = NUMBER_COLORS[cell.count];
						ctx.font = "bold 14px ui-monospace, monospace";
						ctx.textAlign = "center";
						ctx.textBaseline = "middle";
						ctx.fillText(String(cell.count), x + 15, y + 15);
					}
				}
			}
			ctx.textBaseline = "alphabetic";
			if (state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.6)";
				ctx.fillRect(0, 30, BOARD_W$5, BOARD_H$5);
				ctx.fillStyle = "#e45756";
				ctx.font = "bold 22px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("踩 雷 了", BOARD_W$5 / 2, 157);
				ctx.fillStyle = TEXT$10;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText("按 R 重新开始", BOARD_W$5 / 2, 183);
			} else if (state.won) {
				ctx.fillStyle = "rgba(21,21,27,0.6)";
				ctx.fillRect(0, 30, BOARD_W$5, BOARD_H$5);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 22px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("全 部 排 雷 ！", BOARD_W$5 / 2, 157);
				ctx.fillStyle = TEXT$10;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`用时 ${formatTime(state.elapsed)} · 按 R 重新开始`, BOARD_W$5 / 2, 183);
			}
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$9, LOGICAL_H$9);
			if (fit === null) throw new Error("dsh-minigames: minesweeper needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createMinesweeperState();
			let running = false;
			let raf = 0;
			let last = 0;
			let reported = false;
			const cellFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$9 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$9 / rect.height;
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
				tick$1(state, dt);
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
		const BOARD_W$4 = 192;
		const BOARD_H$4 = 192;
		const LOGICAL_W$8 = BOARD_W$4;
		const LOGICAL_H$8 = 224;
		const BACK = "#3a4a6a";
		const BACK_LIGHT = "#5a7ab0";
		const CARD_UP = "#26262e";
		const TEXT$9 = "#d8d8e0";
		const MATCH_GLOW = "#5abf6b";
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
		/** Draw one frame. */
		function renderMemory(ctx, state) {
			ctx.clearRect(0, 0, LOGICAL_W$8, LOGICAL_H$8);
			ctx.fillStyle = "#15151b";
			ctx.fillRect(0, 0, LOGICAL_W$8, 32);
			ctx.fillStyle = TEXT$9;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`步数 ${state.moves}`, 10, 21);
			ctx.textAlign = "right";
			ctx.fillText(`配对 ${state.matched}/8`, 182, 21);
			for (let i = 0; i < state.cards.length; i += 1) {
				const r = Math.floor(i / 4);
				const x = i % 4 * 48;
				const y = 32 + r * 48;
				const symbol = state.cards[i] ?? null;
				if (symbol === null) continue;
				if (state.flipped.includes(i)) {
					ctx.fillStyle = CARD_UP;
					ctx.fillRect(x + 2, y + 2, 44, 44);
					ctx.font = "26px serif";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText(SYMBOLS[symbol] ?? "?", x + 24, y + 24);
					ctx.strokeStyle = MATCH_GLOW;
					ctx.lineWidth = 2;
					ctx.strokeRect(x + 2.5, y + 2.5, 43, 43);
				} else {
					ctx.fillStyle = BACK;
					ctx.fillRect(x + 2, y + 2, 44, 44);
					ctx.fillStyle = BACK_LIGHT;
					ctx.fillRect(x + 2, y + 2, 44, 3);
				}
			}
			ctx.textBaseline = "alphabetic";
			if (state.finished) {
				ctx.fillStyle = "rgba(21,21,27,0.6)";
				ctx.fillRect(0, 32, BOARD_W$4, BOARD_H$4);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("全 部 配 对 ！", BOARD_W$4 / 2, 120);
				ctx.fillStyle = TEXT$9;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`${state.moves} 步完成 · 按 R 重新开始`, BOARD_W$4 / 2, 148);
			}
		}
		//#endregion
		//#region src/client/games/memory/index.ts
		const REVEAL_MS = 1e3;
		function createMemoryGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$8, LOGICAL_H$8);
			if (fit === null) throw new Error("dsh-minigames: memory needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createMemoryState();
			let running = false;
			let raf = 0;
			let last = 0;
			let lockUntil = 0;
			let flipTimer = 0;
			let lastScore = -1;
			const reportScore = () => {
				const score = Math.max(0, 500 - state.moves * 5);
				if (score === lastScore) return;
				lastScore = score;
				options?.onScore?.(score);
			};
			const indexFromEvent = (event) => {
				const rect = canvas.getBoundingClientRect();
				const x = (event.clientX - rect.left) * LOGICAL_W$8 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$8 / rect.height;
				const c = Math.floor(x / 48);
				const r = Math.floor((y - 32) / 48);
				if (r < 0 || r >= 4 || c < 0 || c >= 4) return null;
				return r * 4 + c;
			};
			const onMouseDown = (event) => {
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
		const DIRS$2 = [
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
		function checkWin(board, r, c) {
			const stone = board[r][c];
			if (stone === 0) return false;
			for (const [dr, dc] of DIRS$2) if (lineLength(board, r, c, dr, dc, stone) >= 5) return true;
			return false;
		}
		/** Place a stone for the current turn; advances the turn and checks the win. */
		function place$2(state, r, c) {
			if (state.over || state.board[r][c] !== 0) return false;
			state.board[r][c] = state.turn;
			if (checkWin(state.board, r, c)) {
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
			for (const [dr, dc] of DIRS$2) {
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
				if (checkWin(state.board, m.r, m.c)) {
					state.board[m.r][m.c] = 0;
					return m;
				}
				state.board[m.r][m.c] = 0;
			}
			for (const m of empties) {
				state.board[m.r][m.c] = 1;
				if (checkWin(state.board, m.r, m.c)) {
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
		const BOARD_W$3 = 360;
		const BOARD_H$3 = 360;
		const LOGICAL_W$7 = BOARD_W$3;
		const LOGICAL_H$7 = 392;
		const BG$4 = "#c8a86a";
		const LINE$1 = "#8a6a3a";
		const TEXT$8 = "#d8d8e0";
		const BLACK$1 = "#1a1a1a";
		const WHITE$1 = "#f0f0f0";
		/** Draw one frame. */
		function renderGomoku(ctx, state) {
			ctx.clearRect(0, 0, LOGICAL_W$7, LOGICAL_H$7);
			ctx.fillStyle = "#1b1b22";
			ctx.fillRect(0, 0, LOGICAL_W$7, 32);
			ctx.fillStyle = TEXT$8;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			if (state.over) ctx.fillText(state.winner === 1 ? "你赢了！" : state.winner === 2 ? "AI 赢了" : "平局", 10, 21);
			else ctx.fillText(state.turn === 1 ? "你的回合 ●" : "AI 思考中 ○", 10, 21);
			ctx.fillStyle = BG$4;
			ctx.fillRect(0, 32, BOARD_W$3, BOARD_H$3);
			ctx.strokeStyle = LINE$1;
			ctx.lineWidth = 1;
			for (let i = 0; i < 15; i += 1) {
				const x = i * 24 + 12;
				const y = 32 + i * 24 + 12;
				ctx.beginPath();
				ctx.moveTo(12, 32 + i * 24 + 12);
				ctx.lineTo(348, y);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(i * 24 + 12, 44);
				ctx.lineTo(x, 380);
				ctx.stroke();
			}
			for (let r = 0; r < 15; r += 1) for (let c = 0; c < 15; c += 1) {
				const stone = state.board[r][c];
				if (stone === 0) continue;
				const x = c * 24 + 12;
				const y = 32 + r * 24 + 12;
				ctx.fillStyle = stone === 1 ? BLACK$1 : WHITE$1;
				ctx.beginPath();
				ctx.arc(x, y, 10.08, 0, Math.PI * 2);
				ctx.fill();
				if (stone === 2) {
					ctx.strokeStyle = "#b0b0b0";
					ctx.lineWidth = 1;
					ctx.stroke();
				}
			}
			if (state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.55)";
				ctx.fillRect(0, 32, BOARD_W$3, BOARD_H$3);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText(state.winner === 1 ? "你 赢 了 ！" : state.winner === 2 ? "AI 赢 了" : "平 局", BOARD_W$3 / 2, 204);
				ctx.fillStyle = TEXT$8;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText("按 R 重新开始", BOARD_W$3 / 2, 232);
			}
		}
		//#endregion
		//#region src/client/games/gomoku/index.ts
		const AI_DELAY_MS$1 = 500;
		function createGomokuGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$7, LOGICAL_H$7);
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
				const x = (event.clientX - rect.left) * LOGICAL_W$7 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$7 / rect.height;
				const c = Math.round((x - 12) / 24);
				const r = Math.round((y - 32 - 12) / 24);
				if (r < 0 || r >= 15 || c < 0 || c >= 15) return null;
				return {
					r,
					c
				};
			};
			const onMouseDown = (event) => {
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
		const GRAVITY$1 = 1320;
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
					state.vy += GRAVITY$1 * dt;
					state.y += state.vy * dt;
					if (state.y >= 150) state.falling = false;
				}
				return true;
			}
			if (!state.jumping) return false;
			const horizontalSpeed = 130 + state.power * 120;
			state.playerX += horizontalSpeed * dt;
			state.vy += GRAVITY$1 * dt;
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
		const BG$3 = "#1b1b22";
		const PLATFORM = "#5a7ab0";
		const PLATFORM_EDGE = "#3a4a6a";
		const PLAYER = "#e8c84c";
		const PLAYER_LIGHT = "#f6df8a";
		const TEXT$7 = "#d8d8e0";
		/** Draw one frame. */
		function renderHop(ctx, state) {
			ctx.clearRect(0, 0, 360, 300);
			ctx.fillStyle = BG$3;
			ctx.fillRect(0, 0, 360, 300);
			const baseX = state.platforms[state.index].x;
			const toScreenX = (wx) => 40 + (wx - baseX) * .75;
			const platformY = 260;
			for (let i = state.index; i < state.index + 3; i += 1) {
				const p = state.platforms[i];
				const x = toScreenX(p.x);
				const w = p.w * .75;
				const lift = (i - state.index) * 14;
				ctx.fillStyle = PLATFORM;
				ctx.fillRect(x, platformY - lift, w, 16);
				ctx.fillStyle = PLATFORM_EDGE;
				ctx.fillRect(x, platformY - lift + 13, w, 3);
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
			ctx.fillStyle = PLAYER;
			ctx.fillRect(-14, -14, 28, 28);
			ctx.fillStyle = PLAYER_LIGHT;
			ctx.fillRect(-14, -14, 28, 5);
			ctx.fillStyle = "rgba(0,0,0,0.25)";
			ctx.fillRect(-14, 9, 28, 5);
			ctx.restore();
			if (state.jumping || state.over) {} else {
				ctx.fillStyle = "rgba(255,255,255,0.85)";
				ctx.fillRect(20, 20, 120, 10);
				ctx.fillStyle = "#e8c84c";
				ctx.fillRect(20, 20, 120 * state.power, 10);
				ctx.fillStyle = TEXT$7;
				ctx.font = "11px ui-monospace, monospace";
				ctx.textAlign = "left";
				ctx.fillText("按住蓄力，松开起跳", 20, 46);
			}
			ctx.fillStyle = TEXT$7;
			ctx.font = "bold 16px ui-monospace, monospace";
			ctx.textAlign = "right";
			ctx.fillText(`得分 ${state.score}`, 346, 24);
			if (state.over && !state.falling) {
				ctx.fillStyle = "rgba(21,21,27,0.6)";
				ctx.fillRect(0, 0, 360, 300);
				ctx.fillStyle = TEXT$7;
				ctx.font = "bold 22px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("掉 下 去 了", 180, 140);
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, 180, 166);
			}
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
					if (state.over) return;
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
		/** The 5 brick rows, one color per row; the ball takes this palette too. */
		const BRICK_COLORS = [
			"#4c9ae8",
			"#4cd0c9",
			"#5abf6b",
			"#e8c84c",
			"#e88a4c"
		];
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
		const LOGICAL_W$6 = 480;
		const LOGICAL_H$6 = 320;
		const BG$2 = "#15151b";
		const PADDLE = "#5a7ab0";
		const BALL_NEUTRAL = "#f0f0f0";
		const TEXT$6 = "#d8d8e0";
		/** Draw one frame. */
		function renderBreakout(ctx, state) {
			ctx.clearRect(0, 0, LOGICAL_W$6, LOGICAL_H$6);
			ctx.fillStyle = BG$2;
			ctx.fillRect(0, 0, LOGICAL_W$6, LOGICAL_H$6);
			state.bricks.forEach((brick) => {
				ctx.fillStyle = BRICK_COLORS[brick.color % BRICK_COLORS.length];
				ctx.fillRect(brick.x, brick.y, 48, 16);
			});
			ctx.fillStyle = PADDLE;
			ctx.beginPath();
			ctx.roundRect(state.paddleX - 35, 296, 70, 10, 4);
			ctx.fill();
			ctx.fillStyle = state.ball.color >= 0 ? BRICK_COLORS[state.ball.color % BRICK_COLORS.length] : BALL_NEUTRAL;
			ctx.beginPath();
			ctx.arc(state.ball.x, state.ball.y, 6, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = TEXT$6;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`第 ${state.level} 关`, 10, 18);
			ctx.textAlign = "right";
			ctx.fillText(`得分 ${state.score} · 生命 ${"♥".repeat(Math.max(0, state.lives))}`, 470, 18);
			ctx.textAlign = "left";
			ctx.font = "11px ui-monospace, monospace";
			ctx.fillStyle = "rgba(216,216,224,0.55)";
			ctx.fillText("小球会变成所消除方块的颜色 · 同色得分 ×3", 10, 312);
			if (state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.65)";
				ctx.fillRect(0, 0, LOGICAL_W$6, LOGICAL_H$6);
				ctx.fillStyle = TEXT$6;
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("游 戏 结 束", LOGICAL_W$6 / 2, LOGICAL_H$6 / 2 - 10);
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, LOGICAL_W$6 / 2, 178);
			}
		}
		//#endregion
		//#region src/client/games/breakout/index.ts
		function createBreakoutGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$6, LOGICAL_H$6);
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
				const x = (event.clientX - rect.left) * LOGICAL_W$6 / rect.width;
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
		const TEXT$5 = "#d8d8e0";
		/** Draw one frame. */
		function renderWhack(ctx, state) {
			ctx.clearRect(0, 0, 320, 350);
			ctx.fillStyle = GRASS;
			ctx.fillRect(0, 0, 320, 350);
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
			ctx.fillStyle = "#15151b";
			ctx.fillRect(0, 0, 320, 30);
			ctx.fillStyle = TEXT$5;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`⏱ ${Math.max(0, Math.ceil(state.remaining))}s`, 10, 20);
			ctx.textAlign = "right";
			ctx.fillText(`得分 ${state.score}`, 310, 20);
			if (state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.65)";
				ctx.fillRect(0, 30, 320, 320);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 22px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("时 间 到 ！", 160, 182);
				ctx.fillStyle = TEXT$5;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, 160, 208);
			}
		}
		/** A mole peeking out of its hole: body, belly, ears, eyes. */
		function drawMole(ctx, cx, cy) {
			ctx.fillStyle = MOLE;
			ctx.beginPath();
			ctx.ellipse(cx - 14, cy - 16, 7, 9, -.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.ellipse(cx + 14, cy - 16, 7, 9, .5, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = MOLE;
			ctx.beginPath();
			ctx.ellipse(cx, cy - 2, 22, 24, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = MOLE_LIGHT;
			ctx.beginPath();
			ctx.ellipse(cx, cy + 2, 13, 15, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#15151b";
			ctx.beginPath();
			ctx.arc(cx - 8, cy - 8, 3.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.arc(cx + 8, cy - 8, 3.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#d96a6a";
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
				if (state.over) return;
				const hole = holeFromEvent(event);
				if (hole === null) return;
				whack(state, hole);
				reportScore();
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
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
		const DIRS$1 = [
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
		function inBounds(r, c) {
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
			if (!inBounds(r, c) || board[r][c] !== 0) return [];
			const out = [];
			for (const [dr, dc] of DIRS$1) {
				const line = [];
				let nr = r + dr;
				let nc = c + dc;
				while (inBounds(nr, nc) && board[nr][nc] === other(player)) {
					line.push([nr, nc]);
					nr += dr;
					nc += dc;
				}
				if (line.length > 0 && inBounds(nr, nc) && board[nr][nc] === player) out.push(...line);
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
		const BOARD_W$1 = 352;
		const BOARD_H$1 = 352;
		const LOGICAL_W$4 = BOARD_W$1;
		const LOGICAL_H$4 = 382;
		const GREEN_A = "#2e7d4f";
		const GREEN_B = "#2a7449";
		const LINE = "#1e5c38";
		const BLACK = "#1b1b22";
		const BLACK_HI = "#3a3a44";
		const WHITE = "#e8e8ec";
		const WHITE_HI = "#f7f7fa";
		const TEXT$4 = "#d8d8e0";
		/** Draw one frame. */
		function renderOthello(ctx, state) {
			ctx.clearRect(0, 0, LOGICAL_W$4, LOGICAL_H$4);
			for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
				ctx.fillStyle = (r + c) % 2 === 0 ? GREEN_A : GREEN_B;
				ctx.fillRect(c * 44, 30 + r * 44, 44, 44);
			}
			ctx.strokeStyle = LINE;
			ctx.lineWidth = 2;
			ctx.strokeRect(0, 30, BOARD_W$1, BOARD_H$1);
			for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
				const cell = state.board[r][c];
				const x = c * 44 + 22;
				const y = 30 + r * 44 + 22;
				if (cell === 1 || cell === 2) {
					const isBlack = cell === 1;
					ctx.fillStyle = isBlack ? BLACK : WHITE;
					ctx.beginPath();
					ctx.arc(x, y, 17.6, 0, Math.PI * 2);
					ctx.fill();
					ctx.fillStyle = isBlack ? BLACK_HI : WHITE_HI;
					ctx.beginPath();
					ctx.arc(x - 3, y - 3, 44 * .24, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			if (!state.over && state.turn === 1) {
				ctx.fillStyle = "rgba(255,255,255,0.28)";
				for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if (state.board[r][c] === 0 && canFlipFrom(state, r, c)) {
					ctx.beginPath();
					ctx.arc(c * 44 + 22, 30 + r * 44 + 22, 5, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			ctx.fillStyle = "#15151b";
			ctx.fillRect(0, 0, LOGICAL_W$4, 30);
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillStyle = "#d8d8e0";
			ctx.fillText(`○ ${countDiscs(state, 1)}`, 12, 20);
			ctx.fillStyle = "#e8e8ec";
			ctx.fillText(`● ${countDiscs(state, 2)}`, 52, 20);
			if (!state.over) {
				ctx.fillStyle = TEXT$4;
				ctx.textAlign = "right";
				ctx.fillText(state.turn === 1 ? "你的回合" : "AI 思考中…", 342, 20);
			}
			if (state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.7)";
				ctx.fillRect(0, 30, BOARD_W$1, BOARD_H$1);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				const title = state.winner === 1 ? "你 赢 了 ！" : state.winner === 2 ? "AI 赢 了" : "平 局";
				ctx.fillText(title, BOARD_W$1 / 2, 198);
				ctx.fillStyle = TEXT$4;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`○ ${countDiscs(state, 1)} : ${countDiscs(state, 2)} ● · 按 R 重新开始`, BOARD_W$1 / 2, 226);
			}
		}
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
		//#endregion
		//#region src/client/games/othello/index.ts
		const AI_DELAY_MS = 500;
		function createOthelloGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$4, LOGICAL_H$4);
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
				const x = (event.clientX - rect.left) * LOGICAL_W$4 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$4 / rect.height;
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
		const LOGICAL_W$3 = 300;
		const LOGICAL_H$3 = 480;
		const SKY_TOP$1 = "#3a8fd4";
		const SKY_BOTTOM$1 = "#a8d8f0";
		const PIPE = "#4c9e4f";
		const PIPE_EDGE = "#3a7a3d";
		const BIRD = "#f2c94c";
		const BIRD_BELLY = "#f6e3a0";
		const TEXT$3 = "#ffffff";
		/** Draw one frame. */
		function renderFlappy(ctx, state, wingT) {
			ctx.clearRect(0, 0, LOGICAL_W$3, LOGICAL_H$3);
			const sky = ctx.createLinearGradient(0, 30, 0, LOGICAL_H$3);
			sky.addColorStop(0, SKY_TOP$1);
			sky.addColorStop(1, SKY_BOTTOM$1);
			ctx.fillStyle = sky;
			ctx.fillRect(0, 30, 300, 450);
			for (const pipe of state.pipes) {
				drawPipe(ctx, pipe.x, 0, pipe.gapY - 75);
				drawPipe(ctx, pipe.x, pipe.gapY + 75, 450 - (pipe.gapY + 75));
			}
			const wobble = Math.sin(wingT * 18) * .35;
			ctx.save();
			ctx.translate(90, 30 + state.y);
			ctx.rotate(Math.max(-.5, Math.min(.9, state.vy / 620)));
			ctx.fillStyle = BIRD;
			ctx.beginPath();
			ctx.ellipse(0, 0, 15, 13, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = BIRD_BELLY;
			ctx.beginPath();
			ctx.ellipse(-3, 4, 8, 6, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#d9a93c";
			ctx.beginPath();
			ctx.ellipse(-2, -2, 7, 5, wobble, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#15151b";
			ctx.beginPath();
			ctx.arc(6, -5, 3.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#e45756";
			ctx.beginPath();
			ctx.moveTo(12, -1);
			ctx.lineTo(22, 1);
			ctx.lineTo(12, 5);
			ctx.closePath();
			ctx.fill();
			ctx.restore();
			ctx.fillStyle = "rgba(21,21,27,0.55)";
			ctx.fillRect(0, 0, LOGICAL_W$3, 30);
			ctx.fillStyle = TEXT$3;
			ctx.font = "bold 15px ui-monospace, monospace";
			ctx.textAlign = "center";
			ctx.fillText(`得分 ${state.score}`, 150, 21);
			if (state.over) {
				ctx.fillStyle = "rgba(21,21,27,0.6)";
				ctx.fillRect(0, 30, 300, 450);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("撞 到 了", 150, 247);
				ctx.fillStyle = TEXT$3;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, 150, 275);
			}
		}
		function drawPipe(ctx, x, y, h) {
			if (h <= 0) return;
			ctx.fillStyle = PIPE;
			ctx.fillRect(x, 30 + y, 52, h);
			ctx.fillStyle = PIPE_EDGE;
			ctx.fillRect(x - 3, 30 + y, 58, 6);
			ctx.fillRect(x - 3, 30 + y + h - 6, 58, 6);
		}
		//#endregion
		//#region src/client/games/flappy/index.ts
		function createFlappyGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$3, LOGICAL_H$3);
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
		function emptyGrid() {
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
			const grid = emptyGrid();
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
		function tick(state, dt) {
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
		const BOARD_W = 360;
		const BOARD_H = 360;
		const LOGICAL_W$2 = BOARD_W;
		const LOGICAL_H$2 = 390;
		const BG$1 = "#1b1b22";
		const GRID = "#3a3a46";
		const BOX = "#e8c84c";
		const CLUE = "#e8e8ec";
		const ENTRY = "#4c9ae8";
		const CONFLICT = "#e45756";
		const CURSOR = "rgba(255,255,255,0.16)";
		const TEXT$2 = "#d8d8e0";
		/** Draw one frame; cursor is the selected cell or null. */
		function renderSudoku(ctx, state, difficulty, cursor) {
			ctx.clearRect(0, 0, LOGICAL_W$2, LOGICAL_H$2);
			ctx.fillStyle = BG$1;
			ctx.fillRect(0, 30, BOARD_W, BOARD_H);
			if (cursor !== null && !state.won) {
				ctx.fillStyle = CURSOR;
				ctx.fillRect(cursor.c * 40, 30 + cursor.r * 40, 40, 40);
			}
			for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
				const n = state.grid[r][c];
				if (n === null) continue;
				const isClue = state.puzzle[r][c] !== null;
				const bad = !isClue && conflictsAt(state, r, c);
				ctx.fillStyle = isClue ? CLUE : bad ? CONFLICT : ENTRY;
				ctx.font = "bold 19px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(String(n), c * 40 + 20, 30 + r * 40 + 20);
			}
			ctx.textBaseline = "alphabetic";
			ctx.strokeStyle = GRID;
			ctx.lineWidth = 1;
			for (let i = 0; i <= 9; i += 1) {
				ctx.beginPath();
				ctx.moveTo(i * 40, 30);
				ctx.lineTo(i * 40, LOGICAL_H$2);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, 30 + i * 40);
				ctx.lineTo(BOARD_W, 30 + i * 40);
				ctx.stroke();
			}
			ctx.strokeStyle = BOX;
			ctx.lineWidth = 2.5;
			for (let i = 0; i <= 9; i += 3) {
				ctx.beginPath();
				ctx.moveTo(i * 40, 30);
				ctx.lineTo(i * 40, LOGICAL_H$2);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(0, 30 + i * 40);
				ctx.lineTo(BOARD_W, 30 + i * 40);
				ctx.stroke();
			}
			ctx.fillStyle = "#15151b";
			ctx.fillRect(0, 0, LOGICAL_W$2, 30);
			ctx.fillStyle = TEXT$2;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			const label = difficulty === "easy" ? "简单" : difficulty === "normal" ? "普通" : "困难";
			ctx.fillText(`${label} · D 切换`, 10, 20);
			ctx.textAlign = "right";
			const s = Math.floor(state.elapsed);
			ctx.fillText(`⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, 350, 20);
			if (state.won) {
				ctx.fillStyle = "rgba(21,21,27,0.7)";
				ctx.fillRect(0, 30, BOARD_W, BOARD_H);
				ctx.fillStyle = "#ffe08a";
				ctx.font = "bold 24px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("解 决 ！", BOARD_W / 2, 202);
				ctx.fillStyle = TEXT$2;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`用时 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · 按 R 开新题`, BOARD_W / 2, 230);
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$2, LOGICAL_H$2);
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
				const x = (event.clientX - rect.left) * LOGICAL_W$2 / rect.width;
				const y = (event.clientY - rect.top) * LOGICAL_H$2 / rect.height;
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
				if (state.won) return;
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
				tick(state, dt);
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
		const DIRS = [
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
				const [idx, idy] = DIRS[state.intent];
				const gr = Math.floor(state.py / 20);
				const gc = Math.floor(state.px / 20);
				if (!isWall(state, gr + idy, gc + idx)) state.dir = state.intent;
			}
			const [dx, dy] = DIRS[state.dir];
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
				const [dx, dy] = DIRS[d];
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
				const [dx, dy] = DIRS[ghost.dir];
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
		const LOGICAL_W$1 = 380;
		const LOGICAL_H$1 = 330;
		const BG = "#101018";
		const WALL = "#2440c8";
		const WALL_EDGE = "#3a5ae0";
		const DOT = "#ffd9a0";
		const TEXT$1 = "#d8d8e0";
		const PAC = "#ffd83d";
		const GHOST_COLORS = ["#e45756", "#e88ac8"];
		/** Draw one frame; `t` is a running seconds counter for flicker effects. */
		function renderPacman(ctx, state, t) {
			ctx.clearRect(0, 0, LOGICAL_W$1, LOGICAL_H$1);
			ctx.fillStyle = BG;
			ctx.fillRect(0, 0, LOGICAL_W$1, LOGICAL_H$1);
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
					ctx.fillStyle = "#ffd9a0";
					ctx.beginPath();
					ctx.arc(x + 10, y + 10, pulse, 0, Math.PI * 2);
					ctx.fill();
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
				ctx.fillStyle = frightened ? flicker ? "#ffffff" : "#4c9ae8" : GHOST_COLORS[i % GHOST_COLORS.length];
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
				if (!frightened) {
					const [ex, ey] = DIR_OFFSET[ghost.dir];
					ctx.fillStyle = "#ffffff";
					ctx.beginPath();
					ctx.arc(ghost.x - 4, gy - 2, 3.5, 0, Math.PI * 2);
					ctx.arc(ghost.x + 4, gy - 2, 3.5, 0, Math.PI * 2);
					ctx.fill();
					ctx.fillStyle = "#15151b";
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
			ctx.fillStyle = PAC;
			ctx.beginPath();
			ctx.moveTo(state.px, 30 + state.py);
			ctx.arc(state.px, 30 + state.py, 8.8, a1, a0);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = "#15151b";
			ctx.fillRect(0, 0, LOGICAL_W$1, 30);
			ctx.fillStyle = TEXT$1;
			ctx.font = "13px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`得分 ${state.score}`, 10, 20);
			ctx.textAlign = "right";
			ctx.fillText(`生命 ${"♥".repeat(Math.max(0, state.lives))}`, 370, 20);
			if (state.over) overlay$1(ctx, "游 戏 结 束", `得分 ${state.score} · 按 R 重新开始`);
			else if (state.won) overlay$1(ctx, "过 关 啦 ！", `得分 ${state.score} · 按 R 重新开始`);
		}
		function overlay$1(ctx, title, sub) {
			ctx.fillStyle = "rgba(16,16,24,0.7)";
			ctx.fillRect(0, 30, LOGICAL_W$1, 300);
			ctx.fillStyle = "#ffe08a";
			ctx.font = "bold 24px ui-monospace, monospace";
			ctx.textAlign = "center";
			ctx.fillText(title, LOGICAL_W$1 / 2, 172);
			ctx.fillStyle = TEXT$1;
			ctx.font = "13px ui-monospace, monospace";
			ctx.fillText(sub, LOGICAL_W$1 / 2, 200);
		}
		//#endregion
		//#region src/client/games/pacman/index.ts
		const KEY_DIR = {
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
			const fit = fitCanvas(host, canvas, LOGICAL_W$1, LOGICAL_H$1);
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
				const dir = KEY_DIR[event.code];
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
		const SKY_TOP = "#0d1220";
		const SKY_BOTTOM = "#1c2b45";
		const GROUND = "#151a12";
		const GROUND_GRID = "rgba(255,255,255,0.07)";
		const TARGET = "#e45756";
		const TARGET_EDGE = "#ff9a98";
		const CROSSHAIR = "#7ef0a0";
		const LOCKED = "#ffd83d";
		const TEXT = "#d8d8e0";
		const FOCAL = 240;
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
			const horizon = 150 + Math.tan(effectivePitch(state)) * FOCAL * .6;
			const sky = ctx.createLinearGradient(0, 0, 0, horizon);
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
					ctx.fillStyle = TARGET;
					ctx.beginPath();
					ctx.arc(sx, sy, size * pulse, 0, Math.PI * 2);
					ctx.fill();
					ctx.strokeStyle = TARGET_EDGE;
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.arc(sx, sy, size * pulse, 0, Math.PI * 2);
					ctx.stroke();
					if (locked) {
						ctx.strokeStyle = "rgba(255,216,61,0.6)";
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
				ctx.fillStyle = "rgba(255,216,61,0.22)";
				ctx.beginPath();
				ctx.arc(240, 150, 12, 0, Math.PI * 2);
				ctx.fill();
			}
			if (phase === "playing") {
				const pos = bulletPosition(state);
				if (pos !== null) {
					const p = project(state, pos.x, pos.y, pos.h);
					if (p !== null) {
						ctx.strokeStyle = "rgba(255,216,61,0.85)";
						ctx.lineWidth = 2;
						ctx.beginPath();
						ctx.moveTo(390, 310);
						ctx.lineTo(p.x, p.y);
						ctx.stroke();
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
						ctx.strokeStyle = "rgba(255,216,61,0.9)";
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
			if (phase !== "ready") {
				ctx.fillStyle = TEXT;
				ctx.font = "13px ui-monospace, monospace";
				ctx.textAlign = "left";
				ctx.fillText(`⏱ ${Math.max(0, Math.ceil(state.remaining))}s`, 10, 18);
				ctx.textAlign = "right";
				ctx.fillText(`得分 ${Math.floor(state.score)} · 命中率 ${shotRatePct(state).toFixed(0)}%`, 470, 18);
				ctx.textAlign = "left";
				ctx.font = "11px ui-monospace, monospace";
				ctx.fillStyle = "rgba(216,216,224,0.5)";
				ctx.fillText("左键 射击 · P 暂停 · Esc 释放鼠标 · R 重开", 10, 294);
			}
			if (phase === "ready") overlay(ctx, "点 击 进 入 跟 枪", "点击锁定鼠标（光标隐藏），移动鼠标转动视角\n准星固定在屏幕中央 · 左键射击 · P 暂停");
			else if (phase === "paused") overlay(ctx, "已 暂 停", "按 P 或点击继续 · R 重开");
			else if (phase === "over") overlay(ctx, "时 间 到 ！", `得分 ${Math.floor(state.score)} · 命中率 ${shotRatePct(state).toFixed(0)}%\n点击重新开始 · R 重开`);
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
				ctx.fillStyle = "rgba(255,216,61,0.95)";
				ctx.beginPath();
				ctx.moveTo(0, -11);
				ctx.lineTo(7, 0);
				ctx.lineTo(0, 11);
				ctx.lineTo(-7, 0);
				ctx.closePath();
				ctx.fill();
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
		function overlay(ctx, title, body) {
			ctx.fillStyle = "rgba(10,12,18,0.78)";
			ctx.fillRect(0, 0, 480, 300);
			ctx.fillStyle = "#ffe08a";
			ctx.font = "bold 22px ui-monospace, monospace";
			ctx.textAlign = "center";
			ctx.fillText(title, 240, 120);
			ctx.fillStyle = TEXT;
			ctx.font = "12px ui-monospace, monospace";
			body.split("\n").forEach((line, i) => {
				ctx.fillText(line, 240, 150 + i * 18 + 6);
			});
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
				aimTrackGame
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
		const PLUGIN_VERSION = "0.3.9";
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
				const latest = (await res.json()).latest;
				return typeof latest === "string" && /^v\d+\.\d+\.\d+$/.test(latest) ? latest : void 0;
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
		async function fetchLatestTag() {
			const [host, tags, raw] = await Promise.all([
				latestFromHost(),
				latestFromTags(),
				latestFromRaw()
			]);
			return host ?? tags ?? raw;
		}
		function updatePrompt(tag) {
			return [
				`帮我更新 ${UPDATE_ID} 插件到 ${tag}，步骤：`,
				`1. 执行 dsh plugin --profile web add '${PACKAGE_SPEC}@github:${MIRROR}#${tag}'（首次可能被 pnpm 11 拦截构建脚本，则先在 ~/.dsh/profiles/web 执行 pnpm approve-builds --all）`,
				"2. 完成后提醒我硬刷新浏览器（Ctrl/Cmd+Shift+R）"
			].join("\n");
		}
		async function runUpdate(tag) {
			try {
				const res = await fetch(`/${UPDATE_ID}/update`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ tag }),
					signal: AbortSignal.timeout(13e4)
				});
				const parsed = await res.json().catch(() => ({}));
				return {
					ok: res.ok && parsed.ok === true,
					detail: typeof parsed.output === "string" ? parsed.output : parsed.error ?? String(res.status),
					link: parsed.link === true
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
			fetchLatestTag().then((tag) => {
				if (tag === void 0) {
					renderOfflineChip();
					return;
				}
				if (compareSemver(tag, PLUGIN_VERSION) <= 0) return;
				renderChip(tag);
			});
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
		function renderChip(tag) {
			if (document.querySelector(`[data-update-chip="dsh-minigames"]`) !== null) return;
			const el = document.createElement("div");
			el.setAttribute("data-update-chip", UPDATE_ID);
			el.setAttribute("role", "button");
			el.setAttribute("title", `更新到 ${tag}`);
			el.style.cssText = "position:fixed;left:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #4a7dff;border-radius:10px;background:#1e2430;color:#cfe0ff;font:12px/1.4 system-ui,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);";
			const label = document.createElement("span");
			label.style.cssText = "pointer-events:none;";
			label.textContent = `⟳ ${LABEL} 新版本 ${tag} 可用，点击更新`;
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
						label.textContent = `已更新到 ${tag}，请硬刷新（Ctrl/Cmd+Shift+R）`;
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
					el.setAttribute("title", result.detail);
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
				fetchLatestTag().then((tag) => {
					retrying = false;
					if (tag === void 0) {
						label.textContent = `⚠ ${LABEL} 仍无法查询新版本`;
						return;
					}
					el.remove();
					relayout();
					if (compareSemver(tag, PLUGIN_VERSION) > 0) renderChip(tag);
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