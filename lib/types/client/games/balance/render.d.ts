/**
 * 天平谜题 Balance 画布渲染：中央支点 + 可倾斜横梁（按净力矩偏转）、
 * 挂点刻度（力臂 1-5）、底部砝码架（待放 / 已放）、左右力矩读数、关卡
 * HUD 与过关 / 暂停 overlay。渲染器无状态（倾斜角由调用方动画驱动），
 * 全部走 ../theme.ts 共享视觉件。
 */
import { type BalanceState } from './logic.ts';
export declare const LOGICAL_W = 640;
export declare const LOGICAL_H = 400;
/** 支点（横梁旋转中心）。 */
export declare const PIVOT_X: number;
export declare const PIVOT_Y = 258;
/** 相邻力臂刻度的像素间距。 */
export declare const ARM_PX = 50;
/** 横梁最大倾角（弧度）。 */
export declare const MAX_TILT = 0.16;
/** 砝码架区（画布底部）。 */
export declare const SHELF_Y: number;
/** 由净力矩求目标倾角（钳制到 ±MAX_TILT）。 */
export declare function tiltForTorque(net: number): number;
/** 挂点在横梁局部坐标（未旋转）中的 x：左负右正。 */
export declare function slotX(slot: number): number;
/** 挂点在画布坐标中的位置（忽略倾角，用于点击命中与刻度标注）。 */
export declare function slotPoint(slot: number): {
    x: number;
    y: number;
};
/** 点击命中的挂点：命中半径 22px，超出返回 null。 */
export declare function slotAt(x: number, y: number): number | null;
/** 砝码架上第 wi 个待放砝码的矩形（砝码架只陈列未挂的）。 */
export declare function shelfRect(state: BalanceState, wi: number): {
    x: number;
    y: number;
    w: number;
    h: number;
} | null;
/** 点击命中的待放砝码下标，超出返回 null。 */
export declare function shelfWeightAt(state: BalanceState, x: number, y: number): number | null;
/** 已挂砝码的命中：返回其挂点下的砝码下标，超出返回 null（与 slotAt 同半径）。 */
export declare function placedWeightAt(state: BalanceState, x: number, y: number): number | null;
/**
 * 画一帧。
 * @param angle 当前横梁倾角（弧度，动画值，由 index 每帧逼近目标）。
 * @param selected 选中的待放砝码下标（高亮），null 无。
 * @param leftValue / rightValue 力矩读数。
 * @param paused 暂停 overlay。
 * @param winText 过关副标题，null 进行中。
 * @param toast 短暂提示文字，null 无。
 */
export declare function renderBalance(ctx: CanvasRenderingContext2D, w: number, h: number, state: BalanceState, angle: number, selected: number | null, level: number, leftValue: number, rightValue: number, paused: boolean, winText: string | null, toast: string | null): void;
