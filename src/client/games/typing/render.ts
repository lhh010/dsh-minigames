/**
 * Typing meteors canvas renderer on the shared theme kit: gradient starry
 * backdrop, glowing monospace words (locked word highlighted, typed prefix
 * good-green, next letter underlined accent), a bad-glow danger line, a
 * lives/score/streak HUD, and themed pause/game-over overlays. Stateless —
 * all state is passed in.
 */
import { FALL_LINE_Y, type TypingState } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

export const LOGICAL_W = 480
export const LOGICAL_H = 560
export const HUD_H = 30

export const WORD_FONT = 'bold 19px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Draw one word at (x, y): locked words get plate/glow/prefix treatment. */
function drawWord(ctx: CanvasRenderingContext2D, state: TypingState, word: { id: number; text: string; x: number; y: number }): void {
  const locked = word.id === state.lockId
  const cx = word.x
  const top = word.y
  if (locked) {
    // Typed prefix in green.
    glow(ctx, accent(0), 14)
    ctx.fillStyle = THEME.good
    ctx.fillText(word.text.slice(0, state.typed.length), cx, top)
    // Next letter underlined in accent.
    const prefixW = ctx.measureText(word.text.slice(0, state.typed.length)).width
    const next = word.text[state.typed.length] ?? ''
    const nextW = next === '' ? 0 : ctx.measureText(next).width
    ctx.fillStyle = accent(0)
    ctx.fillText(next, cx + prefixW, top)
    if (next !== '') {
      ctx.fillRect(cx + prefixW, top + 10, nextW, 2)
    }
    // Remaining letters bright.
    ctx.fillStyle = THEME.text
    ctx.fillText(word.text.slice(state.typed.length + (next === '' ? 0 : 1)), cx + prefixW + nextW, top)
    noGlow(ctx)
  } else {
    glow(ctx, THEME.textMuted, 4)
    ctx.fillStyle = THEME.text
    ctx.fillText(word.text, cx, top)
    noGlow(ctx)
  }
}

/** A few dim stars so the fall reads like a meteor shower. */
const STARS: Array<{ x: number; y: number; r: number }> = []
for (let i = 0; i < 26; i += 1) {
  STARS.push({ x: (i * 97 + 31) % LOGICAL_W, y: (i * 173 + 47) % (FALL_LINE_Y - 60) + 40, r: (i % 3) * 0.5 + 0.6 })
}

/**
 * Draw one frame.
 * @param shakeDx - horizontal shake offset (px) applied to the word field.
 */
export function renderTyping(ctx: CanvasRenderingContext2D, state: TypingState, paused: boolean, shakeDx = 0): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  for (const star of STARS) {
    ctx.fillStyle = THEME.textMuted
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Danger line with a bad glow.
  glow(ctx, THEME.bad, 12)
  ctx.strokeStyle = THEME.bad
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, FALL_LINE_Y)
  ctx.lineTo(LOGICAL_W, FALL_LINE_Y)
  ctx.stroke()
  noGlow(ctx)

  ctx.save()
  ctx.translate(shakeDx, 0)
  ctx.font = WORD_FONT
  ctx.textBaseline = 'middle'
  // Words anchor at their LEFT margin (spawn x is left-based); hudPair leaves
  // textAlign at 'right'/'center' after each frame's HUD pass, and inheriting
  // it here right-aligns every segment — the typed prefix, next letter, and
  // rest then tile backwards over each other and visually swallow letters.
  ctx.textAlign = 'left'
  // Unlocked words first so the locked word draws on top of any crossing word.
  for (const word of state.words) {
    if (word.id === state.lockId) continue
    drawWord(ctx, state, word)
  }
  const lockedWord = state.words.find(word => word.id === state.lockId)
  if (lockedWord !== undefined) {
    // Darker backing plate keeps the locked word readable over other words.
    const textW = ctx.measureText(lockedWord.text).width
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.beginPath()
    ctx.roundRect(lockedWord.x - 8, lockedWord.y - 14, textW + 16, 28, 6)
    ctx.fill()
    drawWord(ctx, state, lockedWord)
  }
  ctx.restore()
  ctx.textBaseline = 'alphabetic'

  // HUD strip: lives / streak / score.
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, LOGICAL_W - 1, HUD_H - 1)
  hudPair(ctx, 10, 20, '生命 ', '❤'.repeat(state.lives) || '—', 'left', THEME.bad)
  hudPair(ctx, LOGICAL_W / 2, 20, '连击 ', String(state.streak), 'center', state.streak >= 5 ? THEME.gold : THEME.text)
  hudPair(ctx, LOGICAL_W - 10, 20, '得分 ', String(state.score), 'right', THEME.gold)

  if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `得分 ${state.score} · 按 R 重开`, THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}
