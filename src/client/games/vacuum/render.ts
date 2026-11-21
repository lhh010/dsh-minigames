/**
 * 清扫规划（Vacuum）渲染：俯视房间——地板棋盘纹理、家具俯视图、发光
 * 充电桩、圆盘机器人（方向指示 + 清扫痕迹渐显）、宠物猫、HUD（电量条
 * / 充电次数 / 关卡 / 覆盖率大百分比）、底部常驻速览与过关/失败/暂停
 * overlay。纯绘制无状态；布局随关卡网格尺寸自适应居中。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, noGlow, roundRectPath } from '../theme.ts'
import type { VacuumDir, VacuumState } from './logic.ts'
import { FINAL_LEVEL } from './logic.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 640
export const LOGICAL_H = 480

/** HUD 行基线（画布顶部带）。 */
const HUD_Y = 24
/** 网格区上缘 / 下缘（下缘以下是常驻速览行）。 */
const BOARD_TOP = 44
const BOARD_BOTTOM = LOGICAL_H - 26

/** 求某格中心的像素坐标（含边距自适应居中）。 */
export function vacuumCellCenter(
  state: VacuumState,
  x: number,
  y: number,
): { cx: number; cy: number; cs: number; ox: number; oy: number } {
  const { cols, rows } = state.room
  const cs = Math.max(10, Math.min(Math.floor((LOGICAL_W - 32) / cols), Math.floor((BOARD_BOTTOM - BOARD_TOP - 8) / rows)))
  const ox = Math.floor((LOGICAL_W - cs * cols) / 2)
  const oy = BOARD_TOP + Math.floor((BOARD_BOTTOM - BOARD_TOP - cs * rows) / 2)
  return { cx: ox + x * cs + cs / 2, cy: oy + y * cs + cs / 2, cs, ox, oy }
}

/** 顶部 HUD：电量条、充电次数 ⚡、关卡、右侧覆盖率大百分比。 */
function drawHud(ctx: CanvasRenderingContext2D, state: VacuumState): void {
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('电量', 16, HUD_Y)
  // 电量条：x 48..198。
  roundRectPath(ctx, 48, HUD_Y - 12, 150, 14, 7)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  const ratio = Math.max(0, Math.min(1, state.battery / state.cfg.battery))
  if (ratio > 0) {
    ctx.fillStyle = ratio > 0.5 ? THEME.good : ratio > 0.25 ? THEME.gold : THEME.bad
    roundRectPath(ctx, 50, HUD_Y - 10, Math.max(3, 146 * ratio), 10, 5)
    ctx.fill()
  }
  // 充电次数：⚡ 从 x 206 起，每枚间隔 18。
  ctx.font = '600 14px system-ui, sans-serif'
  for (let i = 0; i < state.cfg.recharges; i += 1) {
    ctx.fillStyle = i < state.recharges ? THEME.gold : THEME.textMuted
    ctx.fillText('⚡', 206 + i * 18, HUD_Y)
  }
  // 关卡：固定左锚 x 270（3 次 ⚡ 最远到 206+2*18+14=256，留 14px 间距）。
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('关卡', 270, HUD_Y)
  ctx.fillStyle = THEME.text
  ctx.fillText(state.level + '/' + FINAL_LEVEL, 270 + ctx.measureText('关卡 ').width, HUD_Y)
  // 覆盖率：大号百分比右锚 W-16，标签排在其左侧（右锚，随值宽左移）。
  const pct = Math.floor((state.cleanedCount / state.reachableCount) * 100)
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = accent(2)
  const pctText = pct + '%'
  ctx.fillText(pctText, LOGICAL_W - 16, HUD_Y + 6)
  const pctWidth = ctx.measureText(pctText).width
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('清扫', LOGICAL_W - 16 - pctWidth - 8, HUD_Y)
}

