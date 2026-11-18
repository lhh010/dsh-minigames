import { describe, expect, it } from 'vitest'
import {
  LEVELS, SPEED, FIRST_DEPART_MS, DEPART_GAP_MS, REDEPART_MS, MAX_MISTAKES, CRASH_EPS,
  createConductor, createLevelState, stepConductor, toggleSwitch, switchHitTest,
  startNextLevel, autoDispatch, hasSolvableDispatch, trainXY, TRUNK_ROW, END_COL,
  type ConductorState,
} from '../src/client/games/conductor/logic.ts'

/** 以固定步长推进 ms 毫秒；每步先调 hook（默认做自动调度）。 */
function drive(s: ConductorState, ms: number, dtMs = 50, hook?: (st: ConductorState) => void): void {
  const hookFn = hook ?? ((st: ConductorState) => autoDispatch(st))
  for (let t = 0; t < ms && s.status === 'playing'; t += dtMs) {
    hookFn(s)
    stepConductor(s, dtMs)
  }
}

/** 某列车的事件收集。 */
function eventsOf(s: ConductorState, type: string): number {
  return s.events.filter((e) => e.type === type).length
}

/** 结构投影：去掉函数字段后的可序列化盘面。 */
function snapshot(s: ConductorState): string {
  return JSON.stringify({
    nodes: s.nodes.map((n) => [n.x, n.y, n.kind, n.col, n.row, n.color, n.out]),
    edges: s.edges.map((e) => [e.from, e.to, e.len, e.trunk]),
    switches: s.switches,
    trains: s.trains.map((t) => [t.color, t.departAt]),
    timeLimit: s.timeLimit,
  })
}

