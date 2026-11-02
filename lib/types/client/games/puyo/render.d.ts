/**
 * 噗呦噗呦渲染层：井、圆滚滚双色带眼睛的噗呦、落点虚影、消除爆裂粒子、
 * 连锁浮字、NEXT 预览与 HUD。所有绘制都在固定逻辑坐标系内进行。
 */
import { type ParticleSystem } from '../theme.ts';
import { type PuyoState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const W = 372;
export declare const H = 468;
/** 单格边长。 */
export declare const CELL = 30;
/** 井左上角。 */
export declare const BOARD_X: number;
export declare const BOARD_Y = 66;
/** 噗呦颜色索引转主色。 */
export declare function puyoColor(idx: number): string;
/**
 * 画一只圆滚滚噗呦：主体色 + 上半高光（双色）+ 一对眼睛。
 * @param ctx - 画布上下文。
 * @param cx - 圆心 x。
 * @param cy - 圆心 y。
 * @param r - 半径。
 * @param colorIdx - 颜色索引（1..4）。
 */
export declare function drawPuyo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, colorIdx: number): void;
/**
 * 整帧渲染。
 * @param ctx - 画布上下文（已按逻辑坐标变换）。
 * @param state - 局状态（只读；clearFx.spawned 标记一次性粒子）。
 * @param paused - 暂停蒙层。
 * @param dtMs - 帧间隔（驱动粒子系统）。
 * @param particles - 宿主持有的粒子系统。
 */
export declare function renderPuyo(ctx: CanvasRenderingContext2D, state: PuyoState, paused: boolean, dtMs: number, particles: ParticleSystem): void;
