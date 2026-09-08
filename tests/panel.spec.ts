/* @vitest-environment jsdom */

import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface MountOptions {
  onScore?: (score: number) => void
  onPauseRequest?: () => void
  onRestartRequest?: (restart?: () => void) => void
}

interface FakeInstance {
  start: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

interface FakeGame {
  id: string
  title: string
  icon: string
  description: string
  controls: string[]
  create: ReturnType<typeof vi.fn>
  instances: Array<{ host: HTMLElement; options: MountOptions | undefined; instance: FakeInstance }>
}

const fakes = vi.hoisted(() => {
  const makeGame = (id: string, title: string): FakeGame => {
    const instances: FakeGame['instances'] = []
    const create = vi.fn((host: HTMLElement, options?: MountOptions): FakeInstance => {
      const instance: FakeInstance = {
        start: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        destroy: vi.fn(),
      }
      instances.push({ host, options, instance })
      return instance
    })
    return {
      id,
      title,
      icon: id === 'alpha' ? '🅰️' : '🅱️',
      description: `${title} 的测试局`,
      controls: ['方向键：移动', 'P：暂停', 'R：重新开始'],
      create,
      instances,
    }
  }

  const games = [makeGame('alpha', 'Alpha'), makeGame('beta', 'Beta')]
  return {
    games,
    alpha: games[0]!,
    beta: games[1]!,
    getGames: vi.fn(() => games),
    getGame: vi.fn((id: string) => games.find(game => game.id === id)),
    registerBuiltinGames: vi.fn(),
  }
})

vi.mock('../src/client/games/index.ts', () => ({
  getGames: fakes.getGames,
  getGame: fakes.getGame,
  registerBuiltinGames: fakes.registerBuiltinGames,
}))

import { MiniGamePanel } from '../src/client/panel/Panel.tsx'

let root: Root | undefined
let container: HTMLDivElement | undefined

async function mountPanel(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MiniGamePanel))
  })
  return container
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    ;(element as HTMLElement).click()
  })
}

function required<T>(element: T | null | undefined, description: string): T {
  if (element === null || element === undefined) throw new Error(`Expected ${description}`)
  return element
}

function buttonWithText(scope: ParentNode, text: string): HTMLButtonElement {
  return required(
    [...scope.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(text)),
    `button containing ${text}`,
  )
}

async function openLibrary(scope: ParentNode): Promise<HTMLElement> {
  const launcher = required(scope.querySelector<HTMLButtonElement>('.dmg-launcher'), 'the launcher')
  await click(launcher)
  const panel = required(scope.querySelector<HTMLElement>('.dmg-float'), 'the panel')
  expect(panel.hidden).toBe(false)
  return panel
}

async function choose(scope: ParentNode, title: string): Promise<void> {
  const card = [...scope.querySelectorAll<HTMLButtonElement>('.dmg-card')]
    .find(button => button.textContent?.includes(title))
  await click(required(card ?? null, `the ${title} game card`))
}

