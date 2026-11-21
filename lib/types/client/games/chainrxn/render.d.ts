import { type Blast, type Orb } from './logic.ts';
/** 深空背景星点（一次生成、每关固定）。 */
export interface Star {
    x: number;
    y: number;
    size: number;
    alpha: number;
}
/** 渲染一帧所需的全部状态快照。 */
export interface ChainRxnView {
    orbs: Orb[];
    blasts: Blast[];
    levelIndex: number;
    clicksLeft: number;
    exploded: number;
    goal: number;
    score: number;
    phase: 'aim' | 'chain' | 'won' | 'lost' | 'cleared';
    paused: boolean;
    stars: Star[];
    /** 距最近一次引爆的毫秒数（引爆计数弹跳动画）。 */
    sinceIgnitionMs: number;
}
/**
 * 生成一组固定星点（seed 确定，重开同关完全一致）。
 * @param seed - 种子。
 * @param count - 星点数量。
 * @returns 星点数组。
 */
export declare function makeStars(seed: number, count: number): Star[];
/**
 * 渲染一整帧（背景 → 星点 → 场地 → orb → 爆波 → HUD → 计数 → overlay）。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设好）。
 * @param v - 状态快照。
 * @param nowMs - 挂载起累计毫秒（闪烁动画）。
 */
export declare function renderScene(ctx: CanvasRenderingContext2D, v: ChainRxnView, nowMs: number): void;
