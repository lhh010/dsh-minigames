import { describe, expect, it } from 'vitest'
import {
  COLS, FALL_MS, ROWS, SPAWN_X,
  applyGravity, cellFreeAt, createBoard, createPuyoState, dropDistance, findClears,
  isOverflow, lockWrite, mulberry32, resolveBoard, rngNext, rotatePiece, stepPuyo,
  type Board, type PuyoPiece,
} from '../src/client/games/puyo/logic.ts'

/** 按行文本构造棋盘（'.' 为空，数字为颜色），缺省行补空。 */
function board(rows: string[]): Board {
  const b = createBoard()
  rows.forEach((line, y) => {
    for (let x = 0; x < COLS; x += 1) {
      const ch = line[x] ?? '.'
      b[y]![x] = ch === '.' ? 0 : Number(ch)
    }
  })
  return b
}

/** 构造下落对。 */
function piece(over: Partial<PuyoPiece>): PuyoPiece {
  return { x: SPAWN_X, y: 0, rot: 0, a: 1, b: 2, ...over }
}

/** 快进 n 帧（16ms 模拟帧，可注入每帧输入）。 */
function run(s: ReturnType<typeof createPuyoState>, frames: number, input = {}): void {
  for (let i = 0; i < frames; i += 1) {
    stepPuyo(s, 16, { left: false, right: false, rotate: false, softDrop: false, ...input })
  }
}

