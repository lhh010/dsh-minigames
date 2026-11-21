import type { VacuumState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 640;
export declare const LOGICAL_H = 480;
/** 求某格中心的像素坐标（含边距自适应居中）。 */
export declare function vacuumCellCenter(state: VacuumState, x: number, y: number): {
    cx: number;
    cy: number;
    cs: number;
    ox: number;
    oy: number;
};
/**
 * 整帧绘制入口。
 * @param ctx - 画布上下文。
 * @param state - 对局状态。
 * @param opts - paused：暂停遮罩；allDone：五关全通终局遮罩。
 */
export declare function renderVacuum(ctx: CanvasRenderingContext2D, state: VacuumState, opts: {
    paused: boolean;
    allDone: boolean;
}): void;
