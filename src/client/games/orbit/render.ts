/**
 * 引力弹弓 Orbit 渲染层：深空星空（seed 确定性生成 + 视差微移）、
 * 质量着色行星与引力场淡圈层、发射拖拽矢量箭头与预测虚线、探针尾迹
 * 渐隐、信标脉冲光环、撞击爆炸粒子、HUD 与结算 overlay。全部为纯
 * canvas 绘制，状态由 logic 提供。
 */
import {
  THEME, accent, glow, noGlow, drawBackground, drawOverlay, hudPair, createParticles,
} from '../theme.ts'
import {
  W, H, G, currentLevel, predictPath, replayReference, generateStarfield,
  type OrbitState, type OrbitLevel,
} from './logic.ts'

/** 一份按关卡缓存的渲染资源：星空与参考解路径（提示演示）。 */
export interface OrbitRenderer {
  /** 绘制一帧完整场景（含 HUD 与结算 overlay）。 */
  draw(ctx: CanvasRenderingContext2D, state: OrbitState, paused: boolean): void
  /** 在某点触发撞击爆炸粒子。 */
  burst(x: number, y: number, color?: string): void
}

/** 失败原因的中文说明。 */
function lostText(reason: string): string {
  if (reason === 'crash') return '撞上了天体 · 空格继续观察，R 重开'
  if (reason === 'out') return '飞出深空边界 · 调整力度再试'
  return '燃料耗尽漂失 · 试一条更短的航线'
}

/** 质量分档着色（越大越暖）。 */
function planetColor(mass: number): string {
  if (mass >= 800) return accent(4)
  if (mass >= 500) return accent(3)
  if (mass >= 380) return accent(1)
  return accent(0)
}

/**
 * 创建渲染器（星空与提示路径按需缓存）。
 * @param seed - 与逻辑侧相同的注入种子（星空可复现）。
 * @returns 渲染器句柄。
 */
