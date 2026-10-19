import { describe, expect, it } from 'vitest'
import {
  BOX_SCORE, CLEAR_SCORE, LEVELS, applyMove, createSokobanState, isCleared,
  parseBuiltinLevels, parseLevel, restartLevel, undoMove,
  type SokobanLevel, type SokobanState,
} from '../src/client/games/sokoban/logic.ts'

describe('sokoban logic', () => {
  it('parses every tile kind', () => {
    const level = parseLevel(`
#####
#@$.#
# * #
#####
`)
    expect([level.rows, level.cols]).toEqual([4, 5])
    expect(level.player).toEqual({ r: 1, c: 1 })
    // wall / floor / goal / box / box-on-goal
    expect(level.walls[0]!.every(Boolean)).toBe(true)
    expect(level.walls[1]!.every(Boolean)).toBe(false)
    expect(level.goals[1]![3]).toBe(true)
    expect(level.boxes[1]![2]).toBe(true)
    expect(level.goals[2]![2]).toBe(true)
    expect(level.boxes[2]![2]).toBe(true)
    // player-on-goal
    expect(parseLevel('####\n#+$#\n####').goals[1]![1]).toBe(true)
  })

  it('rejects invalid levels', () => {
    expect(() => parseLevel('####\n# .\n####')).toThrow() // no player
    expect(() => parseLevel('#####\n#@$@#\n#####')).toThrow() // two players
    expect(() => parseLevel('#####\n#@$.#\n#####\n#$###')).toThrow() // boxes != goals
    expect(() => parseLevel('')).toThrow()
  })

  it('rejects moves into walls and box-into-box / box-into-wall', () => {
    const s = createSokobanState(0) // #### / #@$.# / ####
    expect(applyMove(s, 'up')).toBeNull() // wall above
    expect(applyMove(s, 'down')).toBeNull() // wall below
    expect(s.moves).toBe(0)
    const v = makeState(`
#######
#@$$..#
#######
`)
    expect(applyMove(v, 'right')).toBeNull() // box-into-box
    const w = makeState(`
#####
#@$##
#.  #
#####
`)
    expect(applyMove(w, 'right')).toBeNull() // box-into-wall
  })

  it('pushes a box onto a goal and scores', () => {
    const s = makeState(`
#####
#@$.#
#####
`)
    const move = applyMove(s, 'right')!
    expect(move).not.toBeNull()
    expect(move.boxTo).toEqual({ r: 1, c: 3 })
    expect(move.scored).toBe(true)
    expect(s.score).toBe(BOX_SCORE + CLEAR_SCORE)
    expect(s.moves).toBe(1)
    expect(isCleared(s)).toBe(true)
    expect(s.cleared).toBe(true)
  })

  it('scores only when a box lands on a goal', () => {
    const s = makeState(`
########
# @$  .#
########
`)
    const move = applyMove(s, 'right')!
    expect(move.boxTo).toEqual({ r: 1, c: 4 })
    expect(move.scored).toBe(false)
    expect(s.score).toBe(0)
    expect(s.cleared).toBe(false)
  })

  it('undo restores the state exactly', () => {
    const s = makeState(`
#######
#@  $.#
#######
`)
    const before = snapshot(s)
    applyMove(s, 'right')
    applyMove(s, 'right')
    applyMove(s, 'right') // pushes the box onto the goal -> +100 +500 clear
    expect(s.cleared).toBe(true)
    const undone = undoMove(s)!
    expect(undone.boxTo).toEqual({ r: 1, c: 5 })
    expect(s.cleared).toBe(false)
    expect(s.score).toBe(0)
    undoMove(s)
    undoMove(s)
    expect(snapshot(s)).toEqual(before)
    expect(undoMove(s)).toBeNull() // nothing left to undo
  })

  it('win detection requires every box on a goal', () => {
    const s = makeState(`
######
# @$.#
######
`)
    const two = makeState(`
#######
#.$@$.#
#######
`)
    applyMove(s, 'right')
    expect(isCleared(s)).toBe(true)
    expect(s.cleared).toBe(true)
    expect(two.cleared).toBe(false)
    expect(isCleared(two)).toBe(false)
  })

  it('restartLevel rolls back to the level entry score and layout', () => {
    const s = makeState(`
#######
#@  $.#
#######
`)
    applyMove(s, 'right')
    applyMove(s, 'right')
    applyMove(s, 'right') // box reaches the goal, level clears
    expect(s.score).toBe(BOX_SCORE + CLEAR_SCORE)
    restartLevel(s)
    expect(s.score).toBe(0)
    expect(s.moves).toBe(0)
    expect(s.cleared).toBe(false)
    expect(s.player).toEqual({ r: 1, c: 1 })
  })

  it('all 10 levels parse and are structurally valid', () => {
    expect(LEVELS).toHaveLength(10)
    for (const level of parseBuiltinLevels()) {
      expect(level.rows).toBeLessThanOrEqual(12)
      expect(level.cols).toBeLessThanOrEqual(12)
      const boxes = level.boxes.flat().filter(Boolean).length
      const goals = level.goals.flat().filter(Boolean).length
      expect(boxes).toBe(goals)
      expect(boxes).toBeGreaterThan(0)
    }
  })

  it('all 10 levels are solvable (BFS over pushes)', () => {
    parseBuiltinLevels().forEach((level, i) => {
      expect(isSolvable(level), `level ${i + 1} should be solvable`).toBe(true)
    })
  })
})

