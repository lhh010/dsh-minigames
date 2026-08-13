import type { Context } from '@deepseek-ai/cordis';
import './app.css';
/** No host services are required. */
export declare const inject: string[];
/** Bundle identity (informational; the module loader keys on the package name). */
export declare const name = "dsh-minigames-client";
/**
 * Mount the panel portal for the lifetime of the plugin fiber. The effect
 * returns the disposer cordis runs on teardown (HMR, plugin unload).
 * @param ctx - the browser-side cordis context.
 */
export declare function apply(ctx: Context): void;
