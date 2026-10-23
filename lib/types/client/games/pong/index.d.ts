/**
 * Pong game definition: wires the pure logic into a
 * {@link MiniGameInstance} — pointer follow as primary control, ←/→ or A/D
 * fallback, R restart, P pause, click/space restart on the match overlay.
 * onScore fires once with the player's points when the match ends.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const pongGame: MiniGameDefinition;
