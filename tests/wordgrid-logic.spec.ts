import { describe, expect, it } from 'vitest'
import {
  DIRS, LEVELS, MAX_ATTEMPTS, MAX_HINTS, SIZE, WORDS,
  canExtend, chainWord, createLevelState, isAdjacent, isValidChain,
  mulberry32, nextLevelState, revealHint, startPosText, submitChain,
} from '../src/client/games/wordgrid/logic.ts'

describe('wordgrid 种子与生成', () => {
  it('mulberry32：同 seed 序列一致，不同 seed 序列不同', () => {
    const a1 = mulberry32(42), a2 = mulberry32(42), b = mulberry32(43)
    for (let i = 0; i < 20; i += 1) expect(a1()).toBe(a2())
    expect(a1()).not.toBe(b())
  })

  it('createLevelState：每关按配置生成词数、词长区间内、词不重复、盘面填满大写字母', () => {
    for (let level = 0; level < LEVELS.length; level += 1) {
      const cfg = LEVELS[level]!
      for (let seed = 1; seed <= 25; seed += 1) {
        const s = createLevelState(level, seed)
        expect(s.level).toBe(level)
        expect(s.targets.length).toBe(cfg.words)
        const words = s.targets.map(t => t.word)
        expect(new Set(words).size).toBe(cfg.words)
        for (const w of words) {
          expect(w.length).toBeGreaterThanOrEqual(cfg.lenMin)
          expect(w.length).toBeLessThanOrEqual(cfg.lenMax)
          expect(WORDS).toContain(w)
        }
        expect(s.grid).toHaveLength(SIZE * SIZE)
        for (const cell of s.grid) expect(cell).toMatch(/^[A-Z]$/)
        expect(s.attemptsLeft).toBe(MAX_ATTEMPTS)
        expect(s.hintBudget).toBe(MAX_HINTS)
        expect(s.phase).toBe('playing')
      }
    }
  })

  it('放置合法性：每个目标词的字母沿其方向直线出现在盘面上，交叉共享字母一致', () => {
    // 交叉格字母一致由“每个词都与最终盘面吻合”保证（干扰只填空格）。
    for (let level = 0; level < LEVELS.length; level += 1) {
      for (let seed = 100; seed < 130; seed += 1) {
        const s = createLevelState(level, seed)
        for (const t of s.targets) {
          const dir = DIRS[t.dirIdx]!
          const first = t.cells[0]!
          for (let i = 0; i < t.word.length; i += 1) {
            const r = Math.floor(first / SIZE) + dir.dy * i
            const c = (first % SIZE) + dir.dx * i
            const idx = r * SIZE + c
            expect(t.cells[i]).toBe(idx)
            expect(s.grid[idx]).toBe(t.word[i])
          }
        }
      }
    }
  })

  it('存在交叉共享：扫描若干 seed 能找到两词共享同一格且字母相同', () => {
    let shared = false
    for (let seed = 1; seed < 400 && !shared; seed += 1) {
      const s = createLevelState(2, seed)
      for (let i = 0; i < s.targets.length && !shared; i += 1) {
        for (let j = i + 1; j < s.targets.length && !shared; j += 1) {
          const overlap = s.targets[i]!.cells.filter(c => s.targets[j]!.cells.includes(c))
          if (overlap.length > 0) {
            shared = true
            for (const c of overlap) expect(s.grid[c]).toBe(s.targets[i]!.word[s.targets[i]!.cells.indexOf(c)])
          }
        }
      }
    }
    expect(shared).toBe(true)
  })

  it('seed 重放：同 seed 同 level 两次生成的盘面与目标词完全一致', () => {
    for (const seed of [7, 1234, 999983]) {
      const a = createLevelState(3, seed)
      const b = createLevelState(3, seed)
      expect(a.grid).toEqual(b.grid)
      expect(a.targets.map(t => [t.word, t.cells, t.dirIdx])).toEqual(b.targets.map(t => [t.word, t.cells, t.dirIdx]))
    }
  })
})

