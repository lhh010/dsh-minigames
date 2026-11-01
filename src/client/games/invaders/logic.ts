/**
 * 小蜜蜂（Space Invaders）纯逻辑：玩家炮台在底部左右移动并开火（冷却），
 * 外星人按 9x4 网格编队左右横移、触边整体下移，剩余越少移动越快；
 * 编队随机从各列最低处的外星人开火。4 个掩体由方块网格组成，被任意一方
 * 子弹打中即蚀去周围方块。3 条命，被击中短暂无敌并清空敌方子弹；整波
 * 消灭进入下一波（起始高度更低、开火更频繁），外星人推进到炮台线或
 * 生命耗尽即结束。随机数全部走 mulberry32(seed, round)，同 seed 同输入
 * 轨迹完全一致。时间单位毫秒，物理单位 px / s。
 */

/** 逻辑画布尺寸。 */
export const W = 480
export const H = 600

/** 编队规格。 */
export const COLS = 9
export const ROWS = 4
export const CELL = 34
export const ALIEN_W = 24
export const ALIEN_H = 18
/** 编队初始左上角 x（水平居中）。 */
export const FORMATION_X0 = (W - ((COLS - 1) * CELL + ALIEN_W)) / 2
/** 第 1 波编队顶部 y。 */
export const START_Y = 70
/** 触边一次下移的像素。 */
export const DROP = 14
/** 编队基础 / 峰值横移速度 px/s（剩余越少越接近峰值）。 */
export const BASE_SPEED = 18
export const MAX_SPEED = 130

/** 炮台参数。 */
export const PLAYER_W = 30
export const PLAYER_H = 14
export const PLAYER_Y = H - 44
export const PLAYER_SPEED = 230
/** 开火冷却 ms。 */
export const FIRE_CD = 450
/** 玩家子弹速度 px/s（向上为负）。 */
export const PLAYER_BULLET_V = 420
/** 同屏玩家子弹上限。 */
export const PLAYER_BULLET_MAX = 2

/** 掩体参数：7x4 个 6px 方块。 */
export const BUNKER_COUNT = 4
export const BUNKER_CELL = 6
export const BUNKER_COLS = 7
export const BUNKER_ROWS = 4
export const BUNKER_W = BUNKER_COLS * BUNKER_CELL
export const BUNKER_Y = H - 120
/** 第 i 个掩体的左上角 x。 */
export function bunkerX(i: number): number {
  return 30 + i * ((W - 60 - BUNKER_W) / (BUNKER_COUNT - 1))
}

/** 初始生命。 */
export const START_LIVES = 3
/** 被击中后的无敌时长 ms。 */
export const INVULN_MS = 1500
/** 波次横幅展示时长 ms。 */
export const BANNER_MS = 1200
/** 清波奖励分。 */
export const WAVE_BONUS = 100

/**
 * mulberry32 确定性随机数发生器（与其它游戏互不依赖的同名实现）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 一个存活状态的外星人（位置由编队原点 + 行列推算）。 */
export interface Alien {
  col: number
  row: number
  alive: boolean
}

/** 一颗在飞的子弹；vy 向上为负。 */
export interface Bullet {
  x: number, y: number, vy: number
}

/** 一格掩体方块。 */
export interface BunkerCell {
  alive: boolean
}

