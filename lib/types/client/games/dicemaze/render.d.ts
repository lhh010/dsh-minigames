/**
 * 骰子行军画布渲染：暗色网格棋盘（墙块 / 地砖 / 数字门 / 碎地板 / 起
 * 终点）、等轴测 3D 骰子（真实三面点数 + 翻滚时的 3D 旋转插值与跳起
 * 弧线）、步数 HUD 与过关 / 暂停 overlay。全部使用共享视觉套件
 * （../theme.ts）；翻滚旋转与 logic.ts 的朝向变换一一对应。
 */
import { type Board, type Dir, type Orientation } from './logic.ts';
export declare const CELL = 38;
export declare const HUD_H = 46;
/** 固定逻辑画布按最大关卡棋盘取尺寸；小关卡居中。 */
export declare const MAX_COLS = 17;
export declare const MAX_ROWS = 15;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 一帧要画的全部动态信息。 */
export interface DiceMazeView {
    /** 1 基关卡号（HUD）。 */
    level: number;
    /** 当前步数。 */
    steps: number;
    /** 骰子当前格（翻滚落定后的逻辑格）。 */
    x: number;
    y: number;
    /** 落定后的朝向。 */
    orient: Orientation;
    /** 进行中的翻滚动画（null = 静止）。 */
    anim: {
        dir: Dir;
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
        fromOrient: Orientation;
        /** 0..1 进度。 */
        t: number;
    } | null;
    /** 碎地板破坏标记。 */
    broken: Uint8Array;
    /** 过关文案（null = 进行中）。 */
    winText: string | null;
    /** 暂停 overlay。 */
    paused: boolean;
}
/** 棋盘左上角像素（按关卡尺寸居中）。 */
export declare function gridOffset(board: Board): {
    ox: number;
    oy: number;
};
/**
 * 画等轴测骰子：真实 3D 立方体投影，可见面按深度排序，面上点数按点
 * 阵投影；rot 为翻滚的部分旋转（null = 落定姿态）。
 * @param ctx 画布上下文。
 * @param cx 立方体中心 x（像素）。
 * @param cy 立方体中心 y（像素）。
 * @param orient 基准朝向（rot 为 null 时的最终朝向，动画中为翻滚前朝向）。
 * @param rot 翻滚部分旋转；完成角度时几何上恰等于翻滚后朝向。
 */
export declare function drawDice(ctx: CanvasRenderingContext2D, cx: number, cy: number, orient: Orientation, rot: {
    axis: 'x' | 'z';
    rad: number;
} | null): void;
/** 粒子是否还在运动（index 据此决定逐帧重绘窗口）。 */
export declare function dicemazeParticlesActive(): boolean;
/** 画一帧完整场景。 */
export declare function renderDicemaze(ctx: CanvasRenderingContext2D, board: Board, view: DiceMazeView, dtMs: number): void;