describe('wordgrid 链选取与提交', () => {
  it('isAdjacent/canExtend：八向相邻（含对角）可延伸，自身/远格/重复格拒绝', () => {
    // 0 与 1（右）、6（下）、6 对角？0 与 6 是 (0,0)-(1,1) 对角相邻。
    expect(isAdjacent(0, 1)).toBe(true)
    expect(isAdjacent(0, 5)).toBe(true)
    expect(isAdjacent(0, 6)).toBe(true)
    expect(isAdjacent(0, 7)).toBe(false)
    expect(isAdjacent(0, 0)).toBe(false)
    expect(isAdjacent(4, 8)).toBe(true)
    expect(canExtend([], 12)).toBe(true)
    expect(canExtend([12], 13)).toBe(true)
    expect(canExtend([12], 18)).toBe(true)
    expect(canExtend([12], 10)).toBe(false)
    expect(canExtend([12], 12)).toBe(false)
    expect(canExtend([12, 13], 12)).toBe(false)
  })

  it('isValidChain：空链非法；断链/重复格非法；连续对角合法', () => {
    expect(isValidChain([])).toBe(false)
    expect(isValidChain([0, 1, 2])).toBe(true)
    expect(isValidChain([0, 2])).toBe(false)
    expect(isValidChain([0, 1, 0])).toBe(false)
    expect(isValidChain([0, 6, 12])).toBe(true)
    expect(isValidChain([-1])).toBe(false)
  })

  it('提交隐藏词：记分、目标锁定、全部找出后过关（末关通关）', () => {
    const s = createLevelState(0, 11)
    let gained = 0
    for (let i = 0; i < s.targets.length; i += 1) {
      const t = s.targets[i]!
      const before = s.score
      const r = submitChain(s, t.cells.slice())
      expect(r.kind).toBe('found')
      expect(r.word).toBe(t.word)
      expect(r.gain).toBe(t.word.length * 10)
      expect(t.found).toBe(true)
      gained += r.gain
      const last = i === s.targets.length - 1
      expect(s.score).toBe(before + r.gain + (last ? s.attemptsLeft * 5 + 25 : 0))
    }
    expect(s.phase).toBe('cleared')
    expect(s.score).toBe(gained + s.attemptsLeft * 5 + 25)

    const last = createLevelState(LEVELS.length - 1, 22)
    for (const t of last.targets) submitChain(last, t.cells.slice())
    expect(last.phase).toBe('won')
  })

  it('错误提交扣尝试、扣尽失败；重复提交已找出词不扣罚；空链/断链不扣罚', () => {
    const s = createLevelState(1, 5)
    expect(submitChain(s, [0, 1]).kind).toBe('wrong')
    expect(s.attemptsLeft).toBe(MAX_ATTEMPTS - 1)
    const t0 = s.targets[0]!
    expect(submitChain(s, t0.cells.slice()).kind).toBe('found')
    const r2 = submitChain(s, t0.cells.slice())
    expect(r2.kind).toBe('already')
    expect(s.attemptsLeft).toBe(MAX_ATTEMPTS - 1)
    expect(submitChain(s, []).kind).toBe('empty')
    expect(submitChain(s, [0, 2, 4]).kind).toBe('invalid')
    expect(s.attemptsLeft).toBe(MAX_ATTEMPTS - 1)
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) submitChain(s, [24, 23])
    expect(s.phase).toBe('failed')
    expect(s.attemptsLeft).toBe(0)
  })

  it('chainWord：按链序拼字母', () => {
    const s = createLevelState(0, 3)
    const chain = s.targets[0]!.cells.slice()
    expect(chainWord(s, chain)).toBe(s.targets[0]!.word)
  })
})

describe('wordgrid 提示与递进', () => {
  it('revealHint：预算 3 次、逐级升档（长度→方向→首字母位置）、只作用未找出词', () => {
    const s = createLevelState(2, 77)
    expect(revealHint(s)).toBe(0)
    expect(s.hintStage[0]).toBe(1)
    expect(s.hintBudget).toBe(MAX_HINTS - 1)
    expect(revealHint(s)).toBe(0)
    expect(s.hintStage[0]).toBe(2)
    expect(revealHint(s)).toBe(0)
    expect(s.hintStage[0]).toBe(3)
    expect(s.hintBudget).toBe(0)
    expect(revealHint(s)).toBe(-1)
    // 已找出词不再吃提示。
    const s2 = createLevelState(0, 8)
    const t = s2.targets[0]!
    submitChain(s2, t.cells.slice())
    s2.hintBudget = 1
    const idx = revealHint(s2)
    expect(idx).not.toBe(0)
  })

  it('startPosText：首字母位置按 1 起行列', () => {
    const s = createLevelState(0, 9)
    const t = s.targets[0]!
    const first = t.cells[0]!
    expect(startPosText(t)).toBe('第' + (Math.floor(first / SIZE) + 1) + '行第' + ((first % SIZE) + 1) + '列')
  })

  it('nextLevelState：过关后进下一关（词数变多）、累计分延续；非 cleared 原样返回', () => {
    const s = createLevelState(0, 31)
    for (const t of s.targets) submitChain(s, t.cells.slice())
    expect(s.phase).toBe('cleared')
    const n = nextLevelState(s)
    expect(n).not.toBe(s)
    expect(n.level).toBe(1)
    expect(n.score).toBe(s.score)
    expect(n.seed).toBe(s.seed)
    expect(n.targets.length).toBe(LEVELS[1]!.words)
    expect(n.attemptsLeft).toBe(MAX_ATTEMPTS)
    const plain = createLevelState(1, 31)
    expect(nextLevelState(plain)).toBe(plain)
  })
})
