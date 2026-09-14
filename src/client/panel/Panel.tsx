/** 浮动游戏库与本局生命周期；隐藏和返回游戏库时保留实例。 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getGame, getGames, registerBuiltinGames, type MiniGameDefinition } from '../games/index.ts'
import { GameLibrary } from './GameLibrary.tsx'

registerBuiltinGames()
const PREFIX = 'dsh-minigames:'
const MARGIN = 8
const LAUNCHER_SIZE = 46
interface Point { x: number; y: number }
type Dock = 'free' | 'left' | 'right'
function read(key: string): string | null {
  try { return localStorage.getItem(PREFIX + key) } catch { return null }
}
function save(key: string, value: string): void {
  try { localStorage.setItem(PREFIX + key, value) } catch { /* 存储不可用时仍可游玩。 */ }
}
// 旧版翻牌把未通关的过程分当作纪录；保留旧数据，通关成绩独立累计。
function bestKey(id: string): string { return id === 'memory' ? 'best:memory:completed' : 'best:' + id }
function readPoint(key: string): Point | null {
  try {
    const value = JSON.parse(read(key) ?? 'null') as Point | null
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null
  } catch { return null }
}
function clampWidth(value: number): number {
  const max = Math.max(0, window.innerWidth - MARGIN * 2)
  return Math.min(Math.max(value, Math.min(360, max)), max)
}
function panelHeight(): number { return Math.min(720, Math.max(360, window.innerHeight * .78), window.innerHeight - MARGIN * 2) }
function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: Math.max(MARGIN, Math.min(point.x, window.innerWidth - width - MARGIN)),
    y: Math.max(MARGIN, Math.min(point.y, window.innerHeight - height - MARGIN)),
  }
}
function Controller(): ReactNode {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 7h8c3 0 4 3 5 9 .5 3-2 4-4 1l-2-2H9l-2 2c-2 3-4.5 2-4-1C4 10 5 7 8 7Z"/><path d="M6 11h6m-3-3v6m7-3h.01m2 2h.01"/></svg>
}

