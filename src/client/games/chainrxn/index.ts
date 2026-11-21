/**
 * 连锁反应 ChainRxN 游戏定义：把纯逻辑连锁模拟接成
 * {@link MiniGameInstance}。continuous 逐帧渲染 + FIXED_DT 固定步长推进
 * logic.step（可重放确定性）：点击空处引爆一次点击爆波，orb 被波及即
 * 层层连锁引爆；引爆数达标过关，点击耗尽仍未达标失败。R 重开本关、
 * N 过关后下一关、P 暂停；过关 / 通关 / 失败上报 onScore。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createLevelState, fire, FIXED_DT, H as LOGICAL_H, isTerminal, step, W as LOGICAL_W, nextLevel as advanceLevel, type ChainRxnState, type Ignition } from './logic.ts'
import { makeStars, renderScene, type ChainRxnView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles, THEME } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 每关固定种子基值（盘面确定可复现；R 重开同一盘面）。 */
const BASE_SEED = 20261121
/** 背景星点数量。 */
const STAR_COUNT = 90

function createChainRxnGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: chainrxn needs a 2d canvas context')
  const ctx = fit.ctx

  let state: ChainRxnState = createLevelState(0, BASE_SEED)
  let stars = makeStars(BASE_SEED, STAR_COUNT)
  let paused = false
  let running = false
  let nowMs = 0
  let sinceIgnitionMs = 9999
  let accumMs = 0
  let lastReported = -1
  const particles = createParticles()

  const view = (): ChainRxnView => ({
    orbs: state.orbs,
    blasts: state.blasts,
    levelIndex: state.levelIndex,
    clicksLeft: state.clicksLeft,
    exploded: state.exploded,
    goal: state.level.goal,
    score: state.score,
    phase: state.phase,
    paused,
    stars,
    sinceIgnitionMs,
  })

  /** 仅在分数创新高时上报（panel 不做节流）。 */
  const reportScore = (): void => {
    if (state.score > lastReported) {
      lastReported = state.score
      options?.onScore?.(state.score)
    }
  }

  /** 开始 / 重开某一关（同 baseSeed 同盘面）。 */
  const startLevel = (index: number): void => {
    state = createLevelState(index, BASE_SEED)
    stars = makeStars(BASE_SEED + index * 131, STAR_COUNT)
    paused = false
    sinceIgnitionMs = 9999
    accumMs = 0
    loop.markDirty()
  }

  /** 处理一次引爆事件：连锁闪光粒子 + 弹跳计时。 */
  const onIgnitions = (ignited: Ignition[]): void => {
    for (const ig of ignited) {
      sinceIgnitionMs = 0
      particles.burst(ig.x, ig.y, accent(ig.layer - 1), Math.min(14, 4 + ig.layer * 2), 110 + ig.layer * 18)
    }
  }

  const toLogical = (event: MouseEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused) return
    if (isTerminal(state.phase)) return
    const p = toLogical(event)
    fire(state, p.x, p.y)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(state.levelIndex)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      paused = !paused
      loop.markDirty()
    } else if (event.code === 'KeyN') {
      event.preventDefault()
      const before = state.levelIndex
      if (state.phase === 'won' && advanceLevel(state)) {
        // 关卡序号推进 = 进入下一关重开；序号不变 = 通关终态只重绘。
        if (state.levelIndex !== before) startLevel(state.levelIndex)
        else loop.markDirty()
      }
    }
  }

  // continuous：漂移 / 爆波逐帧模拟，固定步长推进保证确定性重放。
  const loop = createFrameLoop(f => {
    if (!paused) {
      nowMs += f.dt * 1000
      sinceIgnitionMs += f.dt * 1000
      if (!isTerminal(state.phase)) {
        accumMs += f.dt * 1000
        while (accumMs >= FIXED_DT * 1000) {
          accumMs -= FIXED_DT * 1000
          const ev = step(state, FIXED_DT)
          onIgnitions(ev.ignited)
          if (isTerminal(state.phase)) {
            reportScore()
            if (state.phase === 'won') {
              particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.good, 24, 190)
            }
            break
          }
        }
      }
    }
    if (f.render || paused) {
      renderScene(ctx, view(), nowMs)
      particles.tick(ctx, f.dt * 1000)
    }
  }, { mode: 'continuous' })

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: () => {
      paused = false
      loop.start()
    },
    pause: () => {
      paused = true
      loop.pause()
      renderScene(ctx, view(), nowMs)
    },
    resume: () => {
      paused = false
      loop.resume()
    },
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const chainrxnGame: MiniGameDefinition = {
  id: 'chainrxn',
  title: '连锁反应 ChainRxN',
  icon: '⛓',
  description: '一次点击引发雪崩—— orb 越大的炸得越远，链式引爆全屏高潮。',
  controls: [
    '点击空处引爆：每关固定点击数，爆波扩张波及漂移 orb 即层层连锁引爆',
    '计分：第 n 层连锁引爆得 10×n 分；总引爆数达到目标即过关，剩余点击每个 +25 分',
    '钢球（灰色铆钉）不可引爆且会吸收触及的爆波，第 4 关起出现、阻挡传播',
    'orb 越大爆波越大（半径 ×3.5）；点击耗尽且引爆数未达标则失败',
    'R 重开本关 · N 过关后下一关 · P 暂停；共 5 关，通关结算总分',
  ],
  create: createChainRxnGame,
}
