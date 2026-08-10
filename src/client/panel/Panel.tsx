/**
 * The right-side game panel: a fixed rail when collapsed, a right-half panel
 * when expanded (default width 50vw, drag-resizable), a game picker, and a
 * game area that mounts the selected game with full lifecycle management
 * (pause on collapse / tab hidden / user pause, destroy on switch).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  getGame, getGames, registerBuiltinGames, type MiniGameDefinition,
} from '../games/index.ts'

registerBuiltinGames()

const LS_OPEN = 'dsh-minigames:open'
const LS_GAME = 'dsh-minigames:game'
const LS_WIDTH = 'dsh-minigames:width'
const LS_BEST_PREFIX = 'dsh-minigames:best:'

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

/** Whether a pointer event's target is inside the panel (drag handle hit-test). */
function clampPanelWidth(px: number, viewport: number): number {
  return Math.min(Math.max(px, 360), Math.max(360, viewport * 0.8))
}

export function MiniGamePanel(): ReactNode {
  const [open, setOpen] = useState(() => loadBool(LS_OPEN, false))
  const [gameId, setGameId] = useState<string | null>(() => loadStr(LS_GAME, null))
  const [width, setWidth] = useState(() => {
    const saved = loadStr(LS_WIDTH, null)
    return saved === null ? Math.round(window.innerWidth / 2) : clampPanelWidth(Number(saved) || Math.round(window.innerWidth / 2), window.innerWidth)
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

  // Resize handle: drag the left edge of the panel.
  useEffect(() => {
    if (!open) return undefined
    const panel = panelRef.current
    if (panel === null) return undefined
    const onMove = (event: PointerEvent): void => {
      const next = clampPanelWidth(window.innerWidth - event.clientX, window.innerWidth)
      setWidth(next)
      save(LS_WIDTH, String(next))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    const handle = panel.querySelector<HTMLElement>('[data-dmg-resize]')
    if (handle === null) return undefined
    const onDown = (event: PointerEvent): void => {
      event.preventDefault()
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

  if (!open) {
    return (
      <div
        className="dmg-rail"
        role="button"
        aria-label="打开小游戏"
        title="小游戏"
        onClick={() => toggleOpen(true)}
      >
        <span className="dmg-rail-icon">🎮</span>
        <span className="dmg-rail-text">小游戏</span>
      </div>
    )
  }

  const games = getGames()
  return (
    <div
      ref={panelRef}
      className="dmg-panel"
      style={{ width: `${width}px` }}
      data-open="true"
    >
      <div data-dmg-resize className="dmg-resize" aria-hidden="true" />
      <div className="dmg-header">
        <span className="dmg-title">🎮 小游戏</span>
        {activeGame !== undefined && (
          <span className="dmg-score">
            {`${activeGame.title} · 最高 ${best[activeGame.id] ?? 0}`}
          </span>
        )}
        <div className="dmg-header-actions">
          {activeGame !== undefined && (
            <button type="button" className="dmg-icon-btn" onClick={() => setGameId(null)}>
              选游戏
            </button>
          )}
          <button type="button" className="dmg-icon-btn" onClick={() => toggleOpen(false)}>
            收起 ▶
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
 * start on mount, pause whenever the panel is collapsed or the tab is hidden
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
