/**
 * 泡泡纸渲染层：共享主题的深色渐变背景、按板号轮换 accent 配色的
 * 泡泡板——未爆为凸起高光圆（左上高光 + 底部暗边），已爆为瘪掉的
 * 凹陷圆（暗色 + 内阴影描边）；捏爆瞬间粒子飞溅与 x{combo} 飘字、
 * 换板提示飘字；HUD 显示分数 / 板号 / combo（含历史最高）；暂停遮罩
 * （本游戏无失败，只有暂停）。渲染为无状态纯绘制。
 */
import { W, H, HUD_H, COLS, ROWS, FLOAT_MS, BOARD_FLOAT_MS, boardGeometry, bubbleCenter, comboActive, type BubbleWrapState } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/**
 * 画一个未爆的凸起泡泡：板号配色圆体 + 左上高光点 + 底部暗边。
 * @param ctx - 画布上下文。
 * @param x - 圆心 x。
 * @param y - 圆心 y。
 * @param r - 半径。
 * @param color - 板号 accent 主色。
 */
function drawIntact(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  glow(ctx, color, 7)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 底部暗边：立体感的下半阴影。
  ctx.strokeStyle = 'rgba(0,0,0,0.30)'
  ctx.lineWidth = Math.max(1, r * 0.16)
  ctx.beginPath()
  ctx.arc(x, y + r * 0.08, r * 0.94, Math.PI * 0.15, Math.PI * 0.85)
  ctx.stroke()
  // 左上高光点。
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.32, y - r * 0.36, r * 0.3, r * 0.2, -0.6, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 画一个已爆的瘪泡泡：凹陷的暗色圆 + 内侧高光描边。
 * @param ctx - 画布上下文。
 * @param x - 圆心 x。
 * @param y - 圆心 y。
 * @param r - 半径。
 * @param color - 板号 accent 主色。
 */
function drawPopped(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  // 凹陷底：比背景更暗的圆。
  ctx.fillStyle = 'rgba(0,0,0,0.38)'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  // 破口皱褶：随板号配色的暗描边 + 顶部一点高光，读作"压瘪的皮"。
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.45
  ctx.lineWidth = Math.max(1, r * 0.14)
  ctx.beginPath()
  ctx.arc(x, y, r * 0.92, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, r * 0.5, Math.PI * 1.1, Math.PI * 1.9)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/**
 * 画飘字：金色加粗文本，随剩余寿命上浮渐隐。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawFloats(ctx: CanvasRenderingContext2D, state: BubbleWrapState): void {
  ctx.save()
  ctx.textAlign = 'center'
  for (const fl of state.floats) {
    const k = Math.max(0, Math.min(1, fl.life / (fl.maxLife === BOARD_FLOAT_MS ? BOARD_FLOAT_MS : FLOAT_MS)))
    ctx.globalAlpha = k
    ctx.font = fl.maxLife === BOARD_FLOAT_MS ? 'bold 22px system-ui, sans-serif' : 'bold 15px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText(fl.text, Math.max(30, Math.min(W - 30, fl.x)), Math.max(HUD_H + 16, fl.y))
  }
  ctx.restore()
}

/**
 * 渲染一帧：背景、泡泡板、事件粒子、飘字、HUD、暂停遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderBubbleWrap(ctx: CanvasRenderingContext2D, state: BubbleWrapState, paused: boolean): void {
  drawBackground(ctx, W, H)

  const g = boardGeometry()
  const color = accent(state.board - 1)

  // 板底衬板：圆角面板衬托泡泡矩阵。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, g.ox - 6, g.oy - 6, g.cell * COLS + 12, g.cell * ROWS + 12, 14)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const c = bubbleCenter(row, col)
      if (state.popped[row]![col]) drawPopped(ctx, c.x, c.y, g.r, color)
      else drawIntact(ctx, c.x, c.y, g.r, color)
    }
  }

  // 消费逻辑层事件：捏爆迸发 accent 粒子，换板迸发金色粒子。
  for (const ev of state.events) {
    if (ev.type === 'pop') {
      particles.burst(ev.x, ev.y, color, 6 + Math.min(8, ev.combo), 120 + ev.combo * 8)
    } else {
      particles.burst(W / 2, H / 2, THEME.gold, 30, 240)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawFloats(ctx, state)

  // HUD：分数 / 板号 / combo。
  const hudY = 21
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  hudPair(ctx, W / 2 + 40, hudY, '板', String(state.board), 'right')
  if (comboActive(state) && state.combo >= 2) {
    hudPair(ctx, W - 10, hudY, '连捏', 'x' + state.combo, 'right', THEME.gold)
  } else {
    hudPair(ctx, W - 10, hudY, '最高连捏', 'x' + state.bestCombo, 'right')
  }

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  }
}
