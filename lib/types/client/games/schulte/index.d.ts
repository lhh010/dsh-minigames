/**
 * 舒尔特方格 Schulte Grid game definition: wires the pure grid logic into a
 * {@link MiniGameInstance} — click cells in ascending order 1..n²; wrong
 * clicks flash red and add +500ms to the run; the timer starts on the first
 * click; finishing fires onScore with a faster-is-higher time score, bursts
 * particles, and auto-advances 1.5s later. R restarts the CURRENT level
 * (deterministic per-level seed → the same shuffle). Panel-driven pause
 * freezes both the run clock and the advance timer via the
 * stored-remainder pattern; there is no pause hotkey.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const schulteGame: MiniGameDefinition;
