/**
 * 电子宠物 PetPal 游戏定义：把纯逻辑内核接成 {@link MiniGameInstance}。
 * 点击按钮喂食/玩耍/清洁/睡觉，点击宠物互动（蛋期敲壳、睡眠叫醒、
 * 平时抚摸），玩耍时点击场地里的移动光点；R 清存档重开（换一只新
 * 种子的蛋），P 暂停。帧循环用 dirty 模式——宠物眨眼/浮动等逐帧动画
 * 每帧标脏，交互事件标脏，静止时零重绘。进度定期写入 localStorage，
 * 重进面板时从存档继续。
 */

import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  SAVE_KEY, brushPet, careScore, catchDot, createPet, deserializePet, feedPet, petPet,
  serializePet, startPlay, startSleep, tapEgg, tickPet, wakePet,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, PLAY_ARENA, buttonAt, petCenter, renderPet } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 自动存档间隔（毫秒）。 */
const AUTOSAVE_MS = 5000

function createPetPalGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: petpal needs a 2d canvas context')
  const ctx = fit.ctx

  /** 读档：坏档/无档回落到一只新种子的蛋。 */
  const load = (): ReturnType<typeof createPet> => {
    try {
      const saved = window.localStorage.getItem(SAVE_KEY)
      if (saved !== null) {
        const state = deserializePet(saved)
        if (state !== null) return state
      }
    } catch { /* storage 不可用 */ }
    return createPet((Date.now() & 0x7fffffff) | 1)
  }
  const save = (): void => {
    try { window.localStorage.setItem(SAVE_KEY, serializePet(pet)) } catch { /* storage 不可用 */ }
  }

  let pet = load()
  let running = false
  let lastScore = -1
  let saveTimer = 0
  const particles = createParticles()

  /** 成年后的照料分变化时上报（进化形态锁定后 careScore 持续代表成绩）。 */
  const reportScore = (): void => {
    if (pet.form === null) return
    const score = Math.round(careScore(pet))
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 重开：清存档，换一颗新种子的蛋。 */
  const restart = (): void => {
    try { window.localStorage.removeItem(SAVE_KEY) } catch { /* storage 不可用 */ }
    pet = createPet((Date.now() & 0x7fffffff) | 1)
    lastScore = -1
    saveTimer = 0
    loop.markDirty()
  }

  /** 把客户端坐标换算成逻辑坐标。 */
  const toLogical = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  /** 处理一次点击：优先光点捕获，其次按钮，最后宠物互动。 */
  const handleClick = (x: number, y: number): void => {
    if (pet.play !== null && !pet.dead) {
      const nx = (x - PLAY_ARENA.x) / PLAY_ARENA.w
      const ny = (y - PLAY_ARENA.y) / PLAY_ARENA.h
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 && catchDot(pet, nx, ny)) {
        particles.burst(x, y, THEME.accents[4], 12, 150)
        loop.markDirty()
        return
      }
    }
    const button = buttonAt(x, y)
    if (button !== null) {
      let acted = false
      if (button === 'meal' || button === 'snack' || button === 'feast') acted = feedPet(pet, button)
      else if (button === 'play') acted = startPlay(pet)
      else if (button === 'clean') acted = brushPet(pet)
      else if (button === 'sleep') acted = pet.sleeping ? wakePet(pet) : startSleep(pet)
      if (acted) {
        particles.burst(x, y, THEME.accents[0], 6, 100)
        loop.markDirty()
      }
      return
    }
    // 宠物本体互动：蛋期敲壳 / 睡眠叫醒 / 平时抚摸。
    const center = petCenter(pet, performance.now())
    const dx = x - center.x
    const dy = y - center.y
    if (Math.sqrt(dx * dx + dy * dy) <= center.r + 14) {
      let acted = false
      if (pet.eggLeftSec > 0) acted = tapEgg(pet)
      else if (pet.sleeping) acted = wakePet(pet)
      else acted = petPet(pet)
      if (acted) {
        particles.burst(x, y - 20, THEME.bad, 6, 80)
        loop.markDirty()
      }
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    focusGameHost(host)
    const p = toLogical(event)
    handleClick(p.x, p.y)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    tickPet(pet, f.dt)
    reportScore()
    saveTimer += f.wallMs
    if (saveTimer >= AUTOSAVE_MS) {
      saveTimer = 0
      save()
    }
    // 宠物眨眼/浮动/Zzz 是逐帧动画：每帧标脏，其余静止依赖交互标脏。
    loop.markDirty()
    renderPet(ctx, pet, performance.now(), false)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    save()
    loop.pause()
    renderPet(ctx, pet, performance.now(), true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      save()
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const petpalGame: MiniGameDefinition = {
  id: 'petpal',
  title: '电子宠物 PetPal',
  icon: '🐥',
  description: '从一颗蛋开始养起——喂它、陪它玩、给它洗澡，照料方式决定它长成什么。',
  controls: ['点击按钮：喂食 / 玩耍 / 清洁 / 睡觉', '点击宠物：敲壳 / 抚摸 / 叫醒', 'R：重开（清存档）', 'P：暂停'],
  create: createPetPalGame,
}
