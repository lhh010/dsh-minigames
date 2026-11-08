/**
 * 电梯调度纯逻辑：10 层楼的乘客生成、电梯梯形速度曲线物理（固定子步）、
 * 到站停靠上下客、等待超时与满意度计分。全部是确定性的纯函数：随机只走
 * 注入的 rng（mulberry32 等），时间只由调用方传入的 dt 驱动，测试可用固定
 * 子步复现一切行为。
 */

/** 楼层总数（楼层编号 1..FLOORS）。 */
export const FLOORS = 10
/** 电梯载客容量。 */
export const CAPACITY = 8
/** 满意度初始值；归零游戏结束。 */
export const INITIAL_SATISFACTION = 20
/** 乘客等待超时秒数；超时离开并扣分。 */
export const WAIT_TIMEOUT_S = 30
/** 到站开门时长（上下客期间电梯停稳）。 */
export const DOOR_OPEN_S = 1
/** 电梯加速度（层/秒²）。 */
export const ELEV_ACCEL = 2.5
/** 电梯巡航最大速度（层/秒）。 */
export const ELEV_VMAX = 3
/** 固定物理子步（秒）；所有模拟都按该步长推进，保证确定性。 */
export const SUBSTEP_S = 1 / 120
/** 场上等待乘客上限（超出后本子步不再生成）。 */
export const MAX_WAITING = 30

/** 乘客/乘客目标方向。 */
export type Dir = 'up' | 'down'

/** 一名乘客：在 from 层等车想去 to 层。 */
export interface Passenger {
  id: number
  from: number
  to: number
  /** 已等待秒数。 */
  waited: number
}

/** 电梯运行阶段。 */
export type ElevatorPhase = 'idle' | 'moving' | 'doors'

export interface ElevatorState {
  /** 累计模拟时间（秒，只按子步增长）。 */
  t: number
  /** 电梯连续位置（楼层坐标 1..FLOORS，可为小数）。 */
  pos: number
  /** 速度大小（层/秒，恒 >= 0；方向由 target 推出）。 */
  vel: number
  /** 玩家指定的目标层；null 表示无任务。 */
  target: number | null
  /** 刚完成的一段行程方向（-1 下行 / 1 上行 / 0 原地），决定同方向上客。 */
  lastDir: -1 | 0 | 1
  phase: ElevatorPhase
  /** 开门剩余秒数（phase === 'doors' 时有效）。 */
  doorTimer: number
  /** 各楼层等待中的乘客。 */
  waiting: Passenger[]
  /** 轿厢内的乘客。 */
  inside: Passenger[]
  satisfaction: number
  /** 已送达人数（即分数）。 */
  delivered: number
  /** 超时离开的乘客数。 */
  lost: number
  over: boolean
  /** 距离下一次生成乘客的秒数。 */
  spawnIn: number
  nextId: number
  /** 子步累加器：把任意帧 dt 切成固定 SUBSTEP_S 推进。 */
  subAcc: number
  rng: () => number
}

/** 由起讫层推出乘车方向。 */
export function dirOf(from: number, to: number): Dir {
  return to > from ? 'up' : 'down'
}

/**
 * 生成下一个乘客到达间隔（指数分布；均值随时间缩短，人流越来越密）。
 * @param t - 当前模拟秒数。
 * @param rng - 注入的随机源。
 * @returns 距下一次生成的秒数（> 0）。
 */
export function nextSpawnInterval(t: number, rng: () => number): number {
  const mean = Math.max(1.4, 3.4 - t * 0.02)
  const u = 1 - rng()
  return -Math.log(u <= 1e-9 ? 1e-9 : u) * mean
}

/** 一局新游戏：电梯停在 1 层，无乘客，满意度满值。 */
export function createElevatorState(rng: () => number = Math.random): ElevatorState {
  return {
    t: 0,
    pos: 1,
    vel: 0,
    target: null,
    lastDir: 0,
    phase: 'idle',
    doorTimer: 0,
    waiting: [],
    inside: [],
    satisfaction: INITIAL_SATISFACTION,
    delivered: 0,
    lost: 0,
    over: false,
    spawnIn: nextSpawnInterval(0, rng),
    nextId: 1,
    subAcc: 0,
    rng,
  }
}

/**
 * 玩家输入：设定目标层（夹紧到 1..FLOORS）。
 * 关门状态下会排队，门关后即出发；选当前层会原地开门上下客。
 * @param state - 游戏状态（原地修改）。
 * @param floor - 玩家选择的目标层。
 */
export function setTarget(state: ElevatorState, floor: number): void {
  if (state.over) return
  const clamped = Math.min(FLOORS, Math.max(1, Math.round(floor)))
  state.target = clamped
  if (state.phase === 'idle' && clamped === Math.round(state.pos) && state.pos === clamped) {
    // 原地选层：立即按"无方向停靠"处理（任何方向的乘客都可上）。
    state.target = null
    state.lastDir = 0
    stopAt(state, clamped, 0)
  }
}

/** 电梯所在的整数层（moving 中是最近楼层）。 */
export function currentFloor(state: ElevatorState): number {
  return Math.round(state.pos)
}

