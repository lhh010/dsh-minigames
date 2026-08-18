/**
 * The minigames floating window: a draggable, edge-snapping ("dockable")
 * floating window with a hide toggle. Dragging the header moves the window;
 * releasing near a screen edge snaps it to that edge (left/right/top/bottom).
 * A ✕ button hides the window entirely, leaving a small floating 🎮 launcher
 * button; position, width, and dock state persist in localStorage. The game
 * picker and game area mount inside the window with full lifecycle
 * management (pause on hide / tab hidden / user pause, destroy on switch).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  getGame, getGames, registerBuiltinGames, type MiniGameDefinition,
} from '../games/index.ts'

registerBuiltinGames()

const LS_OPEN = 'dsh-minigames:open'
const LS_GAME = 'dsh-minigames:game'
const LS_WIDTH = 'dsh-minigames:width'
const LS_POS = 'dsh-minigames:pos'
const LS_DOCK = 'dsh-minigames:dock'
const LS_LAUNCHER = 'dsh-minigames:launcher'
const LS_BEST_PREFIX = 'dsh-minigames:best:'

/** Snap distance to a screen edge (px). */
const SNAP_PX = 24
const WINDOW_MARGIN = 8
/** Launcher button diameter (kept in sync with the .dmg-launcher CSS). */
const LAUNCHER_SIZE = 46
/** Pointer travel that counts as a launcher drag instead of a click (px). */
const DRAG_THRESHOLD = 5

type DockState = 'free' | 'left' | 'right'

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

function loadStr(key: string, fallback: string | null): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return fallback
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode): the panel still works per session.
  }
}

function loadPos(): { x: number; y: number } | null {
  return loadJsonPos(LS_POS)
}

function loadLauncherPos(): { x: number; y: number } | null {
  return loadJsonPos(LS_LAUNCHER)
}

function loadJsonPos(key: string): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
    if (typeof parsed.x === 'number' && Number.isFinite(parsed.x)
      && typeof parsed.y === 'number' && Number.isFinite(parsed.y)) {
      return { x: parsed.x, y: parsed.y }
    }
  } catch {
    // Fall through to the default position.
  }
  return null
}

function loadDock(): DockState {
  try {
    const value = localStorage.getItem(LS_DOCK)
    return value === 'left' || value === 'right' ? value : 'free'
  } catch {
    return 'free'
  }
}

/** Clamp a floating-window width to the viewport. */
function clampPanelWidth(px: number, viewport: number): number {
  return Math.min(Math.max(px, 360), Math.max(360, viewport * 0.8))
}

function windowHeight(viewport: number): number {
  return Math.min(viewport * 0.65, 680)
}

/** Clamp the floating window inside the viewport for its rendered size. */
function clampWindowPos(p: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(p.x, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vw - w - WINDOW_MARGIN)),
    y: Math.min(Math.max(p.y, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vh - h - WINDOW_MARGIN)),
  }
}

/** Clamp the launcher button inside the viewport. */
function clampLauncherPos(p: { x: number; y: number }): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(p.x, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vw - LAUNCHER_SIZE - WINDOW_MARGIN)),
    y: Math.min(Math.max(p.y, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vh - LAUNCHER_SIZE - WINDOW_MARGIN)),
  }
}

