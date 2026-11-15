/**
 * 齿轮谜题 canvas 渲染：金属质感齿轮（视觉齿数与真实齿数一致、随传动
 * 方向与转速旋转）、动力轮绿色 / 目标轮金色、目标格方向箭头与转速标注、
 * 底部候选齿数槽（1-4 选中高亮）、关卡 HUD 与过关/暂停 overlay。
 * 使用共享视觉套件（../theme.ts）。文件内不使用模板字符串。
 */
import type { GearsState, Spin } from './logic.ts'
import { CANDIDATE_TEETH, checkOutput, computeTransmission, gearsUsed, winScore } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const CELL = 60
export const HUD_H = 44
export const SLOT_H = 64
export const MARGIN = 14
/** 最大盘面（第 5 关 7×6），小盘居中。 */
const MAX_W = 7
const MAX_H = 6
/** 固定逻辑画布尺寸。 */
export const LOGICAL_W = MAX_W * CELL + MARGIN * 2
export const LOGICAL_H = HUD_H + MARGIN + MAX_H * CELL + MARGIN + SLOT_H + 8

/** 视觉转速上限（°/s）：真实转速可能很大，动画按符号同向、幅度封顶。 */
const VISUAL_SPEED_CAP = 240
/** 齿轮金属渐变色（受电亮 / 闲置暗）。 */
const METAL_LIGHT = '#c9cede'
const METAL_DARK = '#565b70'
const METAL_EDGE = '#31344a'

// 渲染侧事件观察：过关瞬间在目标轮爆一次粒子。
const particles = createParticles()
let prevWon = false
let prevFrameMs = 0
/** 每格累计旋转角（°），key 为 'r:c'。 */
const animAngles = new Map<string, number>()

/** 渲染侧视图选项。 */
export interface GearsView {
  paused: boolean
}

function boardOffsets(w: number, h: number): { ox: number; oy: number } {
  return {
    ox: MARGIN + ((MAX_W - w) * CELL) / 2,
    oy: HUD_H + MARGIN + ((MAX_H - h) * CELL) / 2,
  }
}

/** 方向要求的箭头字形：顺 / 逆 / 任意。 */
function dirGlyph(dir: 'cw' | 'ccw' | 'any'): string {
  if (dir === 'cw') return '↻'
  if (dir === 'ccw') return '↺'
  return '◎'
}

/**
 * 一枚齿轮：外圈真实齿数的方齿 + 渐变轮体 + 轮毂 + 辐条，绕 angle 旋转。
 */
function drawGear(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  teeth: number, angleDeg: number, powered: boolean, hubColor: string,
): void {
  const radius = 16 + teeth * 0.55
  const body = radius - 5
  const rad = (angleDeg * Math.PI) / 180
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rad)
  // 齿：围绕轮体的粗短线，数量等于真实齿数。
  ctx.lineCap = 'butt'
  ctx.lineWidth = 5
  ctx.strokeStyle = powered ? METAL_LIGHT : METAL_DARK
  for (let i = 0; i < teeth; i += 1) {
    const a = (i * Math.PI * 2) / teeth
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * (body - 2), Math.sin(a) * (body - 2))
    ctx.lineTo(Math.cos(a) * (radius + 1), Math.sin(a) * (radius + 1))
    ctx.stroke()
  }
  // 轮体：金属渐变。
  const grad = ctx.createLinearGradient(-body, -body, body, body)
  if (powered) {
    grad.addColorStop(0, METAL_LIGHT)
    grad.addColorStop(1, '#8f94ab')
  } else {
    grad.addColorStop(0, METAL_DARK)
    grad.addColorStop(1, '#3d4157')
  }
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, body, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = METAL_EDGE
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 辐条 + 轮毂。
  ctx.strokeStyle = powered ? 'rgba(22,24,38,0.55)' : 'rgba(22,24,38,0.4)'
  ctx.lineWidth = 5
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5)
    ctx.lineTo(Math.cos(a) * (body - 5), Math.sin(a) * (body - 5))
    ctx.stroke()
  }
  glow(ctx, hubColor, powered ? 10 : 5)
  ctx.fillStyle = hubColor
  ctx.beginPath()
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.restore()
}

