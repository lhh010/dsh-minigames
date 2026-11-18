/**
 * 圈地争夺渲染层：复古像素风——暗色空地 + 微网格、安全带亮框、己占区
 * 着色、拖动中闪烁的笔迹亮线、旋转线条风墨怪、HUD（占领率/命/关卡/
 * 得分）与过关/失败 overlay。纯 canvas 绘制，状态全部来自 logic.ts。
 */
import type { QixState } from './logic.ts';
import { type ParticleSystem } from '../theme.ts';
/** 单格逻辑边长（px）。 */
export declare const CELL = 22;
/** 顶部 HUD 高度（px）。 */
export declare const HUD_H = 36;
/** 逻辑画布宽。 */
export declare const VIEW_W: number;
/** 逻辑画布高。 */
export declare const VIEW_H: number;
/** 创建渲染层自带的粒子系统（闭合填充庆祝用）。
 * @returns 粒子系统。
 */
export declare function createQixParticles(): ParticleSystem;
/**
 * 渲染一帧：背景、网格、己占区、闪烁笔迹、玩家、旋转墨怪、HUD 与
 * 过关/失败 overlay。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param state - 引擎状态。
 * @param particles - 粒子系统（由调用方 tick，这里只绘制）。
 * @param paused - 是否暂停（绘制暂停 overlay）。
 * @param nowMs - 当前时间戳（笔迹闪烁与墨怪旋转相位）。
 */
export declare function renderQix(ctx: CanvasRenderingContext2D, state: QixState, particles: ParticleSystem, paused: boolean, nowMs: number): void;
