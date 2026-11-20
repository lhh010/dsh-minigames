import { describe, expect, it } from 'vitest'
import {
  BEAT_GAP_MS, BEAT_MS, CHORD_LEVEL, LEVEL_BONUS, MAX_HINTS, MAX_LEVEL, NOTE_SCORE, PENTATONIC,
  SCALE, SOLFEGE, START_LIVES, buildPlayback, createMusicBoxState, finishPlayback, generateMelody,
  inputNote, levelLength, levelPlays, mulberry32, nextLevel, remainingNotes, startPlayback, useHint,
  type MusicBoxState,
} from '../src/client/games/musicbox/logic.ts'

/** 完整播放一轮后进入输入态。 */
function toInput(state: MusicBoxState): void {
  expect(startPlayback(state)).toBe(true)
  expect(finishPlayback(state)).toBe(true)
}

/** 用旋律本身作答，走完当前关。 */
function answerAll(state: MusicBoxState): void {
  for (const step of state.melody) {
    for (const n of step.notes) {
      const r = inputNote(state, n)
      expect(['correct', 'slot-done', 'level-clear']).toContain(r)
    }
  }
}

describe('musicbox logic', () => {
  it('mulberry32 同种子序列一致，且分布在 [0,1)', () => {
    const a = mulberry32(20260101)
    const b = mulberry32(20260101)
    for (let i = 0; i < 100; i += 1) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('开局状态：第 1 关 5 音、3 命、2 提示、3 次播放，音符全在五声音阶', () => {
    const s = createMusicBoxState(7)
    expect(s.phase).toBe('listening')
    expect(s.level).toBe(1)
    expect(s.lives).toBe(START_LIVES)
    expect(s.hintsLeft).toBe(MAX_HINTS)
    expect(s.playsLeft).toBe(3)
    expect(s.melody).toHaveLength(levelLength(1))
    expect(s.score).toBe(0)
    for (const step of s.melody) {
      expect(step.beats === 1 || step.beats === 2).toBe(true)
      for (const n of step.notes) expect(PENTATONIC).toContain(n)
    }
    // 开局处于 listening：不应接受输入。
    expect(inputNote(s, 0)).toBe('ignored')
  })

  it('关卡参数递进：长度 5..9，播放次数 3 3 2 2 1', () => {
    expect([1, 2, 3, 4, 5].map(levelLength)).toEqual([5, 6, 7, 8, 9])
    expect([1, 2, 3, 4, 5].map(levelPlays)).toEqual([3, 3, 2, 2, 1])
  })

  it('generateMelody 同种子确定，音级合法、无三连同音、和弦仅限后期且有序', () => {
    const p = PENTATONIC as readonly number[]
    for (const level of [1, 2, 3, 4, 5]) {
      const a = generateMelody(mulberry32(99), level)
      const b = generateMelody(mulberry32(99), level)
      expect(a).toEqual(b)
      expect(a).toHaveLength(levelLength(level))
      let run = 1
      for (let i = 0; i < a.length; i += 1) {
        const step = a[i]!
        expect(step.notes.length).toBeLessThanOrEqual(2)
        for (const n of step.notes) expect(p).toContain(n)
        if (step.notes.length === 2) {
          expect(level).toBeGreaterThanOrEqual(CHORD_LEVEL)
          expect(step.notes[0]!).toBeLessThan(step.notes[1]!)
        }
        if (i > 0) {
          const prev = a[i - 1]!
          run = prev.notes[0] === step.notes[0] ? run + 1 : 1
          expect(run).toBeLessThan(3)
        }
      }
    }
    // 前三关绝无和弦。
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = generateMelody(mulberry32(seed), 2)
      for (const step of m) expect(step.notes).toHaveLength(1)
    }
  })

  it('buildPlayback：时间表严格递增、时长与时值匹配、含间隙', () => {
    const s = createMusicBoxState(42)
    const ev = buildPlayback(s.melody)
    expect(ev).toHaveLength(s.melody.length)
    let at = 0
    for (let i = 0; i < ev.length; i += 1) {
      const e = ev[i]!
      expect(e.slot).toBe(i)
      expect(e.notes).toEqual(s.melody[i]!.notes)
      expect(e.atMs).toBe(at)
      expect(e.durMs).toBe(BEAT_MS * s.melody[i]!.beats)
      at += e.durMs + BEAT_GAP_MS
    }
  })

  it('完整复现第 1 关：逐拍全对，得分 = 音数*10 + 关数*50，进入过关态', () => {
    const s = createMusicBoxState(5)
    toInput(s)
    answerAll(s)
    expect(s.phase).toBe('level-clear')
    const notes = s.melody.reduce((sum, st) => sum + st.notes.length, 0)
    expect(s.score).toBe(notes * NOTE_SCORE + 1 * LEVEL_BONUS)
    expect(s.lives).toBe(START_LIVES)
    // 过关态不接受输入与提示。
    expect(inputNote(s, 0)).toBe('ignored')
    expect(useHint(s)).toBe(null)
  })

  it('答错扣一命、当前拍进度清零；三次答错游戏结束', () => {
    const s = createMusicBoxState(11)
    toInput(s)
    const target = s.melody[0]!.notes[0]!
    const wrong = (target + 1) % SCALE
    // 先故意点错：命 3->2，slotFilled 清零。
    expect(inputNote(s, wrong)).toBe('miss')
    expect(s.lives).toBe(2)
    expect(s.slotFilled[0]).toBe(0)
    // 再连点两拍"必错音"（当前拍剩余集合之外的音），命耗尽即结束。
    for (let i = 0; i < 2; i += 1) {
      const rest = remainingNotes(s)
      const bad = [0, 1, 2, 3, 4, 5, 6].find(n => !rest.includes(n))!
      expect(inputNote(s, bad)).toBe(i === 0 ? 'miss' : 'game-over')
    }
    expect(s.phase).toBe('game-over')
    expect(s.lives).toBe(0)
  })

  it('非输入态与非法音级被忽略；播放门控与重听', () => {
    const s = createMusicBoxState(13)
    expect(inputNote(s, -1)).toBe('ignored')
    expect(inputNote(s, SCALE)).toBe('ignored')
    // listening 未播完不能切输入态、不能输入。
    expect(finishPlayback(s)).toBe(true)
    expect(s.phase).toBe('input')
    // 本处直接 finishPlayback 未耗次数：仍满 3 次。
    expect(s.playsLeft).toBe(3)
    expect(startPlayback(s)).toBe(true)
    expect(s.playsLeft).toBe(2)
    expect(finishPlayback(s)).toBe(true)
    // 输入中途重播会回到第一拍并清空已填。
    inputNote(s, s.melody[0]!.notes[0]!)
    expect(startPlayback(s)).toBe(true)
    expect(s.phase).toBe('listening')
    expect(finishPlayback(s)).toBe(true)
    expect(s.inputIndex).toBe(0)
    expect(s.slotFilled.every(m => m === 0)).toBe(true)
    // 次数耗尽后不能再播。
    expect(startPlayback(s)).toBe(true)
    expect(s.playsLeft).toBe(0)
    expect(startPlayback(s)).toBe(false)
  })

  it('提示：揭示当前拍剩余唱名，全局限 2 次，拍完成即失效', () => {
    const s = createMusicBoxState(21)
    toInput(s)
    const first = s.melody[0]!.notes[0]!
    expect(useHint(s)).toEqual([first])
    expect(s.hintsLeft).toBe(1)
    expect(s.hintNotes).toEqual([first])
    // 填对后提示清空；下一拍可再提示一次。
    expect(inputNote(s, first)).toBe(s.melody[0]!.notes.length > 1 ? 'correct' : 'slot-done')
    expect(s.hintNotes).toBe(null)
    if (s.phase === 'input') {
      expect(useHint(s)).toEqual(remainingNotes(s))
      expect(s.hintsLeft).toBe(0)
      expect(useHint(s)).toBe(null)
    }
    expect(s.hintsLeft).toBeLessThanOrEqual(0)
  })

  it('五关全通关：nextLevel 逐关推进，第 5 关后 complete', () => {
    const s = createMusicBoxState(33)
    let guard = 0
    while (s.phase !== 'complete' && guard < 50) {
      guard += 1
      toInput(s)
      answerAll(s)
      expect(s.phase).toBe('level-clear')
      expect(nextLevel(s)).toBe(true)
    }
    expect(s.phase).toBe('complete')
    expect(s.level).toBe(MAX_LEVEL)
    expect(s.melody).toHaveLength(levelLength(MAX_LEVEL))
    // 通关后不再推进。
    expect(nextLevel(s)).toBe(false)
  })

  it('nextLevel 仅在过关态可用；游戏结束后一切推进拒绝', () => {
    const s = createMusicBoxState(77)
    expect(nextLevel(s)).toBe(false)
    toInput(s)
    const target = s.melody[0]!.notes[0]!
    for (let i = 0; i < START_LIVES; i += 1) inputNote(s, (target + 3) % SCALE)
    expect(s.phase).toBe('game-over')
    expect(nextLevel(s)).toBe(false)
    expect(startPlayback(s)).toBe(false)
    expect(useHint(s)).toBe(null)
  })

  it('唱名表与常量自洽：七唱名、五声子集、同种子全局可重放', () => {
    expect(SOLFEGE).toHaveLength(SCALE)
    expect(PENTATONIC.every(n => n >= 0 && n < SCALE)).toBe(true)
    const a = createMusicBoxState(1234)
    const b = createMusicBoxState(1234)
    let level = 1
    while (a.phase !== 'complete') {
      expect(a.melody).toEqual(b.melody)
      expect(a.level).toBe(level)
      toInput(a)
      toInput(b)
      answerAll(a)
      answerAll(b)
      expect(a.score).toBe(b.score)
      nextLevel(a)
      nextLevel(b)
      level += 1
    }
    expect(a.melody).toEqual(b.melody)
  })
})
