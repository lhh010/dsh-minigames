/**
 * Wordle 猜词游戏定义：把纯判定逻辑接成 {@link MiniGameInstance} ——
 * 物理 A–Z/Enter/Backspace 与屏幕键盘点击双输入，任意等长纯字母词均合法，
 * 无效输入抖动提示且不消耗行；关卡按 4/5/6 字母循环推进，连胜通过 onScore 上报。
 * 关卡进度经共享 level-progress 助手持久化，重进从最高关继续；P 暂停 / 继续。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { judge, mergeKeyHints, isValidGuess, pickAnswer, type KeyHints, type LetterVerdict } from './logic.ts'
import { renderWordle, keyAt, LOGICAL_W, LOGICAL_H, type WordleView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const SHAKE_MS = 260
const TOAST_MS = 1300

/** 关卡循环：L1=4 字母/6 次，L2=5 字母/6 次，L3=6 字母/7 次，L4 起循环。 */
const LEVEL_CYCLE: Array<{ len: number; tries: number }> = [
  { len: 4, tries: 6 },
  { len: 5, tries: 6 },
  { len: 6, tries: 7 },
]

/** 关卡（1 起）对应的词长与机会数。 */
function levelConfig(level: number): { len: number; tries: number } {
  return LEVEL_CYCLE[(level - 1) % LEVEL_CYCLE.length]!
}

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

  let level = readLevel('wordle')
  let { len, tries } = levelConfig(level)
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
  let lastScore = -1
  const particles = createParticles()

  const newRound = (): void => {
    ({ len, tries } = levelConfig(level))
    answer = pickAnswer(nextSeed(), len)
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
    loop.markDirty()
  }

  const submit = (): void => {
    if (current.length < len) {
      reject(`不足 ${len} 个字母`)
      return
    }
    if (!isValidGuess(current, len)) {
      reject('仅限 A–Z 字母')
      return
    }
    const verdicts = judge(current, answer)
    keyHints = mergeKeyHints(keyHints, current, verdicts)
    rows = [...rows, { guess: current, verdicts }]
    if (verdicts.every(v => v === 'green')) {
      status = 'won'
      streak += 1
      level += 1
      saveLevel('wordle', level)
      reportScore()
      // 最后一行中央喷粒子庆祝。
      const rowY = 48 + (rows.length - 1) * (56 + 8) + 28
      particles.burst(LOGICAL_W / 2, rowY, accent(2), 26, 170)
    } else if (rows.length >= tries) {
      status = 'lost'
      level = 1
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
    } else if (/^[A-Z]$/.test(key) && current.length < len) {
      current += key
    } else {
      return
    }
    loop.markDirty()
  }

  const restart = (): void => {
    // 输了清零连胜并回到第 1 关；赢了保留连胜并进入下一关。
    if (status === 'lost' && streak !== 0) {
      streak = 0
      reportScore()
    }
    newRound()
    loop.markDirty()
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
      // 重开本关：当前关卡重新开局，关卡与连胜保持，不回第 1 关。
      newRound()
      loop.markDirty()
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
    rows, current, keyHints, status, answer, len, tries, level, streak, toast, paused: !running,
  })

  // 脏标记渲染：静态盘面只在状态或动效变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    shakeMs = Math.max(0, shakeMs - dtMs)
    toastMs = Math.max(0, toastMs - dtMs)
    if (toastMs === 0) toast = ''
    const animating = shakeMs > 0 || toastMs > 0 || particles.size() > 0
    if (f.render || animating) {
      const shakeDx = shakeMs > 0 ? Math.sin(shakeMs / 16) * 5 : 0
      renderWordle(ctx, view(), shakeDx)
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    loop.pause()
    renderWordle(ctx, view())
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderWordle(ctx, view())

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

export const wordleGame: MiniGameDefinition = {
  id: 'wordle',
  title: 'Wordle 猜词',
  icon: '🔤',
  description: '按关卡猜 4/5/6 字母单词，任意等长字母词都可提交，绿=位置对，黄=字母对，灰=没有。',
  controls: ['键盘 / 点击屏幕键盘：输入', 'Enter：提交 · Backspace：删除', '空格 / 点击：再来一局', 'R：重开本关 · P：暂停'],
  create: createWordleGame,
}
