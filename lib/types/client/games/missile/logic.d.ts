/**
 * 导弹指令（Missile）纯逻辑：底部中央炮台发射拦截弹，在目标点引爆成
 * 半径 46px、持续 0.9s 的膨胀-收缩爆炸球；敌方导弹以 seed 确定性弹道
 * 从顶部向地面六座城市线性斜落，波次≥3 后部分弹中途分裂（MIRV）成
 * 2 发。来袭弹碰到爆炸球即摧毁得分；城市被命中即毁，全毁结束；每波
 * 结束奖励城市 +1（上限 6），共 6 波。模拟以固定子步（SUB_MS）推进，
 * 帧间隔先入累加器、再按整数子步消费，同一输入时间线重放逐位一致。
 * 时间单位毫秒，速度单位 px / s。
 */
/** 逻辑画布尺寸。 */
export declare const W = 520;
export declare const H = 360;
/** 地面 y（城市与炮台所在的基线）。 */
export declare const GROUND_Y = 336;
/** 六座城市的中心 x（相对画布左右对称，中央为炮台）。 */
export declare const CITY_XS: number[];
/** 城市命中半宽 px（来袭弹落点距城市中心小于该值即命中）。 */
export declare const CITY_HALF = 14;
/** 炮台位置。 */
export declare const BATTERY_X: number;
export declare const BATTERY_Y = 336;
/** 爆炸球最大半径 px 与持续时长 ms。 */
export declare const EXPLOSION_R = 46;
export declare const EXPLOSION_MS = 900;
/** 拦截弹速度 px/s 与同时在飞上限。 */
export declare const INTERCEPTOR_SPEED = 340;
export declare const MAX_INTERCEPTORS = 4;
/** 总波数。 */
export declare const WAVES = 6;
/** 波间奖励停顿 ms。 */
export declare const INTERMISSION_MS = 1600;
/** 波开始横幅展示 ms。 */
export declare const BANNER_MS = 1400;
/** 固定模拟子步 ms。 */
export declare const SUB_MS = 8;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 一枚来袭弹（或分裂后的子弹）的确定性弹道描述。 */
export interface EnemyMissile {
    /** 发射点（顶部）。 */
    sx: number;
    sy: number;
    /** 目标点（城市附近的地基线）。 */
    tx: number;
    ty: number;
    /** 航速 px/s（沿起点-终点直线匀速）。 */
    speed: number;
    /** 波开始后多少 ms 出发（0 = 立即）。 */
    spawnAt: number;
    /** 行程进度 0..1（对起点-终点全长的比例）。 */
    progress: number;
    /** 分裂点进度（1 = 不分裂）；到达即移除本弹并生成两发子弹。 */
    splitAt: number;
    /** 分裂子弹 1 的目标点（不分裂时无效）。 */
    c1x: number;
    c1y: number;
    /** 分裂子弹 2 的目标点。 */
    c2x: number;
    c2y: number;
}
/** 一发拦截弹：从炮台直线飞向目标点，到达即引爆。 */
export interface Interceptor {
    x: number;
    y: number;
    tx: number;
    ty: number;
    /** 航向单位向量 ×speed 的速度分量。 */
    vx: number;
    vy: number;
    /** 剩余直线距离 px（≤0 即引爆）。 */
    remain: number;
}
/** 一个爆炸球：以 (x,y) 为中心按时间膨胀再收缩。 */
export interface Explosion {
    x: number;
    y: number;
    /** 已持续 ms。 */
    t: number;
}
/** 阶段：防守中 / 城市全毁结束 / 六波防守成功。 */
export type MissilePhase = 'playing' | 'over' | 'won';
/** 单帧内产生、供渲染层消费的可视事件。 */
export type MissileEvent = {
    type: 'intercept';
    x: number;
    y: number;
} | {
    type: 'cityHit';
    index: number;
    x: number;
    y: number;
} | {
    type: 'groundHit';
    x: number;
    y: number;
} | {
    type: 'waveClear';
    wave: number;
};
/** 一局游戏的完整可测状态。 */
export interface MissileState {
    seed: number;
    /** 回合内已流逝 ms（星空闪烁等动画用）。 */
    t: number;
    /** 当前波次 1..WAVES。 */
    wave: number;
    /** 波开始后已流逝 ms（横幅 / 出击调度）。 */
    waveT: number;
    /** 波间停顿剩余 ms（>0 时不出击，结束瞬间开下一波）。 */
    interT: number;
    /** 六座城市存活标记（索引对应 CITY_XS）。 */
    cities: boolean[];
    score: number;
    phase: MissilePhase;
    /** 待出击（按 spawnAt 排序）与已在空的来袭弹。 */
    pending: EnemyMissile[];
    enemies: EnemyMissile[];
    interceptors: Interceptor[];
    explosions: Explosion[];
    /** 子步累加器 ms。 */
    acc: number;
    events: MissileEvent[];
    /** 波次随机流（每波 buildWave 消费一次）。 */
    rng: () => number;
    /** 下一个来袭弹编号（分裂子弹延续编号，供调试）。 */
    nextId: number;
}
/**
 * 爆炸球在 t ms 时刻的半径：正弦膨胀-收缩，两端为 0、中点最大
 * EXPLOSION_R，时长外恒为 0。
 * @param tMs - 爆炸已持续时间 ms。
 * @returns 当前半径 px。
 */
export declare function explosionRadius(tMs: number): number;
/** 来袭弹在当前进度下的弹头位置（起点-终点线性插值）。 */
export declare function enemyPos(m: EnemyMissile): {
    x: number;
    y: number;
};
/**
 * 生成一波来袭弹（seed 流确定性）：数量 3+wave，起点在顶部随机、目标
 * 从存活城市中随机、航速随波次提升并带随机散布、出击时间错开；波次
 * ≥3 时约 30% 的弹在行程 35%-60% 处分裂成 2 发（子弹目标同样预决定，
 * 保证与运行时城市状态无关的可重放确定性）。
 * @param rng - 本波的随机流（调用方状态内持有）。
 * @param wave - 波次 1..WAVES。
 * @param cities - 城市存活标记（目标只从存活城市中选）。
 * @returns 按 spawnAt 升序的待出击弹列表。
 */
export declare function buildWave(rng: () => number, wave: number, cities: boolean[]): EnemyMissile[];
/**
 * 新开一局：六城俱在、第 1 波来袭弹已按种子生成。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export declare function createMissile(seed: number): MissileState;
/**
 * 发射一枚拦截弹：从炮台直线飞向目标点，到达即引爆（playing 且在飞
 * 数未达上限时有效）。
 * @param state - 目标状态。
 * @param tx - 目标点 x（画布任意位置）。
 * @param ty - 目标点 y。
 * @returns 是否成功发射。
 */
export declare function fireMissile(state: MissileState, tx: number, ty: number): boolean;
/**
 * 推进一帧：dt 先入累加器，再按 SUB_MS 固定子步消费（同一输入时间线
 * 重放逐位一致）；事件写入 state.events，每帧开头清空；结束后只走时钟。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepMissile(state: MissileState, dtMs: number): void;
