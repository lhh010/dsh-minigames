/**
 * 光轮对决渲染层：暗色竞技场 + 微光网格、双方发光光轮与渐隐光墙轨迹、
 * 方向预览箭头、提速提示、局分 HUD、撞击爆炸粒子与胜负 overlay。
 * 纯 canvas 绘制，状态全部来自 logic.ts。
 */
import type { TronState } from './logic.ts';
import { type ParticleSystem } from '../theme.ts';
/** 单格逻辑边长（px）。 */
export declare const CELL = 24;
/** 顶部 HUD 高度（px）。 */
export declare const HUD_H = 36;
/** 逻辑画布宽。 */
export declare const VIEW_W: number;
/** 逻辑画布高。 */
export declare const VIEW_H: number;
/** 创建渲染层自带的粒子系统（爆炸用）。
 * @returns 粒子系统。
 */
export declare function createTronParticles(): ParticleSystem;
/** 在撞击点喷射双方颜色粒子（局结束时调用一次）。
 * @param particles - 粒子系统。
 * @param state - 引擎状态（读取 crashCells）。
 */
export declare function burstCrash(particles: ParticleSystem, state: TronState): void;
/**
 * 渲染一帧：背景、网格、双方轨迹与光轮（按步进进度插值）、方向预览、
 * 粒子、HUD 与结束 overlay。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param state - 引擎状态。
 * @param particles - 粒子系统（由调用方 tick，这里只绘制）。
 * @param paused - 是否暂停（绘制暂停 overlay）。
 */
export declare function renderTron(ctx: CanvasRenderingContext2D, state: TronState, particles: ParticleSystem, paused: boolean): void;
