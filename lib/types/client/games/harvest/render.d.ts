import { type HarvestState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 640;
/** 动作按钮标签（下标即动作 id：0 播种 1 浇水 2 收获 3 休耕）。 */
export declare const ACTION_LABELS: string[];
/**
 * 画布坐标 → 田格下标。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 田格下标（0..35），未命中返回 null。
 */
export declare function tileAt(x: number, y: number): number | null;
/**
 * 画布坐标 → 卡池卡下标。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 卡下标（0..3），未命中返回 null。
 */
export declare function cardAt(x: number, y: number): number | null;
/**
 * 画布坐标 → 动作按钮下标（0 播种 1 浇水 2 收获 3 休耕）。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 按钮下标，未命中返回 null。
 */
export declare function buttonAt(x: number, y: number): number | null;
/**
 * 绘制整帧场景（不含结束/暂停 overlay）。
 * @param ctx - 画布上下文（fitCanvas 已变换）。
 * @param state - 一局状态。
 */
export declare function renderHarvest(ctx: CanvasRenderingContext2D, state: HarvestState, currentAction?: number): void;
/**
 * 田格中心逻辑坐标（收获粒子定位用）。
 * @param index - 田格下标（0..35）。
 * @returns 中心 [x, y]。
 */
export declare function tileCenter(index: number): [number, number];
/**
 * 绘制季末/终局/暂停 overlay（粒子之后调用）。
 * @param ctx - 画布上下文。
 * @param state - 一局状态。
 * @param paused - 是否暂停（叠加暂停面）。
 */
export declare function renderHarvestOverlay(ctx: CanvasRenderingContext2D, state: HarvestState, paused: boolean): void;
