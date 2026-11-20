/**
 * 迷你爬塔 TowerCard 渲染层：卡牌风画面——左侧塔层进度侧栏、顶部敌我
 * 血条/格挡条与意图图标（telegraph 蓄力警示）、中央能量水晶、底部手牌
 * 扇形、奖励三卡、结束回合按钮与结算/暂停遮罩。布局常量与 hit 检测共用
 * 同一纯函数，保证命中区域与绘制区域逐像素一致；动态文本右侧锚定防
 * 串位。本文件只画不改逻辑。
 */
import { type TowerState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const W = 960;
export declare const H = 640;
/** 手牌卡面尺寸。 */
export declare const CARD_W = 92;
export declare const CARD_H = 120;
/** 浮动提示文字（由 index 推进 age）。 */
export interface FloatText {
    text: string;
    x: number;
    y: number;
    color: string;
    age: number;
    maxAge: number;
}
/** 渲染视图参数：逻辑状态 + 动画进度 + 暂停。 */
export interface TowerView {
    state: TowerState;
    floats: FloatText[];
    /** 敌人受击抖动 0-1（衰减）。 */
    enemyShake: number;
    /** 勇者受击/格挡闪光 0-1（衰减）。 */
    playerFlash: number;
    paused: boolean;
}
/** 手牌第 i 张的卡面矩形（扇形布局，n 为手牌数）。 */
export declare function cardSlot(i: number, n: number): {
    x: number;
    y: number;
    rot: number;
};
/** 手牌命中检测：返回卡牌下标，未命中 -1。 */
export declare function hitCard(px: number, py: number, n: number): number;
/** 敌人槽位矩形（渲染与命中共用）：x/y/w/h。 */
export declare function enemySlot(i: number, n: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 敌人命中检测：只命中存活敌人，返回其下标，未命中 -1。 */
export declare function hitEnemy(px: number, py: number, state: TowerState): number;
/** 结束回合按钮矩形。 */
export declare const END_TURN_RECT: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 按钮命中检测。 */
export declare function hitEndTurn(px: number, py: number): boolean;
/** 奖励卡矩形（三张，i=0..2）。 */
export declare function rewardSlot(i: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 奖励卡命中检测：返回奖励下标，未命中 -1。 */
export declare function hitReward(px: number, py: number): number;
/** 主渲染入口。 */
export declare function renderTower(ctx: CanvasRenderingContext2D, view: TowerView): void;
