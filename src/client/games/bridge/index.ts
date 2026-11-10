/**
 * 过桥难题 Bridge 游戏定义：把纯逻辑状态机接成 {@link MiniGameInstance}。
 * 点选手电岸上的 1-2 人（再点取消），点击桥面或空格 / 回车携灯过桥；
 * 全员到右岸且不超限 → 过关上报 onScore 并进入下一关，累计用时超限 →
 * 超时失败自动重开本关。U 撤回一步、R 重开本关、P 暂停。渲染走 dirty
 * 按需模式：过桥 / 结算动画和粒子活动期间逐帧重绘，静止零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS,
  createInitialState,
  cross,
  evaluate,
  levelFor,
} from './logic.ts'
import type { BridgeState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, hitBridge, hitPerson, renderBridgeScene, type BridgeView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 过桥动画时长：底速 + 按最慢者速度延长。 */
function crossAnimMs(movers: string[], level: ReturnType<typeof levelFor>): number {
  const speedOf = new Map(level.people.map(p => [p.id, p.speed]))
  let worst = 1
  for (const id of movers) worst = Math.max(worst, speedOf.get(id) ?? 1)
  return 360 + worst * 90
}
/** 超时 overlay 到自动重开本关的时长。 */
const FAIL_MS = 1500
/** 过关后进入下一关的停顿。 */
const ADVANCE_MS = 1700

function createBridgeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: bridge needs a 2d canvas context')
  const ctx = fit.ctx

  // 关卡记忆：从到达过的最高关继续。
  let level = Math.min(readLevel('bridge'), LEVELS.length)
  let state = createInitialState(level - 1)
  let selected: string[] = []
  let history: BridgeState[] = []
  let movers: string[] = []
  let pending: BridgeState | null = null
  let phase: 'play' | 'cross' | 'won' | 'fail' = 'play'
  let paused = false
  let running = false
  let crossT = 0
  let animMs = 600
  let failT = 0
  let wonT = 0
  let allClear = false
  let lastScore = -1
  const particles = createParticles()

  const levelIndex = (): number => Math.min(level, LEVELS.length) - 1

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = Math.min(Math.max(next, 1), LEVELS.length)
    saveLevel('bridge', level)
    state = createInitialState(level - 1)
    selected = []
    history = []
    movers = []
    pending = null
    phase = 'play'
    crossT = 0
    failT = 0
    wonT = 0
    allClear = false
    loop.markDirty()
  }

  /** 靠岸结算：应用过桥结果 → 判定过关 / 超时。 */
  const arrive = (): void => {
    if (pending !== null) state = pending
    pending = null
    movers = []
    const verdict = evaluate(state, levelFor(level - 1))
    if (verdict.phase === 'won') {
      phase = 'won'
      wonT = 0
      allClear = level >= LEVELS.length
      reportScore()
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2 - 40, THEME.good, 16, 150)
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2 + 10, THEME.gold, 10, 110)
    } else if (verdict.phase === 'timeout') {
      phase = 'fail'
      failT = 0
      particles.burst(LOGICAL_W / 2, LOGICAL_H - 36, THEME.bad, 14, 130)
    } else {
      phase = 'play'
    }
  }

  const beginCross = (): void => {
    if (phase !== 'play' || paused || selected.length === 0) return
    const next = cross(state, levelFor(level - 1), selected)
    if (next === null) return
    history.push(state)
    pending = next
    movers = [...selected]
    animMs = crossAnimMs(movers, levelFor(level - 1))
    selected = []
    phase = 'cross'
    crossT = 0
    loop.markDirty()
  }

  const undo = (): void => {
    if (phase !== 'play' || history.length === 0) return
    state = history.pop()!
    selected = []
    loop.markDirty()
  }

  const view = (): BridgeView => ({
    state,
    level: levelFor(level - 1),
    levelIndex: levelIndex(),
    phase: paused ? 'paused' : phase,
    selected,
    movers,
    crossProgress: Math.min(1, crossT / animMs),
    allClear,
  })

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused || phase !== 'play') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = hitPerson(x, y, state)
    if (hit !== null) {
      // 只有手电所在岸的人可选；再点取消；至多同时选 2 人。
      if (hit.side !== state.flashlight) return
      if (selected.includes(hit.id)) {
        selected = selected.filter(id => id !== hit.id)
      } else if (selected.length < 2) {
        selected = [...selected, hit.id]
      }
      loop.markDirty()
      return
    }
    if (hitBridge(x, y)) beginCross()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      if (paused) resumeGame()
      else pauseGame()
    } else if (event.code === 'KeyU') {
      event.preventDefault()
      if (!running || paused) return
      undo()
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (!running || paused) return
      beginCross()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      // 前后切关：越过边界取模循环。
      event.preventDefault()
      const delta = event.code === 'BracketRight' ? 1 : -1
      startLevel(((level - 1 + delta + LEVELS.length) % LEVELS.length) + 1)
    }
  }

  // dirty 按需渲染：动画 / 粒子活动期间逐帧，静止时零重绘。
  const loop = createFrameLoop(f => {
    let animating = false
    if (!paused) {
      if (phase === 'cross') {
        crossT += f.dt * 1000
        animating = true
        if (crossT >= animMs) arrive()
      } else if (phase === 'fail') {
        failT += f.dt * 1000
        animating = true
        if (failT >= FAIL_MS) startLevel(level)
      } else if (phase === 'won' && !allClear) {
        wonT += f.dt * 1000
        animating = true
        if (wonT >= ADVANCE_MS) startLevel(level + 1)
      } else if (phase === 'won') {
        animating = particles.size() > 0
      }
    }
    const alive = animating || particles.size() > 0
    if (f.render || alive) {
      renderBridgeScene(ctx, view())
      particles.tick(ctx, f.dt * 1000)
      if (alive) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pauseGame = (): void => {
    if (!running) return
    paused = true
    loop.pause()
    renderBridgeScene(ctx, view())
  }
  const resumeGame = (): void => {
    paused = false
    if (running) {
      loop.markDirty()
      loop.resume()
    }
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resumeGame,
    pause: pauseGame,
    resume: resumeGame,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const bridgeGame: MiniGameDefinition = {
  id: 'bridge',
  title: '过桥难题 Bridge',
  icon: '🔦',
  description: '夜里只有一支手电：两人同行按慢者走——限时全员过桥的取舍艺术。',
  controls: [
    '点击人物：选 / 取消（至多 2 人）· 点击桥面或空格：过桥',
    'U：撤回一步 · R：重开本关 · P：暂停',
  ],
  create: createBridgeGame,
}
