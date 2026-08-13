/**
 * dsh-minigames node half: the loader row's implementation. All product
 * surface is browser-side (the right-side game panel); this half exists so
 * the profile bundle row has a host plugin for client-modules to discover —
 * it scans loader entries for `dshClient` packages, and an entry without a
 * fiber would fail the boot sweep. The node half deliberately holds no
 * routes, tools, or services.
 * @module @dsh-external/dsh-minigames
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name (the loader row id). */
export const name = 'dsh-minigames'

/**
 * Activate the node half: log the activation so a loaded-but-invisible row
 * is diagnosable; everything else lives in the client bundle.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  ctx.logger.info('[dsh-minigames] node half active; the game panel mounts in the browser')
}
