/**
 * 海战棋游戏定义：把 {@link Battle} 状态机接成 {@link MiniGameInstance} ——
 * 布舰期点击放舰、X 旋转、空格随机补齐 / 确认开战；战斗期点击敌方海域
 * 开炮（命中连开、miss 换 AI，AI 回合带索敌延迟与连开链）；H 热图提示、
 * R 重开挑战、P 暂停。5 局挑战（难度 L1→L5），积分 = 赢局 100 + 剩余
 * 弹量加成，通过 onScore 上报。脏标记渲染（见 frame-scheduler）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  FLEET,
  canPlace,
  heatMap,
  playerFire,
  aiFire,
  randomFleet,
  startBattle,
  type Battle,
  type Placement,
} from './logic.ts'
import {
  LOGICAL_W,
  LOGICAL_H,
  boardAt,
  enemyCellCenter,
  ownCellCenter,
  renderBattle,
  type BattleView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles, THEME } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const AI_THINK_MS = 650
const TOAST_MS = 1600
/** 每局弹量预算：赢局加成 = max(0, 100 - 已发射)。 */
const SHELL_BUDGET = 100
const TOTAL_ROUNDS = 5

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function countShots(shots: number[][]): number {
  let n = 0
  for (const row of shots) for (const v of row) if (v !== 0) n += 1
  return n
}

function createBattleshipGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: battleship needs a 2d canvas context')
  const ctx = fit.ctx

  let round = 1
  let score = 0
  let lastScore = -1
  let mode: 'placing' | 'battle' | 'over' = 'placing'
  let overResult: 'won' | 'lost' | null = null
  let battle: Battle | null = null
  let roundSeed = nextSeed()
  // 布舰期状态。
  let placed: Placement[] = []
  let orientation = true
  let hover: { row: number, col: number } | null = null
  // 战斗期状态。
  let aiThinking = false
  let heatOn = false
  let message = ''
  let toastMs = 0
  let paused = false
  let destroyed = false
  let aiTimer = 0
  const particles = createParticles()

  const toast = (text: string): void => {
    message = text
    toastMs = TOAST_MS
    loop.markDirty()
  }

  const reportScore = (): void => {
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const preview = (): Placement | null => {
    if (hover === null || placed.length >= FLEET.length) return null
    return { row: hover.row, col: hover.col, horizontal: orientation }
  }
  const previewOk = (): boolean => {
    const p = preview()
    return p !== null && canPlace(placed, p, FLEET[placed.length]!.size)
  }

  const clearAiTimer = (): void => {
    if (aiTimer !== 0) {
      clearTimeout(aiTimer)
      aiTimer = 0
    }
    aiThinking = false
  }

  const enterPlacing = (seed: number): void => {
    clearAiTimer()
    roundSeed = seed
    mode = 'placing'
    overResult = null
    battle = null
    placed = []
    orientation = true
    hover = null
    loop.markDirty()
  }

  const beginBattle = (fleet: Placement[]): void => {
    clearAiTimer()
    battle = startBattle(roundSeed, fleet, round)
    mode = 'battle'
    overResult = null
    toast('战斗开始 —— 点击敌方海域开炮')
  }

  /** AI 回合链：命中连开，miss 换手；暂停时顺延。 */
  const scheduleAi = (): void => {
    aiThinking = true
    loop.markDirty()
    aiTimer = window.setTimeout(() => {
      aiTimer = 0
      if (destroyed || battle === null || battle.turn !== 'ai') {
        aiThinking = false
        loop.markDirty()
        return
      }
      if (paused) {
        scheduleAi()
        return
      }
      const result = aiFire(battle)
      const center = ownCellCenter(result.row, result.col)
      if (result.kind === 'hit') {
        particles.burst(center.x, center.y, THEME.bad, 14, 150)
        if (result.sunk !== null) toast('我方' + result.sunk + '被击沉！')
      } else {
        particles.burst(center.x, center.y, 'rgba(125,207,255,0.8)', 8, 90)
      }
      if (battle.phase === 'lost') {
        aiThinking = false
        mode = 'over'
        overResult = 'lost'
        toast('舰队全灭 —— 本局失利')
        loop.markDirty()
        return
      }
      if (result.kind === 'hit') {
        scheduleAi()
        return
      }
      aiThinking = false
      loop.markDirty()
    }, AI_THINK_MS)
  }

  /** 战斗期玩家点击敌方格。 */
  const tryPlayerFire = (row: number, col: number): void => {
    if (battle === null || battle.turn !== 'player' || battle.phase !== 'battle') return
    const result = playerFire(battle, row, col)
    if (result.kind === 'repeat') return
    const center = enemyCellCenter(row, col)
    if (result.kind === 'hit') {
      particles.burst(center.x, center.y, accent(2), 16, 170)
      if (result.sunk !== null) toast('击沉敌方' + result.sunk + '！')
    } else {
      particles.burst(center.x, center.y, 'rgba(125,207,255,0.8)', 8, 90)
    }
    if ((battle.phase as string) === 'won') {
      const bonus = Math.max(0, SHELL_BUDGET - countShots(battle.ai.shots))
      score += 100 + bonus
      reportScore()
      mode = 'over'
      overResult = 'won'
      toast('敌方舰队全灭！ +' + (100 + bonus) + ' 分')
      loop.markDirty()
      return
    }
    if (result.kind === 'miss') scheduleAi()
    loop.markDirty()
  }

  /** 布舰期点击己方格：合法则放下当前舰。 */
  const tryPlace = (row: number, col: number): void => {
    if (placed.length >= FLEET.length) return
    const p: Placement = { row, col, horizontal: orientation }
    if (!canPlace(placed, p, FLEET[placed.length]!.size)) {
      toast('此处无法布舰（越界/重叠/贴边）')
      return
    }
    placed = [...placed, p]
    if (placed.length === FLEET.length) toast('布舰完成 —— 空格开战')
    loop.markDirty()
  }

  const restartChallenge = (): void => {
    round = 1
    score = 0
    reportScore()
    enterPlacing(nextSeed())
  }

  const advanceRound = (): void => {
    if (round >= TOTAL_ROUNDS) {
      round = 1
      score = 0
      reportScore()
      toast('挑战完成 —— 重新开始')
    } else {
      round += 1
    }
    enterPlacing(nextSeed())
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space') {
      event.preventDefault()
      if (paused) return
      if (mode === 'placing') {
        if (placed.length < FLEET.length) {
          placed = randomFleet(roundSeed)
          toast('随机布舰完成 —— 空格开战')
          loop.markDirty()
        } else {
          beginBattle(placed)
        }
      } else if (mode === 'over') {
        advanceRound()
      }
      return
    }
    if (event.code === 'KeyX') {
      event.preventDefault()
      if (mode === 'placing') {
        orientation = !orientation
        loop.markDirty()
      }
      return
    }
    if (event.code === 'KeyH') {
      event.preventDefault()
      heatOn = !heatOn
      loop.markDirty()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restartChallenge()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      paused = !paused
      loop.markDirty()
      return
    }
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (mode !== 'placing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = boardAt(x, y)
    const next = hit !== null && hit.target === 'own' ? { row: hit.row, col: hit.col } : null
    if ((hover === null) !== (next === null) || (hover !== null && next !== null && (hover.row !== next.row || hover.col !== next.col))) {
      hover = next
      loop.markDirty()
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!loop.running || paused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = boardAt(x, y)
    if (hit === null) return
    if (mode === 'placing') {
      if (hit.target === 'own') tryPlace(hit.row, hit.col)
      return
    }
    if (mode === 'battle' && hit.target === 'enemy') tryPlayerFire(hit.row, hit.col)
  }

  const view = (): BattleView => ({
    mode,
    placing: mode === 'placing' ? { placed, preview: preview(), previewOk: previewOk(), shipIndex: Math.min(placed.length, FLEET.length - 1) } : null,
    battle,
    aiThinking,
    heatOn,
    playerHeat: heatOn && battle !== null ? heatMap(battle.player) : null,
    round,
    totalRounds: TOTAL_ROUNDS,
    score,
    message,
    over: overResult,
    paused,
  })

  // 脏标记渲染：静态海图只在状态、粒子或提示变化时重绘。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    if (toastMs > 0) {
      toastMs = Math.max(0, toastMs - dtMs)
      if (toastMs === 0) {
        message = ''
        loop.markDirty()
      }
    }
    particles.tick(ctx, dtMs)
    if (f.render || particles.size() > 0) renderBattle(ctx, view())
  }, { mode: 'dirty' })

  const start = (): void => {
    if (destroyed) return
    focusGameHost(host)
    loop.start()
  }

  const destroy = (): void => {
    destroyed = true
    clearAiTimer()
    loop.destroy()
    fit.dispose()
  }

  document.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mousedown', onMouseDown)

  return {
    start,
    pause(): void {
      paused = true
      loop.pause()
    },
    resume(): void {
      paused = false
      loop.resume()
      loop.markDirty()
    },
    destroy,
  }
}

/** 海战棋：经典 Battleship 对 AI，概率热图 + 追击的猫鼠博弈。 */
export const battleshipGame: MiniGameDefinition = {
  id: 'battleship',
  title: '海战棋 Battleship',
  icon: '⚓',
  description: '在看不见的海面上布舰开炮——概率与直觉的猫鼠游戏。',
  controls: [
    '点击：放舰 / 开炮',
    'X：旋转舰 · 空格：随机布舰 / 开战',
    'H：热图提示',
    'R：重开 · P：暂停',
  ],
  create: createBattleshipGame,
}