/** 推进所有齿轮的旋转动画角。 */
function advanceAnimation(
  w: number, h: number, info: (Spin | null)[][], dtMs: number,
): void {
  const dt = dtMs / 1000
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      const spin = info[r]![c]!
      const key = r + ':' + c
      const angle = animAngles.get(key) ?? 0
      const next = spin === null ? angle : angle + spin.dir * Math.min(Math.abs(spin.speed), VISUAL_SPEED_CAP) * dt
      animAngles.set(key, next % 360)
    }
  }
}

/** 底部候选齿数槽：迷你齿轮 + 齿数 + 数字键提示，选中槽高亮。 */
function drawSlots(ctx: CanvasRenderingContext2D, state: GearsState): void {
  const boxW = 92
  const gap = 8
  const total = CANDIDATE_TEETH.length * boxW + (CANDIDATE_TEETH.length - 1) * gap
  const x0 = (LOGICAL_W - total) / 2
  const y = LOGICAL_H - SLOT_H - 4
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.textAlign = 'left'
  ctx.fillText('备用齿轮（点击或按 1-4 选齿数，[/] 切换）', x0, y - 5)
  for (let i = 0; i < CANDIDATE_TEETH.length; i += 1) {
    const x = x0 + i * (boxW + gap)
    const selected = i === state.selected
    roundRectPath(ctx, x, y, boxW, SLOT_H, 10)
    ctx.fillStyle = selected ? 'rgba(122,162,247,0.16)' : 'rgba(255,255,255,0.03)'
    ctx.fill()
    ctx.strokeStyle = selected ? accent(0) : THEME.panelEdge
    ctx.lineWidth = selected ? 2 : 1
    if (selected) glow(ctx, accent(0), 8)
    ctx.stroke()
    noGlow(ctx)
    const teeth = CANDIDATE_TEETH[i]!
    drawGear(ctx, x + 30, y + SLOT_H / 2, teeth, animAngles.get('slot' + i) ?? 0, true,
      selected ? accent(0) : THEME.panelEdge)
    ctx.fillStyle = selected ? THEME.text : THEME.textMuted
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(teeth) + ' 齿', x + 66, y + SLOT_H / 2 - 2)
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('按 ' + (i + 1), x + 66, y + SLOT_H / 2 + 14)
  }
}

