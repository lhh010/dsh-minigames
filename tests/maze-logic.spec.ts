import { describe, expect, it } from 'vitest'
import {
  E, N, S, W, bfsDistance, canMove, generateMaze, solveLength, type Maze,
} from '../src/client/games/maze/logic.ts'

const SEEDS = [1, 42, 0x9e3779b9, 123456789, 20261023]
const SIZES: [number, number][] = [[3, 3], [5, 5], [11, 9], [19, 17], [7, 13]]

describe('maze logic', () => {
  it('generates the identical wall bitmask for the same seed', () => {
    for (const seed of SEEDS) {
      const a = generateMaze(seed, 11, 9)
      const b = generateMaze(seed, 11, 9)
      expect([...b.walls]).toEqual([...a.walls])
    }
  })

  it('produces the requested dimensions', () => {
    for (const [w, h] of SIZES) {
      const maze = generateMaze(7, w, h)
      expect(maze.w).toBe(w)
      expect(maze.h).toBe(h)
      expect(maze.walls.length).toBe(w * h)
    }
  })

  it('keeps interior walls symmetric (A east open ⇔ east neighbor west open)', () => {
    for (const seed of SEEDS) {
      for (const [w, h] of SIZES) {
        const maze = generateMaze(seed, w, h)
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const here = maze.walls[y * w + x]!
            if (x + 1 < w) {
              const east = maze.walls[y * w + x + 1]!
              expect((here & E) !== 0, `seed ${seed} ${w}x${h} (${x},${y}) E`).toBe((east & W) !== 0)
            }
            if (y + 1 < h) {
              const south = maze.walls[(y + 1) * w + x]!
              expect((here & S) !== 0, `seed ${seed} ${w}x${h} (${x},${y}) S`).toBe((south & N) !== 0)
            }
          }
        }
      }
    }
  })

  it('never opens border walls', () => {
    for (const [w, h] of SIZES) {
      const maze = generateMaze(99, w, h)
      for (let x = 0; x < w; x += 1) {
        expect(maze.walls[x]! & N).toBe(0)
        expect(maze.walls[(h - 1) * w + x]! & S).toBe(0)
      }
      for (let y = 0; y < h; y += 1) {
        expect(maze.walls[y * w]! & W).toBe(0)
        expect(maze.walls[y * w + w - 1]! & E).toBe(0)
      }
    }
  })

  it('canMove matches the wall bitmask in both directions', () => {
    const maze = generateMaze(4242, 11, 9)
    for (let y = 0; y < maze.h; y += 1) {
      for (let x = 0; x < maze.w; x += 1) {
        expect(canMove(maze, x, y, 'up')).toBe((maze.walls[y * maze.w + x]! & N) !== 0 && y > 0)
        expect(canMove(maze, x, y, 'down')).toBe((maze.walls[y * maze.w + x]! & S) !== 0 && y < maze.h - 1)
        expect(canMove(maze, x, y, 'left')).toBe((maze.walls[y * maze.w + x]! & W) !== 0 && x > 0)
        expect(canMove(maze, x, y, 'right')).toBe((maze.walls[y * maze.w + x]! & E) !== 0 && x < maze.w - 1)
      }
    }
  })

  it('canMove rejects out-of-bounds steps', () => {
    const maze = generateMaze(1, 3, 3)
    expect(canMove(maze, 0, 0, 'left')).toBe(false)
    expect(canMove(maze, 0, 0, 'up')).toBe(false)
    expect(canMove(maze, maze.w - 1, maze.h - 1, 'right')).toBe(false)
    expect(canMove(maze, maze.w - 1, maze.h - 1, 'down')).toBe(false)
  })

  it('is a perfect maze: every cell is reachable from (0,0) on many seeds/sizes', () => {
    for (const seed of SEEDS) {
      for (const [w, h] of SIZES) {
        const maze = generateMaze(seed, w, h)
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            expect(bfsDistance(maze, { x: 0, y: 0 }, { x, y }), `seed ${seed} ${w}x${h} target (${x},${y})`)
              .toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })

  it('is a spanning tree: open passages = cells - 1 (no loops)', () => {
    // Counting only N and W bits tallies each open passage exactly once.
    for (const seed of SEEDS) {
      for (const [w, h] of SIZES) {
        const maze = generateMaze(seed, w, h)
        let openings = 0
        for (let i = 0; i < maze.walls.length; i += 1) {
          if (maze.walls[i]! & N) openings += 1
          if (maze.walls[i]! & W) openings += 1
        }
        expect(openings, `seed ${seed} ${w}x${h}`).toBe(w * h - 1)
      }
    }
  })

  it('bfsDistance is 0 for the same cell and ≥ manhattan distance', () => {
    const maze = generateMaze(777, 11, 9)
    expect(bfsDistance(maze, { x: 4, y: 4 }, { x: 4, y: 4 })).toBe(0)
    for (let y = 0; y < maze.h; y += 1) {
      for (let x = 0; x < maze.w; x += 1) {
        const d = bfsDistance(maze, { x: 0, y: 0 }, { x, y })!
        expect(d).toBeGreaterThanOrEqual(x + y)
      }
    }
  })

  it('bfsDistance is symmetric', () => {
    const maze = generateMaze(31415, 13, 11)
    for (const [a, b] of [
      [{ x: 0, y: 0 }, { x: 12, y: 10 }],
      [{ x: 2, y: 8 }, { x: 9, y: 1 }],
    ] as [{ x: number; y: number }, { x: number; y: number }][]) {
      expect(bfsDistance(maze, a, b)).toBe(bfsDistance(maze, b, a))
    }
  })

  it('solveLength is positive and equals bfsDistance((0,0) → far corner)', () => {
    for (const seed of SEEDS) {
      for (const [w, h] of SIZES.slice(0, 3)) {
        const maze: Maze = generateMaze(seed, w, h)
        const d = solveLength(maze)
        expect(d).toBeGreaterThan(0)
        expect(d).toBe(bfsDistance(maze, { x: 0, y: 0 }, { x: w - 1, y: h - 1 }))
        expect(d).toBeGreaterThanOrEqual(w - 1 + h - 1)
      }
    }
  })

  it('handles the minimum 3×3 size', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const maze = generateMaze(seed, 3, 3)
      expect(maze.walls.length).toBe(9)
      expect(solveLength(maze)).toBeGreaterThanOrEqual(4) // manhattan corner distance
      // Spanning tree on 9 cells → exactly 8 open passages.
      let openings = 0
      for (let i = 0; i < 9; i += 1) {
        if (maze.walls[i]! & N) openings += 1
        if (maze.walls[i]! & W) openings += 1
      }
      expect(openings).toBe(8)
    }
  })
})