describe('conductor logic', () => {
  it('builds the five seeded boards: trunk, junctions, disjoint branches, color coverage', () => {
    for (let level = 1; level <= LEVELS.length; level += 1) {
      const s = createLevelState(42, level, 3)
      const cfg = LEVELS[level - 1]!
      expect(s.status).toBe('playing')
      expect(s.junctionIds).toHaveLength(cfg.junctions)
      expect(s.trains).toHaveLength(cfg.trains)
      // 站台数 = 岔道数 + 1（含尽头 E），颜色互不相同。
      const stations = s.nodes.filter((n) => n.kind === 'station')
      expect(stations).toHaveLength(cfg.junctions + 1)
      expect(new Set(stations.map((n) => n.color)).size).toBe(stations.length)
      // 列车颜色无放回取自站台颜色且互不相同——独占目标保证存在。
      const stationColors = new Set(stations.map((n) => n.color))
      for (const tr of s.trains) expect(stationColors.has(tr.color)).toBe(true)
      expect(new Set(s.trains.map((t) => t.color)).size).toBe(s.trains.length)
      // 道岔：恰好两条出边，A=主干直行、B=岔道。
      for (const jid of s.junctionIds) {
        const j = s.nodes[jid]!
        expect(j.out).toHaveLength(2)
        const a = s.edges[j.out[0]!]!
        expect(a.trunk).toBe(true)
        expect(s.nodes[a.to]!.col).toBe(j.col + 1)
        const b = s.edges[j.out[1]!]!
        expect(b.trunk).toBe(false)
        expect(s.switches[jid]).toBeGreaterThanOrEqual(0)
        expect(s.switches[jid]).toBeLessThanOrEqual(1)
      }
      // 全图从车库可达（沿出边 BFS）。
      const seen = new Set<number>([s.sourceId])
      const queue = [s.sourceId]
      while (queue.length > 0) {
        const n = s.nodes[queue.shift()!]!
        for (const eid of n.out) {
          const to = s.edges[eid]!.to
          if (!seen.has(to)) { seen.add(to); queue.push(to) }
        }
      }
      expect(seen.size).toBe(s.nodes.length)
      // 岔道折点与岔道站台入度恰为 1（岔道彼此不相交）。
      const indeg = new Map<number, number>()
      for (const e of s.edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
      for (const n of s.nodes) {
        if (n.kind === 'bend' || (n.kind === 'station' && n.row !== TRUNK_ROW)) {
          expect(indeg.get(n.id)).toBe(1)
        }
      }
      // 发车时刻表与时限为正。
      s.trains.forEach((tr, i) => expect(tr.departAt).toBe(FIRST_DEPART_MS + i * DEPART_GAP_MS))
      expect(s.timeLimit).toBeGreaterThan(0)
    }
  })

  it('is deterministic per (seed, run) and varies across seeds', () => {
    const a = createLevelState(7, 1, 2)
    const b = createLevelState(7, 1, 2)
    expect(snapshot(a)).toBe(snapshot(b))
    const others = [1, 2, 3, 4, 5, 6].map((sd) => snapshot(createLevelState(sd, 1, 2)))
    expect(new Set(others).size).toBe(others.length)
    expect(others).not.toContain(snapshot(a))
  })

  it('runs trains at constant speed on the departure schedule', () => {
    const s = createLevelState(5, 1, 1)
    const t0 = s.trains[0]!
    // 发车前等待。
    drive(s, FIRST_DEPART_MS - 60, 50, () => {})
    expect(t0.state).toBe('waiting')
    // 发车后恒速推进：帧位移 = SPEED × dt。
    stepConductor(s, 100)
    expect(t0.state).toBe('running')
    expect(eventsOf(s, 'depart')).toBe(1)
    let prev = trainXY(s, t0).x
    for (let i = 0; i < 6; i += 1) {
      stepConductor(s, 100)
      const now = trainXY(s, t0)
      expect(now.x - prev).toBeCloseTo(SPEED * 0.1 * Math.cos(now.angle), 5)
      prev = now.x
    }
    // 未到发车间隔的第二列车仍在等待。
    expect(s.trains[1]!.state).toBe('waiting')
    expect(s.trains[1]!.departAt).toBe(FIRST_DEPART_MS + DEPART_GAP_MS)
  })

  it('routes by switch state: all-A reaches the end, B diverts into the branch', () => {
    // 全 A：首班车一路直行到主干尽头站台 E（推进到它结算为止）。
    const sa = createLevelState(9, 1, 1)
    const j0 = sa.junctionIds[0]!
    for (const jid of sa.junctionIds) sa.switches[jid] = 0
    let resolved = false
    for (let g = 0; g < 2000 && sa.status === 'playing' && !resolved; g += 1) {
      stepConductor(sa, 50)
      resolved = sa.events.some((e) => (e.type === 'dock' || e.type === 'wrong') && e.train === 0)
    }
    expect(resolved).toBe(true)
    const e = sa.nodes.find((n) => n.kind === 'station' && n.row === TRUNK_ROW)!
    const t0a = sa.trains[0]!
    if (t0a.color === e.color) {
      expect(t0a.state).toBe('docked')
      expect(t0a.station).toBe(e.id)
      expect(sa.score).toBe(100)
    } else {
      expect(t0a.state === 'waiting' || t0a.state === 'running').toBe(true)
      expect(sa.mistakes).toBeGreaterThanOrEqual(1)
      expect(t0a.departAt).toBeGreaterThan(sa.t)
      expect(t0a.departAt).toBeLessThanOrEqual(sa.t + REDEPART_MS)
    }
    // 首道岔 B：首班车进第一条岔道（站台列号 = 道岔列号 + 2）。
    const sb = createLevelState(9, 1, 1)
    for (const jid of sb.junctionIds) sb.switches[jid] = 0
    sb.switches[j0] = 1
    let resolvedB = false
    for (let g = 0; g < 2000 && sb.status === 'playing' && !resolvedB; g += 1) {
      stepConductor(sb, 50)
      resolvedB = sb.events.some((e) => (e.type === 'dock' || e.type === 'wrong') && e.train === 0)
    }
    expect(resolvedB).toBe(true)
    const branch = sb.nodes.find((n) => n.kind === 'station' && n.col === sb.nodes[j0]!.col + 2)!
    const t0b = sb.trains[0]!
    if (t0b.color === branch.color) {
      expect(t0b.state).toBe('docked')
      expect(t0b.station).toBe(branch.id)
    } else {
      expect(t0b.state).toBe('waiting')
      expect(sb.mistakes).toBeGreaterThanOrEqual(1)
    }
  })

  it('toggles and hit-tests switches; rejects non-junction and finished states', () => {
    const s = createLevelState(11, 2, 1)
    const jid = s.junctionIds[1]!
    const before = s.switches[jid]!
    expect(toggleSwitch(s, jid)).toBe(true)
    expect(s.switches[jid]).toBe(1 - before)
    expect(eventsOf(s, 'switch')).toBe(1)
    // 命中测试：道岔圆心命中，远处不命中。
    const j = s.nodes[jid]!
    expect(switchHitTest(s, j.x + 5, j.y - 5)).toBe(jid)
    expect(switchHitTest(s, j.x + 200, j.y + 90)).toBe(-1)
    // 非道岔节点与越界 id 拒绝。
    expect(toggleSwitch(s, s.sourceId)).toBe(false)
    expect(toggleSwitch(s, -1)).toBe(false)
    // 终局后不可再扳。
    s.status = 'lost'
    expect(toggleSwitch(s, jid)).toBe(false)
  })

  it('docks correctly and scores under auto dispatch', () => {
    const s = createConductor(3, 1)
    expect(hasSolvableDispatch(s)).toBe(true)
    drive(s, 40000)
    const docked = s.trains.filter((tr) => tr.state === 'docked')
    expect(docked.length).toBeGreaterThanOrEqual(1)
    // 全部正确停靠 → 过关：2 列 × 100 + 过关奖励 200。
    expect(s.status).toBe('cleared')
    expect(s.mistakes).toBe(0)
    expect(s.score).toBe(2 * 100 + (150 + 50 * 1))
    expect(s.events.some((e) => e.type === 'clear')).toBe(true)
  })

  it('counts wrong-color arrivals as mistakes and re-dispatches the train', () => {
    // 找一个首班车与尽头站台 E 不同色的 seed，全 A 直行必错色。
    let seed = 1
    let s = createLevelState(seed, 1, 1)
    const endColor = (): number => s.nodes.find((n) => n.kind === 'station' && n.row === TRUNK_ROW)!.color
    while (s.trains[0]!.color === endColor()) {
      seed += 1
      s = createLevelState(seed, 1, 1)
    }
    const t0 = s.trains[0]!
    drive(s, 30000, 50, (st) => {
      for (const jid of st.junctionIds) st.switches[jid] = 0
      // 放宽时限以观察重发。
      st.timeLimit = 10_000_000
    })
    expect(s.mistakes).toBeGreaterThanOrEqual(1)
    expect(t0.state === 'waiting' || t0.state === 'running').toBe(true)
    // 手工置满失误再错一次 → 失败。
    s.mistakes = MAX_MISTAKES - 1
    s.status = 'playing'
    drive(s, 30000, 50, (st) => {
      for (const jid of st.junctionIds) st.switches[jid] = 0
      st.timeLimit = 10_000_000
    })
    expect(s.status).toBe('lost')
    expect(s.lostReason).toBe('mistakes')
  })

  it('crashes when two trains share a track too closely or meet at one station', () => {
    // 同轨道追近：手工构造两车同边、间距小于阈值。
    const s = createLevelState(4, 1, 1)
    const firstEdge = s.nodes[s.sourceId]!.out[0]!
    for (const tr of s.trains) {
      tr.state = 'running'
      tr.edge = firstEdge
      tr.departAt = 0
    }
    s.trains[0]!.pos = 0
    s.trains[1]!.pos = CRASH_EPS - 4
    stepConductor(s, 50)
    expect(s.status).toBe('lost')
    expect(s.lostReason).toBe('crash')
    expect(s.events.some((e) => e.type === 'crash')).toBe(true)
    // 同站相撞：把两列车都引向首列车同色站台。
    const s2 = createLevelState(6, 1, 1)
    const target = s2.nodes.find((n) => n.kind === 'station' && n.color === s2.trains[0]!.color)!
    const targetCol = target.row === TRUNK_ROW ? END_COL : target.col - 2
    drive(s2, 120000, 50, (st) => {
      for (const jid of st.junctionIds) st.switches[jid] = st.nodes[jid]!.col === targetCol ? 1 : 0
      st.timeLimit = 10_000_000
    })
    expect(s2.status).toBe('lost')
    expect(s2.lostReason).toBe('crash')
  })

  it('fails on timeout', () => {
    const s = createLevelState(8, 1, 1)
    // 全 A 直行放任不管：到时限即失败（若提前撞车 / 失误满也视为失败路径）。
    drive(s, s.timeLimit + 1000, 50, (st) => {
      for (const jid of st.junctionIds) st.switches[jid] = 0
    })
    expect(s.status).toBe('lost')
  })

  it('clears all five levels via auto dispatch and wins without any mistake', () => {
    const s = createConductor(13, 1)
    let wrong = 0
    let crashes = 0
    let steps = 0
    while (s.status !== 'won' && steps < 60000) {
      steps += 1
      autoDispatch(s)
      stepConductor(s, 50)
      wrong += eventsOf(s, 'wrong')
      crashes += eventsOf(s, 'crash')
      if (s.status === 'cleared') startNextLevel(s)
    }
    expect(s.status).toBe('won')
    expect(s.level).toBe(LEVELS.length)
    expect(wrong).toBe(0)
    expect(crashes).toBe(0)
    expect(s.score).toBeGreaterThan(0)
  })

  it('guarantees a solvable dispatch for every sampled seed and level', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      for (let level = 1; level <= LEVELS.length; level += 1) {
        const s = createLevelState(seed, level, 1)
        expect(hasSolvableDispatch(s)).toBe(true)
      }
    }
    // 已拐进不同色岔道 → 该车再也到不了同色站台，局面不可解。
    const s = createLevelState(2, 1, 1)
    const branchStationOf = (id: number) => {
      const b = s.edges[s.nodes[id]!.out[1]!]!
      const bend = s.nodes[b.to]!
      return s.nodes[s.edges[bend.out[0]!]!.to]!
    }
    const t = s.trains[0]!
    const jid = s.junctionIds.find((id) => branchStationOf(id).color !== t.color)!
    t.state = 'running'
    t.edge = s.nodes[jid]!.out[1]!
    t.pos = 1
    expect(hasSolvableDispatch(s)).toBe(false)
  })

  it('replays identically: same seed, run, and step script give the same trajectory', () => {
    const run1 = createConductor(21, 4)
    const run2 = createConductor(21, 4)
    const script = [50, 50, 120, 200, 50, 90, 150, 50, 50, 130, 50, 200]
    for (const dt of script) {
      autoDispatch(run1)
      stepConductor(run1, dt)
      autoDispatch(run2)
      stepConductor(run2, dt)
    }
    const proj = (s: ConductorState): string => JSON.stringify({
      t: s.t, score: s.score, mistakes: s.mistakes, status: s.status,
      switches: s.switches,
      trains: s.trains.map((tr) => [tr.state, tr.edge, tr.pos, tr.station]),
    })
    expect(proj(run1)).toBe(proj(run2))
    expect(run1.trains.some((tr) => tr.pos > 0)).toBe(true)
  })
})
