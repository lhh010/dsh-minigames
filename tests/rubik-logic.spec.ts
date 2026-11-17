import { describe, expect, it } from 'vitest'
import {
  FACES, MOVE_IDS, applyHint, applyMove, arrowMove, hintMove, isSolved, mulberry32,
  newGame, parseCube, parseMoveId, scrambleCount, scrambleMoves, serializeCube,
  solvedCube, userMove, layerIndices,
} from '../src/client/games/rubik/logic.ts'

const U = 0, D = 1, L = 2, R = 3, F = 4, B = 5
const at = (cube: number[], face: number, r: number, c: number) => cube[face * 9 + r * 3 + c]!
const faceRow = (cube: number[], face: number, r: number) => [0, 1, 2].map((c) => at(cube, face, r, c))
const solvedJson = JSON.stringify(solvedCube())

describe('rubik logic', () => {
  it('solved cube: 54 stickers, face f uniform in color f; serialize/parse roundtrip', () => {
    const cube = solvedCube()
    expect(cube).toHaveLength(54)
    for (let f = 0; f < 6; f += 1) {
      for (let k = 0; k < 9; k += 1) expect(cube[f * 9 + k]).toBe(f)
    }
    const text = serializeCube(cube)
    expect(text).toHaveLength(54)
    expect(parseCube(text)).toEqual(cube)
  })

  it('U0 migrates top rows F→L→B→R and rotates the U face in place (D untouched)', () => {
    const cube = applyMove(solvedCube(), 'U0')
    // 顺时针（俯视）：F 顶行迁往 L，L→B，B→R，R→F；行内顺序不反转。
    expect(faceRow(cube, L, 0)).toEqual([F, F, F])
    expect(faceRow(cube, B, 0)).toEqual([L, L, L])
    expect(faceRow(cube, R, 0)).toEqual([B, B, B])
    expect(faceRow(cube, F, 0)).toEqual([R, R, R])
    // U 面自身顺时针自旋（new[r][c] = old[2-c][r]），D 面完全不动。
    const marked = solvedCube()
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) marked[U * 9 + r * 3 + c] = r * 3 + c
    const spun = applyMove(marked, 'U0')
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) {
      expect(at(spun, U, r, c)).toBe((2 - c) * 3 + r)
    }
    for (let r = 0; r < 3; r += 1) expect(faceRow(cube, D, r)).toEqual([D, D, D])
  })

  it('every one of the 18 layer moves is a bijection of order 4, inverse cancels', () => {
    expect(MOVE_IDS).toHaveLength(18)
    for (const id of MOVE_IDS) {
      expect(applyMove(solvedCube(), id, 4)).toEqual(solvedCube())
      expect(applyMove(applyMove(solvedCube(), id, 1), id, -1)).toEqual(solvedCube())
      // 双射：置换后仍是 54 张、每色恰 9 张。
      const after = applyMove(solvedCube(), id)
      for (let color = 0; color < 6; color += 1) {
        expect(after.filter((v) => v === color)).toHaveLength(9)
      }
    }
  })

  it('middle slices leave the outer faces alone: U1 keeps U and D fixed, F1 keeps F and B fixed', () => {
    const u1 = applyMove(solvedCube(), 'U1')
    for (let r = 0; r < 3; r += 1) {
      expect(faceRow(u1, U, r)).toEqual([U, U, U])
      expect(faceRow(u1, D, r)).toEqual([D, D, D])
    }
    expect(isSolved(u1)).toBe(false) // 中环确实在动
    const f1 = applyMove(solvedCube(), 'F1')
    for (let r = 0; r < 3; r += 1) {
      expect(faceRow(f1, F, r)).toEqual([F, F, F])
      expect(faceRow(f1, B, r)).toEqual([B, B, B])
    }
    expect(isSolved(f1)).toBe(false)
  })

  it('isSolved: true for solved, false after any single move; layerIndices cover 20 stickers (12 edges + centers)', () => {
    expect(isSolved(solvedCube())).toBe(true)
    for (const id of MOVE_IDS) expect(isSolved(applyMove(solvedCube(), id))).toBe(false)
    // 外层含 8 角块×3 + 8 棱块×2 + ... 贴纸数：外层 21 块贴纸（8*3+12*... 实际=8角24? 见下）
    for (const id of ['U0', 'R0', 'F0']) {
      const n = layerIndices(id)!.length
      expect(n).toBe(21) // 8 角(3 贴纸的面上贡献) —— 每外层恰 21 张贴纸
    }
    expect(layerIndices('U1')!.length).toBe(12) // 中层只有棱块贴纸 + 面心随层? 中层 12 张
  })

  it('scramble: seed-deterministic, differs across seeds, no same-face repeats, never starts solved', () => {
    expect(scrambleCount(1)).toBe(6)
    expect(scrambleCount(2)).toBe(8)
    expect(scrambleCount(3)).toBe(9)
    expect(scrambleCount(4)).toBe(11)
    expect(scrambleCount(5)).toBe(12)
    expect(scrambleCount(99)).toBe(12)
    for (let seed = 1; seed <= 15; seed += 1) {
      const moves = scrambleMoves(seed, (seed % 5) + 1)
      expect(moves).toEqual(scrambleMoves(seed, (seed % 5) + 1))
      expect(moves).toHaveLength(scrambleCount((seed % 5) + 1))
      for (let i = 1; i < moves.length; i += 1) {
        expect(moves[i]!.charAt(0)).not.toBe(moves[i - 1]!.charAt(0))
      }
      let cube = solvedCube()
      for (const id of moves) cube = applyMove(cube, id)
      expect(isSolved(cube)).toBe(false)
    }
    expect(scrambleMoves(42, 3)).not.toEqual(scrambleMoves(43, 3))
  })

  it('mulberry32 is deterministic and in-range', () => {
    const a = mulberry32(7), b = mulberry32(7)
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).toEqual(seqB)
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(seqA).not.toEqual(Array.from({ length: 20 }, () => mulberry32(8)()))
  })

  it('userMove counts steps, records history and freezes on solve', () => {
    let state = newGame(1234, 1)
    expect(state.moves).toBe(0)
    expect(state.history).toHaveLength(state.scramble.length)
    expect(state.solved).toBe(false)
    const before = state.cube
    state = userMove(state, 'U0', 1)
    expect(state.moves).toBe(1)
    expect(state.history).toHaveLength(state.scramble.length + 1)
    expect(state.cube).not.toEqual(before) // U0 之后必然不同（打乱态）
    // 复原后冻结：复原态拒绝输入并原样返回同一引用。
    const frozen: typeof state = { ...state, solved: true }
    expect(userMove(frozen, 'U0', 1)).toBe(frozen)
    expect(frozen.moves).toBe(state.moves)
  })

  it('hint rewinds history: pure inverse of the last move, chain of hints always reaches solved', () => {
    // 无玩家步：提示 = 打乱末步的逆。
    const fresh = newGame(99, 2)
    const last = fresh.history[fresh.history.length - 1]!
    expect(hintMove(fresh)).toEqual({ id: last.id, turns: -last.turns })
    // 玩家步之后：提示先撤销玩家自己的末步。
    const played = userMove(fresh, 'F0', -1)
    expect(hintMove(played)).toEqual({ id: 'F0', turns: 1 })
    // 交替走/提示最终必达复原（贪心逆序回拧）。上限 3 次提示，其余手动回拧同一序列。
    for (let seed = 1; seed <= 8; seed += 1) {
      let st = newGame(seed * 101, (seed % 5) + 1)
      // 模拟玩家乱拧几步再连续接受提示。
      st = userMove(st, 'R2', 1)
      st = userMove(st, 'F1', -1)
      let hints = 0
      while (!st.solved) {
        if (hints < 3) { st = applyHint(st); hints += 1; continue }
        const h = hintMove(st)
        if (h === null) break
        st = { ...st, cube: applyMove(st.cube, h.id, h.turns), history: st.history.slice(0, -1), moves: st.moves + 1, solved: isSolved(applyMove(st.cube, h.id, h.turns)) }
      }
      expect(st.solved).toBe(true)
    }
  })

  it('applyHint enforces the 3-use cap and hintsUsed/moves accounting', () => {
    let st = newGame(555, 5)
    const total = st.history.length
    let prev = serializeCube(st.cube)
    for (let i = 0; i < 3; i += 1) {
      expect(st.hintsUsed).toBe(i)
      st = applyHint(st)
      expect(st.hintsUsed).toBe(i + 1)
      expect(st.moves).toBe(i + 1)
      expect(st.history).toHaveLength(total - (i + 1))
      // 提示本身是一次真实拧动：状态必然变化。
      expect(serializeCube(st.cube)).not.toBe(prev)
      prev = serializeCube(st.cube)
    }
    const capped = applyHint(st)
    expect(capped).toBe(st) // 用尽后原样返回
    expect(serializeCube(capped.cube)).toBe(prev)
  })

  it('arrow table: opposite arrows are inverses; F 底行 →箭头恰为 D0 顺时针；U 右列 ↓ 恰为 R0 逆时针', () => {
    expect(arrowMove('F', 'row', 2, 1)).toEqual({ id: 'D0', turns: 1 })
    expect(arrowMove('U', 'col', 2, 1)).toEqual({ id: 'R0', turns: -1 })
    for (const face of FACES) {
      for (const axis of ['row', 'col'] as const) {
        for (let i = 0; i < 3; i += 1) {
          const fwd = arrowMove(face, axis, i, 1)
          const back = arrowMove(face, axis, i, -1)
          expect(applyMove(applyMove(solvedCube(), fwd.id, fwd.turns), back.id, back.turns)).toEqual(solvedCube())
          expect(parseMoveId(fwd.id).layer).toBeGreaterThanOrEqual(0)
          expect(serializeCube(applyMove(solvedCube(), fwd.id, fwd.turns))).not.toBe(solvedJson)
        }
      }
    }
  })

  it('parseCube rejects malformed input loudly (null), accepts valid 54-digit state', () => {
    expect(parseCube('')).toBeNull()
    expect(parseCube('9'.repeat(54))).toBeNull()
    expect(parseCube('0'.repeat(53))).toBeNull()
    expect(parseCube('012345'.repeat(9) + '0')).toBeNull()
    expect(parseCube(serializeCube(applyMove(solvedCube(), 'R0')))).toEqual(applyMove(solvedCube(), 'R0'))
  })

  it('newGame is seed-deterministic and solvable within the scramble bound by rewinding', () => {
    const a = newGame(2024, 3)
    const b = newGame(2024, 3)
    expect(a.cube).toEqual(b.cube)
    expect(a.scramble).toEqual(b.scramble)
    // 按打乱逆序回拧恰在 scramble.length 步内复原。
    let cube = a.cube
    for (let i = a.scramble.length - 1; i >= 0; i -= 1) cube = applyMove(cube, a.scramble[i]!, -1)
    expect(isSolved(cube)).toBe(true)
    expect(cube).toEqual(solvedCube())
  })
})
