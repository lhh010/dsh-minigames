/**
 * 交叉路口 (Traffic) 纯逻辑：一个十字路口，四个方向来车（seed 泊松流，
 * 速率随时间上升），玩家切换信号灯相位（NS 绿 / EW 绿）。绿灯方向的车
 * 前进，红灯方向排队（跟车模型保持车距减速）；相位切换走 绿 → 黄(固定
 * 1.5s) → 全红(1.2s) → 对向绿 的状态机。黄灯亮起瞬间，刹不住的车被
 * 一次性标记为 committed（越线通过），其余必须在停止线前刹停；若
 * committed 车尚未清空路口而玩家反复切换，仍可能与对向车相撞。两车
 * 矩形重叠 = 事故结束；任一方向排队超过拥堵阈值 = 结束。所有随机都走
 * 注入 seed 的 mulberry32，同一 seed 下逐步重放完全确定。
 */

/** mulberry32 伪随机数生成器：小而快，同 seed 序列确定。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 车长（沿行驶方向，逻辑像素）。 */
export const CAR_LEN = 32
/** 车宽（垂直行驶方向，逻辑像素）。 */
export const CAR_W = 22
/** 巡航最高速度（px/s）。 */
export const MAX_SPEED = 70
/** 自由加速率（px/s^2）。 */
export const ACCEL = 55
/** 紧急制动率（px/s^2），用于已经贴上障碍的硬刹。 */
export const HARD_BRAKE = 160
/** 舒适制动减速度 px/s²（安全判定用）。 */
export const COMFORT_BRAKE = 60
/** 跟车安全净距 px（车头到障碍）。 */
export const CAR_GAP = 10
/** 车道全程长度：从入口边缘到出口边缘（逻辑像素）。 */
export const LANE_LEN = 800
/** 路口中心坐标。 */
export const CENTER = 400
/** 路口半宽（单条道路宽 128 = 两条车道）。 */
export const ROAD_HALF = 64
/** 路口占用车流坐标区间 [I0, I1]。 */
export const I0 = CENTER - ROAD_HALF
export const I1 = CENTER + ROAD_HALF
/** 停止线位置（路口进入边缘前 6px）。 */
export const STOP_LINE = I0 - 6
/** 黄灯时长（s，固定）。 */
export const YELLOW_S = 1.5
/** 全红缓冲时长（s）：黄灯后两轴皆红，放行前清空路口。 */
export const ALL_RED_S = 1.2
/** 最短绿灯时长（s）：切换请求在此之前被拒绝。 */
export const MIN_GREEN_S = 3
/** 单方向排队拥堵阈值：超过即结束。 */
export const CONGEST_LIMIT = 7
/**
 * 黄灯亮起瞬间的"刹不住"系数：距停止线不足 v*T 且车速够快的车被标记
 * committed，越线继续通过（此时切换对玩家有风险，需自行把握时机）。
 */
export const CAN_STOP_TIME = 0.8
/** 只有高于该速度的车才可能被标记 committed（慢车总能停下）。 */
export const COMMIT_MIN_V = 30

/** 方向编号：0=北（自上而下）1=南（自下而上）2=西（自左向右）3=东（自右向左）。 */
export type Dir = 0 | 1 | 2 | 3
/** 信号相位：南北向绿或东西向绿。 */
export type SignalPhase = 'NS' | 'EW'
/** 灯色状态：正常绿、黄灯过渡、全红缓冲。 */
export type LightState = 'green' | 'yellow' | 'allred'

/** 一辆车：pos 为车头沿车流方向的里程（0=入口边缘），v 为速度。 */
export interface TrafficCar {
  pos: number
  v: number
  /** 配色索引（render 取 accent 用）。 */
  hue: number
  /** 黄灯亮起瞬间标记的"刹不住、越线通过"；该轴回到绿灯时清除。 */
  committed: boolean
}

