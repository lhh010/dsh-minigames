/**
 * 导弹指令（Missile）纯逻辑：底部中央炮台发射拦截弹，在目标点引爆成
 * 半径 46px、持续 0.9s 的膨胀-收缩爆炸球；敌方导弹以 seed 确定性弹道
 * 从顶部向地面六座城市线性斜落，波次≥3 后部分弹中途分裂（MIRV）成
 * 2 发。来袭弹碰到爆炸球即摧毁得分；城市被命中即毁，全毁结束；每波
 * 结束奖励城市 +1（上限 6），共 6 波。模拟以固定子步（SUB_MS）推进，
 * 帧间隔先入累加器、再按整数子步消费，同一输入时间线重放逐位一致。
 * 时间单位毫秒，速度单位 px / s。
 */

/** 逻辑画布尺寸。 */
export const W = 520
export const H = 360

/** 地面 y（城市与炮台所在的基线）。 */
export const GROUND_Y = 336
/** 六座城市的中心 x（相对画布左右对称，中央为炮台）。 */
export const CITY_XS = [90, 152, 214, 306, 368, 430]
/** 城市命中半宽 px（来袭弹落点距城市中心小于该值即命中）。 */
export const CITY_HALF = 14
/** 炮台位置。 */
export const BATTERY_X = W / 2
export const BATTERY_Y = GROUND_Y

/** 爆炸球最大半径 px 与持续时长 ms。 */
export const EXPLOSION_R = 46
export const EXPLOSION_MS = 900

/** 拦截弹速度 px/s 与同时在飞上限。 */
export const INTERCEPTOR_SPEED = 340
export const MAX_INTERCEPTORS = 4

/** 总波数。 */
export const WAVES = 6
/** 波间奖励停顿 ms。 */
export const INTERMISSION_MS = 1600
/** 波开始横幅展示 ms。 */
export const BANNER_MS = 1400

/** 固定模拟子步 ms。 */
export const SUB_MS = 8

/**
 * mulberry32 确定性随机数发生器。
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

/** 一枚来袭弹（或分裂后的子弹）的确定性弹道描述。 */
export interface EnemyMissile {
  /** 发射点（顶部）。 */
  sx: number
  sy: number
  /** 目标点（城市附近的地基线）。 */
  tx: number
  ty: number
  /** 航速 px/s（沿起点-终点直线匀速）。 */
  speed: number
  /** 波开始后多少 ms 出发（0 = 立即）。 */
  spawnAt: number
  /** 行程进度 0..1（对起点-终点全长的比例）。 */
  progress: number
  /** 分裂点进度（1 = 不分裂）；到达即移除本弹并生成两发子弹。 */
  splitAt: number
  /** 分裂子弹 1 的目标点（不分裂时无效）。 */
  c1x: number
  c1y: number
  /** 分裂子弹 2 的目标点。 */
  c2x: number
  c2y: number
}

/** 一发拦截弹：从炮台直线飞向目标点，到达即引爆。 */
export interface Interceptor {
  x: number
  y: number
  tx: number
  ty: number
  /** 航向单位向量 ×speed 的速度分量。 */
  vx: number
  vy: number
  /** 剩余直线距离 px（≤0 即引爆）。 */
  remain: number
}

/** 一个爆炸球：以 (x,y) 为中心按时间膨胀再收缩。 */
export interface Explosion {
  x: number
  y: number
  /** 已持续 ms。 */
  t: number
}

/** 阶段：防守中 / 城市全毁结束 / 六波防守成功。 */
export type MissilePhase = 'playing' | 'over' | 'won'

/** 单帧内产生、供渲染层消费的可视事件。 */
export type MissileEvent =
  | { type: 'intercept', x: number, y: number }
  | { type: 'cityHit', index: number, x: number, y: number }
  | { type: 'groundHit', x: number, y: number }
  | { type: 'waveClear', wave: number }

/** 一局游戏的完整可测状态。 */
export interface MissileState {
  seed: number
  /** 回合内已流逝 ms（星空闪烁等动画用）。 */
  t: number
  /** 当前波次 1..WAVES。 */
  wave: number
  /** 波开始后已流逝 ms（横幅 / 出击调度）。 */
  waveT: number
  /** 波间停顿剩余 ms（>0 时不出击，结束瞬间开下一波）。 */
  interT: number
  /** 六座城市存活标记（索引对应 CITY_XS）。 */
  cities: boolean[]
  score: number
  phase: MissilePhase
  /** 待出击（按 spawnAt 排序）与已在空的来袭弹。 */
  pending: EnemyMissile[]
  enemies: EnemyMissile[]
  interceptors: Interceptor[]
  explosions: Explosion[]
  /** 子步累加器 ms。 */
  acc: number
  events: MissileEvent[]
  /** 波次随机流（每波 buildWave 消费一次）。 */
  rng: () => number
  /** 下一个来袭弹编号（分裂子弹延续编号，供调试）。 */
  nextId: number
}

/**
 * 爆炸球在 t ms 时刻的半径：正弦膨胀-收缩，两端为 0、中点最大
 * EXPLOSION_R，时长外恒为 0。
 * @param tMs - 爆炸已持续时间 ms。
 * @returns 当前半径 px。
 */
