/**
 * Wordle 猜词游戏定义：把纯判定逻辑接成 {@link MiniGameInstance} ——
 * 物理 A–Z/Enter/Backspace 与屏幕键盘点击双输入，无效猜测抖动提示且
 * 不消耗行，胜负后空格/点击换新词再来一局，连胜通过 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { judge, mergeKeyHints, isValidGuess, pickAnswer, type KeyHints, type LetterVerdict } from './logic.ts'
import { ANSWERS, EXTRA_GUESSES } from './words.ts'
import { renderWordle, keyAt, LOGICAL_W, LOGICAL_H, type WordleView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'

const SHAKE_MS = 260
const TOAST_MS = 1300

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createWordleGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: wordle needs a 2d canvas context')
  const ctx = fit.ctx

  let answer = ''
  let rows: Array<{ guess: string; verdicts: LetterVerdict[] }> = []
  let current = ''
  let keyHints: KeyHints = {}
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

  const newRound = (): void => {
    answer = pickAnswer(nextSeed())
    rows = []
    current = ''
    keyHints = {}
    status = 'playing'
    shakeMs = 0
    toast = ''
    toastMs = 0
  }
  newRound()

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
    if (current.length < 5) {
      reject('不足 5 个字母')
      return
    }
    if (!isValidGuess(current, ANSWERS, EXTRA_GUESSES)) {
      reject('不在词表')
      return
    }
    const verdicts = judge(current, answer)
    keyHints = mergeKeyHints(keyHints, current, verdicts)
    rows = [...rows, { guess: current, verdicts }]
    if (verdicts.every(v => v === 'green')) {
      status = 'won'
      streak += 1
      reportScore()
      // 最后一行中央喷粒子庆祝。
      const rowY = 48 + (rows.length - 1) * (56 + 8) + 28
      particles.burst(LOGICAL_W / 2, rowY, accent(2), 26, 170)
    } else if (rows.length >= 6) {
      status = 'lost'
    }
    current = ''
  }

  /** 处理一次按键：字母 / 'ENTER' / 'BACK'。 */
  const inputKey = (key: string): void => {
    if (status !== 'playing') return
    if (key === 'ENTER') {
      submit()
    } else if (key === 'BACK') {
      current = current.slice(0, -1)
    } else if (/^[A-Z]$/.test(key) && current.length < 5) {
      current += key
    }
  }

  const restart = (): void => {
    // 输了清零连胜；赢了保留并继续累积。
    if (status === 'lost' && streak !== 0) {
      streak = 0
      reportScore()
    }
    newRound()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 浏览器快捷键（Ctrl/Cmd+R 等）不拦截。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const letter = /^[a-zA-Z]$/.test(event.key) ? event.key.toUpperCase() : null
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
      streak = 0
      reportScore()
      newRound()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (letter !== null) {
      event.preventDefault()
      if (running && status === 'playing') inputKey(letter)
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
    const key = keyAt(x, y)
    if (key !== null) inputKey(key)
  }

  const view = (): WordleView => ({
    rows, current, keyHints, status, answer, streak, toast, paused: !running,
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
    renderWordle(ctx, view(), shakeDx)
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
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    stopLoop()
    renderWordle(ctx, view())
  }
  const resume = (): void => {
    if (running) return
    running = true
    startLoop()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderWordle(ctx, view())

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

export const wordleGame: MiniGameDefinition = {
  id: 'wordle',
  title: 'Wordle 猜词',
  icon: '🔤',
  description: '6 次机会猜出 5 字母英文单词，绿=位置对，黄=字母对，灰=没有。',
  controls: ['键盘 / 点击屏幕键盘：输入', 'Enter：提交 · Backspace：删除', '空格 / 点击：再来一局', 'R：重开 · P：暂停'],
  create: createWordleGame,
}
