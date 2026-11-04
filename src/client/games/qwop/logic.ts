/**
 * 手忙脚乱 QWOP 纯逻辑：简化双足"角度弹簧-阻尼"跑步模型——躯干是一
 * 个倒立摆（起跑带前倾、放着不管必然前扑），Q/W 分别给左/右大腿施加
 * 相对躯干的力矩，O/P 分别给左/右小腿施加力矩。脚触地产生支撑（弹
 * 簧+阻尼）：支撑脚在髋前方会把躯干向后顶（救跌），落到髋后方则推
 * 身体前进；O/P 在该脚触地时向下蹬地（竖直蹬伸=小跳，卸掉另一脚才
 * 能摆腿）；触地腿摆动受限（有摩擦）。躯干超角、膝盖触地或头触地即
 * 摔倒，前进距离（米）即分数，跑满 50 m 过线。固定 4 ms 子步 + 帧间
 * 时间累加器：任意帧间隔输入下模拟序列完全确定、可精确重放。世界坐
 * 标 y 向上为正、地面为 y=0，x 正向为跑动方向；长度单位米，时间单位
 * 毫秒（子步内部换算为秒）。
 */

/** 逻辑画布尺寸（渲染层用）。 */
export const W = 720
export const H = 420

/** 过线目标距离（米）。 */
export const GOAL_M = 50
/** 固定物理子步毫秒数。 */
export const SUB_MS = 4

/** 大腿长度（米）。 */
export const L_THIGH = 0.44
/** 小腿长度（米）。 */
export const L_CALF = 0.44
/** 躯干长度（髋到头，米）。 */
export const L_TORSO = 0.62
/** 起跑髋高（微屈膝站立，米）。 */
export const START_HIP_Y = 0.82
/** 双腿伸直时的髋高上限（米）。 */
export const MAX_HIP_Y = L_THIGH + L_CALF - 0.01
/** 起跑躯干前倾角（rad）——不控就会越扑越深。 */
export const START_TORSO = 0.28
/** 重力加速度（m/s^2）。 */
export const G = 9.8

/** 躯干倒立摆失稳系数（越大越快前扑）。 */
export const TORSO_INSTAB = 4.6
/** 躯干角速度阻尼（每秒衰减比例，抑制救跌后的往复过冲）。 */
export const TORSO_DAMP = 1.5
/** 大腿摆位随躯干前倾的跟随系数（0 = 完全竖垂，1 = 完全随躯干）。 */
export const LEG_FOLLOW = 0.05
/** 步幅线系数：当前前倾下"平衡支撑点"在髋前 sin(躯干角)·STRIDE_AHEAD 处。 */
export const STRIDE_AHEAD = 0.25
/** 落在步幅线之前的脚对躯干转动的吸收系数（只刹不反推——迈一步接住
 * 前扑的躯干，这正是 QWOP 里 Q/W 抢救的本能动作）。 */
export const K_ABSORB = 40
/** 步幅线位置的弱回正系数（rad/s^2 每米偏移，双向小量）。 */
export const K_BACK = 6
/** 躯干前倾本身的推进系数（前倾带步）。 */
export const K_LEAN_DRIVE = 4
/** 支撑脚落到髋后方的推进系数（每米偏移的加速度）。 */
export const K_STANCE = 36
/** O/P 蹬地竖直加速度（m/s^2，把身体蹬离地面才能摆另一条腿）。 */
export const K_KICK = 55
/** 触地支撑弹簧系数。 */
export const K_SUPPORT = 320
/** 触地时垂直速度阻尼（每秒衰减比例）。 */
export const C_SUPPORT = 8
/** 触地腿摆动阻尼（每秒衰减比例，腿钉在地上摆不动）。 */
export const C_STANCE_SWING = 4
/** 触地脚"钉桩"系数：脚被钉在落地点，髋越过桩点时腿被几何拉着后旋
 * （身体从支撑脚上方跨越过去——这才是跑步的招牌动作）。 */
