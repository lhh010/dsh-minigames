/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryState } from '../src/client/games/memory/logic.ts'
import type { SnakeState } from '../src/client/games/snake/logic.ts'
import type { TetrisState } from '../src/client/games/tetris/board.ts'

const mocks = vi.hoisted(() => {
  const ctx = {} as CanvasRenderingContext2D
  const dispose = vi.fn()
  const fitCanvas = vi.fn(() => ({ ctx, dispose }))
  const focusGameHost = vi.fn((host: HTMLElement) => { host.tabIndex = 0; host.focus() })
  const gameHasFocus = vi.fn((host: HTMLElement) => {
    const active = document.activeElement
    return active === host || (active instanceof HTMLElement && host.contains(active))
  })
  return {
    ctx,
    dispose,
    fitCanvas,
    focusGameHost,
    gameHasFocus,
    renderSnake: vi.fn(),
    renderTetris: vi.fn(),
    renderMemory: vi.fn(),
    renderSudoku: vi.fn(),
  }
})

vi.mock('../src/client/games/canvas-fit.ts', () => ({ fitCanvas: mocks.fitCanvas }))
vi.mock('../src/client/games/focus.ts', () => ({
  focusGameHost: mocks.focusGameHost,
  gameHasFocus: mocks.gameHasFocus,
}))
vi.mock('../src/client/games/snake/render.ts', () => ({
  LOGICAL_W: 416,
  LOGICAL_H: 342,
  renderSnake: mocks.renderSnake,
}))
vi.mock('../src/client/games/tetris/render.ts', () => ({
  BOARD_W: 220,
  BOARD_H: 440,
  LOGICAL_W: 340,
  renderTetris: mocks.renderTetris,
}))
vi.mock('../src/client/games/memory/render.ts', () => ({
  CELL: 48,
  HUD_H: 32,
  LOGICAL_W: 192,
  LOGICAL_H: 224,
  renderMemory: mocks.renderMemory,
}))
vi.mock('../src/client/games/sudoku/render.ts', () => ({
  CELL: 40,
  HUD_H: 30,
  PAD_H: 38,
  BOARD_H: 360,
  LOGICAL_W: 360,
  LOGICAL_H: 428,
  renderSudoku: mocks.renderSudoku,
}))

import { snakeGame } from '../src/client/games/snake/index.ts'
import { tetrisGame } from '../src/client/games/tetris/index.ts'
import { memoryGame } from '../src/client/games/memory/index.ts'
import { sudokuGame } from '../src/client/games/sudoku/index.ts'
import type { MiniGameInstance } from '../src/client/games/types.ts'

const MEMORY_CELL = 48
const MEMORY_HUD = 32
const MEMORY_COLS = 4
const MEMORY_LOGICAL_W = 192
const MEMORY_LOGICAL_H = 224

let frameId = 0
let instances: MiniGameInstance[] = []

function host(): HTMLDivElement {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return element
}

function key(code: string, repeat = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, code, repeat })
}

