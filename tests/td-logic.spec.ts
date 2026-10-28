import { describe, expect, it } from 'vitest'
import {
  BUILD_TIME, GRID_H, GRID_W, START_GOLD, START_LIVES,
  buildTower, canBuild, createState, earlySendBonus, enemySpeed, explode, generatePath,
  hitEnemy, killGold, mapSeed, mulberry32, pathLength, pathTilesOf, positionAt, restartLevel,
  sellTower, sendWaveEarly, startWave, step, towerStats, upgradeCost, upgradeTower, waveClearBonus, waveSize,
  type Enemy, type TdState, type Waypoint,
} from '../src/client/games/td/logic.ts'

/** First buildable tile scanning row-major. */
function freeTile(state: TdState, skip = 0): { tx: number; ty: number } {
  let found = 0
  for (let ty = 0; ty < GRID_H; ty += 1) {
    for (let tx = 0; tx < GRID_W; tx += 1) {
      if (canBuild(state, tx, ty)) {
        if (found === skip) return { tx, ty }
        found += 1
      }
    }
  }
  throw new Error('no free tile')
}

function makeEnemy(hp: number, speed: number): Enemy {
  return { id: 1, hp, maxHp: hp, speed, brute: false, dist: 0, slowTime: 0, slowFactor: 0, alive: true }
}

/** Drain the whole wave: spawn everything, then kill every enemy directly
 * (one extra step lets the wave-clear check run). */
function drainWave(state: TdState): void {
  while (state.spawnQueue > 0 || state.enemies.length > 0) {
    step(state, 1 / 60)
    for (const enemy of state.enemies) hitEnemy(state, enemy, 9999)
    state.enemies = state.enemies.filter(e => e.alive)
  }
  step(state, 1 / 60)
}

