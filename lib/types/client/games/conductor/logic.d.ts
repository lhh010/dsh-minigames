/**
 * 列车调度 Conductor 纯逻辑：侧视轨道网络上的道岔调度谜题。盘面由
 * seed 经 mulberry32 确定性生成——一条自左向右的主干加若干岔道：每个
 * 道岔 A 口沿主干直行、B 口经斜边通往上方或下方的彩色站台，主干尽头
 * 也是一座站台。列车从车库按固定间隔发车，恒速行驶不可停；玩家在列
 * 车抵达道岔前点击切换方向，把每列火车引向与自身颜色相同的站台。
 * 判定全部确定：到站颜色匹配=停靠得分；错色=失误 1 次（累计 3 次失
 * 败，列车延迟后重新发车）；两列火车进入同一节点（撞上已停靠站台、
 * 同一离散步内进同一节点、同轨道上距离过近）=相撞失败；超时失败。
 * 结构保证可解：岔道之间节点不相交、列车同速同源 FIFO，因此把各列
 * 车引向互不相同的站台即可全程无碰撞；列车颜色又无放回取自站台颜
 * 色，故任意 seed 下必存在可行调度（hasSolvableDispatch 恒真，
 * autoDispatch 给出一个贪心解并可用它通关全部 5 关）。时间单位毫秒，
 * 坐标为逻辑像素。
 */
/** 逻辑画布尺寸。 */
export declare const W = 800;
/** 逻辑画布高度。 */
export declare const H = 440;
/** 网格列距（主干边长，水平像素）。 */
export declare const P = 70;
/** 网格左端 x。 */
export declare const X0 = 46;
/** 行 y 坐标表下标即行号（主干在第 2 行）。 */
export declare const ROW_Y: number[];
/** 主干所在行号。 */
export declare const TRUNK_ROW = 2;
/** 主干最后一列（尽头站台 E 的列号）。 */
export declare const END_COL = 10;
/** 列车恒速（像素 / 秒），全程不可停。 */
export declare const SPEED = 85;
/** 首班车发车时刻 ms。 */
export declare const FIRST_DEPART_MS = 900;
/** 相邻列车发车间隔 ms（恒速下车间距 = 间隔 × 速度，远大于相撞阈值）。 */
export declare const DEPART_GAP_MS = 2600;
/** 错色到站后的重新发车延迟 ms。 */
export declare const REDEPART_MS = 4200;
/** 失误上限（达到即失败）。 */
export declare const MAX_MISTAKES = 3;
/** 同轨道上两车距离小于该值视为相撞（像素）。 */
export declare const CRASH_EPS = 8;
/** 道岔点击命中半径（像素）。 */
export declare const SWITCH_RADIUS = 26;
/** 五关配置：岔道数 3→7、列车数 2→4，时限随盘面计算。 */
export declare const LEVELS: readonly [{
    readonly junctions: 3;
    readonly trains: 2;
}, {
    readonly junctions: 4;
    readonly trains: 2;
}, {
    readonly junctions: 5;
    readonly trains: 3;
}, {
    readonly junctions: 6;
    readonly trains: 3;
}, {
    readonly junctions: 7;
    readonly trains: 4;
}];
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 节点类型：车库（发车点）/ 主干普通点 / 道岔 / 岔道折点 / 站台。 */
export type CondNodeKind = 'source' | 'plain' | 'junction' | 'bend' | 'station';
/** 轨道网络节点。 */
export interface CondNode {
    id: number;
    x: number;
    y: number;
    kind: CondNodeKind;
    /** 网格列号（主干与岔道定位用；站台与折点也有）。 */
    col: number;
    /** 网格行号（主干第 2 行，上方岔道站台第 0 行，下方第 4 行）。 */
    row: number;
    /** 站台颜色（THEME.accents 下标）；仅站台节点有。 */
    color: number;
    /** 出边（边 id）：道岔恰好 2 条且 [0]=A 主干直行、[1]=B 进岔道。 */
    out: number[];
}
/** 有向轨道边。 */
export interface CondEdge {
    id: number;
    from: number;
    to: number;
    /** 边长（像素）＝两端点欧氏距离，列车按 pos 沿边推进。 */
    len: number;
    /** 是否主干边（两端都在主干行上）。 */
    trunk: boolean;
}
/** 列车状态。 */
export type CondTrainState = 'waiting' | 'running' | 'docked' | 'crashed';
/** 一列火车。 */
export interface CondTrain {
    id: number;
    /** 颜色（THEME.accents 下标）。 */
    color: number;
    /** 当前所在边 id（waiting 时为出库边）。 */
    edge: number;
    /** 沿边位置（像素，0 ≤ pos ≤ len）。 */
    pos: number;
    state: CondTrainState;
    /** 发车时刻 ms。 */
    departAt: number;
    /** 停靠的站台节点 id；未停靠为 -1。 */
    station: number;
}
/** 单局状态：playing 进行中；cleared 本关完成待下一关；won/lost 终局。 */
export type CondStatus = 'playing' | 'cleared' | 'won' | 'lost';
/** 失败原因。 */
export type CondLostReason = '' | 'crash' | 'mistakes' | 'timeout';
/** 单步内产生、供渲染层消费的可视事件。 */
export type CondEvent = {
    type: 'depart';
    train: number;
    color: number;
} | {
    type: 'switch';
    node: number;
    setting: number;
} | {
    type: 'dock';
    train: number;
    node: number;
    color: number;
    gain: number;
} | {
    type: 'wrong';
    train: number;
    node: number;
    color: number;
} | {
    type: 'crash';
    x: number;
    y: number;
} | {
    type: 'clear';
    level: number;
    bonus: number;
} | {
    type: 'fail';
    reason: CondLostReason;
} | {
    type: 'win';
    score: number;
};
/** 一局游戏的完整可测状态。 */
export interface ConductorState {
    level: number;
    seed: number;
    run: number;
    /** 本关已流逝 ms。 */
    t: number;
    /** 本关时限 ms。 */
    timeLimit: number;
    status: CondStatus;
    lostReason: CondLostReason;
    /** 本关失误数。 */
    mistakes: number;
    /** 跨关累计分数。 */
    score: number;
    nodes: CondNode[];
    edges: CondEdge[];
    /** 按节点 id 索引的道岔方向（0=A 主干、1=B 岔道）；非道岔为 -1。 */
    switches: number[];
    junctionIds: number[];
    /** 车库节点 id。 */
    sourceId: number;
    trains: CondTrain[];
    events: CondEvent[];
}
/**
 * 生成某一关的轨道网络与列车（确定性）：主干横贯第 2 行，道岔等距分
 * 布，岔道由两条斜边直达上方 / 下方站台（方向按 seed 交替），尽头
 * E 亦是站台；站台颜色从 8 色中无放回抽取，列车颜色再无放回取自站
 * 台颜色——由此保证每列车都有一座独占的同色目标站台。
 * @param seed - 外部种子。
 * @param level - 关号（1 起）。
 * @param run - 第几局（同 seed 不同局盘面不同）。
 * @returns 该关的初始状态（level/seed/run/score 之外的字段就绪）。
 */