export const K_FOOT_PIN = 60
/** 触地水平摩擦（每秒衰减比例）。 */
export const FRICTION = 1.8
/** 空气水平阻力（每秒衰减比例）。 */
export const AIR_DRAG = 0.25
/** 水平速度上限（m/s）。 */
export const MAX_VX = 3.2

/** 大腿力矩（rad/s^2）。 */
export const TQ_THIGH = 16
/** 大腿弹簧刚度（相对躯干，拉回自然摆位）。 */
export const K_THIGH = 20
/** 大腿自然摆位（相对躯干，略前）。 */
export const REST_THIGH = 0.05
/** 大腿阻尼。 */
export const C_THIGH = 3.0

/** 小腿力矩（rad/s^2，按 O/P = 蹬伸膝关节：把脚向后/向下蹬出）。 */
export const TQ_CALF = 14
/** 小腿弹簧刚度（相对大腿）。 */
export const K_CALF = 18
/** 小腿自然弯度（相对大腿，膝微屈）。 */
export const REST_CALF = 0.22
/** 小腿阻尼。 */
export const C_CALF = 2.4
/** 膝关节弯度上限（防反关节）。 */
export const CALF_MAX = 1.5
/** 髋关节摆幅上限。 */
export const THIGH_MAX = 1.35

/** 躯干超角阈值（rad，超过即摔倒）。 */
export const FALL_TORSO = 1.0
/** 膝盖离地危险高度（米，低于即摔倒）。 */
export const KNEE_GROUND = 0.07
/** 头部危险高度（米）。 */
export const HEAD_GROUND = 0.3
/** 摔倒后瘫地沉降动画时长（ms），期间物理继续、输入无效。 */
export const FALL_SETTLE_MS = 1000

/** 帧输入：Q/W = 左/右大腿，O/P = 左/右小腿。 */
export interface QwopInput {
  q: boolean
  w: boolean
  o: boolean
  p: boolean
}

/** 阶段：奔跑中 / 已摔倒 / 已过线。 */
export type QwopPhase = 'playing' | 'fallen' | 'finished'

/** 摔倒原因：躯干超角 / 膝盖触地 / 头触地。 */
export type QwopFallReason = 'torso' | 'knee' | 'head'

/** 单步内产生、供渲染层消费的可视事件。 */
export type QwopEvent =
  | { type: 'step', x: number, footY: number, side: 'left' | 'right' }
  | { type: 'fall', x: number, reason: QwopFallReason }
  | { type: 'finish', x: number }

/** 一局游戏的完整可测状态。 */
export interface QwopState {
  /** 回合内已流逝 ms。 */
  t: number
  /** 子步时间累加器（ms），保证任意帧长下子步序列一致。 */
  acc: number
  phase: QwopPhase
  fallReason: QwopFallReason | null
  /** 摔倒后已沉降 ms。 */
  settle: number
  /** 躯干角（rad，0 = 直立，正 = 前倾）。 */
  torso: number
  torsoW: number
  /** 左/右大腿相对躯干角（0 = 顺躯干垂下，正 = 前摆）。 */
  thighL: number, thighLW: number
  thighR: number, thighRW: number
  /** 左/右小腿相对大腿角（正 = 屈膝/脚后收）。 */
  calfL: number, calfLW: number
  calfR: number, calfRW: number
  /** 髋位置（米）与速度。 */
  hipX: number
  hipY: number
  vx: number
  vy: number
  /** 最远前进距离（米，只增不减）。 */
  dist: number
  /** 上一子步是否触地（渲染高亮用）。 */
  groundedL: boolean
  groundedR: boolean
  /** 左/右脚的落地点（钉桩 x，米；腾空时无意义）。 */
  pinLX: number
  pinRX: number
  events: QwopEvent[]
}

/** 各关节世界坐标（米，y 向上、地面 0）。 */
export interface QwopJoints {
  hipX: number, hipY: number
  headX: number, headY: number
  kneeLX: number, kneeLY: number, footLX: number, footLY: number
  kneeRX: number, kneeRY: number, footRX: number, footRY: number
}

