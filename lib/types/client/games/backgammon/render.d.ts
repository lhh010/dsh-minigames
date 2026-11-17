/**
 * 双陆棋 Backgammon 画布渲染：4 象限 24 尖点棋盘（上下各 12 个三角、
 * 中央 bar 中柱、右侧 bear off 出局槽）、双色棋子堆叠计数、顶部骰子
 * （滚动动画、已用骰面变暗）、可走点/出局槽高亮、选中子金环、局分
 * 与 pip HUD、提示行与掷骰按钮、暂停/局终/整场 overlay。共享 theme
 * 视觉件；本模块无状态，全部命中检测为纯函数。
 *
 * 盘面方位：下排右→左为 1..12（1 在最右），上排左→右为 13..24
 * （24 在最右）；玩家内区为右下 1-6 点。
 */
import type { Board, BackgammonPhase, Side } from './logic.ts';
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 640;
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface BackgammonView {
    board: Board;
    phase: BackgammonPhase;
    turn: Side;
    dice: [number, number] | null;
    /** 未用骰面（判断已用骰变暗）。 */
    remaining: number[];
    /** 局号与局分。 */
    roundNo: number;
    roundWinsYou: number;
    roundWinsAi: number;
    matchWinner: Side | null;
    /** 选中来源（-1 无，0 中栏，1..24 点）。 */
    selected: number;
    /** 当前可选来源（来自合法单步的 from 集合）。 */
    movable: number[];
    /** 选中来源的合法落点（0 = bear off）。 */
    targets: number[];
    /** 掷骰滚动动画进行中。 */
    rolling: boolean;
    /** 临时提示文本，空串表示无。 */
    toast: string;
    /** 玩家按 P 的手动暂停。 */
    userPaused: boolean;
    /** 面板驱动的暂停（实例未运行）。 */
    paused: boolean;
}
/** 点 p（1..24）的中心 x。 */
export declare function pointCenterX(p: number): number;
/**
 * 命中检测：返回点击到的尖点编号（1..24），按整列半区判定；未命中
 * 返回 null。
 */
export declare function pointAt(x: number, y: number): number | null;
/** 中栏玩家侧（下半段）命中：可选中栏上的己方子。 */
export declare function barAt(x: number, y: number): boolean;
/** 玩家 bear off 出局槽（右列下半段）命中。 */
export declare function offAt(x: number, y: number): boolean;
/** 掷骰按钮命中。 */
export declare function rollButtonAt(x: number, y: number): boolean;
/**
 * 主渲染入口：整幅盘面 + HUD + 骰子 + 提示 + overlay。
 * @param ctx - 已按逻辑坐标变换的 2d 上下文。
 * @param view - 当前视图状态。
 * @param nowMs - 当前时间戳（毫秒，骰子动画相位用）。
 */
export declare function renderBackgammon(ctx: CanvasRenderingContext2D, view: BackgammonView, nowMs: number): void;
