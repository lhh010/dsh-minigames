/**
 * 过河青蛙 game definition: wires the deterministic frogger logic into a
 * {@link MiniGameInstance} — arrows/WASD hop one cell; crossing every road
 * lane to the goal row scores and advances the level (faster, denser
 * traffic); a car hit costs one of three lives and resets the frog to the
 * start row; zero lives ends the run (R restarts). Score accrues per
 * crossing via onScore. P pauses (sim clock freezes; the stored-remainder
 * pattern keeps a pending level advance exact).
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const froggerGame: MiniGameDefinition;
