/**
 * 24点游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点牌选两张
 * （再点取消），点 + − × ÷ 按钮或运算小键盘合并；U 撤回（快照栈）、
 * H 提示闪一步正确操作并自动选牌（本局奖励降为 25 分）、N 换一局
 * （无解跳局扣 20 分并清零连胜，获胜后进入下一局不扣）、R 重开、
 * P 暂停。回合制 dirty 帧循环：仅输入、提示闪烁与粒子期间重绘；
 * 分数变化经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  OP_SYMBOL,
  applyOperation,
  changeDeal,
  createGame24,
  selectCard,
  undo,
  useHint,
  type Game24State,
  type Op,
} from './logic.ts'
import { H, W, hitAction, hitCard, hitOp, renderGame24 } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { THEME, createParticles } from '../theme.ts'

/** 初始种子（R 重开时按重开次数偏移换新牌）。 */
const BASE_SEED = 20261108
/** 提示高亮闪烁秒数。 */
const HINT_FLASH_S = 2.6

function createGame24Game(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: game24 needs a 2d canvas context')
  const ctx = fit.ctx

  let gameNo = 0
  let state: Game24State = createGame24(BASE_SEED)
  let running = false
  let paused = false
  let lastScore = -1
  let prevStatus: Game24State['status'] = state.status
  /** 提示闪现剩余秒数。 */
  let hintFlash = 0
  let hintText = ''
  let hintIds: number[] = []
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** 获胜侦测：粒子庆祝 + 分数上报。 */
  const detectWin = (): void => {
    if (state.status === 'won' && prevStatus !== 'won') {
      particles.burst(W / 2, 268, THEME.good, 18, 160)
      particles.burst(W / 2, 268, THEME.gold, 10, 120)
    }
    prevStatus = state.status
    reportScore()
  }

  /** 动画推进（每帧调用）：提示闪烁、粒子。 */
  const tickAnimations = (dt: number): boolean => {
    let animating = false
    if (hintFlash > 0) {
      hintFlash = Math.max(0, hintFlash - dt)
      animating = true
    }
    if (particles.size() > 0) animating = true
    return animating
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const animating = tickAnimations(f.dt)
    if (f.render || animating) {
      renderGame24(ctx, { state, paused: false, hintFlash, hintIds, hintText })
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  /** 统一的输入出口：执行动作后立即侦测获胜并置脏。 */
  const act = (fn: () => void): void => {
    if (!running || paused) return
    fn()
    detectWin()
    loop.markDirty()
  }

  const doUndo = (): void => { undo(state) }

  const doHint = (): void => {
    const step = useHint(state)
    if (step === null) return
    hintText = String(step.a) + ' ' + OP_SYMBOL[step.op] + ' ' + String(step.b)
    hintFlash = HINT_FLASH_S
    const ai = state.cards.findIndex(c => c.value === step.a)
    const bi = state.cards.findIndex((c, i) => i !== ai && c.value === step.b)
    hintIds = []
    if (ai >= 0) hintIds.push(state.cards[ai]!.id)
    if (bi >= 0) hintIds.push(state.cards[bi]!.id)
    // 自动选好两张牌（先 a 后 b，顺序对 − 与 ÷ 生效），玩家只差点运算符。
    if (ai >= 0 && bi >= 0) state.selected = [ai, bi]
  }

  const doOp = (op: Op): void => { applyOperation(state, op) }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (!running || paused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    const card = hitCard(state.cards, x, y)
    if (card >= 0) {
      act(() => { selectCard(state, card) })
      return
    }
    const op = hitOp(x, y)
    if (op !== null) {
      act(() => { doOp(op) })
      return
    }
    const a = hitAction(x, y)
    if (a === 'undo') act(doUndo)
    else if (a === 'hint') act(doHint)
    else if (a === 'new') act(() => { changeDeal(state) })
  }

  const reset = (): void => {
    gameNo += 1
    state = createGame24((BASE_SEED + gameNo * 0x9e3779b9) >>> 0)
    prevStatus = state.status
    hintFlash = 0
    hintText = ''
    hintIds = []
    paused = false
    reportScore()
    loop.markDirty()
    renderGame24(ctx, { state, paused: false, hintFlash: 0, hintIds, hintText: '' })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    let numpadOp: Op | null = null
    switch (event.code) {
      case 'NumpadAdd': numpadOp = '+'; break
      case 'NumpadSubtract': numpadOp = '-'; break
      case 'NumpadMultiply': numpadOp = '*'; break
      case 'NumpadDivide': numpadOp = '/'; break
    }
    if (numpadOp !== null) {
      event.preventDefault()
      act(() => { doOp(numpadOp!) })
      return
    }
    switch (event.code) {
      case 'KeyU':
        event.preventDefault()
        act(doUndo)
        break
      case 'KeyH':
        event.preventDefault()
        act(doHint)
        break
      case 'KeyN':
        event.preventDefault()
        act(() => { changeDeal(state) })
        break
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
  }

  const pause = (): void => {
    if (!running) return
    paused = true
    running = false
    loop.pause()
    renderGame24(ctx, { state, paused: true, hintFlash, hintIds, hintText })
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.markDirty()
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  reportScore()
  loop.start()
  renderGame24(ctx, { state, paused: false, hintFlash: 0, hintIds, hintText: '' })

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const game24Game: MiniGameDefinition = {
  id: 'game24',
  title: '24点 24 Game',
  icon: '🔢',
  description: '四张牌加减乘除凑 24——中式经典算术谜题，考验心速与构造力。',
  controls: [
    '点牌选两张（再点取消）· 点 + − × ÷ 或按运算小键盘合并 · U：撤回',
    'H：提示一步（自动选牌，本局奖励降为 25 分）· N：换一局（无解扣 20 分）',
    'R：重开 · P：暂停',
  ],
  create: createGame24Game,
}