/**
 * 由状态解算各关节世界坐标：角 a 的腿段方向为 (sin a, -cos a)，
 * a=0 竖直向下、正向前方。
 * @param s - 当前状态。
 * @returns 关节坐标（新对象）。
 */
export function qwopJoints(s: QwopState): QwopJoints {
  const thighWL = s.torso + s.thighL
  const thighWR = s.torso + s.thighR
  const calfWL = thighWL + s.calfL
  const calfWR = thighWR + s.calfR
  const kneeLX = s.hipX + L_THIGH * Math.sin(thighWL)
  const kneeLY = s.hipY - L_THIGH * Math.cos(thighWL)
  const kneeRX = s.hipX + L_THIGH * Math.sin(thighWR)
  const kneeRY = s.hipY - L_THIGH * Math.cos(thighWR)
  return {
    hipX: s.hipX, hipY: s.hipY,
    headX: s.hipX + L_TORSO * Math.sin(s.torso),
    headY: s.hipY + L_TORSO * Math.cos(s.torso),
    kneeLX, kneeLY,
    footLX: kneeLX + L_CALF * Math.sin(calfWL),
    footLY: kneeLY - L_CALF * Math.cos(calfWL),
    kneeRX, kneeRY,
    footRX: kneeRX + L_CALF * Math.sin(calfWR),
    footRY: kneeRY - L_CALF * Math.cos(calfWR),
  }
}

/**
 * 新开一局：微屈膝、带前倾站在起点——这就是 QWOP 的"不控必摔"。
 * @returns 初始状态。
 */
export function createQwop(): QwopState {
  return {
    t: 0, acc: 0, phase: 'playing', fallReason: null, settle: 0,
    torso: START_TORSO, torsoW: 0,
    // 大腿初始取世界竖垂（相对角 = -躯干角），双脚落在髋正下方。
    thighL: REST_THIGH - START_TORSO, thighLW: 0,
    thighR: REST_THIGH - START_TORSO, thighRW: 0,
    calfL: 0, calfLW: 0, calfR: 0, calfRW: 0,
    hipX: 0, hipY: START_HIP_Y, vx: 0, vy: 0,
    dist: 0, groundedL: true, groundedR: true, pinLX: 0, pinRX: 0, events: [],
  }
}

/** 空输入（摔倒沉降阶段复用）。 */
const NO_INPUT: QwopInput = { q: false, w: false, o: false, p: false }

/**
 * 单条触地腿的支撑效果：钉桩回拉力矩、步幅线躯干支撑、推进与蹬地。
 * @param s - 目标状态。
 * @param ahead - 脚相对髋的前向偏移（米），负 = 脚在髋后。
 * @param footX - 脚当前世界 x（米）。
 * @param pinX - 脚落地点（钉桩 x，米）。
 * @param inputKick - 该腿 O/P 是否按下（蹬地小跳）。
 * @param dt - 子步秒。
 * @returns 钉桩对大腿的回拉力矩（rad/s^2·dt 已乘好，施加到对应腿）。
 */
function stanceLeg(
  s: QwopState, ahead: number, footX: number, footY: number, pinX: number, inputKick: boolean, dt: number,
): number {
  // 负载因子：蹬地腾空（穿透变浅）时桩松开，腿才能摆动换位。
  const load = Math.min(1, -footY / 0.04)
  // 步幅线支撑：脚落在步幅线之前 = 接住正在前扑的躯干（吸收正转
  // 角速度，只刹不反推，杜绝一步过后仰翻）；落在其后则不接，前扑
  // 继续——逼着玩家不断交替迈腿。弱位置项提供静态平衡感。
  const over = ahead - STRIDE_AHEAD * Math.sin(s.torso)
  if (over > 0 && s.torsoW > 0) {
    const brake = K_ABSORB * over * dt
    s.torsoW -= Math.min(s.torsoW, brake)
  } else if (over < 0 && s.torsoW < 0) {
    const brake = K_ABSORB * (-over) * dt
    s.torsoW += Math.min(-s.torsoW, brake)
  }
  s.torsoW += K_BACK * (STRIDE_AHEAD * Math.sin(s.torso) - ahead) * dt
  s.vx += (K_LEAN_DRIVE * Math.sin(s.torso) + K_STANCE * Math.max(0, -ahead)) * dt
  if (inputKick) s.vy += K_KICK * dt
  // 钉桩：脚离开落地点就把大腿往回拉（髋越过桩点 → 腿后旋 → 跨越）。
  return -K_FOOT_PIN * (footX - pinX) * load * dt
}

