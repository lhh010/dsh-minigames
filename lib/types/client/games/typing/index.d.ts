/**
 * Typing-meteors game definition: wires the pure falling-word logic into a
 * {@link MiniGameInstance} — rAF loop with clamped dt, letter keys with
 * preventDefault while the host has focus, ESC clears the lock, particle
 * bursts on completed words, pause (dt-driven, so fall/spawn freeze
 * exactly), and R restart.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const typingGame: MiniGameDefinition;
