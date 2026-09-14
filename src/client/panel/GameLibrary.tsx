import { useState, type ReactNode } from 'react'
import type { MiniGameDefinition } from '../games/types.ts'

const categories = ['全部', '益智', '棋盘', '街机', '反应'] as const
type Category = typeof categories[number]
const groups: Record<string, Category> = {
  '2048': '益智', huarong: '益智', match3: '益智', memory: '益智', sudoku: '益智',
  minesweeper: '棋盘', gomoku: '棋盘', othello: '棋盘',
  dino: '街机', snake: '街机', tetris: '街机', tanks: '街机', pacman: '街机', breakout: '街机',
  hop: '反应', flappy: '反应', whack: '反应', aimtrack: '反应',
}
const summaries: Record<string, string> = {
  dino: '越过障碍，跑得越远分越高。', tetris: '旋转、下落，填满一行就消除。',
  tanks: '躲开炮火，击退三波敌军。', match3: '消除相连的同色方块，达到目标分。',
  huarong: '移动空格，把 15 块数字排回原位。', snake: '吃食物、长身体，小心撞到自己。',
  '2048': '合并相同数字，一步步凑出 2048。', minesweeper: '根据数字推理，找出所有安全格。',
  memory: '记住位置，找出每一对相同图案。', gomoku: '执黑先行，与电脑比一场五子连珠。',
  hop: '按住蓄力，松开跳向下一个平台。', breakout: '接住小球，清空整面砖墙。',
  whack: '30 秒内尽量多打中，打空会扣分。', othello: '夹住对手棋子，争夺棋盘上的多数。',
  flappy: '轻点振翅，从管道之间穿过去。', sudoku: '让每行、每列和每宫的数字不重复。',
  pacman: '吃完迷宫里的豆子，躲开幽灵。', aimtrack: '移动视角跟住目标，练习瞄准射击。',
}

/** 用棋盘、路径和游戏道具作识别图，不依赖系统 emoji 字体。 */
export function GameMark({ id }: { id: string }): ReactNode {
  const marks: Record<string, ReactNode> = {
    dino: <path d="M20 43V26h12V14h18v16H38v13h-6v9h-6V41H16V31h4m20-11h3" />,
    tetris: <><path d="M16 16h12v12H16zm12 0h12v12H28zm12 0h12v12H40zM28 28h12v12H28zM16 44h36" /></>,
    tanks: <><rect x="18" y="23" width="28" height="26" rx="5" /><path d="M14 24v24m36-24v24M32 14v21m-8 0h16v8H24z" /></>,
    match3: <><path d="m20 12 9 9-9 9-9-9zm24 0 9 9-9 9-9-9zm-24 24 9 9-9 9-9-9zm24 0 9 9-9 9-9-9z" /></>,
    huarong: <><rect x="12" y="12" width="40" height="40" rx="4" /><path d="M32 12v40M12 32h20" /><text x="21" y="27">1</text><text x="42" y="27">2</text><text x="21" y="47">3</text></>,
    snake: <><path d="M12 46h28a8 8 0 0 0 0-16H24a8 8 0 0 1 0-16h24" strokeWidth="7" /><path d="M47 11v6" stroke="var(--dmg-surface)" /></>,
    '2048': <><rect x="12" y="12" width="40" height="40" rx="5" /><text x="32" y="38" fontSize="22">2¹¹</text></>,
    minesweeper: <><path d="M22 51V13l26 9-26 9M14 51h24" /><circle cx="46" cy="46" r="4" /></>,
    memory: <><rect x="10" y="16" width="19" height="32" rx="3" /><rect x="35" y="16" width="19" height="32" rx="3" /><path d="m15 32 5-6 5 6-5 6zm25 0 5-6 5 6-5 6z" /></>,
    gomoku: <><path d="M12 20h40M12 32h40M12 44h40M20 12v40M32 12v40M44 12v40" opacity=".3" /><circle cx="20" cy="20" r="5" fill="currentColor" /><circle cx="32" cy="32" r="5" fill="currentColor" /><circle cx="44" cy="44" r="5" fill="currentColor" /></>,
    hop: <><path d="M10 46h17m15-11h13M20 31q10-28 26-9" strokeDasharray="3 4" /><circle cx="20" cy="36" r="5" /></>,
    breakout: <><path d="M12 15h40M12 23h40M24 12v15m16-15v15M23 50h20" strokeWidth="5" /><circle cx="35" cy="37" r="3" /></>,
    whack: <><ellipse cx="32" cy="46" rx="22" ry="6" /><path d="M21 44V31a11 11 0 0 1 22 0v13M26 32h1m10 0h1M14 18l-4-4m38 4 4-4M32 12V7" /></>,
    othello: <><circle cx="23" cy="24" r="12" fill="currentColor" /><circle cx="42" cy="42" r="12" /></>,
    flappy: <><path d="M12 12v13m38 14v13M44 39h12M7 25h10m16 2 10 5-10 4" /><ellipse cx="28" cy="32" rx="10" ry="8" /></>,
    sudoku: <><rect x="12" y="12" width="40" height="40" rx="3" /><path d="M12 32h40M32 12v40" opacity=".4" /><text x="22" y="28">9</text><text x="42" y="47">3</text></>,
    pacman: <><path d="M39 19a18 18 0 1 0 0 26L24 32z" /><circle cx="45" cy="32" r="2" /><circle cx="55" cy="32" r="2" /></>,
    aimtrack: <><circle cx="32" cy="32" r="17" /><circle cx="32" cy="32" r="7" /><path d="M32 7v12m0 26v12M7 32h12m26 0h12" /></>,
  }
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{marks[id] ?? marks['2048']}</svg>
}