/** 在某层等待的乘客（按生成顺序）。 */
export function waitingAt(state: ElevatorState, floor: number): Passenger[] {
  return state.waiting.filter((p) => p.from === floor)
}

/** 生成一名乘客：随机楼层 + 不同的目标层。 */
function spawnPassenger(state: ElevatorState): void {
  const from = 1 + Math.floor(state.rng() * FLOORS)
  let to = 1 + Math.floor(state.rng() * (FLOORS - 1))
  if (to >= from) to += 1
  state.waiting.push({ id: state.nextId, from, to, waited: 0 })
  state.nextId += 1
}

/**
 * 到站处理：先下客（每人送达 +1 满意度），再让同方向等待乘客上客至容量；
 * 有任何上下客动作则开门 DOOR_OPEN_S 秒，否则直接回到待命。
 * @param state - 游戏状态。
 * @param floor - 停靠层。
 * @param legDir - 该段行程方向（0 表示原地停靠，双向均可上客）。
 */
function stopAt(state: ElevatorState, floor: number, legDir: -1 | 0 | 1): void {
  // 下客。
  const staying: Passenger[] = []
  let alighted = 0
  for (const rider of state.inside) {
    if (rider.to === floor) {
      state.delivered += 1
      state.satisfaction += 1
      alighted += 1
    } else {
      staying.push(rider)
    }
  }
  state.inside = staying
  // 上客：同方向（原地停靠则双向），至容量。
  const stillWaiting: Passenger[] = []
  let boarded = false
  for (const p of state.waiting) {
    const sameDir = (dirOf(p.from, p.to) === 'up') === (legDir > 0)
    const dirOk = legDir === 0 || sameDir
    if (dirOk && state.inside.length < CAPACITY) {
      state.inside.push(p)
      boarded = true
    } else {
      stillWaiting.push(p)
    }
  }
  state.waiting = stillWaiting
  const acted = alighted > 0 || boarded
  if (acted) {
    state.phase = 'doors'
    state.doorTimer = DOOR_OPEN_S
  } else {
    state.phase = 'idle'
  }
}

/** 一个固定子步的电梯物理：加速/匀速/减速的梯形曲线并精确停靠。 */
function physicsSubstep(state: ElevatorState, h: number): void {
  if (state.phase === 'doors') {
    state.doorTimer -= h
    if (state.doorTimer <= 0) {
      state.doorTimer = 0
      state.phase = 'idle'
    }
    return
  }
  if (state.target === null || state.phase !== 'moving') return
  const target = state.target
  const diff = target - state.pos
  if (Math.abs(diff) < 1e-9) {
    state.vel = 0
    state.target = null
    state.phase = 'idle'
    stopAt(state, target, state.lastDir)
    return
  }
  const dir: 1 | -1 = diff > 0 ? 1 : -1
  const remaining = Math.abs(diff)
  // 制动距离判断：够刹住就减速，否则继续加速/巡航。
  const brakeDist = (state.vel * state.vel) / (2 * ELEV_ACCEL)
  if (brakeDist >= remaining) {
    state.vel = Math.max(0, state.vel - ELEV_ACCEL * h)
  } else {
    state.vel = Math.min(ELEV_VMAX, state.vel + ELEV_ACCEL * h)
  }
  const advance = state.vel * h
  if (advance >= remaining) {
    // 本子步内到达：精确停靠，避免离散抖动。
    state.pos = target
    state.vel = 0
    state.target = null
    state.lastDir = dir
    state.phase = 'idle'
    stopAt(state, target, dir)
    return
  }
  state.pos += dir * advance
}

/**
 * 推进游戏：把 dt 切成固定 SUBSTEP_S 子步，依次执行电梯物理、乘客等待
 * 计时/超时/生成；满意度归零即结束。
 * @param state - 游戏状态（原地修改）。
 * @param dt - 帧间隔秒数（上游已夹紧）。
 */
export function stepElevator(state: ElevatorState, dt: number): void {
  if (state.over) return
  state.subAcc += dt
  while (state.subAcc >= SUBSTEP_S) {
    state.subAcc -= SUBSTEP_S
    const h = SUBSTEP_S
    state.t += h
    // 电梯物理（开门期间不动）。
    if (state.phase === 'idle' && state.target !== null && state.target !== Math.round(state.pos)) {
      state.phase = 'moving'
    }
    physicsSubstep(state, h)
    // 等待计时与超时离开。
    const stillWaiting: Passenger[] = []
    for (const p of state.waiting) {
      p.waited += h
      if (p.waited >= WAIT_TIMEOUT_S) {
        state.lost += 1
        state.satisfaction -= 2
      } else {
        stillWaiting.push(p)
      }
    }
    state.waiting = stillWaiting
    // 乘客生成。
    state.spawnIn -= h
    if (state.spawnIn <= 0) {
      if (state.waiting.length < MAX_WAITING) spawnPassenger(state)
      state.spawnIn = nextSpawnInterval(state.t, state.rng)
    }
    // 满意度归零即结束。
    if (state.satisfaction <= 0) {
      state.satisfaction = 0
      state.over = true
      return
    }
  }
}
