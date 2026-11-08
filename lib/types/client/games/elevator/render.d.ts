import { type ElevatorState } from './logic.ts';
/** 逻辑画布宽度。 */
export declare const VIEW_W = 560;
/** 逻辑画布高度。 */
export declare const VIEW_H = 520;
/** 电梯井宽度。 */
export declare const SHAFT_W = 84;
/** 电梯井左边缘 x（楼层数字右侧）。 */
export declare const SHAFT_X: number;
/** 单层高度（像素）。 */
export declare const FLOOR_H: number;
/** 某楼层中心线 y（1 层在最下）。 */
export declare function floorY(floor: number): number;
/** 轿厢中心（送达粒子迸发点）。 */
export declare function carCenter(state: ElevatorState): {
    x: number;
    y: number;
};
/**
 * 整帧绘制：背景 + 楼层 + 井道 + HUD + overlay。
 * @param ctx - 画布上下文（已套用逻辑坐标变换）。
 * @param state - 游戏状态。
 * @param particles - 粒子系统（在 overlay 前推进绘制）。
 * @param paused - 暂停标志（绘制暂停 overlay）。
 */
export declare function renderElevator(ctx: CanvasRenderingContext2D, state: ElevatorState, particles: {
    tick(c: CanvasRenderingContext2D, dtMs: number): void;
}, paused: boolean): void;
