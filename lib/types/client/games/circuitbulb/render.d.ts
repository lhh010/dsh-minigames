/**
 * 电路点灯 CircuitBulb 画布渲染：上方一排灯泡卡片（亮灭状态 + 逻辑式
 * 标注），下方一排开关拨钮，两排之间画连接轨道；HUD 显示关卡、拨动
 * 次数对 PAR、剩余提示。渲染器无自身状态——命中检测（switchAt）与
 * 粒子锚点（bulbCenter）供 index.ts 调用，视觉全部走共享主题（../theme.ts）。
 */
import { type GameState, type Hint } from './logic.ts';
/** 逻辑画布宽度（各游戏固定逻辑坐标系）。 */
export declare const LOGICAL_W = 720;
/** 顶部 HUD 高度。 */
export declare const HUD_H = 32;
/** 四周留白。 */
export declare const MARGIN = 14;
/** 灯泡卡片带高度。 */
export declare const BULB_H = 168;
/** 灯泡带与开关带之间的走线区高度。 */
export declare const WIRE_H = 26;
/** 开关卡片带高度。 */
export declare const SWITCH_H = 78;
/** 底部操作提示条高度。 */
export declare const FOOT_H = 24;
/** 逻辑画布总高度。 */
export declare const LOGICAL_H: number;
/** 开关带顶边 y（命中检测与走线共用）。 */
export declare const SWITCH_TOP: number;
/**
 * 逻辑坐标点落在哪个开关卡片上。
 * @param count 开关总数。
 * @returns 开关下标；不在开关带内返回 null。
 */
export declare function switchAt(x: number, y: number, count: number): number | null;
/**
 * 第 i 个灯泡的中心点（过关粒子爆点）。
 * @param count 灯泡总数。
 */
export declare function bulbCenter(i: number, count: number): {
    x: number;
    y: number;
};
/**
 * 绘制一帧完整画面。
 * @param game 当前对局状态（关卡数据、开关状态、拨动/提示计数）。
 * @param lit 各灯泡亮灭（调用方已用 bulbStates 算好）。
 * @param cursor 键盘聚焦的开关下标；null 隐藏聚焦环。
 * @param hint 当前展示中的提示；null 不画。
 * @param paused 显示暂停遮罩。
 * @param winText 过关副标题；null 表示进行中。
 */
export declare function renderCircuit(ctx: CanvasRenderingContext2D, w: number, h: number, game: GameState, lit: boolean[], cursor: number | null, hint: Hint | null, paused: boolean, winText: string | null): void;
