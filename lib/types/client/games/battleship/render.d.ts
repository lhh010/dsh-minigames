/**
 * 海战棋渲染层：双海图（左侧敌方雾区、右侧己方舰队能见）、命中 ✕ 与
 * miss ○ 标记、沉舰轮廓浮现、布舰预览（合法绿 / 非法红）、AI 思考指示、
 * 低难度热图提示（己方被猜概率半透明叠加）、局分 HUD 与胜负暂停 overlay。
 * 纯绘制无状态；命中爆炸粒子由 index 持有并在场景之后叠加。
 */
import { type Battle, type Placement } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 820;
export declare const LOGICAL_H = 520;
/** 布置期给 index 的预览信息。 */
export interface PlacingView {
    /** 已布好的舰（与 FLEET 前缀对齐）。 */
    placed: Placement[];
    /** 当前待布舰的预览锚点（null = 未悬停）。 */
    preview: Placement | null;
    /** 预览是否合法。 */
    previewOk: boolean;
    /** 当前待布舰在 FLEET 中的下标。 */
    shipIndex: number;
}
/** 渲染一帧所需的全部视图状态。 */
export interface BattleView {
    /** placing 布舰期 / battle 战斗期 / over 本局结束。 */
    mode: 'placing' | 'battle' | 'over';
    /** 布舰期信息；战斗期为 null。 */
    placing: PlacingView | null;
    /** 对局状态；布舰期为 null。 */
    battle: Battle | null;
    /** AI 回合思考中（玩家等待提示）。 */
    aiThinking: boolean;
    /** 热图提示开关：显示己方海域被 AI 猜中的概率叠加。 */
    heatOn: boolean;
    /** heatOn 时由 index 计算的 AI 视角己方热图。 */
    playerHeat: number[][] | null;
    /** 当前挑战局数（1 起）。 */
    round: number;
    /** 总局数（5）。 */
    totalRounds: number;
    /** 挑战积分。 */
    score: number;
    /** 底部短提示（空串 = 无）。 */
    message: string;
    /** 本局胜负（over 模式）。 */
    over: 'won' | 'lost' | null;
    /** 暂停遮罩。 */
    paused: boolean;
}
/**
 * 命中测试：逻辑坐标落在哪块海图哪个格。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 目标海图与行列；越界返回 null。
 */
export declare function boardAt(x: number, y: number): {
    target: 'enemy' | 'own';
    row: number;
    col: number;
} | null;
/**
 * 敌方海图某格中心（粒子落点）。
 * @param row - 行。
 * @param col - 列。
 * @returns 中心坐标。
 */
export declare function enemyCellCenter(row: number, col: number): {
    x: number;
    y: number;
};
/**
 * 己方海图某格中心（粒子落点）。
 * @param row - 行。
 * @param col - 列。
 * @returns 中心坐标。
 */
export declare function ownCellCenter(row: number, col: number): {
    x: number;
    y: number;
};
/**
 * 绘制一帧完整场景（背景、双海图、标记、热图、HUD、overlay）。
 * @param ctx - 画布上下文（逻辑坐标系）。
 * @param view - 视图状态。
 */
export declare function renderBattle(ctx: CanvasRenderingContext2D, view: BattleView): void;
