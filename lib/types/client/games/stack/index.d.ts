/**
 * Stack game definition: wires the pure tower logic into a
 * {@link MiniGameInstance} — click/Space/↓ drops the sliding block, the
 * trimmed overlap becomes the next layer, R restarts, P pauses; on collapse
 * click or Space restarts from the overlay.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const stackGame: MiniGameDefinition;
