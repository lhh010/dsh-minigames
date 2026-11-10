/**
 * 马踏棋盘游戏定义：把纯巡游逻辑接到画布实例上——点击高亮格走马步，
 * H 触发 Warnsdorff 最小出度提示（每局 3 次，过关计分扣减），R 重开、
 * P 暂停，[ / ] 在已解锁档位（5x5/6x6/8x8）间切换。dirty 按需重绘。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  BOARD_SIZES, bestHint, createTour, moveTour, mulberry32, randomStart, undoTour,
  reachableMoves, tourStatus, type TourState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderTour, squareAt, type TourView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

const GAME_ID = 'knightour'
const HINT_FLASH_MS = 2500
const LEVEL_LABELS: readonly string[] = ['5×5·热身', '6×6·进阶', '8×8·完整挑战']
const LEVEL_BASE: readonly number[] = [40, 72, 120]
const HINT_PENALTY = 12

function createKnightourGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: knightour needs a 2d canvas context')
  const ctx = fit.ctx

  let level = Math.min(Math.max(readLevel(GAME_ID), 1), BOARD_SIZES.length)
  let state: TourState = createTour(BOARD_SIZES[level - 1]!, 0)
  let running = false
  let paused = false
  let hintUntil = 0
  let hintCell: number | null = null
  let lastScoreToken = -1
  const particles = createParticles()

  const newGame = (): void => {
    // 种子取自时钟：每局起点不同；logic 侧同种子可复现。
    const rng = mulberry32((Date.now() ^ (performance.now() * 1000)) >>> 0)
    state = createTour(BOARD_SIZES[level - 1]!, randomStart(BOARD_SIZES[level - 1]!, rng))
    hintUntil = 0
    hintCell = null
    loop.markDirty()
  }

  const overlayFor = (): { text: string; sub: string; color: string } | null => {
    const st = tourStatus(state)
    if (st === 'won') return { text: '巡游完成！', sub: '访遍全盘一步不重 · R 重开', color: THEME.good }
    if (st === 'stuck') return { text: '无路可走', sub: '未访满即困毙 · R 重开', color: THEME.bad }
    return null
  }

  const reportScore = (): void => {
    const token = level * 10000 + state.path.length
    if (token === lastScoreToken) return
    lastScoreToken = token
    const score = Math.max(1, LEVEL_BASE[level - 1]! + state.path.length - state.hintsUsed * HINT_PENALTY)
    options?.onScore?.(score)
  }

  const buildView = (blink: number): TourView => {
    const overlay = overlayFor()
    const now = performance.now()
    const hintOn = now < hintUntil && tourStatus(state) === 'playing'
    return {
      state,
      reachable: reachableMoves(state),
      hintCell: hintOn ? hintCell : null,
      hintActive: hintOn,
      blink,
      levelLabel: LEVEL_LABELS[level - 1]!,
      hintsLeft: 3 - state.hintsUsed,
      statusText: overlay?.text ?? null,
      statusSub: overlay?.sub ?? '',
      statusColor: overlay?.color ?? THEME.text,
      paused,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused) return
    if (tourStatus(state) !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const cell = squareAt(x, y, state.size)
    if (cell < 0) return
    if (!reachableMoves(state).includes(cell)) return
    const next = moveTour(state, cell)
    if (next === null) return
    state = next
    hintCell = null
    const center = cellCenterView(state.size, cell)
    particles.burst(center.x, center.y, accentOfStep(state), 6, 90)
    const st = tourStatus(state)
    if (st === 'won') {
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 22, 170)
      reportScore()
      saveLevel(GAME_ID, Math.min(level + 1, BOARD_SIZES.length))
    }
    loop.markDirty()
  }

  // 渲染模块不暴露格心坐标，这里按同一几何重算用于粒子落点。
  const BOARD_PX_LOCAL = Math.min(LOGICAL_W - 28, LOGICAL_H - 60)
  const cellCenterView = (size: number, cell: number): { x: number; y: number } => {
    const step = BOARD_PX_LOCAL / size
    const bx = (LOGICAL_W - BOARD_PX_LOCAL) / 2
    const by = 46 + (LOGICAL_H - 46 - BOARD_PX_LOCAL) / 2
    return { x: bx + (cell % size) * step + step / 2, y: by + Math.floor(cell / size) * step + step / 2 }
  }
  const accentOfStep = (s: TourState): string => THEME.accents[(s.path.length - 1) % THEME.accents.length]!

  const useHint = (): void => {
    if (!running || paused) return
    if (tourStatus(state) !== 'playing') return
    if (state.hintsUsed >= 3) return
    const cell = bestHint(state)
    if (cell === null) return
    state = { size: state.size, path: state.path, visited: state.visited, hintsUsed: state.hintsUsed + 1 }
    hintCell = cell
    hintUntil = performance.now() + HINT_FLASH_MS
    loop.markDirty()
  }

  /** 撤回上一步（U）：路径退一格；起点不可撤。 */
  const undoMove = (): void => {
    if (!running || paused) return
    if (tourStatus(state) !== 'playing') return
    const prev = undoTour(state)
    if (prev === null) return
    state = prev
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      newGame()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      useHint()
    } else if (event.code === 'KeyU') {
      event.preventDefault()
      undoMove()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      const max = Math.min(readLevel(GAME_ID), BOARD_SIZES.length)
      const target = level + (event.code === 'BracketRight' ? 1 : -1)
      if (target >= 1 && target <= max) {
        level = target
        newGame()
      }
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const now = performance.now()
    const hintOn = now < hintUntil
    if (!f.render && particles.size() === 0 && !hintOn) return
    const blink = hintOn ? (1 - ((hintUntil - now) % 600) / 600) : 0
    renderTour(ctx, buildView(blink))
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running || paused) return
    paused = true
    loop.pause()
    renderTour(ctx, buildView(0))
  }
  const resume = (): void => {
    if (!running) return
    paused = false
    loop.start()
    loop.markDirty()
  }
  const togglePause = (): void => {
    if (paused) resume()
    else pause()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  newGame()
  running = true
  loop.start()

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

export const knightourGame: MiniGameDefinition = {
  id: 'knightour',
  title: '马踏棋盘 Knights Tour',
  icon: '🎠',
  description: '马走日访遍全盘不重复——一步踏错的哈密顿路径挑战。',
  controls: ['点击高亮格：走马步', 'U：撤回一步（起点不可撤）', 'H：提示 Warnsdorff 最小出度格（每局 3 次，扣分）', 'R：重开 · P：暂停', '[ / ]：切换 5×5 / 6×6 / 8×8 档位'],
  create: createKnightourGame,
}
