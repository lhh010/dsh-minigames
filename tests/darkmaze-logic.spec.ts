import { describe, expect, it } from 'vitest'
import {
  DE, DN, DS, DW, FLASH_MS, MAX_RADIUS,
  computeScore, createDarkMazeState, darkCanMove, darkStateSnapshot,
  effectiveRadius, generateDarkMaze, hasLineOfSight, levelConfig, moveDarkPlayer,
  tickDarkMaze, visibleCells,
  type DarkDir, type DarkMaze, type DarkMazeState,
} from '../src/client/games/darkmaze/logic.ts'

const SEEDS = [1, 42, 0x9e3779b9, 123456789, 20261117]
const SIZES: [number, number][] = [[3, 3], [7, 7], [15, 15], [25, 25]]

/** 造一条 5×5 全封闭迷宫里第 2 行的水平走廊（其余墙全关）。 */
function corridorMaze(): DarkMaze {
  const w = 5
  const h = 5
  const walls = new Uint8Array(w * h)
  const y = 2
  for (let x = 0; x < w - 1; x += 1) {
    walls[y * w + x]! |= DE
    walls[y * w + x + 1]! |= DW
  }
  return { w, h, walls }
}

/** 把玩家直接放到 target 的某个可走邻居上，再朝 target 走一步。 */
function stepOnto(state: DarkMazeState, target: { x: number; y: number }) {
  const delta: Record<DarkDir, [number, number]> = {
    up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0],
  }
  const opposite: Record<DarkDir, DarkDir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
  for (const dir of ['up', 'right', 'down', 'left'] as DarkDir[]) {
    if (darkCanMove(state.maze, target.x, target.y, dir)) {
      const d = delta[dir]
      state.player = { x: target.x + d[0], y: target.y + d[1] }
      return moveDarkPlayer(state, opposite[dir])
    }
  }
  throw new Error('target has no open neighbor')
}

