/**
 * 冰壶游戏定义：把纯逻辑状态机接成 {@link MiniGameInstance}。两段式
 * 掷壶（点击锁方向 → 点击锁力度），滑行中按住空格擦冰（每掷 3 次），
 * R 重开整场（同种子完全重放），P 暂停。帧调度用 dirty 模式：摆针 /
 * 力度 / 滑行 / 粒子等动画阶段每帧 markDirty，局间遮罩与胜负画面静
 * 止时零重绘。得分事件驱动碰撞火花粒子；onScore 上报我方累计得分。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  aiThrow, beginNext, createGame, endSweep, lockAim, lockPower, restartMatch,
  startSweep, step, togglePause, type CurlingState,
} from './logic.ts'
import {
  LOGICAL_H, LOGICAL_W, logicalToWorld, renderCurling, worldToLogical,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const GAME_ID = 'curling'

function createCurlingGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: curling needs a 2d canvas context')
  const ctx = fit.ctx

  // 每次挂载一个种子；R 重开复用同一种子 → AI 与时序完全重放。
  const runSeed = (Date.now() ^ 0xc12ee5) >>> 0
  let state: CurlingState = createGame(runSeed)

  let running = false
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    const s = state.playerTotal
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'hit') {
        const p = worldToLogical(ev.x, ev.y)
        particles.burst(p.x, p.y, ev.speed > 20 ? THEME.gold : THEME.text, 6 + Math.min(8, Math.floor(ev.speed / 4)), 120)
      } else if (ev.kind === 'throw' && ev.side === 'P') {
        const hack = worldToLogical(8, 30)
        particles.burst(hack.x, hack.y, THEME.good, 5, 90)
      } else if (ev.kind === 'end') {
        reportScore()
      } else if (ev.kind === 'game') {
        reportScore()
      }
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step(state, f.dt)
    handleEvents()
    // 动画阶段每帧置脏（摆针/力度/滑行/粒子）；静止遮罩零重绘。
    const animated = state.phase === 'aimDir' || state.phase === 'aimPower'
      || state.phase === 'sliding' || particles.size() > 0
    if (animated) loop.markDirty()
    if (f.render) {
      renderCurling(ctx, { state, paused: false })
      particles.tick(ctx, f.dt * 1000)
    }
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const onClick = (): void => {
    if (!running) return
    if (state.phase === 'aimDir') lockAim(state)
    else if (state.phase === 'aimPower') lockPower(state)
    else if (state.phase === 'endScore') beginNext(state)
    else if (state.phase === 'gameOver') restart()
    loop.markDirty()
  }

  const restart = (): void => {
    restartMatch(state, runSeed)
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space') event.preventDefault()
    switch (event.code) {
      case 'Space':
        if (state.phase === 'sliding') startSweep(state)
        else if (state.phase === 'endScore' && !event.repeat) beginNext(state)
        loop.markDirty()
        break
      case 'KeyR':
        if (!event.repeat) restart()
        break
      case 'KeyP': case 'Escape':
        if (!event.repeat) togglePauseLocal()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space' && state.sweepActive) {
      endSweep(state)
      loop.markDirty()
    }
  }

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    togglePause(state)
    renderCurling(ctx, { state, paused: true })
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (state.phase === 'paused') togglePause(state)
    loop.resume()
    loop.markDirty()
  }
  const togglePauseLocal = (): void => {
    if (state.phase === 'paused') resume()
    else pause()
  }

  canvas.addEventListener('click', onClick)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
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
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      fit.dispose()
    },
  }
}

export const curlingGame: MiniGameDefinition = {
  id: 'curling',
  title: '冰壶 Curling',
  icon: '🧊',
  description: '掷出冰壶再擦冰减速——分队对抗的精准艺术。',
  controls: [
    '点击两段锁定：先锁方向摆针，再锁力度条',
    '滑行中按住空格擦冰减阻（每掷限 3 次）',
    'R：重开 · P：暂停',
    '双方各掷 4 壶，靠近圆心者按壶计分，共 3 局',
  ],
  create: createCurlingGame,
}
