/**
 * 蛋糕等分 CakeCut 的渲染：俯视蛋糕（奶油同心纹理 + 每块独立浅色）、
 * 刀线预览（虚线吸附到块边交点）、切块分离位移、每块面积偏差标签、
 * 剩余刀数/容差 HUD、对称辅助线与过关/暂停 overlay。世界坐标以蛋糕
 * 中心为原点，画布逻辑坐标 640×520，本模块负责双向映射。
 */
import type { Block, Line, Poly, Pt, Seg } from './logic.ts';
/** 画布逻辑宽度。 */
export declare const logicalW = 640;
/** 画布逻辑高度。 */
export declare const logicalH = 520;
/** 世界点 → 画布点。 */
export declare function toCanvas(p: Pt): Pt;
/** 画布坐标（如鼠标事件换算结果）→ 世界点。 */
export declare function toWorld(x: number, y: number): Pt;
/** 一块的绘制视图：块本体 + 分离位移 + 偏差标签。 */
export interface BlockView {
    block: Block;
    color: string;
    offset: Pt;
    label: string;
    labelColor: string;
}
/** 刀线预览：吸附后的实体段集合与合法性着色。 */
export interface PreviewView {
    segs: Seg[];
    ok: boolean;
}
/** 顶部 HUD 数据。 */
export interface HudView {
    levelName: string;
    levelIndex: number;
    cutsLeft: number;
    piecesNow: number;
    piecesTarget: number;
    tolerancePct: string;
    time: string;
    failText: string | null;
}
/** 一帧完整绘制输入（index 组装，本模块只画）。 */
export interface CakeRenderInput {
    blocks: BlockView[];
    outlineCenter: Pt;
    guides: Line[];
    showGuides: boolean;
    preview: PreviewView | null;
    hud: HudView;
    paused: boolean;
    winText: string | null;
}
/** 块质心（世界坐标，简单顶点平均足够标签定位）。 */
export declare function centroid(poly: Poly, off: Pt): Pt;
/**
 * 绘制一帧蛋糕等分局面。
 * @param ctx - 画布上下文（已应用 fit 变换）。
 * @param input - 本帧视图数据。
 */
export declare function renderCake(ctx: CanvasRenderingContext2D, input: CakeRenderInput): void;
