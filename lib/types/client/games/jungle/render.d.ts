/**
 * 斗兽棋渲染器：绘制 7x9 丛林棋盘（草地格、两块蓝色河流、双方陷阱
 * 凹纹与金光兽穴）、带等级角标的兽子、选中/可达高亮、上一步标记、
 * 兽穴告急描边、局分 HUD（含一行常驻玩法速览）与单局/整场胜负
 * overlay。全部为纯 canvas 绘制（../theme.ts 共享视觉件），不含 DOM
 * 状态；适配 dirty 按需重绘（无逐帧动画依赖）。
 */
import { type Position, type Move } from './logic.ts';
/** 逻辑画布宽：20 + 7*50 + 20 = 390。 */
export declare const LOGICAL_W: number;
/** 逻辑画布高：44 + 20 + 9*50 + 20 = 534。 */
export declare const LOGICAL_H: number;
/** 一次渲染所需的全部视图状态（index.ts 状态变化时组装并标脏）。 */
export interface JungleView {
    /** 当前局面。 */
    pos: Position;
    /** 选中的己方棋子格索引；未选中为 -1。 */
    selected: number;
    /** 选中棋子的合法着法（可走提示点）。 */
    hints: readonly Move[];
    /** 最近一步着法（高亮环）；开局为 null。 */
    lastMove: Move | null;
    /** 兽穴告急的一方（该方兽穴邻格有敌子）；null 为无。 */
    denThreat: 'r' | 'b' | null;
    /** 当前局数（1-3，难度随局升）。 */
    gameNo: number;
    /** 玩家（红）已胜局数。 */
    playerWins: number;
    /** AI（黑）已胜局数。 */
    aiWins: number;
    /** 整场（3 局 2 胜）是否已结束。 */
    matchOver: boolean;
    /** 单局结果 / 暂停态。 */
    result: 'playing' | 'win' | 'lose' | 'paused';
}
/** 列中心 x。 */
export declare function centerX(col: number): number;
/** 行中心 y。 */
export declare function centerY(row: number): number;
/**
 * 命中测试：逻辑坐标转格索引。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 格索引；棋盘外返回 -1。
 */
export declare function cellAt(x: number, y: number): number;
/**
 * 格索引中心坐标（吃子粒子出生点）。
 * @param i - 格索引。
 * @returns [x, y] 中心坐标。
 */
export declare function centerOfIndex(i: number): [number, number];
/**
 * 主渲染入口：整帧绘制棋盘、兽子、提示与 HUD/overlay。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param view - 视图状态。
 */
export declare function renderJungle(ctx: CanvasRenderingContext2D, view: JungleView): void;
