/**
 * 潮汐赶海渲染层：顶部海面渐变 + 水线推进（正弦波纹动画随 t 滚动）、
 * 滩涂网格与深度带着色、发光珍珠 / 海星 / 贝壳、水桶玩家、潮汐进度条
 * （退潮青 / 平潮绿 / 涨潮金→红预警，含 24s / 40s 刻度）、命 / 轮 / 分
 * HUD、拾取与被卷走粒子、暂停与结束遮罩。无状态：只读逻辑态。
 */
import {
  W, H, COLS, ROWS, LOW_ROW, MAX_FLOOD_ROW, RETREAT_MS, LULL_MS, FLOOD_MS, ROUND_MS,
  ROUNDS, ITEM_KINDS, bandOf, tidePhaseAt, waterLineAt, type TideState,
} from './logic.ts'
import { THEME, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 网格布局：HUD 顶带下方铺网格，底部留进度条与提示带。 */
const BOARD_Y = 44
const CELL = 46
const BOARD_X = (W - COLS * CELL) / 2
const BOARD_H = ROWS * CELL

// 渲染层自有的粒子系统（每个画布一个实例）。
const particles = createParticles()

/**
 * 某格中心像素坐标。
 * @param col - 列号。
 * @param row - 行号。
 * @returns 中心 (x, y)。
 */
function cellCenter(col: number, row: number): { x: number, y: number } {
  return { x: BOARD_X + col * CELL + CELL / 2, y: BOARD_Y + row * CELL + CELL / 2 }
}

/**
 * 水线像素 y（含波纹动画基准）。
 * @param state - 当前状态。
 * @returns 水线 y 坐标。
 */
function waterY(state: TideState): number {
  return BOARD_Y + waterLineAt(Math.min(state.t, ROUND_MS)) * CELL
}

/**
 * 画天空带（HUD 背景）与滩涂底色 + 深度带网格线。
 * @param ctx - 画布上下文。
 */
function drawBeach(ctx: CanvasRenderingContext2D): void {
  const sand = ctx.createLinearGradient(0, BOARD_Y, 0, BOARD_Y + BOARD_H)
  sand.addColorStop(0, '#2b2a3d')
  sand.addColorStop(1, '#38304a')
  ctx.fillStyle = sand
  ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL, BOARD_H)
  ctx.strokeStyle = 'rgba(226,226,238,0.07)'
  ctx.lineWidth = 1
  for (let c = 0; c <= COLS; c += 1) {
    ctx.beginPath()
    ctx.moveTo(BOARD_X + c * CELL, BOARD_Y)
    ctx.lineTo(BOARD_X + c * CELL, BOARD_Y + BOARD_H)
    ctx.stroke()
  }
  for (let r = 0; r <= ROWS; r += 1) {
    ctx.beginPath()
    ctx.moveTo(BOARD_X, BOARD_Y + r * CELL)
    ctx.lineTo(BOARD_X + COLS * CELL, BOARD_Y + r * CELL)
    ctx.stroke()
  }
  // 深度带标签：行左缘标注倍率（×4 最深 → ×1 最近岸）。
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'left'
  for (let r = LOW_ROW; r < MAX_FLOOD_ROW; r += 1) {
    ctx.fillStyle = 'rgba(226,226,238,0.35)'
    ctx.fillText('×' + bandOf(r), BOARD_X + 3, BOARD_Y + r * CELL + 12)
  }
}

