/**
 * 分子构建游戏定义：把纯推原子逻辑接成 MiniGameInstance——方向键/WASD
 * 移动（相邻即成键），U 撤销，R 重开，P 暂停；过关粒子庆祝后自动进入
 * 下一关，十关全过显示终局画面。棋盘类：dirty 按需重绘（推挤动画与
 * 粒子活跃期间持续标脏）。得分（每键 +100、过关 +500）经 onScore 上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LEVELS, applyMove, atomById, createMoleculeState, loadLevel, restartLevel,
  undoMove, type MoleculeMove, type MoleculeState,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, atomCenter, renderMolecule, renderMoleculeOverlay, type MoleculeView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { createParticles, THEME, accent } from '../theme.ts'

const PUSH_MS = 110
const AUTO_ADVANCE_MS = 1700

/** 方向键映射。 */
const KEY_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

function createMoleculeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: molecule needs a 2d canvas context')
  const ctx = fit.ctx

  let state: MoleculeState = createMoleculeState(0, 20261116)
  let running = false
  let paused = false
  let won = false
  let lastScore = -1
  let pushMove: MoleculeMove | null = null
  let pushT = 0
  let autoMs = -1
  let clockMs = 0
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const view = (): MoleculeView => ({
    paused,
    won,
    push: pushMove === null ? null : { moved: pushMove.moved, t: Math.min(1, pushT / PUSH_MS) },
    timeMs: clockMs,
  })

  const paint = (dtMs: number): void => {
    renderMolecule(ctx, state, view())
    particles.tick(ctx, dtMs)
    if (won) renderMoleculeOverlay(ctx, state, 'won')
    else if (state.cleared) renderMoleculeOverlay(ctx, state, 'won')
    else if (paused) renderMoleculeOverlay(ctx, state, 'paused')
  }

  const tryMove = (dir: 'up' | 'down' | 'left' | 'right'): void => {
    if (state.cleared || pushMove !== null) return
    const move = applyMove(state, dir)
    if (move === null) return
    pushMove = move
    pushT = 0
    for (const bond of move.formed) {
      const pa = atomCenter(state, atomById(state, bond.a))
      const pb = atomCenter(state, atomById(state, bond.b))
      particles.burst((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, accent(bond.order + 2), 9, 110)
    }
    if (move.cleared) {
      autoMs = 0
      for (const a of state.atoms) {
        const p = atomCenter(state, a)
        particles.burst(p.x, p.y, THEME.good, 7, 120)
      }
      if (state.levelIndex + 1 >= LEVELS.length) won = true
    }
  }

  const nextLevel = (): void => {
    if (!state.cleared) return
    if (state.levelIndex + 1 >= LEVELS.length) {
      won = true
      reportScore()
      return
    }
    loadLevel(state, state.levelIndex + 1)
    pushMove = null
    pushT = 0
    autoMs = -1
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (won) state = createMoleculeState(0, 20261116)
      else restartLevel(state)
      won = false
      pushMove = null
      pushT = 0
      autoMs = -1
      reportScore()
      loop.markDirty()
      return
    }
    if (!running) return // 暂停中游戏键失效（R/P 仍可用）
    if (event.code === 'KeyU') {
      event.preventDefault()
      if (state.cleared || pushMove !== null) return
      undoMove(state)
      reportScore()
      loop.markDirty()
      return
    }
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    tryMove(dir)
    loop.markDirty()
  }

  const loop = createFrameLoop(frame => {
    let busy = false
    clockMs += frame.wallMs
    if (pushMove !== null) {
      pushT += frame.dt * 1000
      if (pushT >= PUSH_MS) {
        pushMove = null
        pushT = 0
        reportScore()
      }
      busy = true
    }
    if (state.cleared && !won && state.levelIndex + 1 < LEVELS.length && autoMs >= 0) {
      autoMs += frame.dt * 1000
      if (autoMs >= AUTO_ADVANCE_MS) nextLevel()
      busy = true
    }
    if (particles.size() > 0) busy = true
    if (busy) loop.markDirty()
    if (frame.render || busy) paint(frame.dt * 1000)
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    paused = true
    loop.pause()
    paint(0)
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.resume()
    loop.markDirty()
  }
  const togglePause = (): void => {
    if (running) pause()
    else if (!won && !state.cleared) resume()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  reportScore()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const moleculeGame: MiniGameDefinition = {
  id: 'molecule',
  title: '分子构建 Molecule',
  icon: '⚛️',
  description: '推动原子让它们按化合价牵手——拼出目标分子的最短路线就是化学之美。',
  controls: ['方向键 / WASD：移动推原子（相邻自动成键）', 'U：撤销 · R：重开', 'P：暂停'],
  create: createMoleculeGame,
}
