/**
 * 斯特鲁普画布渲染：居中大字（以墨色着色）+ 底部 6 个色块答题按钮 +
 * 限时进度条，顶部 HUD（命 / 轮次 / 难度 / 得分 / 连击），连击时的火焰
 * 特效由粒子系统提供，结束 / 暂停用共享 overlay。渲染器无状态，所有
 * 状态由 index.ts 传入。
 */
import type { StroopState } from './logic.ts';
import { createParticles } from '../theme.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 420;
export declare const LOGICAL_H = 520;
/** 大字颜色：色块 / 墨色共用的 6 色板（鲜明可辨，与词一一对应）。 */
export declare const INK_COLORS: readonly ["#f7768e", "#9ece6a", "#7aa2f7", "#e0af68", "#bb9af7", "#ff9e64"];
/**
 * 命中测试：逻辑坐标落在哪个色块按钮上。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 颜色编号 0-5，或 null（未命中）。
 */
export declare function swatchAt(x: number, y: number): number | null;
/**
 * 画一帧。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param state - 游戏状态。
 * @param timeLimitMs - 当前轮的总限时（进度条满格值）。
 * @param particles - 连击火焰粒子系统（场景绘制后、overlay 前 tick）。
 * @param flash - 作答反馈色（'good' | 'bad' | null），短暂覆盖在大字下。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param dtMs - 本帧毫秒数（供粒子 tick）。
 */
export declare function renderStroop(ctx: CanvasRenderingContext2D, state: StroopState, timeLimitMs: number, particles: {
    tick(ctx: CanvasRenderingContext2D, dtMs: number): void;
    burst(x: number, y: number, color: string, count?: number, speed?: number): void;
}, flash: 'good' | 'bad' | null, paused: boolean, dtMs: number): void;
/** 便捷工厂：返回共享粒子系统（连击火焰特效用）。 */
export declare function createStroopParticles(): ReturnType<typeof createParticles>;
