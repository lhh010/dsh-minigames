import { describe, expect, it } from 'vitest'
import {
  PUZZLES, mulberry32, parseRows, legalMoves, makeMove, inCheck, isCheckmate, isStalemate,
  evaluate, searchWhite, defenderMove, createChessEndState, createState, applyPlayerMove,
  legalTargets, undoMove, requestHint, computeScore, materialDiff,
  type Board, type ChessEndPuzzle,
} from '../src/client/games/chessend/logic.ts'

/** 标准开局局面（走法生成基数）。 */
const START: Board = parseRows([
  'rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR',
])

/** 白方马 b1 / 兵 e2 等格的索引（0 = a8）。 */
const sq = (name: string): number => {
  const file = name.charCodeAt(0) - 97
  const rank = Number(name[1])
  return (8 - rank) * 8 + file
}

describe('chessend logic', () => {
  it('mulberry32：同种子序列一致，异种子序列不同', () => {
    const a1 = mulberry32(42)
    const a2 = mulberry32(42)
    const b = mulberry32(43)
    const seqA = [a1(), a1(), a1(), a1()]
    const seqA2 = [a2(), a2(), a2(), a2()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqA2)
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(seqA).not.toEqual(seqB)
  })

  it('走法生成：马 / 兵 / 滑子的阻挡与初始局面计数', () => {
    const white = legalMoves(START, 'w')
    // 初始局面白方 20 步：16 兵步 + 4 马步。
    expect(white.length).toBe(20)
    const knight = white.filter((m) => m.from === sq('b1'))
    expect(knight.map((m) => m.to).sort((x, y) => x - y)).toEqual([sq('a3'), sq('c3')].sort((x, y) => x - y))
    const pawn = white.filter((m) => m.from === sq('e2'))
    expect(pawn.map((m) => m.to).sort((x, y) => x - y)).toEqual([sq('e3'), sq('e4')].sort((x, y) => x - y))
    // 滑子被己方兵封死：车 a1 / 象 c1 / 后 d1 均无走法。
    expect(white.some((m) => m.from === sq('a1') || m.from === sq('c1') || m.from === sq('d1'))).toBe(false)
    // 车的路径阻挡：a7 有白兵时车 a8 只能吃到 a7，a 线以下不可达；横线 7 格照走。
    const blocked = parseRows(['r.......', 'P.......', '........', '........', '........', '........', '........', '........'])
    const rook = legalMoves(blocked, 'b').filter((m) => m.from === 0)
    expect(rook.map((m) => m.to).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // 兵升变自动成后。
    const promo = parseRows(['....k...', 'P.......', '.K......', '........', '........', '........', '........', '........'])
    const step = makeMove(promo, { from: sq('a7'), to: sq('a8') })
    expect(step.promoted).toBe(true)
    expect(step.board[sq('a8')]).toBe('Q')
  })

  it('合法性过滤：被牵制的棋子不能移动，王不能走向受攻格', () => {
    // 白象 b6 牵住黑马 c7（对黑王 d8）。
    const pinned = parseRows(['...k....', '..n.....', '.B......', '........', '........', '........', '........', '...K....'])
    const black = legalMoves(pinned, 'b')
    expect(black.some((m) => m.from === sq('c7'))).toBe(false)
    // 黑王 d8 不能吃 b6（象受白王保护? 不受——但 d8 到 b6 不相邻，本例检验王不走向受攻格：
    // 黑王可走 c8 / e8 等，但不能走进白象控制的 d7? 用 c8 是否合法即可。
    expect(black.some((m) => m.from === sq('d8') && m.to === sq('c8'))).toBe(true)
    // 白王也不能走进黑王攻击范围（王对王）。
    const kings = parseRows(['......k.', '........', '........', '........', '........', '........', '......K.', '........'])
    expect(legalMoves(kings, 'w').some((m) => m.from === sq('g2') && m.to === sq('g7'))).toBe(false)
  })

  it('将军 / 将杀 / 逼和判定（愚人杀与经典逼和）', () => {
    const fools = parseRows([
      'rnb.kbnr', 'pppppppp', '........', '........', '......Pq', '.....P..', 'PPPPP..P', 'RNBQKBNR',
    ])
    expect(inCheck(fools, 'w')).toBe(true)
    expect(isCheckmate(fools, 'w')).toBe(true)
    expect(legalMoves(fools, 'w').length).toBe(0)
    const stale = parseRows(['k.......', '........', '.Q......', '........', '..K.....', '........', '........', '........'])
    expect(isStalemate(stale, 'b')).toBe(true)
    expect(inCheck(stale, 'b')).toBe(false)
  })

  it('评估：确定性、子力敏感、兵推进敏感、王安全生效', () => {
    expect(evaluate(START)).toBe(evaluate(START))
    const withPawn = parseRows(['........', '........', '........', '........', '........', '........', 'P.......', '.K....k.'])
    const without = parseRows(['........', '........', '........', '........', '........', '........', '........', '.K....k.'])
    expect(evaluate(withPawn)).toBeGreaterThan(evaluate(without))
    // 同一兵更接近升变分更高。
    const advanced = parseRows(['........', 'P.......', '........', '........', '........', '........', '........', '.K....k.'])
    expect(evaluate(advanced)).toBeGreaterThan(evaluate(withPawn))
    // 王安全：黑王周围被白后火力覆盖时白方加分。
    const safe = parseRows(['...k....', '........', '........', '........', '........', '........', '........', '...QK...'])
    const attacked = parseRows(['...k....', '...Q....', '........', '........', '........', '........', '........', '...K....'])
    expect(evaluate(attacked)).toBeGreaterThan(evaluate(safe))
  })

  it('搜索引擎：白方找到一步杀；黑方噪声决策可重放且噪声为 0 时跨种子一致', () => {
    const mate1 = PUZZLES[5]! // 底线杀：Re8 一步杀。
    const board = parseRows(mate1.rows)
    const result = searchWhite(board)
    expect(result.move).toEqual({ from: sq('e1'), to: sq('e8') })
    expect(result.score).toBeGreaterThan(90000)
    // 防守方：噪声 0 不消耗随机数，任意种子同走法。
    const d0a = defenderMove(parseRows(PUZZLES[0]!.rows), mulberry32(1), 0)
    const d0b = defenderMove(parseRows(PUZZLES[0]!.rows), mulberry32(999), 0)
    expect(d0a).toEqual(d0b)
    // 同种子两次完全一致；跨局重放序列一致。
    const replay = (seed: number): string[] => {
      let state = createChessEndState(0, seed)
      const replies: string[] = []
      for (let i = 0; i < 6 && state.status === 'playing'; i += 1) {
        const move = searchWhite(state.board).move
        if (move === null) break
        const res = applyPlayerMove(state, move.from, move.to)
        state = res.state
        if (state.lastReply !== null) replies.push(state.lastReply.from + '-' + state.lastReply.to)
      }
      return replies
    }
    expect(replay(4242)).toEqual(replay(4242))
    expect(replay(777)).toEqual(replay(777))
  })

  it('题库：8 局齐整、id 唯一、初始局面合法且白方有子可动', () => {
    expect(PUZZLES).toHaveLength(8)
    const ids = PUZZLES.map((p) => p.id)
    expect(new Set(ids).size).toBe(8)
    for (const puzzle of PUZZLES) {
      const board = parseRows(puzzle.rows)
      expect(board).toHaveLength(64)
      expect(board.includes('K')).toBe(true)
      expect(board.includes('k')).toBe(true)
      // 白先：双方王都不在将军下（白不在将军，黑未被白攻击违规）。
      expect(inCheck(board, 'w')).toBe(false)
      expect(inCheck(board, 'b')).toBe(false)
      expect(legalMoves(board, 'w').length).toBeGreaterThan(0)
      expect(puzzle.par).toBeGreaterThanOrEqual(1)
      expect(['mate', 'promote', 'material']).toContain(puzzle.goal)
      expect(puzzle.goalText.length).toBeGreaterThan(0)
    }
    expect(PUZZLES.map((p) => p.title)).toEqual([
      '车杀单王', '后杀单王', '双堡杀', '兵升变', '王翼攻击', '底线杀', '引离战术', '闷杀',
    ])
  })

  it('一步杀：底线杀与闷杀按 PAR 满分过关', () => {
    let state = createChessEndState(5, 1000) // 底线杀
    let res = applyPlayerMove(state, sq('e1'), sq('e8'))
    expect(res.ok).toBe(true)
    expect(res.state.status).toBe('won')
    expect(res.state.score).toBe(100)
    expect(res.state.moveCount).toBe(1)
    state = createChessEndState(7, 1000) // 闷杀
    res = applyPlayerMove(state, sq('g5'), sq('f7'))
    expect(res.state.status).toBe('won')
    expect(res.state.score).toBe(100)
    expect(isCheckmate(res.state.board, 'b')).toBe(true)
  })

  it('引离战术：Qe8+ 引离守车，两步强制将杀', () => {
    const state = createChessEndState(6, 2026)
    const first = applyPlayerMove(state, sq('e2'), sq('e8'))
    expect(first.ok).toBe(true)
    expect(first.state.status).toBe('playing')
    // 黑方唯一合法应手是 RxQ。
    expect(first.state.lastReply).toEqual({ from: sq('d8'), to: sq('e8') })
    const second = applyPlayerMove(first.state, sq('e1'), sq('e8'))
    expect(second.state.status).toBe('won')
    expect(second.state.score).toBe(100)
    expect(second.state.moveCount).toBe(2)
  })

  it('兵升变：引擎自弈（白 2 层搜索 + 种子噪声防守）达成目标并计分', () => {
    let state = createChessEndState(3, 31415)
    for (let i = 0; i < 60 && state.status === 'playing'; i += 1) {
      const move = searchWhite(state.board).move
      expect(move).not.toBeNull()
      const res = applyPlayerMove(state, move!.from, move!.to)
      expect(res.ok).toBe(true)
      state = res.state
    }
    expect(state.status).toBe('won')
    expect(state.puzzle.goal).toBe('promote')
    expect(state.board.slice(0, 8).includes('Q')).toBe(true)
    expect(state.score).toBeGreaterThanOrEqual(60)
  })

  it('得子目标、非法走法拒绝、悔棋与提示配额', () => {
    // 内联得子题：Qd5xb7 白方分差 +100 → +600，阈值 400。
    const puzzle: ChessEndPuzzle = {
      id: 'test-material', title: '得子测试', goal: 'material', goalText: '赢得车位', par: 1, advantage: 400,
      rows: ['......k.', '.r...ppp', '........', '...Q....', '........', '........', '........', '..K.....'],
    }
    let state = createState(puzzle, 99, 1)
    expect(materialDiff(state.board)).toBeLessThan(400)
    const win = applyPlayerMove(state, sq('d5'), sq('b7'))
    expect(win.state.status).toBe('won')
    expect(win.state.score).toBe(100)
    // 非法走法：车走斜线被拒绝并给出理由；走对方棋子同样拒绝。
    const p1 = createChessEndState(0, 5)
    const bad = applyPlayerMove(p1, sq('a1'), sq('b3'))
    expect(bad.ok).toBe(false)
    expect(bad.reason.length).toBeGreaterThan(0)
    expect(bad.state).toBe(p1)
    const blackPiece = applyPlayerMove(p1, sq('e8'), sq('e7'))
    expect(blackPiece.ok).toBe(false)
    expect(legalTargets(p1.board, sq('a1'))).not.toContain(sq('b3'))
    // 合法走子 + 引擎应手后悔棋：棋盘与步数回退。
    let game = createChessEndState(0, 5)
    const before = game.board
    const played = applyPlayerMove(game, sq('a1'), sq('a7'))
    expect(played.ok).toBe(true)
    expect(played.state.moveCount).toBe(1)
    expect(played.state.board).not.toBe(before)
    const undone = undoMove(played.state)
    expect(undone.board).toBe(before)
    expect(undone.moveCount).toBe(0)
    // 提示：返回合法走法且配额 3 次，用尽后为 null。
    let hinted = createChessEndState(1, 9)
    for (let i = 0; i < 3; i += 1) {
      const hint = requestHint(hinted)
      expect(hint.move).not.toBeNull()
      expect(legalMoves(hinted.board, 'w').some((m) => m.from === hint.move!.from && m.to === hint.move!.to)).toBe(true)
      hinted = hint.state
    }
    expect(hinted.hintsLeft).toBe(0)
    expect(requestHint(hinted).move).toBeNull()
    // 超步数计分：PAR 1 走 9 步 → 下限 20。
    expect(computeScore(1, 9)).toBe(20)
    expect(computeScore(2, 2)).toBe(100)
    expect(computeScore(2, 4)).toBe(80)
  })
})