describe('puyo logic', () => {
  it('mulberry32 is deterministic per (seed, round) and rounds diverge', () => {
    const a = mulberry32(42, 0)
    const b = mulberry32(42, 0)
    const seqA = Array.from({ length: 8 }, () => rngNext(a))
    const seqB = Array.from({ length: 8 }, () => rngNext(b))
    expect(seqA).toEqual(seqB)
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true)
    const c = mulberry32(42, 1)
    const seqC = Array.from({ length: 8 }, () => rngNext(c))
    expect(seqA).not.toEqual(seqC)
  })

  it('gravity compacts each column downwards', () => {
    const b = board([
      '......',
      '..1...',
      '......',
      '..2...',
      '......',
      '..3...',
      '......',
      '......',
      '..4...',
    ])
    expect(applyGravity(b)).toBeGreaterThan(0)
    // 压实保持列内相对顺序：最靠下的 4 沉底。
    expect(b[ROWS - 1]![2]!).toBe(4)
    expect(b[ROWS - 2]![2]!).toBe(3)
    expect(b[ROWS - 3]![2]!).toBe(2)
    expect(b[ROWS - 4]![2]!).toBe(1)
    // 已压实再压不动。
    expect(applyGravity(b)).toBe(0)
  })

  it('four-connected same color clears, three does not', () => {
    const four = board(Array.from({ length: ROWS - 1 }, () => '......').concat(['1111..']))
    expect(four).toHaveLength(ROWS)
    expect(findClears(four)).toHaveLength(4)
    const three = board(Array.from({ length: ROWS - 1 }, () => '......').concat(['1122..']))
    expect(findClears(three)).toHaveLength(0)
    // L 形四连通也算。
    const l = createBoard()
    l[ROWS - 1]![0] = 3
    l[ROWS - 1]![1] = 3
    l[ROWS - 1]![2] = 3
    l[ROWS - 2]![2] = 3
    expect(findClears(l)).toHaveLength(4)
  })

  it('single clear scores cleared × 10 × chain²', () => {
    const result = resolveBoard(board(Array.from({ length: ROWS - 1 }, () => '......').concat(['1111..'])))
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.gained).toBe(40)
    expect(result.score).toBe(40)
    expect(result.cleared).toBe(4)
    expect(isOverflow(result.board)).toBe(false)
    expect(findClears(result.board)).toHaveLength(0)
  })

  it('a two-chain construction resolves both waves with squared chain bonus', () => {
    // 底排四红消除后，竖排两蓝落到蓝对旁补成四连通 → 第二段连锁。
    const b = board([
      '......',
      '......',
      '...2..',
      '...2..',
      '......',
      '......',
      '......',
      '......',
      '......',
      '......',
      '......',
      '111122',
    ])
    const result = resolveBoard(b)
    expect(result.steps.map((s) => s.chain)).toEqual([1, 2])
    expect(result.steps[0]!.cleared).toBe(4)
    expect(result.steps[1]!.cleared).toBe(4)
    // 4×10×1 + 4×10×4 = 200。
    expect(result.score).toBe(200)
    expect(result.cleared).toBe(8)
    expect(findClears(result.board)).toHaveLength(0)
    expect(result.board.every((row) => row.every((v) => v === 0))).toBe(true)
  })

  it('rotation kicks off walls and the floor; fully blocked rotation is rejected', () => {
    const empty = createBoard()
    // 左墙：副噗呦目标出界 → 整体右移一格。
    const left = rotatePiece(empty, piece({ x: 0, y: 5, rot: 0 }))
    expect(left).toEqual(piece({ x: 1, y: 5, rot: 1 }))
    // 右墙：整体左移。
    const right = rotatePiece(empty, piece({ x: COLS - 1, y: 5, rot: 2 }))
    expect(right).toEqual(piece({ x: COLS - 2, y: 5, rot: 3 }))
    // 井底：踢不上方。
    const floor = rotatePiece(empty, piece({ x: 2, y: ROWS - 1, rot: 1 }))
    expect(floor).toEqual(piece({ x: 2, y: ROWS - 2, rot: 2 }))
    // 三面被挡：拒绝旋转。
    const blocked = createBoard()
    blocked[5]![1] = 4
    blocked[4]![1] = 4
    blocked[5]![3] = 4
    expect(rotatePiece(blocked, piece({ x: 2, y: 5, rot: 0 }))).toBeNull()
    // 空井上普通旋转不改位置。
    const plain = rotatePiece(empty, piece({ x: 2, y: 5, rot: 0 }))
    expect(plain).toEqual(piece({ x: 2, y: 5, rot: 1 }))
  })

  it('drop distance, cell occupancy and lock write behave', () => {
    const b = board(Array.from({ length: ROWS - 2 }, () => '......').concat([
      '..1...',
      '..1...',
    ]))
    // 空列从 y=0（rot2 副在 y=1）可整对沉底。
    const p = piece({ x: 1, y: 0, rot: 2, a: 2, b: 2 })
    expect(dropDistance(b, p)).toBe(ROWS - 2)
    expect(cellFreeAt(b, 1, 0)).toBe(true)
    expect(cellFreeAt(b, 2, ROWS - 1)).toBe(false)
    const q = piece({ x: 1, y: ROWS - 2, rot: 2, a: 2, b: 2 })
    expect(lockWrite(b, q)).toBe(false)
    expect(b[ROWS - 2]![1]!).toBe(2)
    expect(b[ROWS - 1]![1]!).toBe(2)
    // 两格 2 与既有两格 1 不构成任何四连。
    expect(findClears(b)).toHaveLength(0)
  })

  it('locking onto the top row or a blocked spawn ends the game', () => {
    // 出生列全满：默认对（副在井口上方 y=-1）触底即锁，副被挤出 → 溢出判负。
    const s = createPuyoState(7, 0)
    for (let y = 1; y < ROWS; y += 1) s.board[y]![SPAWN_X] = y % 2 === 0 ? 3 : 4
    stepPuyo(s, 400, { left: false, right: false, rotate: false, softDrop: true })
    expect(s.phase).toBe('over')
    expect(s.events.some((e) => e.type === 'over')).toBe(true)
    // 出生点被占同样判负。
    const t = createPuyoState(7, 0)
    t.piece = null
    t.board[0]![SPAWN_X] = 1
    stepPuyo(t, 16)
    expect(t.phase).toBe('over')
  })

  it('a soft-dropped pair locks, clears and reports chain floats via events', () => {
    const s = createPuyoState(5, 0)
    // 预埋三红，当前对凑成四连；只快进到第一次锁定，避免后续随机对干扰。
    s.board[ROWS - 1]![0] = 1
    s.board[ROWS - 1]![1] = 1
    s.board[ROWS - 1]![2] = 1
    // rot2 副在下：副落底行与三红拼四连，轴颜色 9 不参与。
    s.piece = piece({ x: 3, y: 0, rot: 2, a: 9, b: 1 })
    run(s, 45, { softDrop: true })
    expect(s.pieces).toBe(1)
    expect(s.score).toBe(40)
    expect(s.maxChain).toBe(1)
    expect(s.events.some((e) => e.type === 'lock')).toBe(true)
    expect(s.events.some((e) => e.type === 'clear' && e.chain === 1)).toBe(true)
    expect(s.floats.some((f) => f.text === '+40')).toBe(true)
    // 锁定后立即补了对新噗呦。
    expect(s.piece).not.toBeNull()
    expect(s.phase).toBe('playing')
  })

  it('full runs are deterministic per seed and diverge across seeds', () => {
    const simulate = (seed: number): { board: Board, score: number, pieces: number, chain: number } => {
      const s = createPuyoState(seed, 0)
      for (let i = 0; i < 1200 && s.phase === 'playing'; i += 1) {
        // 确定性的伪输入序列：每 37 帧旋转、每 53 帧左右交替。
        stepPuyo(s, 16, {
          left: i % 53 === 0,
          right: i % 53 === 26,
          rotate: i % 37 === 0,
          softDrop: true,
        })
      }
      return { board: s.board.map((r) => [...r]), score: s.score, pieces: s.pieces, chain: s.maxChain }
    }
    const a = simulate(123)
    const b = simulate(123)
    expect(a).toEqual(b)
    expect(a.pieces).toBeGreaterThan(3)
    const c = simulate(456)
    expect(c).not.toEqual(a)
  })

  it('natural fall advances about one cell per FALL_MS', () => {
    const s = createPuyoState(3, 0)
    const y0 = s.piece!.y
    run(s, Math.floor(FALL_MS / 16) + 2)
    expect(s.piece!.y).toBeGreaterThan(y0)
    expect(s.phase).toBe('playing')
  })
})
