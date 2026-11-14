/**
 * 调色大师游戏定义：把纯调色逻辑接成 {@link MiniGameInstance} —— 点击/
 * 数字键 1·2·3 滴红黄蓝原色，U 撤回一滴，空格提前提交（达标即过关并按剩余滴数
 * 奖励），滴数用完自动判定；R 重开整局，P 暂停。五关递进，全部过关
 * 后可整局重来；得分通过 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  colorDistance,
  isWithinThreshold,
  makeLevel,
  mixColor,
  scoreFor,
  LEVELS,
  type RGB,
} from './logic.ts'
import {
  renderColorMix,
  dropAt,
  DROP_BUTTONS,
  LOGICAL_W,
  LOGICAL_H,
  type ColorMixView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const RIPPLE_MS = 420

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createColorMixGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: colormix needs a 2d canvas context')
  const ctx = fit.ctx

  let runSeed = 0
  let levelIdx = 0
  let target: RGB = [0, 0, 0]
  let targetName = ''
  let threshold = 0
  let maxDrops = 0
  let drops: number[] = []
  let status: 'playing' | 'cleared' | 'failed' | 'complete' = 'playing'
  let score = 0
  let paused = false
  let running = false
  let lastScore = -1
  let ripples: Array<{ x: number; y: number; age: number; maxAge: number; color: string }> = []
  const particles = createParticles()

  const reportScore = (): void => {
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 开某一关（同一种子同一条题目）。 */
  const loadLevel = (idx: number, seed: number): void => {
    levelIdx = idx
    const round = makeLevel(seed, idx)
    target = round.target
    targetName = round.name
    threshold = round.config.threshold
    maxDrops = round.config.maxDrops
    drops = []
    status = 'playing'
    ripples = []
  }

  const restart = (seed: number): void => {
    runSeed = seed
    score = 0
    reportScore()
    loadLevel(0, runSeed)
    loop.markDirty()
  }

  const currentMix = (): RGB | null => (drops.length === 0 ? null : mixColor(drops))
  const currentDistance = (): number | null => {
    const mix = currentMix()
    return mix === null ? null : colorDistance(mix, target)
  }

  /** 判定当前混合：达标过关计分，未达标按滴数决定失败或继续。 */
  const judge = (): void => {
    const mix = currentMix()
    if (mix === null) return
    const dist = colorDistance(mix, target)
    if (isWithinThreshold(dist, threshold)) {
      score += scoreFor(dist, threshold, maxDrops - drops.length)
      reportScore()
      status = 'cleared'
      particles.burst(LOGICAL_W / 2, 135, 'rgb(158,206,106)', 24, 160)
    } else if (drops.length >= maxDrops) {
      status = 'failed'
    }
  }

  /** 滴一滴原色；滴满立即自动判定。 */
  const drip = (color: number): void => {
    if (status !== 'playing' || paused || !running) return
    if (drops.length >= maxDrops) return
    drops = [...drops, color]
    const btn = DROP_BUTTONS[color]!
    ripples = [...ripples, { x: btn.x, y: btn.y, age: 0, maxAge: RIPPLE_MS, color: 'rgba(226,226,238,0.9)' }]
    if (drops.length >= maxDrops) judge()
    loop.markDirty()
  }

  /** U：撤回最后一滴（仅进行中）。 */
  const undo = (): void => {
    if (status !== 'playing' || paused || !running) return
    if (drops.length === 0) return
    drops = drops.slice(0, -1)
    loop.markDirty()
  }

  /** 空格：进行中=提前提交；过关=下一关；失败=重试；通关=整局重来。 */
  const advance = (): void => {
    if (paused || !running) return
    if (status === 'playing') {
      if (drops.length === 0) return
      judge()
      loop.markDirty()
      return
    }
    if (status === 'cleared') {
      if (levelIdx + 1 >= LEVELS.length) {
        status = 'complete'
      } else {
        loadLevel(levelIdx + 1, runSeed)
      }
      loop.markDirty()
      return
    }
    if (status === 'failed') {
      loadLevel(levelIdx, runSeed)
      loop.markDirty()
      return
    }
    // complete：空格整局重来（换新种子）。
    restart(nextSeed())
  }

  const togglePause = (): void => {
    if (status === 'complete') return
    paused = !paused
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 浏览器快捷键（Ctrl/Cmd+R 等）不拦截。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space') {
      event.preventDefault()
      advance()
      return
    }
    if (event.code === 'KeyU') {
      event.preventDefault()
      undo()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart(nextSeed())
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (/^[1-3]$/.test(event.key)) {
      event.preventDefault()
      drip(Number(event.key) - 1)
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (paused || status !== 'playing') {
      if (status !== 'playing' && !paused) advance()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = dropAt(x, y)
    if (typeof hit === 'number') {
      drip(hit)
    } else if (hit === 'SUBMIT' && drops.length > 0) {
      judge()
      loop.markDirty()
    }
  }

  const usedPer = (): number[] => {
    const counts = [0, 0, 0]
    for (const drop of drops) counts[drop] = (counts[drop] ?? 0) + 1
    return counts
  }

  const view = (): ColorMixView => ({
    levelIdx,
    maxDrops,
    drops,
    current: currentMix(),
    target,
    targetName,
    distance: currentDistance(),
    threshold,
    usedPer: usedPer(),
    score,
    status,
    paused,
    ripples,
  })

  // 脏标记渲染：静态盘面只在状态或动效变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    let animating = false
    if (ripples.length > 0) {
      ripples = ripples.filter(ripple => ripple.age + dtMs < ripple.maxAge)
      for (const ripple of ripples) ripple.age += dtMs
      animating = true
    }
    if (particles.size() > 0) animating = true
    if (f.render || animating) {
      renderColorMix(ctx, view())
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    renderColorMix(ctx, view())
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
    loop.resume()
  }

  restart(nextSeed())

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderColorMix(ctx, view())

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

export const colormixGame: MiniGameDefinition = {
  id: 'colormix',
  title: '调色大师 ColorMix',
  icon: '💧',
  description: '红黄蓝三原色调出目标色——滴数有限，色感就是解题力。',
  controls: [
    '点击 / 数字键 1·2·3：滴入红黄蓝',
    'U：撤回一滴 · 空格：提交 / 下一关',
    'R：重开 · P：暂停',
  ],
  create: createColorMixGame,
}
