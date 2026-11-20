/**
 * 迷你爬塔 TowerCard 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——
 * 点击手牌打出（攻击默认首个存活敌人，多敌时先点敌人立绘选定目标），
 * 点击/空格结束回合，奖励界面点击三卡领取，R 重开（新种子），P 暂停。
 * 回合制 dirty 帧循环：输入、浮字、受击抖动与粒子期间逐帧重绘；分数在
 * 战斗胜利/死亡/通关时经 onScore 上报（层数 x100，通顶 +500+剩余血量）。
 */
import type {
  MiniGameDefinition, MiniGameInstance, MiniGameMountOptions,
} from '../types.ts'
import {
  createTower, endTurn, pickReward, playCard, scoreOf,
  type TowerState,
} from './logic.ts'
import { H, W, hitCard, hitEndTurn, hitEnemy, hitReward, renderTower, type FloatText } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { THEME, createParticles } from '../theme.ts'

/** 初始种子（R 重开按局号偏移，换一座塔）。 */
const BASE_SEED = 20261120
/** 受击抖动/闪光衰减速度（每秒）。 */
const SHAKE_DECAY = 3

function createTowerCardGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: towercard needs a 2d canvas context')
  const ctx = fit.ctx

  let gameNo = 0
  let state: TowerState = createTower(BASE_SEED)
  let running = false
  let paused = false
  let lastScore = -1
  let lastPhase = state.phase
  let lastFloor = state.floor
  /** 敌人受击抖动 0-1。 */
  let enemyShake = 0
  /** 勇者受击/格挡闪光 0-1。 */
  let playerFlash = 0
  /** 攻击目标（多敌时点击敌人选定，回合开始重置）。 */
  let targetIndex = -1
  const floats: FloatText[] = []
  const particles = createParticles()

  const reportScore = (): void => {
    const score = scoreOf(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 敌人立绘中心（浮字/粒子定位）。 */
  const enemyCenter = (i: number): { x: number; y: number } => {
    const n = state.enemies.length
    const gap = n > 1 ? 150 : 0
    return { x: W / 2 + (i - (n - 1) / 2) * (150 + gap), y: 165 }
  }

  /** 出牌反馈：伤害浮字 + 敌抖 + 粒子。 */
  const feedbackPlay = (handIndex: number, target: number): void => {
    const card = state.hand[handIndex]
    if (card === undefined) return
    if (card.kind === 'attack' || card.kind === 'combo') {
      const t = target >= 0 ? target : 0
      const c = enemyCenter(t)
      const dmg = card.kind === 'attack' ? card.value : 10
      floats.push({ text: '-' + dmg, x: c.x, y: c.y, color: THEME.bad, age: 0, maxAge: 900 })
      particles.burst(c.x, c.y, THEME.bad, 10, 140)
      enemyShake = 1
    } else if (card.kind === 'block') {
      floats.push({ text: '盾 +' + card.value, x: W / 2, y: 330, color: '#7dcfff', age: 0, maxAge: 900 })
      playerFlash = 1
    } else if (card.kind === 'energy') {
      floats.push({ text: '能量 +1', x: 668, y: 300, color: THEME.gold, age: 0, maxAge: 900 })
    } else if (card.kind === 'weaken') {
      const alive = state.enemies.findIndex((e) => !e.dead)
      if (alive >= 0) {
        const c = enemyCenter(alive)
        floats.push({ text: '虚弱!', x: c.x, y: c.y, color: '#bb9af7', age: 0, maxAge: 900 })
      }
    } else {
      floats.push({ text: '抽 2', x: W / 2, y: 480, color: '#bb9af7', age: 0, maxAge: 900 })
    }
  }

  /** 结束回合反馈：勇者掉血浮字 + 受击闪光。 */
  const feedbackEndTurn = (hpBefore: number): void => {
    const loss = hpBefore - state.player.hp
    if (loss > 0) {
      floats.push({ text: '-' + loss, x: W / 2, y: 330, color: THEME.bad, age: 0, maxAge: 900 })
      playerFlash = 1
      particles.burst(W / 2, 330, THEME.bad, 8, 120)
    } else if (state.player.block > 0 || hpBefore === state.player.hp) {
      // 完全格挡或无伤也闪一下作参照（新手可确认格挡生效）。
      playerFlash = 0.7
    }
  }

  /** 阶段切换侦测：通关粒子 + 分数上报。 */
  const detectPhase = (): void => {
    if (state.phase !== lastPhase) {
      lastPhase = state.phase
      if (state.phase === 'won') {
        particles.burst(W / 2, H / 2 - 40, THEME.gold, 26, 220)
        floats.push({ text: '登顶!', x: W / 2, y: H / 2 - 80, color: THEME.gold, age: 0, maxAge: 1400 })
      }
      reportScore()
    }
    if (state.floor !== lastFloor) {
      lastFloor = state.floor
      reportScore()
    }
  }

  /** 动画推进：抖动/闪光衰减、浮字、粒子；返回是否仍在动画。 */
  const tickAnimations = (dt: number): boolean => {
    let animating = false
    if (enemyShake > 0) {
      enemyShake = Math.max(0, enemyShake - dt * SHAKE_DECAY)
      animating = true
    }
    if (playerFlash > 0) {
      playerFlash = Math.max(0, playerFlash - dt * SHAKE_DECAY)
      animating = true
    }
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      floats[i]!.age += dt * 1000
      if (floats[i]!.age >= floats[i]!.maxAge) floats.splice(i, 1)
      else animating = true
    }
    if (particles.size() > 0) animating = true
    return animating
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    detectPhase()
    const animating = tickAnimations(f.dt)
    if (f.render || animating) {
      renderTower(ctx, { state, floats, enemyShake, playerFlash, paused })
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  /** 统一输入出口：执行后侦测阶段并置脏。 */
  const act = (fn: () => void): void => {
    if (!running || paused) return
    fn()
    detectPhase()
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (!running || paused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    if (state.phase === 'reward') {
      const ri = hitReward(x, y)
      if (ri >= 0) act(() => { pickReward(state, ri) })
      return
    }
    if (state.phase !== 'battle') return
    // 多敌时点击敌人立绘选定攻击目标（下回合开始前有效）。
    const ei = hitEnemy(x, y, state)
    if (ei >= 0 && state.enemies.length > 1) {
      targetIndex = ei
      act(() => { state.message = '目标：' + state.enemies[ei]!.name })
      return
    }
    const ci = hitCard(x, y, state.hand.length)
    if (ci >= 0) {
      act(() => {
        feedbackPlay(ci, targetIndex)
        if (!playCard(state, ci, targetIndex)) {
          state.message = '能量不足'
        }
      })
      return
    }
    if (hitEndTurn(x, y)) doEndTurn()
  }

  const doEndTurn = (): void => {
    act(() => {
      const hpBefore = state.player.hp
      endTurn(state)
      feedbackEndTurn(hpBefore)
      targetIndex = -1
    })
  }

  const reset = (): void => {
    gameNo += 1
    state = createTower((BASE_SEED + gameNo * 0x9e3779b9) >>> 0)
    lastPhase = state.phase
    lastFloor = state.floor
    enemyShake = 0
    playerFlash = 0
    targetIndex = -1
    floats.length = 0
    paused = false
    reportScore()
    loop.markDirty()
    renderTower(ctx, { state, floats, enemyShake: 0, playerFlash: 0, paused: false })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        doEndTurn()
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
    renderTower(ctx, { state, floats, enemyShake, playerFlash, paused: true })
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
  renderTower(ctx, { state, floats, enemyShake: 0, playerFlash: 0, paused: false })

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

export const towercardGame: MiniGameDefinition = {
  id: 'towercard',
  title: '迷你爬塔 TowerCard',
  icon: '🗡',
  description: '一手攻击一手格挡，能量有限——十层高塔，牌运与算计五五开。',
  controls: [
    '胜利：打穿 10 层高塔（第 5/10 层 BOSS）；血量 80 起跨战斗保留，战斗胜利 +6，归零即爬塔失败',
    '每回合 3 能量、手牌 5 张：点击卡牌打出（攻击牌默认打首个存活敌人，多敌时先点击敌方立绘选定目标），点击按钮或空格结束回合并重抽',
    '牌理：攻击 6-12 伤 / 格挡 5-8 盾（吸收本回合敌方伤害，下回合清零）/ 连击两段 / 抽 2 / 0 费 +1 能量 / 虚弱使敌伤 -25% 持续 2 回合',
    '看懂敌人头顶：⚔+数字为下步伤害，⚠蓄力=本回合不打、下回合双倍重击，⛨=敌加格挡；牌组 12 张起，抽空自动洗回弃牌堆',
    '战斗胜利三选一：新牌入组 / 治疗 +12 / 删最弱牌；R 重开（新塔）、P 暂停',
  ],
  create: createTowerCardGame,
}
