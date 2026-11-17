/**
 * 双陆棋（Backgammon，1v1 对 AI）纯逻辑：24 个尖点 + 中栏 bar + 出局槽。
 * 玩家（you）沿 24→1 方向行进，内区为 1-6 点；AI 相反（1→24，内区
 * 19-24）。每回合掷两骰：非对子各走一次（可同子连走、可拆分顺序），
 * 对子走四次；目标点被对方 2 枚以上棋子占据即被阻挡；恰好落在对方
 * 单子上为打吃（对方子上栏，上栏方须先从对方内区重新入场）；全部
 * 棋子进入己方内区后方可按点数移出（bear off，恰好点数直接移出、
 * 超出点数仅当身后没有更远棋子），先全部移出者赢下该局，3 局 2 胜
 * （不含加倍骰）。
 *
 * AI 为一层贪心 + 启发式（打吃 > 救出被困子 > 立点堆叠 > 推进 pip），
 * 候选打分混入 seed 派生的确定性噪声。所有随机（掷骰、AI 噪声）均由
 * seed 派生（mulberry32），不藏私有随机源：同一 seed 与同一操作序列
 * 必然得到同一状态，可脱离 DOM 直接模拟与重放。
 */
/** 一方标识：you 玩家（24→1）/ ai 电脑（1→24）。 */
export type Side = 'you' | 'ai';
/** 阶段：待掷骰 / 待行子 / 一局结束 / 整场结束。 */
export type BackgammonPhase = 'roll' | 'move' | 'roundOver' | 'matchOver';
/** 一步棋：die 点数，from 出发点（0 = 从中栏入场），to 落点（0 = 移出 bear off）。 */
export interface Move {
    die: number;
    from: number;
    to: number;
    /** 该步是否打吃（对方单子被送上栏）。 */
    hit: boolean;
}
/** 棋盘：you/ai 各 24 点的棋子数（下标 i = 第 i+1 点）+ 中栏 + 出局。 */
export interface Board {
    you: number[];
    ai: number[];
    barYou: number;
    barAi: number;
    offYou: number;
    offAi: number;
}
/** 一场比赛的完整可测状态（JSON 可序列化纯数据）。 */
export interface BackgammonState {
    seed: number;
    /** 局号（从 1 起，最多 3 局）。 */
    round: number;
    phase: BackgammonPhase;
    turn: Side;
    /** 本局掷骰次数（掷骰随机流的确定性计数器）。 */
    rollNo: number;
    board: Board;
    /** 最近一次掷出的两骰面（未掷或已结算为 null）。 */
    dice: [number, number] | null;
    /** 本回合尚未使用的骰面（对子为 4 个）。 */
    remaining: number[];
    /** 本回合已走的步（回合结束后归入 lastTurn）。 */
    turnMoves: Move[];
    /** 已结束回合的记录（展示与复盘用）。 */
    lastTurn: {
        side: Side;
        dice: [number, number];
        moves: Move[];
    } | null;
    /** 本局胜者（roundOver / matchOver 时非 null）。 */
    roundWinner: Side | null;
    roundWinsYou: number;
    roundWinsAi: number;
    matchWinner: Side | null;
    message: string;
}
/** 夺冠所需局数（3 局 2 胜）。 */
export declare const ROUNDS_TO_WIN = 2;
/** 每方棋子总数。 */
export declare const CHECKERS = 15;
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 标准初始棋盘：每方 15 子——24 点 2 枚、13 点 5 枚、8 点 3 枚、6 点
 * 5 枚（AI 沿中线镜像）。
 */
export declare function initialBoard(): Board;
/** 深拷贝棋盘（枚举回合时在副本上推演）。 */
export declare function cloneBoard(board: Board): Board;
/** 己方在点 p（1..24）的棋子数。 */
export declare function ownAt(board: Board, side: Side, p: number): number;
/** 对方在点 p（1..24）的棋子数。 */
export declare function oppAt(board: Board, side: Side, p: number): number;
/**
 * 全部棋子是否已进入己方内区（you 为 1-6 点、ai 为 19-24 点，且中栏
 * 为空）——bear off 的资格条件。
 */
export declare function canBearOff(board: Board, side: Side): boolean;
/**
 * 掷某一骰后己方的全部合法单步（不含「必须用满骰子」的整体约束）。
 * 中栏优先：中栏有子时只生成入场步（you 入 25-die，ai 入 die，被对方
 * 2+ 子占据即整骰作废）；bear off 需 {@link canBearOff} 且遵循恰好 /
 * 超出规则。
 * @param board - 当前棋盘（不修改）。
 * @param side - 行子方。
 * @param die - 骰面（1-6）。
 * @returns 合法单步列表。
 */
