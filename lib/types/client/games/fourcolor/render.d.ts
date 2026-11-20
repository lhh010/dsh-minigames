/**
 * 四色地图画布渲染：政区地图风——网格单元按区域色填充，区域间画深色
 * 边界；选中区域白边高亮、冲突区域红边闪烁、提示区域金边暂留；底部色
 * 板（4/3 色按钮）与 HUD（关卡 / 已涂 / 换色 / 提示）；过关时全图渐变
 * 亮起后叠加过关 overlay。渲染为无状态纯函数，随机与动画时钟均由调用
 * 方注入。
 */
import { type FourColorState } from './logic.ts';
/** HUD 高度（顶部）。 */
export declare const HUD_H = 30;
/** 色板区高度（底部）。 */
export declare const PALETTE_H = 54;
/** 盘面外留白。 */
export declare const MARGIN = 12;
/** 单元边长（逻辑像素）。 */
export declare const CELL = 18;
/** 盘面宽。 */
export declare const BOARD_W: number;
/** 盘面高。 */
export declare const BOARD_H: number;
/** 逻辑画布宽。 */
export declare const LOGICAL_W: number;
/** 逻辑画布高。 */
export declare const LOGICAL_H: number;
/** 渲染所需的界面状态（index 层持有）。 */
export interface FourColorUi {
    /** 当前选中色（色板高亮 + 区域点击涂色用）。 */
    activeColor: number;
    /** 选中的区域，或 null。 */
    selected: number | null;
    /** 是否暂停。 */
    paused: boolean;
    /** 当前关卡号（HUD 显示）。 */
    level: number;
    /** 动画时钟（performance.now()），冲突闪烁用。 */
    nowMs: number;
    /** 过关动画进度 0-1；null 表示未过关。 */
    winProgress: number | null;
    /** 过关 overlay 副标题；null 表示尚未显示。 */
    winText: string | null;
    /** 提示闪示：区域 + 失效时刻；null 表示无。 */
    hintFlash: {
        region: number;
        untilMs: number;
    } | null;
}
/**
 * 逻辑坐标 → 区域下标（盘面外返回 null）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 区域下标或 null。
 */
export declare function regionAt(x: number, y: number): number | null;
/**
 * 逻辑坐标 → 色板按钮的颜色号（按钮外返回 null）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param paletteSize - 色板按钮个数。
 * @returns 颜色号或 null。
 */
export declare function paletteAt(x: number, y: number, paletteSize: number): number | null;
/**
 * 绘制一帧完整画面。
 * @param ctx - 画布上下文。
 * @param w - 逻辑宽。
 * @param h - 逻辑高。
 * @param state - 游戏状态。
 * @param ui - 界面状态（选中 / 动画时钟 / 过关等）。
 */
export declare function renderFourColor(ctx: CanvasRenderingContext2D, w: number, h: number, state: FourColorState, ui: FourColorUi): void;