export function MiniGamePanel(): ReactNode {
  const [open, setOpen] = useState(() => read('open') === '1')
  const [theme, setTheme] = useState(() => read('theme') === 'light' ? 'light' : 'dark')
  const [gameId, setGameId] = useState<string | null>(null)
  const [library, setLibrary] = useState(true)
  const [pendingGame, setPendingGame] = useState<string | null>(null)
  const [width, setWidth] = useState(() => clampWidth(Number(read('width')) || 600))
  const [height, setHeight] = useState(panelHeight)
  const [pos, setPos] = useState(() => clampPoint(readPoint('pos') ?? { x: window.innerWidth - width - 16, y: 64 }, width, height))
  const [dock, setDock] = useState<Dock>(() => { const value = read('dock'); return value === 'left' || value === 'right' ? value : 'free' })
  const [launcher, setLauncher] = useState(() => clampPoint(readPoint('launcher') ?? { x: window.innerWidth - 64, y: window.innerHeight - 64 }, LAUNCHER_SIZE, LAUNCHER_SIZE))
  const [best, setBest] = useState<Record<string, number>>(() => Object.fromEntries(getGames().map(game => {
    const score = Number(read(bestKey(game.id)))
    return [game.id, Number.isFinite(score) && score >= 0 ? score : 0]
  })))
  const panelRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const dragCleanup = useRef<(() => void) | null>(null)
  const suppressClick = useRef(false)
  const current = gameId ? getGame(gameId) : undefined

  useEffect(() => () => dragCleanup.current?.(), [])
  useEffect(() => {
    const resize = (): void => {
      const w = clampWidth(width)
      const h = panelHeight()
      setWidth(w); setHeight(h)
      setPos(previous => clampPoint({ ...previous, x: dock === 'left' ? MARGIN : dock === 'right' ? window.innerWidth - w - MARGIN : previous.x }, w, h))
      setLauncher(previous => clampPoint(previous, LAUNCHER_SIZE, LAUNCHER_SIZE))
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [width, dock])
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(library
        ? '.dmg-continue, .dmg-filters button'
        : '.dmg-pause-overlay button') ?? panelRef.current?.querySelector<HTMLElement>('[data-dmg-host]')
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, library])

  const toggleOpen = (value: boolean): void => {
    setOpen(value); save('open', value ? '1' : '0')
    if (!value) requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }))
  }
  const choose = (id: string): void => {
    if (current && current.id !== id) { setPendingGame(id); return }
    setGameId(id); setLibrary(false); save('game', id)
  }
  const setPosition = (next: Point): void => { setPos(next); save('pos', JSON.stringify(next)) }
  const setDockTo = (next: Dock): void => {
    setDock(next); save('dock', next)
    setPosition(clampPoint({ x: next === 'left' ? MARGIN : next === 'right' ? window.innerWidth - width - MARGIN : pos.x, y: pos.y }, width, height))
  }
  const drag = (event: React.PointerEvent, kind: 'window' | 'launcher' | 'resize'): void => {
    if (event.button !== 0 || (kind === 'window' && (event.target as HTMLElement).closest('button, select'))) return
    event.preventDefault()
    dragCleanup.current?.()
    const start = { x: event.clientX, y: event.clientY }
    const origin = kind === 'launcher' ? launcher : pos
    let moved = false
    let latest = origin
    let latestWidth = width
    const move = (next: PointerEvent): void => {
      const dx = next.clientX - start.x, dy = next.clientY - start.y
      moved ||= Math.abs(dx) > 5 || Math.abs(dy) > 5
      if (!moved) return
      if (kind === 'resize') {
        latestWidth = clampWidth(width + (dock === 'left' ? dx : -dx))
        latest = clampPoint({ x: dock === 'left' ? origin.x : origin.x + width - latestWidth, y: origin.y }, latestWidth, height)
        setWidth(latestWidth); setPos(latest)
      } else if (kind === 'launcher') {
        latest = clampPoint({ x: origin.x + dx, y: origin.y + dy }, LAUNCHER_SIZE, LAUNCHER_SIZE)
        setLauncher(latest)
      } else {
        latest = clampPoint({ x: origin.x + dx, y: origin.y + dy }, width, height)
        setPos(latest)
      }
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      dragCleanup.current = null
    }
    const finish = (up: PointerEvent): void => {
      move(up); cleanup()
      if (!moved) return
      if (kind === 'launcher') { suppressClick.current = true; save('launcher', JSON.stringify(latest)) }
      else {
        if (kind === 'window') {
          const nextDock = up.clientX < 24 ? 'left' : up.clientX > window.innerWidth - 24 ? 'right' : 'free'
          setDock(nextDock); save('dock', nextDock)
          if (nextDock !== 'free') latest.x = nextDock === 'left' ? MARGIN : window.innerWidth - width - MARGIN
        }
        setPosition(latest); save('width', String(latestWidth))
      }
    }
    const cancel = (): void => { cleanup(); if (kind === 'launcher') setLauncher(origin); else { setPos(origin); setWidth(width) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    dragCleanup.current = cleanup
  }

  return <>
    {!open && <button ref={launcherRef} type="button" className="dmg-launcher" data-theme={theme} style={{ left: launcher.x, top: launcher.y }} aria-label="打开小游戏" title="小游戏 · 拖动可移动" onPointerDown={event => { suppressClick.current = false; drag(event, 'launcher') }} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } toggleOpen(true) }}><Controller /></button>}
    <section ref={panelRef} className="dmg-float" aria-label="小游戏" hidden={!open} style={{ left: pos.x, top: pos.y, width, height }} data-dock={dock} data-theme={theme}>
      <header className="dmg-header" onPointerDown={event => drag(event, 'window')}>
        <span className="dmg-title"><Controller />小游戏</span>
        <div className="dmg-header-actions">
          <button type="button" className="dmg-theme" aria-label={theme === 'dark' ? '切换到白天主题' : '切换到夜间主题'} title={theme === 'dark' ? '切换到白天主题' : '切换到夜间主题'} onClick={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); save('theme', next) }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />}</svg>
            {theme === 'dark' ? '白天' : '夜间'}
          </button>
          <label className="dmg-dock"><span className="dmg-sr-only">窗口位置</span><select aria-label="窗口位置" value={dock} onChange={event => setDockTo(event.target.value as Dock)}><option value="free">浮动窗口</option><option value="left">靠左停放</option><option value="right">靠右停放</option></select></label>
          <button type="button" className="dmg-close" aria-label="隐藏小游戏" title="隐藏，保留本局" onClick={() => toggleOpen(false)}>×</button>
        </div>
      </header>
      <div className="dmg-body">
        {library && <GameLibrary games={getGames()} best={best} current={current} onSelect={choose} onContinue={() => setLibrary(false)} />}
        {current && <GameArea key={current.id} game={current} visible={open && !library} best={best[current.id] ?? 0} onBack={() => setLibrary(true)} onScore={score => {
          if (!Number.isFinite(score) || score < 0) return
          setBest(previous => { if (score <= (previous[current.id] ?? 0)) return previous; save(bestKey(current.id), String(score)); return { ...previous, [current.id]: score } })
        }} />}
      </div>
      <div className="dmg-resize" role="separator" tabIndex={0} aria-label="调整游戏窗口宽度" aria-orientation="vertical" aria-valuenow={Math.round(width)} aria-valuemin={Math.min(360, window.innerWidth - 16)} aria-valuemax={window.innerWidth - 16} onPointerDown={event => drag(event, 'resize')} onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const next = clampWidth(width + (event.key === 'ArrowRight' ? 32 : -32))
        setWidth(next); save('width', String(next))
        setPosition(clampPoint({ x: dock === 'left' ? pos.x : pos.x + width - next, y: pos.y }, next, height))
      }} />
      {pendingGame && <Confirm title="切换游戏？" description="当前这一局会结束，最高分仍会保留。" confirm="切换游戏" onCancel={() => setPendingGame(null)} onConfirm={() => { setGameId(pendingGame); save('game', pendingGame); setPendingGame(null); setLibrary(false) }} />}
    </section>
  </>
}

