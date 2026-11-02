/**
 * 弹幕决战渲染层：向下卷动的星空（固定种子确定性生成）、玩家机体
 * （精确模式高亮擦弹圈 + 判定点白芯）、红 / 紫两色发光敌弹、Boss 大机体
 * 与阶段血条（当前阶段亮、已过阶段暗）、擦弹火花、命中 / 击破爆散粒子、
 * HUD（分数 / 命 / Boss 阶段 / 擦弹数）、Boss 横幅与暂停 / 结算遮罩。
 */
import type { DanmakuState } from './logic.ts'
import { W, H, BOSSES, BOSS_ENTER_MS, GRAZE_R, hitRadius } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

const PLAYER_COLOR = accent(5)
const SHOT_COLOR = accent(0)
const RED = THEME.bad
const PURPLE = accent(1)
const BOSS_COLORS = [accent(4), accent(1), accent(6)]

// 渲染层自有的粒子系统与确定性星空（每个画布各一份）。
const particles = createParticles()

/** 一颗背景星。 */
interface Star { x: number, y: number, r: number, phase: number }

/** 用固定种子确定性生成 90 颗星。 */
function createStars(): Star[] {
  let a = 0x2545_f49f
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const stars: Star[] = []
  for (let i = 0; i < 90; i += 1) {
    stars.push({ x: next() * W, y: next() * H, r: 0.5 + next() * 1.3, phase: next() * Math.PI * 2 })
  }
  return stars
}
const stars = createStars()

/**
 * 画向下卷动的星空：星 y 随时间下移（越远越慢）。
 * @param ctx - 画布上下文。
 * @param t - 局内毫秒钟。
 */
