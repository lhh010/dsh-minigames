/**
 * 冰壶 Curling 纯逻辑：俯视赛道上的分队对抗。双方每局各掷 4 枚壶
 * （8 壶局，玩家先手），掷壶分两段锁定（方向摆针 → 力度往复条），
 * 滑行途中玩家可消耗擦冰次数（共 3 次）降低摩擦。壶受指数摩擦
 * 减速，壶间为等质量圆-圆弹性碰撞（法向速度交换 + 位置分离）。
 * 全部随机（AI 瞄准噪声）来自注入的 mulberry32 种子，同种子重放
 * 完全一致。渲染层（render.ts）只画状态；粘合层（index.ts）管输入。
 */
/** 赛道长度（世界单位，x 方向 0..210，掷壶朝 +x）。 */
export declare const SHEET_LEN = 210;
/** 赛道宽度（世界单位，y 方向 0..60）。 */
export declare const SHEET_WID = 60;
/** 壶半径。 */
export declare const STONE_R = 2.6;
/** 营垒圆心（12 英尺圈圆心）。 */
export declare const HOUSE_X = 160;
export declare const HOUSE_Y = 30;
/** 计分半径：壶心距圆心 ≤ 此值即在营内。 */
export declare const HOUSE_R = 15;
/** 同心圈半径（外 12ft / 中 8ft / 内 4ft，仅渲染）。 */
export declare const RINGS: readonly [15, 10, 5];
/** 出发点（hack）位置。 */
export declare const HACK_X = 8;
export declare const HACK_Y = 30;
/** 满力对应初速。 */
export declare const MAX_THROW_SPEED = 62;
/** 基础摩擦率（每秒指数衰减 v *= exp(-k·dt)）。 */
export declare const BASE_FRICTION_K = 0.35;
/** 擦冰时的摩擦倍率（越小越滑）。 */
export declare const SWEEP_K_FACTOR = 0.45;
/** 擦冰单次持续时长（秒）。 */
export declare const SWEEP_DURATION = 1.2;
/** 每次掷壶的擦冰次数上限。 */
export declare const SWEEP_CHARGES = 3;
/** 低于该速度判定静止并清零。 */
export declare const STOP_SPEED = 1.2;
/** 侧挡板恢复系数。 */
export declare const WALL_RESTITUTION = 0.55;
/** 后挡板恢复系数（壶撞尾板几乎停住）。 */
export declare const BACK_RESTITUTION = 0.12;
/** 壶-壶碰撞恢复系数（等质量）。 */
export declare const STONE_RESTITUTION = 0.92;
/** 固定物理子步长上限（防穿透）。 */
export declare const MAX_SUBSTEP_DT: number;
/** 方向摆针最大偏角（弧度，0 = 中线直掷）。 */
export declare const AIM_MAX_ANGLE = 0.45;
/** 方向摆动角速度。 */
export declare const AIM_SWING_SPEED = 1.1;
/** 力度条往复角速度。 */
export declare const POWER_SWING_SPEED = 1.3;
/** 每方每局掷壶数。 */
export declare const STONES_PER_SIDE = 4;
/** 总局数。 */
export declare const ENDS_TOTAL = 3;
export type Side = 'P' | 'A';
export interface Stone {
    side: Side;
    x: number;
    y: number;
    vx: number;
    vy: number;
    atRest: boolean;
    /** 手柄朝向（弧度），随滑行累计，供渲染旋转。 */
    rot: number;
}
export type CurlingPhase = 'aimDir' | 'aimPower' | 'sliding' | 'endScore' | 'gameOver' | 'paused';
export type CurlingEvent = {
    kind: 'hit';
    x: number;
    y: number;
    speed: number;
} | {
    kind: 'end';
    p: number;
    a: number;
    end: number;
} | {
    kind: 'game';
    pTotal: number;
    aTotal: number;
} | {
    kind: 'throw';
    side: Side;
};
export interface CurlingState {
    phase: CurlingPhase;
    /** 暂停前的阶段（恢复用）。 */
    pausedFrom: CurlingPhase | null;
    /** 当前局序号（1 起）。 */
    end: number;
    stones: Stone[];
    thrownP: number;
    thrownA: number;
    playerTotal: number;
    aiTotal: number;
    /** 每局得分（{p, a}）。 */
    endScores: {
        p: number;
        a: number;
    }[];
    /** 方向摆针时间。 */
    aimT: number;
    aimAngle: number;
    /** 力度往复时间。 */
    powerT: number;
    power: number;
    /** 本次掷壶剩余擦冰次数（仅玩家）。 */
    sweepCharges: number;
    sweepActive: boolean;
    sweepTimer: number;
    /** 正在滑行的本回合掷出壶（擦冰只作用于它）。 */
    thrownStone: Stone | null;
    events: CurlingEvent[];
    rng: () => number;
    msg: string;
}
/** mulberry32 种子随机（与其他游戏一致）。 */
export declare function mulberry32(seed: number): () => number;
/** 新建一整场比赛（3 局，玩家先掷）。 */
export declare function createGame(seed: number): CurlingState;
/** 方向摆针角度：t 时刻在 ±AIM_MAX_ANGLE 间正弦摆动。 */
export declare function swingAngle(t: number): number;
/** 力度往复值：t 时刻在 0..1 间余弦摆动（从 0 起）。 */
export declare function powerAt(t: number): number;
/**
 * 等质量圆-圆弹性碰撞：沿接触法向交换法向速度分量（按恢复系数 e
 * 缩放，正碰 e=1 时完全交换），切向分量不变；重叠时沿法向各退一半。
 * @param a - 第一枚壶（被原地修改）。
 * @param b - 第二枚壶（被原地修改）。
 * @param e - 恢复系数 [0,1]。
 * @returns 是否发生了碰撞（接近中的接触对被化解）。
 */
