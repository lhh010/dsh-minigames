/**
 * Mastermind 猜码游戏定义：把纯判定逻辑接成 {@link MiniGameInstance} ——
 * 调色盘点击与数字键 1–6 双输入，Backspace 删除、Enter 提交整行，
 * 胜负后空格/点击换新密码再来一局，R 用同一种子重打本局，
 * 连胜与关卡爬坡（赢升级、输回 L1）通过 onScore / LEVELS 呈现。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { judge, makeSecret, validRow, LEVELS } from './logic.ts'
import { renderMastermind, paletteAt, LOGICAL_W, LOGICAL_H, type MastermindView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'

const SHAKE_MS = 260
const TOAST_MS = 1300
const GRID_TOP = 44
const ROW_H = 42

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createMastermindGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: mastermind needs a 2d canvas context')
  const ctx = fit.ctx

  let levelIdx = 0
  let roundSeed = 0
  let secret: number[] = []
  let rows: Array<{ guess: number[]; black: number; white: number }> = []
  let current: number[] = []
  let status: 'playing' | 'won' | 'lost' = 'playing'
  let streak = 0
  let shakeMs = 0
  let toast = ''
  let toastMs = 0
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1
  const particles = createParticles()

  const level = (): (typeof LEVELS)[number] => LEVELS[levelIdx]!

  const newRound = (seed: number): void => {
    roundSeed = seed
    secret = makeSecret(roundSeed, level().pegs, level().colors)
    rows = []
    current = []
    status = 'playing'
    shakeMs = 0
    toast = ''
    toastMs = 0
  }

  const reportScore = (): void => {
    if (streak === lastScore) return
    lastScore = streak
    options?.onScore?.(streak)
  }

  /** 无效输入：抖动 + 短提示，不消耗行。 */
  const reject = (text: string): void => {
    shakeMs = SHAKE_MS
    toast = text
    toastMs = TOAST_MS
  }

  const submit = (): void => {
    if (!validRow(current, level().pegs)) {
      reject('未填满')
      return
    }
    const { black, white } = judge(current, secret)
    rows = [...rows, { guess: current, black, white }]
    if (black === level().pegs) {
      status = 'won'
      streak += 1
      // 赢了升级关卡（L3 封顶）。
      levelIdx = Math.min(levelIdx + 1, LEVELS.length - 1)
      reportScore()
      const rowY = GRID_TOP + (rows.length - 1) * ROW_H + ROW_H / 2
      particles.burst(LOGICAL_W / 2, rowY, accent(2), 26, 170)
    } else if (rows.length >= level().tries) {
      status = 'lost'
      // 输了回 L1，下一局从头爬坡。
      levelIdx = 0
    }
    current = []
  }

  /** 处理一次输入：色号 / 'ENTER' / 'BACK'。 */
  const inputKey = (key: number | 'ENTER' | 'BACK'): void => {
    if (status !== 'playing') return
    if (key === 'ENTER') {
      submit()
    } else if (key === 'BACK') {
      current = current.slice(0, -1)
    } else if (current.length < level().pegs) {
      current = [...current, key]
    }
  }

  const restart = (): void => {
    // 输了清零连胜；赢了保留并继续累积。
    if (status === 'lost' && streak !== 0) {
      streak = 0
      reportScore()
    }
    newRound(nextSeed())
  }

  const replay = (): void => {
    // R：同一种子同一关重打本局，连胜清零。
    streak = 0
    reportScore()
    newRound(roundSeed)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 浏览器快捷键（Ctrl/Cmd+R 等）不拦截。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space') {
      if (status !== 'playing') {
        event.preventDefault()
        restart()
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (running && status === 'playing') inputKey('ENTER')
      return
    }
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (running && status === 'playing') inputKey('BACK')
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      replay()
      return
    }
    if (/^[1-6]$/.test(event.key)) {
      event.preventDefault()
      if (running && status === 'playing') inputKey(Number(event.key) - 1)
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (status !== 'playing') {
      restart()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = paletteAt(x, y)
    if (hit !== null) inputKey(hit)
  }

  const view = (): MastermindView => ({
    level: level(), levelIdx, rows, current, status, secret, streak, toast, paused: !running,
  })

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(50, Math.max(0, now - last))
    last = now
    shakeMs = Math.max(0, shakeMs - dt)
    toastMs = Math.max(0, toastMs - dt)
    if (toastMs === 0) toast = ''
    const shakeDx = shakeMs > 0 ? Math.sin(shakeMs / 16) * 5 : 0
    renderMastermind(ctx, view(), shakeDx)
    particles.tick(ctx, dt)
  }

  const startLoop = (): void => {
    if (raf !== 0) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stopLoop = (): void => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const pause = (): void => {
    running = false
    stopLoop()
    renderMastermind(ctx, view())
  }
  const resume = (): void => {
    if (running) return
    running = true
    startLoop()
  }

  newRound(nextSeed())

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderMastermind(ctx, view())

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const mastermindGame: MiniGameDefinition = {
  id: 'mastermind',
  title: 'Mastermind 猜码',
  icon: '🎯',
  description: '破解彩色密码：绿点=颜色位置都对，黄点=颜色对位置不对，重复颜色可能出现。',
  controls: ['点击调色盘 / 数字键 1–6：填色', 'Enter：提交 · Backspace：删除', '空格 / 点击：再来一局 · R：同局重打'],
  create: createMastermindGame,
}
