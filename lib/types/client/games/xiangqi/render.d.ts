/**
 * 中国象棋渲染器：木纹棋盘、楚河汉界、九宫斜线、兵炮位标记、
 * 圆形红黑字棋子、选中/可走位提示、将军红字、吃子粒子（由 index 层
 * 的粒子系统叠加）、HUD（回合/难度/思考中/悔棋按钮）与胜负遮罩。
 * 使用共享视觉组件（../theme.ts）。棋盘为 9x10 交叉点，row 0 在上（黑方）。
 */
import { type Move, type Position } from './logic.ts';
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 交叉点逻辑坐标 -> 画布 x。 */
export declare function pointX(col: number): number;
/** 交叉点逻辑坐标 -> 画布 y。 */
export declare function pointY(row: number): number;
/** 画布坐标 -> 交叉点索引，容差半格；棋盘外返回 -1。 */
export declare function pointAt(x: number, y: number): number;
/** 悔棋按钮区域（HUD 右侧），命中返回 true。 */
export declare function undoHit(x: number, y: number): boolean;
export interface XiangqiView {
    pos: Position;
    /** 选中的交叉点索引，-1 为未选。 */
    selected: number;
    /** 选中棋子的合法落点索引集合。 */
    targets: ReadonlySet<number>;
    /** 最近一步着法。 */
    lastMove: Move | null;
    /** 被将军的将/帅位置，-1 为无。 */
    checkSquare: number;
    /** 难度标签（如 "难度 2·深度 3"）。 */
    difficultyLabel: string;
    /** AI 是否思考中。 */
    thinking: boolean;
    /** 终局标题，对局中为 null。 */
    statusText: string | null;
    statusSub: string;
    statusColor: string;
    paused: boolean;
    /** 是否可悔棋（控制按钮亮/灰）。 */
    canUndo: boolean;
}
/** 渲染一帧象棋视图（粒子由调用方随后叠加）。 */
export declare function renderXiangqi(ctx: CanvasRenderingContext2D, view: XiangqiView): void;
