/**
 * 斗兽棋渲染器：绘制 7x9 棋盘（草地、两块河流、双方陷阱与兽穴）、
 * 带等级角标的动物棋子、选中高亮与可走提示点、上一步标记、兽穴告急
 * 红色脉冲、HUD（回合/难度/思考中）与胜负/暂停 overlay。全部为纯
 * canvas 绘制（../theme.ts 共享视觉件），不含 DOM 状态。
 */
import { type Position, type Move } from './logic.ts';
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 一次渲染所需的全部视图状态（index.ts 每帧组装）。 */
export interface JungleView {
    /** 当前局面。 */
    pos: Position;
    /** 选中的己方棋子格索引；未选中为 -1。 */
    selected: number;
    /** 选中棋子的合法着法（可走提示点）。 */
    hints: readonly Move[];
    /** 最近一步着法（高亮环）。 */
    lastMove: Move | null;
    /** 兽穴告急的一方（该方兽穴邻格有敌子）；null 为无。 */
    denThreat: 'r' | 'b' | null;
    /** AI 是否正在思考（HUD 动画）。 */
    thinking: boolean;
    /** 难度档（1-3）。 */
    level: number;
    /** 动画时钟（performance.now()）。 */
    timeMs: number;
    /** 终局/暂停态。 */
    result: 'playing' | 'win' | 'lose' | 'paused';
}
/** 列中心 x。 */
export declare function centerX(col: number): number;
/** 行中心 y。 */
export declare function centerY(row: number): number;
/** 命中测试：逻辑坐标 → 格索引；棋盘外返回 -1。 */
export declare function cellAt(x: number, y: number): number;
/** 格索引中心坐标（吃子粒子出生点）。 */
export declare function centerOfIndex(i: number): [number, number];
/** 主渲染入口：整帧绘制棋盘、棋子、提示与 HUD/overlay。 */
export declare function renderJungle(ctx: CanvasRenderingContext2D, view: JungleView): void;
