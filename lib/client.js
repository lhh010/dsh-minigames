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
		const GRAVITY = 2400;
		const JUMP_V = -720;
		const BASE_SPEED = 320;
		const MAX_SPEED = 760;
		const SPEED_ACCEL = 6;
		const SPAWN_MIN = 1.1;
		/** Forgiving hitbox shrink on both axes, in px. */
		const HITBOX_SHRINK = 4;
		/** A new run at the starting line. */
		function createDinoState(rng = Math.random) {
			return {
				t: 0,
				speed: BASE_SPEED,
				dino: {
					x: 60,
					y: 100,
					vy: 0,
					onGround: true,
					ducking: false
				},
				obstacles: [],
				nextSpawnIn: 1.5,
				score: 0,
				over: false,
				rng
			};
		}
		/** The dino's current collision rect (ducking shrinks the height). */
		function dinoRect(state) {
			const h = state.dino.ducking ? 26 : 50;
			return {
				x: state.dino.x,
				y: 150 - h,
				w: 46,
				h
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
			if (rng() < .75) {
				const w = 22 + rng() * 8;
				const h = 40 + rng() * 12;
				state.obstacles.push({
					kind: "cactus",
					x: 600,
					w,
					h,
					y: 150 - h
				});
			} else {
				const w = 46;
				const h = 30;
				const high = rng() < .5;
				state.obstacles.push({
					kind: "bird",
					x: 600,
					w,
					h,
					y: high ? 32 : 76
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
			state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.t * SPEED_ACCEL);
			const dino = state.dino;
			if (input.jump && dino.onGround) {
				dino.vy = JUMP_V;
				dino.onGround = false;
			}
			if (!dino.onGround) {
				dino.vy += GRAVITY * dt;
				dino.y += dino.vy * dt;
				const floor = 100;
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
				if (obstacle.x + obstacle.w < 0) state.score += 1;
				else remaining.push(obstacle);
			}
			state.obstacles = remaining;
			state.nextSpawnIn -= dt;
			if (state.nextSpawnIn <= 0) {
				spawnObstacle(state);
				state.nextSpawnIn = SPAWN_MIN + state.rng() * 1.2999999999999998;
			}
			const rect = dinoRect(state);
			for (const obstacle of state.obstacles) if (collides$1(rect, obstacle)) {
				state.over = true;
				return;
			}
		}
		//#endregion
		//#region src/client/games/dino/render.ts
		const DINO_BODY = "#e6e6ee";
		const DINO_LEG = "#b9b9c4";
		const CACTUS = "#6fbf73";
		const BIRD = "#b9b9c4";
		const GROUND = "#8a8a96";
		const TEXT$2 = "#d8d8e0";
		/** Draw one frame of the run. */
		function renderDino(ctx, state) {
			ctx.clearRect(0, 0, 600, 170);
			drawGround(ctx, state);
			for (const obstacle of state.obstacles) drawObstacle(ctx, obstacle, state.t);
			drawDino(ctx, state);
			if (state.over) drawGameOver(ctx, state);
		}
		function drawGround(ctx, state) {
			ctx.fillStyle = GROUND;
			ctx.fillRect(0, 150, 600, 2);
			const gap = 34;
			const offset = state.t * state.speed % gap;
			ctx.fillStyle = "#5c5c68";
			for (let x = -offset; x < 600; x += gap) ctx.fillRect(x, 158, 14, 2);
		}
		function drawObstacle(ctx, obstacle, t) {
			if (obstacle.kind === "cactus") {
				ctx.fillStyle = CACTUS;
				ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
				const arm = Math.max(4, obstacle.w * .3);
				ctx.fillRect(obstacle.x - arm, obstacle.y + obstacle.h * .25, arm, 3);
				ctx.fillRect(obstacle.x + obstacle.w, obstacle.y + obstacle.h * .45, arm, 3);
			} else {
				ctx.fillStyle = BIRD;
				ctx.fillRect(obstacle.x, obstacle.y + 8, obstacle.w, obstacle.h - 8);
				const flap = Math.sin(t * 24) > 0 ? -8 : 4;
				ctx.fillRect(obstacle.x + 10, obstacle.y + 4 + flap, 16, 10);
				ctx.fillStyle = "#2c2c34";
				ctx.fillRect(obstacle.x + obstacle.w - 6, obstacle.y + 12, 5, 4);
			}
		}
		function drawDino(ctx, state) {
			const dino = state.dino;
			if (dino.ducking) {
				ctx.fillStyle = DINO_BODY;
				ctx.fillRect(dino.x, 126, 46, 22);
				ctx.fillRect(dino.x + 38, 120, 8, 8);
				ctx.fillStyle = "#2c2c34";
				ctx.fillRect(dino.x + 42, 122, 2, 2);
			} else {
				ctx.fillStyle = DINO_BODY;
				ctx.fillRect(dino.x, dino.y, 30, 44);
				ctx.fillRect(dino.x + 24, dino.y + 4, 20, 26);
				ctx.fillStyle = "#2c2c34";
				ctx.fillRect(dino.x + 38, dino.y + 12, 3, 3);
				const phase = dino.onGround ? Math.floor(state.t * 12) % 2 : 0;
				ctx.fillStyle = DINO_LEG;
				ctx.fillRect(dino.x + 6, 142, 8, phase === 0 ? 8 : 4);
				ctx.fillRect(dino.x + 20, 142, 8, phase === 0 ? 4 : 8);
			}
		}
		function drawGameOver(ctx, state) {
			ctx.fillStyle = TEXT$2;
			ctx.font = "bold 20px ui-monospace, monospace";
			ctx.textAlign = "center";
			ctx.fillText("GAME OVER", 300, 60);
			ctx.font = "12px ui-monospace, monospace";
			ctx.fillText(`得分 ${Math.floor(state.score)} · 按空格或点击重新开始`, 300, 84);
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
			canvas.width = 600;
			canvas.height = 170;
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const ctx = canvas.getContext("2d");
			if (ctx === null) throw new Error("dsh-minigames: dino needs a 2d canvas context");
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
			3: [[
				0,
				1,
				0
			], [
				1,
				1,
				1
			]],
			4: [[
				0,
				1,
				1
			], [
				1,
				1,
				0
			]],
			5: [[
				1,
				1,
				0
			], [
				0,
				1,
				1
			]],
			6: [[
				1,
				0,
				0
			], [
				1,
				1,
				1
			]],
			7: [[
				0,
				0,
				1
			], [
				1,
				1,
				1
			]]
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
		function randomKind(rng) {
			return 1 + Math.floor(rng() * 7);
		}
		function randomPiece(rng) {
			const kind = randomKind(rng);
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
		/** Drop the current piece to the floor and lock it. Returns the cells dropped. */
		function hardDrop(state) {
			if (state.current === null || state.over) return 0;
			let dropped = 0;
			while (move(state, 0, 1)) dropped += 1;
			lock(state);
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
		const CELL = 22;
		const BOARD_W = 220;
		const BOARD_H = 440;
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
		const GRID_LINE = "#26262e";
		const BOARD_BG = "#15151b";
		const TEXT$1 = "#d8d8e0";
		function drawCell(ctx, x, y, color, alpha = 1) {
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.fillRect(x + 1, y + 1, 20, 20);
			ctx.globalAlpha = 1;
		}
		function drawShape(ctx, shape, px, py, kind, alpha = 1) {
			for (let r = 0; r < shape.length; r += 1) for (let c = 0; c < shape[r].length; c += 1) {
				if (shape[r][c] === 0) continue;
				drawCell(ctx, px + c * CELL, py + r * CELL, COLORS[kind], alpha);
			}
		}
		function drawPreview(ctx, label, piece, y) {
			ctx.fillStyle = TEXT$1;
			ctx.font = "11px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(label, PREVIEW_X, y);
			ctx.fillStyle = BOARD_BG;
			ctx.fillRect(PREVIEW_X, y + 6, PREVIEW_W, PREVIEW_H);
			ctx.strokeStyle = GRID_LINE;
			ctx.strokeRect(236.5, y + 6.5, PREVIEW_W, PREVIEW_H);
			if (piece === null) return;
			const shape = piece.shape;
			drawShape(ctx, shape, PREVIEW_X + Math.floor((PREVIEW_W - shape[0].length * CELL) / 2), y + 6 + Math.floor((PREVIEW_H - shape.length * CELL) / 2), piece.kind);
		}
		/** Draw one frame of the game. */
		function renderTetris(ctx, state) {
			ctx.clearRect(0, 0, 332, 448);
			ctx.fillStyle = BOARD_BG;
			ctx.fillRect(0, 0, BOARD_W, BOARD_H);
			ctx.strokeStyle = GRID_LINE;
			ctx.lineWidth = 1;
			for (let c = 1; c < 10; c += 1) {
				ctx.beginPath();
				ctx.moveTo(c * CELL + .5, 0);
				ctx.lineTo(c * CELL + .5, BOARD_H);
				ctx.stroke();
			}
			for (let r = 1; r < 20; r += 1) {
				ctx.beginPath();
				ctx.moveTo(0, r * CELL + .5);
				ctx.lineTo(BOARD_W, r * CELL + .5);
				ctx.stroke();
			}
			for (let r = 0; r < 20; r += 1) for (let c = 0; c < 10; c += 1) {
				const kind = state.grid[r][c];
				if (kind !== 0) drawCell(ctx, c * CELL, r * CELL, COLORS[kind]);
			}
			if (state.current !== null) {
				const piece = state.current;
				const gy = ghostY(state);
				if (gy !== piece.y) drawShape(ctx, piece.shape, piece.x * CELL, gy * CELL, piece.kind, .25);
				drawShape(ctx, piece.shape, piece.x * CELL, piece.y * CELL, piece.kind);
			}
			drawPreview(ctx, "下一个", state.next, 6);
			drawPreview(ctx, "暂存 C", state.hold, 112);
			if (state.over) {
				ctx.fillStyle = TEXT$1;
				ctx.font = "bold 18px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText("GAME OVER", BOARD_W / 2, BOARD_H / 2 - 8);
				ctx.font = "12px ui-monospace, monospace";
				ctx.fillText(`得分 ${state.score} · R 重新开始`, BOARD_W / 2, 238);
			}
		}
		//#endregion
		//#region src/client/games/tetris/index.ts
		function createTetrisGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.width = 332;
			canvas.height = 448;
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const ctx = canvas.getContext("2d");
			if (ctx === null) throw new Error("dsh-minigames: tetris needs a 2d canvas context");
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
					window.removeEventListener("keydown", onKeyDown);
				}
			};
		}
		const tetrisGame = {
			id: "tetris",
			title: "俄罗斯方块",
			icon: "🧱",
			description: "经典下落消除：←→ 移动，↑/X 旋转，空格硬降，C 暂存，P 暂停。",
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
		const SPAWN_INTERVAL = 1.6;
		const PLAYER_SPEED = 110;
		const ENEMY_SPEED = 80;
		const PLAYER_FIRE_CD = .4;
		const ENEMY_FIRE_CD_MIN = 1.2;
		const BULLET_SPEED_PLAYER = 260;
		const BULLET_SPEED_ENEMY = 170;
		const AI_TICK = .7;
		const PLAYER_HP = 3;
		const PLAYER_INVULN = 1.5;
		const SPAWN_POINTS = [
			[0, 0],
			[14, 0],
			[7, 0]
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
			for (const [tx, ty] of SPAWN_POINTS) grid[ty][tx] = 0;
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
					hp: PLAYER_HP,
					cooldown: 0,
					alive: true,
					invuln: 0
				},
				enemies: [],
				bullets: [],
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
		/** The tile columns/rows a TILE-size rect at (x, y) overlaps. */
		function overlapTiles(x, y) {
			return {
				tx0: Math.floor(x / 32),
				tx1: Math.floor((x + 32 - 1) / 32),
				ty0: Math.floor(y / 32),
				ty1: Math.floor((y + 32 - 1) / 32)
			};
		}
		/** Whether every tile a rect at (x, y) overlaps is walkable. */
		function rectWalkable(grid, x, y) {
			const { tx0, tx1, ty0, ty1 } = overlapTiles(x, y);
			for (let ty = ty0; ty <= ty1; ty += 1) for (let tx = tx0; tx <= tx1; tx += 1) if (tileAt(grid, tx, ty) !== 0) return false;
			return true;
		}
		/** AABB overlap between two tanks (slightly shrunk so neighbours can pass). */
		function tanksOverlap(a, b) {
			const pad = 2;
			return a.x + pad < b.x + 32 - pad && a.x + 32 - pad > b.x + pad && a.y + pad < b.y + 32 - pad && a.y + 32 - pad > b.y + pad;
		}
		/** Try to move a tank by dist px in dir; blocked by walls and other tanks. */
		function tryMove(state, tank, dir, dist) {
			const nx = tank.x + DIR_DX[dir] * dist;
			const ny = tank.y + DIR_DY[dir] * dist;
			if (!rectWalkable(state.grid, nx, ny)) return false;
			for (const other of [state.player, ...state.enemies]) {
				if (other === tank || !other.alive) continue;
				if (tanksOverlap({
					...tank,
					x: nx,
					y: ny
				}, other)) return false;
			}
			tank.x = nx;
			tank.y = ny;
			tank.dir = dir;
			return true;
		}
		/** Whether the tank can advance a small step in dir (walls + tanks clear). */
		function canAdvance(state, tank, dir) {
			const step = 4;
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
				enemy.dir = Math.abs(ex - px) < Math.abs(ey - py) ? py < ey ? 0 : 2 : px > ex ? 1 : 3;
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
				enemy.dir = dir;
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
					hp: 1,
					cooldown: .5 + state.rng(),
					alive: true,
					invuln: 0
				});
				state.spawnQueue -= 1;
				return;
			}
		}
		function killEnemy(state, index) {
			state.enemies.splice(index, 1);
			state.score += 100;
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
				if (dir !== null) tryMove(state, player, dir, PLAYER_SPEED * dt);
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
				tryMove(state, enemy, enemy.dir, ENEMY_SPEED * dt);
				enemy.cooldown = Math.max(0, enemy.cooldown - dt);
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
					dead = true;
				} else if (tile === 2 || tx < 0 || tx >= 15 || ty < 0 || ty >= 13) dead = true;
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
						dead = true;
						if (player.hp <= 0) player.alive = false;
					}
				}
				if (!dead) aliveBullets.push(bullet);
			}
			state.bullets = aliveBullets;
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
		* Tank battle canvas renderer: tiles (brick/steel), tanks with directional
		* turrets, and bullets. Palette tuned for the DSH dark shell.
		*/
		const BRICK = "#8a5a3a";
		const BRICK_LINE = "#6e442a";
		const STEEL = "#7a7a88";
		const STEEL_LINE = "#5c5c68";
		const PLAYER = "#5f8ae8";
		const PLAYER_TREAD = "#3c5aa0";
		const ENEMY = "#e05f5f";
		const ENEMY_TREAD = "#a03c3c";
		const TEXT = "#d8d8e0";
		const TANK_W = 480;
		const TANK_H = 416;
		function drawTile(ctx, tx, ty, tile) {
			const x = tx * 32;
			const y = ty * 32;
			if (tile === 1) {
				ctx.fillStyle = BRICK;
				ctx.fillRect(x, y, 32, 32);
				ctx.strokeStyle = BRICK_LINE;
				ctx.lineWidth = 1;
				for (let i = 1; i < 4; i += 1) {
					ctx.beginPath();
					ctx.moveTo(x, y + 8 * i);
					ctx.lineTo(x + 32, y + 8 * i);
					ctx.stroke();
				}
				ctx.beginPath();
				ctx.moveTo(x + 16, y);
				ctx.lineTo(x + 16, y + 32);
				ctx.stroke();
			} else if (tile === 2) {
				ctx.fillStyle = STEEL;
				ctx.fillRect(x, y, 32, 32);
				ctx.strokeStyle = STEEL_LINE;
				ctx.lineWidth = 2;
				ctx.strokeRect(x + 4, y + 4, 24, 24);
			}
		}
		function drawTank(ctx, tank) {
			if (tank.invuln > 0 && Math.floor(performance.now() / 120) % 2 === 0) return;
			const x = tank.x;
			const y = tank.y;
			const body = tank.kind === "player" ? PLAYER : ENEMY;
			ctx.fillStyle = tank.kind === "player" ? PLAYER_TREAD : ENEMY_TREAD;
			ctx.fillRect(x, y, 32, 32);
			ctx.fillStyle = body;
			ctx.fillRect(x + 4, y + 4, 24, 24);
			ctx.fillStyle = body;
			const cx = x + 16 - 3;
			const cy = y + 16 - 3;
			ctx.fillRect(cx + DIR_DX[tank.dir] * 10, cy + DIR_DY[tank.dir] * 10, 6, 6);
		}
		/** Draw one frame of the battle. */
		function renderTanks(ctx, state) {
			ctx.clearRect(0, 0, TANK_W, TANK_H);
			ctx.fillStyle = "#15151b";
			ctx.fillRect(0, 0, TANK_W, TANK_H);
			for (let ty = 0; ty < 13; ty += 1) for (let tx = 0; tx < 15; tx += 1) {
				const tile = state.grid[ty][tx];
				if (tile !== 0) drawTile(ctx, tx, ty, tile);
			}
			for (const bullet of state.bullets) {
				ctx.fillStyle = bullet.owner === "player" ? "#ffe08a" : "#ff9d6b";
				ctx.fillRect(bullet.x, bullet.y, 6, 6);
			}
			for (const enemy of state.enemies) drawTank(ctx, enemy);
			if (state.player.alive) drawTank(ctx, state.player);
			ctx.fillStyle = TEXT;
			ctx.font = "11px ui-monospace, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`第 ${state.wave}/3 波`, 6, 14);
			ctx.fillText(`剩余敌人 ${state.enemies.length + state.spawnQueue}`, 6, 30);
			ctx.fillText(`生命 ${"♥".repeat(state.player.hp)}`, 6, 46);
			if (state.result !== "none") {
				ctx.fillStyle = TEXT;
				ctx.font = "bold 22px ui-monospace, monospace";
				ctx.textAlign = "center";
				ctx.fillText(state.result === "win" ? "胜利！" : "GAME OVER", TANK_W / 2, TANK_H / 2 - 8);
				ctx.font = "12px ui-monospace, monospace";
				ctx.fillText("按 R 重新开始", TANK_W / 2, 228);
			}
		}
		//#endregion
		//#region src/client/games/tanks/index.ts
		function createTanksGame(host, options) {
			const canvas = document.createElement("canvas");
			canvas.width = TANK_W;
			canvas.height = TANK_H;
			canvas.className = "dmg-game-canvas";
			host.replaceChildren(canvas);
			const ctx = canvas.getContext("2d");
			if (ctx === null) throw new Error("dsh-minigames: tanks needs a 2d canvas context");
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
			create: createTanksGame
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
				tanksGame
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dmg-game-hint",
						children: "点击游戏区域获取键盘焦点 · P 也可暂停"
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:E:\deepseek-harness\dsh-minigames\src\client\app.css.mjs
		const css = "/* dsh-minigames panel styles. All classes are dmg- prefixed to stay\n * collision-free in the host page; the stylesheet is injected by the client\n * bundle as one <style data-plugin> tag. Palette matches the DSH dark shell. */\n\n.dmg-rail {\n  position: fixed;\n  right: 0;\n  top: 50%;\n  transform: translateY(-50%);\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 4px;\n  width: 36px;\n  padding: 10px 0;\n  background: #1b1b22;\n  border: 1px solid #3a3a45;\n  border-right: none;\n  border-radius: 10px 0 0 10px;\n  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.35);\n  color: #d8d8e0;\n  cursor: pointer;\n  user-select: none;\n}\n\n.dmg-rail:hover {\n  background: #23232c;\n}\n\n.dmg-rail-icon {\n  font-size: 18px;\n  line-height: 1;\n}\n\n.dmg-rail-text {\n  writing-mode: vertical-rl;\n  font-size: 11px;\n  letter-spacing: 2px;\n  color: #9a9aa5;\n}\n\n.dmg-panel {\n  position: fixed;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 2147482900;\n  display: flex;\n  flex-direction: column;\n  min-width: 360px;\n  background: #15151b;\n  color: #d8d8e0;\n  border-left: 1px solid #3a3a45;\n  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);\n  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;\n}\n\n.dmg-resize {\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  width: 5px;\n  cursor: ew-resize;\n  z-index: 1;\n}\n\n.dmg-header {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 12px;\n  background: #1b1b22;\n  border-bottom: 1px solid #26262e;\n  flex: 0 0 auto;\n}\n\n.dmg-title {\n  font-weight: 600;\n  font-size: 14px;\n  white-space: nowrap;\n}\n\n.dmg-score {\n  margin-left: auto;\n  font-size: 12px;\n  color: #9a9aa5;\n  white-space: nowrap;\n}\n\n.dmg-header-actions {\n  display: flex;\n  gap: 6px;\n  flex: 0 0 auto;\n}\n\n.dmg-icon-btn {\n  background: none;\n  border: 1px solid #3a3a45;\n  color: #d8d8e0;\n  border-radius: 6px;\n  padding: 3px 10px;\n  cursor: pointer;\n  font-size: 12px;\n  font-family: inherit;\n}\n\n.dmg-icon-btn:hover {\n  background: #23232c;\n}\n\n.dmg-body {\n  flex: 1;\n  overflow: auto;\n  padding: 12px;\n  min-height: 0;\n}\n\n.dmg-picker {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));\n  gap: 10px;\n}\n\n.dmg-card {\n  background: #1b1b22;\n  border: 1px solid #3a3a45;\n  border-radius: 10px;\n  padding: 14px 10px;\n  cursor: pointer;\n  text-align: center;\n  color: inherit;\n  font-family: inherit;\n}\n\n.dmg-card:hover {\n  border-color: #5a5a6a;\n  background: #23232c;\n}\n\n.dmg-card-icon {\n  font-size: 30px;\n  line-height: 1;\n}\n\n.dmg-card-title {\n  font-weight: 600;\n  margin: 8px 0 4px;\n  font-size: 13px;\n}\n\n.dmg-card-desc {\n  font-size: 11px;\n  color: #9a9aa5;\n  line-height: 1.45;\n  min-height: 48px;\n}\n\n.dmg-card-best {\n  margin-top: 8px;\n  font-size: 11px;\n  color: #7a7a8a;\n}\n\n.dmg-game-area {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  min-height: 0;\n}\n\n.dmg-game-toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  flex: 0 0 auto;\n}\n\n.dmg-game-name {\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.dmg-game-toolbar .dmg-icon-btn {\n  margin-left: auto;\n}\n\n.dmg-game-host {\n  flex: 1;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 100%;\n  min-height: 0;\n  outline: none;\n}\n\n.dmg-game-canvas {\n  width: 100%;\n  max-width: 640px;\n  height: auto;\n  background: #15151b;\n  border-radius: 6px;\n  border: 1px solid #26262e;\n}\n\n.dmg-game-hint {\n  font-size: 11px;\n  color: #7a7a8a;\n  text-align: center;\n  flex: 0 0 auto;\n}\n";
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