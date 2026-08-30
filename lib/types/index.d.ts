/**
 * dsh-minigames node half: loader row implementation + the self-update
 * endpoint (user-initiated one-click update). The game panel lives in the
 * browser bundle.
 * @module @dsh-external/dsh-minigames
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name (the loader row id). */
export declare const name = "dsh-minigames";
/** The web server is required before the update endpoint can register. */
export declare const inject: string[];
/**
 * Activate the node half: register the update endpoint and log activation.
 * @param ctx - plugin context.
 */
export declare function apply(ctx: Context): void;