describe('darkmaze logic', () => {
  it('是生成树：通路数 = 格数 - 1、边界墙不开、邻格墙对称', () => {
    for (const seed of SEEDS) {
      for (const [w, h] of SIZES) {
        const maze = generateDarkMaze(seed, w, h)
        let openings = 0
        for (let i = 0; i < maze.walls.length; i += 1) {
          if (maze.walls[i]! & DN) openings += 1
          if (maze.walls[i]! & DW) openings += 1
        }
        expect(openings, 'seed ' + seed + ' ' + w + 'x' + h).toBe(w * h - 1)
        for (let x = 0; x < w; x += 1) {
          expect(maze.walls[x]! & DN).toBe(0)
          expect(maze.walls[(h - 1) * w + x]! & DS).toBe(0)
        }
        for (let y = 0; y < h; y += 1) {
          expect(maze.walls[y * w]! & DW).toBe(0)
          expect(maze.walls[y * w + w - 1]! & DE).toBe(0)
        }
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const here = maze.walls[y * w + x]!
            if (x + 1 < w) {
              expect((here & DE) !== 0).toBe((maze.walls[y * w + x + 1]! & DW) !== 0)
            }
            if (y + 1 < h) {
              expect((here & DS) !== 0).toBe((maze.walls[(y + 1) * w + x]! & DN) !== 0)
            }
          }
        }
      }
    }
  })

  it('关卡配置递进：15→25 变大、陷阱渐多、后期半径衰减、越界钳制', () => {
    expect(levelConfig(1).size).toBe(15)
    expect(levelConfig(5).size).toBe(25)
    for (let l = 2; l <= 5; l += 1) {
      expect(levelConfig(l).size).toBeGreaterThan(levelConfig(l - 1).size)
      expect(levelConfig(l).traps).toBeGreaterThan(levelConfig(l - 1).traps)
    }
    expect(levelConfig(5).radius).toBeLessThan(levelConfig(3).radius)
    expect(levelConfig(0)).toEqual(levelConfig(1))
    expect(levelConfig(99)).toEqual(levelConfig(5))
  })

  it('初始状态：起点(0,0)、出口远角、道具数量符合配置且避开起点/出口', () => {
    for (const seed of SEEDS) {
      for (let level = 1; level <= 5; level += 1) {
        const s = createDarkMazeState(seed, level)
        const cfg = levelConfig(level)
        expect(s.player).toEqual({ x: 0, y: 0 })
        expect(s.exit).toEqual({ x: cfg.size - 1, y: cfg.size - 1 })
        expect(s.lives).toBe(3)
        expect(s.status).toBe('playing')
        expect(s.coins).toHaveLength(cfg.coins)
        expect(s.traps).toHaveLength(cfg.traps)
        expect(s.batteries).toHaveLength(cfg.batteries)
        for (const item of [...s.coins, ...s.traps, ...s.batteries]) {
          expect(item.x + item.y).toBeGreaterThan(2) // 不在起点附近
          expect(item.x === s.exit.x && item.y === s.exit.y).toBe(false)
        }
        expect(s.memory.size).toBeGreaterThan(1)
        expect(s.memory.has(0)).toBe(true) // 玩家所在格必在记忆中
      }
    }
  })

  it('移动：撞墙不动且步数不变；成功移动步数 +1 且朝向对齐移动方向', () => {
    for (const dir of ['up', 'right', 'down', 'left'] as DarkDir[]) {
      const s = createDarkMazeState(7, 1)
      const can = darkCanMove(s.maze, s.player.x, s.player.y, dir)
      const before = darkStateSnapshot(s)
      const r = moveDarkPlayer(s, dir)
      expect(r.moved).toBe(can)
      if (!can) {
        expect(darkStateSnapshot(s)).toEqual(before)
      } else {
        expect(s.steps).toBe(1)
        const angle = { up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI }[dir]
        expect(s.facing).toBeCloseTo(angle, 6)
      }
    }
  })

  it('金币：踩中即拾取加分，重复踩不重复计', () => {
    const s = createDarkMazeState(3, 1)
    const coin = s.coins[0]!
    const r = stepOnto(s, coin)
    expect(r.moved).toBe(true)
    expect(r.coin).toBe(true)
    expect(coin.taken).toBe(true)
    expect(s.coinsCollected).toBe(1)
    // 走开再走回：不再触发
    const back = stepOnto(s, { x: s.player.x, y: s.player.y })
    expect(back.coin).toBe(false)
    expect(s.coinsCollected).toBe(1)
    expect(computeScore(s, 0)).toBe(10)
  })

  it('陷阱：扣 1 命、闪现 0.5s、全图入记忆、不重复触发、tick 衰减', () => {
    const s = createDarkMazeState(5, 1)
    const trap = s.traps[0]!
    const r = stepOnto(s, trap)
    expect(r.trap).toBe(true)
    expect(s.lives).toBe(2)
    expect(s.flashMs).toBe(FLASH_MS)
    expect(s.memory.size).toBe(s.maze.w * s.maze.h)
    tickDarkMaze(s, 200)
    expect(s.flashMs).toBe(300)
    tickDarkMaze(s, 400)
    expect(s.flashMs).toBe(0)
    const before = s.lives
    stepOnto(s, trap) // 已触发的陷阱变成安全格
    expect(s.lives).toBe(before)
  })

  it('电池：后期半径衰减由电池补光，且封顶不超过上限', () => {
    const s = createDarkMazeState(11, 5)
    expect(effectiveRadius(s)).toBe(3)
    const battery = s.batteries[0]!
    const r = stepOnto(s, battery)
    expect(r.battery).toBe(true)
    expect(battery.taken).toBe(true)
    expect(effectiveRadius(s)).toBe(4.5)
    // 拾取第二块电池：4.5 + 1.5 封顶到 MAX_RADIUS
    const other = s.batteries.find(b => !b.taken)
    if (other !== undefined) stepOnto(s, other)
    s.radiusBoost += 1.5
    expect(effectiveRadius(s)).toBe(MAX_RADIUS)
  })

  it('光锥角度：±60° 之外不可见，自身格恒可见', () => {
    const maze = corridorMaze()
    // 玩家 (0,2) 朝东：走廊向东可见，正北/正南在 90° 锥外
    const vis = visibleCells(maze, { x: 0, y: 2 }, 0, 4)
    expect(vis.has(2 * 5 + 0)).toBe(true)
    expect(vis.has(2 * 5 + 1)).toBe(true)
    expect(vis.has(2 * 5 + 4)).toBe(true)
    expect(vis.has(1 * 5 + 0)).toBe(false) // 正北
    expect(vis.has(3 * 5 + 0)).toBe(false) // 正南
    // 转向北：走廊外的 (0,1) 角度对但被墙挡
    const visNorth = visibleCells(maze, { x: 0, y: 2 }, -Math.PI / 2, 4)
    expect(visNorth.has(1 * 5 + 0)).toBe(false)
    expect(hasLineOfSight(maze, { x: 0, y: 2 }, { x: 0, y: 1 })).toBe(false)
    expect(hasLineOfSight(maze, { x: 0, y: 2 }, { x: 4, y: 2 })).toBe(true)
  })

  it('遮挡：封掉走廊中段一堵墙后，墙后格子从可见集中消失', () => {
    const maze = corridorMaze()
    // 封 (2,2)-(3,2) 之间的通道
    maze.walls[2 * 5 + 2]! &= ~DE
    maze.walls[2 * 5 + 3]! &= ~DW
    const vis = visibleCells(maze, { x: 0, y: 2 }, 0, 4)
    expect(vis.has(2 * 5 + 2)).toBe(true)
    expect(vis.has(2 * 5 + 3)).toBe(false)
    expect(vis.has(2 * 5 + 4)).toBe(false)
  })

  it('过关与游戏结束：踩出口 cleared；命尽踩陷阱 gameover 且不再响应移动', () => {
    const s = createDarkMazeState(2026, 1)
    const r = stepOnto(s, s.exit)
    expect(r.moved).toBe(true)
    expect(r.cleared).toBe(true)
    expect(s.status).toBe('cleared')
    expect(computeScore(s, 2)).toBe(s.coinsCollected * 10 + 200)

    const g = createDarkMazeState(2026, 1, 1)
    const trap = g.traps[0]!
    const rt = stepOnto(g, trap)
    expect(rt.trap).toBe(true)
    expect(rt.gameover).toBe(true)
    expect(g.status).toBe('gameover')
    expect(g.lives).toBe(0)
    const after = darkStateSnapshot(g)
    moveDarkPlayer(g, 'up')
    expect(darkStateSnapshot(g)).toEqual(after) // 终局后输入无效
  })

  it('seed 确定性：同 seed 迷宫位掩码相同、同操作序列快照完全一致、异 seed 可区分', () => {
    for (const seed of SEEDS) {
      const a = generateDarkMaze(seed, 15, 15)
      const b = generateDarkMaze(seed, 15, 15)
      expect([...b.walls]).toEqual([...a.walls])
      expect(a.walls.length).toBe(225)
    }
    const seq: DarkDir[] = [
      'up', 'right', 'right', 'down', 'left', 'left', 'down', 'right',
      'up', 'right', 'down', 'down', 'left', 'up', 'right', 'right',
    ]
    const play = (): Record<string, unknown> => {
      const s = createDarkMazeState(987654321, 3)
      for (const dir of seq) moveDarkPlayer(s, dir)
      tickDarkMaze(s, 120)
      return darkStateSnapshot(s)
    }
    expect(play()).toEqual(play())
    // 不同 seed 生成不同盘（确定性但可区分）
    expect([...generateDarkMaze(1, 15, 15).walls]).not.toEqual([...generateDarkMaze(2, 15, 15).walls])
  })
})