/**
 * 画海水覆盖区与推进的水线：水线以上（海侧）半透明渐变海水，边缘为
 * 随 t 滚动的双正弦波纹；涨潮阶段水线泛红预警。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSea(ctx: CanvasRenderingContext2D, state: TideState): void {
  const y = waterY(state)
  if (y > BOARD_Y) {
    const sea = ctx.createLinearGradient(0, BOARD_Y, 0, y)
    sea.addColorStop(0, 'rgba(20,52,88,0.92)')
    sea.addColorStop(1, 'rgba(36,84,124,0.72)')
    ctx.fillStyle = sea
    ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL, y - BOARD_Y)
  }
  const phase = tidePhaseAt(state.t)
  const edge = phase === 'flood' ? '#f7768e' : '#7dcfff'
  glow(ctx, edge, phase === 'flood' ? 14 : 9)
  ctx.strokeStyle = edge
  ctx.lineWidth = 2.5
  ctx.beginPath()
  const amp = phase === 'lull' ? 2 : 4
  for (let px = BOARD_X; px <= BOARD_X + COLS * CELL; px += 4) {
    const wave = Math.sin(px / 26 + state.t / 260) * amp + Math.sin(px / 11 - state.t / 150) * amp * 0.4
    if (px === BOARD_X) ctx.moveTo(px, y + wave)
    else ctx.lineTo(px, y + wave)
  }
  ctx.stroke()
  noGlow(ctx)
  // 低潮基准虚线：平潮期水线应停在此处。
  const lowY = BOARD_Y + LOW_ROW * CELL
  ctx.setLineDash([4, 5])
  ctx.strokeStyle = 'rgba(125,207,255,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(BOARD_X, lowY)
  ctx.lineTo(BOARD_X + COLS * CELL, lowY)
  ctx.stroke()
  ctx.setLineDash([])
}

/**
 * 画一件滩涂物品：贝壳（扇形）/ 海星（五角星）/ 珍珠（发光圆），出现
 * 前一秒起淡入提示。
 * @param ctx - 画布上下文。
 * @param item - 物品。
 * @param t - 轮内毫秒钟。
 */