function Confirm({ title, description, confirm, onCancel, onConfirm }: { title: string; description: string; confirm: string; onCancel: () => void; onConfirm: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector('button')?.focus()
    return () => previous?.focus({ preventScroll: true })
  }, [])
  return <div className="dmg-dialog-backdrop"><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="dmg-dialog" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onCancel() }
    if (event.key === 'Tab') {
      const buttons = ref.current?.querySelectorAll('button')
      if (buttons && ((event.shiftKey && document.activeElement === buttons[0]) || (!event.shiftKey && document.activeElement === buttons[1]))) { event.preventDefault(); buttons[event.shiftKey ? 1 : 0]?.focus() }
    }
  }}><h2>{title}</h2><p>{description}</p><div><button type="button" className="dmg-button" onClick={onCancel}>取消</button><button type="button" className="dmg-button dmg-primary" onClick={onConfirm}>{confirm}</button></div></div></div>
}

function GameArea({ game, visible, best, onBack, onScore }: { game: MiniGameDefinition; visible: boolean; best: number; onBack: () => void; onScore: (score: number) => void }): ReactNode {
  const areaRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<ReturnType<MiniGameDefinition['create']> | null>(null)
  const restartAction = useRef<(() => void) | undefined>(undefined)
  const scoreCallback = useRef(onScore)
  scoreCallback.current = onScore
  const [paused, setPaused] = useState(true)
  const [started, setStarted] = useState(false)
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [restart, setRestart] = useState(false)
  const [help, setHelp] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    try {
      const instance = game.create(host, {
        onScore: value => { setScore(value); scoreCallback.current(value) },
        onPauseRequest: () => { setStarted(true); setPaused(previous => !previous) },
        onRestartRequest: action => { restartAction.current = action; setPaused(true); setRestart(true) },
      })
      instanceRef.current = instance
      instance.pause()
      return () => { instance.destroy(); instanceRef.current = null }
    } catch { setError(true) }
  }, [game, round])
  useEffect(() => {
    if (!visible || paused || restart) instanceRef.current?.pause()
    else { instanceRef.current?.resume(); hostRef.current?.focus({ preventScroll: true }) }
  }, [visible, paused, restart, round])
  useEffect(() => {
    const pause = (): void => setPaused(true)
    const visibility = (): void => { if (document.hidden) pause() }
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  useEffect(() => { if (!visible) setPaused(true) }, [visible])
  const play = (): void => { setStarted(true); setPaused(false) }
  const requestRestart = (): void => { restartAction.current = undefined; setPaused(true); setRestart(true) }
  return <div ref={areaRef} className="dmg-game-area" hidden={!visible} onKeyDownCapture={event => {
    // 画布快捷键由游戏通过回调上报；工具栏聚焦时也可以使用 P / R。
    if (hostRef.current?.contains(event.target as Node)) return
    if (restart || event.ctrlKey || event.metaKey || event.altKey || !['KeyP', 'KeyR'].includes(event.code)) return
    event.preventDefault(); event.stopPropagation()
    if (event.repeat) return
    if (event.code === 'KeyP') { setStarted(true); setPaused(value => !value) }
    else requestRestart()
  }} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(true)
  }}>
    <div className="dmg-game-toolbar"><button type="button" className="dmg-button dmg-back" onClick={onBack}>← 游戏库</button><strong>{game.title}</strong><button type="button" className="dmg-button dmg-help" aria-expanded={help} onClick={() => setHelp(value => !value)}>玩法</button></div>
    <div className="dmg-game-stats"><span>本局 <b>{score}</b></span><span>最佳 <b>{best}</b></span><span className="dmg-game-status" role="status">{!started ? '准备开始' : paused ? '已暂停' : '游戏中'}</span></div>
    <div className="dmg-stage">
      <div ref={hostRef} className="dmg-game-host" tabIndex={0} data-dmg-host aria-label={`${game.title}游戏区域`} />
      {(paused || error) && <div className="dmg-pause-overlay"><div><h2>{error ? '游戏暂时无法加载' : !started ? game.title : '休息一下'}</h2><p>{error ? '可以重试，或返回游戏库选择其他游戏。' : !started ? game.description : '本局已暂停，准备好再继续。'}</p>{!error && <button type="button" className="dmg-button dmg-primary" onClick={play}>{started ? '继续游戏' : '开始游戏'}</button>}</div></div>}
    </div>
    {help && <div className="dmg-game-controls" aria-label="游戏玩法">{game.controls.filter(control => !/^[PR]：/.test(control)).map(control => <span key={control}>{control}</span>)}<span>P 暂停 / 继续 · R 重新开始</span></div>}
    <div className="dmg-game-footer"><span>{help ? '点击“玩法”可收起说明' : (game.controls.find(control => !/^[PR]：/.test(control)) ?? '点击游戏区域操作')}</span><div><button type="button" className="dmg-button" onClick={requestRestart}>重新开始</button><button type="button" className="dmg-button" disabled={error} onClick={() => paused ? play() : setPaused(true)}>{paused ? started ? '继续' : '开始' : '暂停'}</button></div></div>
    {restart && <Confirm title="重新开始这一局？" description="当前进度会清除，最高分仍会保留。" confirm="重新开始" onCancel={() => { restartAction.current = undefined; setRestart(false) }} onConfirm={() => {
      const action = restartAction.current ?? instanceRef.current?.restart
      restartAction.current = undefined
      setRestart(false); setPaused(true); setStarted(false); setError(false); setScore(0)
      if (action) { action(); instanceRef.current?.pause() }
      else setRound(value => value + 1)
    }} />}
  </div>
}
