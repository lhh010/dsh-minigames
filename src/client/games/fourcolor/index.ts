/**
 * 四色地图游戏定义：把纯逻辑接成 MiniGameInstance——点击区域以当前色
 * 涂色并选中、点击色板 / 数字键换当前色（有选中区域时同步改涂）、右键
 * 清除；H 提示（限 2 次，金边闪示）、R 以同 seed 重开本关、P 暂停。
 * 过关时全图渐变亮起，随后过关 overlay 并自动进入下一关。盘面静态，走
 * dirty 调度；冲突红边闪烁与过关动画期间持续标脏。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVEL_COUNT, clearRegion, conflicts, createState, giveHint, isComplete, paintRegion,
} from './logic.ts'
import {
  LOGICAL_H, LOGICAL_W, paletteAt, regionAt, renderFourColor, type FourColorUi,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 过关动画时长。 */
const WIN_ANIM_MS = 1300
/** 过关 overlay 停留后进入下一关的延时。 */
const ADVANCE_MS = 2800

/** 每关固定 seed：同关重开完全一致，可重放。 */
function levelSeed(level: number): number {
  return (Math.imul(level, 0x9e3779b9) ^ 0x51ed270b) >>> 0
}

function createFourColorGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: fourcolor needs a 2d canvas context')
  const ctx = fit.ctx

  // 关卡进度持久化：再次进入从最高到达关继续。
  const LS_REACHED = 'dsh-minigames:fourcolor:reached'
  const readReached = (): number => {
    try {
      const saved = window.localStorage.getItem(LS_REACHED)
      if (saved !== null) {
        const n = Number(saved)
        if (Number.isFinite(n) && n >= 1) return Math.min(LEVEL_COUNT, Math.floor(n))
      }
    } catch { /* localStorage 不可用 */ }
    return 1
  }
  const saveReached = (lv: number): void => {
    try { window.localStorage.setItem(LS_REACHED, String(Math.min(LEVEL_COUNT, lv))) } catch { /* localStorage 不可用 */ }
  }

  let level = readReached()
  let state = createState(levelSeed(level), level)
  let activeColor = 0
  let selected: number | null = null
  let paused = false
  let winAnimStart: number | null = null
  let winText: string | null = null
  let hintFlash: { region: number; untilMs: number } | null = null
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next
    state = createState(levelSeed(level), level)
    activeColor = 0
    selected = null
    winAnimStart = null
    winText = null
    hintFlash = null
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel((level % LEVEL_COUNT) + 1)
    }, delayMs)
  }

  /** 过关处理：亮起动画 + 计分 + 定时进入下一关。 */
  const handleWin = (): void => {
    winAnimStart = performance.now()
    winText = '换色 ' + state.repaints + ' 次 · 提示 ' + state.hintsUsed + '/2'
    saveReached(level + 1)
    reportScore()
    particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 18, 170)
    if (!paused) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS // 暂停中过关：恢复时再挂定时器
    loop.markDirty()
  }

  const afterMove = (x: number, y: number): void => {
    if (isComplete(state)) handleWin()
    else {
      const flags = conflicts(state)
      const color = flags.some(Boolean) ? THEME.bad : regionColorOf()
      particles.burst(x, y, color, 4, 80)
    }
    loop.markDirty()
  }

  /** 当前色的主题色（粒子用）。 */
  const regionColorOf = (): string => {
    const picks = [THEME.accents[0], THEME.accents[1], THEME.accents[2], THEME.accents[4]]
    const idx = Math.min(Math.max(0, activeColor), picks.length - 1)
    return activeColor < state.map.paletteSize ? picks[idx]! : THEME.text
  }

  const toLogical = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (paused || winText !== null) return
    if (event.button !== 0) return
    const { x, y } = toLogical(event)
    const palette = paletteAt(x, y, state.map.paletteSize)
    if (palette !== null) {
      activeColor = palette
      if (selected !== null) {
        const region = selected
        state = paintRegion(state, region, palette)
        afterMove(x, y)
        return
      }
      loop.markDirty()
      return
    }
    const cell = regionAt(x, y)
    if (cell !== null) {
      const region = state.map.cellRegion[cell]!
      selected = region
      state = paintRegion(state, region, activeColor)
      afterMove(x, y)
    }
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    if (paused || winText !== null) return
    const { x, y } = toLogical(event)
    const cell = regionAt(x, y)
    if (cell !== null) {
      state = clearRegion(state, state.map.cellRegion[cell]!)
      loop.markDirty()
    }
  }

  const useHint = (): void => {
    if (paused || winText !== null) return
    const hint = giveHint(state)
    if (hint === null) return
    state = hint.state
    selected = hint.region
    activeColor = hint.color
    hintFlash = { region: hint.region, untilMs: performance.now() + 1400 }
    afterMove(LOGICAL_W / 2, HUD_Y_BOARD / 2)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      useHint()
    } else if (/^Digit[1-9]$/.test(event.code)) {
      event.preventDefault()
      if (paused || winText !== null) return
      const digit = Number(event.code.slice(5))
      if (digit >= 1 && digit <= state.map.paletteSize) {
        activeColor = digit - 1
        if (selected !== null) {
          state = paintRegion(state, selected, activeColor)
          afterMove(LOGICAL_W / 2, LOGICAL_H / 2)
          return
        }
        loop.markDirty()
      }
    }
  }

  const buildUi = (nowMs: number): FourColorUi => {
    let winProgress: number | null = null
    if (winAnimStart !== null) {
      const p = (nowMs - winAnimStart) / WIN_ANIM_MS
      winProgress = Math.min(1, p)
      if (winProgress >= 1) winProgress = 1
    }
    return {
      activeColor,
      selected,
      paused,
      level,
      nowMs,
      winProgress,
      winText: winProgress !== null && winProgress >= 1 ? winText : null,
      hintFlash,
    }
  }

  const animating = (nowMs: number): boolean => {
    if (winAnimStart !== null && nowMs - winAnimStart < WIN_ANIM_MS) return true
    if (conflicts(state).some(Boolean)) return true
    if (hintFlash !== null && nowMs < hintFlash.untilMs) return true
    return false
  }

  const frame = (f: FrameInfo): void => {
    if (paused) return
    const nowMs = performance.now()
    const busy = animating(nowMs)
    if (!f.render && !busy && particles.size() === 0) return
    if (busy) loop.markDirty()
    renderFourColor(ctx, LOGICAL_W, LOGICAL_H, state, buildUi(nowMs))
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (paused) return
    paused = true
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderFourColor(ctx, LOGICAL_W, LOGICAL_H, state, buildUi(performance.now()))
  }
  const resume = (): void => {
    if (!paused) return
    paused = false
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.start()
    loop.markDirty()
  }
  const togglePause = (): void => {
    if (paused) resume()
    else pause()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      paused = true
      loop.destroy()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

/** 盘面纵向下偏移（提示粒子落点用）。 */
const HUD_Y_BOARD = 30 + 360

export const fourcolorGame: MiniGameDefinition = {
  id: 'fourcolor',
  title: '四色地图 FourColor',
  icon: '🌐',
  description: '相邻区域不能同色——只用四种颜色涂满整张地图，一笔都不能错。',
  controls: ['点击区域：选中并涂当前色', '点击色板 / 数字键：选色', '右键：清除区域颜色', 'H：提示（限 2 次）', 'R：重开本关 · P：暂停'],
  create: createFourColorGame,
}