export declare function createLevelState(seed: number, level: number, run?: number): ConductorState;
/**
 * 新开一局（从第 1 关起）。
 * @param seed - 外部种子。
 * @param run - 第几局。
 * @returns 初始状态。
 */
export declare function createConductor(seed: number, run?: number): ConductorState;
/**
 * 本关完成后装载下一关（保留累计分）；第 5 关完成后置 won。
 * @param state - 当前状态（须处于 cleared）。
 */
export declare function startNextLevel(state: ConductorState): void;
/**
 * 切换一个道岔的方向（A↔B）；仅进行中有效。
 * @param state - 当前状态。
 * @param nodeId - 道岔节点 id。
 * @returns 是否切换成功。
 */
export declare function toggleSwitch(state: ConductorState, nodeId: number): boolean;
/**
 * 道岔点击命中测试。
 * @param state - 当前状态。
 * @param x - 逻辑 x 坐标。
 * @param y - 逻辑 y 坐标。
 * @returns 命中的道岔节点 id；未命中返回 -1。
 */
export declare function switchHitTest(state: ConductorState, x: number, y: number): number;
/**
 * 计算列车的像素位置与航向角。
 * @param state - 当前状态。
 * @param train - 目标列车。
 * @returns 中心坐标与航向角（弧度，沿行驶方向）。
 */
export declare function trainXY(state: ConductorState, train: CondTrain): {
    x: number;
    y: number;
    angle: number;
};
/**
 * 推进一帧：发车 → 恒速前移并沿途到达判定（同一步内两车进同一节点 =
 * 相撞）→ 同轨道追近判定 → 过关 / 超时判定。非 playing 状态直接返回。
 * @param state - 当前状态。
 * @param dtMs - 本帧毫秒。
 */
export declare function stepConductor(state: ConductorState, dtMs: number): void;
/**
 * 贪心自动调度：为每列车锁定同色目标站台，再对每个道岔选出「下一个
 * 经过该道岔的列车」并按其目标设向（目标即该岔道→B，否则→A）。由
 * 于主干上列车 FIFO、岔道互不相交，该策略可无碰撞完成整关。
 * @param state - 当前状态。
 */
export declare function autoDispatch(state: ConductorState): void;
/**
 * 当前局面是否仍可解：未完列车与空闲同色可达站台之间存在完美匹配。
 * @param state - 当前状态。
 * @returns 可解返回 true。
 */
export declare function hasSolvableDispatch(state: ConductorState): boolean;
