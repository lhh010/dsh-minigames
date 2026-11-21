/**
 * 剪绳喂糖 game definition：点击或划线剪断绳索（线段与绳折线求交，
 * 一次剪一根，关卡限剪次数），点击气泡可戳破；糖果入怪物嘴过关，
 * 碰尖刺/出界/气泡飞顶/限剪用尽未喂到则扣命重来（3 命）。空格过关
 * 进下一关，R 重开本关（命尽则回到第 1 关重置 3 命），[ ] 切换已解锁
 * 关卡，P 暂停。粒子消费 cut/star/shatter/win 等事件；记录糖果轨迹
 * 拖尾与剪刀划线。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  H, LEVELS, W, createCutRope, cutRopeAt, popBubbleAt, stepCutRope,
} from './logic.ts'
import { renderCutRope } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createCutRopeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: cutrope needs a 2d canvas context')
  const fit = initialFit
  const ctx = fit.ctx

  let level = Math.min(Math.max(readLevel('cutrope'), 1), LEVELS.length)
  let lives = 3
  let seed = 1
  let state = createCutRope(seed, level, lives)
  let paused = false
  let lastScore = -1
  let lastLevelCleared = -1
  let animMs = 0
  let trail: { x: number, y: number }[] = []
  let swipe: { x1: number, y1: number, x2: number, y2: number } | null = null
  const particles = createParticles()

  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * W) / rect.width,
      y: ((event.clientY - rect.top) * H) / rect.height,
    }
  }

  const reportScore = (): void => {
    const got = state.stars.filter(s => s.got).length
    const total = state.phase === 'won' ? (state.level - 1) * 300 + got * 100 + 50 : (state.level - 1) * 300
    if (total !== lastScore) {
      lastScore = total
      options?.onScore?.(total)
    }
  }

  const startLevel = (lv: number, resetLives = false): void => {
    level = Math.min(Math.max(lv, 1), LEVELS.length)
    if (resetLives) lives = 3
    seed += 1
    state = createCutRope(seed, level, lives)
    trail = []
    swipe = null
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (paused || state.phase !== 'play') return
    const p = toLogical(event)
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    // 先试气泡：点在气泡上直接戳破，不进入划线。
    if (popBubbleAt(state, p.x, p.y)) {
      loop.markDirty()
      return
    }
    swipe = { x1: p.x, y1: p.y, x2: p.x, y2: p.y }
    loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (swipe === null) return
    const p = toLogical(event)
    swipe.x2 = p.x
    swipe.y2 = p.y
    loop.markDirty()
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (swipe === null) return
    const p = toLogical(event)
    const s = swipe
    swipe = null
    const len = Math.hypot(p.x - s.x1, p.y - s.y1)
    if (len < 6) {
      // 单击：以点击为中心的小剪刀段。
      cutRopeAt(state, p.x - 5, p.y - 5, p.x + 5, p.y + 5)
    } else {
      cutRopeAt(state, s.x1, s.y1, p.x, p.y)
    }
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (state.phase === 'lost' && state.lives <= 0) startLevel(1, true)
      else startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      const max = Math.min(readLevel('cutrope'), LEVELS.length)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 1 && next <= Math.max(1, max)) startLevel(next)
    } else if (event.code === 'Space' || event.code === 'Enter') {
      if (state.phase === 'won') {
        event.preventDefault()
        if (level !== lastLevelCleared) {
          lastLevelCleared = level
          saveLevel('cutrope', level + 1)
        }
        if (level < LEVELS.length) startLevel(level + 1)
        else startLevel(level, true)
        reportScore()
      }
    }
  }

  const loop = createFrameLoop(f => {
    if (!paused) {
      animMs += f.dt * 1000
      if (state.phase === 'play') {
        stepCutRope(state, f.dt * 1000)
        // 轨迹拖尾：只在糖果明显移动时记录。
        const lastP = trail.length === 0 ? null : trail[trail.length - 1]!
        if (trail.length < 120 && (lastP === null || Math.hypot(state.candy.x - lastP.x, state.candy.y - lastP.y) > 4)) {
          trail.push({ x: state.candy.x, y: state.candy.y })
        }
        // 事件 → 粒子。
        for (const ev of state.events) {
          if (ev.type === 'cut') particles.burst(ev.x, ev.y, '#9b7b53', 10, 140)
          else if (ev.type === 'star') particles.burst(ev.x, ev.y, THEME.gold, 12, 150)
          else if (ev.type === 'shatter') particles.burst(ev.x, ev.y, '#f2a0c0', 18, 200)
          else if (ev.type === 'bubble') particles.burst(ev.x, ev.y, 'rgba(150,210,255,0.9)', 8, 90)
          else if (ev.type === 'pop') particles.burst(ev.x, ev.y, 'rgba(180,230,255,0.9)', 12, 130)
          else if (ev.type === 'win') {
            particles.burst(state.monster.x, state.monster.y, THEME.good, 20, 200)
            if (level !== lastLevelCleared) {
              lastLevelCleared = level
              saveLevel('cutrope', level + 1)
            }
            reportScore()
          } else if (ev.type === 'fail') {
            lives = state.lives
            reportScore()
          }
        }
        state.events.length = 0
      }
    }
    renderCutRope(ctx, state, { trail, swipe, animMs, paused })
    particles.tick(ctx, f.dt * 1000)
  })

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderCutRope(ctx, state, { trail, swipe, animMs, paused: true })
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

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const cutropeGame: MiniGameDefinition = {
  id: 'cutrope',
  title: '剪绳喂糖 CutRope',
  icon: '🍬',
  description: '糖果挂在绳上荡来荡去——掐准时机剪断，让它掉进小怪物嘴里。',
  controls: [
    '点击或划线剪断绳索（一次一根，每关限剪次数），糖果入小怪物嘴即过关',
    '碰尖刺、掉出界、被气泡带出顶部或限剪用尽未喂到都扣命（共 3 命）',
    '糖果飘进气泡会缓缓上浮，点击气泡可戳破让它重新坠落（高空怪物必用）',
    '顺路吃到星星加分；空格下一关 · R 重开 · [ ] 切关 · P 暂停',
  ],
  create: createCutRopeGame,
}
