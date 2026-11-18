/**
 * 七巧拼图 Tangram2 纯逻辑：标准七巧板七块（2 大三角 / 1 中三角 / 2 小三角
 * / 1 正方 / 1 平行四边形）的形状、旋转变换、翻转变换、放置判定与关卡数据。
 *
 * 关卡 = 一个目标剪影：内置 12 个图形（方块 / 房子 / 钻石 / 城墙 / 帆船 /
 * 高山 / 猫 / 兔子 / 人物 / 鱼 / 鸟 / 火箭），每个图形预存 7 块板的标准解
 * （逐块多边形，已通过「面积和 = 64 格 + 互不重叠 + 与基准块全等」校验）。
 * 玩家拖动板块、R 旋转 45°、F 翻转；tryPlace 用「顶点集合在容差内一致」
 * 判定与某个同形状标准解吻合，吸附后计入覆盖面积；7 块全放且覆盖 ≥98%
 * 过关。所有随机（散布 / 初始旋转）走注入 seed 的 mulberry32，确定可测。
 */
/** 板块形状类别（两种 large / 两种 small 互为同形，可互换匹配）。 */
export type PieceKind = 'large' | 'medium' | 'small' | 'square' | 'para';
/** 平面点（网格坐标或像素坐标，由调用方约定单位）。 */
export type Pt = [number, number];
/**
 * mulberry32 种子随机数生成器。
 * @param seed - 32 位无符号整数种子。
 * @returns 返回 () => [0,1) 的确定性随机函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 板块在逻辑画布上的像素坐标（渲染与命中测试共用）。 */
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 640;
/** 吸附容差（像素）：板块顶点集合与标准解顶点集合的最大允许偏差。 */
export declare const SNAP_TOL = 15;
/**
 * 计算多边形质心（顶点均值；本游戏所有板块旋转都是绕质心的刚体变换）。
 * @param poly - 多边形顶点。
 * @returns 质心坐标。
 */
export declare function polygonCenter(poly: readonly Pt[]): Pt;
/**
 * 鞋带公式多边形面积。
 * @param poly - 多边形顶点。
 * @returns 面积（始终为正）。
 */
export declare function polygonArea(poly: readonly Pt[]): number;
/**
 * 生成板块当前姿态的像素多边形：基准形状质心平移到原点 -> 可选镜像 ->
 * 旋转 rot*45° -> 缩放 unit -> 平移到 (x, y)。
 * @param kind - 板块形状类别。
 * @param rot - 旋转步数（0-7，每步 45°）。
 * @param flipped - 是否左右镜像（仅平行四边形真正改变形状朝向）。
 * @param x - 板块质心的像素 x。
 * @param y - 板块质心的像素 y。
 * @param unit - 一格的像素边长。
 * @returns 像素坐标顶点数组（与基准顶点同序）。
 */
export declare function polygonOf(kind: PieceKind, rot: number, flipped: boolean, x: number, y: number, unit: number): Pt[];
/**
 * 判定两个同顶点数多边形是否为「同一位置同一姿态」：把 a 的每个顶点唯一
 * 配对到 b 中容差内的顶点。用于放置吸附（板块姿态 = 标准解姿态）。
 * @param a - 玩家板块多边形。
 * @param b - 标准解槽位多边形。
 * @param tol - 允许的最大顶点偏差（像素）。
 * @returns 全部顶点可配对时返回 true。
 */
export declare function polysCongruentPos(a: readonly Pt[], b: readonly Pt[], tol: number): boolean;
/**
 * 射线法点在多边形内判定（边界按内处理，命中测试足够）。
 * @param x - 点 x。
 * @param y - 点 y。
 * @param poly - 多边形顶点。
 * @returns 点在多边形内（含边界）返回 true。
 */
export declare function pointInPolygon(x: number, y: number, poly: readonly Pt[]): boolean;
/** 一个标准解槽位：形状类别 + 网格坐标多边形（createLevel 再缩放平移）。 */
export interface FigureSlotDef {
    kind: PieceKind;
    poly: Pt[];
}
/** 一个图形：名称 + 7 个槽位的标准解（网格坐标）。 */
export interface FigureDef {
    name: string;
    pieces: FigureSlotDef[];
}
/** 内置 12 个图形（均已通过面积 / 全等 / 不重叠校验）。 */
export declare const FIGURES: FigureDef[];
/** 5 个关卡依次使用的图形下标（从规整到发散，由易到难）。 */
export declare const LEVEL_FIGURES: readonly number[];
/** 玩家手中一块板的状态。 */
export interface TangramPiece {
    id: number;
    kind: PieceKind;
    /** 质心像素位置。 */
    x: number;
    y: number;
    /** 旋转步数（0-7，每步 45°）。 */
    rot: number;
    flipped: boolean;
    placed: boolean;
}
/** 已缩放到像素的标准解槽位。 */
export interface SlotState {
    kind: PieceKind;
    poly: Pt[];
    center: Pt;
    taken: boolean;
}
/** 一关的完整可玩状态（纯数据，渲染与测试共享）。 */
export interface TangramState {
    /** 关卡号（1-5）。 */
    level: number;
    figureIndex: number;
    name: string;
    unit: number;
    slots: SlotState[];
    pieces: TangramPiece[];
    moves: number;
    elapsedMs: number;
    seed: number;
}
/** 生成第 level 关（1-5）：缩放剪影居中、按 seed 散布七块板并随机初始姿态。 */
export declare function createLevel(level: number, seed: number): TangramState;
/**
 * 尝试放置一块板：在同类且未占用的槽位中寻找姿态吻合（顶点集合容差内
 * 一致）的目标，成功则精确吸附到槽位质心并占用槽位。
 * @param state - 关卡状态。
 * @param pieceId - 板块编号。
 * @param tol - 吸附容差（像素，默认 SNAP_TOL）。
 * @returns 吸附成功返回 true。
 */
export declare function tryPlace(state: TangramState, pieceId: number, tol?: number): boolean;
/** 已放置面积占剪影总面积的百分比（0-100）。 */
export declare function coveragePercent(state: TangramState): number;
/** 过关判定：7 块全放且覆盖 ≥98%。 */
export declare function isLevelClear(state: TangramState): boolean;
/** 已放置块数。 */
export declare function placedCount(state: TangramState): number;
/**
 * G 提示：把编号最小的未放置板摆到同形状的空闲槽位（搜索其 16 种姿态）。
 * @param state - 关卡状态。
 * @returns 被放置的板块编号，无可放返回 null。
 */
export declare function hintPlace(state: TangramState): number | null;
/**
 * 旋转一块板 45°（姿态变换；计步由调用方负责）。
 * @param state - 关卡状态。
 * @param pieceId - 板块编号。
 */
export declare function cycleRotation(state: TangramState, pieceId: number): void;
/**
 * 翻转一块板（左右镜像；仅平行四边形改变实际形状朝向）。
 * @param state - 关卡状态。
 * @param pieceId - 板块编号。
 */
export declare function toggleFlip(state: TangramState, pieceId: number): void;
/**
 * 过关计分：基础分随关卡递增，用时（秒）与多余操作次数扣分，下限 120。
 * @param level - 关卡号（1-5）。
 * @param elapsedMs - 本关用时（毫秒）。
 * @param moves - 本关操作次数。
 * @returns 本关得分。
 */
export declare function computeScore(level: number, elapsedMs: number, moves: number): number;
