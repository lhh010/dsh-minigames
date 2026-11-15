/**
 * 猜拳心理战游戏定义：把马尔可夫读心逻辑接成 {@link MiniGameInstance}
 * —— 数字键 1/2/3 或点击底部按钮出拳（石头/剪刀/布），R 重开、P 暂停；
 * 每轮按预测复盘 + 每 3 轮一句真假提示，连赢触发火花，dirty 按需重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createRpsState, playRound, type Hand, type RpsState } from './logic.ts'
import { renderRps, buttonAt, LOGICAL_W, LOGICAL_H, type RpsView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createRpsGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: rps needs a 2d canvas context')
  const ctx = fit.ctx

  let state = createRpsState(nextSeed())
  let running = false
  let paused = false
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** 出拳：结算一轮，连赢时在舞台中央喷火花。 */
  const throwHand = (hand: Hand): void => {
    if (state.over) return
    const result = playRound(state, hand)
    if (result === null) return
    if (result.outcome === 'win') {
      particles.burst(LOGICAL_W / 2, 190, THEME.gold, 18, 160)
    } else if (result.wasRead) {
      particles.burst(LOGICAL_W / 2 + 150, 190, THEME.bad, 10, 120)
    }
    reportScore()
    loop.markDirty()
  }

  const restart = (): void => {
    state = createRpsState(nextSeed())
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 浏览器快捷键（Ctrl/Cmd+R 等）不拦截。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (paused) {
        paused = false
        loop.markDirty()
        loop.resume()
      } else if (running) {
        paused = true
        loop.pause()
      }
      return
    }
    if (!running || paused || state.over) return
    if (event.key === '1' || event.key === '2' || event.key === '3') {
      event.preventDefault()
      throwHand((Number(event.key) - 1) as Hand)
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (state.over || paused) {
      if (state.over) restart()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = buttonAt(x, y)
    if (hit !== null) throwHand(hit)
  }

  const view = (): RpsView => ({ state, paused })

  // 脏标记渲染：静态对峙画面只在出拳/提示/粒子变化时重绘。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    if (f.render || particles.size() > 0) {
      renderRps(ctx, view())
      particles.tick(ctx, dtMs)
      if (particles.size() > 0) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    paused = true
    loop.pause()
    renderRps(ctx, view())
  }
  const resume = (): void => {
    paused = false
    running = true
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderRps(ctx, view())

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const rpsGame: MiniGameDefinition = {
  id: 'rps',
  title: '猜拳心理战 RPS',
  icon: '✊',
  description: '石头剪刀布，但 AI 会记住你的套路——你能骗过它几轮？',
  controls: ['1 / 2 / 3 或点击按钮：石头 / 剪刀 / 布出拳', 'R：重开 · P：暂停'],
  create: createRpsGame,
}
