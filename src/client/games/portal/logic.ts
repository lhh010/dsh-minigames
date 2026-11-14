/**
 * 传送门（Portal）纯逻辑：2D 瓦片平台 + 蓝橙双门解谜。固定子步确定性
 * 物理（重力 / 跳跃 / 瓦片 AABB 碰撞）；传送门只能贴在竖直墙面（墙瓦片
 * 的左 / 右侧面），进入一门从另一门射出且速度大小守恒：同朝向门对把
 * 速度整体取反（下落动能翻转为上升——深渊弹射），对朝向门对速度保持
 * 不变（平移穿越）。尖刺 / 激光瓦片与坠出底部即失败，触到出口旗帜即
 * 过关。全部函数纯确定，时间毫秒，物理 px/s；世界坐标 y 向下增大。
 */

/** 瓦片边长 px。 */
export const TILE = 32
/** 关卡列数。 */
export const COLS = 21
/** 关卡行数。 */
export const ROWS = 20
/** 逻辑画布宽 px（COLS * TILE）。 */
export const W = COLS * TILE
/** 逻辑画布高 px（ROWS * TILE）。 */
export const H = ROWS * TILE

/** 重力加速度 px/s^2。 */
export const GRAVITY = 1800
/** 起跳速度 px/s（向上为负；最大跳高 ≈ 114px < 4 瓦片）。 */
export const JUMP_VY = -640
/** 横向操控加速度 px/s^2。 */
export const MOVE_ACC = 2000
/** 横向速度上限 px/s。 */
export const MAX_VX = 240
/** 无输入地面阻尼 px/s^2。 */
export const GROUND_DAMP = 1400
/** 无输入空中阻尼 px/s^2（空中仍保留大部分动量，保证弹射弧线）。 */
export const AIR_DAMP = 200
/** 下落终端速度 px/s。 */
export const MAX_FALL = 1000
/** 角色半宽 px。 */
export const PLAYER_HALF_W = 11
/** 角色半高 px。 */
export const PLAYER_HALF_H = 13
/** 固定物理子步 ms（stepPortal 内部按此切分，保证确定性）。 */
export const SUBSTEP_MS = 8
/** 传送门纵向半高 px（贴墙面的有效穿越区间）。 */
export const PORTAL_HALF_H = 28
/** 传送后禁止再次传送的冷却 ms（防止出仓即被回吸）。 */
export const PORTAL_LOCK_MS = 160
/** 轨迹残影最大采样数。 */
export const TRAIL_MAX = 36

/**
 * mulberry32 确定性随机数发生器（逻辑本身不用随机；导出供渲染层的
 * 门粒子流与测试共用同一实现）。
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

/** 瓦片种类：空 / 墙（实心，可贴门）/ 尖刺（致死）/ 激光（致死）。 */
export type TileKind = 'empty' | 'wall' | 'spike' | 'laser'

/** 传送门颜色（玩家持有一对门）。 */
export type PortalColor = 'blue' | 'orange'

/** 一扇已放置的传送门：贴在某墙瓦片的左或右侧面（竖直墙面）。 */
export interface Portal {
  /** 所贴墙瓦片列。 */
  col: number
  /** 所贴墙瓦片行。 */
  row: number
  /** 门外法线方向：+1 = 墙右侧面朝右，-1 = 墙左侧面朝左。 */
  dir: 1 | -1
  /** 门面所在平面 x px。 */
  x: number
  /** 门中心 y px（瓦片中心）。 */
  y: number
}

/** 一关的手工瓦片图（ROWS 行 x COLS 列字符画）。 */
export interface PortalLevel {
  /** 关名（HUD 显示）。 */
  name: string
  /** 行数组；字符：'#'墙 '.'空 'S'出生 'F'旗帜 '^'尖刺 '='激光。 */
  rows: string[]
}

