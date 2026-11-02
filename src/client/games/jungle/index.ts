/**
 * 斗兽棋游戏定义：把纯规则引擎与分帧 AI 组装成 {@link MiniGameInstance}。
 * 玩家执红（下方），AI 执黑；点击选子/走子，AI 通过 createSearch
 * 每帧一步分帧搜索不卡画面。U 悔棋、D 切换难度、R 重开、P 暂停。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  createStartPosition, legalMoves, applyMove, status, denInDanger,
  idx, colorOf, type Move, type Piece, type Position,
} from './logic.ts'
import { createSearch, chooseMove, LEVEL_DEPTH, NODE_BUDGET, type SearchStepper } from './ai.ts'
import { renderJungle, LOGICAL_W, LOGICAL_H, cellAt, centerOfIndex, type JungleView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每个难度档的战绩分基数差异由搜索深度体现。 */
const WIN_BASE = 10

function createJungleGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: jungle needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 0
  let pos: Position = createStartPosition()
  let history: Position[] = []
  let selected = -1
  let hints: Move[] = []
  let lastMove: Move | null = null
  let search: SearchStepper | null = null
  let paused = false
  let result: 'playing' | 'win' | 'lose' | 'paused' = 'playing'
  let lastScore = -1
  const particles = createParticles()

  const depth = (): number => LEVEL_DEPTH[Math.min(level, LEVEL_DEPTH.length - 1)]!
  const thinking = (): boolean => search !== null || pos.turn === 'b'

  const reportScore = (): void => {
    if (result === 'playing') return
    const score = result === 'win' ? WIN_BASE * depth() + WIN_BASE : 1
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 走完一步后的终局检查与告急重算。 */
  const settle = (): void => {
    const st = status(pos)
    if (st.kind === 'playing') return
    result = st.winner === 'r' ? 'win' : 'lose'
    reportScore()
  }

  const playerMove = (m: Move): void => {
    const captured = pos.board[idx(m[2], m[3])] as Piece | '' as Piece | ''
    if (captured !== '') {
      const [cx, cy] = centerOfIndex(idx(m[2], m[3]))
      particles.burst(cx, cy, colorOf(captured) === 'r' ? '#f7768e' : '#7dcfff', 16, 160)
    }
    history.push(pos)
    pos = applyMove(pos, m)
    lastMove = m
    selected = -1
    hints = []
    settle()
    loop.markDirty()
  }

  const startAi = (): void => {
    // 种子随步数推进，同一局面序列内完全确定。
    const seed = 0x9e3779b9 + history.length * 2654435761
    search = createSearch(pos, depth(), NODE_BUDGET, seed)
  }

  const finishAi = (m: Move | null): void => {
    search = null
    if (m === null) {
      settle()
      return
    }
    const captured = pos.board[idx(m[2], m[3])] as Piece | '' as Piece | ''
    if (captured !== '') {
      const [cx, cy] = centerOfIndex(idx(m[2], m[3]))
      particles.burst(cx, cy, '#f7768e', 16, 160)
    }
    pos = applyMove(pos, m)
    lastMove = m
    settle()
    loop.markDirty()
  }

  const restart = (): void => {
    pos = createStartPosition()
    history = []
    selected = -1
    hints = []
    lastMove = null
    search = null
    paused = false
    result = 'playing'
    lastScore = -1
    loop.markDirty()
  }

  const undo = (): void => {
    if (history.length === 0) return
    pos = history.pop()!
    search = null
    selected = -1
    hints = []
    lastMove = null
    if (result !== 'playing') result = 'playing'
    lastScore = -1
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (result !== 'playing') return
    paused = !paused
    loop.markDirty()
  }

  const hit = (event: MouseEvent): number => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    return cellAt(x, y)
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (paused || result !== 'playing' || pos.turn !== 'r') return
    const i = hit(event)
    if (i >= 0) {
      const p = pos.board[i] as Piece | ''
      if (p !== '' && colorOf(p) === 'r') {
        selected = i
        hints = legalMoves(pos).filter(m => idx(m[0], m[1]) === i)
        loop.markDirty()
        return
      }
      const m = hints.find(mm => idx(mm[2], mm[3]) === i)
      if (m !== undefined) {
        playerMove(m)
        return
      }
    }
    if (selected !== -1) {
      selected = -1
      hints = []
      loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') { event.preventDefault(); restart(); return }
    if (event.code === 'KeyP') { event.preventDefault(); togglePause(); return }
    if (event.code === 'KeyU') { event.preventDefault(); undo(); return }
    if (event.code === 'KeyD') {
      event.preventDefault()
      level = (level + 1) % LEVEL_DEPTH.length
      loop.markDirty()
    }
  }

  const frame = (f: FrameInfo): void => {
    const now = performance.now()
    if (!paused && result === 'playing') {
      // AI 分帧：每帧评估一个根着法。
      if (search !== null) {
        const r = search.step()
        if (r.done) finishAi(r.result.move)
        loop.markDirty()
      } else if (pos.turn === 'b') {
        startAi()
        loop.markDirty()
      }
      // 思考指示或兽穴告急脉冲需要连续帧。
      if (thinking() || denInDanger(pos, 'r') || denInDanger(pos, 'b')) loop.markDirty()
    }
    if (!f.render && particles.size() === 0) return
    const view: JungleView = {
      pos,
      selected,
      hints,
      lastMove,
      denThreat: denInDanger(pos, 'r') ? 'r' : denInDanger(pos, 'b') ? 'b' : null,
      thinking: thinking(),
      level: level + 1,
      timeMs: now,
      result: paused ? 'paused' : result,
    }
    renderJungle(ctx, view)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()

  // chooseMove 仅作离线同步参考，保持导入清单与逻辑文件对齐。
  void chooseMove

  return {
    start: () => { loop.start() },
    pause: () => { paused = true; loop.markDirty() },
    resume: () => { paused = false; loop.markDirty() },
    destroy: () => {
      loop.destroy()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const jungleGame: MiniGameDefinition = {
  id: 'jungle',
  title: '斗兽棋',
  icon: '🐘',
  description: '八兽等级吃子：鼠可欺象、狮虎跳河、陷阱废武功，攻入对方兽穴即胜；AI 分帧搜索不卡顿。',
  controls: ['点击选子 / 点击目标走子', 'U：悔棋 · D：难度 · R：重开 · P：暂停'],
  create: createJungleGame,
}
