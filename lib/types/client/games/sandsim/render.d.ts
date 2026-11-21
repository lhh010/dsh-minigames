import { type SandSimState, type Tool } from './logic.ts';
/** 单格边长（逻辑像素）。 */
export declare const CELL = 11;
/** 计算棋盘左上角（按关卡尺寸在可用区内居中，含边距）。
 * @param s - 游戏状态。
 */
export declare function boardOrigin(s: SandSimState): {
    x: number;
    y: number;
};
/**
 * 整帧绘制（continuous 每帧调用）。
 * @param ctx - 已套用逻辑坐标变换的 2d 上下文。
 * @param s - 游戏状态。
 * @param t - 累计秒（动画相位）。
 * @param tool - 当前选中工具。
 * @param simPaused - 模拟是否暂停（空格）。
 */
export declare function renderSandSim(ctx: CanvasRenderingContext2D, s: SandSimState, t: number, tool: Tool, simPaused: boolean): void;