/** 解析后的关卡：瓦片种类矩阵 + 出生点 + 旗帜位置。 */
export interface LevelInfo {
  /** 关名。 */
  name: string
  /** tiles[row][col] 瓦片种类。 */
  tiles: TileKind[][]
  /** 出生瓦片列 / 行。 */
  spawnCol: number
  spawnRow: number
  /** 旗帜瓦片列 / 行。 */
  flagCol: number
  flagRow: number
}

/**
 * 手工关卡 x5，难度递进：简单穿越 → 深渊弹射（落差加速）→ 双门接力 →
 * 激光峡谷（弹射 + 激光墙）→ 终局双段（接力 + 弹射上旗）。
 */
export const LEVELS: PortalLevel[] = [
  {
    name: '初见门径',
    rows: [
      '#####################',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.........##........#',
      '#.S.......##....F...#',
      '#####################',
    ],
  },
  {
    name: '深渊弹射',
    rows: [
      '#####################',
      '#..............S....#',
      '#.............###...#',
      '#.............###...#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...........F.......#',
      '#..........#####....#',
      '#..........#####....#',
      '#..........#####....#',
      '#..........#####....#',
      '#..........#####....#',
      '#..........#####....#',
      '#..........#####....#',
      '#..........#####....#',
      '#..........#####....#',
      '#^^^^^^^^^^#####.^^^#',
      '#####################',
    ],
  },
  {
    name: '接力双渡',
    rows: [
      '#####################',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#................#..#',
      '#................#..#',
      '#................#..#',
      '#................#..#',
      '#.........##.....#..#',
      '#.........##.....#..#',
      '#.S.......##.....#F.#',
      '####......#####..####',
      '####......#####..####',
      '####......#####..####',
      '####^^^^^^#####^^####',
      '#####################',
    ],
  },
  {
    name: '激光峡谷',
    rows: [
      '#####################',
      '#....S..............#',
      '#...###.............#',
      '#...###.............#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#.....F.............#',
      '#....###............#',
      '#....###............#',
      '#....###............#',
      '#....###............#',
      '#...=###............#',
      '#...=###............#',
      '#...=###............#',
      '#....###............#',
      '#....###............#',
      '#===.###============#',
      '#####################',
    ],
  },
  {
    name: '终局双段',
    rows: [
      '#####################',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...................#',
      '#...........F.......#',
      '#..........####.....#',
      '#..........####.....#',
      '#.................###',
      '#.................###',
      '#.................###',
      '#.................###',
      '#.........##......###',
      '#.........##......###',
      '#.S.......##......###',
      '####......#####...###',
      '####......#####...###',
      '####......#####...###',
      '####^^^^^^#####...###',
      '###############...###',
    ],
  },
]

/**
 * 解析一关的字符画为瓦片矩阵；结构不合法（行数 / 列数 / 字符 / 出生
 * 点 / 旗帜数量）立即抛错，保证手工数组错误在加载期暴露。
 * @param level - 关卡定义。
 * @returns 解析后的关卡信息。
 */
export function parseLevel(level: PortalLevel): LevelInfo {
  if (level.rows.length !== ROWS) throw new Error('portal: level rows must be ' + ROWS)
  const tiles: TileKind[][] = []
  let spawnCol = -1
  let spawnRow = -1
  let flagCol = -1
  let flagRow = -1
  for (let row = 0; row < ROWS; row += 1) {
    const line = level.rows[row]!
    if (line.length !== COLS) throw new Error('portal: level row ' + row + ' must be ' + COLS + ' chars')
    const lineTiles: TileKind[] = []
    for (let col = 0; col < COLS; col += 1) {
      const ch = line[col]!
      if (ch === '#') lineTiles.push('wall')
      else if (ch === '.') lineTiles.push('empty')
      else if (ch === '^') lineTiles.push('spike')
      else if (ch === '=') lineTiles.push('laser')
      else if (ch === 'S') {
        lineTiles.push('empty')
        spawnCol = col
        spawnRow = row
      } else if (ch === 'F') {
        lineTiles.push('empty')
        flagCol = col
        flagRow = row
      } else throw new Error('portal: bad tile char ' + ch + ' at ' + col + ',' + row)
    }
    tiles.push(lineTiles)
  }
  if (spawnCol < 0) throw new Error('portal: level needs one spawn tile')
  if (flagCol < 0) throw new Error('portal: level needs one flag tile')
  return { name: level.name, tiles, spawnCol, spawnRow, flagCol, flagRow }
}

