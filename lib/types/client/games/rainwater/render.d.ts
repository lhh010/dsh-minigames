/**
 * 接雨水 canvas 渲染：共享主题包 + 剖面柱子（蓝色系——地形基座深蓝、
 * 玩家加高的砖亮蓝）、每列蓄水格半透明青色高亮、水面微光线、目标水量 /
 * 当前水量 / 砖块预算 HUD（hudPair）与过关 / 通关 / 暂停 overlay
 * （drawOverlay）。全部无状态：每帧从 RainwaterState 现算现画。
 */
import { type RainwaterState } from './logic.ts';
/**
 * 计算某列的绘制矩形（x / 宽）。
 * @param s - 状态。
 * @param col - 列号。
 * @returns 列左缘 x 与列宽。
 */
export declare function columnRect(s: RainwaterState, col: number): {
    x: number;
    w: number;
};
/**
 * 命中测试：逻辑坐标 x 落在哪一列（任意高度均可点击）。
 * @param s - 状态。
 * @param x - 逻辑 x。
 * @returns 列号，未命中返回 null。
 */
export declare function columnAt(s: RainwaterState, x: number): number | null;
/**
 * 绘制一帧。
 * @param ctx - 已应用逻辑坐标变换的 2d 上下文。
 * @param s - 当前对局状态。
 * @param paused - 是否暂停（画暂停 overlay）。
 */
export declare function renderRainwater(ctx: CanvasRenderingContext2D, s: RainwaterState, paused: boolean): void;