/** 画一帧。 */
export function renderGears(ctx: CanvasRenderingContext2D, state: GearsState, view: GearsView): void {
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(64, now - prevFrameMs)
  prevFrameMs = now

  const level = state.board
  const info = computeTransmission(level, state.placed)
  advanceAnimation(level.w, level.h, info, dtMs)
  // 槽内迷你齿轮匀速自转（仅装饰）。
  for (let i = 0; i < CANDIDATE_TEETH.length; i += 1) {
    const key = 'slot' + i
    animAngles.set(key, ((animAngles.get(key) ?? 0) + 30 * (dtMs / 1000)) % 360)
  }

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：关卡 / 用轮 / 得分 + 目标要求。
  hudPair(ctx, 12, 18, '关卡 ', String(state.level) + '/5')
  hudPair(ctx, 100, 18, '用轮 ', String(state.moves))
  hudPair(ctx, LOGICAL_W - 12, 18, '得分 ', String(state.score), 'right')
  let reqX = 12
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('目标', reqX, 36)
  reqX += ctx.measureText('目标 ').width
  for (const out of level.outputs) {
    const check = checkOutput(level, state.placed, out)
    const label = dirGlyph(out.dir) + (out.minSpeed > 0 ? ' ≥' + out.minSpeed + '°/s' : '')
    ctx.fillStyle = check.met ? THEME.good : THEME.textMuted
    ctx.fillText(label, reqX, 36)
    reqX += ctx.measureText(label + '  ').width
  }

  const { ox, oy } = boardOffsets(level.w, level.h)
  const targetAt = (r: number, c: number) => level.outputs.find(o => o.pos.r === r && o.pos.c === c)

  // 盘面格子与齿轮。
  for (let r = 0; r < level.h; r += 1) {
    for (let c = 0; c < level.w; c += 1) {
      const x = ox + c * CELL
      const y = oy + r * CELL
      const kind = level.cells[r]![c]!
      if (kind === 'void') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8)
        ctx.strokeStyle = 'rgba(52,52,74,0.4)'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 4.5, y + 4.5, CELL - 9, CELL - 9)
        continue
      }
      ctx.fillStyle = 'rgba(255,255,255,0.025)'
      ctx.fillRect(x, y, CELL, CELL)
      ctx.strokeStyle = 'rgba(52,52,74,0.6)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1)
      const cx = x + CELL / 2
      const cy = y + CELL / 2
      const spin = info[r]![c]!
      const powered = spin !== null
      const angle = animAngles.get(r + ':' + c) ?? 0
      const out = targetAt(r, c)
      if (kind === 'motor') {
        drawGear(ctx, cx, cy, level.motorTeeth, angle, powered, THEME.good)
        ctx.fillStyle = THEME.good
        ctx.font = 'bold 10px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('动力 ' + level.motorTeeth, cx, y + CELL - 5)
      } else if (kind === 'target') {
        const check = checkOutput(level, state.placed, out!)
        const hub = check.met ? THEME.good : THEME.gold
        const teeth = state.placed[out!.pos.r]![out!.pos.c]
        // 目标轮未放置时画虚线空槽提示（放置后按实际齿数绘制）。
        if (teeth === null) {
          ctx.save()
          ctx.setLineDash([4, 3])
          ctx.strokeStyle = THEME.gold
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(cx, cy, CELL * 0.36, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        } else {
          drawGear(ctx, cx, cy, teeth ?? 12, angle, powered, hub)
        }
        // 方向要求箭头 + 实时转速。
        ctx.font = 'bold 13px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = check.met ? THEME.good : THEME.textMuted
        ctx.fillText(dirGlyph(out!.dir), cx + CELL / 2 - 8, y + 14)
        if (powered) {
          ctx.font = '600 10px system-ui, sans-serif'
          ctx.fillStyle = check.met ? THEME.good : THEME.text
          ctx.fillText(String(Math.round(spin!.speed)) + '°/s', cx, y + CELL - 5)
        }
      } else {
        const teeth: number | null = state.placed[r]![c] ?? null
        if (teeth === null) {
          ctx.strokeStyle = 'rgba(122,162,247,0.25)'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.arc(cx, cy, 9, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          drawGear(ctx, cx, cy, teeth, angle, powered, powered ? accent(0) : METAL_EDGE)
          ctx.font = '600 10px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillStyle = powered ? THEME.text : THEME.textMuted
          ctx.fillText(String(teeth), cx, y + CELL - 5)
        }
      }
    }
  }

  drawSlots(ctx, state)

  // 过关瞬间粒子爆发。
  if (state.status === 'won' && !prevWon) {
    for (const out of level.outputs) {
      particles.burst(ox + out.pos.c * CELL + CELL / 2, oy + out.pos.r * CELL + CELL / 2, THEME.gold, 22, 170)
    }
  }
  prevWon = state.status === 'won'
  particles.tick(ctx, dtMs)

  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续游戏', THEME.text)
  } else if (state.status === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '传动成功！',
      '+' + String(winScore(state.level, gearsUsed(state.placed))) + ' · 按 N 或稍后进入下一关', THEME.good)
  }
}
