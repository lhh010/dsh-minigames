/**
 * 圈地争夺（Qix）纯逻辑引擎：格子制空地、边缘安全带、沿边移动 /
 * 切入拖笔迹 / 回边闭合填充的玩家状态机、墨怪在未占领区确定性游荡
 * （弹墙直线 + 注入种子随机转向）、笔迹被触碰丢命、占领率与五关递进。
 * 渲染无关、无 DOM；所有随机来自注入的 mulberry32 种子，可确定性重放。
 */
/** 方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right';
/** 玩家所处模式：沿边（已占格上滑行）或拖笔迹（空地中作画）。 */
export type PlayerMode = 'edge' | 'draw';
/** 对局阶段。 */
export type QixStatus = 'playing' | 'levelClear' | 'gameover';
/** 方向到格位移的映射。 */
export declare const DIR_DELTA: Record<Dir, {
    dx: number;
    dy: number;
}>;
/** 场地列数。 */
export declare const COLS = 40;
/** 场地行数。 */
export declare const ROWS = 26;
/** 玩家步进间隔（毫秒）。 */
export declare const PLAYER_STEP_MS = 80;
/** 每关墨怪步进间隔（毫秒），随关卡递减（更快）。 */
export declare const QIX_STEP_MS: readonly [340, 300, 260, 230, 200];
/** 每关墨怪数量，随关卡递增。 */
export declare const QIX_COUNT: readonly [3, 3, 4, 4, 5];
/** 每关占领率过关目标。 */
export declare const TARGET_RATIO: readonly [0.75, 0.78, 0.8, 0.82, 0.85];
/** 总关数。 */
export declare const LEVELS = 5;
/** 初始命数。 */
export declare const LIVES = 3;
/** 每占一格得分。 */
export declare const SCORE_PER_CELL = 10;
/** 过关基础奖励（再乘关卡数）。 */
export declare const LEVEL_CLEAR_BONUS = 200;
/** 一只墨怪：未占领区内直线游荡、受阻或随机时换向。 */
export interface Qix {
    /** 当前列。 */
    x: number;
    /** 当前行。 */
    y: number;
    /** 行进方向分量（-1/0/1，允许斜向）。 */
    dx: number;
    /** 行进方向分量。 */
    dy: number;
}
/** 一次按键输入记录（重放用）。 */
export interface KeyEvent {
    /** 输入生效时的引擎帧号（advance 调用序数）。 */
    cycle: number;
    /** 方向键。 */
    dir: Dir;
    /** true 按下 / false 松开。 */
    down: boolean;
}
/** 引擎状态：一关进行中 + 整场比赛的关卡、命、得分与重放日志。 */
export interface QixState {
    /** 当前关卡（1 起）。 */
    level: number;
    /** 剩余命。 */
    lives: number;
    /** 总得分。 */
    score: number;
    /** 对局阶段。 */
    status: QixStatus;
    /** 占领图：0 空、1 己占（含初始安全带）。 */
    own: Uint8Array;
    /** 玩家列。 */
    px: number;
    /** 玩家行。 */
    py: number;
    /** 玩家模式。 */
    mode: PlayerMode;
    /** 拖笔迹中已走过的格索引（按时间序，末尾为玩家所在格）。 */
    trail: number[];
    /** 本段笔迹起笔的边缘格（丢命后回到这里）。 */
    drawStart: {
        x: number;
        y: number;
    };
    /** 按住的方向（最近按下优先）。 */
    held: Dir[];
    /** 墨怪列表。 */
    qix: Qix[];
    /** 最近一次闭合填充的格数（渲染提示用）。 */
    lastFillCount: number;
    /** 引擎帧号（每次 advance 调用 +1，重放锚点）。 */
    cycle: number;
    /** 玩家步进累加器（毫秒）。 */
    playerAccumMs: number;
    /** 玩家上一格（渲染插值用）。 */
    prevCell: {
        x: number;
        y: number;
    };
    /** 墨怪步进累加器（毫秒）。 */
    qixAccumMs: number;
    /** 注入的确定性随机源。 */
    rng: () => number;
    /** 按键日志（重放用，跨关累积）。 */
    inputLog: KeyEvent[];
}
/** mulberry32：种子化的确定性 [0,1) 随机源。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 某格是否属于安全带（场地最外一圈）。 */
export declare function isBelt(x: number, y: number): boolean;
/** 内部格总数（不含安全带），占领率的分母。 */
export declare function interiorCount(): number;
/** 当前占领率：内部格中己占的比例（安全带不计入）。 */
export declare function ownedRatio(state: QixState): number;
/** 当前关的墨怪数量。 */
export declare function qixCountFor(level: number): number;
/** 当前关的墨怪步进间隔（毫秒）。 */
export declare function qixStepMsFor(level: number): number;
/** 当前关的过关占领率目标。 */
export declare function targetFor(level: number): number;
/** 创建一场新比赛（第 1 关开始）。
 * @param seed - 随机种子（墨怪初始方向与转向用）。
 * @returns 初始引擎状态。
 */
