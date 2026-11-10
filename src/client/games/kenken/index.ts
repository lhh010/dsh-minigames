/**
 * 贤贤 KenKen 游戏定义：把笼运算逻辑接成 MiniGameInstance —— 点击（或
 * 方向键）选中格子，数字键 1-6 填入，E 清除，N 切换铅笔候选模式；行/
 * 列重复与已填满笼的结果错误实时红显。全盘无误即过关：onScore 上报
 * 关卡分 + 时限奖励，1.5 秒后自动进入下一关（进度持久化）。R 重开、
 * P 暂停（过关倒计时冻结）、[ ] 在已到达关卡间切换。渲染按 dirty 按
 * 需重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { KENKEN_SIZE, cellErrors, computeScore, generateKenken, isWon, type KenkenPuzzle } from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderKenken } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
const MAX_LEVEL = 5

function createKenkenGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)

  let level = Math.min(readLevel('kenken'), MAX_LEVEL)
  let puzzle: KenkenPuzzle = generateKenken(level * 0x9e3779b9, level)
  let grid: number[][] = []
  let notes: number[][] = []
  let selected = { r: 0, c: 0 }
  let noteMode = false
  let errors: boolean[][] = []
  let solved = false
  let running = false
  let elapsedSecs = 0
  let shownSec = -1
  let elapsed = '0:00'
  let winText: string | null = null
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScoreLevel = -1
  const particles = createParticles()

  const emptyGrid = (): number[][] =>
    Array.from({ length: KENKEN_SIZE }, () => new Array<number>(KENKEN_SIZE).fill(0))

  const startLevel = (lv: number): void => {
    level = lv
    puzzle = generateKenken(level * 0x9e3779b9, level)
    grid = emptyGrid()
    notes = emptyGrid()
    selected = { r: 0, c: 0 }
    noteMode = false
    errors = cellErrors(puzzle, grid)
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    loop.markDirty()
  }

  const initialFit = fitCanvas(host, canvas, logicalW, logicalH)
  if (initialFit === null) throw new Error('dsh-minigames: kenken needs a 2d canvas context')
  const fit = initialFit
  const ctx = fit.ctx

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = Math.min(level + 1, MAX_LEVEL)
      saveLevel('kenken', next)
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle, grid)) return
    solved = true
    winText = '第 ' + level + ' 关完成 · ' + elapsed
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      options?.onScore?.(computeScore(level, elapsedSecs))
    }
    const center = cellCenter(Math.floor(KENKEN_SIZE / 2), Math.floor(KENKEN_SIZE / 2))
    particles.burst(center.x, center.y, THEME.gold, 20, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  /** 选中格填数（0 = 清除）；正式填数会清掉该格铅笔候选。 */
  const setCell = (r: number, c: number, v: number): void => {
    if (!running || solved) return
    if (grid[r]![c] === v) return
    grid[r]![c] = v
    if (v > 0) notes[r]![c] = 0
    errors = cellErrors(puzzle, grid)
    loop.markDirty()
    checkSolved()
  }

  /** 铅笔候选：数字 d 的位取反。 */
  const toggleNote = (r: number, c: number, d: number): void => {
    if (!running || solved || grid[r]![c]! > 0) return
    notes[r]![c]! ^= 1 << (d - 1)
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW) / rect.width
    const y = ((event.clientY - rect.top) * logicalH) / rect.height
    const cell = cellAt(x, y)
    if (cell === null) return
    selected = cell
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = Math.min(readLevel('kenken'), MAX_LEVEL)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 1 && next <= max) startLevel(next)
    } else if (event.code === 'KeyN') {
      event.preventDefault()
      if (running && !solved) {
        noteMode = !noteMode
        loop.markDirty()
      }
    } else if (event.code.startsWith('Arrow')) {
      event.preventDefault()
      if (!running) return
      if (event.code === 'ArrowUp') selected = { r: Math.max(0, selected.r - 1), c: selected.c }
      else if (event.code === 'ArrowDown') selected = { r: Math.min(KENKEN_SIZE - 1, selected.r + 1), c: selected.c }
      else if (event.code === 'ArrowLeft') selected = { r: selected.r, c: Math.max(0, selected.c - 1) }
      else selected = { r: selected.r, c: Math.min(KENKEN_SIZE - 1, selected.c + 1) }
      loop.markDirty()
    } else if (event.code.startsWith('Digit') || event.code.startsWith('Numpad')) {
      const digits = event.code.startsWith('Digit') ? event.code.slice(5) : event.code.slice(6)
      const v = Number(digits)
      if (running && v >= 1 && v <= 6) {
        event.preventDefault()
        if (noteMode) toggleNote(selected.r, selected.c, v)
        else setCell(selected.r, selected.c, v)
      }
    } else if (event.code === 'KeyE' || event.code === 'Backspace' || event.code === 'Delete') {
      event.preventDefault()
      if (running) setCell(selected.r, selected.c, 0)
    }
  }

  const loop = createFrameLoop(f => {
    if (running && !solved) {
      elapsedSecs += f.dt
      const secs = Math.floor(elapsedSecs)
      if (secs !== shownSec) {
        shownSec = secs
        const mm = String(Math.floor(secs / 60))
        const ss = String(secs % 60).padStart(2, '0')
        elapsed = mm + ':' + ss
        loop.markDirty()
      }
    }
    const animating = particles.size() > 0
    if (f.render || animating) {
      renderKenken(ctx, puzzle, { grid, notes, selected, errors }, elapsed, false, winText)
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderKenken(ctx, puzzle, { grid, notes, selected, errors }, elapsed, true, winText)
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
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLevel(level)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const kenkenGame: MiniGameDefinition = {
  id: 'kenken',
  title: '贤贤 KenKen',
  icon: '🦉',
  description: '每行每列不重复、每个笼子的数字还要算出目标——数独与四则运算的智慧联姻。',
  controls: ['点击 / 方向键选中格子 · 数字键 1-6 填入', 'E：清除 · N：铅笔候选 · 笼满即校验红显', 'R：重开 · [ ]：切换关卡 · P：暂停'],
  create: createKenkenGame,
}
