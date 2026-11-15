/**
 * 逻辑网格渲染层：木质桌面风格。左侧人名列（行即 1..N 号房），中间 2×2
 * 类别块（块头=类别名，列头=属性值名），右侧线索卡列表（编号+中文文本），
 * ✓ 绿 ✗ 红，推演格淡入，矛盾行高亮，HUD（关卡/用时/提示余量），过关
 * overlay 展示真实解对照。纯绘制，无游戏状态修改。
 */
import { type PlayerState } from './logic.ts';
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 640;
/** 顶部 HUD 高度。 */
export declare const HUD_H = 32;
/** 一个类别块的布局。 */
export interface BlockLayout {
    /** 类别下标。 */
    cat: number;
    x: number;
    y: number;
    w: number;
    h: number;
    /** 单元格边长。 */
    cell: number;
    /** 格区左上角（块内偏移后）。 */
    gridX: number;
    gridY: number;
}
/** 整帧布局（由人数决定，index 点击命中与 render 共用）。 */
export interface LogiLayout {
    /** 人数。 */
    n: number;
    blocks: BlockLayout[];
    /** 人名列参数。 */
    nameX: number;
    nameY: number;
    rowH: number;
    /** 线索面板参数。 */
    clueX: number;
    clueY: number;
    clueW: number;
    clueH: number;
}
/** 计算一帧布局（n≤4 用大格，n=5 用小格以适配 960 宽）。 */
export declare function getLayout(n: number): LogiLayout;
/** 逻辑坐标命中单元格；未命中返回 null。 */
export declare function cellAtPoint(layout: LogiLayout, x: number, y: number): {
    cat: number;
    p: number;
    v: number;
} | null;
/** 一帧所需的 UI 状态（index 持有，render 只读）。 */
export interface LogiUi {
    /** 关卡号。 */
    level: number;
    /** 已用秒。 */
    elapsed: number;
    /** 暂停 overlay。 */
    paused: boolean;
    /** 数字键选中的线索下标（-1 无）。 */
    selectedClue: number;
    /** 推演格淡入：cellIndex -> 起始 ms。 */
    fade: ReadonlyMap<number, number>;
    /** 提示闪烁：cellIndex + 结束 ms。 */
    hintFlash: {
        index: number;
        until: number;
    } | null;
}
/** 画完整一帧。 */
export declare function renderLogigrid(ctx: CanvasRenderingContext2D, st: PlayerState, ui: LogiUi): void;
