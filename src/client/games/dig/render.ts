/**
 * 地底挖矿渲染层：按深度分层的泥土、铆钉硬石、闪烁宝石、出口指示灯、
 * 落石（静止 / 抖动预警 / 坠落）、矿工帽灯玩家、地道怪物、宝石/生命/深度
 * HUD 与过关/失败/暂停遮罩。全部为纯 canvas 绘制，特效仅为对逻辑状态的
 * 观察（粒子、上一帧分数）。
 */
import type { DigState, Dir } from './logic.ts'
import { CELL, COLS, ROWS, CRUSH_SCORE, LEVELS } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 30
export const LOGICAL_W = COLS * CELL
export const LOGICAL_H = HUD_H + ROWS * CELL

/** 深度分层的泥土底色（越深越暗）。 */
const DIRT_BANDS = ['#4d3b28', '#43331f', '#392b1a', '#2f2415']
const DIRT_SPECK = 'rgba(255,235,200,0.07)'
const HARD_FILL = '#3c3c48'
const HARD_STUD = '#55556a'
const TUNNEL = '#0e0d16'

// 渲染侧特效状态：粒子池、帧钟、上一帧分数（用于观察得分事件）。
const particles = createParticles()
let prevScore = 0
let prevGems = 0
let prevFrameMs = 0

const DIR_VEC: Record<Dir, readonly [number, number]> = {
  0: [0, -1],
  1: [1, 0],
  2: [0, 1],
  3: [-1, 0],
}

function bandColor(r: number): string {
  return DIRT_BANDS[Math.min(DIRT_BANDS.length - 1, Math.floor((r - 1) / 3))]!
}