/**
 * 读瓦片种类；水平越界视为墙（边界封死），竖直越界视为空（可跳出
 * 上下边，坠出底部判负）。
 * @param info - 关卡信息。
 * @param col - 瓦片列。
 * @param row - 瓦片行。
 * @returns 瓦片种类。
 */
export function tileKind(info: LevelInfo, col: number, row: number): TileKind {
  if (col < 0 || col >= COLS) return 'wall'
  if (row < 0 || row >= ROWS) return 'empty'
  return info.tiles[row]![col]!
}

/**
 * 瓦片是否实心（墙）。
 * @param info - 关卡信息。
 * @param col - 瓦片列。
 * @param row - 瓦片行。
 * @returns 是否实心。
 */
export function isSolid(info: LevelInfo, col: number, row: number): boolean {
  return tileKind(info, col, row) === 'wall'
}

/** 门面所在平面 x px。 */
function faceX(col: number, dir: 1 | -1): number {
  return dir === 1 ? (col + 1) * TILE : col * TILE
}

/**
 * 构造一扇门（调用方需先用 canPlacePortal 校验）。
 * @param col - 墙瓦片列。
 * @param row - 墙瓦片行。
 * @param dir - 外法线方向。
 * @returns 门数据。
 */
export function makePortal(col: number, row: number, dir: 1 | -1): Portal {
  return { col, row, dir, x: faceX(col, dir), y: row * TILE + TILE / 2 }
}

/**
 * 传送门放置合法性：只能贴竖直墙面——该瓦片必须是墙，且门朝向的相邻
 * 瓦片必须是空（地面 / 天花板水平面与悬空处都放不了），且不得与另一
 * 扇门抢同一墙面。
 * @param info - 关卡信息。
 * @param col - 目标墙瓦片列。
 * @param row - 目标墙瓦片行。
 * @param dir - 门朝向（+1 右侧面 / -1 左侧面）。
 * @param other - 另一扇已放置的门（可空）。
 * @returns 是否可放。
 */
export function canPlacePortal(info: LevelInfo, col: number, row: number, dir: 1 | -1, other: Portal | null): boolean {
  if (!isSolid(info, col, row)) return false
  if (tileKind(info, col + dir, row) !== 'empty') return false
  if (other !== null && other.col === col && other.row === row && other.dir === dir) return false
  return true
}

/**
 * 传送速度映射：大小严格守恒。同朝向门对速度整体取反（下落翻转为上升
 * ——落差弹射）；对朝向门对速度保持不变（平移穿越）。
 * @param vx - 入门时横向速度。
 * @param vy - 入门时纵向速度。
 * @param dirA - 入门门外法线方向。
 * @param dirB - 出门门外法线方向。
 * @returns 出门速度分量。
 */
export function teleportVelocity(vx: number, vy: number, dirA: 1 | -1, dirB: 1 | -1): { vx: number, vy: number } {
  if (dirA === dirB) return { vx: -vx, vy: -vy }
  return { vx, vy }
}

/** 阶段：进行中 / 失败（本关重来）/ 过关。 */
export type PortalPhase = 'playing' | 'dead' | 'won'

/** 单步内产生、供渲染层消费的可视事件。 */
export type PortalEvent =
  | { type: 'warp', x: number, y: number, color: PortalColor }
  | { type: 'die', cause: 'spike' | 'laser' | 'fall', x: number, y: number }
  | { type: 'win', x: number, y: number }
  | { type: 'place', color: PortalColor, col: number, row: number }

/** 帧输入：左 / 右横移 + 跳跃（按住可在落地瞬间连跳）。 */
export interface PortalInput {
  left: boolean
  right: boolean
  jump: boolean
}