/**
 * 单个固定子步：读取上一步关节位形判定触地 → 施加力矩/冲量 → 积分
 * → 摔倒与过线判定。全部算术确定性，无随机。
 * @param s - 目标状态（原地修改）。
 * @param input - 本子步输入。
 */
function substep(s: QwopState, input: QwopInput): void {
  const dt = SUB_MS / 1000
  const live = s.phase === 'playing'
  const inp = live ? input : NO_INPUT
  const j = qwopJoints(s)

  // 躯干倒立摆：越前倾重力矩越大，不控必扑；角速度阻尼防往复过冲。
  s.torsoW += TORSO_INSTAB * Math.sin(s.torso) * dt
  s.torsoW *= Math.max(0, 1 - TORSO_DAMP * dt)

  // 触地判定（用上一步位形）与支撑效应。
  const footLDown = j.footLY <= 0
  const footRDown = j.footRY <= 0
  let grounded = false
  if (footLDown) {
    grounded = true
    if (!s.groundedL) {
      s.pinLX = j.footLX
      if (live) s.events.push({ type: 'step', x: j.footLX, footY: j.footLY, side: 'left' })
    }
    s.vy += K_SUPPORT * Math.min(0.15, -j.footLY) * dt
    s.thighLW += stanceLeg(s, j.footLX - s.hipX, j.footLX, j.footLY, s.pinLX, inp.o, dt)
    // 触地腿被钉住：满载时摆动受限（按负载衰减角速度）。
    s.thighLW *= Math.max(0, 1 - C_STANCE_SWING * Math.min(1, -j.footLY / 0.04) * dt)
  }
  if (footRDown) {
    grounded = true
    if (!s.groundedR) {
      s.pinRX = j.footRX
      if (live) s.events.push({ type: 'step', x: j.footRX, footY: j.footRY, side: 'right' })
    }
    s.vy += K_SUPPORT * Math.min(0.15, -j.footRY) * dt
    s.thighRW += stanceLeg(s, j.footRX - s.hipX, j.footRX, j.footRY, s.pinRX, inp.p, dt)
    s.thighRW *= Math.max(0, 1 - C_STANCE_SWING * Math.min(1, -j.footRY / 0.04) * dt)
  }
  s.groundedL = footLDown
  s.groundedR = footRDown

  // 关节力矩 + 弹簧回位 + 阻尼（角度弹簧-阻尼近似，不做完整刚体）。
  // 大腿弹簧以"世界竖垂 + 随倾跟随"为回位目标：躯干倒了腿只跟着倒一
  // 半——不主动摆腿支撑，前扑就救不回来，这正是 QWOP 的难点。
  const thighWL = s.torso + s.thighL
  const thighWR = s.torso + s.thighR
  const restW = REST_THIGH + LEG_FOLLOW * Math.sin(s.torso)
  s.thighLW += ((inp.q ? TQ_THIGH : 0) - K_THIGH * (thighWL - restW) - C_THIGH * s.thighLW) * dt
  s.thighRW += ((inp.w ? TQ_THIGH : 0) - K_THIGH * (thighWR - restW) - C_THIGH * s.thighRW) * dt
  // O/P 取负号 = 蹬伸（把屈膝角拉向 0/过伸），而不是把脚蜷起来。
  s.calfLW += ((inp.o ? -TQ_CALF : 0) - K_CALF * (s.calfL - REST_CALF) - C_CALF * s.calfLW) * dt
  s.calfRW += ((inp.p ? -TQ_CALF : 0) - K_CALF * (s.calfR - REST_CALF) - C_CALF * s.calfRW) * dt

  // 积分角度，钳制关节活动范围（碰限位即卸掉角速度）。
  s.torso += s.torsoW * dt
  s.thighL = clampAngle(s.thighL + s.thighLW * dt, -THIGH_MAX, THIGH_MAX, () => { s.thighLW = 0 })
  s.thighR = clampAngle(s.thighR + s.thighRW * dt, -THIGH_MAX, THIGH_MAX, () => { s.thighRW = 0 })
  s.calfL = clampAngle(s.calfL + s.calfLW * dt, -0.05, CALF_MAX, () => { s.calfLW = 0 })
  s.calfR = clampAngle(s.calfR + s.calfRW * dt, -0.05, CALF_MAX, () => { s.calfRW = 0 })

  // 髋：重力 + 支撑阻尼 + 水平摩擦/气动。
  s.vy -= G * dt
  if (grounded) {
    s.vy *= Math.max(0, 1 - C_SUPPORT * dt)
    s.vx *= Math.max(0, 1 - FRICTION * dt)
  } else {
    s.vx *= Math.max(0, 1 - AIR_DRAG * dt)
  }
  s.vx = Math.max(-MAX_VX, Math.min(MAX_VX, s.vx))
  s.hipX += s.vx * dt
  s.hipY += s.vy * dt
  if (s.hipY > MAX_HIP_Y) { s.hipY = MAX_HIP_Y; if (s.vy > 0) s.vy = 0 }
  if (s.hipY < 0.45) { s.hipY = 0.45; if (s.vy < 0) s.vy = 0 }

  if (!live) return

  // 摔倒判定：躯干超角 / 膝触地 / 头触地。
  const j2 = qwopJoints(s)
  if (Math.abs(s.torso) > FALL_TORSO) {
    s.phase = 'fallen'; s.fallReason = 'torso'
    s.events.push({ type: 'fall', x: s.hipX, reason: 'torso' })
  } else if (j2.kneeLY < KNEE_GROUND || j2.kneeRY < KNEE_GROUND) {
    s.phase = 'fallen'; s.fallReason = 'knee'
    s.events.push({ type: 'fall', x: s.hipX, reason: 'knee' })
  } else if (j2.headY < HEAD_GROUND) {
    s.phase = 'fallen'; s.fallReason = 'head'
    s.events.push({ type: 'fall', x: s.hipX, reason: 'head' })
  }

  // 距离 = 最远前进位置（只增不减）。
  if (s.hipX > s.dist) s.dist = s.hipX
  if (s.dist >= GOAL_M) {
    s.phase = 'finished'
    s.events.push({ type: 'finish', x: s.dist })
  }
}