export declare function createQixState(seed: number): QixState;
/** 按键输入：维护按住方向列表（最近按下优先）并记入重放日志。
 * @param state - 引擎状态。
 * @param dir - 方向。
 * @param down - true 按下 / false 松开。
 */
export declare function setHeld(state: QixState, dir: Dir, down: boolean): void;
/**
 * 闭合填充：先把笔迹格全部置为己占，再对剩余空格做连通分量洪泛，
 * 不含墨怪的分量整体填充（即“闭合环包围的、不含敌人的一侧”）。
 * @param state - 引擎状态（笔迹非空时调用）。
 * @returns 本次新占的内部格数（含笔迹格）。
 */
export declare function closeAndFill(state: QixState): number;
/** 笔迹或玩家与墨怪的碰撞：墨怪（浮点坐标）进入任一笔迹格（切比雪夫
 * 距离 <0.85，即确实踩在该格内）才命中。原实现用曼哈顿 ≤1——墨怪在
 * 对角/相邻格 1.0 单位外就判死，视觉上根本没碰到笔迹线。 */
export declare function trailHit(state: QixState): boolean;
/**
 * 玩家走一格：沿边模式在已占格滑行、朝空格切入转 draw；拖笔迹模式
 * 前进/转向（禁掉头）、进已占格即闭合填充并回到沿边模式。
 * @param state - 引擎状态。
 * @returns true 表示发生了移动或闭合。
 */
export declare function stepPlayer(state: QixState): boolean;
/**
 * 所有墨怪走一格：目标为空格则直线前进（小概率随机转向），受阻则从
 * rng 洗牌的 8 邻域里选第一个可行的空格方向；随后检查笔迹碰撞。
 * @param state - 引擎状态。
 */
export declare function stepQix(state: QixState): void;
/**
 * 推进引擎（由渲染帧驱动）：按各自步进间隔推进玩家与墨怪。
 * @param state - 引擎状态。
 * @param dtMs - 距上一帧的毫秒数。
 */
export declare function advance(state: QixState, dtMs: number): void;
/** 进入下一关：盘面重置、墨怪更多更快、目标更高，得分与命保留并加过关奖励。
 * @param state - 引擎状态（须处于 levelClear 且还有下一关）。
 */
export declare function startNextLevel(state: QixState): void;
/** 整场比赛是否已通关（最后一关过关）。 */
export declare function matchWon(state: QixState): boolean;
/**
 * 确定性重放：按固定 dt 序列重演按键日志，复现局面。
 * @param seed - 与原始对局相同的种子。
 * @param log - 原始对局记录的按键日志。
 * @param cycles - 重放帧数。
 * @param dtMs - 每帧毫秒数（须与记录时的节奏一致才有意义；测试用固定值）。
 * @returns 重放得到的引擎状态。
 */
export declare function replay(seed: number, log: KeyEvent[], cycles: number, dtMs: number): QixState;
/** 局面签名：占领图 + 墨怪位置的确定性摘要（重放比对用）。 */
export declare function signature(state: QixState): string;
