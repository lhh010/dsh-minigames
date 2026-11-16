/**
 * 引力弹弓 Orbit 纯逻辑：轨道规划谜题。探针从空间站以玩家选择的初始
 * 速度发射，受所有行星平方反比引力（半刚性积分子步，固定 1/240 s），
 * 经过信标半径内过关；撞行星 / 小行星或飞出边界失败。5 关递进，每关
 * 预录参考解（重放验证）。全部函数确定性可测：同参数同轨迹位级一致，
 * 时间倍速只改变每帧执行的子步数、不改变轨迹；所有随机走注入 seed。
 */
/** 逻辑画布尺寸。 */
export declare const W = 640;
export declare const H = 480;
/** 固定积分子步秒长：所有轨迹按此离散步进，保证位级可重放。 */
export declare const SUB_DT: number;
/** 单次飞行最大子步数（15 s），超时判漂失。 */
export declare const MAX_FLIGHT_SUBSTEPS = 3600;
/** 探针碰撞半径 px。 */
export declare const PROBE_RADIUS = 4;
/** 撞击判定额外余量 px。 */
export declare const COLLIDE_PAD = 3;
/** 出界余量：探针越出画布外该距离判失败。 */
export declare const BOUNDS_MARGIN = 60;
/** 引力常数（配合行星质量量级，px/s^2 = G * mass / r^2）。 */
export declare const G = 4200;
/** 引力软化下限：距离小于该值按该值算，避免近场数值爆炸。 */
export declare const MIN_R = 24;
/** 发射最小速度 px/s（低于则不发射）。 */
export declare const MIN_LAUNCH_SPEED = 40;
/** 过关 / 失败后阶段停留 ms（之后自动进入下一关 / 回到瞄准）。 */
export declare const PHASE_MS = 1800;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 一颗行星：位置、质量（引力强度）与碰撞半径。 */
export interface Planet {
    x: number;
    y: number;
    mass: number;
    radius: number;
}
/** 一块小行星带障碍：圆形碰撞体（无引力）。 */
export interface Asteroid {
    x: number;
    y: number;
    radius: number;
}
/** 一关的完整盘面数据。 */
export interface OrbitLevel {
    /** 关卡名（HUD 显示）。 */
    name: string;
    planets: Planet[];
    asteroids: Asteroid[];
    /** 起点空间站。 */
    station: {
        x: number;
        y: number;
    };
    /** 目标信标与捕获半径。 */
    beacon: {
        x: number;
        y: number;
        radius: number;
    };
    /** 预录参考解：初始速度向量（重放验证过关）。 */
    refVx: number;
    refVy: number;
}
/** 5 关手工递进：单行星绕后 → 双行星接力 → 窄缝穿行 → 逆行减速捕获 → 多重弹弓链。 */
export declare const LEVELS: OrbitLevel[];
/**
 * 计算一点处的多体引力加速度（平方反比，软化下限 MIN_R）。
 * @param level - 关卡数据。
 * @param x - 位置 x px。
 * @param y - 位置 y px。
 * @returns 加速度 { ax, ay } px/s^2。
 */
