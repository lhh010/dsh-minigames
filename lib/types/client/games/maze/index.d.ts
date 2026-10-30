/**
 * Maze game definition: wires the pure maze logic into a
 * {@link MiniGameInstance} — arrows/WASD move the player cell-to-cell through
 * open walls toward the far-corner exit. Five levels ramp 11×9 → 19×17 cells
 * (same seed per level → identical maze on R restart); after L5 the run wraps
 * back to L1. On win: overlay 「第 X 关完成 · Y 步（最短 Z 步）」+ particles +
 * onScore(level), auto-advance 1.5s later. Turn-based; no undo (movement is
 * free) and P toggles pause — panel-driven pause freezes the auto-advance via
 * the stored-remainder pattern. [ / ] jump between unlocked levels (bounded
 * to the persisted highest reached). The highest level reached persists per
 * game id, so re-entering resumes where the player left off.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const mazeGame: MiniGameDefinition;
