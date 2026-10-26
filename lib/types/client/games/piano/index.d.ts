/**
 * Piano Tiles game definition: wires the pure state machine into a
 * {@link MiniGameInstance} — D F J K (or touch lanes) tap the lane when its
 * tile reaches the bottom hit zone; wrong lane or a missed tile ends the
 * run (classic rules). Enter starts, R restarts the SAME seed, P pauses.
 * WebAudio hits ascend a pentatonic scale (pure oscillator synthesis, no
 * assets), initialized on the first user gesture.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const pianoGame: MiniGameDefinition;