export function explosionRadius(tMs: number): number {
  if (tMs <= 0 || tMs >= EXPLOSION_MS) return 0
  return EXPLOSION_R * Math.sin((Math.PI * tMs) / EXPLOSION_MS)
}

/** 来袭弹在当前进度下的弹头位置（起点-终点线性插值）。 */
export function enemyPos(m: EnemyMissile): { x: number, y: number } {
  return { x: m.sx + (m.tx - m.sx) * m.progress, y: m.sy + (m.ty - m.sy) * m.progress }
}

/**
 * 生成一波来袭弹（seed 流确定性）：数量 3+wave，起点在顶部随机、目标
 * 从存活城市中随机、航速随波次提升并带随机散布、出击时间错开；波次
 * ≥3 时约 30% 的弹在行程 35%-60% 处分裂成 2 发（子弹目标同样预决定，
 * 保证与运行时城市状态无关的可重放确定性）。
 * @param rng - 本波的随机流（调用方状态内持有）。
 * @param wave - 波次 1..WAVES。
 * @param cities - 城市存活标记（目标只从存活城市中选）。
 * @returns 按 spawnAt 升序的待出击弹列表。
 */
export function buildWave(rng: () => number, wave: number, cities: boolean[]): EnemyMissile[] {
  const alive: number[] = []
  for (let i = 0; i < cities.length; i += 1) if (cities[i] === true) alive.push(i)
  const pickTarget = (): { tx: number, ty: number } => {
    const idx = alive.length > 0 ? alive[Math.floor(rng() * alive.length)]! : Math.floor(rng() * CITY_XS.length)
    return { tx: CITY_XS[idx]! + (rng() * 10 - 5), ty: GROUND_Y }
  }
  const count = 3 + wave
  const list: EnemyMissile[] = []
  for (let k = 0; k < count; k += 1) {
    const target = pickTarget()
    const m: EnemyMissile = {
      sx: 20 + rng() * (W - 40),
      sy: 0,
      tx: target.tx,
      ty: target.ty,
      speed: 26 + wave * 7 + rng() * 8,
      spawnAt: rng() * 2400 + k * 220,
      progress: 0,
      splitAt: 1,
      c1x: 0, c1y: 0, c2x: 0, c2y: 0,
    }
    if (wave >= 3 && rng() < 0.3) {
      m.splitAt = 0.35 + rng() * 0.25
      const c1 = pickTarget()
      const c2 = pickTarget()
      m.c1x = c1.tx; m.c1y = c1.ty
      m.c2x = c2.tx; m.c2y = c2.ty
    }
    list.push(m)
  }
  list.sort((a, b) => a.spawnAt - b.spawnAt)
  return list
}

/**
 * 新开一局：六城俱在、第 1 波来袭弹已按种子生成。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export function createMissile(seed: number): MissileState {
  const rng = mulberry32(seed >>> 0)
  const cities = [true, true, true, true, true, true]
  return {
    seed,
    t: 0,
    wave: 1,
    waveT: 0,
    interT: 0,
    cities,
    score: 0,
    phase: 'playing',
    pending: buildWave(rng, 1, cities),
    enemies: [],
    interceptors: [],
    explosions: [],
    acc: 0,
    events: [],
    rng,
    nextId: 0,
  }
}

/**
 * 发射一枚拦截弹：从炮台直线飞向目标点，到达即引爆（playing 且在飞
 * 数未达上限时有效）。
 * @param state - 目标状态。
 * @param tx - 目标点 x（画布任意位置）。
 * @param ty - 目标点 y。
 * @returns 是否成功发射。
 */
export function fireMissile(state: MissileState, tx: number, ty: number): boolean {
  if (state.phase !== 'playing') return false
  if (state.interceptors.length >= MAX_INTERCEPTORS) return false
  const dx = tx - BATTERY_X
  const dy = ty - BATTERY_Y
  const len = Math.hypot(dx, dy)
  if (len < 1) return false
  state.interceptors.push({
    x: BATTERY_X,
    y: BATTERY_Y,
    tx, ty,
    vx: (dx / len) * INTERCEPTOR_SPEED,
    vy: (dy / len) * INTERCEPTOR_SPEED,
    remain: len,
  })
  return true
}

/** 命中判定：点到爆炸球球心距离 ≤ 当前半径。 */
function inExplosion(ex: Explosion, x: number, y: number): boolean {
  const r = explosionRadius(ex.t)
  if (r <= 0) return false
  return Math.hypot(x - ex.x, y - ex.y) <= r
}

/** 来袭弹落地结算：命中存活城市即摧毁，否则仅地面命中事件。 */
function landMissile(state: MissileState, m: EnemyMissile): void {
  const x = m.tx
  const y = m.ty
  let hit = -1
  for (let i = 0; i < CITY_XS.length; i += 1) {
    if (state.cities[i] === true && Math.abs(x - CITY_XS[i]!) <= CITY_HALF) { hit = i; break }
  }
  if (hit >= 0) {
    state.cities[hit] = false
    state.events.push({ type: 'cityHit', index: hit, x, y })
    if (!state.cities.some((c) => c === true)) state.phase = 'over'
  } else {
    state.events.push({ type: 'groundHit', x, y })
  }
}

