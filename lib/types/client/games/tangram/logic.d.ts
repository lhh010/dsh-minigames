/**
 * 七巧板 Tangram 纯逻辑：标准七件（大三角×2、中三角、正方形、平行四边形、
 * 小三角×2）以「质心原点多边形」定义；剪影库为预定义的 5 组解槽多边形（同一
 * 单位坐标系），按关卡递进选取并以注入 seed 微扰锚点、打乱初始姿态。过关判定
 * 是几何包含：板块的全部顶点与质心都落在目标区域（解槽的并集）容差内。所有
 * 函数为纯函数，随机只走 mulberry32(seed)，确定性可测。
 */
/** mulberry32 伪随机数生成器（与 fifteen/logic.ts 同构）。 */
export declare function mulberry32(seed: number): () => number;
/** 平面点。 */
export interface Pt {
    x: number;
    y: number;
}
/** 多边形（顶点按顺序排列；不自交）。 */
export type Poly = Pt[];
/** 一块板块的姿态：平移（质心位置）、旋转步数（每步 45°）、是否镜像翻转。 */
export interface Pose {
    x: number;
    y: number;
    rot: number;
    flip: boolean;
}
/** 板块定义：名称、能否翻转（仅平行四边形手性不对称）、质心原点局部顶点。 */
export interface PieceDef {
    name: string;
    canFlip: boolean;
    base: Poly;
}
/** 多边形质心（顶点算术平均；对均质三角形/四边形即重心）。 */
export declare function polygonCentroid(p: Poly): Pt;
/** 七块标准板块（顺序：大三角×2、中三角、正方形、平行四边形、小三角×2）。 */
export declare const PIECES: readonly PieceDef[];
/** 一个剪影：名称 + 七个解槽多边形（单位坐标系，按 PIECES 顺序）。 */
export interface Silhouette {
    name: string;
    polys: Poly[];
}
/**
 * 预定义剪影库（复杂度递增）：正方 → 大三角 → 旗帜 → 烛台 → 火箭。
 * 每组都是七件的无缝铺砌（面积合计 16、两两无重叠）。
 */
export declare const SILHOUETTES: readonly Silhouette[];
/** 单位坐标 → 画布逻辑坐标的缩放。 */
export declare const SCALE = 26;
/** 就位容差：顶点/质心距目标区域的允许偏差（逻辑像素）。 */
export declare const TOL = 10;
/** 逻辑画布宽。 */
export declare const LOGICAL_W = 700;
/** 逻辑画布高。 */
export declare const LOGICAL_H = 520;
/** 顶部 HUD 高。 */
export declare const HUD_H = 30;
/** 左侧托盘区。 */
export declare const TRAY_X = 10;
/** 托盘区宽。 */
export declare const TRAY_W = 246;
/** 右侧目标区。 */
export declare const BOARD_X = 266;
/** 目标区宽。 */
export declare const BOARD_W = 424;
/** 托盘槽尺寸。 */
export declare const SLOT = 114;
/**
 * 托盘槽中心（2 列 × 4 行）。
 * @param i - 板块下标 0..6。
 * @returns 槽中心的逻辑坐标。
 */
export declare function traySlot(i: number): Pt;
/** 旋转步数归一到 0..7。 */
export declare function normalizeRot(rot: number): number;
/**
 * 绕原点旋转多边形（用于质心原点局部顶点）。
 * @param p - 输入多边形。
 * @param quarter - 45° 步数（可为负，内部归一）。
 * @returns 新多边形；输入不变。
 */
export declare function rotatePoly(p: Poly, quarter: number): Poly;
/**
 * 沿纵轴镜像多边形（x → −x；对可翻板块即手性翻转）。
 * @param p - 输入多边形。
 * @returns 新多边形；输入不变。
 */
export declare function flipPoly(p: Poly): Poly;
/**
 * 板块在给定姿态下的世界多边形：局部单位顶点旋转（可翻板块先镜像）后按
 * SCALE 缩放到画布逻辑坐标，再平移到 pose 位置。不可翻板块即使 pose.flip
 * 为 true 也按未翻转处理。
 * @param index - 板块下标 0..6。
 * @param pose - 目标姿态（平移为画布逻辑坐标）。
 * @returns 画布逻辑坐标顶点。
 */
export declare function piecePoly(index: number, pose: Pose): Poly;
/**
 * 点到线段的最短距离。
 * @param p - 查询点。
 * @param a - 线段端点。
 * @param b - 线段端点。
 */
export declare function segmentDistance(p: Pt, a: Pt, b: Pt): number;
/**
 * 容差包含判定：点在多边形内部，或距任一边不超过 tol。
 * @param poly - 目标多边形。
 * @param p - 查询点。
 * @param tol - 边界容差，默认 0（严格内部）。
 */
export declare function containsPoint(poly: Poly, p: Pt, tol?: number): boolean;
/**
 * 板块覆盖判定：poly 的全部顶点与质心都落在覆盖区域（解槽并集）容差内。
 * @param poly - 板块世界多边形。
 * @param covers - 覆盖多边形集合。
 * @param tol - 容差。
 */
export declare function polygonCovered(poly: Poly, covers: Poly[], tol: number): boolean;
/** 一局七巧板的完整状态（纯数据，可整体快照比较）。 */
export interface TangramState {
    level: number;
    seed: number;
    /** 剪影名称（HUD 展示）。 */
    name: string;
    /** 目标解槽（画布逻辑坐标，含 seed 微扰）。 */
    target: Poly[];
    /** 七块板各自姿态。 */
    poses: Pose[];
    /** 每块是否已就位。 */
    placed: boolean[];
    /** 有效操作计数。 */
    moves: number;
    /** 是否已过关。 */
    won: boolean;
}
/**
 * 生成一关：按关卡号从剪影库顺序取轮廓（1..5 → 正方..火箭，循环），
 * seed 决定剪影锚点微扰与各板初始旋转/翻转；初始位置为托盘槽。
 * 同一 (level, seed) 结果完全一致。
 * @param level - 关卡号（≥1）。
 * @param seed - 随机种子。
 */
export declare function createLevel(level: number, seed: number): TangramState;
/**
 * 更新一块板的姿态并重算就位/过关；不可翻板块的 flip 被忽略。
 * 输入状态不变（纯函数）。
 * @param state - 当前状态。
 * @param index - 板块下标 0..6。
 * @param pose - 新姿态。
 * @param countMove - true 时操作数 +1（拖放落子/旋转/翻转等离散操作）。
 */
export declare function setPose(state: TangramState, index: number, pose: Pose, countMove?: boolean): TangramState;
/** 多边形面积（鞋带公式）。 */
export declare function polygonArea(p: Poly): number;
