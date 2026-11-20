/**
 * 蚁群引路（AntTrail）纯逻辑：俯视草地网格上，玩家不能直接指挥蚂蚁，
 * 只能放/撤障碍石（阻挡改道）与滴糖水（信息素吸引点，限时消退需续滴）
 * ——两种工具每关配额有限。蚁群从食物源出发随机游走，按感知半径内的
 * 信息素梯度偏转 + 随机扰动 + 障碍反弹移动；未扛食蚂蚁靠近食物源拾起
 * 食物，扛食蚂蚁回到蚁巢即得分。第 4 关起加入瓢虫天敌（沿矩形巡逻，
 * 碰到蚂蚁吃掉，可用障碍石困住）。至少 N 只（次）蚂蚁把食物搬回蚁巢
 * 即过关，5 关递进：场地更大/障碍预设更刁钻/配额更紧/N 更高。
 *
 * 确定性：随机数只通过注入 seed（mulberry32）派生的 rng（关卡布置 +
 * 蚂蚁随机扰动），物理按固定子步（SUBSTEP_MS）积分，整局可按
 * (seed, 工具操作 + 时间序列) 完整重放。时间单位全为毫秒。
 */
/** 逻辑画布宽（px）。 */
export declare const W = 480;
/** 逻辑画布高（px），顶部 HUD_H 为信息条。 */
export declare const H = 600;
/** 顶部 HUD 条高度（px）。 */
export declare const HUD_H = 30;
/** 固定物理子步长（ms）：stepAntTrail 把外部 dt 累加后按此切分。 */
export declare const SUBSTEP_MS = 10;
/** 网格边长（px）：障碍石与信息素都落在此网格上。 */
export declare const CELL = 20;
/** 蚂蚁移动速度（px/s，恒速，方向由朝向决定）。 */
export declare const ANT_SPEED = 52;
/** 蚂蚁碰撞半径（px）：贴墙/贴石的内缩边距。 */
export declare const ANT_R = 3;
/** 随机游走强度（rad/子步内的扰动幅度，rng 均匀采样 ±一半）。 */
export declare const WANDER_RATE = 0.35;
/** 信息素转向速率（rad/子步）：左右传感器值差超过阈值时偏转。 */
export declare const STEER_RATE = 0.3;
/** 传感器探测距离（px，朝向前方左右各一）。 */
export declare const SENSOR_DIST = 16;
/** 左右传感器相对朝向的张角（rad）。 */
export declare const SENSOR_ANGLE = 0.9;
/** 传感器触发需要的最小值差（信息素无量纲）。 */
export declare const SENSOR_EPS = 0.01;
/** 拾取食物判定半径（px）：未扛食蚂蚁距食物源小于此值即扛食。 */
export declare const PICK_R = 16;
/** 回巢判定半径（px）：扛食蚂蚁距蚁巢小于此值即交付得分。 */
export declare const NEST_R = 18;
/** 一次糖水的存续时长（ms）：期间持续向所在格注入信息素，到期即停。 */
export declare const SUGAR_LIFE_MS = 6000;
/** 每 5 个子步（50ms）做一次信息素扩散/消退。 */
export declare const DIFFUSE_EVERY = 5;
/** 每次扩散时糖水向所在格注入的信息素量。 */
export declare const SUGAR_ADD = 1;
/** 每次扩散的信息素按比例消退系数。 */
export declare const DECAY = 0.06;
/** 每次扩散向四个非障碍邻格扩散的份额。 */
export declare const SPREAD = 0.14;
/** 单格信息素上限。 */
export declare const PHER_MAX = 4;
/** 瓢虫巡逻速度（px/s，沿场地内缩矩形环路巡航）。 */
export declare const LADY_SPEED = 40;
/** 瓢虫捕食半径（px）：范围内的蚂蚁被吃掉。 */
export declare const EAT_R = 9;
/** 瓢虫前方探测距离（px）：前方格被障碍堵住即掉头。 */
export declare const LADY_AHEAD = 10;
/** 每次交付食物的即时加分。 */
export declare const SCORE_PER_DELIVERY = 20;
/** 过关时的固定加分。 */
export declare const WIN_BONUS = 60;
/** 过关后停留展示时长（ms），随后自动进入下一关。 */
export declare const WIN_LINGER_MS = 1600;
/** 一关的难度配置。 */
export interface AntTrailLevel {
    /** 本关蚂蚁数（15-30）。 */
    antCount: number;
    /** 过关需要的交付次数 N。 */
    need: number;
    /** 玩家可放的障碍石配额。 */
    stoneQuota: number;
    /** 玩家可滴的糖水次数配额。 */
    sugarQuota: number;
    /** 限时（ms）。 */
    timeLimitMs: number;
    /** 瓢虫数量（第 4 关起 ≥1）。 */
    ladybugs: number;
    /** 场地内缩（px）：越小场地越大。 */
    inset: number;
    /** 预设障碍样式。 */
    preset: 'none' | 'wall-v' | 'double-v' | 'cross' | 'maze';
}
/** 5 关递进配置：蚁群变大、场地变大、预设更刁钻、配额更紧、N 更高。 */
export declare const LEVELS: AntTrailLevel[];
/** 轴对齐矩形。 */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 一只蚂蚁：位置、朝向（rad）、是否扛食。 */
export interface Ant {
    x: number;
    y: number;
    heading: number;
    carrying: boolean;
}
/** 一滴糖水：位置与剩余存续时长。 */
export interface SugarDrop {
    x: number;
    y: number;
    lifeMs: number;
}
/** 一只瓢虫：位置、当前巡逻路点下标（0-3）与巡回方向（1 顺 / -1 逆）。 */
export interface Ladybug {
    x: number;
    y: number;
    wpIndex: number;
    dir: number;
}
/** 游戏阶段。 */
export type AntTrailPhase = 'playing' | 'won' | 'lost' | 'campaign-won';
/** 整局状态：campaign 从第 0 关打到第 4 关，跨关累计分数。 */
export interface AntTrailState {
    seed: number;
    levelIndex: number;
    phase: AntTrailPhase;
    /** 网格列数 / 行数（由关卡 inset 决定）。 */
    cols: number;
    rows: number;
    /** 本关草地矩形（不含顶部 HUD）。 */
    field: Rect;
    /** 障碍石占用（网格一维化，preset 与玩家共用）。 */
    stones: boolean[];
    /** 每格障碍石归属：0 无、1 预设、2 玩家（撤玩家石返还配额）。 */
    stoneOwner: Uint8Array;
    /** 玩家已放置的障碍石数（撤除返还）。 */
    stonesUsed: number;
    /** 玩家已滴糖水次数。 */
    sugarsUsed: number;
    drops: SugarDrop[];
    /** 信息素场（网格一维化，与 stones 同下标）。 */
    pher: Float32Array;
    ants: Ant[];
    ladybugs: Ladybug[];
    /** 食物源（场地左侧中部）与蚁巢（右侧中部）。 */
    food: {
        x: number;
        y: number;
    };
    nest: {
        x: number;
        y: number;
    };
    delivered: number;
    score: number;
    timeLeftMs: number;
    elapsedMs: number;
    winTimerMs: number;
    stepAccumulatorMs: number;
    /** 已执行的子步总数（驱动每 5 步一次的信息素扩散）。 */
    substeps: number;
    /** 由 seed 派生的确定性随机源（布置 + 蚂蚁扰动）。 */
    rng: () => number;
}
/**
 * mulberry32 确定性随机数发生器：同 seed 产生同一 [0,1) 序列。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 本关草地矩形（不含顶部 HUD）。 */
