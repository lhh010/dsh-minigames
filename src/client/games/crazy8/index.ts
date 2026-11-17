/**
 * 疯狂八号游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击手牌
 * 出牌（亮边为可出）、无牌可出点击牌堆摸牌（摸到可出的牌可打出或点
 * 牌堆放弃）、出 8 后按 1-4 或点击花色宣告、Enter 下一局、R 重开
 * （换新种子）、P 暂停。AI 回合在人类操作后同步结算；回合制 dirty
 * 帧循环：仅输入与局末粒子期间重绘；整场积分经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  aiTakeTurn, chooseSuit, createCrazy8, hasPlayable, matchScore, nextRound,
  passOrDraw, playCard, type Crazy8State,
} from './logic.ts'
import { H, W, hitDrawPile, hitHand, hitSuit, renderCrazy8 } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { THEME, createParticles } from '../theme.ts'

/** 初始种子（R 重开时按次数偏移换新牌局）。 */
const BASE_SEED = 20261117

function createCrazy8Game(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: crazy8 needs a 2d canvas context')
  const ctx = fit.ctx

  let gameNo = 0
  let state: Crazy8State = createCrazy8(BASE_SEED)
  let running = false
  let paused = false
  let lastScore = -1
  let lastRoundWinner: number | null = null
  const particles = createParticles()

  const reportScore = (): void => {
    const score = matchScore(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const renderView = (): void => {
    renderCrazy8(ctx, { state, paused })
  }

  /** 局末侦测：粒子庆祝（人类赢金色 / AI 赢不庆祝），分数上报。 */
  const detectRoundEnd = (): void => {
    if (state.roundWinner !== null && state.roundWinner !== lastRoundWinner) {
      lastRoundWinner = state.roundWinner
      if (state.roundWinner === 0) {
        particles.burst(W / 2, H / 2 - 40, state.matchWinner === 0 ? THEME.gold : THEME.good, 18, 160)
      }
    }
    reportScore()
  }

  /** AI 接管：人类行动结束后让 AI 连续行动（含被跳过后再次行动）。 */
  const ensureAi = (): void => {
    while (state.turn === 1 && state.roundWinner === null && state.matchWinner === null && !state.pendingSuitChoice) {
      aiTakeTurn(state)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (f.render || particles.size() > 0) {
      renderView()
      particles.tick(ctx, f.dt * 1000)
      if (particles.size() > 0) loop.markDirty()
    }
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  /** 统一输入出口：执行动作 → AI 接管 → 局末侦测 → 置脏。 */
  const act = (fn: () => void): void => {
    if (!running || paused) return
    fn()
    ensureAi()
    detectRoundEnd()
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (!running || paused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    if (state.pendingSuitChoice) {
      const suit = hitSuit(x, y)
      if (suit >= 0) act(() => { chooseSuit(state, suit) })
      return
    }
    if (state.roundWinner !== null || state.turn !== 0) return
    const index = hitHand(x, y, state.hands[0]!.length)
    if (index >= 0) {
      act(() => { playCard(state, index) })
      return
    }
    if (hitDrawPile(x, y) && (!hasPlayable(state) || state.drawnPlayable)) {
      act(() => { passOrDraw(state) })
    }
  }

  const reset = (): void => {
    gameNo += 1
    state = createCrazy8((BASE_SEED + gameNo * 0x9e3779b9) >>> 0)
    lastRoundWinner = null
    paused = false
    reportScore()
    loop.markDirty()
    renderView()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const suitKey = (code: string): number => {
      if (code.startsWith('Digit')) return Number(code.slice(5)) - 1
      if (code.startsWith('Numpad')) return Number(code.slice(6)) - 1
      return -1
    }
    if (state.pendingSuitChoice) {
      const suit = suitKey(event.code)
      if (suit >= 0 && suit <= 3) {
        event.preventDefault()
        act(() => { chooseSuit(state, suit) })
      }
      return
    }
    switch (event.code) {
      case 'Enter':
      case 'NumpadEnter':
        event.preventDefault()
        if (state.roundWinner !== null && state.matchWinner === null) {
          act(() => { nextRound(state) })
        }
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
    renderView()
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
  renderView()

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

export const crazy8Game: MiniGameDefinition = {
  id: 'crazy8',
  title: '疯狂八号 Crazy8',
  icon: '\ud83c\udcc4',
  description: '颜色接龙出牌，8 是万能——先出完手牌的人赢。',
  controls: [
    '点击手牌出牌（亮边为可出）· 无可出点击牌堆摸牌（摸到可出可打出或点牌堆放弃）',
    '出 8 后按 1-4 或点击花色宣告 · Q 跳过下家 · Enter 下一局',
    'R：重开 · P：暂停',
  ],
  create: createCrazy8Game,
}
