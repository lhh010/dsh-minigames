/**
 * Neon Racing game definition: wires the pure state machine into a
 * {@link MiniGameInstance} — arrow keys / AD change lanes, W/S or arrows
 * accelerate and brake, Enter starts, P pauses (panel pause works too),
 * touch taps the left/right half to change lanes. WebAudio engine hum and
 * crash/near-miss sounds are synthesized (no assets).
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const racingGame: MiniGameDefinition;
