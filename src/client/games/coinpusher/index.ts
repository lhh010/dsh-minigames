/**
 * 推金币 Coin Pusher game definition：把确定性物理逻辑接成
 * {@link MiniGameInstance}——←/→ 移动瞄准列，空格或点击投币；R 重开一局
 * （新种子），P 暂停。continuous 帧循环：logic.step 按 f.dt 推进（内部
 * 固定子步），f.render 时整帧重绘；结算事件在掉落点触发粒子与浮字，
 * 分数变化时经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  DROP_COLS, DROP_X0, colX, createGame, dropCoin, moveAim, step,
  type CoinPusherEvent, type CoinPusherState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, createFloaters, renderCoinPusher } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const GAME_ID = 'coinpusher'

function createCoinPusherGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: coinpusher needs a 2d canvas context')
  const ctx = fit.ctx

  // 每局一个种子：投币类型序列确定，重开换一局新种子。
  let runCounter = 0
  let state: CoinPusherState = createGame((Date.now() ^ 0xc01ecd) >>> 0)
  let running = false
  let lastScore = -1
  const particles = createParticles()
  const floaters = createFloaters()
  const typeColor: Record<string, string> = {
    normal: '#cf8a5b', silver: '#cfd0dc', gold: THEME.gold, bonus: THEME.bad,
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const handleEvent = (ev: CoinPusherEvent): void => {
    if (ev.kind === 'score') {
      particles.burst(ev.x, Math.min(ev.y, LOGICAL_H - 30), typeColor[ev.type] ?? THEME.gold, 8, 150)
      floaters.add(ev.x, Math.min(ev.y, LOGICAL_H - 30), '+' + ev.points, typeColor[ev.type] ?? THEME.gold)
    } else if (ev.kind === 'quake') {
      particles.burst(LOGICAL_W / 2, 300, THEME.bad, 18, 220)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step(state, f.dt)
    for (const ev of state.events) handleEvent(ev)
    state.events.length = 0
    reportScore()
    if (f.render) {
      renderCoinPusher(ctx, { state, paused: false, floaters })
      particles.tick(ctx, f.dt * 1000)
    }
  }
  const loop = createFrameLoop(frame)

  const restart = (): void => {
    runCounter += 1
    state = createGame(((Date.now() ^ 0xc01ecd) + runCounter * 0x9e3779b9) >>> 0)
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const tryDrop = (): void => {
    if (state.result !== 'playing') return
    dropCoin(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'Space' || k === 'ArrowLeft' || k === 'ArrowRight') event.preventDefault()
    if (event.repeat) return
    if (k === 'ArrowLeft') moveAim(state, -1)
    else if (k === 'ArrowRight') moveAim(state, 1)
    else if (k === 'Space') tryDrop()
    else if (k === 'KeyR') restart()
    else if (k === 'KeyP' || k === 'Escape') togglePauseLocal()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.result !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const gap = (colX(DROP_COLS - 1) - DROP_X0) / (DROP_COLS - 1)
    state.aimCol = Math.max(0, Math.min(DROP_COLS - 1, Math.round((x - DROP_X0) / gap)))
    dropCoin(state)
  }

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderCoinPusher(ctx, { state, paused: true, floaters })
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }
  const togglePauseLocal = (): void => {
    if (running) pause()
    else resume()
  }

  window.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('mousedown', onMouseDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('mousedown', onMouseDown)
      fit.dispose()
    },
  }
}

export const coinpusherGame: MiniGameDefinition = {
  id: 'coinpusher',
  title: '推金币 Coin Pusher',
  icon: '🪙',
  description: '游艺厅推币机：投币推向币墙，掉落的金币与奖励归你——但小心推空。',
  controls: [
    '← → 瞄准列 · 空格 / 点击投币',
    '掉落台沿结算：铜 +1 · 银 +5 · 金 +20 · ★ 奖励触发大堆倾倒',
    'R：重开 · P：暂停',
  ],
  create: createCoinPusherGame,
}
