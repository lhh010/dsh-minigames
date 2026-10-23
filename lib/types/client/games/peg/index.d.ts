/**
 * Peg Solitaire (孔明棋) game definition: wires the pure jump logic into a
 * {@link MiniGameInstance} — click a peg then a landing hole (or arrows +
 * Enter to pick and land), Z/Backspace rewinds the last jump, R restarts the
 * CURRENT level. Winning a level fires onScore with the level number, bursts
 * particles, and auto-advances 1.5s later (wrapping L3 back to L1). Invalid
 * picks flash a brief toast.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const pegGame: MiniGameDefinition;
