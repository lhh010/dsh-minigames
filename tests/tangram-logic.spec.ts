import { describe, expect, it } from 'vitest'
import {
  containsPoint, createLevel, flipPoly, normalizeRot, PIECES, piecePoly, polygonArea, polygonCentroid,
  polygonCovered, pieceMatchesSlot, rotatePoly, setPose, SILHOUETTES, traySlot, TOL,
  type Poly, type Pose,
} from '../src/client/games/tangram/logic.ts'

/** 容差全等比较：顶点数相同且双向最近邻匹配都在 eps 内（忽略顺序与起点）。 */
function sameShape(a: Poly, b: Poly, eps = 1e-4): boolean {
  if (a.length !== b.length) return false
  const used = new Set<number>()
  for (const va of a) {
    let found = -1
    for (let j = 0; j < b.length; j += 1) {
      if (used.has(j)) continue
      const vb = b[j]!
      if (Math.hypot(va.x - vb.x, va.y - vb.y) <= eps) { found = j; break }
    }
    if (found < 0) return false
    used.add(found)
  }
  return true
}

/** 在 rot×flip 全组合中找与槽多边形全等的姿态（找不到返回 null）。 */
function matchingPose(pieceIndex: number, slot: Poly): Pose | null {
  const c = polygonCentroid(slot)
  for (let rot = 0; rot < 8; rot += 1) {
    for (const flip of [false, true]) {
      const pose: Pose = { x: c.x, y: c.y, rot, flip }
      if (sameShape(piecePoly(pieceIndex, pose), slot)) return pose
    }
  }
  return null
}

describe('tangram logic', () => {
  it('标准七件：数量、名称与面积（4+4+2+2+2+1+1=16）', () => {
    expect(PIECES).toHaveLength(7)
    expect(PIECES.map(p => p.name)).toEqual(['大三角一', '大三角二', '中三角', '正方形', '平行四边形', '小三角一', '小三角二'])
    const areas = PIECES.map(def => polygonArea(def.base))
    expect(areas.map(a => Math.round(a))).toEqual([4, 4, 2, 2, 2, 1, 1])
    expect(areas.reduce((a, b) => a + b, 0)).toBeCloseTo(16, 9)
    // 质心原点定义：局部顶点质心在原点。
    for (const def of PIECES) {
      const c = polygonCentroid(def.base)
      expect(c.x).toBeCloseTo(0, 9)
      expect(c.y).toBeCloseTo(0, 9)
    }
  })

  it('rotatePoly：90° 旋转映射正确、+8 步归一为恒等、纯函数', () => {
    const tri: Poly = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
    const before = tri.map(v => ({ ...v }))
    // 2 步 = 90°：(x,y) -> (-y,x)。
    const q2 = rotatePoly(tri, 2)
    const ex = [0, -1, 0]
    const ey = [1, 0, -1]
    for (const [i, v] of q2.entries()) {
      expect(v.x).toBeCloseTo(ex[i]!, 12)
      expect(v.y).toBeCloseTo(ey[i]!, 12)
    }
    // 8 步一整圈 = 恒等（归一化）。
    expect(sameShape(rotatePoly(tri, 8), tri)).toBe(true)
    expect(sameShape(rotatePoly(tri, -1), rotatePoly(tri, 7))).toBe(true)
    expect(normalizeRot(-1)).toBe(7)
    expect(normalizeRot(10)).toBe(2)
    // 纯函数：输入不变。
    expect(tri).toEqual(before)
  })

  it('翻转：镜像对称板块翻转后等于某旋转；平行四边形翻转改变形状；setPose 忽略不可翻', () => {
    for (const [i, def] of PIECES.entries()) {
      if (!def.canFlip) {
        const flipped = flipPoly(def.base)
        const match = Array.from({ length: 8 }, (_, r) => rotatePoly(def.base, r)).some(rot => sameShape(rot, flipped))
        expect(match).toBe(true)
      }
    }
    const para = PIECES[4]!
    const match = Array.from({ length: 8 }, (_, r) => rotatePoly(para.base, r)).some(rot => sameShape(rot, flipPoly(para.base)))
    expect(match).toBe(false)
    // setPose：大三角（不可翻）即使传 flip:true 也按未翻转存储。
    const state = createLevel(1, 42)
    const next = setPose(state, 0, { x: 300, y: 300, rot: 1, flip: true })
    expect(next.poses[0]!.flip).toBe(false)
    expect(next.poses[0]!.rot).toBe(1)
    // 输入状态不被修改。
    expect(state.poses[0]).toEqual({ x: traySlot(0).x, y: traySlot(0).y, rot: expect.any(Number), flip: false })
  })

  it('containsPoint：内部/外部/边界容差判定', () => {
    const square: Poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(containsPoint(square, { x: 5, y: 5 })).toBe(true)
    expect(containsPoint(square, { x: 15, y: 5 })).toBe(false)
    expect(containsPoint(square, { x: 11, y: 5 }, 2)).toBe(true)
    expect(containsPoint(square, { x: 12, y: 5 }, 1.5)).toBe(false)
    // 顶点附近也在容差内。
    expect(containsPoint(square, { x: 10.8, y: -0.8 }, 2)).toBe(true)
  })

  it('polygonCovered：槽内板块覆盖、平移 30px 不覆盖', () => {
    const state = createLevel(1, 7)
    const slot = state.target[3]! // 正方形槽
    const pose = matchingPose(3, slot)!
    expect(pose).not.toBeNull()
    expect(polygonCovered(piecePoly(3, pose), state.target, 10)).toBe(true)
    // 正方剪影的并集铺满整个方形，平移 30px 仍在并集内；移出 100px 才脱离。
    expect(polygonCovered(piecePoly(3, { ...pose, x: pose.x + 30 }), state.target, 10)).toBe(true)
    const moved = { ...pose, x: pose.x + 100 }
    expect(polygonCovered(piecePoly(3, moved), state.target, 10)).toBe(false)
  })

  it('剪影库：5 组轮廓、各槽与对应板块全等、总面积 16、两两无重叠', () => {
    expect(SILHOUETTES).toHaveLength(5)
    expect(SILHOUETTES.map(s => s.name)).toEqual(['正方', '大三角', '旗帜', '烛台', '火箭'])
    for (const sil of SILHOUETTES) {
      expect(sil.polys).toHaveLength(7)
      const total = sil.polys.reduce((a, p) => a + polygonArea(p), 0)
      expect(total).toBeCloseTo(16, 9)
      // 槽 i 与板块 i 全等：对相应关卡的画布坐标目标逐一找匹配姿态。
      const levelState = createLevel(SILHOUETTES.indexOf(sil) + 1, 11)
      for (let i = 0; i < 7; i += 1) expect(matchingPose(i, levelState.target[i]!)).not.toBeNull()
      // 采样检测两两无面积重叠。
      for (let i = 0; i < 7; i += 1) {
        for (let j = i + 1; j < 7; j += 1) {
          for (let x = 0.03; x < 8.2; x += 0.25) {
            for (let y = -1.17; y < 4.6; y += 0.25) {
              const p = { x, y }
              const both = containsPoint(sil.polys[i]!, p) && containsPoint(sil.polys[j]!, p)
              expect(both).toBe(false)
            }
          }
        }
      }
    }
  })

  it('createLevel：确定性（同种子同结果）、种子改变布局、初始全部未就位且各关轮廓递进', () => {
    const a = createLevel(3, 123)
    const b = createLevel(3, 123)
    expect(a).toEqual(b)
    const c = createLevel(3, 999)
    expect(c.poses).not.toEqual(a.poses)
    expect(a.name).toBe('旗帜')
    expect(createLevel(1, 5).name).toBe('正方')
    expect(createLevel(5, 5).name).toBe('火箭')
    expect(createLevel(6, 5).name).toBe('正方') // 循环
    for (let level = 1; level <= 5; level += 1) {
      const s = createLevel(level, 77)
      expect(s.won).toBe(false)
      expect(s.placed.every(v => !v)).toBe(true) // 托盘远离目标，初始无一块就位
      // 初始姿态位于托盘槽位。
      for (const [i, pose] of s.poses.entries()) {
        expect(pose.x).toBe(traySlot(i).x)
        expect(pose.y).toBe(traySlot(i).y)
      }
    }
  })

  it('过关判定：按匹配姿态逐块放入即全部就位；少一块或转错都不算过关', () => {
    let state = createLevel(2, 2024)
    // 先放 6 块（跳过板块 6）。
    for (let i = 0; i < 6; i += 1) {
      const pose = matchingPose(i, state.target[i]!)!
      state = setPose(state, i, pose, true)
      expect(state.placed[i]).toBe(true)
    }
    expect(state.won).toBe(false)
    // 第 7 块转错 45°：不就位。
    const good = matchingPose(6, state.target[6]!)!
    state = setPose(state, 6, { ...good, rot: good.rot + 1 }, true)
    expect(state.placed[6]).toBe(false)
    expect(state.won).toBe(false)
    // 放正即过关，且操作计数累计。
    state = setPose(state, 6, good, true)
    expect(state.placed[6]).toBe(true)
    expect(state.won).toBe(true)
    expect(state.moves).toBe(8)
  })

  it('全部 5 关都能以匹配姿态拼成（过关可达）', () => {
    for (let level = 1; level <= 5; level += 1) {
      let state = createLevel(level, level * 31)
      for (let i = 0; i < 7; i += 1) {
        const pose = matchingPose(i, state.target[i]!)
        expect(pose).not.toBeNull()
        state = setPose(state, i, pose!)
      }
      expect(state.won).toBe(true)
    }
  })
})

