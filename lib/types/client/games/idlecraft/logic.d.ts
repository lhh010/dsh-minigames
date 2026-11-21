/**
 * 小作坊 IdleCraft 纯逻辑：压缩增量经营——点击「敲打」产出齿轮，齿轮购买
 * 五级机器链（手动锤→脚踏机床→蒸汽机→流水线→机械臂，产量×3 价格×10，
 * 单机价格按已购数 1.15^n 递增，第 3 局起 1.2^n），总产出达到里程碑阈值
 * 免费解锁下一级机器并令全局倍率 ×2（也可按 U 花钱提前解锁），最后 30 秒
 * 冲刺期全部产出 ×1.5。180 秒倒计时结束按总产出（向下取整）对照目标结算
 * 胜负。全部为确定性纯函数：固定 TICK_MS 离散积分，无 DOM、无计时器；
 * 经济不消耗随机数（seed 仅供状态构造对齐公共约定）。
 */
/** 机器等级 id（0 起的链上下标）。 */
export type TierIndex = 0 | 1 | 2 | 3 | 4;
/** 一级机器的经济参数。 */
export interface TierSpec {
    /** 中文短名。 */
    name: string;
    /** 单台每秒基础产量。 */
    ratePerSec: number;
    /** 第 1 台基准价（后续按已购数指数递增）。 */
    basePrice: number;
    /** 图标字符（渲染层卡片用）。 */
    glyph: string;
}
/** 五级机器链：产量×3、价格×10 递进；0 级开局即可购买。 */
export declare const TIERS: TierSpec[];
/** 里程碑阈值：总产出达到 TIERS[k] 的阈值即解锁第 k 级（k≥1）并 ×2。
 * 下标 0 未用占位（0 级开局已解锁）。 */
export declare const MILESTONES: [number, number, number, number, number];
/** 提前解锁费相对阈值的加价系数（U 键路径比等里程碑贵 25%）。 */
export declare const UNLOCK_MARKUP = 1.25;
/** 点击基础产出（受全局倍率与冲刺加成）。 */
export declare const CLICK_BASE = 1;
/** 冲刺倍率与冲刺时长（最后 N 毫秒）。 */
export declare const SPRINT_MULT = 1.5;
export declare const SPRINT_MS = 30000;
/** 单局时长（毫秒）。 */
export declare const DURATION_MS = 180000;
/** 逻辑 tick 间隔（毫秒，index 层按 dt 累加驱动）。 */
export declare const TICK_MS = 100;
/** 一局挑战参数。 */
export interface IdleCraftLevel {
    /** 胜利目标：结算时总产出（向下取整）≥ 此值即胜。 */
    target: number;
    /** 单机价格增长底数（已购 n 台 → 价格 = 基准价 × growth^n）。 */
    growth: number;
}
/** 5 局递进：目标总产出递增；第 3 局（下标 2）起价格增长收紧到 1.2。 */
export declare const LEVELS: IdleCraftLevel[];
/** 一局状态。 */
export interface IdleCraftState {
    phase: 'playing' | 'won' | 'lost';
    /** 0 起的关卡下标。 */
    levelIndex: number;
    /** 已流逝毫秒数（固定 tick 累加，暂停即停表）。 */
    elapsedMs: number;
    /** 当前齿轮余额（可支配货币，浮点累积）。 */
    gears: number;
    /** 开局以来总产出（含已花掉的；分数与里程碑按它计）。 */
    totalProduced: number;
    /** 敲打次数。 */
    clicks: number;
    /** 各级机器已购台数（下标即 TierIndex）。 */
    machines: [number, number, number, number, number];
    /** 已解锁的最高机器级（0 起）。 */
    unlockedTier: TierIndex;
    /** 已触发的里程碑次数（全局倍率 = 2^milestones）。 */
    milestones: number;
    /** 每秒一次的总产出快照（结算曲线用，末尾为最新值）。 */
    history: number[];
    /** 本 tick 内的秒计数器（每 10 个 tick 落一个快照）。 */
    privateTick: number;
    rng: () => number;
}
/**
 * mulberry32 确定性伪随机数发生器（与 farm/burger 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 全局倍率：每个里程碑 ×2。 */
export declare function globalMult(state: IdleCraftState): number;
/** 是否处于最后 30 秒冲刺期。 */
export declare function isSprint(state: IdleCraftState): boolean;
/** 冲刺倍率（进行中且在冲刺窗口内才生效）。 */
export declare function sprintMult(state: IdleCraftState): number;
/** 当前每秒自动产量（机器 × 全局倍率 × 冲刺）。 */
export declare function productionPerSec(state: IdleCraftState): number;
/** 第 tier 级下一台的价格（向上取整）。 */
export declare function machinePrice(state: IdleCraftState, tier: TierIndex): number;
/**
 * 创建一局初始状态。
 * @param seed - 32 位种子（经济不消耗随机数，仅保留公共构造约定）。
 * @param levelIndex - 0 起的关卡下标。
 * @returns 新的一局状态。
 */
export declare function createIdleCraftState(seed: number, levelIndex: number): IdleCraftState;
/**
 * 敲打一次：产出 CLICK_BASE × 全局倍率 × 冲刺。
 * @param state - 一局状态。
 * @returns 本次产出的齿轮数。
 */
export declare function clickForge(state: IdleCraftState): number;
/**
 * 购买一台第 tier 级机器。
 * @param state - 一局状态。
 * @param tier - 目标机器级。
 * @returns 购买成功 true；未解锁或余额不足 false（不扣款）。
 */
export declare function buyMachine(state: IdleCraftState, tier: TierIndex): boolean;
/** U 键提前解锁下一级的费用（阈值 × 1.25，向上取整）。 */
export declare function unlockCost(state: IdleCraftState): number;
/**
 * U 键提前升级：花钱解锁下一级机器并令全局倍率 ×2（与里程碑免费路径
 * 等效，但更贵——攒钱升 tier 还是等阈值是核心决策）。
 * @param state - 一局状态。
 * @returns 成功 true；已满级、非进行中或余额不足 false（不扣款）。
 */
export declare function unlockNextTier(state: IdleCraftState): boolean;
/** 里程碑进度（0..1，朝下一个未解锁阈值）。满级返回 1。 */
export declare function milestoneProgress(state: IdleCraftState): number;
/**
 * 推进一个固定 TICK_MS：自动产出积分、里程碑检查、倒计时与结算。
 * @param state - 一局状态。
 */
export declare function tickIdleCraft(state: IdleCraftState): void;
/** 结算分数：总产出向下取整。 */
export declare function finalScore(state: IdleCraftState): number;
