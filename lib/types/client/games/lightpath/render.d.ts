import { type LightPathState, type LightResult } from './logic.ts';
/** 格子中心点（逻辑坐标 px）。 */
export declare function cellCenter(row: number, col: number): {
    x: number;
    y: number;
};
/**
 * 命中测试：逻辑坐标 (x,y) 落在哪面镜的格子上。
 * @param state - 当前状态。
 * @param x - 逻辑 x px。
 * @param y - 逻辑 y px。
 * @returns 镜数组索引；不在盘面或该格无镜返回 -1。
 */
export declare function hitMirror(state: LightPathState, x: number, y: number): number;
export interface RenderOptions {
    /** 性能时钟（流光 / 脉冲相位）。 */
    nowMs: number;
    /** 是否暂停（画暂停 overlay）。 */
    paused: boolean;
    /** hover 中的镜索引（null 无）。 */
    hover: number | null;
}
/**
 * 整帧绘制：背景 → 盘面 → 光束 → 实体 → HUD → overlay。
 * @param ctx - 逻辑坐标变换后的 2d 上下文。
 * @param state - 当前状态。
 * @param result - 最近一次光路求值结果。
 * @param options - 渲染选项。
 */
export declare function renderLightPath(ctx: CanvasRenderingContext2D, state: LightPathState, result: LightResult, options: RenderOptions): void;
