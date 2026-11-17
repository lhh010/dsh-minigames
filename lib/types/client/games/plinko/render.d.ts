import type { PlinkoState } from './logic.ts';
export declare const LOGICAL_W = 640;
export declare const LOGICAL_H = 480;
/** 浮动文字（+分 / 轮次提示）。 */
export interface Floaters {
    /** 添加一条从 (x,y) 上浮渐隐的文字。 */
    add(x: number, y: number, text: string, color: string): void;
    /** 按帧推进寿命。 */
    tick(dtMs: number): void;
    /** 绘制在当前场景之上。 */
    draw(ctx: CanvasRenderingContext2D): void;
}
/** 创建浮字系统。 */
export declare function createFloaters(): Floaters;
/** 渲染入参。 */
export interface RenderPlinkoOptions {
    state: PlinkoState;
    paused: boolean;
    /** 直方图预览开关（解锁后仍需玩家按 H 打开）。 */
    preview: boolean;
    /** 模拟时间（毫秒），驱动高倍槽金脉冲。 */
    timeMs: number;
    /** 浮字系统（可省略）。 */
    floaters?: Floaters;
}
/**
 * 整帧绘制弹珠瀑布盘面。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param opts - 渲染入参（状态、暂停、预览、时间、浮字）。
 */
export declare function renderPlinko(ctx: CanvasRenderingContext2D, opts: RenderPlinkoOptions): void;
