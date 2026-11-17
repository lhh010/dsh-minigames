/**
 * 抓娃娃机 Claw 纯逻辑：双轴时序定位（水平扫描 → 前后深度扫描）→
 * 摆动下爪 → 夹取判定（娃娃大小 + 爪心偏移 → 命中概率）→ 提升、平移
 * 到出口 → 途中滑落判定（偏移越大越易掉）→ 入洞得分。所有随机来自
 * 注入的 mulberry32 种子流（布局 / 夹取 / 滑落），同种子同输入完全
 * 可重放；渲染层只读本模块状态，事件经 state.events 供渲染消费。
 */
/** 逻辑画布宽度（px）。 */
export declare const W = 640;
/** 逻辑画布高度（px）。 */
export declare const H = 520;
/** 机柜几何（逻辑坐标）：娃娃活动横向区间、导轨高度、地面高度、出口 x。 */
export declare const CABINET: {
    readonly left: 92;
    readonly right: 486;
    readonly railY: 96;
    readonly floorY: 440;
    readonly chuteX: 572;
};
/** 每轮币数（= 夹取次数）。 */
export declare const COINS_PER_ROUND = 5;
/** 总轮数。 */
export declare const TOTAL_ROUNDS = 3;
/** 爪最大下降深度（px，导轨以下）。 */
export declare const DROP_DEPTH = 320;
/** 水平扫描周期（ms）。 */
export declare const X_CYCLE_MS = 2600;
/** 前后深度扫描周期（ms）。 */
export declare const Z_CYCLE_MS = 1800;
/** 钟摆摆动周期（ms）。 */
export declare const PEND_CYCLE_MS = 1250;
/** 娃娃档次：大娃宽松低分、中娃均衡、钥匙扣难抓高分。 */
export interface DollKind {
    /** 档次名。 */
    name: string;
    /** 基准半身尺寸（px）。 */
    size: number;
    /** 入洞得分。 */
    value: number;
}
/** 三档娃娃（索引即 kind）。 */
export declare const DOLL_KINDS: readonly DollKind[];
/** 柜内一只娃娃。 */
export interface Doll {
    /** 局内唯一 id。 */
    id: number;
    /** 横向位置（px）。 */
    x: number;
    /** 纵深 0（前排，大）..1（后排，小）。 */
    z: number;
    /** 档次索引（见 DOLL_KINDS）。 */
    kind: number;
    /** 本局实际尺寸（随轮次缩小，px）。 */
    size: number;
    /** 入洞得分。 */
    value: number;
}
/** 逻辑向渲染广播的一次性事件。 */
export type ClawEvent = {
    type: 'lockX';
    x: number;
} | {
    type: 'lockZ';
    z: number;
} | {
    type: 'grab';
    x: number;
    y: number;
    value: number;
} | {
    type: 'miss';
    x: number;
    y: number;
} | {
    type: 'slip';
    x: number;
    y: number;
    value: number;
} | {
    type: 'score';
    x: number;
    y: number;
    value: number;
} | {
    type: 'roundStart';
    round: number;
} | {
    type: 'over';
    score: number;
};
/** 游戏阶段：水平定位 → 深度定位 → 下爪 → 提升/平移/投放 → 结束。 */
export type ClawPhase = 'aimX' | 'aimZ' | 'drop' | 'carry' | 'over';
/** 一局 claw 的全部可测状态。 */
export interface ClawState {
    /** 当前阶段。 */
    phase: ClawPhase;
    /** 轮次（0 起）。 */
    round: number;
    /** 本轮剩余币。 */
    coinsLeft: number;
    /** 总分。 */
    score: number;
    /** 累计成功夹取次数（驱动摆动幅度递进）。 */
    totalGrabs: number;
    /** 爪横向位置（px；定位阶段随扫描刷新）。 */
    clawX: number;
    /** 爪纵深 0..1（深度定位阶段随扫描刷新）。 */
    clawZ: number;
    /** 锁定的横向位置（px）。 */
    lockedX: number;
    /** 锁定的纵深 0..1。 */
    lockedZ: number;
    /** 导轨以下下降量（px）。 */
    dropY: number;
    /** 正在携带的娃娃（未夹中 / 已滑落为 null）。 */
    carrying: Doll | null;
    /** 夹中时预抽的滑落判定值。 */
    slipRoll: number;
    /** 本爪夹取时的爪心偏移（px）。 */
    lastOff: number;
    /** 本爪是否已做过滑落判定。 */
    slipDone: boolean;
    /** 柜内娃娃。 */
    dolls: Doll[];
    /** 事件队列（step 开头清空，渲染每帧消费）。 */
    events: ClawEvent[];
    /** 注入的随机流（布局 / 夹取 / 滑落全部经由它）。 */
    rng: () => number;
    /** 回合内时钟（ms，驱动两轴扫描）。 */
    timeMs: number;
    /** 装饰时钟（ms，渲染动画用）。 */
    animMs: number;
    /** 钟摆相位（rad）。 */
    pendPhase: number;
    /** 下一只娃娃 id。 */
    nextId: number;
}
/**
 * 确定性伪随机流（mulberry32）：同种子产生完全相同的 0..1 序列。
 * @param seed - 非负整数种子。
 * @returns 产生 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 娃娃的绘制 / 判定纵坐标（地面随纵深抬高、后排更靠上）。 */
