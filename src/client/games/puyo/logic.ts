/**
 * 噗呦噗呦纯逻辑引擎：6×12 井、成对噗呦下落（含踢墙旋转）、四连通同色
 * ≥4 消除、重力压实、连锁计分与溢出判定。全部为纯函数/纯状态机，不依赖
 * DOM，可直接单测。
 *
 * 计分规则：每次消除得分 = 消除数 × 10 × chain²（chain 从 1 起）。
 * 溢出规则：落定后第 0 行（井顶）有任何噗呦、或出生点被占，即判负。
 */

/** 井宽（列数）。 */
export const COLS = 6
/** 井高（行数），第 0 行为井顶。 */
export const ROWS = 12
/** 噗呦颜色种数（1..COLOR_COUNT，0 表示空）。 */
export const COLOR_COUNT = 4
/** 出生列（轴噗呦固定落点）。 */
export const SPAWN_X = 2
/** 自然下落一格的毫秒数。 */
export const FALL_MS = 750
/** 软降一格的毫秒数。 */
export const SOFT_MS = 45
/** 触底后到锁定的宽限毫秒数（便于最后微调）。 */
export const LOCK_MS = 260
/** 消除特效时长（毫秒）。 */
export const FX_MS = 300

/** 棋盘：ROWS×COLS 的颜色矩阵，0 为空。 */
export type Board = number[][]

/** mulberry32 的可变种子状态。 */
export interface RngState { s: number }

/**
 * 构造 mulberry32 随机源：同一 (seed, round) 永远产生同一序列。
 * @param seed - 局种子。
 * @param round - 局号（重开递增），混入后每局序列不同。
 * @returns 可被 {@link rngNext} 推进的随机源。
 */
export function mulberry32(seed: number, round: number): RngState {
  return { s: (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(round + 1, 0xc2b2ae35)) >>> 0 }
}

/** 推进随机源并返回 [0,1) 的下一个值。 */
export function rngNext(r: RngState): number {
  let t = (r.s = (r.s + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** 取 [0, n) 的随机整数。 */
export function rngInt(r: RngState, n: number): number {
  return Math.floor(rngNext(r) * n)
}

/** 一对即将下落的噗呦颜色。 */
export interface PuyoPair { a: number, b: number }

/** 从随机源取下一对颜色。 */
export function rngPair(r: RngState): PuyoPair {
  return { a: rngInt(r, COLOR_COUNT) + 1, b: rngInt(r, COLOR_COUNT) + 1 }
}

/** 下落中的噗呦对：轴 (x,y) + 按旋转态偏移的副噗呦。 */
export interface PuyoPiece extends PuyoPair {
  x: number, y: number, rot: number
}

/**
 * 旋转态 0..3 的副噗呦相对轴的偏移：上、左、下、右（↑ 顺时针旋转）。
 * @param rot - 旋转态（任意整数，取模归一）。
 */
export function childOffset(rot: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 0: return [0, -1]
    case 1: return [-1, 0]
    case 2: return [0, 1]
    default: return [1, 0]
  }
}

/** 噗呦对占据的两格：[轴, 副]。 */
export function pieceCells(p: PuyoPiece): Array<[number, number]> {
  const [dx, dy] = childOffset(p.rot)
  return [[p.x, p.y], [p.x + dx, p.y + dy]]
}

/** 空棋盘。 */
export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0))
}

/** 深拷贝棋盘。 */
export function cloneBoard(b: Board): Board {
  return b.map((row) => [...row])
}

/**
 * (x,y) 是否可放：列越界或触底为不可放；y<0 视为井口上方的隐藏区，可放。
 */
export function cellFreeAt(b: Board, x: number, y: number): boolean {
  if (x < 0 || x >= COLS || y >= ROWS) return false
  if (y < 0) return true
  return b[y]![x]! === 0
}

/** 噗呦对整体平移 dx 后是否仍合法。 */
export function canMove(b: Board, p: PuyoPiece, dx: number): boolean {
  return pieceCells(p).every(([x, y]) => cellFreeAt(b, x + dx, y))
}

/** 噗呦对还能下落几格（0 = 已触底）。 */
export function dropDistance(b: Board, p: PuyoPiece): number {
  let n = 0
  while (pieceCells(p).every(([x, y]) => cellFreeAt(b, x, y + n + 1))) n += 1
  return n
}

/**
 * 顺时针旋转一次，带踢墙：目标位非法时依次尝试整体右移、左移、上移，
 * 全部失败返回 null（保持原状）。
 * @param b - 当前棋盘。
 * @param p - 当前噗呦对。
 * @returns 旋转后的新噗呦对，或 null 表示无处可踢。
 */
