/**
 * 魔方 canvas 渲染：十字展开图（L F R B 一排，U 在 F 上、D 在 F 下），
 * 每面 3×3 贴纸格网 + 行/列旋转箭头（箭头命中检测见 {@link arrowAt}），
 * HUD 显示 关卡/打乱参考/提示余量/步数/计时，拧动时受影响贴纸沿箭头
 * 方向滚动高亮，过关显示庆祝 overlay。渲染器无状态：全部状态由调用方
 * 传入；视觉件来自共享 ../theme.ts。
 */
import { type Cube, type FaceName, type Move } from './logic.ts';
/** 面板顶 HUD 高度。 */
export declare const HUD_H = 34;
/** 展开图与画布边缘留白（含外层箭头空间）。 */
export declare const EDGE = 30;
/** 面与面之间的箭头槽宽。 */
export declare const GUTTER = 18;
/** 一个 3×3 面的边长。 */
export declare const FACE = 120;
/** 相邻面的中心距。 */
export declare const PITCH: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 六面贴纸配色（下标 = 颜色号 = 面号）：白黄橙红绿蓝。 */
export declare const FACE_COLORS: readonly string[];
/** 一个可点击的旋转箭头（含命中矩形与等价走法）。 */
export interface Arrow {
    face: FaceName;
    axis: 'row' | 'col';
    index: number;
    dir: number;
    /** 逻辑坐标命中矩形。 */
    x: number;
    y: number;
    w: number;
    h: number;
    /** 等价层旋转。 */
    move: Move;
    /** 受影响贴纸下标集合（拧动高亮）。 */
    indices: readonly number[];
}
/** 命中某个箭头（逻辑坐标），未命中返回 null。 */
export declare function arrowAt(x: number, y: number): Arrow | null;
/** 全部箭头（index.ts 派发点击用；主要走 {@link arrowAt}）。 */
export declare function allArrows(): readonly Arrow[];
/** 拧动动画描述：受影响贴纸 + 进度 0..1 + 滚动方向 + 对应走法 id（箭头高亮匹配）。 */
export interface AnimInfo {
    indices: ReadonlySet<number>;
    /** 0（开始）→ 1（结束）。 */
    phase: number;
    dx: number;
    dy: number;
    /** 正在执行的走法 id。 */
    moveId: string;
}
/** 渲染所需的一帧状态快照。 */
export interface RenderState {
    cube: Cube;
    level: number;
    scrambleLen: number;
    moves: number;
    hintsLeft: number;
    elapsedMs: number;
    paused: boolean;
    /** 过关副标题；null 表示进行中。 */
    winText: string | null;
}
/**
 * 绘制一帧。
 * @param anim - 当前拧动动画（贴纸滚动高亮），无动画传 null。
 */
export declare function renderRubik(ctx: CanvasRenderingContext2D, w: number, h: number, st: RenderState, anim: AnimInfo | null): void;
