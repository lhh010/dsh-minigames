/**
 * 圆周挑战 canvas 渲染器：同心数字圆环（活动环高亮描边），径向列分
 * 隔线与列连线，环外圈显示每列当前和 vs 目标值（达标列绿色），底部
 * 步数条，HUD 与过关/超步/暂停遮罩。无状态 —— 状态由调用方持有；
 * 使用共享视觉件 (../theme.ts)。
 */
import { type CirclePuzzle } from './logic.ts';
/** 逻辑画布固定尺寸（各关卡共用，无需随关卡 refit）。 */
export declare const CANVAS_W = 540;
export declare const CANVAS_H = 512;
export declare const HUD_H = 32;
/** 圆盘圆心（逻辑坐标）。 */
export declare function wheelCenter(): {
    x: number;
    y: number;
};
/** 环 r（0 基，0 为最内环）的 [内半径, 外半径]。 */
export declare function ringRadii(rings: number, r: number): {
    inner: number;
    outer: number;
};
/** 逻辑坐标点命中的环与列（中心孔与盘外返回 null）。 */
export declare function pointToRing(puzzle: CirclePuzzle, x: number, y: number): {
    ring: number;
    col: number;
} | null;
/** 列中心角方向上距圆心 d 处的点（标签/粒子定位）。 */
export declare function radialPoint(sectors: number, col: number, d: number): {
    x: number;
    y: number;
};
/** 渲染一帧所需的可视状态。 */
export interface CircleView {
    /** 活动环下标（0 基）。 */
    activeRing: number;
    /** 1 基关卡号。 */
    level: number;
    /** 已用步数。 */
    steps: number;
    /** 步数上限。 */
    maxSteps: number;
    /** 暂停遮罩。 */
    paused: boolean;
    /** 结束遮罩副标题，游玩中为 null。 */
    endText: string | null;
    /** 结束遮罩标题。 */
    endTitle: string;
    /** 提示列下标，-1 为无。 */
    hintColumn: number;
}
/**
 * 绘制一帧。
 * @param ctx - 画布上下文。
 * @param puzzle - 当前关卡。
 * @param offsets - 各环偏移。
 * @param view - 可视状态（活动环/步数/遮罩/提示）。
 */
export declare function renderCircleMath(ctx: CanvasRenderingContext2D, puzzle: CirclePuzzle, offsets: readonly number[], view: CircleView): void;
