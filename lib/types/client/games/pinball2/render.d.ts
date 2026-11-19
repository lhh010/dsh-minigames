import { type Pinball2State } from './logic.ts';
/** 逻辑画布尺寸（转发自 logic）。 */
export declare const LOGICAL_W = 440;
export declare const LOGICAL_H = 700;
/** 绘制选项。 */
export interface RenderPinball2Options {
    state: Pinball2State;
    /** 面板隐藏时的静态暂停帧标记。 */
    paused: boolean;
    /** 历史最佳分（HUD 显示）。 */
    best: number;
}
/**
 * 整帧绘制：背景 → 台面元素 → 球 → 发射道 → HUD → 消息 / 遮罩。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设好）。
 * @param o - 状态与显示选项。
 */
export declare function renderPinball2(ctx: CanvasRenderingContext2D, o: RenderPinball2Options): void;