/** 一个掩体（方块网格）。 */
export interface Bunker {
  x: number
  cells: BunkerCell[]
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type InvadersEvent =
  | { type: 'kill', x: number, y: number, row: number }
  | { type: 'hit', x: number, y: number }
  | { type: 'wave', wave: number }
  | { type: 'bunker', x: number, y: number }

/** 玩家一帧的输入（按住即 true，开火由冷却节流）。 */
export interface InvadersInput {
  left: boolean
  right: boolean
  fire: boolean
}

/** 一局游戏的完整可测状态。 */
export interface InvadersState {
  /** 局内已流逝 ms。 */
  t: number
  score: number
  lives: number
  wave: number
  over: boolean
  /** 炮台中心 x。 */
  playerX: number
  /** 开火冷却剩余 ms。 */
  fireCd: number
  /** 无敌剩余 ms。 */
  invulnMs: number
  /** 波次横幅剩余 ms。 */
  bannerMs: number
  /** 编队原点。 */
  fx: number, fy: number
  /** 编队横移方向 1 / -1。 */
  dir: 1 | -1
  aliens: Alien[]
  playerBullets: Bullet[]
  alienBullets: Bullet[]
  /** 敌方下次开火倒计时 ms。 */
  alienFireCd: number
  bunkers: Bunker[]
  events: InvadersEvent[]
  rng: () => number
}

/**
 * 行号 → 外星人类型：0 行（顶）= 2 号造型 30 分，中间行 = 1 号 20 分，底行 = 0 号 10 分。
 * @param row - 编队行号（0 顶部）。
 * @returns 造型编号 0/1/2。
 */
export function rowType(row: number): number {
  if (row === 0) return 2
  if (row === ROWS - 1) return 0
  return 1
}

/**
 * 行号对应分值。
 * @param row - 编队行号。
 * @returns 击落该行外星人的得分。
 */
export function rowScore(row: number): number {
  return [30, 20, 20, 10][row] ?? 10
}

/** 生成 4 个完整掩体。 */
function createBunkers(): Bunker[] {
  const bunkers: Bunker[] = []
  for (let i = 0; i < BUNKER_COUNT; i += 1) {
    const cells: BunkerCell[] = []
    for (let j = 0; j < BUNKER_COLS * BUNKER_ROWS; j += 1) cells.push({ alive: true })
    bunkers.push({ x: bunkerX(i), cells })
  }
  return bunkers
}

/**
 * 新开一局（第 1 波编队就位）。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createInvaders(seed: number, round = 1): InvadersState {
  const state: InvadersState = {
    t: 0,
    score: 0,
    lives: START_LIVES,
    wave: 1,
    over: false,
    playerX: W / 2,
    fireCd: 0,
    invulnMs: 0,
    bannerMs: BANNER_MS,
    fx: FORMATION_X0,
    fy: START_Y,
    dir: 1,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
    alienFireCd: 0,
    bunkers: createBunkers(),
    events: [],
    rng: mulberry32((Math.floor(seed) * 131 + round * 17) >>> 0),
  }
  spawnWave(state, false)
  return state
}

/**
 * 布置一波编队（wave 越高起始越低）。
 * @param state - 目标状态。
 * @param emitEvent - 是否产生 wave 事件（首波不产生）。
 */
function spawnWave(state: InvadersState, emitEvent: boolean): void {
  state.aliens.length = 0
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) state.aliens.push({ col, row, alive: true })
  }
  state.fx = FORMATION_X0
  state.fy = START_Y + Math.min(96, (state.wave - 1) * 12)
  state.dir = 1
  state.playerBullets.length = 0
  state.alienBullets.length = 0
  // 开火间隔随波次缩短：基础间隔 1100ms，每波 -90ms，下限 320ms，命中后随机 0.6~1.4 倍。
  const base = Math.max(320, 1100 - (state.wave - 1) * 90)
  state.alienFireCd = base * (0.6 + state.rng() * 0.8)
  state.bannerMs = BANNER_MS
  if (emitEvent) state.events.push({ type: 'wave', wave: state.wave })
}

/** 存活外星人数。 */
function aliveCount(state: InvadersState): number {
  let n = 0
  for (const a of state.aliens) if (a.alive) n += 1
  return n
}

/** 外星人左上角坐标。 */
function alienPos(state: InvadersState, a: Alien): { x: number, y: number } {
  return { x: state.fx + a.col * CELL, y: state.fy + a.row * CELL }
}

