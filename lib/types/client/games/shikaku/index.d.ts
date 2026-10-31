/**
 * 四角填方 game definition: wires the pure rect-partition logic into a
 * MiniGameInstance — drag from any cell to draw a rectangle; releasing
 * commits it when it covers exactly one clue whose number equals the rect
 * area (invalid drags just vanish), clicking a committed rect removes it.
 * Covering the whole board fires onScore with the time bonus and
 * auto-advances 1.5s later. Persisted level resumes where the player left
 * off; P pauses (advance timer freezes via the stored-remainder pattern);
 * R restarts the CURRENT level; [ ] switches within reached levels.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const shikakuGame: MiniGameDefinition;
