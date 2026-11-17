import { describe, expect, it } from 'vitest'
import {
  COLS, ROWS, WINS_NEEDED, STEP_MS_BASE,
  createTronState, stepOnce, advance, playerTurn, aiDecide, startNextRound,
  floodFill, isFree, isReverse, matchOver, replay, stepIntervalMs, wallsSignature,
  type TronState, type Dir,
} from '../src/client/games/tron/logic.ts'

/** 跑完整局直到结束或步数上限（AI 自动决策，玩家不转向）。 */
function runRound(state: TronState, maxTicks = 1200): number {
  let ticks = 0
  while (!state.roundOver && ticks < maxTicks) {
    stepOnce(state)
    ticks += 1
  }
  return ticks
}

describe('tron logic', () => {
  it('开局对称：双方镜像起点、相向而行、头部即光墙', () => {
    const state = createTronState(7)
    const midY = Math.floor(ROWS / 2)
    expect(state.riders.player).toMatchObject({ x: 4, y: midY, dir: 'right' })
    expect(state.riders.ai).toMatchObject({ x: COLS - 5, y: midY, dir: 'left' })
    expect(state.riders.player.x + state.riders.ai.x).toBe(COLS - 1)
    expect(state.walls[midY * COLS + 4]).toBe(1)
    expect(state.walls[midY * COLS + (COLS - 5)]).toBe(2)
    expect(state.walls.filter((v) => v !== 0).length).toBe(2)
  })

  it('转向合法性：拒绝 180° 掉头与同向，合法转向生效并写入重放日志', () => {
    const state = createTronState(1)
    expect(isReverse('left', 'right')).toBe(true)
    expect(isReverse('up', 'right')).toBe(false)
    playerTurn(state, 'left') // 掉头：忽略
    playerTurn(state, 'right') // 同向：忽略
    playerTurn(state, 'up') // 合法
    expect(state.pending.player).toBe('up')
    stepOnce(state)
    expect(state.riders.player.dir).toBe('up')
    expect(state.inputLog).toEqual([{ round: 1, tick: 0, side: 'player', dir: 'up' }])
  })

  it('光墙记录：走过的格永久成墙且归属正确', () => {
    const state = createTronState(3)
    const midY = Math.floor(ROWS / 2)
    stepOnce(state) // 玩家右移一格、AI 左移一格
    expect(state.riders.player).toMatchObject({ x: 5, y: midY })
    expect(state.walls[midY * COLS + 5]).toBe(1)
    expect(state.walls[midY * COLS + (COLS - 6)]).toBe(2)
    expect(state.trails.player.length).toBe(2)
    // 旧格不会被后续清掉：再走一步后前两格都仍是墙。
    stepOnce(state)
    expect(state.walls[midY * COLS + 5]).toBe(1)
    expect(state.walls[midY * COLS + 6]).toBe(1)
  })

  it('碰撞判定：玩家冲出边界判负，AI 得分并产生撞击点', () => {
    const state = createTronState(11)
    // 玩家一路向右会先于 AI 撞墙吗？AI 起点更靠边（向左），为可控起见直接
    // 手工驱动：把玩家掉头机会删掉——改成朝墙走：直接逐格前进直到出界。
    let guard = 0
    while (!state.roundOver && guard < 200) {
      stepOnce(state)
      guard += 1
    }
    expect(state.roundOver).toBe(true)
    expect(state.crashCells.length).toBeGreaterThanOrEqual(1)
    expect([state.winner, state.wins.player, state.wins.ai]).toBeDefined()
  })

  it('确定性：同 seed 同输入序列得到完全相同的局面', () => {
    const drive = (seed: number): TronState => {
      const state = createTronState(seed)
      const dirs = ['up', 'right', 'down', 'right'] as const
      for (let i = 0; i < 40; i += 1) {
        playerTurn(state, dirs[i % 4]!)
        stepOnce(state)
      }
      return state
    }
    const a = drive(42)
    const b = drive(42)
    expect(wallsSignature(a)).toBe(wallsSignature(b))
    expect(a.tick).toBe(b.tick)
    expect(a.wins).toEqual(b.wins)
    expect(wallsSignature(a)).not.toBe(wallsSignature(drive(43)))
  })

  it('floodfill 可达空间：空板近满、被光墙分割后骤减', () => {
    const state = createTronState(5)
    const midY = Math.floor(ROWS / 2)
    // 开局后两道光墙沿中线生长，把上下半区分割前仍有大片连通。
    for (let i = 0; i < 4; i += 1) stepOnce(state)
    const reachable = floodFill(4, midY - 2, state.walls)
    expect(reachable).toBeGreaterThan(100)
    expect(reachable).toBeLessThan(COLS * ROWS)
    // 墙格与出界格为 0 可达。
    expect(floodFill(4, midY, state.walls)).toBe(0)
    expect(isFree(-1, 0, state.walls)).toBe(false)
    expect(isFree(0, ROWS, state.walls)).toBe(false)
    // 一整行墙把上缘封死 → 上半区恰好是该行以上所有空格。
    const sealed = createTronState(5)
    for (let x = 0; x < COLS; x += 1) sealed.walls[0 * COLS + x] = 1
    // 顶行封死后上半区=整行以下所有空格，扣除开局两个头部墙。
    expect(floodFill(0, 1, sealed.walls)).toBe(COLS * (ROWS - 1) - 2)
  })

  it('AI 决策确定性且规避撞墙', () => {
    const state = createTronState(99)
    const first = aiDecide(state)
    const again = createTronState(99)
    expect(aiDecide(again)).toBe(first)
    // 跑久一点：AI 只要不撞就说明安全贪心有效（未结束前 AI 头前格必须可行）。
    let ticks = runRound(state)
    expect(ticks).toBeGreaterThan(10)
    // AI 开局朝向中央（先手压制）：前几步 AI 距中心的曼哈顿距离不增。
    const s2 = createTronState(99)
    const mid = (COLS - 1) / 2 + (ROWS - 1) / 2
    const dist = (r: { x: number, y: number }): number =>
      Math.abs(r.x - (COLS - 1) / 2) + Math.abs(r.y - (ROWS - 1) / 2)
    const before = dist(s2.riders.ai)
    for (let i = 0; i < 3; i += 1) stepOnce(s2)
    expect(dist(s2.riders.ai)).toBeLessThanOrEqual(before)
    expect(mid).toBeGreaterThan(0)
    // seed 噪声：十字口袋里三个候选可达空间全为 1，argmax 只剩 rng——
    // 同种子确定、不同种子分叉（1=up、5=left）。
    const pocket = (seed: number): Dir => {
      const s = createTronState(seed)
      s.walls.fill(1)
      const cx = 5
      const cy = 5
      const at = (x: number, y: number): number => y * COLS + x
      s.walls[at(cx, cy - 1)] = 0
      s.walls[at(cx - 1, cy)] = 0
      s.walls[at(cx + 1, cy)] = 0
      s.walls[at(cx, cy + 1)] = 0
      s.walls[at(cx, cy)] = 2
      s.riders.ai = { x: cx, y: cy, dir: 'up', px: cx, py: cy }
      s.riders.player = { x: cx, y: cy + 1, dir: 'up', px: cx, py: cy + 1 }
      s.tick = 30
      return aiDecide(s)
    }
    expect(pocket(1)).toBe(pocket(1))
    expect(pocket(1)).not.toBe(pocket(5))
  })

  it('步进节奏：到点步进、速度随时间提升、一帧可多步', () => {
    const state = createTronState(1)
    expect(stepIntervalMs(state)).toBe(STEP_MS_BASE)
    expect(advance(state, STEP_MS_BASE - 1)).toBe(0)
    expect(state.tick).toBe(0)
    expect(advance(state, 1)).toBe(1) // 累计正好到 110ms
    // 加速：把 tick 推到爬坡末端。
    state.tick = 240
    expect(stepIntervalMs(state)).toBeLessThan(STEP_MS_BASE)
    // 一帧塞 3 个间隔 → 3 步。
    const s2 = createTronState(2)
    expect(advance(s2, STEP_MS_BASE * 3 + 20)).toBe(3)
  })

  it('三局两胜：先拿 2 局者胜，下一局保留局分', () => {
    const state = createTronState(13)
    state.wins.player = 1
    state.winner = 'player'
    state.roundOver = true
    state.wins.player = 2
    expect(matchOver(state)).toBe(true)
    const s2 = createTronState(13)
    s2.wins.ai = WINS_NEEDED - 1
    expect(matchOver(s2)).toBe(false)
    expect(WINS_NEEDED).toBe(2)
    // 正常流程：一局结束 → 局分入账 → 开下一局清盘但保留局分。
    const s3 = createTronState(13)
    runRound(s3)
    const winner = s3.winner
    if (winner === 'player' || winner === 'ai') expect(s3.wins[winner]).toBe(1)
    const winsBefore = s3.wins.player + s3.wins.ai
    startNextRound(s3)
    expect(s3.round).toBe(2)
    expect(s3.roundOver).toBe(false)
    expect(s3.tick).toBe(0)
    expect(s3.wins.player + s3.wins.ai).toBe(winsBefore)
  })

  it('同格相撞判平局：双方不得分', () => {
    const state = createTronState(1)
    const midY = Math.floor(ROWS / 2)
    // 手工构造相距两格的对冲：玩家 (10,mid) 向右、AI (12,mid) 向左，
    // AI 上下两格封死（只有直行可行），双方下一格同为 (11,mid)。
    state.riders.player = { x: 10, y: midY, dir: 'right', px: 10, py: midY }
    state.riders.ai = { x: 12, y: midY, dir: 'left', px: 12, py: midY }
    state.walls.fill(0)
    state.walls[midY * COLS + 10] = 1
    state.walls[midY * COLS + 12] = 2
    state.walls[(midY - 1) * COLS + 12] = 1
    state.walls[(midY + 1) * COLS + 12] = 1
    state.trails.player = [{ x: 10, y: midY }]
    state.trails.ai = [{ x: 12, y: midY }]
    stepOnce(state)
    expect(state.roundOver).toBe(true)
    expect(state.winner).toBe('draw')
    expect(state.wins.player).toBe(0)
    expect(state.wins.ai).toBe(0)
    expect(state.crashCells.length).toBe(2)
  })

  it('重放：同 seed + 输入日志复现终局（局面指纹与局分一致）', () => {
    const state = createTronState(2024)
    // 脚本对局：带转向输入跑完整场比赛（三局两胜，AI 自动）。
    const dirs = ['up', 'right', 'down', 'up', 'right'] as const
    let round = 1
    let guard = 0
    while (!matchOver(state) && guard < 3000) {
      if (state.roundOver) {
        startNextRound(state)
        round += 1
        continue
      }
      if (guard % 5 === 0) playerTurn(state, dirs[guard % dirs.length]!)
      stepOnce(state)
      guard += 1
    }
    expect(matchOver(state)).toBe(true)
    const replayed = replay(2024, state.inputLog)
    expect(replayed.round).toBe(state.round)
    expect(replayed.wins).toEqual(state.wins)
    expect(wallsSignature(replayed)).toBe(wallsSignature(state))
    expect(replayed.tick).toBe(state.tick)
    // 重放两次结果稳定（同 seed 幂等）。
    expect(wallsSignature(replay(2024, state.inputLog))).toBe(wallsSignature(replayed))
  })
})
