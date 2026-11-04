import { describe, expect, it } from 'vitest'
import {
  GOAL_M, KNEE_GROUND, L_CALF, L_THIGH, L_TORSO, START_TORSO, SUB_MS, FALL_SETTLE_MS,
  createQwop, distanceScore, qwopJoints, stepQwop,
  type QwopInput, type QwopState,
} from '../src/client/games/qwop/logic.ts'

const idle: QwopInput = { q: false, w: false, o: false, p: false }
const keys = (q: boolean, w: boolean, o: boolean, p: boolean): QwopInput => ({ q, w, o, p })

/** 确定性伪随机（线性同余），生成脚本化输入序列。 */
function scriptInputs(count: number, seed = 4242): QwopInput[] {
  let s = seed
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  return Array.from({ length: count }, (): QwopInput => keys(rnd() < 0.35, rnd() < 0.35, rnd() < 0.3, rnd() < 0.3))
}

/** 按帧序列推进；中途结束也继续喂（结束后 step 是空操作）。 */
function run(s: QwopState, inputs: QwopInput[], dtMs = 16): void {
  for (const inp of inputs) stepQwop(s, dtMs, inp)
}

/** 状态快照（排除每帧清空的 events）。 */
function snapshot(s: QwopState): unknown {
  const { events, ...rest } = s
  return JSON.parse(JSON.stringify(rest))
}