/** 完整对局状态；stepTraffic 每次推进一个 dt。 */
export interface TrafficState {
  cars: TrafficCar[][]
  phase: SignalPhase
  light: LightState
  /** 黄灯/全红剩余时间（s）。 */
  phaseTimer: number
  /** 当前绿灯已持续时长（s）。 */
  greenElapsed: number
  nextSpawn: number[]
  time: number
  passed: number
  score: number
  over: null | 'crash' | 'congestion'
  /** 事故发生点（路口坐标系），无事故为 null。 */
  crashAt: { x: number; y: number } | null
  /** 注入的随机源（重放确定性由 seed 保证）。 */
  rng: () => number
}

/** 方向所属的信号轴。 */
export function dirAxis(dir: Dir): SignalPhase {
  return dir === 0 || dir === 1 ? 'NS' : 'EW'
}

/** 某方向当前面对的灯色：本轴绿灯为 green，本轴黄灯为 yellow，其余 red。 */
export function signalOpen(state: TrafficState, dir: Dir): 'green' | 'yellow' | 'red' {
  if (state.light === 'allred') return 'red'
  const mine = dirAxis(dir) === state.phase
  if (state.light === 'green') return mine ? 'green' : 'red'
  return mine ? 'yellow' : 'red'
}

/**
 * 泊松间隔：速率 rate（车/s）下的指数分布间隔（s）。
 * @param rate - 该方向当前到达率。
 * @param rng - 注入随机源。
 */
export function spawnGap(rate: number, rng: () => number): number {
  return -Math.log(1 - rng()) / rate
}

/** 某方向的到达率（车/s）：基础 0.16，随时间线性上升到 0.7 封顶。 */
export function trafficRate(time: number): number {
  return Math.min(0.7, 0.16 + 0.011 * time)
}

/**
 * 跟车加速度：距离障碍 dist 以内按运动学制动（恰好在障碍前停住），
 * 远处自由加速，速度到顶则保持。
 * @param v - 当前速度。
 * @param dist - 到障碍（前车尾部或停止线）的距离，Infinity 表示无约束。
 */
export function followAccel(v: number, dist: number): number {
  // dist = 可用减速距离（到停车点）。静止且已抵近：保持静止；静止畅通：起步。
  if (v <= 0) return dist <= 1 ? 0 : ACCEL
  if (dist <= 0.5) return -HARD_BRAKE
  const free = v >= MAX_SPEED ? 0 : ACCEL
  // 运动学安全判定：以舒适制动减速能在 dist 前停住 → 可自由加速；
  // 否则按恰好停住的减速度制动。
  const need = (v * v) / (2 * COMFORT_BRAKE)
  if (need < dist - 1) return free
  return Math.max(-HARD_BRAKE, -(v * v) / (2 * Math.max(dist, 1)))
}

/** 轴对齐矩形。 */
export interface Rect { x: number; y: number; w: number; h: number }

/** 两矩形是否重叠。 */
export function rectOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** 路口箱体（两条道路的交集）。 */
export function intersectionBox(): Rect {
  return { x: I0, y: I0, w: I1 - I0, h: I1 - I0 }
}

/** 一辆车在路口坐标系中的矩形（靠右行驶：北向车道在西侧等）。 */
export function carRect(car: TrafficCar, dir: Dir): Rect {
  const laneOff = 16
  if (dir === 0) return { x: CENTER - laneOff - CAR_W / 2, y: car.pos - CAR_LEN, w: CAR_W, h: CAR_LEN }
  if (dir === 1) return { x: CENTER + laneOff - CAR_W / 2, y: LANE_LEN - car.pos, w: CAR_W, h: CAR_LEN }
  if (dir === 2) return { x: car.pos - CAR_LEN, y: CENTER + laneOff - CAR_W / 2, w: CAR_LEN, h: CAR_W }
  return { x: LANE_LEN - car.pos, y: CENTER - laneOff - CAR_W / 2, w: CAR_LEN, h: CAR_W }
}

