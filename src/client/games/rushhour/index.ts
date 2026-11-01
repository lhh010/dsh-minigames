/**
 * 交通堵塞游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击车选中、
 * 再点同排 / 同列目标格移动（或按住拖拽松手落位）；U 撤销、R 重开本关、
 * P 暂停、[ ] 切换关卡（进度经 readLevel/saveLevel('rushhour') 持久化）。
 * 回合制 dirty 帧循环：无操作零重绘，分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  SIZE, CELL, BOARD_X, BOARD_Y, W, H,
  cloneState, generateLevel, moveVehicle, vehicleAt,
  type RushHourState,
} from './logic.ts'
import { renderRushHour } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

/** 初始种子（与关卡号联合决定布局；同关同布局）。 */
const BASE_SEED = 20261101
/** 拖拽起效的最小位移 px（不足则视为点击选中）。 */
const DRAG_THRESHOLD = CELL * 0.5

function createRushHourGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: rushhour needs a 2d canvas context')
  const ctx = fit.ctx

  let level = readLevel('rushhour')
  /** 页面级关卡缓存：深关生成含 BFS 验证最慢约 3 秒，同关只生成一次。 */
  const levelCache = new Map<number, RushHourState>()
  const levelState = (lv: number): RushHourState => {
    const hit = levelCache.get(lv)
    if (hit !== undefined) return cloneState(hit)
    const fresh = generateLevel(BASE_SEED, lv)
    levelCache.set(lv, cloneState(fresh))
    return fresh
  }
  let state: RushHourState = levelState(level)
  let selected: number | null = null
  let running = false
  let paused = false
  let lastScore = -1
  let undoStack: RushHourState[] = []
  // 拖拽会话：按下时的车辆索引与逻辑坐标。
  let dragVehicle: number | null = null
  let dragX = 0
  let dragY = 0
  /** 拖拽当前指针位置（实时预览用）。 */
  let dragCurX = 0
  let dragCurY = 0

  // 指针位置（CSS 像素）→ 逻辑坐标。
  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }

  // 逻辑坐标 → 盘面格（null 为盘外）。
  const cellOf = (x: number, y: number): { row: number, col: number } | null => {
    const col = Math.floor((x - BOARD_X) / CELL)
    const row = Math.floor((y - BOARD_Y) / CELL)
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return null
    return { row, col }
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** 执行一次移动：成功则压栈快照、清空选中并回报分数。 */
  const applyMove = (vehicleIdx: number, targetPos: number): void => {
    const next = moveVehicle(state, vehicleIdx, targetPos)
    if (next === null) return
    if (!state.won) undoStack.push(cloneState(state))
    state = next
    selected = null
    reportScore()
  }

  /**
   * 选中车点击同排 / 同列空格的目标位置推导：点击格成为车靠点击侧的端格。
   * @param vehicleIdx - 车辆索引。
   * @param cell - 点击格。
   * @returns 目标可动轴坐标；不同排 / 同列返回 null。
   */
  const targetFromCell = (vehicleIdx: number, cell: { row: number, col: number }): number | null => {
    const vehicle = state.vehicles[vehicleIdx]
    if (vehicle === undefined) return null
    if (vehicle.horizontal) {
      if (cell.row !== vehicle.fixed) return null
      // 点击格在车右侧 → 车右端贴住点击格；在左侧 → 车左端贴住点击格。
      return cell.col > vehicle.pos + vehicle.length - 1 ? cell.col - vehicle.length + 1 : cell.col
    }
    if (cell.col !== vehicle.fixed) return null
    return cell.row > vehicle.pos + vehicle.length - 1 ? cell.row - vehicle.length + 1 : cell.row
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (paused) return
    // 过关后点击任意处进入下一关。
    if (state.won) {
      advanceLevel()
      return
    }
    const p = toLogical(event)
    dragX = p.x
    dragY = p.y
    // 按下即同步当前指针位置——否则首帧 ghost 用旧拖拽位置计算会瞬移。
    dragCurX = p.x
    dragCurY = p.y
    const cell = cellOf(p.x, p.y)
    if (cell === null) {
      selected = null
      loop.markDirty()
      return
    }
    const hit = vehicleAt(state.vehicles, cell.row, cell.col)
    if (hit !== null) {
      // 命中车辆：切换选中并开始潜在拖拽；捕获指针，滑出画布也不丢事件。
      selected = selected === hit ? null : hit
      dragVehicle = hit
      try { canvas.setPointerCapture(event.pointerId) } catch { /* 指针已释放 */ }
      loop.markDirty()
      return
    }
    // 空格：若有选中且同排 / 同列则移动。
    if (selected !== null) {
      const target = targetFromCell(selected, cell)
      if (target !== null) applyMove(selected, target)
    } else {
      selected = null
    }
    loop.markDirty()
  }

  /** 拖拽中的实时目标位置（受当前占用与边界夹取），null = 未在拖拽。 */
  const dragTargetPos = (): { idx: number, pos: number } | null => {
    if (dragVehicle === null) return null
    const vehicle = state.vehicles[dragVehicle]!
    const dx = dragCurX - dragX
    const dy = dragCurY - dragY
    const offset = vehicle.horizontal ? Math.round(dx / CELL) : Math.round(dy / CELL)
    if (offset === 0) return { idx: dragVehicle, pos: vehicle.pos }
    // 逐格推进到最远可行位置（同 moveVehicle 的阻挡语义，但不落盘）。
    const step = offset > 0 ? 1 : -1
    let pos = vehicle.pos
    for (let i = 0; i < Math.abs(offset); i += 1) {
      const next = moveVehicle(state, dragVehicle, pos + step)
      if (next === null) break
      pos = next.vehicles[dragVehicle]!.pos
    }
    return { idx: dragVehicle, pos }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (dragVehicle === null || paused || state.won) return
    const p = toLogical(event)
    dragCurX = p.x
    dragCurY = p.y
    loop.markDirty()
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (dragVehicle !== null && !paused && !state.won) {
      const p = toLogical(event)
      dragCurX = p.x
      dragCurY = p.y
      const target = dragTargetPos()
      if (target !== null && target.pos !== state.vehicles[target.idx]!.pos) {
        applyMove(target.idx, target.pos)
      }
    }
    dragVehicle = null
    try { canvas.releasePointerCapture(event.pointerId) } catch { /* 未捕获 */ }
    loop.markDirty()
  }

  const undoLast = (): void => {
    if (state.won || undoStack.length === 0) return
    selected = null
    state = undoStack.pop()!
    reportScore()
  }

  /** 重开本关（同关卡同布局，步数清零；命中缓存即瞬时）。 */
  const restartLevel = (): void => {
    state = levelState(level)
    selected = null
    undoStack = []
    lastScore = -1
    paused = false
    reportScore()
    loop.markDirty()
  }

  /** 切到指定关卡（≥1）。 */
  const gotoLevel = (next: number): void => {
    level = Math.max(1, next)
    saveLevel('rushhour', level)
    restartLevel()
  }

  /** 过关后进入下一关（同时持久化进度）。 */
  const advanceLevel = (): void => {
    gotoLevel(level + 1)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
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
    if (f.render) renderRushHour(ctx, state, selected, paused, dragTargetPos())
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    paused = true
    running = false
    loop.pause()
    renderRushHour(ctx, state, selected, true, null)
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderRushHour(ctx, state, null, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const rushhourGame: MiniGameDefinition = {
  id: 'rushhour',
  title: '交通堵塞 Rush Hour',
  icon: '🚗',
  description: '滑动纵横车辆清出通道，把红色小车开出出口——步数越少分越高。',
  controls: [
    '点击车辆选中，再点同排 / 同列目标格移动（也可按住拖拽）',
    'U：撤销一步 · [ ]：切换关卡',
    'R：重开 · P：暂停',
  ],
  create: createRushHourGame,
}