async function startGame(scope: ParentNode): Promise<void> {
  await click(buttonWithText(scope, '开始游戏'))
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  root = undefined
  container = undefined
  for (const game of fakes.games) {
    game.create.mockClear()
    game.instances.splice(0)
  }
  fakes.getGames.mockClear()
  fakes.getGame.mockClear()
  fakes.registerBuiltinGames.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  if (root !== undefined) {
    await act(async () => root?.unmount())
  }
  root = undefined
  container = undefined
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('MiniGamePanel', () => {
  it('opens the game library from the launcher and persists visibility', async () => {
    const view = await mountPanel()
    const panel = required(view.querySelector<HTMLElement>('.dmg-float'), 'the panel')
    expect(panel.hidden).toBe(true)
    expect(view.querySelector('.dmg-launcher')).not.toBeNull()

    await openLibrary(view)

    expect(localStorage.getItem('dsh-minigames:open')).toBe('1')
    expect(view.querySelector('.dmg-library-heading h1')?.textContent).toContain('玩一会儿')
    expect(view.querySelectorAll('.dmg-card')).toHaveLength(2)
  })

  it('starts a game, reports a best score, and toggles pause state', async () => {
    const view = await mountPanel()
    await openLibrary(view)
    await choose(view, 'Alpha')

    const first = required(fakes.alpha.instances[0], 'the Alpha instance')
    expect(fakes.alpha.create).toHaveBeenCalledTimes(1)
    expect(first.instance.pause).toHaveBeenCalled()
    expect(view.querySelector('.dmg-game-status')?.textContent).toBe('准备开始')

    await startGame(view)
    expect(view.querySelector('.dmg-game-status')?.textContent).toBe('游戏中')
    expect(first.instance.resume).toHaveBeenCalled()
    expect(document.activeElement).toBe(first.host)

    await act(async () => first.options?.onScore?.(12))
    expect(localStorage.getItem('dsh-minigames:best:alpha')).toBe('12')
    expect(view.querySelector('.dmg-game-stats')?.textContent).toContain('最佳 12')

    await click(buttonWithText(view, '暂停'))
    expect(view.querySelector('.dmg-game-status')?.textContent).toBe('已暂停')
    expect(first.instance.pause).toHaveBeenCalled()
    await click(buttonWithText(view, '继续'))
    expect(view.querySelector('.dmg-game-status')?.textContent).toBe('游戏中')
    expect(first.instance.resume).toHaveBeenCalled()
  })

  it('keeps the instance alive while hidden and when returning to the library', async () => {
    const view = await mountPanel()
    const panel = await openLibrary(view)
    await choose(view, 'Alpha')
    await startGame(view)
    const first = required(fakes.alpha.instances[0], 'the Alpha instance')

    await click(required(view.querySelector<HTMLButtonElement>('[aria-label="隐藏小游戏"]'), 'the hide button'))
    expect(panel.hidden).toBe(true)
    expect(first.instance.destroy).not.toHaveBeenCalled()
    expect(fakes.alpha.create).toHaveBeenCalledTimes(1)

    await click(required(view.querySelector<HTMLButtonElement>('.dmg-launcher'), 'the launcher'))
    expect(panel.hidden).toBe(false)
    expect(fakes.alpha.create).toHaveBeenCalledTimes(1)

    await click(buttonWithText(view, '← 游戏库'))
    expect(view.querySelector('.dmg-continue')).not.toBeNull()
    expect(first.instance.destroy).not.toHaveBeenCalled()
    await click(buttonWithText(view, '继续 Alpha'))
    expect(view.querySelector('.dmg-game-area')?.hasAttribute('hidden')).toBe(false)
    expect(fakes.alpha.create).toHaveBeenCalledTimes(1)
    expect(first.instance.destroy).not.toHaveBeenCalled()
  })

  it('requires confirmation before replacing the active game', async () => {
    const view = await mountPanel()
    await openLibrary(view)
    await choose(view, 'Alpha')
    await startGame(view)
    const first = required(fakes.alpha.instances[0], 'the Alpha instance')
    await click(buttonWithText(view, '← 游戏库'))

    await choose(view, 'Beta')
    const dialog = required(view.querySelector<HTMLElement>('[role="dialog"]'), 'the switch confirmation')
    expect(dialog.getAttribute('aria-label')).toBe('切换游戏？')
    await click(buttonWithText(dialog, '取消'))
    expect(view.querySelector('[role="dialog"]')).toBeNull()
    expect(first.instance.destroy).not.toHaveBeenCalled()

    await choose(view, 'Beta')
    const confirm = required(view.querySelector<HTMLElement>('[role="dialog"]'), 'the second switch confirmation')
    await click(buttonWithText(confirm, '切换游戏'))
    expect(first.instance.destroy).toHaveBeenCalledTimes(1)
    expect(fakes.beta.create).toHaveBeenCalledTimes(1)
    expect(view.querySelector('.dmg-game-toolbar strong')?.textContent).toBe('Beta')
  })

  it('requires confirmation before restarting and recreates the game only after confirmation', async () => {
    const view = await mountPanel()
    await openLibrary(view)
    await choose(view, 'Alpha')
    await startGame(view)
    const first = required(fakes.alpha.instances[0], 'the Alpha instance')

    await click(buttonWithText(view, '重新开始'))
    const dialog = required(view.querySelector<HTMLElement>('[role="dialog"]'), 'the restart confirmation')
    expect(dialog.getAttribute('aria-label')).toBe('重新开始这一局？')
    await click(buttonWithText(dialog, '取消'))
    expect(fakes.alpha.create).toHaveBeenCalledTimes(1)
    expect(first.instance.destroy).not.toHaveBeenCalled()

    await click(buttonWithText(view, '重新开始'))
    const confirm = required(view.querySelector<HTMLElement>('[role="dialog"]'), 'the second restart confirmation')
    await click(buttonWithText(confirm, '重新开始'))
    expect(first.instance.destroy).toHaveBeenCalledTimes(1)
    expect(fakes.alpha.create).toHaveBeenCalledTimes(2)
    expect(view.querySelector('.dmg-game-status')?.textContent).toBe('准备开始')
  })

  it('defers a game-supplied restart action until confirmation without destroying the instance', async () => {
    const view = await mountPanel()
    await openLibrary(view)
    await choose(view, 'Alpha')
    await startGame(view)
    const first = required(fakes.alpha.instances[0], 'the Alpha instance')
    const requestRestart = first.options?.onRestartRequest
    const action = vi.fn()
    expect(requestRestart).toBeTypeOf('function')

    await act(async () => requestRestart?.(action))
    const dialog = required(view.querySelector<HTMLElement>('[role="dialog"]'), 'the game restart confirmation')
    await click(buttonWithText(dialog, '取消'))
    expect(action).not.toHaveBeenCalled()
    expect(first.instance.destroy).not.toHaveBeenCalled()
    expect(fakes.alpha.create).toHaveBeenCalledTimes(1)

    await act(async () => requestRestart?.(action))
    const confirm = required(view.querySelector<HTMLElement>('[role="dialog"]'), 'the second game restart confirmation')
    await click(buttonWithText(confirm, '重新开始'))
    expect(action).toHaveBeenCalledTimes(1)
    expect(first.instance.destroy).not.toHaveBeenCalled()
    expect(fakes.alpha.create).toHaveBeenCalledTimes(1)
  })

  it('honours the game pause callback and pauses on window blur', async () => {
    const view = await mountPanel()
    await openLibrary(view)
    await choose(view, 'Alpha')
    await startGame(view)
    const first = required(fakes.alpha.instances[0], 'the Alpha instance')
    const pauseRequest = first.options?.onPauseRequest
    expect(pauseRequest).toBeTypeOf('function')

    await act(async () => pauseRequest?.())
    expect(view.querySelector('.dmg-game-status')?.textContent).toBe('已暂停')
    await act(async () => pauseRequest?.())
    expect(view.querySelector('.dmg-game-status')?.textContent).toBe('游戏中')

    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(view.querySelector('.dmg-game-status')?.textContent).toBe('已暂停')
    expect(first.instance.pause).toHaveBeenCalled()
  })
})
