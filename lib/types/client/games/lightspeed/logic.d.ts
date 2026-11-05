/**
 * 「光速穿梭 Lightspeed」纯逻辑：确定性种子关卡生成 + 固定步长物理。
 *
 * 物理模型：光子以标量速度沿 heading 前进；玩家转向直接旋转 heading；
 * 引力井加速度分解为沿航向分量（改变速度）与垂直航向分量（改变航向，
 * 曲率 = aPerp / speed）。该模型无随机数、固定步长积分，同一输入序列
 * 必然得到同一轨迹，可在 Node 中直接测试。
 */
/** 逻辑坐标宽（渲染与逻辑共用）。 */
export declare const LS_W = 960;
/** 逻辑坐标高。 */
export declare const LS_H = 600;
/** 总关卡数。 */
export declare const LEVEL_COUNT = 5;
/** 可调物理常量（导出供测试引用）。 */
export declare const PHYSICS: {
    /** 固定物理步长（毫秒），确定性积分的粒度。 */
    readonly fixedDtMs: number;
    /** 玩家转向角速度（rad/s）。 */
    readonly turnRate: 3;
    /** 初速（px/s）。 */
    readonly baseSpeed: 170;
    /** 速度下限：引力弹弓后仍保持漂移感。 */
    readonly minSpeed: 110;
    /** 速度上限。 */
    readonly maxSpeed: 520;
    /** 光子碰撞半径。 */
    readonly photonRadius: 5;
    /** 引力井核心致死半径系数（× radius）。 */
    readonly wellCoreFactor: 0.6;
    /** 轨迹拖尾最大点数。 */
    readonly trailMax: 130;
};
/** 引力井：位置、可视半径；质量决定引力强度。 */
export interface GravityWell {
    x: number;
    y: number;
    radius: number;
    mass: number;
}
/** 小行星：静态圆形障碍。 */
export interface Asteroid {
    x: number;
    y: number;
    radius: number;
}
/** 一关的静态布局：A 点、B 点、引力井群、小行星带。 */
export interface Level {
    /** 0 起的关卡序号。 */
    index: number;
    /** 生成本关的种子（渲染星空复用）。 */
    seed: number;
    start: {
        x: number;
        y: number;
    };
    goal: {
        x: number;
        y: number;
    };
    goalRadius: number;
    wells: GravityWell[];
    asteroids: Asteroid[];
}
/** 光子运动状态。 */
export interface Photon {
    x: number;
    y: number;
    /** 航向角（rad，0 = +x）。 */
    heading: number;
    /** 标量速度（px/s）。 */
    speed: number;
}
/** 一局结果。 */
export type LightspeedResult = 'playing' | 'dead' | 'levelClear' | 'victory';
/** 整局可步进状态（含当前关与累计分数）。 */
export interface LightspeedState {
    level: Level;
    photon: Photon;
    /** 最近轨迹点（尾在头，头在尾）。 */
    trail: Array<{
        x: number;
        y: number;
    }>;
    result: LightspeedResult;
    /** 本关已用时间（毫秒）。 */
    elapsedMs: number;
    /** 累计分数。 */
    score: number;
    /** 固定步长积分的余数累加器（毫秒）。 */
    accumulatorMs: number;
}
/**
 * 按 index 确定性生成一关：引力井数量与尺寸、小行星带、B 点位置均由
 * seed 派生；A/B 点周边保留安全区，保证出生航向不立即致死。
 * @param index - 0 起的关卡序号。
 * @returns 关卡静态布局。
 */
export declare function generateLevel(index: number): Level;
/**
 * 用指定关卡构造可步进状态（测试与开局共用）。
 * @param level - 关卡布局。
 * @returns 初始状态：光子在 A 点，航向 +x。
 */
export declare function createLightspeedState(level: Level): LightspeedState;
/**
 * 开新的一局（从第 1 关开始）。
 * @param startIndex - 可选 0 起始关卡（测试用）。
 * @returns 初始状态。
 */
export declare function createLightspeed(startIndex?: number): LightspeedState;
/**
 * 到站得分：到达速度越高、用时越短，分越高。
 * @param speed - 到达 B 点时的速度（px/s）。
 * @param elapsedMs - 本关用时（毫秒）。
 * @returns 该关得分（≥ 50）。
 */
export declare function arrivalScore(speed: number, elapsedMs: number): number;
/**
 * 推进一帧：把 dtMs 切成固定步长确定性积分；转向输入取 -1/0/+1。
 * @param state - 当前状态。
 * @param dtMs - 帧时长（毫秒）。
 * @param steer - 转向：-1 左、0 直行、+1 右。
 */
export declare function stepLightspeed(state: LightspeedState, dtMs: number, steer: number): void;
/**
 * 过关后进入下一关；最后一关过关则判胜。
 * @param state - 处于 levelClear 的状态。
 */
export declare function advanceLevel(state: LightspeedState): void;
