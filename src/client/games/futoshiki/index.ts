/**
 * 不等数独游戏定义：把纯谜面逻辑接到画布实例上——点击选中格子，数字键
 * 填入，E 清除，方向键移动选中，R 重开、P 暂停，[ / ] 在已解锁关卡间
 * 切换。错误即时红显（行列重复/不等违反），dirty 按需重绘。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { LEVELS, createPuzzle, findConflicts, isSolved, mulberry32, setCell, type FutoshikiPuzzle } from './logic.ts'
import { cellAt, cellCenter, LOGICAL_H, LOGICAL_W, renderFutoshiki, type FutoshikiView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, accent, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

const GAME_ID = 'futoshiki'
/** 过关基础分（按关卡递增）。 */
const LEVEL_BASE: readonly number[] = [60, 90, 130, 190, 280]

function createFutoshikiGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: futoshiki needs a 2d canvas context')
  const ctx = fit.ctx

  let level = Math.min(Math.max(readLevel(GAME_ID), 1), LEVELS.length)
  let puzzle: FutoshikiPuzzle = createPuzzle(level - 1, 0)
  let grid: readonly number[] = puzzle.givens
  let selected: number | null = null
  let running = false
  let paused = false
  let won = false
  let lastScoreToken = -1
  const particles = createParticles()

  const givenMask = (): boolean[] => puzzle.givens.map(v => v !== 0)
  const filledCount = (): number => grid.filter(v => v !== 0).length

  const newGame = (): void => {
    // 种子取自时钟：每局谜面不同；logic 侧同 (关卡, seed) 可复现。
    const seed = (Date.now() ^ (performance.now() * 1000)) >>> 0
    puzzle = createPuzzle(level - 1, mulberry32(seed)() * 0x7fffffff | 0)
    grid = puzzle.givens
    selected = null
    won = false
    loop.markDirty()
  }

  const reportScore = (): void => {
    const token = level
    if (token === lastScoreToken) return
    lastScoreToken = token
    options?.onScore?.(LEVEL_BASE[level - 1]!)
  }

  const buildView = (): FutoshikiView => {
    const conflicts = findConflicts(grid, puzzle.constraints)
    return {
      size: puzzle.size,
      grid,
      givenMask: givenMask(),
      constraints: puzzle.constraints,
      selected,
      conflictCells: conflicts.cells,
      conflictSigns: conflicts.signs,
      levelLabel: LEVELS[level - 1]!.label,
      filled: filledCount(),
      statusText: won ? '过关！' : null,
      statusSub: '全部约束满足 · R 再来一局',
      statusColor: THEME.good,
      paused,
    }
  }

  const placeValue = (v: number): void => {
    if (!running || paused || won) return
    if (selected === null) return
    if (puzzle.givens[selected]! !== 0) return
    if (v < 1 || v > puzzle.size) return
    grid = setCell(grid, selected, v)
    const center = cellCenter(puzzle.size, selected)
    particles.burst(center.x, center.y, accent(level), 5, 80)
    checkWin()
    loop.markDirty()
  }

  const clearCell = (): void => {
    if (!running || paused || won) return
    if (selected === null) return
    if (puzzle.givens[selected]! !== 0) return
    if (grid[selected] === 0) return
    grid = setCell(grid, selected, 0)
    loop.markDirty()
  }

  const moveSelection = (dr: number, dc: number): void => {
    if (!running || paused || won) return
    const size = puzzle.size
    if (selected === null) {
      selected = 0
    } else {
      const r = Math.min(Math.max(Math.floor(selected / size) + dr, 0), size - 1)
      const c = Math.min(Math.max((selected % size) + dc, 0), size - 1)
      selected = r * size + c
    }
    loop.markDirty()
  }

  const checkWin = (): void => {
    if (won) return
    if (!isSolved(grid, puzzle.constraints)) return
    won = true
    particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 24, 170)
    reportScore()
    saveLevel(GAME_ID, Math.min(level + 1, LEVELS.length))
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused || won) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const cell = cellAt(x, y, puzzle.size)
    if (cell < 0) return
    selected = cell
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      newGame()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyE' || event.code === 'Backspace' || event.code === 'Delete') {
      event.preventDefault()
      clearCell()
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault()
      moveSelection(0, -1)
    } else if (event.code === 'ArrowRight') {
      event.preventDefault()
      moveSelection(0, 1)
    } else if (event.code === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1, 0)
    } else if (event.code === 'ArrowDown') {
      event.preventDefault()
      moveSelection(1, 0)
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      const max = Math.min(readLevel(GAME_ID), LEVELS.length)
      const target = level + (event.code === 'BracketRight' ? 1 : -1)
      if (target >= 1 && target <= max) {
        level = target
        newGame()
      }
    } else if (event.key >= '1' && event.key <= '9') {
      event.preventDefault()
      placeValue(Number(event.key))
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (!f.render && particles.size() === 0) return
    renderFutoshiki(ctx, buildView())
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running || paused) return
    paused = true
    loop.pause()
    renderFutoshiki(ctx, buildView())
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

export const futoshikiGame: MiniGameDefinition = {
  id: 'futoshiki',
  title: '不等数独 Futoshiki',
  icon: '⛓️',
  description: '每行每列 1 到 N 恰好一次，还要满足相邻格之间的大小不等号——链条推理的乐趣。',
  controls: ['点击格子选中 · 数字键 1-N 填入', '方向键移动选中 · E：清除', 'R：重开 · P：暂停', '[ / ]：切换关卡'],
  create: createFutoshikiGame,
}
