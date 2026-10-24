/**
 * Slitherlink game definition: wires the pure puzzle logic into a
 * {@link MiniGameInstance} — left-click toggles an edge line, right-click or
 * Shift+click marks a cross; solving a level fires onScore and auto-advances.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const slitherlinkGame: MiniGameDefinition;
