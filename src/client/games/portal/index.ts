/**
 * 传送门游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous 帧
 * 循环推进模拟与渲染；←→/AD 移动、↑/W/空格跳跃；左键放蓝门、右键或
 * Shift+点击放橙门（只能贴竖直墙面）；R 重开本关、P 暂停；过关分数经
 * onScore 上报（最高分由面板管理）。死亡 / 过关 1.2s 后自动重开 / 进关。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  TILE,
  LEVELS,
  createPortalState,
  restartLevel,
  placePortal,
  stepPortal,
  portalScore,
  tileKind,
  canPlacePortal,
  type PortalState,
  type PortalInput,
  type PortalColor,
} from './logic.ts'
import { renderPortal, spawnPortalFx } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次；R / 死亡重开同关保持同 seed 可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 阶段切换后的自动流转等待 ms。 */
const PHASE_HOLD_MS = 1200

/** 点击点可放置的门面候选（墙瓦片 + 朝向）；找不到返回 null。 */
function faceCandidate(state: PortalState, x: number, y: number): { col: number, row: number, dir: 1 | -1 } | null {
  const col = Math.floor(x / TILE)
  const row = Math.floor(y / TILE)
  const tryFace = (c: number, r: number, d: 1 | -1): { col: number, row: number, dir: 1 | -1 } | null => {
    const other = d === 1 ? state.orange : state.blue
    return canPlacePortal(state.info, c, r, d, other) ? { col: c, row: r, dir: d } : null
  }
  if (tileKind(state.info, col, row) === 'wall') {
    // 点在墙瓦片上：优先取点击所在半侧的竖直面。
    const leftFirst = x - col * TILE < TILE / 2
    const dirs: (1 | -1)[] = leftFirst ? [-1, 1] : [1, -1]
    for (const d of dirs) {
      const face = tryFace(col, row, d)
      if (face !== null) return face
    }
    return null
  }
  // 点在空处：看左右相邻墙瓦片朝向点击点的面（近侧优先）。
  const leftFirst = x - col * TILE < TILE / 2
  const cands: [number, 1 | -1][] = leftFirst ? [[col - 1, 1], [col + 1, -1]] : [[col + 1, -1], [col - 1, 1]]
  for (const [c, d] of cands) {
    const face = tryFace(c, row, d)
    if (face !== null) return face
  }
  return null
}

function createPortalGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, 672, 640)
  if (initialFit === null) throw new Error('dsh-minigames: portal needs a 2d canvas context')
  const fit = initialFit
  const ctx = fit.ctx

  const seed = dailySeed()
  let state: PortalState = createPortalState(seed, 0)
  let running = false
  let paused = false
  let lastScore = -1

  const input: PortalInput = { left: false, right: false, jump: false }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        input.left = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        input.right = true
        break
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        event.preventDefault()
        input.jump = true
        break
      case 'KeyR':
        event.preventDefault()
        restartLevel(state, false)
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        input.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = false
        break
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        input.jump = false
        break
    }
  }

  /** 指针事件 → 逻辑坐标。 */
  const logicalPoint = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    const w = rect.width > 0 ? rect.width : 1
    const h = rect.height > 0 ? rect.height : 1
    return { x: ((event.clientX - rect.left) / w) * 672, y: ((event.clientY - rect.top) / h) * 640 }
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (state.phase !== 'playing' || paused) return
    event.preventDefault()
    const color: PortalColor = event.button === 2 || event.shiftKey ? 'orange' : 'blue'
    const point = logicalPoint(event)
    const face = faceCandidate(state, point.x, point.y)
    if (face !== null) placePortal(state, face.col, face.row, face.dir, color)
  }
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  /** 阶段流转：死亡自动重开（计死），过关自动进下一关（携带死亡数）。 */
  const advancePhase = (): void => {
    if (state.phase !== 'playing' && state.t - state.phaseAt > PHASE_HOLD_MS) {
      if (state.phase === 'dead') {
        restartLevel(state, true)
      } else if (state.levelIndex + 1 < LEVELS.length) {
        state = createPortalState(seed, state.levelIndex + 1, state.deaths)
      } else {
        // 通关后停住遮罩；R 重开第 1 关。
        state.phaseAt = state.t
      }
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (!paused) {
      stepPortal(state, f.dt * 1000, input)
      spawnPortalFx(state)
      advancePhase()
      const score = portalScore(state)
      if (score !== lastScore) {
        lastScore = score
        options?.onScore?.(score)
      }
    }
    if (f.render || paused) renderPortal(ctx, state, paused)
  }
  const loop = createFrameLoop(frame)

  const togglePause = (): void => {
    if (!running) return
    paused = !paused
    if (paused) loop.pause()
    else loop.resume()
    loop.markDirty()
    renderPortal(ctx, state, paused)
  }
  const pause = (): void => {
    if (!running) return
    running = false
    paused = true
    loop.pause()
    renderPortal(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  focusGameHost(host)
  running = true
  loop.start()
  renderPortal(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
    },
  }
}

export const portalGame: MiniGameDefinition = {
  id: 'portal',
  title: '传送门 Portal',
  icon: '🚪',
  description: '蓝橙双门穿越空间——动量守恒的解谜艺术。',
  controls: ['←→ / A D：移动 · ↑ / W / 空格：跳跃（支持二段跳）', '左键：蓝门 · 右键 / Shift+点击：橙门（只能贴竖直墙面）', '同朝向门对 = 落差弹射 · R：重开 · P：暂停'],
  create: createPortalGame,
}
