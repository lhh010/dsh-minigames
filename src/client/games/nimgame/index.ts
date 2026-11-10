/**
 * 取子博弈 Nim 游戏定义：把纯逻辑接成 {@link MiniGameInstance}。交互：
 * 点击一排选中（高亮 + 每根火柴可点），点击选中排的第 n 根（从右数）
 * 即取 n 根；←→/AD 选排、↑↓/数字 1-7 调取子数、回车/空格确认。AI 回合
 * 带思考动画（900ms，暂停时冻结剩余量）。玩家赢局按「底分 10 + AI 本
 * 局取走的火柴数」计分并上报 onScore，5 局一赛后展示总况 overlay。
 * R 重开整赛（新种子）、P 暂停。dirty 渲染：AI 思考 / 结果动画 / 粒子
 * 期间逐帧，静止时零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  AI_MISTAKE_RATE, GAMES_PER_MATCH, aiChoose, createRound, mulberry32, take, winScore,
  type NimState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderNim, stickAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** AI 思考延迟：给回合指示动画留出播放窗口。 */
const AI_THINK_MS = 900
/** 本局结果 overlay 停留时长，随后进入下一局或全赛总况。 */
const ADVANCE_MS = 1800
/** 取子数上限（每排最多 7 根）。 */
const MAX_TAKE = 7

interface Pending {
  kind: 'ai' | 'advance'
  timer: number
  at: number
}

function createNimGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: nimgame needs a 2d canvas context')
  const ctx = fit.ctx

  let rng = mulberry32((Math.random() * 0x7fffffff) | 0)
  let state = createRound(rng)
  let roundNo = 1
  let wins = 0
  let score = 0
  let lastReported = -1
  let selectedRow: number | null = null
  let previewCount: number | null = null
  let hover: { row: number, count: number } | null = null
  let aiThinking = false
  let roundText: string | null = null
  let matchText: string | null = null
  let running = false
  let pending: Pending | null = null
  let pendingRemaining = 0
  const particles = createParticles()

  const reportScore = (): void => {
    if (score === lastReported) return
    lastReported = score
    options?.onScore?.(score)
  }

  const clearPending = (): void => {
    if (pending !== null) {
      clearTimeout(pending.timer)
      pending = null
    }
    pendingRemaining = 0
  }

  const schedule = (kind: 'ai' | 'advance', delayMs: number): void => {
    const timer = window.setTimeout(() => {
      pending = null
      if (kind === 'ai') playAiMove()
      else advanceRound()
    }, delayMs)
    pending = { kind, timer, at: performance.now() + delayMs }
  }

  const startMatch = (): void => {
    clearPending()
    rng = mulberry32((Math.random() * 0x7fffffff) | 0)
    state = createRound(rng)
    roundNo = 1
    wins = 0
    score = 0
    selectedRow = null
    previewCount = null
    aiThinking = false
    roundText = null
    matchText = null
    reportScore()
    loop.markDirty()
  }

  /** 终局收尾：胜负 overlay、计分、粒子，并排定下一局/全赛总况。 */
  const finishRound = (finished: NimState): void => {
    state = finished
    aiThinking = false
    if (finished.loser === 'ai') {
      wins += 1
      const gained = winScore(finished.aiSticks)
      score += gained
      roundText = 'AI 被迫取到最后一根 · +' + String(gained) + ' 分'
      reportScore()
      particles.burst(LOGICAL_W / 2, 120, THEME.gold, 16, 150)
      particles.burst(LOGICAL_W / 2, 150, THEME.good, 10, 110)
    } else {
      roundText = '你取到了最后一根 · 本局不计分'
    }
    loop.markDirty()
    if (running) schedule('advance', ADVANCE_MS)
    else pendingRemaining = ADVANCE_MS
  }

  const advanceRound = (): void => {
    if (roundNo >= GAMES_PER_MATCH) {
      roundText = null
      matchText = String(wins) + ' 胜 ' + String(GAMES_PER_MATCH - wins) + ' 负 · 总分 ' + String(score)
      loop.markDirty()
      return
    }
    roundNo += 1
    state = createRound(rng)
    selectedRow = null
    previewCount = null
    roundText = null
    loop.markDirty()
  }

  /** 玩家走子：非法走法直接忽略（点击层已保证合法）。 */
  const playerTake = (row: number, count: number): void => {
    const next = take(state, row, count)
    if (next === null) return
    state = next
    selectedRow = null
    previewCount = null
    loop.markDirty()
    if (state.over) {
      finishRound(state)
      return
    }
    aiThinking = true
    loop.markDirty()
    if (running) schedule('ai', AI_THINK_MS)
    else pendingRemaining = AI_THINK_MS
  }

  const playAiMove = (): void => {
    const move = aiChoose(state.rows, rng, AI_MISTAKE_RATE)
    if (move === null) return
    const next = take(state, move.row, move.count)
    if (next === null) return
    state = next
    aiThinking = false
    loop.markDirty()
    if (state.over) finishRound(state)
  }

  /** 点击火柴：未选中该排时先选中并预览，已选中则按根数取子。 */
  const onStickHit = (hit: { row: number, count: number }): void => {
    if (state.over || state.turn !== 'player') return
    if (selectedRow !== hit.row) {
      selectedRow = hit.row
      previewCount = hit.count
      loop.markDirty()
      return
    }
    playerTake(hit.row, hit.count)
  }

  const onMouseMove = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = stickAt(x, y, state.rows)
    const next = hit !== null && !state.over && state.turn === 'player' ? hit : null
    if ((next === null) !== (hover === null) || (next !== null && hover !== null && (next.row !== hover.row || next.count !== hover.count))) {
      hover = next
      loop.markDirty()
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = stickAt(x, y, state.rows)
    if (hit !== null) onStickHit(hit)
  }

  /** 键盘选排：跳过空排与越界。 */
  const selectRow = (dir: number): void => {
    if (state.over || state.turn !== 'player') return
    const from = selectedRow === null ? (dir > 0 ? -1 : state.rows.length) : selectedRow
    for (let step = 1; step <= state.rows.length; step += 1) {
      const row = (from + dir * step + state.rows.length * 2) % state.rows.length
      if (state.rows[row]! > 0) {
        selectedRow = row
        previewCount = 1
        loop.markDirty()
        return
      }
    }
  }

  /** 键盘调取子数：钳制到选中排剩余数。 */
  const adjustPreview = (count: number): void => {
    if (selectedRow === null || state.over || state.turn !== 'player') return
    const max = state.rows[selectedRow]!
    previewCount = Math.max(1, Math.min(max, count))
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startMatch()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    } else if (!running) {
      return
    } else if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault()
      selectRow(-1)
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault()
      selectRow(1)
    } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault()
      adjustPreview((previewCount ?? 1) + 1)
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault()
      adjustPreview((previewCount ?? 1) - 1)
    } else if (event.code.startsWith('Digit')) {
      event.preventDefault()
      adjustPreview(Number(event.code.slice(5)))
    } else if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault()
      if (selectedRow !== null && previewCount !== null && previewCount <= MAX_TAKE) {
        playerTake(selectedRow, previewCount)
      }
    }
  }

  const draw = (): void => {
    renderNim(ctx, LOGICAL_W, LOGICAL_H, state, {
      selectedRow,
      hover,
      previewCount,
      score,
      roundNo,
      aiThinking,
      timeMs: performance.now(),
      paused: !running && matchText === null && roundText === null,
      roundText,
      matchText,
      hintOn: true,
    })
    particles.tick(ctx, 1 / 60 * 1000)
  }

  // 脏标记渲染：AI 思考动画 / 结果 overlay / 粒子期间逐帧重绘，静止零重绘。
  const loop = createFrameLoop(f => {
    const animating = aiThinking || roundText !== null || matchText !== null || particles.size() > 0
    if (f.render || animating) {
      draw()
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    if (pending !== null) {
      clearTimeout(pending.timer)
      pendingRemaining = Math.max(0, pending.at - performance.now())
      pending = null
    }
    loop.pause()
    loop.markDirty()
    draw()
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (pendingRemaining > 0) {
      const kind: 'ai' | 'advance' = aiThinking ? 'ai' : 'advance'
      schedule(kind, pendingRemaining)
      pendingRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
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
      clearPending()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const nimgameGame: MiniGameDefinition = {
  id: 'nimgame',
  title: '取子博弈 Nim',
  icon: '🎋',
  description: '轮流取子、拿到最后一根的输——算清异或你就立于不败。',
  controls: ['点击排再点第 n 根：取 n 根 · ←→/AD 选排 · ↑↓/1-7 调数 · 回车确认', 'R：重开整赛 · P：暂停'],
  create: createNimGame,
}
