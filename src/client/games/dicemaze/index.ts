/**
 * 骰子行军游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键 /
 * WASD 翻滚骰子（数字门需翻滚后顶面匹配、碎地板踩过即碎），U 撤回、
 * R 重开（同种子同图）、P 暂停。5 关递进（棋盘、门数、碎地板增多），
 * 通关后 L5 回绕 L1；最高到达关卡持久化（../level-progress.ts），重进
 * 从上次进度开始。回合制 + 翻滚动画：dirty 调度，静止零重绘，动画与
 * 过关粒子期间逐帧 markDirty。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createState, generateLevel, levelSize, tryMove, undo, type Dir, type GameState, type Orientation } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, dicemazeParticlesActive, renderDicemaze } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1600
/** 单次翻滚动画时长（毫秒）。 */
const ROLL_MS = 150

/** 每关固定种子：R 重开得到同一张图，重进关卡也是同一张。 */
function levelSeed(level: number): number {
  return (level * 0x9e3779b9 + 0x5bf03635) >>> 0
}

/** 按键 → 翻滚方向。 */
const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

/** 进行中的翻滚动画（index 层瞬时状态）。 */
interface RollAnim {
  dir: Dir
  fromX: number
  fromY: number
  toX: number
  toY: number
  fromOrient: Orientation
  t0: number
}

function createDiceMazeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: dicemaze needs a 2d canvas context')
  const ctx = fit.ctx

  let level = Math.min(readLevel('dicemaze'), 5)
  let state: GameState = createState(generateLevel(levelSeed(level), level))
  let winText: string | null = null
  let winAt = 0
  let running = false
  let lastScore = -1
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let anim: RollAnim | null = null

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next > 5 ? 1 : next
    saveLevel('dicemaze', level)
    state = createState(generateLevel(levelSeed(level), level))
    winText = null
    anim = null
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const doMove = (dir: Dir): void => {
    if (winText !== null || anim !== null) return
    const from = { x: state.x, y: state.y, orient: { ...state.orient } }
    const result = tryMove(state, dir)
    if (result === 'blocked') return
    anim = {
      dir,
      fromX: from.x,
      fromY: from.y,
      toX: state.x,
      toY: state.y,
      fromOrient: from.orient,
      t0: performance.now(),
    }
    loop.markDirty()
    if (result === 'won') {
      winText = '第 ' + String(level) + ' 关完成 · ' + String(state.steps) + ' 步翻滚'
      winAt = performance.now()
      reportScore()
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS // 暂停中过关：恢复时再武装跳转
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (advanceTimer !== 0) {
        window.clearTimeout(advanceTimer)
        advanceTimer = 0
      }
      advanceRemaining = 0
      startLevel(level)
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (!running) return // 暂停时游戏键失效（R / P 仍可用）
    if (event.code === 'KeyU') {
      event.preventDefault()
      if (anim === null && undo(state)) {
        winText = null
        loop.markDirty()
      }
      return
    }
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    doMove(dir)
  }

  // dirty 调度：静止零重绘；翻滚动画期间与过关粒子存活的窗口内逐帧
  // markDirty，动画结束落定一帧后回到静止。
  const loop = createFrameLoop(f => {
    if (anim !== null) {
      loop.markDirty()
      if (performance.now() - anim.t0 >= ROLL_MS) anim = null
    }
    if (winText !== null && performance.now() - winAt < 1400) loop.markDirty()
    if (dicemazeParticlesActive()) loop.markDirty()
    if (f.render) {
      const t = anim === null ? 1 : Math.min(1, (performance.now() - anim.t0) / ROLL_MS)
      renderDicemaze(ctx, state.board, {
        level,
        steps: state.steps,
        x: state.x,
        y: state.y,
        orient: state.orient,
        anim: anim === null
          ? null
          : {
            dir: anim.dir,
            fromX: anim.fromX,
            fromY: anim.fromY,
            toX: anim.toX,
            toY: anim.toY,
            fromOrient: anim.fromOrient,
            t,
          },
        broken: state.broken,
        winText,
        paused: !running,
      }, f.wallMs)
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    if (advanceTimer !== 0) {
      advanceRemaining = Math.max(0, advanceAt - performance.now())
      window.clearTimeout(advanceTimer)
      advanceTimer = 0
    }
    loop.markDirty()
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  loop.markDirty()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      if (advanceTimer !== 0) window.clearTimeout(advanceTimer)
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const dicemazeGame: MiniGameDefinition = {
  id: 'dicemaze',
  title: '骰子行军 DiceMaze',
  icon: '🎲',
  description: '翻滚骰子走出迷宫——只有底面朝上才能踏过那扇门。',
  controls: ['方向键 / WASD：翻滚骰子', '数字门：顶面点数匹配才能通过', 'U：撤回 · R：重开本关', 'P：暂停'],
  create: createDiceMazeGame,
}