export declare function legalSingleMoves(board: Board, side: Side, die: number): Move[];
/**
 * 在棋盘上落实一步（就地修改）：出发减一（中栏或点），落点加一或出
 * 局加一；打吃时对方单子送上栏。
 */
export declare function applyMove(board: Board, side: Side, move: Move): void;
/**
 * 枚举一次掷骰后的全部合法完整回合（非对子两骰可拆两种顺序，对子四
 * 步），并施加「必须用满可用骰子；只能用一骰时须用较大骰面」规则：
 * 返回的每个候选都是该规则下的极大用法。
 * @param board - 回合开始时的棋盘（不修改）。
 * @param side - 行子方。
 * @param dice - 两骰面。
 * @returns 合法回合（步序列）列表；无任何可走步时为空数组。
 */
export declare function enumerateTurns(board: Board, side: Side, dice: [number, number]): Move[][];
/** 某方在剩余骰面下是否存在任何合法单步。 */
export declare function hasAnyMove(board: Board, side: Side, remaining: readonly number[]): boolean;
/** 己方 pip 距离（行至出口的总点数，中栏按 25 计）——进度度量。 */
export declare function pipCount(board: Board, side: Side): number;
/**
 * 开新比赛：第 1 局、标准初始盘、玩家先掷。
 * @param seed - 基础种子。
 */
export declare function createBackgammon(seed: number): BackgammonState;
/**
 * 掷骰随机流：seed × 局号 × 局内掷骰计数派生，两骰独立可重放。
 * @param state - 当前状态。
 * @returns 本次的两个骰面。
 */
export declare function deriveDice(state: BackgammonState): [number, number];
/**
 * 掷骰并进入行子阶段（就地修改）：写入骰面与剩余骰；若行子方两骰皆
 * 无合法步则直接跳过回合（对方获得掷骰权）。
 * @param state - 当前状态（须处于 phase==='roll'）。
 * @returns 实际掷出的骰面；非待掷阶段返回 null。
 */
export declare function rollFor(state: BackgammonState): [number, number] | null;
/**
 * 玩家走一步（就地修改）：在剩余骰中寻找 from→to 的合法单步并落实；
 * 骰子用尽或剩余骰无步可走时自动结束回合。
 * @param state - 当前状态（须 phase==='move' 且 turn==='you'）。
 * @param from - 出发点（0 = 中栏）。
 * @param to - 落点（0 = bear off）。
 * @returns 找到并落实为 true；无合法步或轮次不对为 false。
 */
export declare function playerMove(state: BackgammonState, from: number, to: number): boolean;
/**
 * AI 启发式打分（纯函数，side 任意）：对候选回合在副本上推演，按
 * 打吃 > 救出被困子（中栏与对方内区）> 立点堆叠 > 推进 pip / 移出
 * 计分，最后叠加 seed 派生的确定性噪声。
 * @param board - 回合开始的棋盘。
 * @param side - 行子方（aiTurn 用 'ai'；重放测试可替 'you' 侧决策）。
 * @param moves - 候选步序列。
 * @param noiseSeed - 噪声种子（同种子同分）。
 * @returns 该候选的分数（越高越优）。
 */
export declare function scoreAiTurn(board: Board, side: Side, moves: readonly Move[], noiseSeed: number): number;
/**
 * AI 选择完整回合（纯函数，不修改棋盘）：枚举合法回合取启发式最高分
 * （并列取首者），完全由棋盘、骰面与噪声种子决定。
 * @param board - 回合开始的棋盘。
 * @param side - 行子方。
 * @param dice - 两骰面。
 * @param noiseSeed - 噪声种子。
 * @returns 选中的步序列；无可走步为空数组。
 */
export declare function chooseAiTurn(board: Board, side: Side, dice: [number, number], noiseSeed: number): Move[];
/**
 * AI 执行整个回合（就地修改）：选择、逐步落实并结束回合。
 * @param state - 当前状态（须 phase==='move' 且 turn==='ai'）。
 * @returns 实际走出的步序列（可为空——掷骰阶段已过滤无步回合）。
 */
export declare function aiTurn(state: BackgammonState): Move[];
/**
 * 进入下一局（就地修改）：重置棋盘，先手随局号轮换（奇数局你、偶数
 * 局对方）；整场已结束时不变。
 */
export declare function nextRound(state: BackgammonState): void;