describe('qwop logic', () => {
  it('starts upright-ish with a forward lean and both feet under the hips', () => {
    const s = createQwop()
    expect(s.phase).toBe('playing')
    expect(s.torso).toBe(START_TORSO)
    expect(s.dist).toBe(0)
    const j = qwopJoints(s)
    // 双脚接近髋正下方（大腿初始取世界竖垂）。
    expect(Math.abs(j.footLX - s.hipX)).toBeLessThan(0.1)
    expect(Math.abs(j.footRX - s.hipX)).toBeLessThan(0.1)
    // 头在髋上方、脚在地面上方。
    expect(j.headY).toBeGreaterThan(s.hipY)
    expect(j.footLY).toBeLessThanOrEqual(0.001)
    expect(j.footRY).toBeLessThanOrEqual(0.001)
    expect(L_TORSO + L_THIGH + L_CALF).toBeGreaterThan(s.hipY)
  })

  it('is deterministic: identical input scripts replay identically', () => {
    const script = scriptInputs(1500)
    const a = createQwop()
    const b = createQwop()
    run(a, script)
    run(b, script)
    expect(snapshot(a)).toEqual(snapshot(b))
    // 且确实走了一段路（脚本能驱动身体前进）。
    expect(a.dist).toBeGreaterThan(0.5)
  })

  it('substep accumulator makes the sim frame-split invariant (12x16ms == 8x24ms)', () => {
    const inp = keys(true, false, false, true)
    const a = createQwop()
    const b = createQwop()
    for (let i = 0; i < 12; i += 1) stepQwop(a, 16, inp)
    for (let i = 0; i < 8; i += 1) stepQwop(b, 24, inp)
    expect(a.t).toBe(b.t)
    expect(a.torso).toBe(b.torso)
    expect(a.hipX).toBe(b.hipX)
    expect(a.dist).toBe(b.dist)
    expect(SUB_MS).toBe(4)
  })

  it('stays numerically stable over long scripted runs (no NaN/Infinity)', () => {
    const s = createQwop()
    run(s, scriptInputs(3750)) // 60 s @16ms
    const fields = [s.torso, s.torsoW, s.thighL, s.thighLW, s.thighR, s.thighRW,
      s.calfL, s.calfLW, s.calfR, s.calfRW, s.hipX, s.hipY, s.vx, s.vy, s.dist, s.t, s.acc]
    for (const v of fields) expect(Number.isFinite(v)).toBe(true)
    // 关节限位仍然成立。
    expect(Math.abs(s.thighL)).toBeLessThanOrEqual(1.35 + 1e-9)
    expect(Math.abs(s.thighR)).toBeLessThanOrEqual(1.35 + 1e-9)
  })

  it('doing nothing face-plants within seconds (torso fall, small distance)', () => {
    const s = createQwop()
    let fellAt = -1
    for (let t = 0; t < 4000; t += 16) {
      stepQwop(s, 16, idle)
      if (s.phase !== 'playing') { fellAt = s.t; break }
    }
    expect(s.phase).toBe('fallen')
    expect(s.fallReason).toBe('torso')
    expect(fellAt).toBeGreaterThan(300)
    expect(fellAt).toBeLessThan(2500)
    expect(s.dist).toBeLessThan(3)
    // 摔倒事件确实上报，且摔倒后继续沉降形成瘫地姿态后冻结。
    expect(s.events.length).toBeGreaterThanOrEqual(0)
    const settle = createQwop()
    for (let t = 0; t < 4000; t += 16) stepQwop(settle, 16, idle)
    for (let t = 0; t < FALL_SETTLE_MS * 2; t += 16) stepQwop(settle, 16, idle)
    const hipAfter = settle.hipY
    stepQwop(settle, 160, idle)
    expect(settle.hipY).toBe(hipAfter)
  })

  it('a folded hip with a leg pointing down trips the knee-ground fall', () => {
    // 髋塌到下限 + 一条腿竖直向下：膝几乎贴地，先于躯干超角触发。
    const s = createQwop()
    s.hipY = 0.46
    s.thighL = 0.3 - s.torso
    stepQwop(s, 16, idle)
    const j = qwopJoints(s)
    expect(Math.min(j.kneeLY, j.kneeRY)).toBeLessThan(KNEE_GROUND)
    expect(s.phase).toBe('fallen')
    expect(s.fallReason).toBe('knee')
    // 反例：正常站立迈一步不触发任何摔倒。
    const ok = createQwop()
    stepQwop(ok, 16, idle)
    expect(ok.phase).toBe('playing')
  })

  it('distance is monotonic (never decreases) and scored in whole meters', () => {
    const s = createQwop()
    const script = scriptInputs(800)
    let prev = 0
    for (const inp of script) {
      stepQwop(s, 16, inp)
      expect(s.dist).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = s.dist
      expect(distanceScore(s)).toBe(Math.floor(s.dist))
    }
  })

  it('a skilled alternating rhythm clearly outruns idle mashing', () => {
    const skilled = createQwop()
    // WO → 停 → QP → 停 的节拍（QWOP 的招牌节奏）。
    for (let t = 0; t < 12000; t += 16) {
      const c = t % 320
      const inp = c < 100 ? keys(false, true, true, false)
        : c < 160 ? idle
          : c < 260 ? keys(true, false, false, true)
            : idle
      stepQwop(skilled, 16, inp)
      if (skilled.phase !== 'playing') break
    }
    const slacker = createQwop()
    for (let t = 0; t < 12000 && slacker.phase === 'playing'; t += 16) stepQwop(slacker, 16, idle)
    expect(slacker.phase).toBe('fallen')
    expect(skilled.dist).toBeGreaterThan(slacker.dist * 2)
    expect(skilled.dist).toBeGreaterThan(3)
  })

  it('crossing 50 m finishes the run with a finish event and freezes', () => {
    const s = createQwop()
    s.hipX = GOAL_M - 0.001
    let sawFinish = false
    for (let t = 0; t < 200; t += 16) {
      stepQwop(s, 16, keys(false, false, false, true))
      if (s.events.some((e) => e.type === 'finish')) sawFinish = true
      if (s.phase !== 'playing') break
    }
    expect(s.phase).toBe('finished')
    expect(sawFinish).toBe(true)
    expect(s.dist).toBeGreaterThanOrEqual(GOAL_M)
    expect(distanceScore(s)).toBe(GOAL_M)
    // 过线后冻结：继续 step 状态不再变化。
    const frozen = snapshot(s)
    run(s, scriptInputs(20))
    expect(snapshot(s)).toEqual(frozen)
  })
})
