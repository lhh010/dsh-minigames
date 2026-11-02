/**
 * 21点游戏定义：把纯逻辑接成 {@link MiniGameInstance}——H 要牌、S 停牌、
 * D 加倍（仅首两张）、B 循环下注档、Enter 发牌/续局、R 重开（换新牌靴
 * 与余额）、P 暂停、C 对子分牌（可选加分项，两手依次操作）；按钮与
 * 下注筹码支持点击。回合制 dirty 帧循环：仅
 * 输入、暗牌翻牌动画、结算浮字与破产遮罩计时期间重绘；结算经 onScore
 * 上报余额。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  BET_STEPS, createBlackjack, dealRound, cycleBetStep, playerDouble, playerHit,
  playerSplit, playerStand, type BlackjackState,
} from './logic.ts'
import {
  CARD_H, H, PLAYER_Y, W, hitButton, hitChip, handX, renderBlackjack,
  type FloatText,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { THEME, createParticles } from '../theme.ts'

/** 初始种子（R 重开时按局号偏移换新牌靴）。 */
const BASE_SEED = 20261102
/** 暗牌翻开动画速率（每秒进度）。 */
const FLIP_SPEED = 2.4
/** 破产遮罩显示秒数。 */
const REBUY_FLASH_S = 2.2

function createBlackjackGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: blackjack needs a 2d canvas context')
  const ctx = fit.ctx

  let gameNo = 0
  let state: BlackjackState = createBlackjack(BASE_SEED)
  let running = false
  let paused = false
  let lastScore = -1
  let lastSettledRound = 0
  let prevRebuys = 0
  let prevHoleHidden = true
  /** 暗牌翻开进度 0-1。 */
  let flip = 1
  /** 破产遮罩剩余秒数。 */
  let rebuyFlash = 0
  const floats: FloatText[] = []
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.bankroll === lastScore) return
    lastScore = state.bankroll
    options?.onScore?.(state.bankroll)
  }

  /** 结算侦测：浮字、粒子、分数上报、破产遮罩。 */
  const detectSettle = (): void => {
    if (state.phase === 'settled' && state.round !== lastSettledRound) {
      lastSettledRound = state.round
      for (let i = 0; i < state.hands.length; i += 1) {
        const hand = state.hands[i]!
        if (hand.outcome === null) continue
        const net = hand.payout - hand.bet
        const cx = handX(i, state.hands.length)
        const text = hand.outcome === 'blackjack'
          ? 'BLACKJACK! 3:2 +' + net
          : hand.outcome === 'win' ? '+' + net
            : hand.outcome === 'push' ? '平局' : String(net)
        const color = hand.outcome === 'blackjack' ? THEME.gold
          : hand.outcome === 'win' ? THEME.good
            : hand.outcome === 'push' ? THEME.textMuted : THEME.bad
        floats.push({ text, x: cx, y: PLAYER_Y + CARD_H + 40, color, age: 0, maxAge: 1400 })
        if (hand.outcome === 'win' || hand.outcome === 'blackjack') {
          particles.burst(cx, PLAYER_Y + CARD_H / 2, hand.outcome === 'blackjack' ? THEME.gold : THEME.good, 14, 150)
        }
      }
      if (state.rebuys > prevRebuys) {
        prevRebuys = state.rebuys
        rebuyFlash = REBUY_FLASH_S
      }
      reportScore()
    }
  }

  /** 动画推进（每帧调用）：暗牌翻开、浮字、破产遮罩、粒子。 */
  const tickAnimations = (dt: number): boolean => {
    let animating = false
    if (prevHoleHidden && !state.holeHidden) flip = 0
    prevHoleHidden = state.holeHidden
    if (state.holeHidden && state.phase === 'player' && flip !== 0) flip = 0
    if (flip < 1 && !state.holeHidden) {
      flip = Math.min(1, flip + dt * FLIP_SPEED)
      animating = true
    }
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      floats[i]!.age += dt * 1000
      if (floats[i]!.age >= floats[i]!.maxAge) floats.splice(i, 1)
      else animating = true
    }
    if (rebuyFlash > 0) {
      rebuyFlash = Math.max(0, rebuyFlash - dt)
      animating = true
    }
    if (particles.size() > 0) animating = true
    return animating
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    detectSettle()
    const animating = tickAnimations(f.dt)
    if (f.render || animating) {
      renderBlackjack(ctx, { state, flip, floats, paused: false, rebuyFlash })
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  /** 统一的输入出口：执行动作后立即侦测结算并置脏。 */
  const act = (fn: () => void): void => {
    if (!running || paused) return
    fn()
    detectSettle()
    loop.markDirty()
  }

  const doDeal = (): void => { dealRound(state) }
  const doBet = (): void => {
    if (state.phase !== 'player') cycleBetStep(state)
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (!running || paused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    const chip = hitChip(x, y)
    if (chip >= 0 && state.phase !== 'player') {
      act(() => { state.betStep = chip; state.message = '下注 ' + BET_STEPS[chip]! + ' · Enter 发牌' })
      return
    }
    const btn = hitButton(x, y)
    if (btn === null) return
    if (btn === 'hit') act(() => { playerHit(state) })
    else if (btn === 'stand') act(() => { playerStand(state) })
    else if (btn === 'double') act(() => { playerDouble(state) })
    else if (btn === 'bet') act(doBet)
    else if (btn === 'deal') act(doDeal)
  }

  const reset = (): void => {
    gameNo += 1
    state = createBlackjack((BASE_SEED + gameNo * 0x9e3779b9) >>> 0)
    lastSettledRound = 0
    prevRebuys = 0
    prevHoleHidden = true
    flip = 1
    rebuyFlash = 0
    floats.length = 0
    paused = false
    reportScore()
    loop.markDirty()
    renderBlackjack(ctx, { state, flip, floats, paused: false, rebuyFlash: 0 })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'KeyH':
        event.preventDefault()
        act(() => { playerHit(state) })
        break
      case 'KeyS':
        event.preventDefault()
        act(() => { playerStand(state) })
        break
      case 'KeyD':
        event.preventDefault()
        act(() => { playerDouble(state) })
        break
      case 'KeyB':
        event.preventDefault()
        act(doBet)
        break
      case 'KeyC':
        event.preventDefault()
        act(() => { playerSplit(state) })
        break
      case 'Enter':
      case 'NumpadEnter':
        event.preventDefault()
        act(doDeal)
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
    renderBlackjack(ctx, { state, flip, floats, paused: true, rebuyFlash })
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
  renderBlackjack(ctx, { state, flip, floats, paused: false, rebuyFlash: 0 })

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

export const blackjackGame: MiniGameDefinition = {
  id: 'blackjack',
  title: '21点 Blackjack',
  icon: '🃏',
  description: '经典赌桌：要牌停牌加倍，别爆点也别输给庄家——多副牌靴与筹码管理。',
  controls: [
    'H：要牌 · S：停牌 · D：加倍（仅首两张） · C：对子分牌 · B：循环下注 25/50/100/250',
    'Enter：发牌 / 续局 · 点击按钮与筹码亦可操作',
    'R：重开 · P：暂停',
  ],
  create: createBlackjackGame,
}
