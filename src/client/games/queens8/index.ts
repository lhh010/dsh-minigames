/**
 * 八皇后游戏定义：把纯逻辑接成 {@link MiniGameInstance}。交互：点击
 * 空格放置皇后、点击皇后移除；悬停格子显示行/列/两对角线攻击范围，
 * 悬停皇后时红色连线指向其攻击到的皇后；冲突皇后红色辉光标记。
 * [ / ] 在 4/6/8 档间切换（换档即开新局），R 重开本档，P 暂停。
 * 计时挑战：过关得分 = winScore(档位, 用时秒, 放置次数)，越快、步数
 * 越少分越高，过关后累进总分并上报 onScore。dirty 渲染：计时秒跳变、
 * 悬停变化、过关粒子期间重绘，静止时零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { LEVELS, createBoard, toggle, winScore, type Pos, type QueensState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, cellAt, renderQueens } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createQueensGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: queens8 needs a 2d canvas context')
  const ctx = fit.ctx

  // 记忆上次档位（首次默认 6×6——4×4 偏小）；数字键 4/6/8 可直达。
  const savedSize = Number(localStorage.getItem('dsh-minigames:queens8-size') ?? 6)
  let levelIdx = (LEVELS as readonly number[]).includes(savedSize) ? (LEVELS as readonly number[]).indexOf(savedSize) : 1
  let state: QueensState = createBoard(LEVELS[levelIdx]!)
  let score = 0
  let lastReported = -1
  let elapsedMs = 0
  let shownSeconds = -1
  let hover: Pos | null = null
  let winText: string | null = null
  let running = false
  const particles = createParticles()

  const reportScore = (): void => {
    if (score === lastReported) return
    lastReported = score
    options?.onScore?.(score)
  }

  const startLevel = (idx: number): void => {
    localStorage.setItem('dsh-minigames:queens8-size', String(LEVELS[idx] ?? 6))
    levelIdx = idx
    state = createBoard(LEVELS[levelIdx]!)
    elapsedMs = 0
    shownSeconds = -1
    hover = null
    winText = null
    loop.markDirty()
  }

  /** 过关收尾：计分、粒子、文案（overlay 由 render 绘制）。 */
  const finishWin = (won: QueensState): void => {
    state = won
    const seconds = Math.floor(elapsedMs / 1000)
    const gained = winScore(won.size, seconds, won.moves)
    score += gained
    reportScore()
    winText = '用时 ' + String(seconds) + ' 秒 · ' + String(won.moves) + ' 步 · +' + String(gained) + ' 分 · 总分 ' + String(score)
    particles.burst(LOGICAL_W / 2, LOGICAL_H / 2 - 20, THEME.good, 16, 150)
    particles.burst(LOGICAL_W / 2, LOGICAL_H / 2 + 10, THEME.gold, 10, 110)
    loop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = cellAt(x, y, state.size)
    const changed = (hit === null) !== (hover === null)
      || (hit !== null && hover !== null && (hit.row !== hover.row || hit.col !== hover.col))
    if (changed) {
      hover = hit
      loop.markDirty()
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const hit = cellAt(x, y, state.size)
    if (hit === null) return
    const next = toggle(state, hit.row, hit.col)
    if (next === null) return
    if (next.won) finishWin(next)
    else state = next
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(levelIdx)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'Digit4' || event.code === 'Digit6' || event.code === 'Digit8') {
      event.preventDefault()
      startLevel((LEVELS as readonly number[]).indexOf(Number(event.code.slice(5))))
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      const dir = event.code === 'BracketRight' ? 1 : -1
      startLevel(((levelIdx + dir) % LEVELS.length + LEVELS.length) % LEVELS.length)
    }
  }

  const draw = (): void => {
    renderQueens(ctx, LOGICAL_W, LOGICAL_H, state, {
      hover,
      elapsedMs,
      paused: !running && winText === null,
      winText,
    })
    particles.tick(ctx, 1000 / 60)
  }

  // 脏标记渲染：计时秒跳变 / 过关粒子期间重绘，静止零重绘。
  const loop = createFrameLoop(f => {
    if (running && !state.won) {
      elapsedMs += f.dt * 1000
      const seconds = Math.floor(elapsedMs / 1000)
      if (seconds !== shownSeconds) {
        shownSeconds = seconds
        loop.markDirty()
      }
    }
    const animating = winText !== null && particles.size() > 0
    if (f.render || animating) {
      draw()
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    loop.markDirty()
    draw()
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
    loop.resume()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
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
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const queens8Game: MiniGameDefinition = {
  id: 'queens8',
  title: '八皇后 Queens',
  icon: '👑',
  description: '在棋盘上放皇后互不攻击——行、列、斜线都不能撞，回溯思维的百年经典。',
  controls: ['点击格子：放置 / 移除皇后 · 悬停：行、列、斜线攻击提示', '4 / 6 / 8：直达档位 · [ / ]：循环切换 · R：重开 · P：暂停'],
  create: createQueensGame,
}