export declare function resolveStoneCollision(a: Stone, b: Stone, e: number): boolean;
/**
 * 推进模拟 dt 秒：固定子步积分位置、挡板、两两碰撞、指数摩擦（擦冰
 * 激活时只对本回合掷出壶降低摩擦）、低速归零。仅在 sliding 阶段运行。
 */
export declare function step(state: CurlingState, dt: number): void;
/** 锁定方向：aimDir → aimPower，力度从 0 重新起摆。 */
export declare function lockAim(state: CurlingState): boolean;
/** 锁定力度并掷壶（按双方已掷数决定该谁掷，玩家先手）。 */
export declare function lockPower(state: CurlingState): boolean;
/**
 * 开始一次擦冰：仅当己方壶滑行中、无进行中的擦冰且次数有余量。
 * @returns 是否成功开始（消耗一次次数）。
 */
export declare function startSweep(state: CurlingState): boolean;
/** 提前结束当前擦冰（松开空格；不返还次数）。 */
export declare function endSweep(state: CurlingState): void;
/**
 * 营垒计分：营内（距圆心 ≤ HOUSE_R）壶按距离升序，最近一壶所属方
 * 得分，个数为该方在对方最近壶之前的营内壶数；空营双方 0 分。
 * @param stones - 全部壶。
 * @returns {p, a} 本局双方得分。
 */
export declare function scoreHouse(stones: readonly Stone[]): {
    p: number;
    a: number;
};
/** AI 掷壶：按 aiPlan 决定方向力度并立即掷出（seed 确定性）。 */
export declare function aiThrow(state: CurlingState): void;
export interface AiPlan {
    angle: number;
    power: number;
    /** 'draw' 进营伏壶；'takeout' 顶掉对方最近营内壶。 */
    mode: 'draw' | 'takeout';
}
/**
 * AI 策略：对方有营内壶 → 高力瞄准它顶出（takeout）；否则中等力度
 * 向圆心轻摆落壶（draw）。噪声全部来自注入 rng，同 seed 同决策。
 * @param stones - 当前赛道上的壶。
 * @param rng - 种子随机源。
 */
export declare function aiPlan(stones: readonly Stone[], rng: () => number): AiPlan;
/** 局间确认：进入下一局（清壶、玩家先掷）或结束比赛。 */
export declare function beginNext(state: CurlingState): void;
/** 重开整场比赛（同种子 → 完全一致的 AI 与摆针时序）。 */
export declare function restartMatch(state: CurlingState, seed: number): void;
/** 暂停 / 恢复切换（记录暂停前阶段）。 */
export declare function togglePause(state: CurlingState): void;
