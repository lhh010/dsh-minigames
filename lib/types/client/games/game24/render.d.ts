/**
 * 24点渲染器：目标 24 大字、四张初始牌扇形排列（合并出的中间结果
 * 牌新起一行）、运算符按钮、本局历史表达式、无解提示、连胜 HUD 与
 * 获胜/暂停遮罩。全部为纯 canvas 绘制，状态由 index.ts 传入
 * （见 Game24View）。
 */
import { type Game24Card, type Game24State, type Op } from './logic.ts';
/** 逻辑画布宽度 px。 */
export declare const W = 780;
/** 逻辑画布高度 px。 */
export declare const H = 620;
/** HUD 条高度（含在 H 内）。 */
export declare const HUD_H = 40;
/** 牌面宽 px。 */
export declare const CARD_W = 92;
/** 牌面高 px。 */
export declare const CARD_H = 128;
/** 运算符按钮行 y。 */
export declare const OP_Y = 508;
/** 运算符按钮宽 px。 */
export declare const OP_W = 64;
/** 运算符按钮高 px。 */
export declare const OP_H = 44;
/** 功能按钮行 y。 */
export declare const ACT_Y = 570;
/** 一张牌的摆放位置（rot 为弧度，扇形微转）。 */
export interface CardSlot {
    x: number;
    y: number;
    rot: number;
}
/**
 * 计算当前牌面布局：初始牌（id < 4）扇形一行（边缘下垂微转），
 * 中间结果牌（id ≥ 4）新起一行水平居中。
 * @param cards - 当前牌面。
 * @returns 牌 id → 摆放位置。
 */
export declare function layoutCards(cards: Game24Card[]): Map<number, CardSlot>;
/**
 * 命中测试：牌面点击，返回 cards 下标。
 * @param cards - 当前牌面。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 命中牌下标；未命中为 -1。
 */
export declare function hitCard(cards: Game24Card[], x: number, y: number): number;
/** 第 i 个运算符按钮的矩形。 */
export declare function opRect(index: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中测试：运算符按钮。
 * @returns 命中的运算符；未命中为 null。
 */
export declare function hitOp(x: number, y: number): Op | null;
/** 功能按钮 id：撤回 / 提示 / 换一局。 */
export type Game24Action = 'undo' | 'hint' | 'new';
/** 第 i 个功能按钮的矩形。 */
export declare function actionRect(index: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中测试：功能按钮。
 * @returns 命中的按钮 id；未命中为 null。
 */
export declare function hitAction(x: number, y: number): Game24Action | null;
/** 一次渲染所需的全部状态。 */
export interface Game24View {
    state: Game24State;
    paused: boolean;
    /** 提示闪现剩余秒数（>0 时高亮 hintIds 并显示 hintText）。 */
    hintFlash: number;
    /** 提示涉及的两张牌 id。 */
    hintIds: number[];
    /** 提示文本（如 "8 ÷ 3"）。 */
    hintText: string;
}
/** 主渲染入口。 */
export declare function renderGame24(ctx: CanvasRenderingContext2D, view: Game24View): void;
