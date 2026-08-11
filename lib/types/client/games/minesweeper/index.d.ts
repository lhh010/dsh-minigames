/**
 * Minesweeper game definition: wires the pure grid logic into a
 * {@link MiniGameInstance} — mouse click reveals, right-click flags, a
 * double-click chord, and a restart key. Tracks the solve time and reports a
 * time-based score (faster = higher) on win, which the panel stores as the
 * best (i.e. shortest) solve.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const minesweeperGame: MiniGameDefinition;
