/**
 * 成语接龙 IdiomChain 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 点击候选卡片或数字键 1-6 出牌接龙、S/按钮跳过（送 AI 得分）、每回合
 * 20 秒倒计时计分递减、超时自动跳过；R 重开（换 seed）、P 暂停；五局
 * 累计分经 onScore 上报。脏标记渲染：静态局面只在状态或动效变化时重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  TURN_MS, chainTail, createMatch, linkKind, playerPlay, playerSkip,
  playableIndices, finalResult, type MatchState,
} from './logic.ts'
import { renderIdiomChain, cardAt, skipButtonAt, LOGICAL_W, LOGICAL_H, type IdiomChainView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const TOAST_MS = 1300

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createIdiomChainGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: idiomchain needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: MatchState = createMatch(nextSeed())
  let userPaused = false
  let running = false
  let elapsedMs = 0
  let toast = ''
  let toastMs = 0
  let aiLine = ''
  let aiAtMs = 0
  let lastScore = -1
  const particles = createParticles()

  const remaining = (): number => Math.max(0, TURN_MS - elapsedMs)

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

  const showAi = (line: string): void => {
    aiLine = line
    aiAtMs = performance.now()
  }

  const describeAi = (): void => {
    const move = state.aiLastMove
    if (move === null) return
    if (move.type === 'play' && move.entry !== undefined) {
      const tag = move.kind === 'exact' ? '正接' : '同音接'
      showAi('AI：' + move.entry.idiom + '（' + tag + ' +' + move.gain + '）')
    } else {
      showAi('AI：跳过')
    }
    if (state.restarts > lastRestarts) {
      lastRestarts = state.restarts
      show('双方无牌可接，重新起头')
    }
  }
  let lastRestarts = 0

  const afterAction = (): void => {
    describeAi()
    elapsedMs = 0
    reportScore()
    loop.markDirty()
    if (state.phase === 'over') {
      const r = finalResult(state)
      const color = r === 'player' ? accent(2) : r === 'ai' ? accent(4) : accent(0)
      particles.burst(LOGICAL_W / 2, 110, color, 22, 160)
    }
  }

  const play = (handIndex: number): void => {
    if (state.phase !== 'playing' || userPaused) return
    if (handIndex < 0 || handIndex >= state.hand.length) return
    const kind = linkKind(chainTail(state), state.hand[handIndex]!)
    const result = playerPlay(state, handIndex, remaining())
    if (!result.ok) {
      show(kind === null ? '这张接不上' : '不可出')
      return
    }
    if (result.kind === 'exact') {
      particles.burst(LOGICAL_W / 2, IDIOM_CENTER_Y, accent(2), 14, 140)
    } else {
      particles.burst(LOGICAL_W / 2, IDIOM_CENTER_Y, accent(3), 8, 110)
    }
    afterAction()
  }
  const IDIOM_CENTER_Y = 112

  const skip = (auto: boolean): void => {
    if (state.phase !== 'playing' || userPaused) return
    playerSkip(state)
    if (!auto) show('跳过，AI +5')
    else show('超时，AI +5')
    afterAction()
  }

  const restart = (): void => {
    state = createMatch(nextSeed())
    userPaused = false
    elapsedMs = 0
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
      skip(false)
      return
    }
    if (/^[1-6]$/.test(event.key)) {
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
    if (card !== null) {
      play(card)
      return
    }
    if (skipButtonAt(x, y)) skip(false)
  }

  const view = (): IdiomChainView => ({
    round: state.round,
    chainLen: state.chain.length,
    tail: chainTail(state),
    hand: state.hand,
    playable: state.hand.map(c => linkKind(chainTail(state), c)),
    playerScore: state.playerScore,
    aiScore: state.aiScore,
    remainingMs: remaining(),
    aiLine,
    aiAtMs,
    toast,
    phase: state.phase,
    userPaused,
    paused: !running,
  })

  // 脏标记渲染：局面静态时零重绘；倒计时/动效期间每帧标脏（见下）。
  const loop = createFrameLoop(f => {
    const now = performance.now()
    const dtMs = f.dt * 1000
    toastMs = Math.max(0, toastMs - dtMs)
    if (toastMs === 0) toast = ''
    if (aiLine !== '' && now - aiAtMs > 3200) aiLine = ''
    if (state.phase === 'playing' && running && !userPaused) {
      elapsedMs += dtMs
      if (elapsedMs >= TURN_MS) skip(true)
    }
    const animating = toastMs > 0 || particles.size() > 0 || aiLine !== '' || state.phase === 'playing'
    if (f.render || animating) {
      renderIdiomChain(ctx, view(), now)
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    renderIdiomChain(ctx, view(), performance.now())
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
  renderIdiomChain(ctx, view(), performance.now())

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

export const idiomchainGame: MiniGameDefinition = {
  id: 'idiomchain',
  title: '成语接龙 IdiomChain',
  icon: '📖',
  description: '首尾字相扣的成语链条——你的词汇量就是你的武器。',
  controls: ['点击候选 / 数字键 1-6：出牌接龙', 'S / 点击按钮：跳过（AI +5）', '每回合 20s，出手越快得分越高', 'R：重开 · P：暂停'],
  create: createIdiomChainGame,
}
