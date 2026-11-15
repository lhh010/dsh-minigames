/**
 * 盆栽大师游戏定义：把纯逻辑内核接成 MiniGameInstance。点枝修剪（能量
 * 转给兄弟枝）、拖太阳改变趋光方向、空格推进 1 游戏日、W 浇水、F 施肥、
 * R 重开本关、P 暂停；过关后空格进下一关。帧循环 continuous 模式：能量
 * 微光/施肥闪点/粒子逐帧动画持续变化；逻辑 tick 由 dt 累积按 TICK_MS
 * 离散推进，暂停/结束只停模拟不停绘制。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LEVELS, ROOT_X, SOIL_Y, TICK_MS, advanceDay, createBonsaiState, fertilize, nodeEndPositions,
  pruneNode, setSun, tickBonsai, water, type BonsaiState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, burstBonsai, pickAt, renderBonsai } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createBonsaiGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: bonsai needs a 2d canvas context')
  const ctx = fit.ctx

  let state: BonsaiState = createBonsaiState((Date.now() & 0xffffffff) >>> 0, 0)
  let running = true
  let draggingSun = false
  let hoverId: number | null = null
  let lastScore = -1
  let acc = 0
  let timeMs = 0

  /** 评分变化时上报面板（lastScore 只在日翻页评估时更新）。 */
  const reportScore = (): void => {
    if (state.lastScore === lastScore) return
    lastScore = state.lastScore
    options?.onScore?.(state.lastScore)
  }

  /** 重开（可换关卡下标）：停摆期一并恢复循环。 */
  const restart = (levelIndex: number): void => {
    state = createBonsaiState((Date.now() & 0xffffffff) >>> 0, levelIndex)
    lastScore = -1
    draggingSun = false
    hoverId = null
    acc = 0
    reportScore()
    if (!running) {
      running = true
      loop.resume()
    }
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (state.phase !== 'playing') return
    if (running) {
      running = false
      loop.pause()
    } else {
      running = true
      loop.resume()
    }
    loop.markDirty()
  }

  /** 把客户端坐标换算成逻辑坐标。 */
  const toLogical = (event: MouseEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  /** 节点末端画布坐标（粒子反馈定位）。 */
  const nodeCanvasPos = (nodeId: number): { x: number, y: number } | null => {
    const end = nodeEndPositions(state).get(nodeId)
    if (end === undefined) return null
    return { x: ROOT_X + end.x, y: SOIL_Y - end.y }
  }

  const onMouseDown = (event: MouseEvent): void => {
    focusGameHost(host)
    if (!running || state.phase !== 'playing') return
    const p = toLogical(event)
    const hit = pickAt(state, p.x, p.y)
    if (hit === 'sun') {
      draggingSun = true
      return
    }
    if (typeof hit === 'number') {
      const pos = nodeCanvasPos(hit)
      const removed = pruneNode(state, hit)
      if (removed > 0 && pos !== null) {
        burstBonsai(pos.x, pos.y, THEME.bad, 10, 100)
        reportScore()
        loop.markDirty()
      }
    }
  }

  const onMouseMove = (event: MouseEvent): void => {
    const p = toLogical(event)
    if (draggingSun) {
      if (state.phase === 'playing') {
        setSun(state, (p.x - ROOT_X) / 300)
        loop.markDirty()
      }
      return
    }
    if (!running || state.phase !== 'playing') {
      if (hoverId !== null) {
        hoverId = null
        loop.markDirty()
      }
      return
    }
    const hit = pickAt(state, p.x, p.y)
    const nextHover = typeof hit === 'number' ? hit : null
    if (nextHover !== hoverId) {
      hoverId = nextHover
      loop.markDirty()
    }
    canvas.style.cursor = hit === 'sun' ? 'grab' : (nextHover !== null ? 'pointer' : 'default')
  }

  const onMouseUp = (): void => {
    if (draggingSun) {
      draggingSun = false
      loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart(state.levelIndex)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyW') {
      event.preventDefault()
      if (!running || state.phase !== 'playing') return
      const result = water(state)
      if (result === 'watered') burstBonsai(ROOT_X, SOIL_Y - 30, '#7dcfff', 14, 130)
      else if (result === 'rotted' || result === 'rotted-dead') burstBonsai(ROOT_X, SOIL_Y - 30, THEME.bad, 16, 140)
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyF') {
      event.preventDefault()
      if (!running || state.phase !== 'playing') return
      if (fertilize(state) === 'fertilized') burstBonsai(ROOT_X, SOIL_Y - 30, THEME.gold, 12, 120)
      loop.markDirty()
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (state.phase === 'won') {
        if (state.levelIndex < LEVELS.length - 1) restart(state.levelIndex + 1)
        return
      }
      if (!running || state.phase !== 'playing') return
      advanceDay(state)
      reportScore()
      loop.markDirty()
    }
  }

  const loop = createFrameLoop((f: FrameInfo) => {
    timeMs += f.wallMs
    if (running && state.phase === 'playing' && !draggingSun) {
      acc += f.dt * 1000
      while (acc >= TICK_MS) {
        acc -= TICK_MS
        tickBonsai(state)
        reportScore()
      }
    }
    if (f.render) renderBonsai(ctx, state, !running, timeMs, hoverId, f.dt * 1000)
  }, { mode: 'continuous' })

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  reportScore()

  return {
    start: () => {
      if (running) return
      running = true
      loop.resume()
    },
    pause: () => {
      if (!running) return
      running = false
      loop.pause()
    },
    resume: () => {
      if (running) return
      running = true
      loop.resume()
    },
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const bonsaiGame: MiniGameDefinition = {
  id: 'bonsai',
  title: '盆栽大师 Bonsai',
  icon: '🪴',
  description: '一株树，一把剪——修剪与照料塑造它的姿态，目标树型就是你的评分标准。',
  controls: ['点击枝条：修剪（能量转给兄弟枝）', '拖动太阳：改变趋光方向', '空格：推进 1 游戏日 / 过关后下一关', 'W：浇水 · F：施肥', 'R：重开 · P：暂停'],
  create: createBonsaiGame,
}
