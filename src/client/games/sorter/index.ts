/**
 * 传送带分拣游戏定义：把纯逻辑接成 {@link MiniGameInstance}——色键
 * 1-4 把三条带的分流挡板一次性切到对应颜色（下一帧生效），continuous
 * 帧循环推进模拟与渲染，R 重开（换局号）、P 暂停，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createSorter, stepSorter, W, H, type SorterState, type SorterInput } from './logic.ts'
import { renderSorter } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createSorterGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: sorter needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: SorterState = createSorter(seed, round)
  let running = false
  let lastScore = -1

  // 待应用的挡板颜色：色键按下后缓存，下一帧作为输入传给逻辑层。
  let pendingFlap: 0 | 1 | 2 | 3 | null = null

  const flapFor = (code: string): 0 | 1 | 2 | 3 | null => {
    if (code === 'Digit1' || code === 'Numpad1') return 0
    if (code === 'Digit2' || code === 'Numpad2') return 1
    if (code === 'Digit3' || code === 'Numpad3') return 2
    if (code === 'Digit4' || code === 'Numpad4') return 3
    return null
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const flap = flapFor(event.code)
    if (flap !== null) {
      event.preventDefault()
      pendingFlap = flap
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      reset()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const input: SorterInput = { flap: pendingFlap }
    pendingFlap = null
    stepSorter(state, f.dt * 1000, input)
    reportScore()
    if (f.render) renderSorter(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createSorter(seed, round)
    lastScore = -1
    pendingFlap = null
    loop.markDirty()
    renderSorter(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderSorter(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderSorter(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const sorterGame: MiniGameDefinition = {
  id: 'sorter',
  title: '传送带分拣 Sorter',
  icon: '📮',
  description: '彩色包裹源源滚来，按颜色及时分流——手速与准确率的双重考验。',
  controls: [
    '1-4：把三条带的分流挡板切到对应颜色（包裹到带尾时挡板须同色）',
    '分拣成功 +2 起 · 连击加成 · 挡板错色包裹坠出记 1 次失误（共 3 次）',
    'R：重开 · P：暂停',
  ],
  create: createSorterGame,
}
