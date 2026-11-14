/**
 * 传送门逻辑测试：关卡结构、门放置合法性、传送速度映射、瓦片碰撞、
 * 危险 / 过关判定、逐关脚本化通关（含落差弹射与双门接力）与确定性重放。
 */
import { describe, expect, it } from 'vitest'
import {
  LEVELS,
  COLS,
  ROWS,
  createPortalState,
  parseLevel,
  canPlacePortal,
  makePortal,
  placePortal,
  teleportVelocity,
  stepPortal,
  restartLevel,
  portalScore,
  type PortalInput,
  type PortalState,
} from '../src/client/games/portal/logic.ts'

/** 固定 16ms 帧驱动（内部切成 2 个 8ms 子步，确定性）。 */
function drive(state: PortalState, ms: number, input: PortalInput): void {
  for (let t = 0; t < ms; t += 16) stepPortal(state, 16, input)
}

const STILL: PortalInput = { left: false, right: false, jump: false }
const LEFT: PortalInput = { left: true, right: false, jump: false }
const RIGHT: PortalInput = { left: false, right: true, jump: false }

/** 采样整局事件流（drive 过程中逐步收集）。 */
function collect(state: PortalState, ms: number, input: PortalInput): string[] {
  const seen: string[] = []
  for (let t = 0; t < ms; t += 16) {
    stepPortal(state, 16, input)
    for (const e of state.events) seen.push(e.type)
  }
  return seen
}

