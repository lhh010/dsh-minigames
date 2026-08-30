/**
 * dsh-minigames client half: mounts the right-side game panel as a
 * self-contained DOM portal (no host services, no layout slots — the panel
 * lives on document.body and manages its own geometry). The bundle registers
 * via window.__ModuleLoader__.load with id = package name; the client runtime
 * mounts it as a cordis plugin and calls apply once the loader tree settles.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Context } from '@deepseek-ai/cordis'
import { MiniGamePanel } from './panel/Panel.tsx'
import './app.css'

/** No host services are required. */
export const inject: string[] = []

/** Bundle identity (informational; the module loader keys on the package name). */
export const name = 'dsh-minigames-client'

/**
 * Mount the panel portal for the lifetime of the plugin fiber. The effect
 * returns the disposer cordis runs on teardown (HMR, plugin unload).
 * @param ctx - the browser-side cordis context.
 */
import { startUpdateChip } from './update-chip.ts'

export function apply(ctx: Context): void {
  startUpdateChip()
  ctx.effect(() => {
    const host = document.createElement('div')
    host.setAttribute('data-dsh-minigames', '')
    document.body.appendChild(host)
    let root: Root | undefined
    try {
      root = createRoot(host)
      root.render(createElement(MiniGamePanel))
    } catch (error) {
      ctx.logger.error('[dsh-minigames] panel mount failed:', error)
    }
    return () => {
      root?.unmount()
      host.remove()
    }
  }, 'dsh-minigames: panel mount')
}
