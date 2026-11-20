/**
 * 疾速集合 SET 画布渲染：经典 SET 卡牌（红/绿/紫 × 菱/椭圆/波浪 × 实/空/
 * 条纹 × 1-3 个），选中卡浮起 + 金边，教学闪边，成功三卡飞出 + 粒子，错误
 * 震动，剩余牌堆 / 时间 / 集合数 HUD，结束 / 暂停 overlay。渲染器无状态，
 * 动画进度由 index.ts 以视图参数传入。
 */
import type { SetGameState } from './logic.ts';
import { createParticles } from '../theme.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 440;
export declare const LOGICAL_H = 680;
/** 牌面三色（红/绿/紫）。 */
export declare const SET_COLORS: readonly ["#f7768e", "#9ece6a", "#bb9af7"];
/**
 * 第 index 张桌面牌的槽位矩形（逻辑坐标）。
 * @param index - 桌面槽位下标。
 * @param count - 桌面张数。
 * @returns 左上角与宽高。
 */
export declare function cardRect(index: number, count: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中测试：逻辑坐标落在哪张桌面牌上。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param count - 桌面张数。
 * @returns 槽位下标或 null。
 */
export declare function cardAt(x: number, y: number, count: number): number | null;
/**
 * 画一张 SET 牌：面数 n 的形状、按填充值实/空/条纹着色。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param card - 牌号 0-80。
 * @param x - 左上角横坐标。
 * @param y - 左上角纵坐标（已含浮起偏移）。
 * @param w - 牌宽。
 * @param h - 牌高。
 */
export declare function drawSetCard(ctx: CanvasRenderingContext2D, card: number, x: number, y: number, w: number, h: number): void;
/** 成功飞出动画中的一张牌。 */
export interface FlyCard {
    card: number;
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 渲染视图参数（动画进度与粒子由 index.ts 维护）。 */
export interface SetView {
    paused: boolean;
    /** 错误震动剩余毫秒（0 = 不震）。 */
    shakeMs: number;
    /** 飞出动画（cards + 0..1 进度），null = 无。 */
    fly: {
        cards: FlyCard[];
        progress: number;
    } | null;
    /** 教学闪边三元组（logic.tutorSet 的结果）。 */
    hint: [number, number, number] | null;
    /** 动画时钟（毫秒），驱动闪边脉冲。 */
    timeMs: number;
    /** 成功粒子系统（场景后、overlay 前 tick）。 */
    particles: ReturnType<typeof createParticles>;
}
/**
 * 画一帧。
 * @param ctx - 逻辑坐标系已就绪的 2d 上下文。
 * @param state - 游戏状态。
 * @param view - 视图参数。
 * @param dtMs - 本帧毫秒数（供粒子 tick）。
 */
export declare function renderSetGame(ctx: CanvasRenderingContext2D, state: SetGameState, view: SetView, dtMs: number): void;
/** 便捷工厂：返回共享粒子系统（成功庆祝特效用）。 */
export declare function createSetParticles(): ReturnType<typeof createParticles>;