function drawStars(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.fillStyle = THEME.text
  for (const s of stars) {
    const speed = 24 + s.r * 22
    const y = (s.y + (t / 1000) * speed) % H
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(t / 1100 + s.phase))
    ctx.globalAlpha = tw * 0.7
    ctx.beginPath()
    ctx.arc(s.x, y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 画玩家机体：箭形机身 + 白芯判定点；精确模式加描擦弹圈并闪烁；
 * 无敌期按 100ms 相位闪烁。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param focus - 本帧是否精确模式。
 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: DanmakuState, focus: boolean): void {
  if (state.invulnMs > 0 && Math.floor(state.t / 100) % 2 === 0) return
  const x = state.playerX
  const y = state.playerY
  glow(ctx, PLAYER_COLOR, 10)
  ctx.fillStyle = PLAYER_COLOR
  ctx.beginPath()
  ctx.moveTo(x, y - 14)
  ctx.lineTo(x - 11, y + 10)
  ctx.lineTo(x - 4, y + 6)
  ctx.lineTo(x + 4, y + 6)
  ctx.lineTo(x + 11, y + 10)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  if (focus) {
    // 擦弹圈参考线。
    ctx.strokeStyle = 'rgba(226,226,238,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, GRAZE_R, 0, Math.PI * 2)
    ctx.stroke()
  }
  // 判定点白芯。
  glow(ctx, '#ffffff', 8)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(x, y, hitRadius(focus), 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/**
 * 画一颗敌弹：红 / 紫发光圆弹（紫弹略大带描边）。
 * @param ctx - 画布上下文。
 * @param b - 敌弹。
 */
function drawBullet(ctx: CanvasRenderingContext2D, b: { x: number, y: number, r: number, color: string }): void {
  const color = b.color
  glow(ctx, color, 9)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画 Boss：大机体（多层菱形 + 核心），入场期半透明；阶段停火期闪白。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBoss(ctx: CanvasRenderingContext2D, state: DanmakuState): void {
  if (!state.bossAlive) return
  const def = BOSSES[state.bossIndex]!
  const color = BOSS_COLORS[state.bossIndex % BOSS_COLORS.length]!
  const entering = state.bossEnterMs > 0
  const flashing = state.breakMs > 0 && Math.floor(state.t / 90) % 2 === 0
  ctx.globalAlpha = entering ? 0.45 + 0.55 * (1 - state.bossEnterMs / BOSS_ENTER_MS) : 1
  glow(ctx, color, 16)
  ctx.fillStyle = flashing ? '#ffffff' : color
  // 外层大菱形。
  ctx.beginPath()
  ctx.moveTo(state.bossX, state.bossY - 34)
  ctx.lineTo(state.bossX + 40, state.bossY)
  ctx.lineTo(state.bossX, state.bossY + 30)
  ctx.lineTo(state.bossX - 40, state.bossY)
  ctx.closePath()
  ctx.fill()
  // 内层小菱形 + 核心。
  ctx.fillStyle = flashing ? color : '#15151b'
  ctx.beginPath()
  ctx.moveTo(state.bossX, state.bossY - 18)
  ctx.lineTo(state.bossX + 20, state.bossY)
  ctx.lineTo(state.bossX, state.bossY + 15)
  ctx.lineTo(state.bossX - 20, state.bossY)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  glow(ctx, '#ffffff', 8)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(state.bossX, state.bossY, 6, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.globalAlpha = 1
  // 机体下方名称标签。
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText(def.name, state.bossX, state.bossY + 46)
}

/**
 * 画 Boss 血条：顶部三段（当前阶段亮色、已过阶段灰暗），宽度按当前阶段
 * 血量比例收缩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawBossBar(ctx: CanvasRenderingContext2D, state: DanmakuState): void {
  if (!state.bossAlive) return
  const x0 = 40
  const y0 = 30
  const totalW = W - 80
  const seg = (totalW - 8) / 3
  const color = BOSS_COLORS[state.bossIndex % BOSS_COLORS.length]!
  for (let i = 0; i < 3; i += 1) {
    const x = x0 + i * (seg + 4)
    roundRectPath(ctx, x, y0, seg, 7, 3)
    ctx.fillStyle = 'rgba(226,226,238,0.12)'
    ctx.fill()
    if (i < state.phase) continue
    const frac = i === state.phase ? Math.max(0, state.bossHp / state.bossMaxHp) : 1
    if (frac <= 0) continue
    roundRectPath(ctx, x, y0, seg * frac, 7, 3)
    ctx.fillStyle = i === state.phase ? color : 'rgba(226,226,238,0.28)'
    ctx.fill()
  }
}

/**
 * 渲染一帧：星空、Boss 与血条、玩家子弹、敌弹、玩家、粒子、HUD、横幅、
 * 暂停 / 结算遮罩。消费 logic 事件产生对应特效。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param focus - 本帧是否精确模式。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderDanmaku(ctx: CanvasRenderingContext2D, state: DanmakuState, focus: boolean, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawStars(ctx, state.t)
  drawBoss(ctx, state)
  drawBossBar(ctx, state)

  // 玩家子弹：细长白条。
  glow(ctx, SHOT_COLOR, 6)
  ctx.fillStyle = SHOT_COLOR
  for (const s of state.playerShots) ctx.fillRect(s.x - 1.5, s.y - 8, 3, 12)
  noGlow(ctx)

  for (const b of state.enemyBullets) {
    drawBullet(ctx, { x: b.x, y: b.y, r: b.color === 'purple' ? b.r + 1 : b.r, color: b.color === 'red' ? RED : PURPLE })
  }
  drawPlayer(ctx, state, focus)

  // 消费逻辑层事件：擦弹白花、命中红爆、Boss 中弹、击破大爆散。
  for (const ev of state.events) {
    if (ev.type === 'graze') {
      particles.burst(ev.x, ev.y, '#ffffff', 5, 90)
    } else if (ev.type === 'hit') {
      particles.burst(ev.x, ev.y, THEME.bad, 28, 240)
    } else if (ev.type === 'bossHit') {
      particles.burst(ev.x, ev.y, BOSS_COLORS[state.bossIndex % BOSS_COLORS.length]!, 4, 110)
    } else if (ev.type === 'bossDown') {
      particles.burst(ev.x, ev.y, THEME.gold, 40, 320)
    } else if (ev.type === 'phase') {
      particles.burst(state.bossX, state.bossY, '#ffffff', 26, 260)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  // HUD：分数 / Boss 阶段 / 擦弹 / 生命。
  const hudY = 16
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('Boss', W / 2 - 28, hudY)
  ctx.fillStyle = THEME.gold
  ctx.fillText((state.bossIndex + 1) + '-' + (state.phase + 1), W / 2 + 4, hudY)
  hudPair(ctx, W - 78, hudY, '擦弹', String(state.graze), 'left', accent(5))
  const hearts = state.lives >= 1 ? '❤'.repeat(state.lives) : '♡'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = THEME.bad
  ctx.fillText(hearts, W - 10, hudY)

  // Boss 横幅。
  if (state.bannerMs > 0 && state.bossAlive) {
    const k = Math.min(1, state.bannerMs / (BOSS_ENTER_MS * 0.4))
    ctx.globalAlpha = k
    ctx.textAlign = 'center'
    ctx.font = 'bold 24px system-ui, sans-serif'
    ctx.fillStyle = BOSS_COLORS[state.bossIndex % BOSS_COLORS.length]!
    ctx.fillText('BOSS ' + (state.bossIndex + 1) + ' · ' + BOSSES[state.bossIndex]!.name, W / 2, H / 2 - 60)
    ctx.globalAlpha = 1
  }

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.over) {
    if (state.win) {
      drawOverlay(ctx, W, H, '完 全 制 压', '得分 ' + state.score + ' · 擦弹 ' + state.graze + ' · 按 R 重开', THEME.gold)
    } else {
      drawOverlay(ctx, W, H, '游戏结束', '得分 ' + state.score + ' · 擦弹 ' + state.graze + ' · 按 R 重开', THEME.bad)
    }
  }
}