/**
 * 敌方开火：从随机存活列的最低外星人处发一颗子弹。
 * @param state - 目标状态。
 */
function alienFire(state: InvadersState): void {
  const start = Math.floor(state.rng() * COLS)
  for (let attempt = 0; attempt < COLS; attempt += 1) {
    const col = (start + attempt) % COLS
    let lowest: Alien | null = null
    for (const a of state.aliens) {
      if (a.alive && a.col === col && (lowest === null || a.row > lowest.row)) lowest = a
    }
    if (lowest === null) continue
    const p = alienPos(state, lowest)
    const v = Math.min(260, 150 + state.wave * 8)
    state.alienBullets.push({ x: p.x + ALIEN_W / 2, y: p.y + ALIEN_H, vy: v })
    return
  }
}

/**
 * 子弹打中掩体时蚀去命中格及相邻格（对角格随机蚀去，走 rng 保证确定）。
 * @param state - 目标状态。
 * @param x - 子弹 x。
 * @param y - 子弹 y。
 * @returns 是否命中任一方块。
 */
function erodeBunker(state: InvadersState, x: number, y: number): boolean {
  for (const b of state.bunkers) {
    const cx = Math.floor((x - b.x) / BUNKER_CELL)
    const cy = Math.floor((y - BUNKER_Y) / BUNKER_CELL)
    if (cx < 0 || cx >= BUNKER_COLS || cy < 0 || cy >= BUNKER_ROWS) continue
    const cell = b.cells[cy * BUNKER_COLS + cx]
    if (cell === undefined || !cell.alive) continue
    // 蚀去命中格与 4 邻格；对角格 50% 概率一并蚀去。
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || nx >= BUNKER_COLS || ny < 0 || ny >= BUNKER_ROWS) continue
        const diagonal = dx !== 0 && dy !== 0
        if (diagonal && state.rng() < 0.5) continue
        const n = b.cells[ny * BUNKER_COLS + nx]
        if (n !== undefined) n.alive = false
      }
    }
    state.events.push({ type: 'bunker', x, y })
    return true
  }
  return false
}

/** 矩形相交判定（子弹视为 2x8 竖条）。 */
function bulletHitsBox(x: number, y: number, bx: number, by: number, bw: number, bh: number): boolean {
  return x + 1 >= bx && x - 1 <= bx + bw && y + 4 >= by && y - 4 <= by + bh
}

/**
 * 推进一帧：炮台移动与开火、编队横移 / 触边下移、敌方开火、子弹飞行与
 * 全部碰撞（外星人 / 炮台 / 掩体 / 双方子弹互消）、波次清空与结束判定。
 * 事件写入 state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧玩家输入。
 */
