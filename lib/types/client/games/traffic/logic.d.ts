/**
 * 交叉路口 (Traffic) 纯逻辑：一个十字路口，四个方向来车（seed 泊松流，
 * 速率随时间上升），玩家切换信号灯相位（NS 绿 / EW 绿）。绿灯方向的车
 * 前进，红灯方向排队（跟车模型保持车距减速）；相位切换走 绿 → 黄(固定
 * 1.5s) → 全红(1.2s) → 对向绿 的状态机。黄灯亮起瞬间，刹不住的车被
 * 一次性标记为 committed（越线通过），其余必须在停止线前刹停；若
 * committed 车尚未清空路口而玩家反复切换，仍可能与对向车相撞。两车
 * 矩形重叠 = 事故结束；任一方向排队超过拥堵阈值 = 结束。所有随机都走
 * 注入 seed 的 mulberry32，同一 seed 下逐步重放完全确定。
 */
/** mulberry32 伪随机数生成器：小而快，同 seed 序列确定。 */
export declare function mulberry32(seed: number): () => number;
/** 车长（沿行驶方向，逻辑像素）。 */
export declare const CAR_LEN = 32;
/** 车宽（垂直行驶方向，逻辑像素）。 */
export declare const CAR_W = 22;
/** 巡航最高速度（px/s）。 */
export declare const MAX_SPEED = 70;
/** 自由加速率（px/s^2）。 */
export declare const ACCEL = 55;
/** 紧急制动率（px/s^2），用于已经贴上障碍的硬刹。 */
export declare const HARD_BRAKE = 160;
/** 舒适制动减速度 px/s²（安全判定用）。 */
export declare const COMFORT_BRAKE = 60;
/** 跟车安全净距 px（车头到障碍）。 */
export declare const CAR_GAP = 10;
/** 车道全程长度：从入口边缘到出口边缘（逻辑像素）。 */
export declare const LANE_LEN = 800;
/** 路口中心坐标。 */
export declare const CENTER = 400;
/** 路口半宽（单条道路宽 128 = 两条车道）。 */
export declare const ROAD_HALF = 64;
/** 路口占用车流坐标区间 [I0, I1]。 */
export declare const I0: number;
export declare const I1: number;
/** 停止线位置（路口进入边缘前 6px）。 */
export declare const STOP_LINE: number;
/** 黄灯时长（s，固定）。 */
export declare const YELLOW_S = 1.5;
/** 全红缓冲时长（s）：黄灯后两轴皆红，放行前清空路口。 */
export declare const ALL_RED_S = 1.2;
/** 最短绿灯时长（s）：切换请求在此之前被拒绝。 */
export declare const MIN_GREEN_S = 3;
/** 单方向排队拥堵阈值：超过即结束。 */
export declare const CONGEST_LIMIT = 7;
/**
 * 黄灯亮起瞬间的"刹不住"系数：距停止线不足 v*T 且车速够快的车被标记
 * committed，越线继续通过（此时切换对玩家有风险，需自行把握时机）。
 */