/** 车身中心（路口坐标系），用于粒子等效果。 */
export function carCenter(car: TrafficCar, dir: Dir): { x: number; y: number } {
  const r = carRect(car, dir)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/**
 * 路口净空判定：给定轴的车是否有矩形仍占据路口箱体。
 * 黄灯结束后是否安全放行对向的依据。
 * @param state - 当前对局状态。
 * @param phase - 要检查的轴。
 */
export function intersectionClear(state: TrafficState, phase: SignalPhase): boolean {
  const box = intersectionBox()
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if (dirAxis(d) !== phase) continue
    for (const car of state.cars[d]!) {
      if (rectOverlap(carRect(car, d), box)) return false
    }
  }
  return true
}

/** 排队认定速度阈值 px/s：低于它算"卡住"（排队），行驶中的车不算。 */
export const STUCK_V = 10

/** 某方向尚未越过停止线且低速卡住的车数（拥堵统计——只计真正的排队，
 * 行驶中的来车不计，绿波同时多辆在场不误判瘫痪）。 */
export function queueLen(state: TrafficState, dir: Dir): number {
  let n = 0
  for (const car of state.cars[dir]!) {
    if (car.pos < STOP_LINE && car.v < STUCK_V) n += 1
  }
  return n
}

/** 建立新对局：初始相位 NS 绿，各方向首次来车间隔由 seed 决定。 */
export function createTrafficState(seed: number): TrafficState {
  const rng = mulberry32(seed)
  const state: TrafficState = {
    cars: [[], [], [], []],
    phase: 'NS',
    light: 'green',
    phaseTimer: 0,
    greenElapsed: 0,
    nextSpawn: [0, 0, 0, 0],
    time: 0,
    passed: 0,
    score: 0,
    over: null,
    crashAt: null,
    rng,
  }
  for (let d = 0; d < 4; d += 1) {
    state.nextSpawn[d] = 1 + d * 0.3 + spawnGap(trafficRate(0), rng)
  }
  return state
}

/**
 * 玩家请求切换相位：黄灯/全红期间或最短绿灯未满时拒绝。接受时把
 * 当前绿轴上刹不住的车一次性标记 committed（越线通过）。
 * @param state - 当前对局状态。
 * @returns 是否接受了本次请求。
 */
export function requestSwitch(state: TrafficState): boolean {
  if (state.over !== null) return false
  if (state.light !== 'green') return false
  if (state.greenElapsed < MIN_GREEN_S) return false
  state.light = 'yellow'
  state.phaseTimer = YELLOW_S
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if (dirAxis(d) !== state.phase) continue
    for (const car of state.cars[d]!) {
      if (car.v >= COMMIT_MIN_V && car.pos < STOP_LINE && STOP_LINE - car.pos <= CAN_STOP_TIME * car.v) {
        car.committed = true
      }
    }
  }
  return true
}

/**
 * 推进一个时间步：泊松生成、信号状态机（绿→黄→全红→换轴）、跟车移动、
 * 清出计分、事故检测（异轴矩形重叠或同轴追尾）、拥堵判定。
 * @param state - 对局状态（就地修改）。
 * @param dt - 步长秒数。
 */