export function MiniGamePanel(): ReactNode {
  const [open, setOpen] = useState(() => loadBool(LS_OPEN, false))
  const [gameId, setGameId] = useState<string | null>(() => loadStr(LS_GAME, null))
  const [width, setWidth] = useState(() => {
    const saved = loadStr(LS_WIDTH, null)
    const fallback = Math.min(Math.round(window.innerWidth / 2), 640)
    return saved === null ? fallback : clampPanelWidth(Number(saved) || fallback, window.innerWidth)
  })
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = loadPos()
    if (saved !== null) return clampWindowPos(saved, width, windowHeight(window.innerHeight))
    const fallbackWidth = Math.min(Math.round(window.innerWidth / 2), 640)
    return { x: Math.max(WINDOW_MARGIN, window.innerWidth - fallbackWidth - 12), y: 80 }
  })
  const [dock, setDock] = useState<DockState>(() => loadDock())
  const [launcherPos, setLauncherPos] = useState<{ x: number; y: number }>(() => {
    const saved = loadLauncherPos()
    if (saved !== null) return clampLauncherPos(saved)
    return { x: window.innerWidth - LAUNCHER_SIZE - 18, y: window.innerHeight - LAUNCHER_SIZE - 18 }
  })
  const [best, setBest] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const game of getGames()) {
      try {
        const value = localStorage.getItem(LS_BEST_PREFIX + game.id)
        if (value !== null) out[game.id] = Number(value)
      } catch {
        // Storage unavailable; the panel works without persisted bests.
      }
    }
    return out
  })
  const panelRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef(width)
  const posRef = useRef(pos)
  const dockRef = useRef(dock)
  const launcherPosRef = useRef(launcherPos)
  const suppressClick = useRef(false)
  useEffect(() => { widthRef.current = width }, [width])
  useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => { dockRef.current = dock }, [dock])
  useEffect(() => { launcherPosRef.current = launcherPos }, [launcherPos])

  const activeGame = gameId === null ? undefined : getGame(gameId)

  const selectGame = (id: string): void => {
    setGameId(id)
    save(LS_GAME, id)
  }
  const toggleOpen = (next: boolean): void => {
    setOpen(next)
    save(LS_OPEN, next ? '1' : '0')
  }
  const onScore = (game: MiniGameDefinition, score: number): void => {
    setBest(prev => {
      const current = prev[game.id] ?? 0
      if (score <= current) return prev
      const next = { ...prev, [game.id]: score }
      try {
        localStorage.setItem(LS_BEST_PREFIX + game.id, String(score))
      } catch {
        // Storage unavailable; best still lives in state for the session.
      }
      return next
    })
  }

  /** Drag the window by its header; releasing near an edge snaps it there. */
  const startDrag = (event: React.PointerEvent): void => {
    const target = event.target as HTMLElement
    if (target.closest('button, [data-dmg-resize]') !== null) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const start = posRef.current
    if (dockRef.current !== 'free') {
      setDock('free')
      save(LS_DOCK, 'free')
    }
    const onMove = (move: PointerEvent): void => {
      setPos({ x: start.x + move.clientX - startX, y: start.y + move.clientY - startY })
    }
    const onUp = (up: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = widthRef.current
      const h = windowHeight(vh)
      const nearLeft = up.clientX <= SNAP_PX
      const nearRight = up.clientX >= vw - SNAP_PX
      const nearTop = up.clientY <= SNAP_PX
      const nearBottom = up.clientY >= vh - SNAP_PX
      const nextDock: DockState = nearLeft ? 'left' : nearRight ? 'right' : 'free'
      const current = posRef.current
      let x = current.x
      let y = current.y
      if (nearLeft) x = WINDOW_MARGIN
      else if (nearRight) x = vw - w - WINDOW_MARGIN
      else x = Math.min(Math.max(x, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vw - w - WINDOW_MARGIN))
      if (nearTop) y = WINDOW_MARGIN
      else if (nearBottom) y = vh - h - WINDOW_MARGIN
      else y = Math.min(Math.max(y, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, vh - h - WINDOW_MARGIN))
      const next = { x, y }
      setPos(next)
      setDock(nextDock)
      save(LS_POS, JSON.stringify(next))
      save(LS_DOCK, nextDock)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /** Cycle dock: free -> right -> left -> free. */
  const cycleDock = (): void => {
    setDock(prev => {
      const next: DockState = prev === 'free' ? 'right' : prev === 'right' ? 'left' : 'free'
      save(LS_DOCK, next)
      if (next !== 'free') {
        const w = widthRef.current
        const p = {
          x: next === 'right' ? window.innerWidth - w - WINDOW_MARGIN : WINDOW_MARGIN,
          y: posRef.current.y,
        }
        setPos(p)
        save(LS_POS, JSON.stringify(p))
      }
      return next
    })
  }

  // Resize handle: drag the left edge; the opposite edge stays anchored.
  useEffect(() => {
    if (!open) return undefined
    const panel = panelRef.current
    if (panel === null) return undefined
    let startRight = 0
    const onMove = (event: PointerEvent): void => {
      const next = clampPanelWidth(startRight - event.clientX, window.innerWidth)
      setWidth(next)
      save(LS_WIDTH, String(next))
      setPos(prev => {
        const dockedRight = dockRef.current === 'right'
        const x = dockedRight ? window.innerWidth - next - WINDOW_MARGIN : startRight - next
        const p = { x, y: prev.y }
        save(LS_POS, JSON.stringify(p))
        return p
      })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    const handle = panel.querySelector<HTMLElement>('[data-dmg-resize]')
    if (handle === null) return undefined
    const onDown = (event: PointerEvent): void => {
      event.preventDefault()
      const rect = panel.getBoundingClientRect()
      startRight = rect.right
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointerdown', onDown)
    return () => {
      handle.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [open])

  /** Drag the launcher button; a click (no travel) opens the window instead. */
  const startLauncherDrag = (event: React.PointerEvent): void => {
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const start = launcherPosRef.current
    let moved = false
    const onMove = (move: PointerEvent): void => {
      const dx = move.clientX - startX
      const dy = move.clientY - startY
      if (!moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) moved = true
      if (moved) setLauncherPos(() => clampLauncherPos({ x: start.x + dx, y: start.y + dy }))
    }
    const onUp = (up: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!moved) return
      suppressClick.current = true
      const next = clampLauncherPos({ x: start.x + up.clientX - startX, y: start.y + up.clientY - startY })
      setLauncherPos(next)
      save(LS_LAUNCHER, JSON.stringify(next))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="dmg-launcher"
        style={{ left: `${launcherPos.x}px`, top: `${launcherPos.y}px` }}
        aria-label="打开小游戏"
        title="小游戏"
        onPointerDown={startLauncherDrag}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          toggleOpen(true)
        }}
      >
        <span aria-hidden="true">🎮</span>
      </button>
    )
  }

  const games = getGames()
  const height = windowHeight(window.innerHeight)
  return (
    <div
      ref={panelRef}
      className="dmg-float"
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${width}px`, height: `${height}px` }}
      data-dock={dock}
      data-open="true"
    >
      <div data-dmg-resize className="dmg-resize" aria-hidden="true" />
      <div className="dmg-header dmg-float-header" onPointerDown={startDrag}>
        <span className="dmg-title">🎮 小游戏</span>
        {activeGame !== undefined && (
          <span className="dmg-score">
            {`${activeGame.title} · 最高 ${best[activeGame.id] ?? 0}`}
          </span>
        )}
        <div className="dmg-header-actions">
          <button
            type="button"
            className="dmg-icon-btn"
            title={dock === 'free' ? '吸附到屏幕边缘' : '取消吸附，恢复自由浮动'}
            onClick={cycleDock}
          >
            {dock === 'free' ? '📌 吸附' : '📌 已吸附'}
          </button>
          {activeGame !== undefined && (
            <button type="button" className="dmg-icon-btn" onClick={() => setGameId(null)}>
              选游戏
            </button>
          )}
          <button type="button" className="dmg-icon-btn" onClick={() => toggleOpen(false)}>
            ✕ 隐藏
          </button>
        </div>
      </div>
      <div className="dmg-body">
        {activeGame === undefined ? (
          <div className="dmg-picker">
            {games.map(game => (
              <button
                type="button"
                key={game.id}
                className="dmg-card"
                onClick={() => selectGame(game.id)}
              >
                <div className="dmg-card-icon">{game.icon}</div>
                <div className="dmg-card-title">{game.title}</div>
                <div className="dmg-card-desc">{game.description}</div>
                <div className="dmg-card-best">最高分 {best[game.id] ?? 0}</div>
              </button>
            ))}
          </div>
        ) : (
          <GameArea key={activeGame.id} game={activeGame} onScore={score => onScore(activeGame, score)} />
        )}
      </div>
    </div>
  )
}

interface GameAreaProps {
  game: MiniGameDefinition
  onScore: (score: number) => void
}

/**
 * Mounts one game into a sized host div and drives its lifecycle: create +
 * start on mount, pause whenever the window is hidden or the tab is hidden
 * or the user paused, resume otherwise, destroy on unmount. The host div is
 * focusable and owns keyboard input while focused, so typing in the chat
 * composer is never hijacked by the game.
 */
function GameArea({ game, onScore }: GameAreaProps): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<ReturnType<MiniGameDefinition['create']> | null>(null)
  const [userPaused, setUserPaused] = useState(false)

  // Create/destroy the game instance per game.
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined
    const instance = game.create(host, { onScore })
    instanceRef.current = instance
    instance.start()
    host.focus({ preventScroll: true })
    return () => {
      instance.destroy()
      instanceRef.current = null
    }
  }, [game])

  // Pause/resume on visibility and user pause.
  useEffect(() => {
    const apply = (): void => {
      const instance = instanceRef.current
      if (instance === null) return
      if (userPaused || document.hidden) instance.pause()
      else instance.resume()
    }
    apply()
    document.addEventListener('visibilitychange', apply)
    return () => document.removeEventListener('visibilitychange', apply)
  }, [userPaused])

  return (
    <div className="dmg-game-area">
      <div className="dmg-game-toolbar">
        <span className="dmg-game-name">{game.icon} {game.title}</span>
        <button
          type="button"
          className="dmg-icon-btn"
          onClick={() => setUserPaused(prev => !prev)}
        >
          {userPaused ? '继续 ▶' : '暂停 ⏸'}
        </button>
      </div>
      <div ref={hostRef} className="dmg-game-host" tabIndex={0} data-dmg-host />
      <div className="dmg-game-controls">
        {game.controls.map(control => (
          <span key={control} className="dmg-control-tag">{control}</span>
        ))}
        <span className="dmg-control-tag dmg-control-muted">点击游戏区域获取键盘焦点</span>
      </div>
    </div>
  )
}
