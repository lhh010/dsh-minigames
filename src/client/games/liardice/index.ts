/**
 * 吹牛骰游戏定义：把纯逻辑接成 {@link MiniGameInstance}——↑/↓ 调数量、
 * ←/→ 调点数、Enter 出价/续局、L 叫吹牛、R 重开（换新种子）、P 暂停；
 * 数量/点数选择器与出价、吹牛大按钮均可点击。回合制 dirty 帧循环：
 * 输入、AI 思考倒计时与开骰翻面动画期间重绘；局分经 onScore 上报
 * （每局 100 分，夺冠再奖 300 + 剩余骰 × 10）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  createLiarDice, isLegalRaise, playerBid, playerCallLiar, aiTurn, startNextRound,
  type Bid, type LiarDiceState,
} from './logic.ts'
import { W, H, hitTest, renderLiarDice } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { THEME, createParticles } from '../theme.ts'

/** 初始种子（R 重开时按重开次数偏移换新序列）。 */
const BASE_SEED = 20261116
/** AI 思考展示时长（秒）。 */
const AI_THINK_S = 0.9
/** 开骰翻面动画速率（每秒进度）。 */
const REVEAL_SPEED = 1.5

function createLiarDiceGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: liardice needs a 2d canvas context')
  const ctx = fit.ctx

  let gameNo = 0
  let state: LiarDiceState = createLiarDice(BASE_SEED)
  let selected: Bid = { count: 1, face: 4 }
  let running = false
  let paused = false
  let lastScore = -1
  let lastLogLen = 0
  let reveal = 0
  let aiTimer = 0
  const particles = createParticles()

  /** 局分上报：每局 100 分，夺冠再奖 300 + 剩余骰 × 10。 */
  const reportScore = (): void => {
    const score = state.roundWinsYou * 100
      + (state.phase === 'matchOver' && state.matchWinner === 'you' ? 300 + state.yourDice.length * 10 : 0)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 事件侦测：新开骰触发翻面动画与粒子，局/比赛结束触发上报。 */
  const detectEvents = (): void => {
    if (state.log.length === lastLogLen) return
    const fresh = state.log.slice(lastLogLen)
    lastLogLen = state.log.length
    if (fresh.some(e => e.kind === 'challenge')) {
      reveal = 0
      particles.burst(W / 2, 200, THEME.gold, 16, 150)
    }
    reportScore()
  }

  /** 选择器归一：相对当前出价保持合法抬升（非法则抬数量）。 */
  const normalizeSelected = (): void => {
    const maxCount = state.yourDice.length + state.aiDice.length
    if (selected.count > maxCount) selected.count = maxCount
    while (!isLegalRaise(state.currentBid, selected) && selected.count <= maxCount + 6) {
      selected.count += 1
    }
  }

  /** 动画与 AI 推进（每帧调用）：翻面动画、AI 思考倒计时、粒子。 */
  const tickAnimations = (dt: number): boolean => {
    let animating = false
    if (state.lastChallenge !== null && reveal < 1) {
      reveal = Math.min(1, reveal + dt * REVEAL_SPEED)
      animating = true
    }
    if (state.lastChallenge === null) reveal = 0
    if (state.phase === 'bidding' && state.turn === 'ai' && reveal >= 1) {
      // 关键：先标记脏——dirty 模式下未置脏的帧不会回调（AI 思考倒计时
      // 因此永不推进，永久卡在「对方思考中…」）。
      loop.markDirty()
      aiTimer += dt
      animating = true
      if (aiTimer >= AI_THINK_S) {
        aiTimer = 0
        aiTurn(state)
        detectEvents()
      }
    } else {
      aiTimer = 0
    }
    if (particles.size() > 0) animating = true
    return animating
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const animating = tickAnimations(f.dt)
    if (f.render || animating) {
      renderLiarDice(ctx, { state, selected, reveal, paused: false })
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  /** 统一的输入出口：回合与动画闸门通过后执行并置脏。 */
  const act = (fn: () => void): void => {
    if (!running || paused) return
    if (state.phase === 'bidding' && state.turn !== 'you') return
    if (state.lastChallenge !== null && reveal < 1) return
    fn()
    detectEvents()
    normalizeSelected()
    loop.markDirty()
  }

  /** 出价确认 / 续局。 */
  const doConfirm = (): void => {
    if (state.phase === 'roundOver') {
      startNextRound(state)
      return
    }
    if (state.phase === 'bidding') playerBid(state, selected.count, selected.face)
  }

  const doLiar = (): void => { playerCallLiar(state) }

  const doCount = (d: number): void => {
    const maxCount = state.yourDice.length + state.aiDice.length
    selected.count = Math.max(1, Math.min(maxCount, selected.count + d))
    normalizeSelected()
  }

  const doFace = (d: number): void => {
    selected.face = Math.max(1, Math.min(6, selected.face + d))
    normalizeSelected()
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (!running || paused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    const region = hitTest(x, y, state.yourDice.length + state.aiDice.length)
    if (region === null) return
    if (region.kind === 'next') {
      act(() => { startNextRound(state) })
    } else if (region.kind === 'count') {
      if (state.phase === 'bidding' && state.turn === 'you' && reveal >= 1) {
        act(() => { selected.count = region.value; normalizeSelected() })
      }
    } else if (region.kind === 'face') {
      if (state.phase === 'bidding' && state.turn === 'you' && reveal >= 1) {
        act(() => { selected.face = region.value; normalizeSelected() })
      }
    } else if (region.kind === 'liar') {
      act(doLiar)
    } else if (region.kind === 'confirm') {
      act(doConfirm)
    }
  }

  const reset = (): void => {
    gameNo += 1
    state = createLiarDice((BASE_SEED + gameNo * 0x9e3779b9) >>> 0)
    selected = { count: 1, face: 4 }
    lastLogLen = 0
    reveal = 0
    aiTimer = 0
    paused = false
    reportScore()
    loop.markDirty()
    renderLiarDice(ctx, { state, selected, reveal: 0, paused: false })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowUp':
        event.preventDefault()
        if (state.phase === 'bidding' && state.turn === 'you') act(() => { doCount(1) })
        break
      case 'ArrowDown':
        event.preventDefault()
        if (state.phase === 'bidding' && state.turn === 'you') act(() => { doCount(-1) })
        break
      case 'ArrowRight':
        event.preventDefault()
        if (state.phase === 'bidding' && state.turn === 'you') act(() => { doFace(1) })
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (state.phase === 'bidding' && state.turn === 'you') act(() => { doFace(-1) })
        break
      case 'KeyL':
        event.preventDefault()
        act(doLiar)
        break
      case 'Enter':
      case 'NumpadEnter':
        event.preventDefault()
        act(doConfirm)
        break
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
  }

  const pause = (): void => {
    if (!running) return
    paused = true
    running = false
    loop.pause()
    renderLiarDice(ctx, { state, selected, reveal, paused: true })
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.markDirty()
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  reportScore()
  loop.start()
  renderLiarDice(ctx, { state, selected, reveal: 0, paused: false })

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const liardiceGame: MiniGameDefinition = {
  id: 'liardice',
  title: '吹牛骰 LiarDice',
  icon: '🤥',
  description: '每人五颗骰子暗掷——报数可以吹牛，被抓就输一颗，谁先看穿谁赢。',
  controls: [
    '↑/↓：数量 · ←/→：点数 · Enter：出价 / 下一局 · L：叫吹牛',
    '点击数量与点数选择器、出价与吹牛大按钮亦可',
    'R：重开 · P：暂停',
  ],
  create: createLiarDiceGame,
}