export declare function fieldRect(level: AntTrailLevel): Rect;
/**
 * 逻辑坐标所在网格的下标（一维）。
 * @param st - 游戏状态。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 一维下标，场地外返回 -1。
 */
export declare function cellAt(st: AntTrailState, x: number, y: number): number;
/**
 * 位置是否被挡住（碰墙、越界或所在格是障碍石）。以点近似蚂蚁身体。
 * @param st - 游戏状态。
 * @param x - 目标 x。
 * @param y - 目标 y。
 * @returns true 表示不能进入该位置。
 */
export declare function isBlocked(st: AntTrailState, x: number, y: number): boolean;
/**
 * 查询某点信息素浓度（就近格，不插值）。
 * @param st - 游戏状态。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 浓度（场地外为 0）。
 */
export declare function pheromoneAt(st: AntTrailState, x: number, y: number): number;
/**
 * 用 seed 派生 rng 重置当前关卡：食物源在左、蚁巢在右，蚂蚁群在食物源
 * 周围出生（未扛食，第一步即拾食），瓢虫锚在巡逻环角点，全部由
 * (seed, levelIndex) 决定。
 * @param st - 游戏状态（levelIndex 已指向目标关）。
 */
export declare function startLevel(st: AntTrailState): void;
/**
 * 开新战役。
 * @param seed - 随机种子（默认取自 Math.random，测试注入固定值）。
 * @returns 第 0 关初始状态。
 */
export declare function createAntTrail(seed?: number): AntTrailState;
/**
 * 玩家工具 1：在逻辑坐标处放/撤一块障碍石。放到已占格即撤除；撤玩家
 * 石返还配额（预设石撤除不返还也不计费）。食物源/蚁巢附近与场地外无效。
 * @param st - 游戏状态。
 * @param x - 点击逻辑 x。
 * @param y - 点击逻辑 y。
 * @returns true 表示本次操作生效。
 */
export declare function toggleStone(st: AntTrailState, x: number, y: number): boolean;
/**
 * 玩家工具 2：在逻辑坐标处滴一滴糖水（消耗一次配额）。障碍格、场地外
 * 与食物源/蚁巢近旁无效；存续 SUGAR_LIFE_MS，期间持续注入信息素。
 * @param st - 游戏状态。
 * @param x - 点击逻辑 x。
 * @param y - 点击逻辑 y。
 * @returns true 表示本次操作生效。
 */
export declare function dropSugar(st: AntTrailState, x: number, y: number): boolean;
/** 瓢虫巡逻环路四角（场地内缩矩形）。 */
export declare function ladybugWaypoints(st: AntTrailState): Array<{
    x: number;
    y: number;
}>;
/**
 * 推进模拟：把外部 dt（ms）累加后按固定子步切分执行。
 * @param st - 游戏状态。
 * @param dtMs - 距上一帧的毫秒数。
 */
export declare function stepAntTrail(st: AntTrailState, dtMs: number): void;
