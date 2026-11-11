/**
 * 一笔画 canvas 渲染：共享主题包 + 纸面网格底、节点圆点（内标剩余度）、
 * 未画边深色 / 已画边亮色描边、笔尖沿最新一条边插值滑动的画线动画、
 * 提示模式下的奇点标记、边数进度 HUD 与过关 / 失败 / 暂停 overlay。
 *
 * 画线动画状态保存在模块内（同 hashi 的粒子池模式）：每条新出现的已画
 * 边记录起始时间，200ms 内从 0 画到 1；动画未结束前 animationActive()
 * 返回 true，调用方据此持续标脏逐帧重绘。
 */
import type { OneStrokeGraph, StrokeState } from './logic.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 540;
/** 渲染视图：把图的外包矩形等比映射进棋盘区域。 */
export interface GraphView {
    /** 节点 → 画布中心坐标。 */
    centers: {
        x: number;
        y: number;
    }[];
    /** 命中半径。 */
    radius: number;
}
/**
 * 计算一张图在画布上的节点坐标视图。
 * @param graph - 要布局的图。
 */
export declare function viewOf(graph: OneStrokeGraph): GraphView;
/**
 * 命中测试：逻辑坐标下的节点下标，无命中返回 null。
 * @param graph - 图。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 */
export declare function nodeAt(graph: OneStrokeGraph, x: number, y: number): number | null;
/** 是否仍有边在画线动画中（调用方据此逐帧标脏）。 */
export declare function animationActive(): boolean;
/**
 * 绘制一帧。
 * @param ctx - 已应用逻辑坐标变换的 2d 上下文。
 * @param state - 当前对局状态。
 * @param level - 关卡号（1 起）。
 * @param hint - 是否显示提示（奇点标记 + 剩余度图例）。
 * @param paused - 是否暂停（画暂停 overlay）。
 * @param failText - 失败/死点提示文案；null 表示进行中。
 * @param winText - 过关文案；null 表示未过关。
 */
export declare function renderOneStroke(ctx: CanvasRenderingContext2D, state: StrokeState, level: number, hint: boolean, paused: boolean, failText: string | null, winText: string | null): void;
