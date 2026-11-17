/**
 * 魔方游戏定义：把纯逻辑（./logic.ts）接入 {@link MiniGameInstance}。
 * 点击展开图上的行/列箭头拧层（每面 3 行 3 列，双向）；H 提示 = 按全部
 * 历史的逆序回拧一步（applyHint，上限 3 次，沿提示必达复原）；R 重开
 * 新打乱；P 暂停。六面纯色即过关：粒子庆祝、onScore 上报关卡，1.8s 后
 * 进入下一关（5 关递进，打乱步数 6→12）。dirty 调度：静态时零重绘，
 * 拧动动画与计时秒跳期间逐帧。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { applyHint, hintMove, newGame, userMove, layerIndices, type Move, type RubikState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, arrowAt, renderRubik, type AnimInfo, type RenderState } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const ADVANCE_MS = 1800
const ANIM_MS = 260
const MAX_LEVEL = 5
const LS_REACHED = 'dsh-minigames:rubik:reached'

/** 一次进行中的拧动动画（info 快照给渲染器）。 */
interface Anim {
  info: AnimInfo
  elapsed: number
}

function createRubikGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: rubik needs a 2d canvas context')
  const ctx = fit.ctx

  // 最高到达关卡持久化：重进游戏从上次进度继续（每关 seed 确定）。
  const readReached = (): number => {
    try {
      const saved = window.localStorage.getItem(LS_REACHED)
      if (saved !== null) {
        const n = Number(saved)
        if (Number.isFinite(n) && n >= 1) return Math.min(MAX_LEVEL, Math.floor(n))
      }
    } catch { /* storage unavailable */ }
    return 1
  }

  let level = readReached()
  let restartCount = 0
  // 关卡 seed 确定；R 重开时叠加重启计数 → 新打乱但仍可复现（随机全走 seed）。
  const seedFor = (): number => (level * 0x9e3779b9 + restartCount * 0x85ebca6b) >>> 0
  let state: RubikState = newGame(seedFor(), level)
  let winText: string | null = null
  let running = false
  let elapsedMs = 0
  let shownSecond = -1
  let anim: Anim | null = null
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

  const startLevel = (next: number, freshScramble: boolean): void => {
    level = next
    if (freshScramble) restartCount += 1
    state = newGame(seedFor(), level)
    winText = null
    elapsedMs = 0
    shownSecond = -1
    anim = null
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(Math.min(MAX_LEVEL, level + 1), true)
    }, delayMs)
  }

  /** 过关处理：庆祝文本、粒子、分数上报与自动进关（暂停中推迟）。 */
  const onSolved = (): void => {
    const sec = Math.floor(elapsedMs / 1000)
    const mm = String(Math.floor(sec / 60)).padStart(2, '0')
    const ss = String(sec % 60).padStart(2, '0')
    winText = '步数 ' + state.moves + ' · 打乱参考 ' + state.scramble.length + ' · 用时 ' + mm + ':' + ss
    try { window.localStorage.setItem(LS_REACHED, String(Math.min(MAX_LEVEL, level + 1))) } catch { /* storage unavailable */ }
    reportScore()
    particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 26, 190)
    for (const color of THEME.accents) particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, color, 6, 150)
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS // 暂停中过关：恢复时再计时
  }

  /** 玩家拧一层（箭头点击）：动画沿箭头方向滚动高亮。 */
  const doMove = (move: Move, dx: number, dy: number): void => {
    if (state.solved) return
    const prev = state
    state = userMove(state, move.id, move.turns)
    anim = { info: { indices: new Set<number>(layerIndices(move.id)), phase: 0, dx, dy, moveId: move.id }, elapsed: 0 }
    loop.markDirty()
    if (state.solved && !prev.solved) onSolved()
  }

  /** H 提示：applyHint 弹掉历史末条并施加其逆（无方向滚动脉冲，仅高亮）。 */
  const hint = (): void => {
    if (!running || state.solved) return
    const move = hintMove(state)
    if (move === null || state.hintsUsed >= state.maxHints) return
    state = applyHint(state)
    anim = { info: { indices: new Set<number>(layerIndices(move.id)), phase: 0, dx: 0, dy: 0, moveId: move.id }, elapsed: 0 }
    loop.markDirty()
    if (state.solved) onSolved()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.solved) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const arrow = arrowAt(x, y)
    if (arrow === null) return
    doMove(arrow.move, arrow.axis === 'row' ? arrow.dir * 5 : 0, arrow.axis === 'col' ? arrow.dir * 5 : 0)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level, true) // 新打乱：重启计数推进 seed
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      hint()
    }
  }

  const toRenderState = (paused: boolean): RenderState => ({
    cube: state.cube,
    level: state.level,
    scrambleLen: state.scramble.length,
    moves: state.moves,
    hintsLeft: state.maxHints - state.hintsUsed,
    elapsedMs,
    paused,
    winText,
  })

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (!state.solved) elapsedMs += f.dt * 1000
    if (anim !== null) {
      anim.elapsed += f.dt * 1000
      anim.info.phase = Math.min(1, anim.elapsed / ANIM_MS)
      if (anim.info.phase >= 1) anim = null
      loop.markDirty()
    }
    const second = Math.floor(elapsedMs / 1000)
    if (second !== shownSecond) {
      shownSecond = second
      loop.markDirty()
    }
    if (!f.render && particles.size() === 0 && anim === null) return
    renderRubik(ctx, LOGICAL_W, LOGICAL_H, toRenderState(false), anim === null ? null : anim.info)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderRubik(ctx, LOGICAL_W, LOGICAL_H, toRenderState(true), null)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const rubikGame: MiniGameDefinition = {
  id: 'rubik',
  title: '魔方 Rubik',
  icon: '🎦',
  description: '拧动层复原六面颜色——状态空间天文数字，但你只需一步一步。',
  controls: ['点击行列箭头：拧动该层', 'H：提示（逆序回拧，限 3 次）', 'R：重开新打乱', 'P：暂停'],
  create: createRubikGame,
}