export function stepTraffic(state: TrafficState, dt: number): void {
  if (state.over !== null) return
  state.time += dt

  // 泊松来车：入口被占用则延迟 0.5s 重试，避免叠车生成。
  for (let d = 0; d < 4; d += 1) {
    const lane = state.cars[d]!
    let wait = state.nextSpawn[d]! - dt
    while (wait <= 0) {
      if (lane.some(c => c.pos < CAR_LEN + 14)) {
        wait = 0.5
        break
      }
      lane.push({ pos: 0, v: MAX_SPEED * 0.5, hue: Math.floor(state.rng() * 8), committed: false })
      wait += spawnGap(trafficRate(state.time), state.rng)
    }
    state.nextSpawn[d] = wait
  }

  // 信号状态机：黄灯固定 1.5s → 全红 1.2s → 对向放行。
  if (state.light === 'yellow' || state.light === 'allred') {
    state.phaseTimer -= dt
    if (state.phaseTimer <= 0) {
      if (state.light === 'yellow') {
        state.light = 'allred'
        state.phaseTimer = ALL_RED_S
      } else {
        state.phase = state.phase === 'NS' ? 'EW' : 'NS'
        state.light = 'green'
        state.greenElapsed = 0
      }
    }
  } else {
    state.greenElapsed += dt
  }

  // 跟车移动：逐车道从最前车往后算。
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const lane = state.cars[d]!.sort((a, b) => b.pos - a.pos)
    const open = signalOpen(state, d)
    for (let i = 0; i < lane.length; i += 1) {
      const car = lane[i]!
      if (open === 'green') car.committed = false
      const leader = i > 0 ? lane[i - 1]! : null
      const gap = leader === null ? Infinity : leader.pos - CAR_LEN - CAR_GAP - car.pos
      let obstacle = gap
      let lineConstrained = false
      if (open !== 'green' && !car.committed && car.pos < STOP_LINE + 0.5) {
        obstacle = Math.min(obstacle, STOP_LINE - car.pos)
        lineConstrained = true
      }
      const a = followAccel(car.v, obstacle)
      car.v = Math.max(0, Math.min(MAX_SPEED, car.v + a * dt))
      // 红灯约束下的蠕行速度归零：运动学制动收敛到小正数但不精确为 0。
      if (lineConstrained && car.v < 1) car.v = 0
      car.pos += car.v * dt
      if (lineConstrained && car.pos > STOP_LINE) { car.pos = STOP_LINE; if (car.v > 0) car.v = 0 }
    }
    while (lane.length > 0 && lane[lane.length - 1]!.pos - CAR_LEN >= LANE_LEN) {
      lane.pop()
      state.passed += 1
    }
  }
  state.score = state.passed * 10 + Math.floor(state.time)

  detectCrash(state)

  if (state.over === null) {
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      if (queueLen(state, d) > CONGEST_LIMIT) {
        state.over = 'congestion'
        break
      }
    }
  }
}

/** 事故检测：异轴车矩形重叠，或同轴 gap 为负（追尾）。 */
function detectCrash(state: TrafficState): void {
  const near: { rect: Rect; dir: Dir; car: TrafficCar }[] = []
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    for (const car of state.cars[d]!) {
      if (car.pos > I0 - 60 && car.pos < I1 + 60) {
        near.push({ rect: carRect(car, d), dir: d, car })
      }
    }
  }
  for (let i = 0; i < near.length; i += 1) {
    for (let j = i + 1; j < near.length; j += 1) {
      const a = near[i]!
      const b = near[j]!
      if (a.dir === b.dir) {
        if (Math.abs(a.car.pos - b.car.pos) < CAR_LEN - 4) {
          state.over = 'crash'
          state.crashAt = midpoint(carCenter(a.car, a.dir), carCenter(b.car, b.dir))
          return
        }
      } else if (rectOverlap(a.rect, b.rect)) {
        state.over = 'crash'
        state.crashAt = midpoint(carCenter(a.car, a.dir), carCenter(b.car, b.dir))
        return
      }
    }
  }
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** 供测试/重放比较的轻量快照（不含随机源）。 */
export function snapshot(state: TrafficState): string {
  const lanes = state.cars.map(l => l.map(c => c.pos.toFixed(2) + ':' + c.v.toFixed(2) + ':' + c.hue + ':' + (c.committed ? 1 : 0)).join(','))
  return [state.phase, state.light, state.phaseTimer.toFixed(2), state.greenElapsed.toFixed(2),
    state.time.toFixed(2), String(state.passed), String(state.score), String(state.over),
    lanes.join('|'), state.nextSpawn.map(n => n.toFixed(2)).join(',')].join(';')
}