export declare function dollY(doll: Doll): number;
/**
 * 本局钟摆幅度（px）：基础小摆，随累计成功与轮次递进（后轮更难）。
 * @param totalGrabs - 累计成功夹取次数。
 * @param round - 轮次（0 起）。
 */
export declare function swingAmplitude(totalGrabs: number, round: number): number;
/**
 * 当前钟摆横向偏移（px）：幅度 × sin(相位)，夹取判定即用它。
 * @param state - 当前状态。
 */
export declare function swingDx(state: ClawState): number;
/**
 * 夹中概率：娃娃越大越宽容，爪心偏移越大越难夹，夹在 [0.03, 0.96]。
 * @param size - 娃娃尺寸（px）。
 * @param offset - 爪心与娃娃中心的横向偏移（px）。
 */
export declare function grabChance(size: number, offset: number): number;
/**
 * 携带途中的滑落概率：偏移越大越易掉，大娃更稳，后轮整体更滑。
 * @param size - 娃娃尺寸（px）。
 * @param offset - 夹取时的爪心偏移（px）。
 * @param round - 轮次（0 起）。
 */
export declare function slipChance(size: number, offset: number, round: number): number;
/**
 * 用注入随机流布置一轮柜内娃娃：前后两排各 3 只，档次与位置由种子
 * 决定；后轮整体缩小（更难夹）。
 * @param rng - 注入随机流。
 * @param round - 轮次（0 起）。
 * @param firstId - 本轮起始娃娃 id。
 * @returns 娃娃数组。
 */
export declare function layoutDolls(rng: () => number, round: number, firstId: number): Doll[];
/**
 * 创建一局新状态：爪停在左上、5 币、娃娃按种子布置。
 * @param seed - 种子（与轮外局号组合决定随机流）。
 * @param run - 局号（重开递增，避免同日同种子完全重排）。
 */
export declare function createClaw(seed: number, run?: number): ClawState;
/**
 * 挑选夹取目标：横向偏移与纵深差加权距离最小、且爪够得着的娃娃。
 * @param state - 当前状态。
 * @param dx - 本爪钟摆偏移（px）。
 * @returns 最近的娃娃，无够得着的目标时为 null。
 */
export declare function pickTarget(state: ClawState, dx: number): Doll | null;
/**
 * 玩家点击 / 空格：aimX 锁横向进 aimZ；aimZ 锁深度并投币下爪；其余
 * 阶段忽略。
 * @param state - 当前状态。
 */
export declare function pressClaw(state: ClawState): void;
/**
 * 推进一帧模拟：两轴扫描、下爪、夹取 / 滑落判定、提升平移与投放、
 * 换轮与结束。事件写入 state.events（每帧开头清空）。
 * @param state - 当前状态。
 * @param dtMs - 帧时长（ms）。
 */
export declare function stepClaw(state: ClawState, dtMs: number): void;
