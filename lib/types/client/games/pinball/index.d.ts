/**
 * 弹球台 Pinball game definition: wires the pure physics state machine into a
 * {@link MiniGameInstance} — A/← and D/→ flip the flippers, Space charges the
 * plunger and releases to launch, N nudges the table (abuse → TILT), P pauses,
 * R restarts the table. Continuous frame loop: physics on f.dt with substeps,
 * paint on f.render. Level progress persists through the shared level store
 * (gameId 'pinball'); score events burst particles at the scoring spot.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const pinballGame: MiniGameDefinition;