function drawItem(ctx: CanvasRenderingContext2D, item: { col: number, row: number, kind: number, taken: boolean, appearAt: number }, t: number): void {
  if (item.taken || t < item.appearAt - 900) return
  const c = cellCenter(item.col, item.row)
  const spec = ITEM_KINDS[item.kind % ITEM_KINDS.length]!
  const alpha = t < item.appearAt ? Math.max(0.15, (t - (item.appearAt - 900)) / 900 * 0.5) : 1
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(c.x, c.y)
  if (item.kind === 2) {
    // 珍珠：发光白珠 + 贝缝。
    glow(ctx, spec.color, 12 + Math.sin(t / 320) * 4)
    ctx.fillStyle = '#f4f0ff'
    ctx.beginPath()
    ctx.arc(0, 0, 8, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = spec.color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, 0, 8, -0.6, 0.6)
    ctx.stroke()
  } else if (item.kind === 1) {
    // 海星：五角星。
    glow(ctx, spec.color, 8)
    ctx.fillStyle = spec.color
    ctx.beginPath()
    for (let i = 0; i < 10; i += 1) {
      const rr = i % 2 === 0 ? 9 : 4
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const px = Math.cos(a) * rr
      const py = Math.sin(a) * rr
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
  } else {
    // 贝壳：扇形 + 放射线。
    ctx.fillStyle = spec.color
    ctx.beginPath()
    ctx.moveTo(0, 7)
    ctx.arc(0, 7, 10, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(13,13,20,0.5)'
    ctx.lineWidth = 1
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath()
      ctx.moveTo(0, 7)
      ctx.lineTo(i * 5, -2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * 画玩家（水桶）：提梁 + 梯形桶身，朝向水平步进方向微倾；站在水下格
 * 时泛红警示。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param facing - 水平朝向（-1 左 / 1 右，渲染层维护）。
 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: TideState, facing: number): void {
  const c = cellCenter(state.playerCol, state.playerRow)
  const bob = Math.sin(state.t / 300) * 1.5
  const underwater = state.playerRow < waterLineAt(Math.min(state.t, ROUND_MS))
  ctx.save()
  ctx.translate(c.x, c.y + bob)
  ctx.rotate(facing * 0.06)
  const body = underwater ? THEME.bad : '#7aa2f7'
  glow(ctx, body, 10)
  // 提梁。
  ctx.strokeStyle = '#c7d0e8'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(0, -2, 9, Math.PI, Math.PI * 2)
  ctx.stroke()
  // 桶身（上宽下窄）。
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(-11, -2)
  ctx.lineTo(11, -2)
  ctx.lineTo(8, 12)
  ctx.lineTo(-8, 12)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(-11, -2, 22, 3)
  ctx.restore()
}

/**
 * 画底部潮汐进度条：整轮时间轴，24s / 40s 刻度线，已过部分按相位着色
 * （退潮青 / 平潮绿 / 涨潮按剩余由金转红），未涨潮但接近涨潮时预警色。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawTimeline(ctx: CanvasRenderingContext2D, state: TideState): void {
  const barX = 36
  const barW = W - 72
  const barY = BOARD_Y + BOARD_H + 26
  const barH = 12
  ctx.fillStyle = '#26262e'
  roundRectPath(ctx, barX, barY, barW, barH, 6)
  ctx.fill()
  const k = Math.max(0, Math.min(1, state.t / ROUND_MS))
  if (k > 0) {
    const phase = tidePhaseAt(Math.min(state.t, ROUND_MS - 1))
    let color = '#7dcfff'
    if (phase === 'lull') color = THEME.good
    else if (phase === 'flood') {
      // 涨潮进度 → 金→红插值。
      const fk = Math.max(0, Math.min(1, (state.t - RETREAT_MS - LULL_MS) / FLOOD_MS))
      const g = Math.round(175 - fk * 81)
      color = 'rgb(224,' + g + ',' + Math.round(104 - fk * 42) + ')'
    }
    glow(ctx, color, 7)
    ctx.fillStyle = color
    roundRectPath(ctx, barX, barY, barW * k, barH, 6)
    ctx.fill()
    noGlow(ctx)
  }
  ctx.strokeStyle = '#34344a'
  ctx.lineWidth = 1
  roundRectPath(ctx, barX, barY, barW, barH, 6)
  ctx.stroke()
  // 涨潮起点刻度（40s）与低潮起点（24s）。
  ctx.strokeStyle = 'rgba(226,226,238,0.45)'
  for (const mark of [RETREAT_MS, RETREAT_MS + LULL_MS]) {
    const mx = barX + (mark / ROUND_MS) * barW
    ctx.beginPath()
    ctx.moveTo(mx, barY - 3)
    ctx.lineTo(mx, barY + barH + 3)
    ctx.stroke()
  }
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  const phase = tidePhaseAt(Math.min(state.t, ROUND_MS - 1))
  const label = phase === 'ebb' ? '退潮中 · 滩涂逐渐露出' : phase === 'lull' ? '平潮 · 拾贝黄金期' : '涨潮！快回岸上！'
  ctx.fillText(label, W / 2, barY + 30)
}

/**
 * 画 HUD：分数 / 命（水桶数）/ 轮次 / 相位倒计时。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: TideState): void {
  const hudY = 20
  hudPair(ctx, 10, hudY, '分数', String(state.score))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.gold
  ctx.fillText('🪣'.repeat(Math.max(0, state.lives)) || '—', W / 2 - 30, hudY)
  hudPair(ctx, W / 2 + 60, hudY, '轮', state.round + '/' + ROUNDS)
  const toFlood = RETREAT_MS + LULL_MS - state.t
  const secs = toFlood > 0 ? Math.ceil(toFlood / 1000) : 0
  hudPair(ctx, W - 10, hudY, secs > 0 ? '涨潮' : '水线', secs > 0 ? secs + 's' : '推进中', 'right', secs > 0 && secs <= 8 ? THEME.bad : THEME.text)
}

/**
 * 渲染一帧：背景、滩涂、海水、物品、玩家、时间轴、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export function renderTide(ctx: CanvasRenderingContext2D, state: TideState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawBeach(ctx)
  for (const it of state.items) drawItem(ctx, it, state.t)
  drawPlayer(ctx, state, 1)
  drawSea(ctx, state)
  drawTimeline(ctx, state)

  // 消费逻辑层事件：拾取按品种迸发，冲走 / 被卷红色迸发，换轮青色涟漪。
  for (const ev of state.events) {
    if (ev.type === 'pickup') {
      const c = cellCenter(ev.col, ev.row)
      particles.burst(c.x, c.y, ITEM_KINDS[ev.kind % ITEM_KINDS.length]!.color, 14, 150)
    } else if (ev.type === 'swept') {
      const c = cellCenter(ev.col, ev.row)
      particles.burst(c.x, c.y, THEME.bad, 22, 210)
    } else if (ev.type === 'wash') {
      const c = cellCenter(ev.col, ev.row)
      particles.burst(c.x, c.y, 'rgba(125,207,255,0.8)', 6, 90)
    } else if (ev.type === 'round') {
      particles.burst(W / 2, BOARD_Y + BOARD_H / 2, '#7dcfff', 18, 170)
    }
  }
  particles.tick(ctx, paused ? 0 : 16)

  drawHud(ctx, state)

  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
  } else if (state.phase === 'over') {
    const title = state.lives <= 0 ? '被浪卷走了' : '赶海收工'
    drawOverlay(ctx, W, H, title, '得分 ' + state.score + ' · 到达第 ' + state.round + '/' + ROUNDS + ' 轮 · 按 R 重开')
  }
}