describe('td path generation', () => {
  it('produces contiguous axis-aligned waypoints', () => {
    const path = generatePath(mapSeed(1234, 1))
    expect(path.length).toBeGreaterThanOrEqual(2)
    for (let i = 0; i + 1 < path.length; i += 1) {
      const a = path[i]!
      const b = path[i + 1]!
      const shares = (a.x === b.x) !== (a.y === b.y) // exactly one axis aligned
      expect(shares).toBe(true)
      const gap = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
      expect(gap).toBeGreaterThanOrEqual(1)
    }
  })

  it('starts at the left edge and ends at the right edge', () => {
    const path = generatePath(mapSeed(777, 2))
    expect(path[0]!.x).toBe(0)
    expect(path[path.length - 1]!.x).toBe(GRID_W - 1)
    for (const wp of path) {
      expect(wp.y).toBeGreaterThanOrEqual(0)
      expect(wp.y).toBeLessThanOrEqual(GRID_H - 1)
    }
  })

  it('never lets a tower overlap a path tile', () => {
    const state = createState(42)
    let pathTiles = 0
    for (let ty = 0; ty < GRID_H; ty += 1) {
      for (let tx = 0; tx < GRID_W; tx += 1) {
        if (state.pathTiles[ty]![tx]) {
          pathTiles += 1
          expect(canBuild(state, tx, ty)).toBe(false)
          expect(buildTower(state, 'arrow', tx, ty)).toBe(false)
        }
      }
    }
    expect(pathTiles).toBeGreaterThan(0)
    expect(state.gold).toBe(START_GOLD) // nothing was spent
  })

  it('is deterministic per seed and differs across seeds', () => {
    const a = JSON.stringify(generatePath(mapSeed(9, 1)))
    const b = JSON.stringify(generatePath(mapSeed(9, 1)))
    const c = JSON.stringify(generatePath(mapSeed(10, 1)))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('td build rules', () => {
  it('rejects a build when gold is insufficient', () => {
    const state = createState(1)
    state.gold = TOWER_COST('cannon') - 1
    const tile = freeTile(state)
    expect(buildTower(state, 'cannon', tile.tx, tile.ty)).toBe(false)
    expect(state.towers).toHaveLength(0)
  })

  it('rejects a build on an occupied tile', () => {
    const state = createState(1)
    const tile = freeTile(state)
    expect(buildTower(state, 'arrow', tile.tx, tile.ty)).toBe(true)
    expect(buildTower(state, 'frost', tile.tx, tile.ty)).toBe(false)
    expect(state.towers).toHaveLength(1)
  })

  it('sells for a 60% refund of everything paid', () => {
    const state = createState(1)
    const tile = freeTile(state)
    buildTower(state, 'arrow', tile.tx, tile.ty)
    upgradeTower(state, state.towers[0]!.id) // +40
    const goldBefore = state.gold
    expect(sellTower(state, state.towers[0]!.id)).toBe(true)
    expect(state.gold).toBe(goldBefore + Math.floor((50 + 40) * 0.6))
    expect(state.towers).toHaveLength(0)
  })

  it('upgrades to Lv3 max with correct prices, then stops', () => {
    const state = createState(1)
    const tile = freeTile(state)
    state.gold += 200 // afford both upgrades
    buildTower(state, 'frost', tile.tx, tile.ty)
    const tower = state.towers[0]!
    expect(upgradeCost('frost', 1)).toBe(50)
    expect(upgradeTower(state, tower.id)).toBe(true)
    expect(upgradeCost('frost', 2)).toBe(75)
    expect(upgradeTower(state, tower.id)).toBe(true)
    expect(tower.level).toBe(3)
    expect(upgradeCost('frost', 3)).toBe(0)
    expect(upgradeTower(state, tower.id)).toBe(false)
    expect(tower.level).toBe(3)
  })
})

function TOWER_COST(kind: 'arrow' | 'frost' | 'cannon'): number {
  return kind === 'arrow' ? 50 : kind === 'frost' ? 70 : 90
}

describe('td combat', () => {
  it('arrow damage kills exactly when HP crosses 0 and grants gold', () => {
    const state = createState(3)
    startWave(state)
    step(state, 1 / 60) // spawn timer still pending: create enemy manually
    const enemy = makeEnemy(8, 1)
    state.enemies.push(enemy)
    const goldBefore = state.gold
    hitEnemy(state, enemy, 7)
    expect(enemy.alive).toBe(true)
    hitEnemy(state, enemy, 1)
    expect(enemy.alive).toBe(false)
    expect(state.gold).toBe(goldBefore + killGold(state.wave))
  })

  it('frost slow stacks duration, not magnitude', () => {
    const state = createState(3)
    const enemy = makeEnemy(100, 1)
    hitEnemy(state, enemy, 0, 0.4, 1.2)
    expect(enemy.slowFactor).toBe(0.4)
    expect(enemy.slowTime).toBeCloseTo(1.2, 5)
    hitEnemy(state, enemy, 0, 0.4, 1.2)
    expect(enemy.slowFactor).toBe(0.4)
    expect(enemy.slowTime).toBeCloseTo(2.4, 5)
  })

  it('cannon splash hits every enemy in radius and none outside', () => {
    const state = createState(5)
    const path: Waypoint[] = [{ x: 0, y: 4 }, { x: 10, y: 4 }]
    state.path = path
    state.pathTiles = pathTilesOf(path)
    const inside = [makeEnemy(100, 1), makeEnemy(100, 1)]
    const outside = makeEnemy(100, 1)
    inside[0]!.dist = 4.5 // 0.5 tiles from the impact at x=5
    inside[1]!.dist = 5
    outside.dist = 9 // 4 tiles from the impact at x=5: outside radius 1.2
    state.enemies.push(inside[0]!, inside[1]!, outside)
    const dmg = towerStats('cannon', 3).dmg!
    explode(state, 5, 4, dmg, 1.2)
    expect(inside[0]!.hp).toBe(100 - dmg)
    expect(inside[1]!.hp).toBe(100 - dmg)
    expect(outside.hp).toBe(100)
  })

  it('a real arrow tower fires homing shots at enemies in range', () => {
    const state = createState(11)
    // Place an arrow tower right beside the corridor start.
    const start = state.path[0]!
    const ty = Math.min(GRID_H - 1, start.y + 1)
    const tx = Math.min(GRID_W - 1, start.x + 1)
    state.pathTiles[ty]![tx] = false
    expect(buildTower(state, 'arrow', tx, ty)).toBe(true)
    startWave(state)
    let fired = false
    for (let i = 0; i < 60 * 6 && !fired; i += 1) {
      step(state, 1 / 60)
      if (state.projectiles.length > 0) fired = true
    }
    expect(fired).toBe(true)
  })
})

describe('td enemy movement', () => {
  it('follows waypoints at the given speed', () => {
    const state = createState(7)
    const path = state.path
    const total = pathLength(path)
    const enemy = makeEnemy(100, 2) // 2 tiles/s
    state.enemies.push(enemy)
    step(state, 0.5)
    expect(enemy.dist).toBeCloseTo(1, 5)
    const pos = positionAt(path, enemy.dist)
    // First segment is horizontal from (0, y): moving right.
    expect(pos.y).toBe(path[0]!.y)
    expect(pos.x).toBeGreaterThan(0)
    enemy.dist = total - 0.01
    step(state, 0.5)
    expect(enemy.alive).toBe(false) // reached the end
  })

  it('slow effect reduces the progress rate', () => {
    const state = createState(7)
    const enemy = makeEnemy(100, 1)
    enemy.slowTime = 1
    enemy.slowFactor = 0.7
    state.enemies.push(enemy)
    expect(enemySpeed(enemy)).toBeCloseTo(0.3, 5)
    step(state, 0.5)
    expect(enemy.dist).toBeCloseTo(0.15, 5)
  })
})

describe('td waves', () => {
  it('spawns 4+N enemies for wave N (capped at 20)', () => {
    expect(waveSize(1)).toBe(5)
    expect(waveSize(6)).toBe(10)
    expect(waveSize(30)).toBe(20)
    const state = createState(2)
    state.wave = 2
    startWave(state)
    while (state.spawnQueue > 0) step(state, 1 / 60)
    expect(state.enemies).toHaveLength(6)
  })

  it('makes every 3rd wave end with a brute (3× HP, 0.7× speed)', () => {
    const state = createState(4)
    state.wave = 3
    startWave(state)
    while (state.spawnQueue > 0) step(state, 1 / 60)
    const brutes = state.enemies.filter(e => e.brute)
    expect(brutes).toHaveLength(1)
    const normal = state.enemies.find(e => !e.brute)!
    expect(brutes[0]!.maxHp).toBeCloseTo(normal.maxHp * 3, 5)
    expect(brutes[0]!.speed).toBeCloseTo(normal.speed * 0.7, 5)
  })

  it('a leak costs a life; three leaks lose the game', () => {
    const state = createState(6)
    startWave(state)
    step(state, 1)
    state.enemies[0]!.dist = pathLength(state.path) - 0.001
    const lives = state.lives
    step(state, 1 / 60)
    expect(state.lives).toBe(lives - 1)
    expect(state.result).toBe('none')
    while (state.result === 'none') {
      step(state, 1)
      for (const enemy of state.enemies) enemy.dist = pathLength(state.path) - 0.001
      step(state, 1 / 60)
    }
    expect(state.lives).toBe(0)
    expect(state.result).toBe('lose')
  })

  it('clearing a wave pays 20+2N and starts the next build phase', () => {
    const state = createState(8)
    startWave(state)
    const goldBefore = state.gold
    const scoreBefore = state.score
    drainWave(state)
    expect(state.gold).toBe(goldBefore + 5 * killGold(1) + waveClearBonus(1))
    expect(state.score).toBe(scoreBefore + waveClearBonus(1))
    expect(state.phase).toBe('build')
    expect(state.wave).toBe(2)
  })

  it('winning wave 10 advances the level and resets the wave', () => {
    const state = createState(9)
    state.wave = 10
    startWave(state)
    drainWave(state)
    expect(state.level).toBe(2)
    expect(state.wave).toBe(1)
    expect(state.phase).toBe('build')
    expect(state.buildTimer).toBeGreaterThan(0)
  })
})

describe('td economy', () => {
  it('early send pays 10 per remaining build second', () => {
    expect(earlySendBonus(5.9)).toBe(50)
    expect(earlySendBonus(0)).toBe(0)
    const state = createState(12)
    state.buildTimer = 4.2
    const gold = state.gold
    const score = state.score
    sendWaveEarly(state)
    expect(state.gold).toBe(gold + 40)
    expect(state.score).toBe(score + 40)
    expect(state.phase).toBe('wave')
  })

  it('restartLevel resets gold, wave, and score on the same map', () => {
    const state = createState(13)
    startWave(state)
    drainWave(state)
    const pathBefore = JSON.stringify(state.path)
    state.gold = 300
    state.lives = 1
    restartLevel(state)
    expect(state.gold).toBe(START_GOLD)
    expect(state.lives).toBe(START_LIVES)
    expect(state.score).toBe(0)
    expect(state.wave).toBe(1)
    expect(state.phase).toBe('build')
    expect(state.buildTimer).toBe(BUILD_TIME)
    expect(JSON.stringify(state.path)).toBe(pathBefore)
  })
})

describe('td determinism', () => {
  it('same seed + same command script → identical end state', () => {
    const runScript = (): TdState => {
      const state = createState(2024)
      const a = freeTile(state, 0)
      buildTower(state, 'arrow', a.tx, a.ty)
      const b = freeTile(state, 1)
      buildTower(state, 'frost', b.tx, b.ty)
      const c = freeTile(state, 2)
      buildTower(state, 'cannon', c.tx, c.ty)
      if (state.towers[0] !== undefined) upgradeTower(state, state.towers[0]!.id)
      sendWaveEarly(state)
      for (let i = 0; i < 60 * 45; i += 1) {
        step(state, 1 / 60)
        if (state.result === 'lose') break
      }
      return state
    }
    const a = runScript()
    const b = runScript()
    expect(a.gold).toBe(b.gold)
    expect(a.score).toBe(b.score)
    expect(a.lives).toBe(b.lives)
    expect(a.wave).toBe(b.wave)
    expect(a.level).toBe(b.level)
    expect(a.towers.map(t => t.level)).toEqual(b.towers.map(t => t.level))
    expect(a.enemies.map(e => [e.id, e.hp, Math.round(e.dist * 1e6)])).toEqual(b.enemies.map(e => [e.id, e.hp, Math.round(e.dist * 1e6)]))
    expect(a.rng()).toBe(b.rng())
  })

  it('mulberry32 streams are reproducible', () => {
    const a = mulberry32(99)
    const b = mulberry32(99)
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b())
  })
})
