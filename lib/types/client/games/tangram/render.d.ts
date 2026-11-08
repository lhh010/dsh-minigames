import { type TangramState } from './logic.ts';
/**
 * 绘制一帧七巧板。
 * @param ctx - 画布上下文。
 * @param w - 逻辑宽。
 * @param h - 逻辑高。
 * @param state - 当前状态。
 * @param selected - 选中的板块下标（无则 null）。
 * @param paused - 是否暂停（画遮罩）。
 * @param winText - 过关副标题；null 表示进行中。
 */
export declare function renderTangram(ctx: CanvasRenderingContext2D, w: number, h: number, state: TangramState, selected: number | null, paused: boolean, winText: string | null): void;
/**
 * 命中测试：返回逻辑坐标 (x, y) 处最上层的板块下标（后画的优先），无则 null。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param state - 当前状态。
 */
export declare function pieceAt(x: number, y: number, state: TangramState): number | null;
