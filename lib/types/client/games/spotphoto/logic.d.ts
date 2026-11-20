/**
 * 大家来找茬（SpotPhoto）纯逻辑：由注入 seed 程序化生成一张 60-100 个
 * 几何元素叠加的复杂"照片"，再在右图上做 5 处细微修改（微移 / 色相偏移 /
 * 缩放 / 删元素 / 加小点）。点击差异位置（半径 24px 内）标记一处，全部
 * 找齐过关；点错扣 5 秒，倒计时归零失败。全部函数都是确定性的：相同
 * seed 与关卡一定得到相同的谜题与判定结果。
 */
/** 照片内的几何元素种类。 */
export type PhotoElementKind = 'circle' | 'square' | 'triangle' | 'line' | 'texture';
/** 照片里的一个几何元素（左右两图共用同一坐标系）。 */
export interface PhotoElement {
    kind: PhotoElementKind;
    /** 中心横坐标（照片内逻辑像素）。 */
    x: number;
    /** 中心纵坐标（照片内逻辑像素）。 */
    y: number;
    /** 特征尺寸（半径 / 半边长 / 半长），像素。 */
    size: number;
    /** 旋转角度（弧度）。 */
    angle: number;
    /** 色相 0-359（渲染为 hsl 颜色；色相差异即颜色差异）。 */
    hue: number;
    /** 饱和度（0-100）。 */
    sat: number;
    /** 亮度（0-100）。 */
    light: number;
}
/** 差异修改种类。 */
export type PhotoDiffKind = 'shift' | 'hue' | 'scale' | 'delete' | 'add';
/** 一处差异的描述与判定位置。 */
export interface PhotoDiff {
    /** 基准元素在左图元素列表中的下标（add 差异除外，见下）。 */
    index: number;
    /** 差异类型（见 {@link PhotoDiffKind}）。 */
    kind: PhotoDiffKind;
    /** 判定圆心（照片内坐标；两侧面板共用，点哪一边都算）。 */
    x: number;
    y: number;
}
/** 一关的谜题：左右两张"照片" + 差异列表。 */
export interface PhotoPuzzle {
    /** 左图元素列表（基准）。 */
    left: PhotoElement[];
    /** 右图元素列表（应用 5 处修改后的变体）。 */
    right: PhotoElement[];
    /** 差异列表（恰好 5 处）。 */
    diffs: PhotoDiff[];
}
/** 单张照片的逻辑尺寸；两图共用同一坐标系。 */
export declare const PHOTO_W = 320;
export declare const PHOTO_H = 320;
/** 每关差异数（固定 5 处）。 */
export declare const DIFF_COUNT = 5;
/** 命中判定半径（像素）。 */
export declare const HIT_RADIUS = 24;
/** 点错一次的扣时（秒）。 */
export declare const MISS_PENALTY_S = 5;
/** 差异判定点之间的最小间距（避免两处差异的判定圆大量重叠）。 */
export declare const MIN_DIFF_DIST = 56;
/** 关卡难度：元素更多、修改幅度更小（magnitude 1→0.4）、限时更短。 */
export interface PhotoLevelConfig {
    /** 照片元素总数。 */
    elementCount: number;
    /** 本关限时（秒）。 */
    timeLimitS: number;
    /** 修改幅度系数（1 = 最大幅度，越小越难）。 */
    magnitude: number;
}
/** 5 关难度表：元素 60→100、限时 90→50s。 */
export declare const LEVELS: PhotoLevelConfig[];
/** 关卡总数。 */
export declare const LEVEL_COUNT: number;
/** mulberry32 确定性随机数发生器（所有随机都走注入 seed）。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 由 seed 确定性地生成一关谜题。
 * @param seed - 任意 32 位整数种子。
 * @param level - 关卡（1 起）；超出范围按最后一关处理。
 * @returns 谜题（左右照片 + 恰好 5 处差异）。
 */
export declare function createPhotoPuzzle(seed: number, level: number): PhotoPuzzle;
/** 一局（单关）状态。 */
export interface SpotPhotoState {
    /** 当前谜题。 */
    puzzle: PhotoPuzzle;
    /** 每处差异是否已被找到（与 puzzle.diffs 下标对应）。 */
    found: boolean[];
    /** 点错次数（每次扣 MISS_PENALTY_S 秒）。 */
    misses: number;
    /** 剩余时间（秒）。 */
    timeLeft: number;
    /** 本关限时（秒）。 */
    timeLimitS: number;
    /** 当前关卡（1 起）。 */
    level: number;
    /** 局面：playing 进行中 / won 本关找齐 / lost 超时。 */
    status: 'playing' | 'won' | 'lost';
    /** 本局 seed。 */
    seed: number;
}
/**
 * 生成某一关的初始状态。
 * @param seed - 谜题种子。
 * @param level - 关卡（1 起）。
 */
export declare function createSpotPhotoState(seed: number, level: number): SpotPhotoState;
/** 剩余未找到的差异数。 */
export declare function remainingDiffs(state: SpotPhotoState): number;
/**
 * 判定一次点击：命中半径内存在未找到的差异则标记一处；否则记一次点错并扣
 * {@link MISS_PENALTY_S} 秒。两侧照片共用差异坐标，点任一侧同一位置都算。
 * @param state - 当前局面（原地更新）。
 * @param x - 照片内横坐标。
 * @param y - 照片内纵坐标。
 * @returns 'hit' 命中一处差异；'miss' 点错（已扣时）；'busy' 局面已结束。
 */
export declare function tryClick(state: SpotPhotoState, x: number, y: number): 'hit' | 'miss' | 'busy';
/**
 * 推进倒计时。时间归零且尚有未找差异时判负。
 * @param state - 当前局面（原地更新）。
 * @param dtS - 经过秒数（非负）。
 * @returns 更新后的状态字段 status。
 */
export declare function tick(state: SpotPhotoState, dtS: number): 'playing' | 'won' | 'lost';
/**
 * 结算得分：已找差异 ×100 + 剩余时间取整 ×2 + 通关关卡奖励。
 * @param state - 当前局面。
 */
export declare function computeScore(state: SpotPhotoState): number;
/** 是否还有下一关。 */
export declare function hasNextLevel(state: SpotPhotoState): boolean;
