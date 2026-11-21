import { type BalloonBankState } from './logic.ts';
/**
 * 打气次数对应的气球半径。
 * @param pumps - 打气次数。
 * @returns 半径 px（22..112）。
 */
export declare function balloonRadius(pumps: number): number;
/** 渲染器：持有粒子系统与动画时钟，每帧由 index 驱动。 */
export interface BalloonBankRenderer {
    /**
     * 绘制一帧：消费爆炸事件生成碎片粒子后整体重绘。
     * @param state - 目标状态。
     * @param paused - 暂停中（叠加暂停覆盖层）。
     * @param dtMs - 帧间隔 ms（粒子推进）。
     */
    frame(state: BalloonBankState, paused: boolean, dtMs: number): void;
    /** 粒子系统是否仍在活动（决定逐帧动画期）。 */
    busy(): boolean;
}
/**
 * 创建渲染器。
 * @param ctx - 已按逻辑坐标变换的画布上下文。
 * @returns 渲染器实例。
 */
export declare function createBalloonBankRenderer(ctx: CanvasRenderingContext2D): BalloonBankRenderer;