export declare const CAN_STOP_TIME = 0.8;
/** 只有高于该速度的车才可能被标记 committed（慢车总能停下）。 */
export declare const COMMIT_MIN_V = 30;
/** 方向编号：0=北（自上而下）1=南（自下而上）2=西（自左向右）3=东（自右向左）。 */
export type Dir = 0 | 1 | 2 | 3;
/** 信号相位：南北向绿或东西向绿。 */
export type SignalPhase = 'NS' | 'EW';
/** 灯色状态：正常绿、黄灯过渡、全红缓冲。 */
export type LightState = 'green' | 'yellow' | 'allred';
/** 一辆车：pos 为车头沿车流方向的里程（0=入口边缘），v 为速度。 */
export interface TrafficCar {
    pos: number;
    v: number;
    /** 配色索引（render 取 accent 用）。 */
    hue: number;
    /** 黄灯亮起瞬间标记的"刹不住、越线通过"；该轴回到绿灯时清除。 */
    committed: boolean;
}
/** 完整对局状态；stepTraffic 每次推进一个 dt。 */
export interface TrafficState {
    cars: TrafficCar[][];
    phase: SignalPhase;
    light: LightState;
    /** 黄灯/全红剩余时间（s）。 */
    phaseTimer: number;
    /** 当前绿灯已持续时长（s）。 */
    greenElapsed: number;
    nextSpawn: number[];
    time: number;
    passed: number;
    score: number;
    over: null | 'crash' | 'congestion';
    /** 事故发生点（路口坐标系），无事故为 null。 */
    crashAt: {
        x: number;
        y: number;
    } | null;
    /** 注入的随机源（重放确定性由 seed 保证）。 */
    rng: () => number;
}
/** 方向所属的信号轴。 */
export declare function dirAxis(dir: Dir): SignalPhase;
/** 某方向当前面对的灯色：本轴绿灯为 green，本轴黄灯为 yellow，其余 red。 */
export declare function signalOpen(state: TrafficState, dir: Dir): 'green' | 'yellow' | 'red';
/**
 * 泊松间隔：速率 rate（车/s）下的指数分布间隔（s）。
 * @param rate - 该方向当前到达率。
 * @param rng - 注入随机源。
 */
export declare function spawnGap(rate: number, rng: () => number): number;
/** 某方向的到达率（车/s）：基础 0.16，随时间线性上升到 0.7 封顶。 */
export declare function trafficRate(time: number): number;
/**
 * 跟车加速度：距离障碍 dist 以内按运动学制动（恰好在障碍前停住），
 * 远处自由加速，速度到顶则保持。
 * @param v - 当前速度。
 * @param dist - 到障碍（前车尾部或停止线）的距离，Infinity 表示无约束。
 */
export declare function followAccel(v: number, dist: number): number;
/** 轴对齐矩形。 */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 两矩形是否重叠。 */
export declare function rectOverlap(a: Rect, b: Rect): boolean;
/** 路口箱体（两条道路的交集）。 */
export declare function intersectionBox(): Rect;
/** 一辆车在路口坐标系中的矩形（靠右行驶：北向车道在西侧等）。 */
export declare function carRect(car: TrafficCar, dir: Dir): Rect;
/** 车身中心（路口坐标系），用于粒子等效果。 */
export declare function carCenter(car: TrafficCar, dir: Dir): {
    x: number;
    y: number;
};
/**
 * 路口净空判定：给定轴的车是否有矩形仍占据路口箱体。
 * 黄灯结束后是否安全放行对向的依据。
 * @param state - 当前对局状态。
 * @param phase - 要检查的轴。
 */
export declare function intersectionClear(state: TrafficState, phase: SignalPhase): boolean;
/** 排队认定速度阈值 px/s：低于它算"卡住"（排队），行驶中的车不算。 */
export declare const STUCK_V = 10;
/** 某方向尚未越过停止线且低速卡住的车数（拥堵统计——只计真正的排队，
 * 行驶中的来车不计，绿波同时多辆在场不误判瘫痪）。 */
export declare function queueLen(state: TrafficState, dir: Dir): number;
/** 建立新对局：初始相位 NS 绿，各方向首次来车间隔由 seed 决定。 */
export declare function createTrafficState(seed: number): TrafficState;
/**
 * 玩家请求切换相位：黄灯/全红期间或最短绿灯未满时拒绝。接受时把
 * 当前绿轴上刹不住的车一次性标记 committed（越线通过）。
 * @param state - 当前对局状态。
 * @returns 是否接受了本次请求。
 */
export declare function requestSwitch(state: TrafficState): boolean;
/**
 * 推进一个时间步：泊松生成、信号状态机（绿→黄→全红→换轴）、跟车移动、
 * 清出计分、事故检测（异轴矩形重叠或同轴追尾）、拥堵判定。
 * @param state - 对局状态（就地修改）。
 * @param dt - 步长秒数。
 */
export declare function stepTraffic(state: TrafficState, dt: number): void;
/** 供测试/重放比较的轻量快照（不含随机源）。 */
export declare function snapshot(state: TrafficState): string;