/** 一局游戏的完整可测状态。 */
export interface PortalState {
  /** 注入种子（渲染动画相位派生用；物理无随机）。 */
  seed: number
  /** 当前关卡下标。 */
  levelIndex: number
  /** 当前关卡解析结果。 */
  info: LevelInfo
  /** 对局内毫秒。 */
  t: number
  /** 角色中心与速度。 */
  x: number
  y: number
  vx: number
  vy: number
  /** 是否踩地。 */
  grounded: boolean
  /** 剩余跳数（落地回满 2——支持二段跳）。 */
  jumpsLeft: number
  phase: PortalPhase
  /** 阶段最近一次切换时的 t。 */
  phaseAt: number
  /** 本关死亡次数（R 重开清零，死亡自增）。 */
  deaths: number
  blue: Portal | null
  orange: Portal | null
  /** 传送冷却剩余 ms。 */
  lockMs: number
  /** 本步事件（每次 stepPortal 开头清空）。 */
  events: PortalEvent[]
  /** 轨迹残影采样（最近在前）。 */
  trail: { x: number, y: number }[]
}

/**
 * 新开一局（或切到某关）。
 * @param seed - 注入种子。
 * @param levelIndex - 起始关卡下标（默认 0）。
 * @param deaths - 携带的死亡计数（默认 0）。
 * @returns 初始状态（角色站在出生瓦片中心）。
 */
export function createPortalState(seed: number, levelIndex = 0, deaths = 0): PortalState {
  const info = parseLevel(LEVELS[levelIndex]!)
  return {
    seed,
    levelIndex,
    info,
    t: 0,
    x: info.spawnCol * TILE + TILE / 2,
    y: info.spawnRow * TILE + TILE / 2,
    vx: 0,
    vy: 0,
    grounded: false,
  jumpsLeft: 2,
    phase: 'playing',
    phaseAt: 0,
    deaths,
    blue: null,
    orange: null,
    lockMs: 0,
    events: [],
    trail: [],
  }
}

/**
 * 重开当前关（死亡后自动 / 按 R 手动）。
 * @param state - 当前状态（原地重置，关卡与死亡策略由参数决定）。
 * @param countDeath - 是否计入一次死亡（自动重开计，手动 R 不计）。
 */
export function restartLevel(state: PortalState, countDeath: boolean): void {
  const fresh = createPortalState(state.seed, state.levelIndex, state.deaths + (countDeath ? 1 : 0))
  Object.assign(state, fresh)
}

/**
 * 放置 / 移动一扇传送门（非法位置直接忽略，不改状态）。
 * @param state - 当前状态。
 * @param col - 墙瓦片列。
 * @param row - 墙瓦片行。
 * @param dir - 门朝向。
 * @param color - 蓝门或橙门。
 * @returns 是否放置成功。
 */
export function placePortal(state: PortalState, col: number, row: number, dir: 1 | -1, color: PortalColor): boolean {
  const other = color === 'blue' ? state.orange : state.blue
  if (!canPlacePortal(state.info, col, row, dir, other)) return false
  const portal = makePortal(col, row, dir)
  if (color === 'blue') state.blue = portal
  else state.orange = portal
  state.events.push({ type: 'place', color, col, row })
  return true
}

/** 角色盒是否与实心瓦片重叠（内缩 inset）。 */
function boxHitsSolid(info: LevelInfo, cx: number, cy: number, inset: number): boolean {
  const c0 = Math.floor((cx - PLAYER_HALF_W + inset) / TILE)
  const c1 = Math.floor((cx + PLAYER_HALF_W - inset) / TILE)
  const r0 = Math.floor((cy - PLAYER_HALF_H + inset) / TILE)
  const r1 = Math.floor((cy + PLAYER_HALF_H - inset) / TILE)
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      if (isSolid(info, col, row)) return true
    }
  }
  return false
}

