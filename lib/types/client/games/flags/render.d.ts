/**
 * 旗帜竞猜画布渲染：题区居中大号旗帜 emoji（或国名）+ 2×2 选项卡片
 * （国名或旗）、倒计时进度环、连击火花提示、答错红显与正确答案绿显、
 * 知识卡（答完即出该国冷知识）、节末小结（错题列表 + 冷知识）与结束 /
 * 暂停 overlay。渲染器无状态，所有状态由 index.ts 传入。
 */
import type { FlagsState } from './logic.ts';
import { createParticles } from '../theme.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 640;
/**
 * 命中测试：逻辑坐标落在哪个选项卡片上。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 选项位次 0-3，或 null（未命中）。
 */
export declare function optionAt(x: number, y: number): number | null;
/**
 * 画一帧。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param state - 游戏状态。
 * @param particles - 连击火花粒子系统（场景绘制后、overlay 前 tick）。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param dtMs - 本帧毫秒数（供粒子 tick）。
 */
export declare function renderFlags(ctx: CanvasRenderingContext2D, state: FlagsState, particles: {
    tick(ctx: CanvasRenderingContext2D, dtMs: number): void;
    burst(x: number, y: number, color: string, count?: number, speed?: number): void;
}, paused: boolean, dtMs: number): void;
/** 连击火花粒子系统（复用共享粒子池）。 */
export declare function createFlagsParticles(): ReturnType<typeof createParticles>;
