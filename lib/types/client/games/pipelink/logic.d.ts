/**
 * 「管道连连 Pipelink」纯逻辑：管件表示与旋转、从随机完整解逆推打乱的
 * 关卡生成（seed 保证可解）、多源 BFS 水流填充序、毒水管阻断、步数计
 * 与上限、提示与过关计分。全部随机走注入的 mulberry32，同 seed 逐位
 * 重放；渲染与输入不触碰本文件，测试只依赖这里的纯函数。
 */
/** 方向编码：0=上 1=右 2=下 3=左；对边为 (d+2)%4。 */
export type Pos = {
    r: number;
    c: number;
};
/** 可旋转管型（源头/出口是固定角色件，不参与旋转）。 */
export type PipeKind = 'straight' | 'elbow' | 'tee' | 'cross' | 'cap' | 'source' | 'drain';
/** 一格管件：kind+rot 决定开口；fixed 件（源/出口/毒管）不可旋转。 */
export interface PipeCell {
    kind: PipeKind;
    rot: number;
    /** 角色件标记：'source' | 'drain' | null。 */
    role: 'source' | 'drain' | null;
    /** 毒水管：水流被阻断，必须绕开；固定不可旋转。 */
    poison: boolean;
    /** 不可旋转（源头/出口/毒管）。 */
    fixed: boolean;
    /** 生成时的解方向（提示与最优步数下界用）。 */
    solutionRot: number;
}
/** 一关的静态盘面（不含运行状态）。 */
export interface LevelGrid {
    size: number;
    grid: PipeCell[][];
    sources: Pos[];
    drain: Pos;
    /** 允许的旋转次数上限。 */
    moveLimit: number;
}
/** 水流计算结果：填充序 + 每个源头是否汇到出口。 */
export interface FlowResult {
    /** BFS 层序填充的格子（含源头；毒管不进水）。 */
    order: Pos[];
    /** 逐源头：其水是否能到出口。 */
    perSource: boolean[];
    /** 所有源头都汇到出口（过关条件）。 */
    allConnected: boolean;
}
/** 游戏状态：'playing' 旋转中，'flowing' 放水动画，'won'/'lost' 终局。 */
export type PipelinkStatus = 'playing' | 'flowing' | 'won' | 'lost';
export interface PipelinkState {
    seed: number;
    level: number;
    size: number;
    grid: PipeCell[][];
    sources: Pos[];
    drain: Pos;
    moves: number;
    moveLimit: number;
    status: PipelinkStatus;
    score: number;
    /** 放水动画：填充序与当前进度（格）。 */
    flow: {
        order: Pos[];
        progress: number;
    } | null;
}
/** 水流动画速度（格/秒）。 */
export declare const FLOW_CELLS_PER_SEC = 8;
/** 关卡数与逐关尺寸 5×5→9×9。 */
export declare const LEVEL_COUNT = 5;
export declare const LEVEL_SIZES: readonly [5, 6, 7, 8, 9];
/** 各管型 rot=0 时的开口方向。 */
export declare const BASE_DIRS: Record<PipeKind, readonly number[]>;
/** 确定性伪随机（mulberry32）：同 seed 同序列。 */
export declare function mulberry32(seed: number): () => number;
/** 关卡 seed：基地址 + 关卡号混合，避免相邻关共用随机流。 */
export declare function levelSeed(seed: number, level: number): number;
/** 管件当前开口（base 绕 rot 转 90° 的倍数）。 */
export declare function connectionsOf(cell: PipeCell): number[];
/** 管件工厂：默认非固定、无毒、解方向等于初始 rot。 */
export declare function makeCell(kind: PipeKind, rot?: number, init?: Partial<PipeCell>): PipeCell;
/** 从当前 rot 顺时针最少点几下到解方向（直管两个等价朝向取小；四通为 0）。 */
export declare function minRotDelta(cell: PipeCell): number;
/** 随机简单路径（随机化 DFS，取 3 条候选中最短的一条）：网格连通必有解。 */
export declare function randomSimplePath(rng: () => number, size: number, start: Pos, end: Pos): Pos[];
/** 从开口集合反解管型与朝向（|S| 1..4 → 堵头/直/弯/三通/四通）。 */
export declare function solvePiece(dirs: number[]): {
    kind: PipeKind;
    rot: number;
} | null;
/** 全盘水流：并集填充序（动画用）+ 逐源头汇合判定（过关用）。 */
export declare function computeFlow(state: {
    size: number;
    grid: PipeCell[][];
    sources: Pos[];
    drain: Pos;
}): FlowResult;
/** 生成一关：先铺随机完整解，再逆旋转打乱；保证初始未通、可解。 */
export declare function generateLevel(level: number, rng: () => number): LevelGrid;
/** 由静态盘面构建运行状态（测试可手工造盘）。 */
export declare function buildState(def: LevelGrid, seed: number, level: number, score?: number): PipelinkState;
/** 新开一局（level 从 1 起）。 */
export declare function createPipelinkState(seed: number, level?: number, score?: number): PipelinkState;
/** 把全部管件转回解方向（验证生成可解性用）。 */
export declare function applySolution(state: PipelinkState): void;
/** 点击旋转一格 +90°：非 playing、固定件拒绝；成功计步并自动验证。 */
export declare function rotateCell(state: PipelinkState, r: number, c: number): boolean;
/** 空格放水验证：连通启动水流动画，未通无事发生。 */
export declare function validateNow(state: PipelinkState): boolean;
/** 提示：把第一个未对齐的可旋转件顺时针转一格（计步）并复验。 */
export declare function applyHint(state: PipelinkState): Pos | null;
/** 过关得分：关卡基础分 + 剩余步数奖励。 */
export declare function winScore(state: PipelinkState): number;
/** 推进放水动画；灌满时结算 won 并计分，返回是否本次刚通关。 */
export declare function tickFlow(state: PipelinkState, dt: number): boolean;
/** 下一关（循环 5 关），保留累计分。 */
export declare function advanceLevel(state: PipelinkState): void;
/** 重开本关：同 seed 同盘面，步数清零。 */
export declare function restartLevel(state: PipelinkState): void;
