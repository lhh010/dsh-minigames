/**
 * 取子博弈 Nim 画布渲染器：篝火夜景（星点 + 底部火焰摇曳）、水平火柴
 * 排（当前排高亮、悬停/键盘选取数预览）、玩家/AI 回合指示（AI 思考
 * 动画）、异或局势提示条（绿 安全 / 红 危险 的教学指示）、局数/分数
 * HUD 与暂停/胜负 overlay。渲染器无自有状态，动画相位由调用方传入的
 * timeMs 驱动；命中检测辅助函数供 index.ts 把指针坐标换算成走法。
 */
import type { NimState } from './logic.ts';
export declare const LOGICAL_W = 460;
/** HUD 高度（局数/分数行）。 */
export declare const HUD_H = 30;
/** 回合指示条高度。 */
export declare const TURN_H = 26;
/** 每排火柴带的纵向高度。 */
export declare const ROW_BAND_H = 38;
export declare const ROWS_TOP: number;
export declare const HINT_H = 30;
export declare const FIRE_ZONE_H = 84;
/** 最多排数下的棋盘总高（布局常量，含提示条与篝火区）。 */
export declare const LOGICAL_H: number;
/** 某排火柴带的纵向中心 y。 */
export declare function rowCenterY(row: number): number;
/** 命中检测：逻辑坐标落在哪一排（排带矩形），未命中返回 null。 */
export declare function rowAt(y: number): number | null;
/**
 * 命中检测：逻辑坐标点到某排第 count 根（从右数起，1..n）的取子步。
 * 排带内的火柴按剩余根数重排，命中第 p 根（左起 0 基）即取 n-p 根。
 * @param x - 逻辑 x 坐标。
 * @param y - 逻辑 y 坐标。
 * @param rows - 各排剩余火柴数。
 * @returns 对应走法；不在任何火柴命中区返回 null。
 */
export declare function stickAt(x: number, y: number, rows: number[]): {
    row: number;
    count: number;
} | null;
/** 渲染选项（见 index.ts 的调用方持有状态）。 */
export interface RenderOptions {
    /** 键盘/点击选中的当前排，或 null。 */
    selectedRow: number | null;
    /** 悬停预览：指向某排第 count 根（从右数）时的发光预览，或 null。 */
    hover: {
        row: number;
        count: number;
    } | null;
    /** 键盘选定的取子数（1..选中排剩余），或 null。 */
    previewCount: number | null;
    /** 赛事总分（HUD）。 */
    score: number;
    /** 当前局序号（1 起）。 */
    roundNo: number;
    /** AI 思考中（回合指示动画）。 */
    aiThinking: boolean;
    /** 动画相位（performance.now() 毫秒）。 */
    timeMs: number;
    /** 暂停 overlay。 */
    paused: boolean;
    /** 本局结果 overlay 文案（胜/负副标题），或 null。 */
    roundText: string | null;
    /** 赛事终局 overlay 文案，或 null。 */
    matchText: string | null;
    /** 是否显示异或局势教学提示条。 */
    hintOn: boolean;
}
/**
 * 绘制一帧完整画面。
 * @param ctx - 逻辑坐标系下的 2d 上下文。
 * @param w - 逻辑宽度（LOGICAL_W）。
 * @param h - 逻辑高度（LOGICAL_H）。
 * @param state - 当前局面（rows/turn/over）。
 * @param opts - 渲染选项（选中、预览、HUD、overlay）。
 */
export declare function renderNim(ctx: CanvasRenderingContext2D, w: number, h: number, state: NimState, opts: RenderOptions): void;