/** 找正对着运动方向、且角色纵向区间与门身重叠的那扇门。 */
function pickPortal(state: PortalState, wallCol: number, faceDir: 1 | -1): Portal | null {
  if (state.blue === null || state.orange === null) return null
  if (state.lockMs > 0) return null
  const span = PORTAL_HALF_H + PLAYER_HALF_H - 6
  for (const p of [state.blue, state.orange]) {
    if (p!.col !== wallCol || p!.dir !== faceDir) continue
    if (Math.abs(state.y - p!.y) < span) return p!
  }
  return null
}

/** 执行传送：位置换到出门门外，速度按门朝向映射，进入冷却。 */
function doTeleport(state: PortalState, portal: Portal): void {
  const other = portal === state.blue ? state.orange! : state.blue!
  let ny = other.y + (state.y - portal.y)
  const nx = other.x + other.dir * (PLAYER_HALF_W + 1)
  if (boxHitsSolid(state.info, nx, ny, 2)) ny = other.y
  const v = teleportVelocity(state.vx, state.vy, portal.dir, other.dir)
  state.x = nx
  state.y = ny
  state.vx = v.vx
  state.vy = v.vy
  state.lockMs = PORTAL_LOCK_MS
  state.grounded = false
  state.events.push({ type: 'warp', x: nx, y: ny, color: portal === state.blue ? 'blue' : 'orange' })
}

/** 横向移动 + 瓦片碰撞（门前先尝试传送拦截）。 */
function moveX(state: PortalState, dt: number): void {
  if (state.vx === 0) return
  const nx = state.x + state.vx * dt
  const moveDir = state.vx > 0 ? 1 : -1
  const edge = moveDir > 0 ? nx + PLAYER_HALF_W : nx - PLAYER_HALF_W
  const col = Math.floor(edge / TILE)
  const r0 = Math.floor((state.y - PLAYER_HALF_H + 2) / TILE)
  const r1 = Math.floor((state.y + PLAYER_HALF_H - 2) / TILE)
  let blocked = false
  for (let row = r0; row <= r1; row += 1) {
    if (isSolid(state.info, col, row)) blocked = true
  }
  if (!blocked) {
    state.x = nx
    return
  }
  const portal = pickPortal(state, col, moveDir > 0 ? -1 : 1)
  if (portal !== null) {
    doTeleport(state, portal)
    return
  }
  state.x = moveDir > 0 ? col * TILE - PLAYER_HALF_W - 0.01 : (col + 1) * TILE + PLAYER_HALF_W + 0.01
  state.vx = 0
}

/** 纵向移动 + 瓦片碰撞（落地清零速度）。 */
function moveY(state: PortalState, dt: number): void {
  const ny = state.y + state.vy * dt
  const moveDir = state.vy > 0 ? 1 : -1
  const edge = moveDir > 0 ? ny + PLAYER_HALF_H : ny - PLAYER_HALF_H
  const row = Math.floor(edge / TILE)
  const c0 = Math.floor((state.x - PLAYER_HALF_W + 2) / TILE)
  const c1 = Math.floor((state.x + PLAYER_HALF_W - 2) / TILE)
  let blocked = false
  for (let col = c0; col <= c1; col += 1) {
    if (isSolid(state.info, col, row)) blocked = true
  }
  if (!blocked) {
    state.y = ny
    return
  }
  state.y = moveDir > 0 ? row * TILE - PLAYER_HALF_H - 0.01 : (row + 1) * TILE + PLAYER_HALF_H + 0.01
  state.vy = 0
}

/** 踩地探测：脚下 1px 内有实心即算踩地。 */
function probeGrounded(state: PortalState): void {
  const y = state.y + PLAYER_HALF_H + 1
  const c0 = Math.floor((state.x - PLAYER_HALF_W + 2) / TILE)
  const c1 = Math.floor((state.x + PLAYER_HALF_W - 2) / TILE)
  const row = Math.floor(y / TILE)
  state.grounded = false
  for (let col = c0; col <= c1; col += 1) {
    if (isSolid(state.info, col, row)) {
    state.grounded = true
    state.jumpsLeft = 2
  }
  }
}

