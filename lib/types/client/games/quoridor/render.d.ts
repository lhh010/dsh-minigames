/**
 * 鬼墙渲染器：木纹棋盘（格线 + 目标行高亮）、双方圆形木子、墙槽凹槽
 * 与已放墙（按放置者着色）、侧栏剩余墙堆叠条、悬停幽灵墙预览（合法
 * 绿 / 非法红半透明）、合法落点提示、双方最短路距离与局分 HUD、AI
 * 思考提示及暂停/终局 overlay。纯 canvas 绘制，无 DOM、无状态。
 */
import { type Pos, type QuoridorState, type WallOrient } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const CELL = 36;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 输入模式：走子 / 横墙 / 竖墙（W 循环切换）。 */
export type InputMode = 'move' | 'wallH' | 'wallV';
/** 一次渲染的全部视图数据。 */
export interface QuoridorView {
    state: QuoridorState;
    /** 当前输入模式。 */
    mode: InputMode;
    /** 当前方合法走子落点。 */
    steps: readonly Pos[];
    /** 悬停格（走子模式）。 */
    hoverCell: Pos | null;
    /** 悬停墙锚点（放墙模式）。 */
    hoverWall: {
        orient: WallOrient;
        c: number;
        r: number;
    } | null;
    /** 悬停墙是否合法（幽灵着色）。 */
    wallPreviewValid: boolean;
    /** AI 思考中提示。 */
    thinking: boolean;
    /** 三局两胜的局分。 */
    matchWins: [number, number];
    /** 当前难度级别标签。 */
    levelLabel: string;
    /** 双方最短路（步）。 */
    dists: [number, number];
    /** 暂停中。 */
    paused: boolean;
    /** 整个 3 局 2 胜已结束。 */
    matchOver: boolean;
    /** 玩家（南方）最终是否夺得赛点。 */
    matchWon: boolean;
}
/** 棋子/格子几何：格子左上角。 */
export declare function cellXY(c: number, r: number): {
    x: number;
    y: number;
};
/** 墙锚点 (c,r) 的中心点（横竖墙同槽同心）。 */
export declare function slotCenter(c: number, r: number): {
    x: number;
    y: number;
};
/** 指针位置的格子（不在棋盘内返回 null）。 */
export declare function cellAt(x: number, y: number): Pos | null;
/** 指针位置吸附到的墙锚点（距槽中心超过 0.75 格返回 null）。 */
export declare function wallSlotAt(x: number, y: number): {
    c: number;
    r: number;
} | null;
/** 主渲染入口。 */
export declare function renderQuoridor(ctx: CanvasRenderingContext2D, view: QuoridorView): void;
