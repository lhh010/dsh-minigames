/**
 * 字母矩阵 WordGrid 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 点击相邻字母（含对角）延长选词链，Enter 提交判定（隐藏词找出锁色、
 * 错误扣尝试）、Backspace 回退、H 揭示线索卡（每关 3 次逐级）、R 重开
 * （换 seed）、P 暂停；过关 Enter 进下一关，得分经 onScore 上报。脏标
 * 记渲染：静态局面零重绘，动画与消息期间逐帧。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  canExtend, createLevelState, LEVELS, nextLevelState, revealHint, submitChain,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, renderWordGrid, tileAt, tileCenter, type WordGridView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const TOAST_MS = 1500
const FLIP_MS = 420

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createWordGridGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: wordgrid needs a 2d canvas context')
  const ctx = initialFit.ctx

  let baseSeed = nextSeed()
  let state = createLevelState(0, baseSeed)
  let chain: number[] = []
  let userPaused = false
  let running = false
  let toast = ''
  let toastMs = 0
  let hintIndex = -1
  let hintAtMs = 0
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const show = (text: string): void => {
    toast = text
    toastMs = TOAST_MS
    loop.markDirty()
  }

  const restart = (): void => {
    baseSeed = nextSeed()
    state = createLevelState(0, baseSeed)
    chain = []
    userPaused = false
    toast = ''
    toastMs = 0
    hintIndex = -1
    reportScore()
    loop.markDirty()
  }

  const submit = (): void => {
    if (state.phase !== 'playing' || userPaused) return
    const result = submitChain(state, chain)
    if (result.kind === 'empty') return
    if (result.kind === 'invalid') {
      show('选词链断了：字母必须逐格相邻')
      return
    }
    if (result.kind === 'already') {
      show(result.word + ' 已经找出了')
      chain = []
      loop.markDirty()
      return
    }
    if (result.kind === 'wrong') {
      show(result.word === '' ? '空词不算' : result.word + ' 不是隐藏词（-1 尝试）')
      chain = []
      if ((state.phase as string) === 'failed') show('尝试用尽 · 按 R 重开')
      loop.markDirty()
      reportScore()
      return
    }
    // found：庆祝粒子从词首格喷出，链清空。
    const head = tileCenter(state.targets[result.index]!.cells[0]!)
    particles.burst(head.x, head.y, accent(result.index + 1), 16, 150)
    show('找出 ' + result.word + '（+' + result.gain + '）')
    chain = []
    reportScore()
    if (state.phase !== 'playing') {
      const text = state.phase === 'won' ? '全部通关！得分 ' + state.score : '关卡完成！Enter 下一关'
      show(text)
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, accent(2), 26, 190)
    }
    loop.markDirty()
  }

  const hint = (): void => {
    if (state.phase !== 'playing' || userPaused) return
    const idx = revealHint(state)
    if (idx < 0) {
      show(state.hintBudget <= 0 ? '提示次数用完' : '没有可揭示的线索了')
      return
    }
    hintIndex = idx
    hintAtMs = performance.now()
    show('线索 +1（剩 ' + state.hintBudget + ' 次）')
    loop.markDirty()
  }

  const nextLevel = (): void => {
    if (state.phase !== 'cleared') return
    state = nextLevelState(state)
    chain = []
    hintIndex = -1
    show(LEVELS[state.level]!.label + '：' + state.targets.length + ' 个隐藏词')
    reportScore()
    loop.markDirty()
  }

  const back = (): void => {
    if (chain.length === 0) return
    chain = chain.slice(0, chain.length - 1)
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (state.phase === 'playing') {
        userPaused = !userPaused
        loop.markDirty()
      }
      return
    }
    if (event.code === 'Enter') {
      event.preventDefault()
      if (state.phase === 'cleared') nextLevel()
      else submit()
      return
    }
    if (!running || userPaused || state.phase !== 'playing') return
    if (event.code === 'KeyH') {
      event.preventDefault()
      hint()
      return
    }
    if (event.code === 'Backspace') {
      event.preventDefault()
      back()
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || userPaused || state.phase !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const cell = tileAt(x, y)
    if (cell < 0) return
    if (chain.length > 0 && cell === chain[chain.length - 1]) {
      back()
      return
    }
    if (canExtend(chain, cell)) {
      chain = chain.concat([cell])
      loop.markDirty()
      return
    }
    // 不相邻也不可追加：从该格重新起链。
    chain = [cell]
    loop.markDirty()
  }

  const view = (): WordGridView => ({
    state,
    chain,
    hintIndex,
    hintAtMs,
    message: toast,
    paused: userPaused,
  })

  const paint = (now: number): void => {
    renderWordGrid(ctx, view(), now)
    particles.tick(ctx, 16)
  }

  // 脏标记渲染：消息、翻卡动画与粒子期间逐帧，静态局面零重绘。
  const loop = createFrameLoop(f => {
    const now = performance.now()
    const dtMs = f.dt * 1000
    toastMs = Math.max(0, toastMs - dtMs)
    if (toastMs === 0 && toast !== '') toast = ''
    const animating = toastMs > 0 || particles.size() > 0 || (hintIndex >= 0 && now - hintAtMs < FLIP_MS)
    if (f.render || animating) {
      paint(now)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    paint(performance.now())
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
  paint(performance.now())

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const wordgridGame: MiniGameDefinition = {
  id: 'wordgrid',
  title: '字母矩阵 WordGrid',
  icon: '🔡',
  description: '五乘五的字母格里藏着你没发现的词——交叉、共享、环环相扣。',
  controls: ['点击相邻字母（含对角）：拼词链', 'Enter：提交 · Backspace：回退一格', 'H：提示（每关 3 次，逐级揭示）', 'R：重开 · P：暂停'],
  create: createWordGridGame,
}