interface Props {
  games: MiniGameDefinition[]
  best: Record<string, number>
  current: MiniGameDefinition | undefined
  onSelect: (id: string) => void
  onContinue: () => void
}

export function GameLibrary({ games, best, current, onSelect, onContinue }: Props): ReactNode {
  const [category, setCategory] = useState<Category>('全部')
  const [query, setQuery] = useState('')
  const filtered = games.filter(game => (category === '全部' || groups[game.id] === category)
    && `${game.title} ${game.id} ${game.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="dmg-library">
    <div className="dmg-library-heading"><div><h1>玩一会儿</h1><p>{games.length} 款小游戏，随时停下，随时继续。</p></div><span className="dmg-offline">离线可玩</span></div>
    {current && <button type="button" className="dmg-continue" onClick={onContinue}><GameMark id={current.id} /><span><strong>继续 {current.title}</strong><small>本局进度已保留</small></span><span aria-hidden="true">→</span></button>}
    <div className="dmg-library-tools">
      <div className="dmg-filters" aria-label="游戏分类">{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <label className="dmg-search"><span className="dmg-sr-only">搜索游戏</span><input type="search" placeholder="搜索游戏" value={query} onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="dmg-picker" aria-label="游戏列表">
      {filtered.map(game => <button type="button" key={game.id} className="dmg-card" onClick={() => onSelect(game.id)}>
        <div className="dmg-card-art"><GameMark id={game.id} /><span className="dmg-card-play" aria-hidden="true">开始 →</span></div>
        <div className="dmg-card-title">{game.title.replace('（带 AI）', '').replace(' vs AI', '')}</div>
        <div className="dmg-card-desc">{summaries[game.id] ?? game.description}</div>
        <div className="dmg-card-meta"><span>{groups[game.id] ?? '小游戏'}</span>{(best[game.id] ?? 0) > 0 && <span>最佳 {best[game.id]}</span>}</div>
      </button>)}
    </div>
    {filtered.length === 0 && <div className="dmg-empty"><p>没有找到“{query}”相关的游戏</p><button type="button" className="dmg-button" onClick={() => { setQuery(''); setCategory('全部') }}>查看全部游戏</button></div>}
  </div>
}
