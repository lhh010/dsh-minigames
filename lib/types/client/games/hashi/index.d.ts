/**
 * 桥 (Hashi) game definition: wires the pure logic into a
 * {@link MiniGameInstance} — 5 seeded levels ramping 5x5 → 9x9 (same seed per
 * level, so R replays a level exactly). Click an island, then an island in
 * the same row/column to cycle their bridge 0→1→2→0; Backspace/Z removes the
 * last bridge. A level is solved when every island has exactly its number of
 * bridge ends, all islands form one connected group and no bridges cross;
 * the win overlay, a particle burst and onScore(level) fire, and the next
 * level starts 1.5s later (stored-remainder pattern keeps that timer
 * pause-safe); P toggles pause. The highest level reached persists per game
 * id, so re-entering resumes where the player left off.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const hashiGame: MiniGameDefinition;