/** 危险 / 旗帜 / 坠落判定（每子步末尾）。 */
function checkOutcomes(state: PortalState): void {
  const inset = 4
  const c0 = Math.floor((state.x - PLAYER_HALF_W + inset) / TILE)
  const c1 = Math.floor((state.x + PLAYER_HALF_W - inset) / TILE)
  const r0 = Math.floor((state.y - PLAYER_HALF_H + inset) / TILE)
  const r1 = Math.floor((state.y + PLAYER_HALF_H - inset) / TILE)
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const kind = tileKind(state.info, col, row)
      if (kind === 'spike' || kind === 'laser') {
        state.phase = 'dead'
        state.phaseAt = state.t
        state.events.push({ type: 'die', cause: kind === 'spike' ? 'spike' : 'laser', x: state.x, y: state.y })
        return
      }
    }
  }
  if (state.y - PLAYER_HALF_H > H + 40) {
    state.phase = 'dead'
    state.phaseAt = state.t
    state.events.push({ type: 'die', cause: 'fall', x: state.x, y: state.y })
    return
  }
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      if (col === state.info.flagCol && row === state.info.flagRow) {
        state.phase = 'won'
        state.phaseAt = state.t
        state.events.push({ type: 'win', x: state.x, y: state.y })
        return
      }
    }
  }
}

/** 单个固定子步：输入 → 跳跃 → 重力 → 横移 → 纵移 → 踩地 → 判定。 */
function substep(state: PortalState, dt: number, input: PortalInput): void {
  if (state.lockMs > 0) state.lockMs = Math.max(0, state.lockMs - dt * 1000)
  if (input.left !== input.right) {
    const dir = input.left ? -1 : 1
    state.vx += dir * MOVE_ACC * dt
    if (state.vx > MAX_VX) state.vx = MAX_VX
    if (state.vx < -MAX_VX) state.vx = -MAX_VX
  } else {
    const damp = (state.grounded ? GROUND_DAMP : AIR_DAMP) * dt
    if (state.vx > 0) state.vx = Math.max(0, state.vx - damp)
    else state.vx = Math.min(0, state.vx + damp)
  }
  // 二段跳：落地回满 2 跳；空中仍可用一次（JUMP_VY 的 0.9 倍略弱）。
  if (input.jump && state.jumpsLeft > 0) {
    state.vy = state.grounded ? JUMP_VY : JUMP_VY * 0.9
    state.jumpsLeft -= 1
    state.grounded = false
  }
  state.vy += GRAVITY * dt
  if (state.vy > MAX_FALL) state.vy = MAX_FALL
  moveX(state, dt)
  moveY(state, dt)
  probeGrounded(state)
  checkOutcomes(state)
}

/**
 * 推进一帧：内部按 SUBSTEP_MS 切分为固定子步（确定性），非进行中只走
 * 时钟（供遮罩倒计时），并记录轨迹残影。
 * @param state - 当前状态（原地推进）。
 * @param dtMs - 帧时长 ms。
 * @param input - 本帧输入。
 */
export function stepPortal(state: PortalState, dtMs: number, input: PortalInput): void {
  state.events = []
  state.t += dtMs
  if (state.phase !== 'playing' || dtMs <= 0) return
  const n = Math.max(1, Math.round(dtMs / SUBSTEP_MS))
  const h = dtMs / n
  for (let i = 0; i < n && state.phase === 'playing'; i += 1) {
    substep(state, h / 1000, input)
  }
  state.trail.unshift({ x: state.x, y: state.y })
  if (state.trail.length > TRAIL_MAX) state.trail.pop()
}

/**
 * 当前分值 = 已过关数（进行中为本关下标，过关瞬间为本关下标 + 1）。
 * @param state - 当前状态。
 * @returns 分值。
 */
export function portalScore(state: PortalState): number {
  return state.phase === 'won' ? state.levelIndex + 1 : state.levelIndex
}