export function stepInvaders(state: InvadersState, dtMs: number, input: InvadersInput): void {
  state.events.length = 0
  if (state.over) return
  const dt = dtMs / 1000
  state.t += dtMs
  if (state.invulnMs > 0) state.invulnMs = Math.max(0, state.invulnMs - dtMs)
  if (state.bannerMs > 0) state.bannerMs = Math.max(0, state.bannerMs - dtMs)
  if (state.fireCd > 0) state.fireCd = Math.max(0, state.fireCd - dtMs)

  // 炮台移动与开火。
  let move = 0
  if (input.left && !input.right) move = -1
  else if (input.right && !input.left) move = 1
  state.playerX += move * PLAYER_SPEED * dt
  const half = PLAYER_W / 2
  if (state.playerX < half + 6) state.playerX = half + 6
  if (state.playerX > W - half - 6) state.playerX = W - half - 6
  if (input.fire && state.fireCd <= 0 && state.playerBullets.length < PLAYER_BULLET_MAX) {
    state.playerBullets.push({ x: state.playerX, y: PLAYER_Y - 6, vy: -PLAYER_BULLET_V })
    state.fireCd = FIRE_CD
  }

  // 编队横移：速度随剩余比例与波次提升。
  const total = ROWS * COLS
  const alive = aliveCount(state)
  if (alive > 0) {
    const speed = (BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - alive / total)) * (1 + (state.wave - 1) * 0.08)
    let minX = W
    let maxX = 0
    let maxY = 0
    for (const a of state.aliens) {
      if (!a.alive) continue
      const p = alienPos(state, a)
      if (p.x < minX) minX = p.x
      if (p.x + ALIEN_W > maxX) maxX = p.x + ALIEN_W
      if (p.y + ALIEN_H > maxY) maxY = p.y + ALIEN_H
    }
    state.fx += state.dir * speed * dt
    // 触边：下移并反向（回退本帧越界部分）。
    if ((state.dir === 1 && maxX + speed * dt > W - 6) || (state.dir === -1 && minX - speed * dt < 6)) {
      state.fy += DROP
      state.dir = state.dir === 1 ? -1 : 1
    }
    // 外星人推进到炮台线：直接结束。
    if (maxY + DROP >= PLAYER_Y - 4) {
      state.lives = 0
      state.over = true
      return
    }
  }

  // 敌方开火。
  if (alive > 0) {
    state.alienFireCd -= dtMs
    if (state.alienFireCd <= 0) {
      alienFire(state)
      const base = Math.max(320, 1100 - (state.wave - 1) * 90)
      state.alienFireCd = base * (0.6 + state.rng() * 0.8)
    }
  }

  // 玩家子弹：飞行、打掩体、打外星人。
  for (let i = state.playerBullets.length - 1; i >= 0; i -= 1) {
    const b = state.playerBullets[i]!
    b.y += b.vy * dt
    if (b.y < 20) { state.playerBullets.splice(i, 1); continue }
    if (erodeBunker(state, b.x, b.y)) { state.playerBullets.splice(i, 1); continue }
    let hit = false
    for (const a of state.aliens) {
      if (!a.alive) continue
      const p = alienPos(state, a)
      if (!bulletHitsBox(b.x, b.y, p.x, p.y, ALIEN_W, ALIEN_H)) continue
      a.alive = false
      state.score += rowScore(a.row)
      state.events.push({ type: 'kill', x: p.x + ALIEN_W / 2, y: p.y + ALIEN_H / 2, row: a.row })
      hit = true
      break
    }
    if (hit) { state.playerBullets.splice(i, 1); continue }
    // 与敌方子弹互消。
    for (let j = state.alienBullets.length - 1; j >= 0; j -= 1) {
      const e = state.alienBullets[j]!
      if (Math.abs(e.x - b.x) <= 4 && Math.abs(e.y - b.y) <= 8) {
        state.alienBullets.splice(j, 1)
        state.playerBullets.splice(i, 1)
        break
      }
    }
  }

  // 敌方子弹：飞行、打掩体、打炮台。
  for (let i = state.alienBullets.length - 1; i >= 0; i -= 1) {
    const b = state.alienBullets[i]!
    b.y += b.vy * dt
    if (b.y > H) { state.alienBullets.splice(i, 1); continue }
    if (erodeBunker(state, b.x, b.y)) { state.alienBullets.splice(i, 1); continue }
    if (bulletHitsBox(b.x, b.y, state.playerX - half, PLAYER_Y, PLAYER_W, PLAYER_H)) {
      state.alienBullets.splice(i, 1)
      if (state.invulnMs > 0) continue
      state.lives -= 1
      state.invulnMs = INVULN_MS
      state.events.push({ type: 'hit', x: state.playerX, y: PLAYER_Y + PLAYER_H / 2 })
      state.alienBullets.length = 0
      if (state.lives <= 0) { state.lives = 0; state.over = true; return }
      break
    }
  }

  // 波次清空：奖励分并布置下一波。
  if (aliveCount(state) === 0) {
    state.score += WAVE_BONUS
    state.wave += 1
    spawnWave(state, true)
  }
}
