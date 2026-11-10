/**
 * 弹跳机器人游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键 /
 * WASD 或点击底部方向按钮发起一回合（所有机器人同向滑行），滑行动画
 * 期间逐帧 dirty 重绘；U 撤回、R 重开本关、P 暂停、[ ] 切换关卡（进度
 * 经 readLevel/saveLevel('ricochet') 持久化）。分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  W, H, cloneState, generateLevel, slideAll,
  type Dir, type Pos, type RicochetState,
} from './logic.ts'
import { SLIDE_MS, burstWin, hitDirectionButton, renderRicochet } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

/** 初始种子（与关卡号联合决定布局；同关同布局）。 */
const BASE_SEED = 20261110

function createRicochetGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: ricochet needs a 2d canvas context')
  const ctx = fit.ctx

  let level = readLevel('ricochet')
  /** 页面级关卡缓存：同关只生成一次（BFS 验证有开销）。 */
  const levelCache = new Map<number, RicochetState>()
  const levelState = (lv: number): RicochetState => {
    const hit = levelCache.get(lv)
    if (hit !== undefined) return cloneState(hit)
    const fresh = generateLevel(BASE_SEED, lv)
    levelCache.set(lv, cloneState(fresh))
    return fresh
  }
  let state: RicochetState = levelState(level)
  let running = false
  let paused = false
  let lastScore = -1
  let undoStack: RicochetState[] = []
  /** 滑行动画：出发点数组与起始时刻（null 无动画）。 */
  let animFrom: Pos[] | null = null
  let animStart = 0

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** 动画进度 0..1（>=1 视为结束）。 */
  const animT = (): number => {
    if (animFrom === null) return 1
    return (performance.now() - animStart) / SLIDE_MS
  }

  /** 执行一回合：动画中忽略输入；有效滑动压栈快照。 */
  const applyDir = (dir: Dir): void => {
    if (animFrom !== null && animT() < 1) return
    if (state.won || state.failed || paused) return
    const next = slideAll(state, dir)
    if (next === null) return
    undoStack.push(cloneState(state))
    const won = !state.won && next.won
    animFrom = state.robots.map((r) => ({ ...r }))
    animStart = performance.now()
    state = next
    if (won) burstWin(state)
    reportScore()
    loop.markDirty()
  }

  const undoLast = (): void => {
    if (animFrom !== null && animT() < 1) return
    if (state.won) return
    if (undoStack.length === 0) return
    state = undoStack.pop()!
    animFrom = null
    reportScore()
    loop.markDirty()
  }

  /** 重开本关（同关卡同布局，步数清零）。 */
  const restartLevel = (): void => {
    state = levelState(level)
    undoStack = []
    animFrom = null
    lastScore = -1
    paused = false
    reportScore()
    loop.markDirty()
  }

  /** 切到指定关卡（≥1）。 */
  const gotoLevel = (next: number): void => {
    level = Math.max(1, next)
    saveLevel('ricochet', level)
    restartLevel()
  }

  /** 过关后进入下一关（同时持久化进度）。 */
  const advanceLevel = (): void => {
    gotoLevel(level + 1)
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (paused) return
    if (state.won) {
      advanceLevel()
      return
    }
    if (state.failed) {
      restartLevel()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    const dir = hitDirectionButton(x, y)
    if (dir !== null) applyDir(dir)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    let dir: Dir | null = null
    switch (event.code) {
      case 'ArrowUp': case 'KeyW': dir = 'up'; break
      case 'ArrowDown': case 'KeyS': dir = 'down'; break
      case 'ArrowLeft': case 'KeyA': dir = 'left'; break
      case 'ArrowRight': case 'KeyD': dir = 'right'; break
    }
    if (dir !== null) {
      event.preventDefault()
      if (running && !paused) applyDir(dir)
      return
    }
    switch (event.code) {
      case 'KeyR':
        event.preventDefault()
        restartLevel()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'KeyU':
        event.preventDefault()
        if (running && !paused) undoLast()
        loop.markDirty()
        break
      case 'Enter': case 'Space':
        if (state.won) {
          event.preventDefault()
          advanceLevel()
        }
        break
      case 'BracketLeft':
        event.preventDefault()
        gotoLevel(level - 1)
        break
      case 'BracketRight':
        event.preventDefault()
        if (state.won) advanceLevel()
        else gotoLevel(level + 1)
        break
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    reportScore()
    const t = animT()
    if (animFrom !== null && t >= 1) animFrom = null
    // 滑行动画期间逐帧重绘；静止时交给调度器 dirty 模式。
    if (animFrom !== null) loop.markDirty()
    if (f.render || animFrom !== null) {
      renderRicochet(ctx, state, {
        animFrom,
        animT: t,
        paused,
        nowMs: performance.now(),
      })
    }
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    paused = true
    running = false
    loop.pause()
    renderRicochet(ctx, state, { animFrom: null, animT: 1, paused: true, nowMs: performance.now() })
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    animFrom = null
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
  loop.start()
  renderRicochet(ctx, state, { animFrom: null, animT: 1, paused: false, nowMs: performance.now() })

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

export const ricochetGame: MiniGameDefinition = {
  id: 'ricochet',
  title: '弹跳机器人 Ricochet',
  icon: '\u{1F916}',
  description: '选一个方向所有机器人一起滑到撞墙——用同伴当垫脚石抵达目标的联动规划。',
  controls: [
    '方向键 / WASD：全员同向滑行 · 点击底部按钮同样有效',
    'U：撤回一步 · [ ]：切换关卡',
    'R：重开 · P：暂停',
  ],
  create: createRicochetGame,
}
