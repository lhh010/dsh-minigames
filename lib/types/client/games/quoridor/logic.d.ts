/**
 * 鬼墙 (Quoridor) 纯逻辑。9×9 格棋盘：玩家 0（南方，起点 (4,8)，目标
 * 第 0 行）与玩家 1（北方，起点 (4,0)，目标第 8 行）轮流行动——走一步
 * 棋（上下左右，不可穿墙；正对对方棋子可直跳，直跳被墙或棋盘边挡住
 * 时可斜跳）或放置一块 2 格长的墙（横/竖；不得越界、重叠、交叉，且
 * 放置后双方仍必须能经 BFS 到达各自目标行）。任一方棋子先到对方底
 * 边即胜。AI 采用最短路差值启发（缩短己方 / 拉长对方），难度分级控
 * 制墙的考虑与噪声幅度；全部随机经 mulberry32 注入 seed，决策确定
 * 可测。
 */
/** 棋盘边长（格）。 */
export declare const BOARD = 9;
/** 每方墙的配额。 */
export declare const WALLS_PER_PLAYER = 10;
/** 棋盘上的格子坐标：c 列（0..8，左起），r 行（0..8，顶起）。 */
export interface Pos {
    c: number;
    r: number;
}
/** 墙的走向：h 横墙（隔开上下两行），v 竖墙（隔开左右两列）。 */
export type WallOrient = 'h' | 'v';
/** 一局鬼墙的全部状态（纯数据，可安全复制）。 */
export interface QuoridorState {
    /** 双方棋子坐标：下标 0 南方、1 北方。 */
    pawns: [Pos, Pos];
    /** 双方剩余墙数。 */
    wallStock: [number, number];
    /** 横墙占用表：hWalls[r*8+c] 为 1 表示锚点 (c,r)（c,r∈0..7）处有横墙，覆盖格子 (c,r)(c+1,r) 与 (c,r+1)(c+1,r+1) 之间的两条边。 */
    hWalls: Uint8Array;
    /** 竖墙占用表：vWalls[r*8+c] 为 1 表示锚点 (c,r) 处有竖墙，覆盖格子 (c,r)(c+1,r) 与 (c,r+1)(c+1,r+1) 之间的两条边。 */
    vWalls: Uint8Array;
    /** 每块墙的放置者（0/1），-1 为空，用于着色与回放。 */
    wallOwners: Int8Array;
    /** 当前行动方。 */
    turn: 0 | 1;
    /** 胜者（棋子到达目标行的一方），null 为进行中。 */
    winner: 0 | 1 | null;
}
/** 玩家的目标行：南方 0 向上走到第 0 行，北方 1 向下走到第 8 行。 */
export declare function goalRow(player: 0 | 1): number;
/** mulberry32 伪随机数发生器：同 seed 序列确定（与各游戏共用的写法一致）。 */
export declare function mulberry32(seed: number): () => number;
/** 开局：双方各在己方底边中央，各 10 块墙，南方先行。 */
export declare function createGame(): QuoridorState;
/** 深拷贝一份状态（供推导落子后的新局面）。 */
export declare function cloneState(s: QuoridorState): QuoridorState;
/**
 * 相邻两格之间是否有墙。a、b 必须相邻（曼哈顿距离 1）。
 * @param s - 当前局面。
 * @param a - 起点格。
 * @param b - 终点格。
 * @returns 有墙返回 true。
 */
export declare function wallBetween(s: QuoridorState, a: Pos, b: Pos): boolean;
/**
 * 当前方的一步走子合法落点集合（含面对面对跳与斜跳）：
 * - 普通一步：相邻格无墙且无对方棋子；
 * - 正对对方棋子：先看直跳（越过对方再走一格，两段都不能穿墙、不能出盘）；
 * - 直跳被墙或棋盘边挡住时：允许斜跳到对方棋子两侧（每段同样不可穿墙）。
 * @param s - 当前局面。
 * @returns 合法落点数组。
 */
export declare function legalSteps(s: QuoridorState): Pos[];
/** 某玩家从棋子到其目标行的最短步数。
 * @param s - 当前局面（墙与双方棋子位置均计入）。
 * @param player - 玩家下标。
 * @returns 最短步数；不可达返回 -1（合法局面不会出现）。
 */
export declare function shortestPath(s: QuoridorState, player: 0 | 1): number;
/**
 * 当前方能否在锚点 (c,r) 放一块指定走向的墙：需在界内、未越界于配额、
 * 不与既有墙重叠（同走向相邻锚点）或交叉（同一锚点的横竖墙），且放置
 * 后双方仍都能 BFS 到达各自目标行（不得完全堵死）。
 * @param s - 当前局面。
 * @param orient - 墙走向。
 * @param c - 锚点列（0..7）。
 * @param r - 锚点行（0..7）。
 * @returns 合法返回 true。
 */
export declare function canPlaceWall(s: QuoridorState, orient: WallOrient, c: number, r: number): boolean;
/**
 * 当前方放墙并轮转行动权。
 * @param s - 当前局面。
 * @param orient - 墙走向。
 * @param c - 锚点列（0..7）。
 * @param r - 锚点行（0..7）。
 * @returns 新局面；任何不合法（含可达性破坏）返回 null。
 */
export declare function placeWall(s: QuoridorState, orient: WallOrient, c: number, r: number): QuoridorState | null;
/**
 * 当前方把棋子走到合法落点并轮转行动权；到达目标行即判胜。
 * @param s - 当前局面。
 * @param to - 目标格（必须在 legalSteps 内）。
 * @returns 新局面；落点不合法返回 null。
 */
export declare function movePawn(s: QuoridorState, to: Pos): QuoridorState | null;
/** AI 的一个行动：走子到 to，或在锚点放墙。 */
export type AiAction = {
    type: 'move';
    to: Pos;
} | {
    type: 'wall';
    orient: WallOrient;
    c: number;
    r: number;
};
/**
 * 从 AI 视角评估局面：对方最短路 − 己方最短路（越大越好）。
 * @param s - 行动后的局面。
 * @param me - AI 所执玩家下标。
 * @returns 评估值。
 */
export declare function evaluateState(s: QuoridorState, me: 0 | 1): number;
/**
 * AI 决策（确定性）：遍历全部走子与（有墙时）全部合法放墙，按最短路
 * 差值启发打分取最优；seed 注入 mulberry32 噪声打破平手。难度分级：
 * 0 级只走子（新手）；1 级走子 + 放墙、噪声 0.6；2 级再叠加一步对方
 * 贪心回应（近似两 ply）、零噪声。
 * @param s - 当前局面（以 s.turn 一方视角决策）。
 * @param seed - 伪随机 seed（同 seed 同局面决策确定）。
 * @param level - 难度 0/1/2。
 * @returns 行动对象；无合法行动（不应出现）返回 null。
 */
export declare function chooseAiAction(s: QuoridorState, seed: number, level: number): AiAction | null;
/**
 * 按局数推进难度：0 局 0 级，1 局 1 级，2 局及以上 2 级（封顶）。
 * @param gamesPlayed - 已结束的局数。
 * @returns 难度 0/1/2。
 */
export declare function nextDifficulty(gamesPlayed: number): number;
/**
 * 三局两胜是否已定。
 * @param wins - 双方胜局数。
 * @returns 任一方拿到 2 胜返回 true。
 */
export declare function matchDecided(wins: [number, number]): boolean;