/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param t - 累计秒数（闪烁动画时钟）。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderDig(ctx: CanvasRenderingContext2D, state: DigState, t: number, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // 得分/宝石事件 → 粒子爆发（仅观察逻辑状态，不改逻辑）。
  if (state.score > prevScore) {
    const gain = state.score - prevScore
    const big = gain >= CRUSH_SCORE
    particles.burst(state.player.x, HUD_H + state.player.y, big ? accent(5) : THEME.gold, big ? 22 : 10, big ? 170 : 120)
  }
  prevScore = state.score
  if (state.gemsTotal - state.gemsLeft > prevGems) {
    particles.burst(state.player.x, HUD_H + state.player.y, accent(3), 12, 130)
  }
  prevGems = state.gemsTotal - state.gemsLeft

  // 网格：地道、分层泥土、硬石、宝石、出口。
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const x = c * CELL
      const y = HUD_H + r * CELL
      const cell = state.grid[r]![c]!
      if (cell === 'empty') {
        ctx.fillStyle = TUNNEL
        ctx.fillRect(x, y, CELL, CELL)
      } else if (cell === 'hard') {
        ctx.fillStyle = HARD_FILL
        ctx.fillRect(x, y, CELL, CELL)
        ctx.fillStyle = HARD_STUD
        ctx.beginPath()
        ctx.arc(x + 6, y + 6, 1.8, 0, Math.PI * 2)
        ctx.arc(x + CELL - 6, y + 6, 1.8, 0, Math.PI * 2)
        ctx.arc(x + 6, y + CELL - 6, 1.8, 0, Math.PI * 2)
        ctx.arc(x + CELL - 6, y + CELL - 6, 1.8, 0, Math.PI * 2)
        ctx.fill()
      } else if (cell === 'exit') {
        const open = state.gemsLeft === 0
        const color = open ? THEME.good : THEME.bad
        ctx.fillStyle = '#101018'
        ctx.fillRect(x, y, CELL, CELL)
        glow(ctx, color, open ? 12 : 4)
        ctx.fillStyle = color
        roundRectPath(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 4)
        ctx.fill()
        noGlow(ctx)
        ctx.fillStyle = '#101018'
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(open ? '出' : '锁', x + CELL / 2, y + CELL / 2 + 4)
      } else {
        // 泥土 / 含宝石泥土：分层底色 + 确定性斑点纹理。
        ctx.fillStyle = bandColor(r)
        ctx.fillRect(x, y, CELL, CELL)
        ctx.fillStyle = DIRT_SPECK
        const s1 = ((r * 31 + c * 17) % 7) - 3
        const s2 = ((r * 13 + c * 29) % 9) - 4
        ctx.fillRect(x + CELL / 2 + s1, y + CELL / 2 + s2, 3, 3)
        ctx.fillRect(x + 5 + s2, y + 6 - s1, 2, 2)
        if (cell === 'gem') {
          // 宝石：金色菱形，呼吸式闪烁。
          const pulse = 0.75 + 0.25 * Math.sin(t * 6 + r + c)
          const cx = x + CELL / 2
          const cy = y + CELL / 2
          ctx.globalAlpha = pulse
          glow(ctx, THEME.gold, 8)
          ctx.fillStyle = THEME.gold
          ctx.beginPath()
          ctx.moveTo(cx, cy - 6)
          ctx.lineTo(cx + 5, cy)
          ctx.lineTo(cx, cy + 6)
          ctx.lineTo(cx - 5, cy)
          ctx.closePath()
          ctx.fill()
          noGlow(ctx)
          ctx.globalAlpha = 1
        }
      }
    }
  }

  // 落石：静止圆石；抖动加红色预警光晕与横向抖动；坠落画在实际 y。
  for (const b of state.boulders) {
    let bx = b.c * CELL
    let by = HUD_H + b.y
    if (b.state === 'shake') {
      bx += Math.sin(t * 46) * 2
      glow(ctx, THEME.bad, 10)
    } else if (b.state === 'fall') {
      glow(ctx, '#ffffff', 4)
    }
    ctx.fillStyle = '#8a8a98'
    ctx.beginPath()
    ctx.arc(bx + CELL / 2, by + CELL / 2, CELL * 0.44, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = '#6b6b7a'
    ctx.beginPath()
    ctx.arc(bx + CELL / 2 - 3, by + CELL / 2 + 3, CELL * 0.16, 0, Math.PI * 2)
    ctx.fill()
  }

  // 敌人：紫红色团状怪物，眼睛看向移动方向。
  state.enemies.forEach((enemy, i) => {
    const color = accent(4 + i)
    const ey = HUD_H + enemy.y
    ctx.fillStyle = color
    glow(ctx, color, 8)
    ctx.beginPath()
    ctx.arc(enemy.x, ey, CELL * 0.4, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    const [vx, vy] = DIR_VEC[enemy.dir]
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(enemy.x - 4, ey - 2, 3.2, 0, Math.PI * 2)
    ctx.arc(enemy.x + 4, ey - 2, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = THEME.bgBottom
    ctx.beginPath()
    ctx.arc(enemy.x - 4 + vx * 1.6, ey - 2 + vy * 1.6, 1.6, 0, Math.PI * 2)
    ctx.arc(enemy.x + 4 + vx * 1.6, ey - 2 + vy * 1.6, 1.6, 0, Math.PI * 2)
    ctx.fill()
  })

  // 玩家：矿工帽灯 —— 朝向方向的锥形灯光 + 帽盔小人。
  const p = state.player
  const py = HUD_H + p.y
  const [lx, ly] = DIR_VEC[p.dir]
  ctx.globalAlpha = 0.13
  ctx.fillStyle = THEME.gold
  ctx.beginPath()
  ctx.moveTo(p.x, py)
  ctx.lineTo(p.x + lx * 46 - ly * 16, py + ly * 46 + lx * 16)
  ctx.lineTo(p.x + lx * 46 + ly * 16, py + ly * 46 - lx * 16)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  // 身体。
  ctx.fillStyle = accent(0)
  ctx.beginPath()
  ctx.arc(p.x, py + 3, CELL * 0.36, 0, Math.PI * 2)
  ctx.fill()
  // 头 + 黄色安全帽 + 帽灯。
  ctx.fillStyle = '#e8d5b5'
  ctx.beginPath()
  ctx.arc(p.x, py - 3, CELL * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = THEME.gold
  ctx.beginPath()
  ctx.arc(p.x, py - 5, CELL * 0.3, Math.PI, 0)
  ctx.fill()
  glow(ctx, '#ffffff', 6)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(p.x + lx * 4, py - 6 + ly * 3, 2.2, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)

  // HUD：得分 / 宝石进度 / 深度 / 生命。
  hudPair(ctx, 10, 20, '得分', String(state.score))
  hudPair(ctx, 118, 20, '宝石', state.gemsTotal - state.gemsLeft + '/' + state.gemsTotal, 'left', THEME.gold)
  hudPair(ctx, LOGICAL_W / 2 + 20, 20, '深度', '第' + state.level + '/' + LEVELS.length + '层', 'left', accent(6))
  hudPair(ctx, LOGICAL_W - 10, 20, '生命', '♥'.repeat(Math.max(0, state.lives)), 'right', THEME.bad)

  particles.tick(ctx, dtMs)

  if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', '得分 ' + state.score + ' · 按 R 重新开始', THEME.bad)
  } else if (state.won) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关！', '得分 ' + state.score + ' · 按 R 重新开始', THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