export declare function gravityAt(level: OrbitLevel, x: number, y: number): {
    ax: number;
    ay: number;
};
/** 探针状态。 */
export interface Probe {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
/** 一次飞行的结局。 */
export type FlightResult = 'flying' | 'won' | 'crash' | 'out' | 'timeout';
/**
 * 完整模拟一次发射（用于参考解验证 / 提示回放），逐子步确定性推进。
 * @param level - 关卡数据。
 * @param vx - 初始速度 x px/s。
 * @param vy - 初始速度 y px/s。
 * @param maxSubsteps - 子步上限（默认全程）。
 * @param recordEvery - 每隔多少子步记录一个轨迹点（0 不记录）。
 * @returns 结局、信标最小接近距离、子步数、轨迹点。
 */
export declare function simulateFlight(level: OrbitLevel, vx: number, vy: number, maxSubsteps?: number, recordEvery?: number): {
    result: FlightResult;
    minDist: number;
    substeps: number;
    path: {
        x: number;
        y: number;
    }[];
};
/**
 * 发射前预测虚线：前 steps 个子步的探针位置（逐步供渲染衰减透明度）。
 * @param level - 关卡数据。
 * @param vx - 初始速度 x px/s。
 * @param vy - 初始速度 y px/s。
 * @param steps - 预测子步数（默认 60）。
 * @returns 轨迹点数组（遇终局提前截断）。
 */
export declare function predictPath(level: OrbitLevel, vx: number, vy: number, steps?: number): {
    x: number;
    y: number;
}[];
/** 参考解整段回放（H 提示与关卡校验用）。 */
export declare function replayReference(level: OrbitLevel): {
    result: FlightResult;
    minDist: number;
    path: {
        x: number;
        y: number;
    }[];
};
/**
 * 校验一关数据合法性：几何不重叠、参考解重放确实过关。
 * @param level - 关卡数据。
 * @returns 错误列表（空数组即合法）。
 */
export declare function validateLevel(level: OrbitLevel): string[];
/** 游戏阶段。 */
export type OrbitPhase = 'aim' | 'flying' | 'won' | 'lost';
/** 一局运行时状态（含跨关卡累计）。 */
export interface OrbitState {
    /** 注入种子（渲染星空等用途，逻辑侧可复现）。 */
    seed: number;
    levelIndex: number;
    phase: OrbitPhase;
    /** 本关已发射次数。 */
    launches: number;
    /** 瞄准中的初始速度向量 px/s。 */
    aimVx: number;
    aimVy: number;
    /** 飞行中的探针（aim 阶段为 null）。 */
    probe: Probe | null;
    /** 尾迹（每 4 子步一点，渐隐绘制）。 */
    trail: {
        x: number;
        y: number;
    }[];
    /** 全关卡累计最佳（最小）接近距离 px，Infinity 表示尚无飞行。 */
    bestDistance: number;
    /** 失败原因（lost 阶段有效）。 */
    lostReason: '' | 'crash' | 'out' | 'timeout';
    /** won/lost 阶段停留 ms（满 PHASE_MS 自动流转）。 */
    phaseMs: number;
    /** 动画时钟 ms（脉冲等，不随倍速缩放）。 */
    timeMs: number;
    /** 累计得分。 */
    score: number;
    /** 提示开关（H 键）。 */
    hintVisible: boolean;
    /** 时间倍速 1/2/4。 */
    speed: 1 | 2 | 4;
    /** 5 关全部完成。 */
    allDone: boolean;
    /** 子步累加器 ms（倍速换算入口，保证轨迹与倍速无关）。 */
    accMs: number;
    /** 本次发射已飞行子步数（超时判漂失）。 */
    flownSubsteps: number;
}
/**
 * 创建一局新状态。
 * @param seed - 注入种子。
 * @returns 初始状态（第 1 关、瞄准阶段）。
 */
export declare function createOrbit(seed: number): OrbitState;
/** 当前关卡数据。 */
export declare function currentLevel(state: OrbitState): OrbitLevel;
/**
 * 设定瞄准向量（发射前调用）。
 * @param state - 游戏状态。
 * @param vx - 初始速度 x px/s。
 * @param vy - 初始速度 y px/s。
 */
export declare function setAim(state: OrbitState, vx: number, vy: number): void;
/**
 * 发射：按瞄准向量从空间站射出探针。速度过低时不发射。
 * @param state - 游戏状态。
 * @returns 是否成功发射。
 */
export declare function launch(state: OrbitState): boolean;
/**
 * 推进一帧：倍速只放大每帧注入的模拟毫秒数，子步按累加器整数推进，
 * 因此任意倍速 / 任意分帧下轨迹位级一致。
 * @param state - 游戏状态。
 * @param dtMs - 帧时长 ms（建议 ≤ 50）。
 */
export declare function stepOrbit(state: OrbitState, dtMs: number): void;
/**
 * 失败后回到瞄准阶段（保留最佳距离与发射数）。
 * @param state - 游戏状态。
 */
export declare function retryLevel(state: OrbitState): void;
/**
 * 过关后进入下一关；最后一关则标记 allDone 并停留在过关画面。
 * @param state - 游戏状态。
 */
export declare function advanceLevel(state: OrbitState): void;
/**
 * 重开本关：发射数清零（R 键）。
 * @param state - 游戏状态。
 */
export declare function restartLevel(state: OrbitState): void;
/** 一颗背景星：位置、亮度、视差层。 */
export interface Star {
    x: number;
    y: number;
    r: number;
    alpha: number;
    layer: number;
}
/**
 * 确定性生成背景星空（渲染消费；seed 注入，可复现）。
 * @param seed - 种子。
 * @param count - 星数（默认 110）。
 * @returns 星数组。
 */
export declare function generateStarfield(seed: number, count?: number): Star[];