function setCanvasRect(canvas: HTMLCanvasElement, width: number, height: number): void {
  canvas.getBoundingClientRect = () => ({
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
}

function memoryClick(canvas: HTMLCanvasElement, index: number): void {
  const row = Math.floor(index / MEMORY_COLS)
  const column = index % MEMORY_COLS
  canvas.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    button: 0,
    clientX: column * MEMORY_CELL + MEMORY_CELL / 2,
    clientY: MEMORY_HUD + row * MEMORY_CELL + MEMORY_CELL / 2,
  }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  instances = []
  frameId = 0
  mocks.fitCanvas.mockClear()
  mocks.focusGameHost.mockClear()
  mocks.gameHasFocus.mockClear()
  mocks.dispose.mockClear()
  mocks.renderSnake.mockClear()
  mocks.renderTetris.mockClear()
  mocks.renderMemory.mockClear()
  mocks.renderSudoku.mockClear()
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => ++frameId))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  for (const instance of instances) instance.destroy()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('real game lifecycle contracts', () => {
  it('sends one pause and restart callback for a held P/R key', () => {
    for (const game of [snakeGame, tetrisGame, sudokuGame]) {
      const onPauseRequest = vi.fn()
      const onRestartRequest = vi.fn()
      const instance = game.create(host(), { onPauseRequest, onRestartRequest })
      instances.push(instance)

      window.dispatchEvent(key('KeyP'))
      window.dispatchEvent(key('KeyP', true))
      window.dispatchEvent(key('KeyR'))
      window.dispatchEvent(key('KeyR', true))

      expect(onPauseRequest, `${game.id} pause callback`).toHaveBeenCalledTimes(1)
      expect(onRestartRequest, `${game.id} restart callback`).toHaveBeenCalledTimes(1)
    }
  })

  it('does not mutate the snake or tetris board while paused', () => {
    const snakeInstance = snakeGame.create(host())
    instances.push(snakeInstance)
    const snakeState = mocks.renderSnake.mock.calls.at(-1)?.[1] as SnakeState
    const snakeBefore = JSON.stringify(snakeState.snake)
    snakeInstance.pause()
    window.dispatchEvent(key('ArrowUp'))
    expect(JSON.stringify(snakeState.snake)).toBe(snakeBefore)

    const tetrisInstance = tetrisGame.create(host())
    instances.push(tetrisInstance)
    const tetrisState = mocks.renderTetris.mock.calls.at(-1)?.[1] as TetrisState
    const xBefore = tetrisState.current?.x
    tetrisInstance.pause()
    window.dispatchEvent(key('ArrowRight'))
    expect(tetrisState.current?.x).toBe(xBefore)
  })

  it('reports a memory score only after all pairs are completed', () => {
    const onScore = vi.fn((score: number) => score)
    const instance = memoryGame.create(host(), { onScore })
    instances.push(instance)
    const canvas = document.body.querySelector<HTMLCanvasElement>('canvas')
    expect(canvas).not.toBeNull()
    setCanvasRect(canvas!, MEMORY_LOGICAL_W, MEMORY_LOGICAL_H)
    const state = mocks.renderMemory.mock.calls.at(-1)?.[1] as MemoryState
    const bySymbol = new Map<number, number[]>()
    state.cards.forEach((symbol, index) => {
      if (symbol === null) return
      const indexes = bySymbol.get(symbol) ?? []
      indexes.push(index)
      bySymbol.set(symbol, indexes)
    })

    expect(onScore).not.toHaveBeenCalled()
    for (const indexes of bySymbol.values()) {
      memoryClick(canvas!, indexes[0]!)
      memoryClick(canvas!, indexes[1]!)
    }

    expect(state.finished).toBe(true)
    expect(onScore).toHaveBeenCalledTimes(1)
    expect(onScore.mock.calls[0]?.[0]).toBeGreaterThan(0)
  })

  it('freezes a mismatched memory reveal while paused and resumes its timer', () => {
    vi.useFakeTimers()
    const instance = memoryGame.create(host())
    instances.push(instance)
    const canvas = document.body.querySelector<HTMLCanvasElement>('canvas')
    expect(canvas).not.toBeNull()
    setCanvasRect(canvas!, MEMORY_LOGICAL_W, MEMORY_LOGICAL_H)
    const state = mocks.renderMemory.mock.calls.at(-1)?.[1] as MemoryState
    const first = 0
    const second = state.cards.findIndex((symbol, index) => index !== first && symbol !== state.cards[first])
    expect(second).toBeGreaterThan(0)

    memoryClick(canvas!, first)
    memoryClick(canvas!, second)
    expect(state.flipped).toHaveLength(2)

    instance.pause()
    vi.advanceTimersByTime(2000)
    expect(state.flipped).toHaveLength(2)
    instance.resume()
    vi.advanceTimersByTime(1100)
    expect(state.flipped).toHaveLength(0)
  })
})
