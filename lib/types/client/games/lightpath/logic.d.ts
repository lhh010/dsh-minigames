/**
 * 镜面光线（LightPath）纯逻辑：SIZE×SIZE 网格盘，一个激光源（位置 +
 * 固定方向）、若干可旋转镜（'/' 与 '\\' 两档，点击翻转）、分光镜（一进
 * 两出：直通 + '/' 反射）、墙与目标水晶。激光从源出发沿直线传播，遇镜
 * 90° 折射、遇分光镜一分为二、遇墙或出界终止；全部水晶被光路经过即
 * 过关。光路求值是纯静态 BFS（按「格子 + 方向」做环检测，步数上限
 * MAX_BEAM_STEPS），可脱离 DOM 直接模拟验证。关卡由注入 seed（mulberry32）
 * 确定性生成：先随机「解状态」镜面朝向并求值，从被照亮的空格中挑水晶，
 * 保证该朝向组合必为解；再打乱镜面朝向作为开局（确保开局未获胜）。
 */
/** 逻辑画布宽度 px。 */
export declare const W = 440;
/** 逻辑画布高度 px。 */
export declare const H = 500;
/** 盘面边长格数（9×9）。 */
export declare const SIZE = 9;
/** 单格边长 px。 */
export declare const CELL = 40;
/** 盘面左上角 x px。 */
export declare const BOARD_X = 40;
/** 盘面左上角 y px。 */
export declare const BOARD_Y = 64;
/** 光路求值总步数上限（环检测兜底）。 */
export declare const MAX_BEAM_STEPS = 400;
/** 激光源的固定发射方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right';
/** 镜面两档朝向。 */
/** 镜面朝向：'/' 与 '\\'（一键翻转，挑战在于要翻的面数多）。 */
export type MirrorKind = '/' | '\\';
/** 格坐标。 */
export interface Cell {
    /** 行号（0 起，向下）。 */
    row: number;
    /** 列号（0 起，向右）。 */
    col: number;
}
/** 一面可旋转镜。 */
export interface Mirror extends Cell {
    /** 当前朝向（点击在两档间翻转）。 */
    kind: MirrorKind;
}
/** 激光源（位置 + 固定方向）。 */
export interface Source extends Cell {
    dir: Dir;
}
/** 一局状态（翻转产生新状态，原状态不可变）。 */
export interface LightPathState {
    /** 基础 seed（与 level 联合决定布局）。 */
    seed: number;
    /** 关卡号（从 1 起）。 */
    level: number;
    /** SIZE×SIZE 墙矩阵：true 为墙。 */
    walls: boolean[][];
    /** 激光源。 */
    source: Source;
    /** 可旋转镜列表。 */
    mirrors: Mirror[];
    /** 分光镜列表。 */
    splitters: Cell[];
    /** 目标水晶列表。 */
    crystals: Cell[];
    /** 已翻转次数。 */
    moves: number;
    /** 当前潜在得分（胜利时定格为最终得分）。 */
    score: number;
    /** 是否已过关（当前朝向下全部水晶被照亮）。 */
    won: boolean;
}
/** 一段直线光束（含两端格子，供渲染）。 */
export interface BeamSegment {
    r0: number;
    c0: number;
    r1: number;
    c1: number;
}
/** 一次静态光路求值的结果。 */
export interface LightResult {
    /** 被光路经过的格子 key（row*SIZE+col）集合。 */
    lit: Set<number>;
    /** 被点亮的水晶数量。 */
    litCrystals: number;
    /** 直线光束段列表（渲染用）。 */
    segments: BeamSegment[];
}
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 镜面方向变换：'/' 与 '\\' 各把入射 (dr,dc) 映射为 90° 出射方向。
 * @param kind - 镜面朝向。
 * @param dr - 入射行方向分量。
 * @param dc - 入射列方向分量。
 * @returns 出射 [dr,dc]。
 */
export declare function reflect(kind: MirrorKind, dr: number, dc: number): [number, number];
/**
 * 分光镜的两路出射：直通（原方向）+ '/' 式反射（一进两出）。
 * @param dr - 入射行方向分量。
 * @param dc - 入射列方向分量。
 * @returns 两条出射 [dr,dc]。
 */
export declare function splitOutputs(dr: number, dc: number): Array<[number, number]>;
/**
 * 静态光路求值：从源出发 BFS 追踪所有光束（镜折射、分光镜分裂、墙与
 * 出界终止、水晶可被穿过并点亮），按「格子 + 方向」做环检测。
 * @param state - 当前局面。
 * @returns 光路结果（点亮集合 / 水晶数 / 光束段）。
 */
export declare function evaluate(state: LightPathState): LightResult;
/**
 * 计分：基础分随关卡递增，每次翻转扣 15，下限 100。
 * @param level - 关卡号。
 * @param moves - 已翻转次数。
 * @returns 得分。
 */
export declare function computeScore(level: number, moves: number): number;
/**
 * 深拷贝一局状态。
 * @param state - 原状态。
 * @returns 结构相等的新状态。
 */
export declare function cloneState(state: LightPathState): LightPathState;
/**
 * 翻转指定格子上的镜（纯函数：不改原状态）。
 * @param state - 当前状态。
 * @param row - 行号。
 * @param col - 列号。
 * @returns 新状态（moves+1、重求值胜负与得分）；该格无镜或已过关返回
 * null（无变化不计步）。
 */
export declare function applyFlip(state: LightPathState, row: number, col: number): LightPathState | null;
/**
 * 提示：贪心翻转一面镜——枚举每面镜翻转后的点亮水晶数，取严格变好的
 * 最低索引；没有任何翻转能改善时返回 null。
 * @param state - 当前状态。
 * @returns 翻转后的新状态；无改善返回 null。
 */
export declare function hintFlip(state: LightPathState): LightPathState | null;
/** 各关参数：镜数 5→10（组合空间 2^n 从 32 到 1024）、水晶 3→5、
 * 第 3 关起引入分光镜、第 5 关两面；墙 6→16（遮挡直路，逼迫多段折射）。 */
export declare function levelSpec(level: number): {
    mirrors: number;
    crystals: number;
    splitters: number;
    walls: number;
};
/**
 * 生成第 level 关：确定性随机撒墙、放激光源 / 镜 / 分光镜，随机「解
 * 状态」朝向并求值，从被照亮的空格挑水晶（保证解存在），再打乱镜面
 * 朝向作为开局（确保开局未获胜）。约束不满足则换尝试重掷。
 * @param seed - 基础种子（与 level、尝试次数联合散列）。
 * @param level - 关卡号（从 1 起）。
 * @returns 初始状态（won=false、moves=0）。
 */
export declare function generateLevel(seed: number, level: number): LightPathState;
