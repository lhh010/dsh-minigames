/**
 * 手电迷宫渲染器：纯黑战场 + 扇形光锥渐变照亮，记忆格暗淡重显，
 * 金币闪烁、陷阱尖刺、电池补光、出口微光塔（始终隐约可见的方向感）、
 * 生命 / 金币 / 步数 HUD 与过关 / 暂停 overlay。只用共享视觉套件。
 */
import { type DarkMazeState } from './logic.ts';
/** 单格逻辑像素。 */
export declare const CELL = 24;
/** 顶部 HUD 高度。 */
export declare const HUD_H = 44;
/** 最大关卡尺寸（25×25）决定固定逻辑画布。 */
export declare const MAX_SIZE = 25;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 渲染附加选项。 */
export interface DarkRenderOptions {
    /** 显示暂停 overlay。 */
    paused: boolean;
    /** 五关全部通关（显示最终通关 overlay 而非单关过关）。 */
    finished: boolean;
}
/** 任意迷宫格的中心像素坐标（居中布局）。 */
export declare function darkCellCenter(maze: DarkMazeState['maze'], x: number, y: number): {
    px: number;
    py: number;
};
/** 渲染一帧（连续模式每帧调用）。
 * @param ctx 已按逻辑坐标变换的 2d 上下文
 * @param state 当前游戏状态
 * @param options 暂停 / 终局标记
 */
export declare function renderDarkMaze(ctx: CanvasRenderingContext2D, state: DarkMazeState, options: DarkRenderOptions): void;