export function createOrbitRenderer(seed: number): OrbitRenderer {
  const stars = generateStarfield(seed)
  const particles = createParticles()
  let hintLevelIndex = -1
  let hintPath: { x: number, y: number }[] = []

  /** 画行星：本体 + 两圈引力场淡圈（等加速度半径 r = sqrt(G*m/a)）。 */
  const drawPlanet = (ctx: CanvasRenderingContext2D, p: OrbitLevel['planets'][number]): void => {
    const color = planetColor(p.mass)
    for (const a of [90, 25]) {
      const r = Math.sqrt((G * p.mass) / a)
      ctx.strokeStyle = 'rgba(160,180,255,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    glow(ctx, color, 18)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.beginPath()
    ctx.arc(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }

  const draw = (ctx: CanvasRenderingContext2D, state: OrbitState, paused: boolean): void => {
    const level = currentLevel(state)
    drawBackground(ctx, W, H)

    // 星空：三层视差微移（动画时钟驱动，不随倍速）。
    const t = state.timeMs / 1000
    for (const s of stars) {
      const drift = (s.x + t * (1.5 + s.layer * 2)) % W
      ctx.globalAlpha = s.alpha * (0.55 + s.layer * 0.22)
      ctx.fillStyle = '#c8d0f0'
      ctx.fillRect(drift, s.y, s.r, s.r)
    }
    ctx.globalAlpha = 1

    // 小行星带障碍。
    for (const a of level.asteroids) {
      ctx.fillStyle = '#6b6f82'
      glow(ctx, '#6b6f82', 6)
      ctx.beginPath()
      ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
    }

    for (const p of level.planets) drawPlanet(ctx, p)

    // 空间站（起点）。
    ctx.save()
    ctx.translate(level.station.x, level.station.y)
    ctx.fillStyle = THEME.text
    glow(ctx, THEME.text, 10)
    ctx.fillRect(-5, -5, 10, 10)
    noGlow(ctx)
    ctx.strokeStyle = 'rgba(226,226,238,0.4)'
    ctx.lineWidth = 1
    ctx.strokeRect(-9, -9, 18, 18)
    ctx.restore()

    // 信标：脉冲光环。
    const pulse = 0.5 + 0.5 * Math.sin(state.timeMs / 260)
    const b = level.beacon
    glow(ctx, THEME.gold, 16)
    ctx.strokeStyle = THEME.gold
    ctx.globalAlpha = 0.55 + pulse * 0.45
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.25 + pulse * 0.3
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.radius + 6 + pulse * 8, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = THEME.gold
    ctx.beginPath()
    ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)

    // H 提示：参考解前半段半透明演示。
    if (state.hintVisible && state.phase === 'aim') {
      if (hintLevelIndex !== state.levelIndex) {
        hintPath = replayReference(level).path
        hintLevelIndex = state.levelIndex
      }
      const half = Math.ceil(hintPath.length / 2)
      ctx.strokeStyle = 'rgba(224,175,104,0.4)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(level.station.x, level.station.y)
      for (let i = 0; i < half; i += 1) ctx.lineTo(hintPath[i]!.x, hintPath[i]!.y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 尾迹：越早越透明。
    if (state.trail.length > 1) {
      const n = state.trail.length
      ctx.strokeStyle = accent(6)
      ctx.lineWidth = 2
      for (let i = 1; i < n; i += 1) {
        ctx.globalAlpha = Math.max(0.06, (i / n) * 0.8)
        ctx.beginPath()
        ctx.moveTo(state.trail[i - 1]!.x, state.trail[i - 1]!.y)
        ctx.lineTo(state.trail[i]!.x, state.trail[i]!.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // 探针。
    if (state.probe !== null) {
      glow(ctx, accent(6), 12)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(state.probe.x, state.probe.y, 4.5, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
    }

    // 瞄准阶段：矢量箭头 + 预测虚线（前 60 子步衰减透明度）。
    if (state.phase === 'aim') {
      const speed = Math.hypot(state.aimVx, state.aimVy)
      if (speed > 1) {
        const len = Math.min(110, 26 + speed * 0.22)
        const ux = state.aimVx / speed
        const uy = state.aimVy / speed
        const sx = level.station.x
        const sy = level.station.y
        ctx.strokeStyle = accent(5)
        ctx.lineWidth = 2.5
        glow(ctx, accent(5), 8)
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + ux * len, sy + uy * len)
        ctx.stroke()
        // 箭头头部。
        const hx = sx + ux * len
        const hy = sy + uy * len
        ctx.beginPath()
        ctx.moveTo(hx + ux * 9, hy + uy * 9)
        ctx.lineTo(hx - uy * 5, hy + ux * 5)
        ctx.lineTo(hx + uy * 5, hy - ux * 5)
        ctx.closePath()
        ctx.fillStyle = accent(5)
        ctx.fill()
        noGlow(ctx)
        // 预测虚线。
        const pts = predictPath(level, state.aimVx, state.aimVy, 60)
        for (let i = 0; i < pts.length; i += 1) {
          ctx.globalAlpha = Math.max(0.05, 0.75 * (1 - i / 60))
          ctx.fillStyle = accent(5)
          ctx.fillRect(pts[i]!.x - 1.5, pts[i]!.y - 1.5, 3, 3)
        }
        ctx.globalAlpha = 1
      }
    }

    particles.tick(ctx, 16)

    // HUD。
    hudPair(ctx, 12, 22, level.name, '', 'left')
    const bestText = state.bestDistance === Infinity ? '--' : Math.round(state.bestDistance) + ' px'
    hudPair(ctx, W - 12, 22, '最佳接近', bestText, 'right', state.bestDistance < 40 ? THEME.good : THEME.text)
    hudPair(ctx, W - 12, 42, '发射', String(state.launches), 'right')
    hudPair(ctx, W - 12, 62, '倍速', '×' + state.speed, 'right')
    hudPair(ctx, 12, 42, '得分', String(state.score))
    if (state.hintVisible) {
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = THEME.gold
      ctx.fillText('提示：金色虚线为参考解前半段', 12, 62)
    }

    if (paused && state.phase !== 'won' && state.phase !== 'lost') {
      drawOverlay(ctx, W, H, '暂停', '空格 / P 继续 · R 重开')
    } else if (state.phase === 'lost') {
      drawOverlay(ctx, W, H, '任务失败', lostText(state.lostReason), THEME.bad)
    } else if (state.phase === 'won') {
      const sub = state.allDone
        ? '全部通关 · 得分 ' + state.score
        : '进入下一关 · 得分 ' + state.score
      drawOverlay(ctx, W, H, state.allDone ? '全部通关' : '抵达信标', sub, THEME.good)
    }
  }

  return {
    draw,
    burst(x, y, color = THEME.bad): void {
      particles.burst(x, y, color, 16, 160)
    },
  }
}
