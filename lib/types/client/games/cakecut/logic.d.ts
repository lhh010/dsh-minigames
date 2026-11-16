/**
 * 蛋糕等分 CakeCut 的纯逻辑：多边形块表示、半平面裁剪（Sutherland–Hodgman
 * 等价实现）、刀切分块、等分判定、关卡轮廓与对称辅助线。全部确定性：
 * 关卡方位角由注入 seed（mulberry32）驱动，无任何 Math.random / DOM 依赖。
 */
/** 平面点（世界坐标，蛋糕中心为原点）。 */
export interface Pt {
    x: number;
    y: number;
}
/** 闭合多边形环（顶点数组，首尾隐式相连）。 */
export type Poly = Pt[];
/** 无限直线由两点确定。 */
export interface Line {
    a: Pt;
    b: Pt;
}
/** 线段（预览/绘制用）。 */
export interface Seg {
    a: Pt;
    b: Pt;
}
/**
 * 一块蛋糕：outer 为外轮廓，holes 为孔洞环（环形关卡）。孔洞总在 outer
 * 内部，面积 = |outer| − Σ|hole|。
 */
export interface Block {
    id: number;
    outer: Poly;
    holes: Poly[];
}
/** mulberry32 PRNG：小而快，同 seed 序列完全一致。
 * @param seed - 任意 32 位整数。
 * @returns 返回 [0,1) 均匀伪随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 鞋带公式的带符号面积（逆时针为正）。
 * @param poly - 顶点数组。
 * @returns 带符号面积。
 */
export declare function shoelace(poly: Poly): number;
/** 多边形面积（绝对值）。
 * @param poly - 顶点数组。
 * @returns 面积。
 */
export declare function polygonArea(poly: Poly): number;
/** 一块的面积：外轮廓减孔洞。
 * @param block - 蛋糕块。
 * @returns 面积。
 */
export declare function blockArea(block: Block): number;
/**
 * 半平面裁剪（Sutherland–Hodgman，凸裁剪域退化为直线半平面，因此对
 * 凹多边形主体同样正确，退化桥边面积在鞋带公式中相互抵消）。
 * @param poly - 被裁剪的多边形。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @param side - +1 保留直线左侧，-1 保留右侧。
 * @returns 裁剪结果；空侧返回空数组。
 */
export declare function clipHalfPlane(poly: Poly, a: Pt, b: Pt, side: 1 | -1): Poly;
/** 单块刀切结果：两侧均有效时才视为切开。 */
interface SplitResult {
    left: Block;
    right: Block;
}
/**
 * 用过 a、b 的直线把一块切成两块（孔洞随各自所在侧保留）。
 * @param block - 被切的块。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @param idLeft - 左侧新块 id。
 * @param idRight - 右侧新块 id。
 * @returns 两侧都有效时返回两块；切线未贯穿（未触及或相切，某一侧面积
 * 低于下限）返回 null。
 */
export declare function cutBlock(block: Block, a: Pt, b: Pt, idLeft: number, idRight: number): SplitResult | null;
/**
 * 对整盘块应用一刀：直线贯穿到的每一块都被一分为二（贯穿切割可同时
 * 切开多块，这是 2 刀 4 份等三线共点谜题的核心）。
 * @param blocks - 当前全部块。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @param nextId - 新块 id 分配起点（依次 +1）。
 * @returns 切开至少一块时返回新块数组与切开块数；一刀没有贯穿任何块
 * （在蛋糕外、仅相切、沿既有刀缝）返回 null。
 */
export declare function applyCut(blocks: Block[], a: Pt, b: Pt, nextId: number): {
    blocks: Block[];
    splitCount: number;
} | null;
/** 偶奇规则点在块内测试（外轮廓与孔洞共同计数）。
 * @param p - 测试点。
 * @param block - 蛋糕块。
 * @returns 点在块材料内为 true。
 */
export declare function pointInBlock(p: Pt, block: Block): boolean;
/**
 * 直线在整盘块内的实体系数区间：刀线预览与合法性判定共用。
 * @param blocks - 当前全部块。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @returns 升序线段数组（世界坐标端点）。
 */
export declare function cutSegments(blocks: Block[], a: Pt, b: Pt): Seg[];
/** 一关的静态数据：轮廓、孔洞与对称辅助线（即一组可行解刀线）。 */
export interface LevelData {
    name: string;
    cuts: number;
    pieces: number;
    tolerance: number;
    outline: Poly;
    holes: Poly[];
    guides: Line[];
    showGuidesByDefault: boolean;
    totalArea: number;
}
/** 关卡数量。 */
export declare const LEVEL_COUNT = 5;
/**
 * 构建一关：轮廓/孔洞/辅助线随注入 seed 确定性生成（圆/环/自由形的
 * 方位角由 seed 决定，辅助线与轮廓同步旋转，因此任何 seed 下都构成
 * 可行解）。
 * @param levelIndex - 0 起关卡下标。
 * @param seed - 注入的确定性种子。
 * @returns 关卡静态数据。
 */
export declare function buildLevel(levelIndex: number, seed: number): LevelData;
/** 一局进行态：不可变快照式更新，history 支持撤回。 */
export interface CakeState {
    levelIndex: number;
    seed: number;
    level: LevelData;
    blocks: Block[];
    history: Block[][];
    cutsUsed: number;
    nextId: number;
    solved: boolean;
    /** 容差倍率（难度选择）：1 = 标准 / 2 = 宽松 / 4 = 很宽松。只影响过关判定。 */
    toleranceScale: number;
}
/**
 * 开局：整只蛋糕作为 id 0 的单块。
 * @param levelIndex - 0 起关卡下标。
 * @param seed - 注入种子（默认 1）。
 * @returns 初始状态。
 */
export declare function createCakeState(levelIndex: number, seed?: number): CakeState;
/**
 * 切一刀：校验刀数未用尽且直线至少贯穿一块；切开记录历史。
 * @param state - 当前状态。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @returns 新状态（原状态不变）；无刀可切或刀线无效返回 null。
 */
export declare function cakeCut(state: CakeState, a: Pt, b: Pt): CakeState | null;
/**
 * 撤回最近一刀。
 * @param state - 当前状态。
 * @returns 回退后的新状态；无历史返回 null。
 */
export declare function cakeUndo(state: CakeState): CakeState | null;
/**
 * 各块相对目标面积的偏差比（area/target − 1）。
 * @param state - 当前状态。
 * @returns 与 blocks 同序的偏差数组。
 */
export declare function cakeDeviations(state: CakeState): number[];
/**
 * 等分判定：块数恰为目标份数且每块偏差在容差内。
 * @param state - 当前状态。
 */
/** 容差倍率档位（升序），[ / ] 键或按钮循环切换。 */
export declare const TOLERANCE_SCALES: number[];
/** 切换容差倍率：循环到下一档；返回新倍率（原位更新，无历史开销）。 */
export declare function cycleToleranceScale(state: CakeState): number;
export declare function cakeIsSolved(state: CakeState): boolean;
/**
 * 过关得分：关卡基数 + 剩余刀数效率奖励（共点切割可用更少刀达成更多份）。
 * @param levelIndex - 0 起关卡下标。
 * @param cutsLeft - 过关时剩余刀数。
 * @returns 得分。
 */
export declare function computeScore(levelIndex: number, cutsLeft: number): number;
export {};