/** 波次结算：奖励城市 +1（上限 6，优先恢复最靠左的废墟）与波次加分。 */
function clearWave(state: MissileState): void {
  state.events.push({ type: 'waveClear', wave: state.wave })
  state.score += 50 * state.wave
  const alive = state.cities.filter((c) => c === true).length
  if (alive < CITY_XS.length && state.phase === 'playing') {
    const idx = state.cities.indexOf(false)
    if (idx >= 0) state.cities[idx] = true
  }
  if (state.wave >= WAVES) {
    state.phase = 'won'
    return
  }
  state.interT = INTERMISSION_MS
}

/**
 * 推进一个子步：出击调度、分裂、来袭弹匀速前进与落地、拦截弹前进与
 * 引爆、爆炸球老化与命中判定、波间停顿与开波。
 * @param state - 目标状态。
 */
function substep(state: MissileState): void {
  const dt = SUB_MS / 1000
  if (state.phase !== 'playing') return

  // 波间停顿：倒数归零的瞬间开下一波。
  if (state.interT > 0) {
    state.interT -= SUB_MS
    if (state.interT <= 0) {
      state.interT = 0
      state.wave += 1
      state.waveT = 0
      state.pending = buildWave(state.rng, state.wave, state.cities)
    }
  } else {
    state.waveT += SUB_MS
    // 出击：到点的待出击弹进入空域。
    while (state.pending.length > 0 && state.pending[0]!.spawnAt <= state.waveT) {
      state.enemies.push(state.pending.shift()!)
    }
  }

  // 来袭弹：匀速沿直线前进，途中分裂或落地。
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const m = state.enemies[i]!
    if (state.interT === 0 && m.progress >= m.splitAt && m.splitAt < 1) {
      // MIRV 分裂：本弹移除，两发子弹从当前位置出发、航向预决定目标。
      const pos = enemyPos(m)
      state.enemies.splice(i, 1)
      for (const t of [{ x: m.c1x, y: m.c1y }, { x: m.c2x, y: m.c2y }]) {
        state.enemies.push({
          sx: pos.x, sy: pos.y,
          tx: t.x, ty: t.y,
          speed: m.speed * 1.15,
          spawnAt: m.spawnAt,
          progress: 0,
          splitAt: 1,
          c1x: 0, c1y: 0, c2x: 0, c2y: 0,
        })
      }
      continue
    }
    const total = Math.hypot(m.tx - m.sx, m.ty - m.sy)
    m.progress += (m.speed * dt) / total
    if (m.progress >= 1) {
      m.progress = 1
      state.enemies.splice(i, 1)
      landMissile(state, m)
      // 城市全毁时 landMissile 已置 over，本子步立即收尾。
      if (!state.cities.some((c) => c === true)) return
    }
  }

  // 拦截弹：直线前进，剩余距离耗尽即在目标点引爆。
  for (let i = state.interceptors.length - 1; i >= 0; i -= 1) {
    const it = state.interceptors[i]!
    const step = INTERCEPTOR_SPEED * dt
    it.x += it.vx * dt
    it.y += it.vy * dt
    it.remain -= step
    if (it.remain <= 0) {
      state.interceptors.splice(i, 1)
      state.explosions.push({ x: it.tx, y: it.ty, t: 0 })
    }
  }

  // 爆炸球老化 + 命中判定：任一存活爆炸球罩住弹头即摧毁得分。
  for (let i = state.explosions.length - 1; i >= 0; i -= 1) {
    state.explosions[i]!.t += SUB_MS
    if (state.explosions[i]!.t >= EXPLOSION_MS) state.explosions.splice(i, 1)
  }
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const m = state.enemies[i]!
    const pos = enemyPos(m)
    let dead = false
    for (const ex of state.explosions) {
      if (inExplosion(ex, pos.x, pos.y)) { dead = true; break }
    }
    if (dead) {
      state.enemies.splice(i, 1)
      state.score += 20 + 10 * state.wave
      state.events.push({ type: 'intercept', x: pos.x, y: pos.y })
    }
  }

  // 波次结束：无待出击、无在空来袭弹即结算（波间停顿期间不再结算）。
  if (state.interT === 0 && state.pending.length === 0 && state.enemies.length === 0) {
    clearWave(state)
  }
}

/**
 * 推进一帧：dt 先入累加器，再按 SUB_MS 固定子步消费（同一输入时间线
 * 重放逐位一致）；事件写入 state.events，每帧开头清空；结束后只走时钟。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepMissile(state: MissileState, dtMs: number): void {
  state.events.length = 0
  state.t += Math.max(0, dtMs)
  if (state.phase !== 'playing') return
  state.acc += Math.max(0, dtMs)
  while (state.acc >= SUB_MS && state.phase === 'playing') {
    state.acc -= SUB_MS
    substep(state)
  }
}
