/**
 * 魔方 3D 渲染：手写视角旋转矩阵（yaw/pitch）+ 弱透视投影，把 54 张贴纸
 * （logic.ts 的 cubie 坐标 + 面法向量几何真值）投到 canvas；画家算法按
 * cubie 中心视深排序，逐 cubie 画黑色塑料底 + 圆角贴纸。交互几何全部是
 * 无 DOM 纯函数：viewMatrix/projectPoint（投影）、stickerLayout/pickSticker
 * （命中）、dragToMove（屏幕拖拽向量 → 层走法），便于确定性测试。
 */
import { type Cube, type Move } from './logic.ts';
/** 逻辑画布宽（px）。 */
export declare const LOGICAL_W = 440;
/** 逻辑画布高（px）。 */
export declare const LOGICAL_H = 500;
/** 顶部 HUD 高（px）。 */
export declare const HUD_H = 34;
/** 观察视角（弧度）：yaw 绕 y 轴，pitch 绕 x 轴（正值 = 自上向下俯视）。 */
export interface ViewAngles {
    yaw: number;
    pitch: number;
}
/** 完整投影参数：视角 + 屏幕参考点、正交比例、弱透视系数（0 = 正交）。 */
export interface RenderView extends ViewAngles {
    cx: number;
    cy: number;
    scale: number;
    persp: number;
}
/** 初始等轴测式视角：同时可见 U（上）、F（左前）、R（右前）三个面。 */
export declare const DEFAULT_VIEW: ViewAngles;
/** 立方体中心在逻辑画布上的位置与投影像素比例、弱透视强度。 */
export declare const CUBE_CENTER_X: number;
export declare const CUBE_CENTER_Y: number;
export declare const CUBE_SCALE = 92;
export declare const PERSP = 0.05;
/** 视角重置按钮（index.ts 命中检测用；双击画布同效）。 */
export declare const VIEW_BTN: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 由视角角构造投影参数。
 * @param a - 视角角。
 */
export declare function makeView(a: ViewAngles): RenderView;
/**
 * 视角旋转矩阵 M = Rx(pitch)·Ry(yaw)，3×3 行主序（v' = M·v）。
 * 世界系：x 向右、y 向上、z 朝观察者；变换后 z' 即视深（大 = 近）。
 * @param yaw - 绕 y 轴角（弧度）。
 * @param pitch - 绕 x 轴角（弧度）。
 * @returns 长度 9 的只读数组。
 */
export declare function viewMatrix(yaw: number, pitch: number): readonly number[];
/**
 * 矩阵作用于向量。
 * @param m - viewMatrix 产出的 3×3 行主序矩阵。
 * @returns 变换后的三维坐标。
 */
export declare function mat3Apply(m: readonly number[], x: number, y: number, z: number): [number, number, number];
/** 投影点：屏幕坐标 + 视深（大 = 近，供画家排序）。 */
export interface ProjectedPoint {
    x: number;
    y: number;
    depth: number;
}
/**
 * 世界点 → 弱透视屏幕投影：近处（z' 大）略放大。
 * @param view - 投影参数（含矩阵外的圆心 / 比例 / 透视系数）。
 */
export declare function projectPoint(m: readonly number[], px: number, py: number, pz: number, view: RenderView): ProjectedPoint;
/** 六面贴纸配色（下标 = 颜色号 = 面号）：白黄橙红绿蓝。 */
export declare const FACE_COLORS: readonly string[];
/** 拧动动画的渲染侧快照：走法 + 原始相位 0..1（渲染时三次缓动）。 */
export interface TwistAnim {
    moveId: string;
    turns: number;
    phase: number;
}
/** 拧动缓动：easeOutCubic。 */
export declare function easeTwist(phase: number): number;
/** 一张贴纸的完整投影：贴纸四边形 + 塑料底四边形 + 排序深度。 */
interface SceneSticker {
    index: number;
    sticker: ReadonlyArray<ProjectedPoint>;
    plastic: ReadonlyArray<ProjectedPoint>;
    /** cubie 中心视深（大 = 近）。 */
    depth: number;
    visible: boolean;
}
/**
 * 构建整幕场景：54 张贴纸投影（含拧动动画的临时旋转），按 cubie 中心
 * 视深升序（远 → 近）排序。
 * @param view - 投影参数。
 * @param anim - 拧动动画（null = 静止态）。
 */
export declare function buildScene(view: RenderView, anim: TwistAnim | null): readonly SceneSticker[];
/** 测试用的贴纸投影：四顶点 + 视深 + 可见性（远 → 近排序）。 */
export interface StickerQuad {
    index: number;
    pts: ReadonlyArray<{
        x: number;
        y: number;
    }>;
    depth: number;
    visible: boolean;
}
/**
 * 贴纸投影布局（与渲染同几何）：命中测试与测试断言共用。
 * @param view - 投影参数。
 * @param anim - 拧动动画或 null。
 */
export declare function stickerLayout(view: RenderView, anim?: TwistAnim | null): readonly StickerQuad[];
/**
 * 贴纸命中检测：从近到远取第一个包含点的可见贴纸。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param view - 投影参数。
 * @returns 贴纸下标（0..53），未命中返回 null。
 */
export declare function pickSticker(x: number, y: number, view: RenderView): number | null;
/**
 * 屏幕拖拽向量 → 层走法（确定性纯函数）：
 * 把拖拽向量分解到贴纸面的两个切向轴的屏幕投影，取分量大的轴为位移
 * 方向 d；旋转轴 a = 法向 × d，层 = 贴纸在该轴上的坐标层，方向由几何
 * 推导（绕 a 数学正转 90° 使贴纸沿 d 移动）。
 * @param stickerIndex - 按下的贴纸下标（pickSticker 产出）。
 * @param dx - 屏幕拖拽 x（逻辑坐标，右为正）。
 * @param dy - 屏幕拖拽 y（逻辑坐标，下为正）。
 * @param view - 按下时的投影参数。
 * @returns 等价走法；零向量返回 null。
 */
export declare function dragToMove(stickerIndex: number, dx: number, dy: number, view: RenderView): Move | null;
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
    /** 按下待拧的贴纸（白色描边高亮），null 无。 */
    hover: number | null;
}
/**
 * 绘制一帧 3D 魔方：背景 + HUD + 画家序立方体 + 过关/暂停 overlay。
 * @param st - 状态快照。
 * @param angles - 当前视角。
 * @param anim - 拧动动画或 null。
 */
export declare function renderRubik(ctx: CanvasRenderingContext2D, w: number, h: number, st: RenderState, angles: ViewAngles, anim: TwistAnim | null): void;
export {};
