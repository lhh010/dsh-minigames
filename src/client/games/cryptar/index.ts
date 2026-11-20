/**
 * 密码算式游戏定义：把纯逻辑与渲染接成 {@link MiniGameInstance} ——
 * 点击字母选中、点击数字池（或数字键）填入、X 清除选中字母，H 提示（限 2 次），
 * R 重开新对局、P 暂停；5 关按难度递进（seed 选题），过关 overlay 显现数字算式，
 * 得分经 onScore 上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  TOTAL_LEVELS,
  planPuzzles,
  createLevelState,
  assignDigit,
  clearLetter,
  applyHint,
  checkMapping,
  scoreFor,
  type CryptarPuzzle,
  type LevelState,
  type DigitMap,
  type CheckResult,
} from './logic.ts'
import { renderCryptar, cryptarLayout, letterAt, digitAt, hintHit, LOGICAL_W, LOGICAL_H, type CryptarView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const EMPTY_CHECK: CheckResult = {
  conflict: false,
  columns: [],
  duplicateDigits: false,
  leadingZero: false,
  complete: false,
  solved: false,
}

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createCryptarGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: cryptar needs a 2d canvas context')
  const ctx = fit.ctx
  const particles = createParticles()

  let plan: CryptarPuzzle[] = []
  let levelIdx = 0
  let level = createLevelState()
  let selected: string | null = null
  let check: CheckResult = EMPTY_CHECK
  let elapsedMs = 0
  let totalScore = 0
  let lastScore = -1
  let running = true
  let paused = false
  let wonRound = false
  let finishedAll = false

  const puzzle = (): CryptarPuzzle => plan[levelIdx]!

  const recheck = (): void => {
    check = checkMapping(puzzle(), level.mapping)
  }

  const newSession = (seed: number): void => {
    plan = planPuzzles(seed)
    levelIdx = 0
    level = createLevelState()
    selected = null
    elapsedMs = 0
    totalScore = 0
    wonRound = false
    finishedAll = false
    recheck()
  }

  const reportScore = (): void => {
    if (totalScore === lastScore) return
    lastScore = totalScore
    options?.onScore?.(totalScore)
  }

  const view = (): CryptarView => ({
    puzzle: puzzle(),
    mapping: level.mapping as DigitMap,
    revealed: level.revealed,
    selected,
    check,
    levelIdx,
    totalLevels: TOTAL_LEVELS,
    elapsedMs,
    score: totalScore,
    hintsLeft: 2 - level.hintsUsed,
    status: paused ? 'paused' : wonRound ? 'won' : 'playing',
    finishedAll,
  })

  const nextRound = (): void => {
    wonRound = false
    if (levelIdx + 1 >= TOTAL_LEVELS) {
      finishedAll = true
      return
    }
    levelIdx += 1
    level = createLevelState()
    selected = null
    elapsedMs = 0
    recheck()
  }

  /** 填数后统一入口：重验算，若过关则计分并撒粒子。 */
  const afterChange = (): void => {
    recheck()
    if (check.solved && !wonRound) {
      wonRound = true
      totalScore += scoreFor(levelIdx, elapsedMs, level.hintsUsed)
      reportScore()
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, accent(2), 30, 180)
    }
    loop.markDirty()
  }

  const fillDigit = (digit: number): void => {
    if (selected === null || wonRound || paused) return
    level = assignDigit(level, selected, digit)
    selected = null
    afterChange()
  }

  const useHint = (): void => {
    if (wonRound || paused) return
    const got = applyHint(level, puzzle())
    if (got === null) return
    level = got[0]
    selected = null
    afterChange()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      newSession(nextSeed())
      loop.markDirty()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyH') {
      event.preventDefault()
      if (running && !paused) useHint()
      return
    }
    if (event.code === 'KeyX') {
      event.preventDefault()
      if (selected !== null && !wonRound && !paused) {
        level = clearLetter(level, selected)
        selected = null
        afterChange()
      }
      return
    }
    if (event.code === 'Space') {
      if (wonRound) {
        event.preventDefault()
        nextRound()
        loop.markDirty()
      }
      return
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault()
      if (running) fillDigit(Number(event.key))
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused) return
    if (wonRound) {
      nextRound()
      loop.markDirty()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const layout = cryptarLayout(puzzle())
    const hitLetter = letterAt(layout, x, y)
    if (hitLetter !== null) {
      selected = selected === hitLetter ? null : hitLetter
      loop.markDirty()
      return
    }
    const hitDigit = digitAt(layout, x, y)
    if (hitDigit !== null) {
      fillDigit(hitDigit)
      return
    }
    if (hintHit(layout, x, y)) {
      useHint()
      return
    }
    // 点空白：取消选中。
    if (selected !== null) {
      selected = null
      loop.markDirty()
    }
  }

  const togglePause = (): void => {
    if (wonRound) return
    paused = !paused
    loop.markDirty()
    if (!paused) loop.resume()
  }

  // 脏标记渲染：静态竖式只在交互/粒子/过关时重绘；用时每秒走一次脏标记。
  const loop = createFrameLoop(frame => {
    const dtMs = frame.dt * 1000
    if (!paused && !wonRound) {
      const before = Math.floor(elapsedMs / 1000)
      elapsedMs += dtMs
      if (Math.floor(elapsedMs / 1000) !== before) loop.markDirty()
    }
    const animating = particles.size() > 0
    if (frame.render || animating) {
      renderCryptar(ctx, view())
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.markDirty()
    loop.pause()
    renderCryptar(ctx, view())
  }
  const resume = (): void => {
    running = true
    if (paused) {
      paused = false
      loop.markDirty()
    }
    loop.resume()
  }

  newSession(nextSeed())

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderCryptar(ctx, view())

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const cryptarGame: MiniGameDefinition = {
  id: 'cryptar',
  title: '密码算式 Cryptarithm',
  icon: '🟰',
  description: 'SEND 加 MORE 等于 MONEY——每个字母是一个数字，解开这道没有数字的算术题。',
  controls: [
    '点击字母再点数字（或数字键 0-9）：填入',
    'X：清除选中字母 · H：提示（每关 2 次，扣分）',
    'R：重开 · P：暂停 · 空格/点击：过关后下一关',
  ],
  create: createCryptarGame,
}