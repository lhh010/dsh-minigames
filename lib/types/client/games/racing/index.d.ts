/**
 * Pseudo-3D racing game definition: wires the pure road logic and the
 * perspective canvas renderer into a {@link MiniGameInstance} — rAF loop,
 * keyboard input (steer / throttle / brake / handbrake / pause), distance-based
 * score reporting, and restart.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const racingGame: MiniGameDefinition;