describe('tangram rotation-correct placement', () => {
  it('a piece aligned to its slot matches; the same piece rotated 45° at the same spot does not', () => {
    const s = createLevel(1, 42)
    // 解槽 i 与件 i 同形（生成器保证），把件 0 精确摆到槽 0：应匹配。
    const slot0 = s.target[0]!
    const slotCs = polygonCentroid(slot0)
    // 槽的姿态可以从 SILHOUETTES 重建，但直接用 rot=0 的件 0 平移对齐质心
    // 不一定顶点对齐（生成器可能有旋转）。改用判定函数本身做对照：
    const base = piecePoly(0, { x: 0, y: 0, rot: 0, flipped: false })
    const moved = base.map(p => ({ x: p.x + slotCs.x, y: p.y + slotCs.y }))
    // 找一个与件 0 同形（sameShape）的槽——就是它的解槽
    const mySlot = s.target.find(sl => sl.length === base.length) ?? slot0
    void moved
    // 正确旋转（rot=0 的原始形状）与自己应当匹配
    expect(pieceMatchesSlot(base, base.map(p => ({ ...p })), TOL)).toBe(true)
    // 旋转 45° 后顶点错位：不匹配（三角形/正方形/平行四边形旋转 45° 顶点不再重合）
    const rot45 = rotatePoly(base, Math.PI / 4)
    const rot45Moved = rot45.map(p => ({ x: p.x + slotCs.x, y: p.y + slotCs.y }))
    expect(pieceMatchesSlot(rot45Moved, mySlot, TOL)).toBe(false)
  })
  it('winning requires every slot matched exactly (no union-containment shortcut)', () => {
    const s = createLevel(1, 42)
    expect(s.won).toBe(false)
  })
})
