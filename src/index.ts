/**
 * dsh-minigames node half: loader row implementation + the self-update
 * endpoint (user-initiated one-click update). The game panel lives in the
 * browser bundle.
 * @module @dsh-external/dsh-minigames
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerUpdateEndpoint } from './update-endpoint.ts'

/** Stable Cordis plugin name (the loader row id). */
export const name = 'dsh-minigames'

/** The web server is required before the update endpoint can register. */
export const inject = ['webServer']

/**
 * Activate the node half: register the update endpoint and log activation.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  registerUpdateEndpoint(ctx)
  ctx.logger.info('[dsh-minigames] node half active; the game panel mounts in the browser')
}