/** Build a one-off state from level text (score starts at 0). */
function makeState(text: string): SokobanState {
  const state = createSokobanState(0)
  const level = parseLevel(text)
  state.rows = level.rows
  state.cols = level.cols
  state.walls = level.walls
  state.goals = level.goals
  state.boxes = level.boxes.map(row => [...row])
  state.player = { ...level.player }
  state.moves = 0
  state.history = []
  state.cleared = false
  return state
}

function snapshot(s: SokobanState): string {
  return JSON.stringify({ boxes: s.boxes, player: s.player, moves: s.moves, score: s.score })
}

/**
 * Breadth-first search over push states: a node is (player cell, box set);
 * edges are single pushes the player can walk into position for. Goals do
 * not need to be matched one-to-one, so clearing == all boxes on goals.
 */
function isSolvable(level: SokobanLevel): boolean {
  const { rows, cols, walls, goals } = level
  const boxes0 = new Set<string>()
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) if (level.boxes[r]![c]!) boxes0.add(`${r},${c}`)
  }
  const floor = (r: number, c: number): boolean =>
    r >= 0 && r < rows && c >= 0 && c < cols && !walls[r]![c]!

  const key = (r: number, c: number): string => `${r},${c}`
  const goalCount = goals.flat().filter(Boolean).length

  /** Cells the player can reach without pushing anything. */
  const reach = (pr: number, pc: number, boxes: Set<string>): Set<string> => {
    const seen = new Set<string>([key(pr, pc)])
    const queue: [number, number][] = [[pr, pc]]
    while (queue.length > 0) {
      const [r, c] = queue.pop()!
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = r + dr
        const nc = c + dc
        const k = key(nr, nc)
        if (floor(nr, nc) && !boxes.has(k) && !seen.has(k)) {
          seen.add(k)
          queue.push([nr, nc])
        }
      }
    }
    return seen
  }

  const start = { pr: level.player.r, pc: level.player.c, boxes: boxes0 }
  const visited = new Set<string>()
  const queue: { pr: number; pc: number; boxes: Set<string> }[] = [start]
  visited.add(`${key(start.pr, start.pc)}|${[...boxes0].sort().join(';')}`)
  while (queue.length > 0) {
    const node = queue.shift()!
    let onGoals = 0
    for (const b of node.boxes) {
      const [br, bc] = b.split(',').map(Number) as [number, number]
      if (goals[br]![bc]!) onGoals += 1
    }
    if (onGoals === goalCount) return true
    const canStand = reach(node.pr, node.pc, node.boxes)
    for (const b of node.boxes) {
      const [br, bc] = b.split(',').map(Number) as [number, number]
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const fr = br + dr
        const fc = bc + dc // box moves here
        const br2 = br - dr
        const bc2 = bc - dc // player stands here to push
        if (!floor(fr, fc) || node.boxes.has(key(fr, fc))) continue
        if (!canStand.has(key(br2, bc2))) continue
        const next = new Set(node.boxes)
        next.delete(b)
        next.add(key(fr, fc))
        const vkey = `${key(fr, fc)}|${[...next].sort().join(';')}`
        if (visited.has(vkey)) continue
        visited.add(vkey)
        queue.push({ pr: br, pc: bc, boxes: next })
      }
    }
  }
  return false
}
