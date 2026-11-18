/**
 * 词语接龙 WordChain 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 点击手牌卡或数字键 1-5 出词接龙、S/按钮跳过（送 AI 5 分）、R 重开
 * （换 seed）、P 暂停；十回合累计分经 onScore 上报。脏标记渲染：静态局
 * 面只在状态或动效变化时重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  chainTail, createMatch, finalResult, linkKind, playerPlay, playerSkip,
  type MatchState,
} from './logic.ts'
import { renderWordChain, cardAt, skipButtonAt, LOGICAL_W, LOGICAL_H, type WordChainView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const TOAST_MS = 1300
const SCROLL_CENTER_Y = 136

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createWordChainGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: wordchain needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: MatchState = createMatch(nextSeed())
  let userPaused = false
  let running = false
  let toast = ''
  let toastMs = 0
  let aiLine = ''
  let aiAtMs = 0
  let lastScore = -1
  let lastRestarts = 0
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.playerScore === lastScore) return
    lastScore = state.playerScore
    options?.onScore?.(state.playerScore)
  }

  const show = (text: string): void => {
    toast = text
    toastMs = TOAST_MS
    loop.markDirty()
  }

  const describeAi = (): void => {
    const move = state.aiLastMove
    if (move === null) return
    if (move.type === 'play' && move.entry !== undefined) {
      const tag = move.kind === 'exact' ? '同字接' : '同音接'
      aiLine = 'AI：' + move.entry.word + '（' + tag + ' +' + move.gain + '）'
    } else {
      aiLine = 'AI：跳过'
    }
    aiAtMs = performance.now()
    if (state.restarts > lastRestarts) {
      lastRestarts = state.restarts
      show('双方都跳过，重新起头并换牌')
    }
  }

  const afterAction = (): void => {
    describeAi()
    reportScore()
    loop.markDirty()
    if (state.phase === 'over') {
      const r = finalResult(state)
      const color = r === 'player' ? accent(2) : r === 'ai' ? accent(4) : accent(0)
      particles.burst(LOGICAL_W / 2, SCROLL_CENTER_Y, color, 22, 160)
    }
  }

  const play = (handIndex: number): void => {
    if (state.phase !== 'playing' || userPaused) return
    if (handIndex < 0 || handIndex >= state.hand.length) return
    const kind = linkKind(chainTail(state), state.hand[handIndex]!)
    const result = playerPlay(state, handIndex)
    if (!result.ok) {
      show(kind === null ? '这张接不上' : '不可出')
      return
    }
    if (result.kind === 'exact') {
      particles.burst(LOGICAL_W / 2, SCROLL_CENTER_Y, accent(2), 14, 140)
    } else {
      particles.burst(LOGICAL_W / 2, SCROLL_CENTER_Y, accent(3), 8, 110)
    }
    afterAction()
  }

  const skip = (): void => {
    if (state.phase !== 'playing' || userPaused) return
    playerSkip(state)
    show('跳过，AI +5')
    afterAction()
  }

  const restart = (): void => {
    state = createMatch(nextSeed())
    userPaused = false
    toast = ''
    toastMs = 0
    aiLine = ''
    lastRestarts = 0
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 浏览器快捷键（Ctrl/Cmd+R 等）不拦截。
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
    if (!running || userPaused || state.phase !== 'playing') return
    if (event.code === 'KeyS') {
      event.preventDefault()
      skip()
      return
    }
    if (/^[1-5]$/.test(event.key)) {
      event.preventDefault()
      play(Number(event.key) - 1)
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (state.phase === 'over') {
      restart()
      return
    }
    if (userPaused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const card = cardAt(x, y)
    if (card !== null && card < state.hand.length) {
      play(card)
      return
    }
    if (skipButtonAt(x, y)) skip()
  }

  const view = (): WordChainView => {
    const tail = chainTail(state)
    return {
      round: Math.min(state.round, 10),
      chainLen: state.chain.length,
      tailWord: state.phase === 'over' ? '' : tail.word,
      tailPy: tail.tailPy,
      history: state.chain.slice(0, -1).map(e => e.word),
      hand: state.hand.map(e => e.word),
      handTailPy: state.hand.map(e => e.tailPy),
      playable: state.hand.map(c => linkKind(tail, c)),
      playerScore: state.playerScore,
      aiScore: state.aiScore,
      aiLine,
      aiAtMs,
      toast,
      phase: state.phase,
      userPaused,
      paused: !running,
    }
  }

  // 脏标记渲染：局面静态时零重绘；toast/AI 滑入/粒子期间每帧标脏。
  const loop = createFrameLoop(f => {
    const now = performance.now()
    const dtMs = f.dt * 1000
    toastMs = Math.max(0, toastMs - dtMs)
    if (toastMs === 0) toast = ''
    if (aiLine !== '' && now - aiAtMs > 3200) aiLine = ''
    const animating = toastMs > 0 || particles.size() > 0 || aiLine !== ''
    if (f.render || animating) {
      renderWordChain(ctx, view(), now)
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    renderWordChain(ctx, view(), performance.now())
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
  renderWordChain(ctx, view(), performance.now())

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

export const wordchainGame: MiniGameDefinition = {
  id: 'wordchain',
  title: '词语接龙 WordChain',
  icon: '🗣',
  description: '上家说「苹果」下家就得「果树」——词库有限，脑洞无限。',
  controls: ['点击手牌 / 数字键 1-5：出词接龙', 'S / 点击按钮：跳过（AI +5）', 'R：重开 · P：暂停'],
  create: createWordChainGame,
}