export function rotatePiece(b: Board, p: PuyoPiece): PuyoPiece | null {
  const rot = ((((p.rot % 4) + 4) % 4) + 1) % 4
  const [dx, dy] = childOffset(rot)
  const kicks: Array<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, -1]]
  for (const [kx, ky] of kicks) {
    const x = p.x + kx
    const y = p.y + ky
    if (cellFreeAt(b, x, y) && cellFreeAt(b, x + dx, y + dy)) {
      return { x, y, rot, a: p.a, b: p.b }
    }
  }
  return null
}

/**
 * 把噗呦对写入棋盘（y<0 的格丢弃）。
 * @returns 是否有格子被挤出井口（溢出信号之一）。
 */
export function lockWrite(b: Board, p: PuyoPiece): boolean {
  let overflow = false
  for (const [x, y] of pieceCells(p)) {
    if (y < 0) { overflow = true; continue }
    b[y]![x] = x === p.x && y === p.y ? p.a : p.b
  }
  return overflow
}

/**
 * 重力压实：每列非空格子沉到底部。
 * @returns 发生移动的格子数（0 = 本已压实）。
 */
export function applyGravity(b: Board): number {
  let moved = 0
  for (let x = 0; x < COLS; x += 1) {
    let write = ROWS - 1
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      const v = b[y]![x]!
      if (v === 0) continue
      if (y !== write) {
        b[write]![x] = v
        b[y]![x] = 0
        moved += 1
      }
      write -= 1
    }
  }
  return moved
}

/**
 * 找出所有处于四连通同色 ≥4 组的格子。
 * @returns 待消除格子坐标列表。
 */
export function findClears(b: Board): Array<[number, number]> {
  const hit: boolean[][] = Array.from({ length: ROWS }, () => new Array<boolean>(COLS).fill(false))
  const out: Array<[number, number]> = []
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const color = b[y]![x]!
      if (color === 0 || hit[y]![x]) continue
      const group: Array<[number, number]> = []
      const stack: Array<[number, number]> = [[x, y]]
      hit[y]![x] = true
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!
        group.push([cx, cy])
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as Array<[number, number]>) {
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
          if (hit[ny]![nx] || b[ny]![nx] !== color) continue
          hit[ny]![nx] = true
          stack.push([nx, ny])
        }
      }
      if (group.length >= 4) out.push(...group)
    }
  }
  return out
}

/** 一段消除：第 chain 连锁消掉的格子（含颜色，供特效用）与得分。 */
export interface ResolveStep {
  chain: number
  cleared: number
  cells: Array<{ x: number, y: number, color: number }>
  gained: number
}

/** resolveBoard 的完整结算结果。 */
export interface ResolveResult {
  board: Board
  steps: ResolveStep[]
  score: number
  cleared: number
}

/**
 * 结算整个连锁：反复「四连通消除 → 重力压实」直到无组可消。
 * 输入棋盘不被修改，返回压实后的新棋盘。
 * @param input - 落定（已压实）的棋盘。
 */
export function resolveBoard(input: Board): ResolveResult {
  const b = cloneBoard(input)
  const steps: ResolveStep[] = []
  let score = 0
  let cleared = 0
  for (let chain = 1; chain <= 64; chain += 1) {
    const cells = findClears(b)
    if (cells.length === 0) break
    const colored = cells.map(([x, y]) => ({ x, y, color: b[y]![x]! }))
    for (const { x, y } of colored) b[y]![x] = 0
    applyGravity(b)
    const gained = colored.length * 10 * chain * chain
    steps.push({ chain, cleared: colored.length, cells: colored, gained })
    score += gained
    cleared += colored.length
  }
  return { board: b, steps, score, cleared }
}

/** 井顶（第 0 行）是否已被落定的噗呦占据——溢出判负。 */
export function isOverflow(b: Board): boolean {
  return b[0]!.some((v) => v !== 0)
}

/** 连锁浮字（井内坐标，渲染层换算像素并上浮）。 */
export interface PuyoFloat { x: number, y: number, text: string, color: string, life: number, maxLife: number }

/** 消除爆裂特效（生命 0..FX_MS，渲染层一次性喷粒子）。 */
export interface ClearFx { x: number, y: number, color: number, life: number, spawned: boolean }

/** 供渲染/音效消费的一次性事件（宿主每帧清空）。 */
export type PuyoEvent =
  | { type: 'lock' }
  | { type: 'clear', chain: number, cleared: number, gained: number }
  | { type: 'over' }

/** 一局完整状态。 */
export interface PuyoState {
  board: Board
  piece: PuyoPiece | null
  next: PuyoPair
  rng: RngState
  phase: 'playing' | 'over'
  fallMs: number
  lockMs: number
  score: number
  maxChain: number
  pieces: number
  floats: PuyoFloat[]
  clearFx: ClearFx[]
  events: PuyoEvent[]
}

