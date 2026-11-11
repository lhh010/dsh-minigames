/**
 * 飞镖 501 canvas 渲染：主题化标准镖盘（分区数字、双色扇区、双 / 三倍
 * 环、内外靶心）、手抖准星（十字 + 漂移预览圈）、本 turn 三镖落点标记、
 * 剩余分与 ≤170 结账建议、轮数与对战 HUD、胜负 / 暂停遮罩。
 */
import type { DartsState } from './logic.ts';
/** 镖盘中心（逻辑坐标，index 换算指针坐标用）。 */
export declare const BOARD_CX: number;
export declare const BOARD_CY = 186;
/** UI 阶段（与实例侧 Phase 对齐）。 */
export type UiPhase = 'ready' | 'playing' | 'paused' | 'over';
/** 一帧渲染入口。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 * @param aim - 瞄准点（镖盘半径倍率单位；null 表示非瞄准阶段）。
 * @param t - 时间秒（漂移动画）。
 * @param phase - UI 阶段。
 */
export declare function renderDarts(ctx: CanvasRenderingContext2D, state: DartsState, aim: {
    x: number;
    y: number;
} | null, t: number, phase: UiPhase): void;
/** 供 index 复用：给出玩家瞄准某个结账目标的坐标（双倍 16 等）。 */
export declare function aimHint(state: DartsState): {
    x: number;
    y: number;
};