describe('portal logic', () => {
  it('解析全部 5 关：结构完整、唯一出生点与旗帜', () => {
    expect(LEVELS.length).toBe(5)
    for (const level of LEVELS) {
      const info = parseLevel(level)
      expect(info.tiles.length).toBe(ROWS)
      expect(info.tiles[0]!.length).toBe(COLS)
      expect(level.rows.join('').includes('S')).toBe(true)
      expect(level.rows.join('').includes('F')).toBe(true)
    }
  })

  it('门只能贴竖直墙面：邻空墙合法，地面/悬空/占位非法', () => {
    const info = parseLevel(LEVELS[0]!)
    // 边界墙 col0 的右侧面，邻居 col1 为空 → 合法。
    expect(canPlacePortal(info, 0, 14, 1, null)).toBe(true)
    // 左侧面朝墙外（越界为墙）→ 非法。
    expect(canPlacePortal(info, 0, 14, -1, null)).toBe(false)
    // 地板瓦片（左平台内部）两侧都是墙 → 无竖直空面，非法（不可放地面）。
    expect(canPlacePortal(info, 2, 16, 1, null)).toBe(false)
    expect(canPlacePortal(info, 2, 16, -1, null)).toBe(false)
    // 空瓦片 / 尖刺邻居都不合法。
    expect(canPlacePortal(info, 5, 10, 1, null)).toBe(false)
    expect(canPlacePortal(info, 5, 17, 1, null)).toBe(false)
    // 与另一扇门同一墙面冲突。
    const blue = makePortal(0, 14, 1)
    expect(canPlacePortal(info, 0, 14, 1, blue)).toBe(false)
    expect(canPlacePortal(info, 0, 13, 1, blue)).toBe(true)
  })

  it('传送速度映射：大小守恒，同朝向取反、对朝向不变', () => {
    const same = teleportVelocity(-240, -500, 1, 1)
    expect(same.vx).toBe(240)
    expect(same.vy).toBe(500)
    const oppo = teleportVelocity(-240, -500, 1, -1)
    expect(oppo.vx).toBe(-240)
    expect(oppo.vy).toBe(-500)
    for (const [vx, vy] of [[-240, 720], [240, -640], [0, 900]] as const) {
      for (const [da, db] of [[1, 1], [1, -1], [-1, -1]] as const) {
        const out = teleportVelocity(vx, vy, da, db)
        expect(Math.hypot(out.vx, out.vy)).toBeCloseTo(Math.hypot(vx, vy))
      }
    }
  })

  it('瓦片碰撞与危险：撞墙停、落地稳、尖刺致死重开', () => {
    const state = createPortalState(7, 0)
    // 向左走 1s：贴上 col0 边界墙停下（x 卡在墙外半宽处），速度清零。
    drive(state, 1000, LEFT)
    expect(state.x).toBeCloseTo(32 + 11 + 0.01, 1)
    expect(state.vx).toBe(0)
    // 从空中垂直落下：落到左平台顶（row15 顶面 y=480）站稳。
    const drop = createPortalState(7, 0)
    drop.y = 200
    drop.vy = 0
    drive(drop, 2000, STILL)
    expect(drop.grounded).toBe(true)
    expect(drop.y + 13).toBeLessThanOrEqual(480 + 0.02)
    expect(drop.vy).toBe(0)
    // 高速下砸（> 1 帧 / 子步位移）也不穿透 32px 地板。
    const slam = createPortalState(7, 0)
    slam.y = 150
    slam.vy = 950
    drive(slam, 2000, STILL)
    expect(slam.grounded).toBe(true)
    // 向右跑过平台边缘坠入尖刺坑：本关重来，死亡计数由重开累计。
    const seen = collect(state, 3000, RIGHT)
    expect(state.phase).toBe('dead')
    expect(seen.some(type => type === 'die')).toBe(true)
    expect(state.deaths).toBe(0)
    restartLevel(state, true)
    expect(state.phase).toBe('playing')
    expect(state.deaths).toBe(1)
    // 手动 R 重开不额外计死。
    restartLevel(state, false)
    expect(state.deaths).toBe(1)
  })

  it('第 1 关（初见门径）：蓝橙门对穿到达旗帜', () => {
    const state = createPortalState(1, 0)
    expect(placePortal(state, 0, 14, 1, 'blue')).toBe(true)
    expect(placePortal(state, 11, 14, 1, 'orange')).toBe(true)
    const seen = collect(state, 300, LEFT)
    expect(seen.includes('warp')).toBe(true)
    // 传送后落在右侧平台，速度大小守恒（入门 |240| 出门 |240|）。
    expect(state.x).toBeGreaterThan(384)
    collect(state, 2000, RIGHT)
    expect(state.phase).toBe('won')
    expect(portalScore(state)).toBe(1)
  })

  it('第 2 关（深渊弹射）：落差加速弹射上垒', () => {
    const state = createPortalState(2, 1)
    expect(placePortal(state, 20, 6, -1, 'blue')).toBe(true)
    expect(placePortal(state, 20, 12, -1, 'orange')).toBe(true)
    // 向右跑离高台，贴墙坠入蓝门（同朝向橙门把下落翻成上升弹射）。
    collect(state, 700, RIGHT)
    expect(state.phase).toBe('playing')
    // 出门后向上飞（vy < 0），越过激光坑落到旗台。
    expect(state.vy).toBeLessThan(0)
    collect(state, 2500, LEFT)
    expect(state.phase).toBe('won')
  })

  it('第 3/4 关（接力双渡 / 激光峡谷）均可解', () => {
    // 第 3 关：两段接力——先左门对穿中台，再重摆双门穿到旗前。
    const s3 = createPortalState(3, 2)
    expect(placePortal(s3, 0, 14, 1, 'blue')).toBe(true)
    expect(placePortal(s3, 11, 14, 1, 'orange')).toBe(true)
    collect(s3, 400, LEFT)
    expect(s3.x).toBeGreaterThan(384)
    collect(s3, 400, STILL)
    expect(s3.phase).toBe('playing')
    // 换门：橙门先挪走，蓝门放到中柱右侧面（原橙门位）。
    expect(placePortal(s3, 17, 14, 1, 'orange')).toBe(true)
    expect(placePortal(s3, 11, 14, 1, 'blue')).toBe(true)
    collect(s3, 600, LEFT)
    expect(s3.phase).toBe('won')
    // 第 4 关：左跑坠入蓝门，弹射飞越激光谷落旗台。
    const s4 = createPortalState(4, 3)
    expect(placePortal(s4, 0, 6, 1, 'blue')).toBe(true)
    expect(placePortal(s4, 0, 12, 1, 'orange')).toBe(true)
    collect(s4, 700, LEFT)
    expect(s4.vy).toBeLessThan(0)
    collect(s4, 2500, RIGHT)
    expect(s4.phase).toBe('won')
  })

  it('第 5 关（终局双段）：接力 + 弹射上旗', () => {
    const state = createPortalState(5, 4)
    expect(placePortal(state, 0, 14, 1, 'blue')).toBe(true)
    expect(placePortal(state, 11, 14, 1, 'orange')).toBe(true)
    collect(state, 400, LEFT)
    collect(state, 400, STILL)
    expect(state.phase).toBe('playing')
    // 第二段：蓝/橙门都贴右侧高塔左壁，跑下中台坠入蓝门弹上旗台。
    expect(placePortal(state, 18, 8, -1, 'orange')).toBe(true)
    expect(placePortal(state, 18, 18, -1, 'blue')).toBe(true)
    collect(state, 800, RIGHT)
    collect(state, 2200, LEFT)
    expect(state.phase).toBe('won')
    expect(portalScore(state)).toBe(5)
  })

  it('确定性重放：同种子同输入序列结果逐位一致', () => {
    const run = (): string => {
      const s = createPortalState(9, 1)
      placePortal(s, 20, 6, -1, 'blue')
      placePortal(s, 20, 12, -1, 'orange')
      drive(s, 700, RIGHT)
      drive(s, 2500, LEFT)
      return JSON.stringify([s.x, s.y, s.vx, s.vy, s.t, s.phase, s.trail.length, s.trail[0], s.trail[3]])
    }
    expect(run()).toBe(run())
  })
})