/** 角度钳制：碰限位即调用 onClamp 卸掉对应角速度（硬限位吸能）。 */
function clampAngle(v: number, lo: number, hi: number, onClamp: () => void): number {
  const out = Math.max(lo, Math.min(hi, v))
  if (out !== v) onClamp()
  return out
}

/**
 * 推进一帧：把 dtMs 与累加器合并后按固定 SUB_MS 子步模拟，余量留到
 * 下一帧——同一累计时间下子步序列与帧切分方式无关（确定性核心）。
 * 摔倒后继续无输入沉降 FALL_SETTLE_MS 形成瘫地姿态，随后冻结。
 * @param s - 目标状态（原地修改）。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export function stepQwop(s: QwopState, dtMs: number, input: QwopInput): void {
  s.events.length = 0
  if (s.phase === 'finished') return
  if (s.phase === 'fallen' && s.settle >= FALL_SETTLE_MS) return
  s.acc += Math.max(0, dtMs)
  while (s.acc >= SUB_MS) {
    s.acc -= SUB_MS
    substep(s, input)
    s.t += SUB_MS
    if (s.phase === 'fallen') s.settle += SUB_MS
    if (s.phase === 'fallen' && s.settle >= FALL_SETTLE_MS) break
  }
}

/**
 * 当前距离分（米，向下取整）。
 * @param s - 当前状态。
 * @returns 距离分。
 */
export function distanceScore(s: QwopState): number {
  return Math.max(0, Math.floor(s.dist))
}
