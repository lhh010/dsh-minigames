/**
 * 弹弓复仇渲染层：卡通天空草地、弹弓皮筋、拖尾鸟弹、木纹/石纹/冰块、
 * 晕头小猪、碎裂与命中粒子、上次弹道虚影、星级结算。无状态，全部
 * 状态由调用方传入；复用 theme.ts 公共设施。
 */
import { GRAVITY, GROUND_Y, LEVELS, MAX_DRAG, MATERIALS, PIG_R, SLING, W, H, BALL_R, dragToVelocity, type Material, type SlingshotState } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const MAT_COLORS: Record<Material, string> = {
  wood: '#b98a4e',
  stone: '#8f97a8',
  ice: '#bfe4f5',
}

/** 裂纹按耐久比例返回（1 满血无裂纹 → 0 全裂）。 */
function crackK(block: { hp: number, mat: Material }): number {
  return Math.max(0, Math.min(1, block.hp / MATERIALS[block.mat].hp))
}

export function renderSlingshot(
  ctx: CanvasRenderingContext2D,
  state: SlingshotState,
  aim: { from: { x: number, y: number }, to: { x: number, y: number } } | null,
  trail: readonly { x: number, y: number }[],
  paused: boolean,
): void {
  drawBackground(ctx, W, H)
  // 天空太阳与云。
  ctx.fillStyle = 'rgba(255,236,190,0.9)'
  ctx.beginPath()
  ctx.arc(W - 90, 70, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath()
    ctx.ellipse(120 + i * 190, 60 + (i % 2) * 26, 42, 14, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 地面。
  ctx.fillStyle = '#7fb356'
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
  ctx.fillStyle = '#6d9c49'
  ctx.fillRect(0, GROUND_Y, W, 6)

  // 上次弹道虚影。
  if (trail.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(trail[0]!.x, trail[0]!.y)
    for (const p of trail.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 块。
  for (const block of state.blocks) {
    if (block.broken) continue
    const k = crackK(block)
    ctx.fillStyle = MAT_COLORS[block.mat]
    roundRectPath(ctx, block.x, block.y, block.w, block.h, 4)
    ctx.fill()
    if (block.mat === 'ice') {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      roundRectPath(ctx, block.x + 3, block.y + 3, block.w - 6, Math.max(3, block.h / 3), 3)
      ctx.fill()
    } else if (block.mat === 'wood') {
      ctx.strokeStyle = 'rgba(90,60,25,0.5)'
      ctx.lineWidth = 1
      for (let y = block.y + 8; y < block.y + block.h - 4; y += 10) {
        ctx.beginPath()
        ctx.moveTo(block.x + 3, y)
        ctx.lineTo(block.x + block.w - 3, y)
        ctx.stroke()
      }
    } else {
      ctx.strokeStyle = 'rgba(60,66,80,0.5)'
      ctx.lineWidth = 1
      roundRectPath(ctx, block.x + 2, block.y + 2, block.w - 4, block.h - 4, 3)
      ctx.stroke()
    }
    // 裂纹（血量低时叠加）。
    if (k < 0.7) {
      ctx.strokeStyle = 'rgba(30,20,10,' + ((0.7 - k) * 1.2).toFixed(2) + ')'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(block.x + block.w * 0.2, block.y + block.h * 0.1)
      ctx.lineTo(block.x + block.w * 0.55, block.y + block.h * 0.5)
      ctx.lineTo(block.x + block.w * 0.35, block.y + block.h * 0.9)
      ctx.stroke()
    }
  }

  // 猪。
  for (const pig of state.pigs) {
    if (pig.dead) continue
    glow(ctx, '#79c26a', 8)
    ctx.fillStyle = '#79c26a'
    ctx.beginPath()
    ctx.arc(pig.x, pig.y, PIG_R, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = '#1d3320'
    ctx.beginPath()
    ctx.arc(pig.x - 4, pig.y - 2, 2, 0, Math.PI * 2)
    ctx.arc(pig.x + 4, pig.y - 2, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1d3320'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(pig.x, pig.y + 3, 4, 0.2, Math.PI - 0.2)
    ctx.stroke()
    ctx.fillStyle = '#8fce84'
    ctx.beginPath()
    ctx.arc(pig.x - 8, pig.y - 10, 3.5, 0, Math.PI * 2)
    ctx.arc(pig.x + 8, pig.y - 10, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 弹弓。
  ctx.strokeStyle = '#7a5230'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(SLING.x - 14, GROUND_Y)
  ctx.lineTo(SLING.x - 4, SLING.y + 22)
  ctx.moveTo(SLING.x + 14, GROUND_Y)
  ctx.lineTo(SLING.x + 4, SLING.y + 22)
  ctx.stroke()
  // 待发鸟画在弓兜（朝向 = 发射方向：拉弓方向的反向）。
  if (state.phase === 'aim' && aim !== null) {
    const v = dragToVelocity(aim.from.x - aim.to.x, aim.from.y - aim.to.y)
    const pull = v === null ? 0 : Math.min(Math.hypot(aim.to.x - aim.from.x, aim.to.y - aim.from.y), MAX_DRAG)
    const bx = SLING.x - (v === null ? 0 : (aim.to.x - aim.from.x) * 0.4)
    const by = SLING.y - (v === null ? 0 : (aim.to.y - aim.from.y) * 0.4)
    // 皮筋。
    ctx.strokeStyle = '#4a3320'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(SLING.x - 6, SLING.y + 24)
    ctx.lineTo(bx, by)
    ctx.lineTo(SLING.x + 6, SLING.y + 24)
    ctx.stroke()
    // 待发鸟朝向 = 发射方向（拉弓方向的反向）。未拉出有效力度时默认朝右上。
    drawBird(ctx, bx, by, v === null ? -0.5 : Math.atan2(v.vy, v.vx))
    // 力度指示。
    if (pull > 4) {
      hudPair(ctx, 10, 26, '力度', Math.round((pull / MAX_DRAG) * 100) + '%', 'left', pull / MAX_DRAG > 0.85 ? THEME.bad : THEME.gold)
    }
    // 预瞄虚线。
    if (v !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 2
      ctx.setLineDash([3, 7])
      ctx.beginPath()
      ctx.moveTo(bx, by)
      let px = bx, py = by, pvx = v.vx, pvy = v.vy
      for (let i = 0; i < 30; i += 1) {
        pvy += GRAVITY * 0.045
        px += pvx * 0.045
        py += pvy * 0.045
        ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // 飞行中的鸟 + 拖尾。
  if (state.bird !== null) {
    drawBird(ctx, state.bird.x, state.bird.y, Math.atan2(state.bird.vy, state.bird.vx))
  }

  // HUD。
  const left = state.birds - state.used
  hudPair(ctx, W - 10, 26, '鸟弹', '🐦'.repeat(Math.max(0, left)) || '0', 'right', THEME.gold)
  hudPair(ctx, 10, 48, '关卡', String(state.level) + '/' + LEVELS.length)
  hudPair(ctx, W - 10, 48, '猪', String(state.pigs.filter(p => !p.dead).length) + ' 只', 'right')

  if (state.phase === 'won') {
    drawOverlay(ctx, W, H, '过关！', '★'.repeat(state.stars) + '☆'.repeat(3 - state.stars) + ' · 按空格下一关', THEME.good)
  } else if (state.phase === 'lost') {
    drawOverlay(ctx, W, H, '弹尽', '还有猪在笑 · 按 R 重试', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, W, H, '已暂停', '按 P 继续', THEME.text)
  }
}

function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  glow(ctx, accent(1), 8)
  ctx.fillStyle = accent(1)
  ctx.beginPath()
  ctx.arc(x, y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3 - 2, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.arc(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4 - 2, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e0a030'
  ctx.beginPath()
  ctx.moveTo(x + Math.cos(angle) * BALL_R, y + Math.sin(angle) * BALL_R)
  ctx.lineTo(x + Math.cos(angle) * (BALL_R + 7), y + Math.sin(angle) * (BALL_R + 7) - 3)
  ctx.lineTo(x + Math.cos(angle) * (BALL_R + 6), y + Math.sin(angle) * (BALL_R + 6) + 3)
  ctx.closePath()
  ctx.fill()
}

void createParticles
