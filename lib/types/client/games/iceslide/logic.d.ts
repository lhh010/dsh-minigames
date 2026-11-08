/**
 * 冰面滑行（Ice Slide）纯逻辑：网格关卡由注入 seed 的生成器从解路径
 * 反推生成——先走出一条「按键 → 一路滑行到墙前停下」的解路径，再沿路径
 * 外侧补墙，宝石只放在路径上、尖刺只放在路径外，因此按记录的按键序列
 * 一定可以吃满宝石并停在出口。所有随机走 mulberry32(seed)，同 seed
 * 必生成同一关卡；无 DOM、无定时器，渲染层与测试共用。
 */
/** 滑行方向。 */
export type SlideDir = 'up' | 'down' | 'left' | 'right';
/** 格内标记位：墙 / 尖刺 / 宝石。 */
export declare const CELL_WALL = 1;
export declare const CELL_SPIKE = 2;
export declare const CELL_GEM = 4;
/** 一个冰面关卡：静态布局 + 保证可解的按键序列。 */
export interface IceLevel {
    /** 列数。 */
    w: number;
    /** 行数。 */
    h: number;
    /** 每格标记位掩码（row-major，索引 y*w+x）。 */
    cells: Uint8Array;
    /** 起点格索引。 */
    start: number;
    /** 出口格索引（需集齐宝石后停在此格）。 */
    exit: number;
    /** 生成时记录的解（按键序列；长度即该关最优参考步数 par）。 */
    solution: SlideDir[];
    /** 宝石总数。 */
    gemTotal: number;
}
/** 一次滑行的结果（也驱动渲染层的拖尾/粒子/结算）。 */
export interface SlideResult {
    /** 按下的方向。 */
    dir: SlideDir;
    /** 出发格。 */
    from: number;
    /** 停留格；滑出界时为 -1。 */
    to: number;
    /** 途经格（不含出发格，含终点；滑出界时不含界外）。 */
    path: number[];
    /** 结算类型：wall=撞墙停 / spike=踩尖刺 / fell=滑出界。 */
    outcome: 'wall' | 'spike' | 'fell';
    /** 本次沿途新收集的宝石格。 */
    gems: number[];
    /** 是否过关（停在出口且宝石集齐）。 */
    cleared: boolean;
}
/** 游戏状态：当前关卡布局 + 玩家进度。 */
export interface IceState {
    /** 当前关下标（0 起）。 */
    levelIndex: number;
    /** 当前关布局。 */
    level: IceLevel;
    /** 玩家所在格。 */
    pos: number;
    /** 已收集的宝石格集合。 */
    collected: Set<number>;
    /** 本关按键数（步数，越少评价越高）。 */
    moves: number;
    /** 本关死亡次数。 */
    retries: number;
    /** playing=滑行中 / dead=踩尖刺或滑出界 / cleared=过关待进入下一关。 */
    status: 'playing' | 'dead' | 'cleared';
    /** 死因（仅 status==='dead' 时有值）。 */
    deathCause: 'spike' | 'fell' | null;
    /** 已结算分数（宝石分 + 过关奖励）；当前关宝石分另见 iceScore。 */
    score: number;
    /** 最后一关也过关后为 true。 */
    finished: boolean;
    /** 撤销栈：每次成功滑行前的快照。 */
    history: Array<{
        pos: number;
        moves: number;
        collected: number[];
    }>;
}
/** 每颗宝石的分值。 */
export declare const GEM_SCORE = 10;
/** 过关奖励分档：步数 ≤ par / ≤ par+2 / 更慢。 */
export declare const CLEAR_BONUS: readonly [300, 150, 50];
/**
 * mulberry32 确定性伪随机数发生器（与其他游戏同构）。
 * @param seed 32 位种子
 * @returns 返回 [0,1) 均匀随机数的函数
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 手工构造关卡（测试与自定义用）：walls/spikes/gems 为格索引数组。
 * @param w 列数
 * @param h 行数
 * @param opts 墙/尖刺/宝石/起点/出口/解序列
 */
export declare function makeLevel(w: number, h: number, opts: {
    walls?: number[];
    spikes?: number[];
    gems?: number[];
    start: number;
    exit: number;
    solution?: SlideDir[];
}): IceLevel;
/**
 * 生成一个保证可解的关卡：从解路径反推布局（详见模块头）。内部按派生
 * seed 重试，通常一次成功；全部失败时抛错。
 * @param seed 种子；同 seed + 同参数必得同一关卡
 * @param w 列数（≥ 4）
 * @param h 行数（≥ 4）
 * @param moveCount 解路径的滑行段数（也是该关参考步数 par）
 * @param gemCount 宝石数（至少 1；空间不足时自动取可达上限）
 * @param spikeCount 路径外尖刺数
 * @param extraWalls 路径外额外墙数
 */
export declare function generateLevel(seed: number, w: number, h: number, moveCount: number, gemCount: number, spikeCount: number, extraWalls: number): IceLevel;
/** 预生成关卡库（模块加载时确定，同进程内恒定）。 */
export declare const LEVELS: IceLevel[];
/** 关卡总数。 */
export declare const LEVEL_COUNT: number;
/**
 * 创建一局新状态（从第 levelIndex 关开始，默认第 1 关）。
 * @param levelIndex 起始关下标（0 起，越界钳制）
 */
export declare function createIceState(levelIndex?: number): IceState;
/** 就地切换到第 index 关（保留累计 score，清空本关进度）。 */
export declare function loadIceLevel(state: IceState, index: number): void;
/** 本关死亡后重来：回到起点、宝石复原、步数清零、死亡计数 +1。 */
export declare function resetLevel(state: IceState): void;
/**
 * 当前展示分数：已结算 + 本关已吃宝石分。过关瞬间宝石分已并入 score、
 * 死亡待重来时宝石分即将回退，两种状态下都不再重复计入。
 */
export declare function iceScore(state: IceState): number;
/**
 * 按方向滑行：逐格前进直到撞墙（或踩尖刺 / 滑出界），沿途吃宝石；
 * 停在出口且宝石集齐时过关并结算奖励分。dead/cleared 状态或紧贴墙原地不动时
 * 忽略输入、不计步数。
 * @param state 游戏状态（就地更新）
 * @param dir 按下的方向
 * @returns 滑行结果；状态不允许滑行（已死/已过关/原地不动）时返回 null
 */
export declare function applySlide(state: IceState, dir: SlideDir): SlideResult | null;
/**
 * 撤回上一步滑行：位置、步数、宝石全部还原（不撤销死亡，死亡须重来）。
 * @returns 是否真的撤销了一步
 */
export declare function undoSlide(state: IceState): boolean;
/** 过关后进入下一关；最后一关过关则标记 finished。 */
export declare function advanceLevel(state: IceState): void;