/** 单帧输入：left/right/rotate 为边沿触发（宿主去重），softDrop 为按住态。 */
export interface PuyoInput { left: boolean, right: boolean, rotate: boolean, softDrop: boolean }

/** 无输入帧。 */
export const PUYO_IDLE: PuyoInput = { left: false, right: false, rotate: false, softDrop: false }

function spawnPiece(s: PuyoState): void {
  if (s.board[0]![SPAWN_X]! !== 0) {
    // 出生点被占：直接判负。
    s.piece = null
    s.phase = 'over'
    s.events.push({ type: 'over' })
    return
  }
  s.piece = { x: SPAWN_X, y: 0, rot: 0, a: s.next.a, b: s.next.b }
  s.next = rngPair(s.rng)
  s.fallMs = 0
  s.lockMs = 0
}

function lock(s: PuyoState): void {
  const p = s.piece!
  s.piece = null
  s.pieces += 1
  const overflow = lockWrite(s.board, p)
  s.events.push({ type: 'lock' })
  if (overflow) {
    s.phase = 'over'
    s.events.push({ type: 'over' })
    return
  }
  applyGravity(s.board)
  const result = resolveBoard(s.board)
  s.board = result.board
  s.score += result.score
  for (const step of result.steps) {
    s.maxChain = Math.max(s.maxChain, step.chain)
    s.events.push({ type: 'clear', chain: step.chain, cleared: step.cleared, gained: step.gained })
    const avgX = step.cells.reduce((acc, c) => acc + c.x, 0) / step.cells.length
    const avgY = step.cells.reduce((acc, c) => acc + c.y, 0) / step.cells.length
    s.floats.push({
      x: avgX,
      y: avgY,
      text: step.chain >= 2 ? 'CHAIN ' + step.chain : '+' + step.gained,
      color: step.chain >= 2 ? '#e0af68' : '#e2e2ee',
      life: 0,
      maxLife: 900,
    })
    for (const c of step.cells) s.clearFx.push({ x: c.x, y: c.y, color: c.color, life: 0, spawned: false })
  }
  if (isOverflow(s.board)) {
    s.phase = 'over'
    s.events.push({ type: 'over' })
    return
  }
  spawnPiece(s)
}

/** 推进浮字与消除特效的寿命（结束后仍飘完）。 */
function tickFx(s: PuyoState, dtMs: number): void {
  for (const f of s.floats) f.life += dtMs
  s.floats = s.floats.filter((f) => f.life < f.maxLife)
  for (const f of s.clearFx) f.life += dtMs
  s.clearFx = s.clearFx.filter((f) => f.life < FX_MS)
}

/**
 * 推进一帧：吃输入 → 下落/触底锁定 → 连锁结算 → 补新对。
 * @param s - 局状态（原地变更）。
 * @param dtMs - 帧间隔毫秒。
 * @param input - 本帧输入。
 */
export function stepPuyo(s: PuyoState, dtMs: number, input: PuyoInput = PUYO_IDLE): void {
  tickFx(s, dtMs)
  if (s.phase !== 'playing') return
  if (s.piece === null) {
    spawnPiece(s)
    if (s.phase !== 'playing') return
  }
  const p = s.piece!
  if (input.left && canMove(s.board, p, -1)) p.x -= 1
  if (input.right && canMove(s.board, p, 1)) p.x += 1
  if (input.rotate) {
    const r = rotatePiece(s.board, p)
    if (r !== null) {
      p.x = r.x
      p.y = r.y
      p.rot = r.rot
    }
  }
  if (dropDistance(s.board, p) === 0) {
    s.lockMs += dtMs
    if (input.softDrop || s.lockMs >= LOCK_MS) lock(s)
    return
  }
  s.lockMs = 0
  const interval = input.softDrop ? SOFT_MS : FALL_MS
  s.fallMs += dtMs
  while (s.fallMs >= interval) {
    s.fallMs -= interval
    if (dropDistance(s.board, p) > 0) p.y += 1
    else break
  }
}

/**
 * 开新局：空井 + mulberry32(seed, round) 驱动的确定性发牌。
 * @param seed - 局种子。
 * @param round - 局号（重开递增）。
 */
export function createPuyoState(seed: number, round: number): PuyoState {
  const s: PuyoState = {
    board: createBoard(),
    piece: null,
    next: { a: 1, b: 1 },
    rng: mulberry32(seed, round),
    phase: 'playing',
    fallMs: 0,
    lockMs: 0,
    score: 0,
    maxChain: 0,
    pieces: 0,
    floats: [],
    clearFx: [],
    events: [],
  }
  s.next = rngPair(s.rng)
  spawnPiece(s)
  return s
}
