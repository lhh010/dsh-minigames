/**
 * Sudoku game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — click a free cell, type 1-9 to fill / 0 to
 * clear, arrow keys move the cursor, D cycles difficulty, and a solve
 * reports a time-based score (faster = higher).
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const sudokuGame: MiniGameDefinition;
