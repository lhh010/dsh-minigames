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
		const GRAVITY = 2100;
		const JUMP_V = -640;
		const BASE_SPEED = 320;
		const MAX_SPEED = 760;
		/** Speed gain per score point (speed = BASE + score * this, capped at MAX). */
		const SPEED_PER_SCORE = .15;
		const SPAWN_MIN = 1.1;
		const SPAWN_MAX = 2.4;
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
				dino.vy += GRAVITY * dt;
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
				const min = Math.max(SPAWN_FLOOR, SPAWN_MIN - shrink);
				const max = Math.max(min + .3, SPAWN_MAX - shrink);
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
			dino: "#4a4a55",
			dinoShade: "#8a8a96",
			cactus: "#5aa864",
			cactusDark: "#3d7a46",
			bird: "#8f8f9c",
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
			} else {
				ctx.fillStyle = p.bird;
				ctx.fillRect(obstacle.x, obstacle.y + 8, obstacle.w, obstacle.h - 8);
				ctx.fillRect(obstacle.x + 6, obstacle.y + 6, 20, 8);
				const flap = Math.sin(t * 22) > 0 ? -7 : 3;
				ctx.fillRect(obstacle.x + 10, obstacle.y + 4 + flap, 18, 9);
				ctx.fillStyle = p.beak;
				ctx.fillRect(obstacle.x + obstacle.w - 8, obstacle.y + 12, 8, 5);
				ctx.fillStyle = p.eye === "#ffffff" ? "#202028" : "#ffffff";
				ctx.fillRect(obstacle.x + obstacle.w - 14, obstacle.y + 11, 4, 4);
			}
		}
		/** One cactus trunk: two-tone body, arms, outline. */
		function drawCactus(ctx, x, y, w, h, p) {
			ctx.fillStyle = p.cactus;
			ctx.fillRect(x, y, w, h);
			ctx.fillStyle = p.cactusDark;
			ctx.fillRect(x + w - 5, y, 5, h);
			const arm = Math.max(5, w * .34);
			const leftY = y + h * .22;
			const rightY = y + h * .45;
			ctx.fillStyle = p.cactus;
			ctx.fillRect(x - arm, leftY, arm, 3);
			ctx.fillRect(x - 3, leftY - 5, 3, 5);
			ctx.fillRect(x + w, rightY, arm, 3);
			ctx.fillRect(x + w, rightY - 5, 3, 5);
			ctx.strokeStyle = p.cactusDark;
			ctx.lineWidth = 1;
			ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
		}
		function drawDino(ctx, state, p) {
			const dino = state.dino;
			const x = dino.x;
			if (dino.ducking) {
				ctx.fillStyle = p.dino;
				ctx.fillRect(x + 2, 147, 40, 16);
				ctx.fillRect(x + 36, 141, 10, 9);
				ctx.fillStyle = p.eye;
				ctx.fillRect(x + 43, 144, 2, 2);
				ctx.fillStyle = p.dinoShade;
				ctx.fillRect(x + 6, 162, 8, 3);
				ctx.fillRect(x + 18, 162, 8, 3);
				ctx.fillRect(x + 30, 162, 8, 3);
				return;
			}
			const y = dino.y;
			const phase = dino.onGround ? Math.floor(state.t * 13) % 2 : 0;
			ctx.fillStyle = p.dino;
			ctx.fillRect(x + 2, y + 16, 5, 14);
			ctx.fillRect(x + 6, y + 16, 22, 30);
			ctx.fillRect(x + 22, y + 8, 20, 24);
			ctx.fillRect(x + 36, y + 18, 10, 9);
			ctx.fillRect(x + 12, y + 34, 6, 10);
			ctx.fillStyle = p.eye;
			ctx.fillRect(x + 33, y + 13, 5, 5);
			ctx.fillStyle = p.eye === "#ffffff" ? "#202028" : "#ffffff";
			ctx.fillRect(x + 35, y + 14, 2, 3);
			ctx.fillStyle = p.dinoShade;
			ctx.fillRect(x + 8, y + 42, 8, phase === 0 ? 8 : 5);
			ctx.fillRect(x + 21, y + 42, 8, phase === 0 ? 5 : 8);
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
		function fitCanvas(host, canvas, logicalW, logicalH, maxWidth = 640) {
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
				next: null,
				hold: null,
				canHold: true,
				score: 0,
				lines: 0,
				level: 1,
				over: false,
				rng
			};
			state.next = randomPiece(rng);
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
			state.current = state.next;
			center(state.current);
			state.canHold = true;
			state.next = randomPiece(state.rng);
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
				state.next = randomPiece(state.rng);
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
		//#endregion
		//#region src/client/games/tetris/render.ts
		/**
		* Tetris canvas renderer: the 10x20 board, the current piece with its ghost,
		* and the next/hold previews on the right. Palette tuned for the DSH dark
		* shell.
		*/
		const CELL$1 = 22;
		const BOARD_W$1 = 220;
		const BOARD_H$1 = 440;
		/** Full logical canvas width: the board plus the preview column. */
		const LOGICAL_W$1 = 332;
		const PREVIEW_X = 236;
		const PREVIEW_W = 88;
		const PREVIEW_H = 88;
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
		const GRID_LINE$1 = "#26262e";
		const BOARD_BG$1 = "#15151b";
		const BOARD_BORDER = "#3a3a45";
		const TEXT$2 = "#d8d8e0";
		function drawCell(ctx, x, y, color, alpha = 1) {
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.fillRect(x + 1, y + 1, 20, 20);
			ctx.fillStyle = "rgba(255,255,255,0.25)";
			ctx.fillRect(x + 2, y + 2, 18, 2);
			ctx.fillStyle = "rgba(0,0,0,0.25)";
			ctx.fillRect(x + 2, y + CELL$1 - 4, 18, 2);
			ctx.globalAlpha = 1;
		}
		function drawShape(ctx, shape, px, py, kind, alpha = 1) {
			for (let r = 0; r < shape.length; r += 1) for (let c = 0; c < shape[r].length; c += 1) {
				if (shape[r][c] === 0) continue;
				drawCell(ctx, px + c * CELL$1, py + r * CELL$1, COLORS[kind], alpha);
			}
		}
		function drawPreview(ctx, label, piece, y) {
			ctx.fillStyle = TEXT$2;
			ctx.font = "11px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(label, PREVIEW_X, y);
			ctx.fillStyle = BOARD_BG$1;
			ctx.fillRect(PREVIEW_X, y + 6, PREVIEW_W, PREVIEW_H);
			ctx.strokeStyle = GRID_LINE$1;
			ctx.strokeRect(236.5, y + 6.5, PREVIEW_W, PREVIEW_H);
			if (piece === null) return;
			const shape = piece.shape;
			drawShape(ctx, shape, PREVIEW_X + Math.floor((PREVIEW_W - shape[0].length * CELL$1) / 2), y + 6 + Math.floor((PREVIEW_H - shape.length * CELL$1) / 2), piece.kind);
		}
		/** Draw one frame of the game. */
		function renderTetris(ctx, state) {
			const width = LOGICAL_W$1;
			ctx.clearRect(0, 0, width, 448);
			ctx.fillStyle = BOARD_BG$1;
			ctx.fillRect(0, 0, BOARD_W$1, BOARD_H$1);
			ctx.strokeStyle = BOARD_BORDER;
			ctx.lineWidth = 2;
			ctx.strokeRect(1, 1, 218, 438);
			ctx.strokeStyle = GRID_LINE$1;
			ctx.lineWidth = 1;
			for (let c = 1; c < 10; c += 1) {
				ctx.beginPath();
				ctx.moveTo(c * CELL$1 + .5, 0);
				ctx.lineTo(c * CELL$1 + .5, BOARD_H$1);
				ctx.stroke();
			}
			for (let r = 1; r < 20; r += 1) {
				ctx.beginPath();
				ctx.moveTo(0, r * CELL$1 + .5);
				ctx.lineTo(BOARD_W$1, r * CELL$1 + .5);
				ctx.stroke();
			}
			for (let r = 0; r < 20; r += 1) for (let c = 0; c < 10; c += 1) {
				const kind = state.grid[r][c];
				if (kind !== 0) drawCell(ctx, c * CELL$1, r * CELL$1, COLORS[kind]);
			}
			if (state.current !== null) {
				const piece = state.current;
				const gy = ghostY(state);
				if (gy !== piece.y) drawShape(ctx, piece.shape, piece.x * CELL$1, gy * CELL$1, piece.kind, .25);
				drawShape(ctx, piece.shape, piece.x * CELL$1, piece.y * CELL$1, piece.kind);
			}
			drawPreview(ctx, "下一个", state.next, 6);
			drawPreview(ctx, "暂存 C", state.hold, 112);
			if (state.over) {
				ctx.fillStyle = TEXT$2;
				ctx.font = "bold 18px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("GAME OVER", BOARD_W$1 / 2, BOARD_H$1 / 2 - 8);
				ctx.font = "12px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · R 重新开始`, BOARD_W$1 / 2, 238);
			}
		}
		//#endregion
		//#region src/client/games/tetris/index.ts
		function createTetrisGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const fit = fitCanvas(host, canvas, LOGICAL_W$1, 448);
			if (fit === null) throw new Error("dsh-minigames: tetris needs a 2d canvas context");
			const ctx = fit.ctx;
			let state = createTetrisState();
			let running = false;
			let raf = 0;
			let last = 0;
			let gravityAcc = 0;
			let lastScore = -1;
			const reportScore = () => {
				if (state.score === lastScore) return;
				lastScore = state.score;
				options?.onScore?.(state.score);
			};
			const onKeyDown = (event) => {
				if (!gameHasFocus(host)) return;
				switch (event.code) {
					case "ArrowLeft":
					case "KeyA":
						event.preventDefault();
						move(state, -1, 0);
						break;
					case "ArrowRight":
					case "KeyD":
						event.preventDefault();
						move(state, 1, 0);
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
						reportScore();
						break;
					case "ArrowUp":
					case "KeyX":
					case "KeyW":
						event.preventDefault();
						rotate(state, 1);
						break;
					case "KeyZ":
						event.preventDefault();
						rotate(state, -1);
						break;
					case "KeyC":
						event.preventDefault();
						holdPiece(state);
						gravityAcc = 0;
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
		const PLAYER = "#6aa7ff";
		const PLAYER_DARK = "#3f6ec0";
		const ENEMY = "#ff7a6a";
		const ENEMY_DARK = "#c04a3c";
		const TREAD = "#3a3a44";
		const BULLET_CORE = "#ffffff";
		const BULLET_PLAYER = "#ffe08a";
		const BULLET_ENEMY = "#ff9d6b";
		const TEXT$1 = "#d8d8e0";
		const TANK_W = 480;
		const TANK_H = 416;
		function drawTile(ctx, tx, ty, tile) {
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
			const body = isPlayer ? PLAYER : ENEMY;
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
				if (tile !== 0) drawTile(ctx, tx, ty, tile);
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
			ctx.fillStyle = TEXT$1;
			ctx.font = "12px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`第 ${state.wave}/3 波`, 8, 16);
			ctx.fillText(`剩余敌人 ${state.enemies.length + state.spawnQueue}`, 8, 32);
			ctx.fillText(`生命 ${"♥".repeat(Math.max(0, state.player.hp))}`, 8, 48);
			if (state.result !== "none") {
				ctx.fillStyle = TEXT$1;
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
		function shuffle(state) {
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
			shuffle(state);
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
			shuffle(state);
		}
		/** Restart the whole run from level 1. */
		function restart(state) {
			state.level = 1;
			state.target = levelTarget(1);
			state.score = 0;
			state.result = "none";
			shuffle(state);
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
		const GRID_LINE = "rgba(255,255,255,0.05)";
		const CURSOR = "#ffe08a";
		const TEXT = "#d8d8e0";
		const MUTED = "#7a7a8a";
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
			ctx.fillStyle = TEXT;
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
			ctx.fillStyle = MUTED;
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
				ctx.strokeStyle = CURSOR;
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
				ctx.fillStyle = TEXT;
				ctx.font = "13px ui-monospace, monospace";
				ctx.fillText(`第 ${state.level} 关完成 · 目标 ${state.target}`, 176, 238);
			} else if (view.result === "lose") {
				ctx.fillStyle = "rgba(21,21,27,0.6)";
				ctx.fillRect(0, 40, 352, 352);
				ctx.fillStyle = "#e45756";
				ctx.font = "bold 26px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("游 戏 结 束", 176, 204);
				ctx.fillStyle = TEXT;
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
				match3Game
			]) if (getGame(game.id) === void 0) registerGame(game);
		}
		//#endregion
		//#region src/client/panel/Panel.tsx
		/**
		* The right-side game panel: a fixed rail when collapsed, a right-half panel
		* when expanded (default width 50vw, drag-resizable), a game picker, and a
		* game area that mounts the selected game with full lifecycle management
		* (pause on collapse / tab hidden / user pause, destroy on switch).
		*/
		registerBuiltinGames();
		const LS_OPEN = "dsh-minigames:open";
		const LS_GAME = "dsh-minigames:game";
		const LS_WIDTH = "dsh-minigames:width";
		const LS_BEST_PREFIX = "dsh-minigames:best:";
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
		/** Whether a pointer event's target is inside the panel (drag handle hit-test). */
		function clampPanelWidth(px, viewport) {
			return Math.min(Math.max(px, 360), Math.max(360, viewport * .8));
		}
		function MiniGamePanel() {
			const [open, setOpen] = (0, react.useState)(() => loadBool(LS_OPEN, false));
			const [gameId, setGameId] = (0, react.useState)(() => loadStr(LS_GAME, null));
			const [width, setWidth] = (0, react.useState)(() => {
				const saved = loadStr(LS_WIDTH, null);
				return saved === null ? Math.round(window.innerWidth / 2) : clampPanelWidth(Number(saved) || Math.round(window.innerWidth / 2), window.innerWidth);
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
			(0, react.useEffect)(() => {
				if (!open) return void 0;
				const panel = panelRef.current;
				if (panel === null) return void 0;
				const onMove = (event) => {
					const next = clampPanelWidth(window.innerWidth - event.clientX, window.innerWidth);
					setWidth(next);
					save(LS_WIDTH, String(next));
				};
				const onUp = () => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
				};
				const handle = panel.querySelector("[data-dmg-resize]");
				if (handle === null) return void 0;
				const onDown = (event) => {
					event.preventDefault();
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
			if (!open) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dmg-rail",
				role: "button",
				"aria-label": "打开小游戏",
				title: "小游戏",
				onClick: () => toggleOpen(true),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dmg-rail-icon",
					children: "🎮"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dmg-rail-text",
					children: "小游戏"
				})]
			});
			const games = getGames();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: panelRef,
				className: "dmg-panel",
				style: { width: `${width}px` },
				"data-open": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						"data-dmg-resize": true,
						className: "dmg-resize",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dmg-header",
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
								children: [activeGame !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dmg-icon-btn",
									onClick: () => setGameId(null),
									children: "选游戏"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dmg-icon-btn",
									onClick: () => toggleOpen(false),
									children: "收起 ▶"
								})]
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
		* start on mount, pause whenever the panel is collapsed or the tab is hidden
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
		const css = "/* dsh-minigames panel styles. All classes are dmg- prefixed to stay\n * collision-free in the host page; the stylesheet is injected by the client\n * bundle as one <style data-plugin> tag. Palette matches the DSH dark shell. */\n\n.dmg-rail {\n  position: fixed;\n  right: 0;\n  top: 50%;\n  transform: translateY(-50%);\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 4px;\n  width: 36px;\n  padding: 10px 0;\n  background: #1b1b22;\n  border: 1px solid #3a3a45;\n  border-right: none;\n  border-radius: 10px 0 0 10px;\n  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.35);\n  color: #d8d8e0;\n  cursor: pointer;\n  user-select: none;\n}\n\n.dmg-rail:hover {\n  background: #23232c;\n}\n\n.dmg-rail-icon {\n  font-size: 18px;\n  line-height: 1;\n}\n\n.dmg-rail-text {\n  writing-mode: vertical-rl;\n  font-size: 11px;\n  letter-spacing: 2px;\n  color: #9a9aa5;\n}\n\n.dmg-panel {\n  position: fixed;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  min-width: 360px;\n  background: #15151b;\n  color: #d8d8e0;\n  border-left: 1px solid #3a3a45;\n  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);\n  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;\n}\n\n.dmg-resize {\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  width: 5px;\n  cursor: ew-resize;\n  z-index: 1;\n}\n\n.dmg-header {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 12px;\n  background: #1b1b22;\n  border-bottom: 1px solid #26262e;\n  flex: 0 0 auto;\n}\n\n.dmg-title {\n  font-weight: 600;\n  font-size: 14px;\n  white-space: nowrap;\n}\n\n.dmg-score {\n  margin-left: auto;\n  font-size: 12px;\n  color: #9a9aa5;\n  white-space: nowrap;\n}\n\n.dmg-header-actions {\n  display: flex;\n  gap: 6px;\n  flex: 0 0 auto;\n}\n\n.dmg-icon-btn {\n  background: none;\n  border: 1px solid #3a3a45;\n  color: #d8d8e0;\n  border-radius: 6px;\n  padding: 3px 10px;\n  cursor: pointer;\n  font-size: 12px;\n  font-family: inherit;\n}\n\n.dmg-icon-btn:hover {\n  background: #23232c;\n}\n\n.dmg-body {\n  flex: 1;\n  overflow: auto;\n  padding: 12px;\n  min-height: 0;\n}\n\n.dmg-picker {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));\n  gap: 10px;\n}\n\n.dmg-card {\n  background: #1b1b22;\n  border: 1px solid #3a3a45;\n  border-radius: 10px;\n  padding: 14px 10px;\n  cursor: pointer;\n  text-align: center;\n  color: inherit;\n  font-family: inherit;\n}\n\n.dmg-card:hover {\n  border-color: #5a5a6a;\n  background: #23232c;\n}\n\n.dmg-card-icon {\n  font-size: 30px;\n  line-height: 1;\n}\n\n.dmg-card-title {\n  font-weight: 600;\n  margin: 8px 0 4px;\n  font-size: 13px;\n}\n\n.dmg-card-desc {\n  font-size: 11px;\n  color: #9a9aa5;\n  line-height: 1.45;\n  min-height: 48px;\n}\n\n.dmg-card-best {\n  margin-top: 8px;\n  font-size: 11px;\n  color: #7a7a8a;\n}\n\n.dmg-game-area {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  min-height: 0;\n}\n\n.dmg-game-toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  flex: 0 0 auto;\n}\n\n.dmg-game-name {\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.dmg-game-toolbar .dmg-icon-btn {\n  margin-left: auto;\n}\n\n.dmg-game-host {\n  flex: 1;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 100%;\n  min-height: 0;\n  outline: none;\n}\n\n.dmg-game-canvas {\n  width: 100%;\n  max-width: 640px;\n  height: auto;\n  background: #15151b;\n  border-radius: 6px;\n  border: 1px solid #26262e;\n}\n\n.dmg-game-controls {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  justify-content: center;\n  flex: 0 0 auto;\n  max-width: 100%;\n}\n\n.dmg-control-tag {\n  font-size: 11px;\n  color: #9a9aa5;\n  background: #1b1b22;\n  border: 1px solid #2e2e38;\n  border-radius: 4px;\n  padding: 2px 8px;\n  white-space: nowrap;\n}\n\n.dmg-control-muted {\n  color: #7a7a8a;\n  border-style: dashed;\n}\n";
		const tagId = "@dsh-external/dsh-minigames/app.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-external/dsh-minigames";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
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
		/** No host services are required. */
		const inject = [];
		/** Bundle identity (informational; the module loader keys on the package name). */
		const name = "dsh-minigames-client";
		/**
		* Mount the panel portal for the lifetime of the plugin fiber. The effect
		* returns the disposer cordis runs on teardown (HMR, plugin unload).
		* @param ctx - the browser-side cordis context.
		*/
		function apply(ctx) {
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