/**
 * 找茬大师（PhotoHunt）纯逻辑：由注入 seed 程序化生成一张风景场景
 * （房屋/树木/云朵/太阳/小鸟/花朵等 16 种基元随机组合），其中 5 处被
 * 修改（颜色变化/大小变化/旋转/镜像/删除元素）。玩家点击右图差异位置
 * （半径 20px 内）标记找到，点错扣时 3 秒；5 关递进——元素更多、修改
 * 幅度更细微、限时更短。全部函数确定性：相同 seed 与关卡必然得到相同
 * 谜题与判定结果，可离线重放测试。
 */
/** 场景基元种类（16 种，渲染层各自对应一组程序绘制路径）。 */
export type PrimitiveKind = 'sun' | 'cloud' | 'bird' | 'tree' | 'pine' | 'house' | 'flower' | 'bush' | 'mountain' | 'fence' | 'kite' | 'windmill' | 'rock' | 'balloon' | 'butterfly' | 'lake';
/** 场景中的一个基元实例（左右两图共用同一坐标系）。 */
export interface SceneElement {
    /** 基元种类。 */
    kind: PrimitiveKind;
    /** 面板内中心坐标。 */
    x: number;
    y: number;
    /** 缩放系数（1 为基准大小）。 */
    scale: number;
    /** 旋转角（度，顺时针；非对称基元才有意义）。 */
    rotation: number;
    /** 是否水平镜像（仅非对称基元有效）。 */
    flip: boolean;
    /** 主体色相（0-359，渲染为 hsl）。 */
    hue: number;
}
/** 一处修改的描述与判定位置。 */
export interface HuntDiff {
    /** 被修改基元在左图列表中的下标。 */
    index: number;
    /** 修改类型：color 颜色 / scale 大小 / rotate 旋转 / mirror 镜像 / remove 删除。 */
    kind: 'color' | 'scale' | 'rotate' | 'mirror' | 'remove';
    /** 判定圆心（等于基元中心，两侧共用）。 */
    x: number;
    y: number;
}
/** 一关的谜题：基准场景 + 修改后的右图场景 + 修改点列表。 */
export interface HuntScene {
    /** 左图（基准）基元列表。 */
    left: SceneElement[];
    /** 右图（应用修改后）基元列表；remove 修改会少对应个数。 */
    right: SceneElement[];
    /** 修改点列表（固定 5 处）。 */
    diffs: HuntDiff[];
}
/** 单侧画面（场景图）的逻辑尺寸；两图共用同一坐标系。 */
export declare const PANEL_W = 330;
export declare const PANEL_H = 248;
/** 命中判定半径（逻辑像素）。 */
export declare const HIT_RADIUS = 20;
/** 每关修改点数量。 */
export declare const DIFF_COUNT = 5;
/** 点错一次扣时（秒）。 */
export declare const MISS_PENALTY_S = 3;
/** 关卡难度递进：元素更多、修改幅度更细微（色差/尺寸差/角度差更小）、限时更短。 */
export interface LevelConfig {
    /** 场景基元总数。 */
    elementCount: number;
    /** 本关限时（秒）。 */
    timeS: number;
    /** 颜色修改的色相偏移量（度）。 */
    colorDelta: number;
    /** 大小修改的缩放变化量。 */
    scaleDelta: number;
    /** 旋转修改的角度变化量（度）。 */
    rotateDelta: number;
}
/** 5 关难度表。 */
export declare const LEVELS: LevelConfig[];
/** 关卡总数。 */
export declare const LEVEL_COUNT: number;
/** mulberry32 确定性随机数发生器（所有随机都走注入 seed）。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 由 seed 确定性地生成一关场景与 5 处修改。
 * @param seed - 任意 32 位整数种子。
 * @param level - 关卡（1 起）；超出范围按最后一关处理。
 * @returns 场景（左右基元列表 + 修改点）。
 */
export declare function createScene(seed: number, level: number): HuntScene;
/** 一局（单关）状态。 */
export interface PhotoHuntState {
    /** 当前场景谜题。 */
    scene: HuntScene;
    /** 每处修改是否已被找到（与 scene.diffs 下标对应）。 */
    found: boolean[];
    /** 点错次数（每次扣 MISS_PENALTY_S 秒）。 */
    misses: number;
    /** 剩余时间（秒）。 */
    timeLeft: number;
    /** 本关限时（秒）。 */
    timeLimit: number;
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
export declare function createPhotoHuntState(seed: number, level: number): PhotoHuntState;
/** 剩余未找到的修改数。 */
export declare function remainingDiffs(state: PhotoHuntState): number;
/**
 * 判定一次右图点击：半径 HIT_RADIUS 内存在未找到的修改则标记找到；
 * 否则记一次点错并扣时 MISS_PENALTY_S 秒。
 * @param state - 当前局面（原地更新）。
 * @param x - 右图内横坐标。
 * @param y - 右图内纵坐标。
 * @returns 'hit' 命中一处修改；'miss' 点错（已扣时）；'busy' 局面已结束。
 */
export declare function tryClick(state: PhotoHuntState, x: number, y: number): 'hit' | 'miss' | 'busy';
/**
 * 推进倒计时。时间归零且尚有未找修改时判负。
 * @param state - 当前局面（原地更新）。
 * @param dtS - 经过秒数（非负）。
 * @returns 更新后的状态字段 status。
 */
export declare function tick(state: PhotoHuntState, dtS: number): 'playing' | 'won' | 'lost';
/**
 * 结算本关得分：已找修改 ×150 + 剩余时间取整 ×2 + 过关关卡奖励 ×200。
 * @param state - 当前局面。
 */
export declare function computeScore(state: PhotoHuntState): number;
/** 是否还有下一关。 */
export declare function hasNextLevel(state: PhotoHuntState): boolean;
