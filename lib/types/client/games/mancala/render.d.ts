/**
 * 播棋渲染器：木质棋盘（两排坑 + 两端粮仓）、种子堆纹路、播种高亮、
 * 回合指示、粮仓大字计数与胜负/暂停遮罩。使用共享视觉套件（../theme.ts）。
 */
import { type MancalaState, type Side } from './logic.ts';
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 玩家坑索引 0-5 自左向右显示为 5..0（逆时针视觉）。 */
export declare function pitCenter(index: number): {
    x: number;
    y: number;
};
/** 命中检测：逻辑坐标下的坑/粮仓索引，未命中为 -1。 */
export declare function pitAt(x: number, y: number): number;
/** 渲染视图状态（index.ts 组装）。 */
export interface MancalaView {
    /** 14 槽籽数（动画期间为逐帧中间态）。 */
    pits: number[];
    /** 悬停坑索引，或 -1。 */
    hover: number;
    /** 当前回合方。 */
    turn: Side;
    /** 动画高亮槽索引，或 -1。 */
    highlight: number;
    /** 最近走子的起始坑，或 -1。 */
    lastMove: number;
    /** 第几局（1 起）与总局数。 */
    round: number;
    totalRounds: number;
    /** 三局积分（玩家, AI）。 */
    points: [number, number];
    /** 遮罩：null 无 / 'paused' / 本局结果文本键。 */
    overlay: null | 'paused' | 'win' | 'lose' | 'draw' | 'match';
    /** match 遮罩副标题。 */
    matchSubtitle: string;
}
/** 渲染一帧播棋盘面。 */
export declare function renderMancala(ctx: CanvasRenderingContext2D, view: MancalaView): void;
/** 终局判定文案用：本局结果转遮罩键。
 * @param state - 终局状态。
 * @returns 遮罩键。
 */
export declare function resultOverlay(state: MancalaState): 'win' | 'lose' | 'draw' | null;
/** 粮仓计数快捷读取（测试/调试）。
 * @param pits - 14 槽籽数。
 * @returns [玩家粮仓, AI 粮仓]。
 */
export declare function stores(pits: number[]): [number, number];
