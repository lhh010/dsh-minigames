/**
 * 气球银行 game definition：空格打气（潜在奖金翻倍，可能触发隐藏爆
 * 点）、Enter 兑现入银行、R 重开（新 seed）、P 暂停。打气中的气球有
 * 常驻形变动画，打气/粒子期间逐帧重绘，静止棋盘态走 dirty 按需渲染。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { W, H, createBalloonBank, pump, cash, beginLevel } from './logic.ts'
import { createBalloonBankRenderer } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 挂载计数：与时间戳混合派生每局互不相同的 seed。 */
let mountCounter = 0

function createBalloonBankGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: balloonbank needs a 2d canvas context')
  const ctx = initialFit.ctx

  mountCounter += 1
  const seed = (Date.now() ^ Math.imul(mountCounter, 2654435761)) >>> 0
  const state = createBalloonBank(seed)
  const renderer = createBalloonBankRenderer(ctx)
  let paused = false
  let lastScore = -1

  const reportScore = (score: number): void => {
    if (score !== lastScore) {
      lastScore = score
      options?.onScore?.(score)
    }
  }

  const restart = (): void => {
    Object.assign(state, createBalloonBank((seed + Math.imul(mountCounter, 40503)) >>> 0))
    lastScore = -1
    paused = false
    loop.markDirty()
    loop.resume()
  }

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderer.frame(state, true, 0)
  }
  const resume = (): void => {
    if (!paused) return
    paused = false
    loop.markDirty()
    loop.resume()
  }
  const togglePause = (): void => {
    if (paused) resume()
    else pause()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space') {
      event.preventDefault()
      if (!event.repeat && !paused) pump(state)
    } else if (event.code === 'Enter') {
      event.preventDefault()
      if (!paused) {
        if (state.phase === 'levelup') beginLevel(state)
        else cash(state)
      }
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
    if (event.code === 'Space' || event.code === 'Enter') loop.markDirty()
  }

  window.addEventListener('keydown', onKeyDown)

  const loop = createFrameLoop(f => {
    const animating = !paused && (state.phase === 'pumping' || state.phase === 'review' || state.phase === 'levelup' || renderer.busy())
    if (!paused) {
      for (const ev of state.events) {
        if (ev.type === 'cash' || ev.type === 'levelFail' || ev.type === 'runComplete') reportScore(ev.bank)
      }
    }
    if (f.render || animating) {
      renderer.frame(state, paused, f.dt * 1000)
      state.events.length = 0
    }
  }, { mode: 'dirty' })

  focusGameHost(host)
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      window.removeEventListener('keydown', onKeyDown)
      initialFit.dispose()
    },
  }
}

export const balloonbankGame: MiniGameDefinition = {
  id: 'balloonbank',
  title: '气球银行 BalloonBank',
  icon: '🏦',
  description: '每打一下分越多炸得越近——见好就收还是再打一把？',
  controls: [
    '空格：打气（潜在奖金每次翻倍 10→20→40…，隐藏爆点在第 4-12 次之间，越往后轮次与关卡越低）',
    'Enter：兑现，把当前潜在奖金存入银行；打气到爆点=本轮 0 分',
    '10 轮一关，关末银行 ≥ 目标过关（共 5 关，目标递增）；第 5 关通关=胜利，中途未达标=整局失败',
    '右栏历史气压计记录每轮爆点/兑现；轮末面板复盘「再打一次」期望值与理论最大值',
    '易误解：兑现必须按 Enter（空格在轮末是继续下一轮）；爆掉的只是本轮奖金，银行余额不清零',
  ],
  create: createBalloonBankGame,
}