/** 房间：地板棋盘、已清扫微亮、家具俯视、充电桩发光。 */
function drawRoom(ctx: CanvasRenderingContext2D, state: VacuumState): void {
  const { cols, rows, cells, dock } = state.room
  const { cs, ox, oy } = vacuumCellCenter(state, 0, 0)
  roundRectPath(ctx, ox - 10, oy - 10, cs * cols + 20, cs * rows + 20, 12)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const i = y * cols + x
      const px = ox + x * cs
      const py = oy + y * cs
      // 地板棋盘纹理。
      ctx.fillStyle = (x + y) % 2 === 0 ? '#20202c' : '#1c1c27'
      ctx.fillRect(px, py, cs, cs)
      if (state.cleaned[i] === 1) {
        // 已清扫格微亮 + 轻微清扫痕纹理。
        ctx.fillStyle = 'rgba(158,206,106,0.09)'
        ctx.fillRect(px, py, cs, cs)
        ctx.fillStyle = 'rgba(158,206,106,0.16)'
        ctx.fillRect(px + cs * 0.3, py + cs * 0.62, cs * 0.4, Math.max(1, cs * 0.06))
      }
      if (cells[i] === 1) {
        // 家具俯视：圆角矩形 + 坐垫两道横线。
        roundRectPath(ctx, px + 2, py + 2, cs - 4, cs - 4, 5)
        ctx.fillStyle = '#3a3a52'
        ctx.fill()
        ctx.strokeStyle = '#4a4a68'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.strokeStyle = 'rgba(26,26,38,0.9)'
        ctx.beginPath()
        ctx.moveTo(px + 5, py + cs * 0.38)
        ctx.lineTo(px + cs - 5, py + cs * 0.38)
        ctx.moveTo(px + 5, py + cs * 0.62)
        ctx.lineTo(px + cs - 5, py + cs * 0.62)
        ctx.stroke()
      }
    }
  }
  // 充电桩：金色发光圆垫 + ⚡。
  const dockC = vacuumCellCenter(state, dock.x, dock.y)
  glow(ctx, THEME.gold, 12)
  ctx.fillStyle = 'rgba(224,175,104,0.28)'
  ctx.beginPath()
  ctx.arc(dockC.cx, dockC.cy, dockC.cs * 0.42, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.font = '600 ' + Math.max(10, Math.floor(dockC.cs * 0.5)) + 'px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = THEME.gold
  ctx.fillText('⚡', dockC.cx, dockC.cy + 1)
  ctx.textBaseline = 'alphabetic'
}

/** 宠物猫：粉色圆身 + 两只耳朵 + 尾巴。 */
function drawCat(ctx: CanvasRenderingContext2D, state: VacuumState): void {
  if (state.cat === null) return
  const { cx, cy, cs } = vacuumCellCenter(state, state.cat.x, state.cat.y)
  const r = cs * 0.3
  ctx.fillStyle = THEME.bad
  glow(ctx, THEME.bad, 8)
  ctx.beginPath()
  ctx.arc(cx, cy + cs * 0.04, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.beginPath()
  ctx.moveTo(cx - r, cy - r * 0.5)
  ctx.lineTo(cx - r * 0.45, cy - r * 1.15)
  ctx.lineTo(cx - r * 0.05, cy - r * 0.55)
  ctx.moveTo(cx + r, cy - r * 0.5)
  ctx.lineTo(cx + r * 0.45, cy - r * 1.15)
  ctx.lineTo(cx + r * 0.05, cy - r * 0.55)
  ctx.fill()
  ctx.strokeStyle = THEME.bad
  ctx.lineWidth = Math.max(1.5, cs * 0.05)
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.9, cy + cs * 0.05)
  ctx.quadraticCurveTo(cx + r * 1.7, cy - cs * 0.1, cx + r * 1.4, cy - cs * 0.28)
  ctx.stroke()
}

/** 机器人：圆盘 + 朝向楔形指示 + 外圈微光。 */
function drawRobot(ctx: CanvasRenderingContext2D, state: VacuumState): void {
  const { cx, cy, cs } = vacuumCellCenter(state, state.robot.x, state.robot.y)
  const r = cs * 0.36
  const angle: Record<VacuumDir, number> = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }
  glow(ctx, accent(0), 10)
  ctx.fillStyle = '#2a2a3e'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = accent(0)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = accent(0)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle[state.facing])
  ctx.beginPath()
  ctx.moveTo(r * 0.72, 0)
  ctx.lineTo(r * 0.1, -r * 0.42)
  ctx.lineTo(r * 0.1, r * 0.42)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * 整帧绘制入口。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 * @param opts - paused：暂停遮罩；allDone：五关全通终局遮罩。
 */
export function renderVacuum(
  ctx: CanvasRenderingContext2D,
  state: VacuumState,
  opts: { paused: boolean; allDone: boolean },
): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawHud(ctx, state)
  drawRoom(ctx, state)
  drawCat(ctx, state)
  drawRobot(ctx, state)
  // 底部常驻速览（居中单行）。
  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('方向键/WASD 或点相邻格移动 · 经过即清扫 · 电量归零前回 ⚡ 桩补满（次数有限）· 清完全部可达格过关', LOGICAL_W / 2, LOGICAL_H - 9)
  if (opts.allDone) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部清扫完毕', '规划大师！按 R 再来一轮', THEME.good)
  } else if (state.status === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '本关完成', '即将进入下一关…', THEME.good)
  } else if (state.status === 'dead') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '电量耗尽', '规划好回桩路线，按 R 重开本关', THEME.bad)
  } else if (opts.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}
