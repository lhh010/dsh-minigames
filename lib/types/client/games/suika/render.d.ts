/**
 * 合成大西瓜渲染层：黄色警戒线（危险时脉冲增亮）、左右墙与地面、各级
 * 水果彩色圆 + 高光与表情、投放位引导线与手上水果（冷却半透明）、下一
 * 个水果预览、HUD 分数/下一个/最高级、合成爆裂粒子与浮字、暂停/结束
 * 遮罩。粒子为渲染层私有，消费 logic 产生的 merge 事件。
 */
import { type SuikaState } from './logic.ts';
/**
 * 画完整一帧。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param state - 游戏状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 * @param dtMs - 距上帧 ms（粒子推进用）。
 */
export declare function renderSuika(ctx: CanvasRenderingContext2D, state: SuikaState, paused: boolean, dtMs: number): void;
