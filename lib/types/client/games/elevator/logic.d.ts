/**
 * 电梯调度纯逻辑：10 层楼的乘客生成、电梯梯形速度曲线物理（固定子步）、
 * 到站停靠上下客、等待超时与满意度计分。全部是确定性的纯函数：随机只走
 * 注入的 rng（mulberry32 等），时间只由调用方传入的 dt 驱动，测试可用固定
 * 子步复现一切行为。
 */
/** 楼层总数（楼层编号 1..FLOORS）。 */
export declare const FLOORS = 10;
/** 电梯载客容量。 */
export declare const CAPACITY = 8;
/** 满意度初始值；归零游戏结束。 */
export declare const INITIAL_SATISFACTION = 20;
/** 乘客等待超时秒数；超时离开并扣分。 */
export declare const WAIT_TIMEOUT_S = 30;
/** 到站开门时长（上下客期间电梯停稳）。 */
export declare const DOOR_OPEN_S = 1;
/** 电梯加速度（层/秒²）。 */
export declare const ELEV_ACCEL = 2.5;
/** 电梯巡航最大速度（层/秒）。 */
export declare const ELEV_VMAX = 3;
/** 固定物理子步（秒）；所有模拟都按该步长推进，保证确定性。 */
export declare const SUBSTEP_S: number;
/** 场上等待乘客上限（超出后本子步不再生成）。 */
export declare const MAX_WAITING = 30;
/** 乘客/乘客目标方向。 */
export type Dir = 'up' | 'down';
/** 一名乘客：在 from 层等车想去 to 层。 */
export interface Passenger {
    id: number;
    from: number;
    to: number;
    /** 已等待秒数。 */
    waited: number;
}
/** 电梯运行阶段。 */
export type ElevatorPhase = 'idle' | 'moving' | 'doors';
export interface ElevatorState {
    /** 累计模拟时间（秒，只按子步增长）。 */
    t: number;
    /** 电梯连续位置（楼层坐标 1..FLOORS，可为小数）。 */
    pos: number;
    /** 速度大小（层/秒，恒 >= 0；方向由 target 推出）。 */
    vel: number;
    /** 玩家指定的目标层；null 表示无任务。 */
    target: number | null;
    /** 刚完成的一段行程方向（-1 下行 / 1 上行 / 0 原地），决定同方向上客。 */
    lastDir: -1 | 0 | 1;
    phase: ElevatorPhase;
    /** 开门剩余秒数（phase === 'doors' 时有效）。 */
    doorTimer: number;
    /** 各楼层等待中的乘客。 */
    waiting: Passenger[];
    /** 轿厢内的乘客。 */
    inside: Passenger[];
    satisfaction: number;
    /** 已送达人数（即分数）。 */
    delivered: number;
    /** 超时离开的乘客数。 */
    lost: number;
    over: boolean;
    /** 距离下一次生成乘客的秒数。 */
    spawnIn: number;
    nextId: number;
    /** 子步累加器：把任意帧 dt 切成固定 SUBSTEP_S 推进。 */
    subAcc: number;
    rng: () => number;
}
/** 由起讫层推出乘车方向。 */
export declare function dirOf(from: number, to: number): Dir;
/**
 * 生成下一个乘客到达间隔（指数分布；均值随时间缩短，人流越来越密）。
 * @param t - 当前模拟秒数。
 * @param rng - 注入的随机源。
 * @returns 距下一次生成的秒数（> 0）。
 */
export declare function nextSpawnInterval(t: number, rng: () => number): number;
/** 一局新游戏：电梯停在 1 层，无乘客，满意度满值。 */
export declare function createElevatorState(rng?: () => number): ElevatorState;
/**
 * 玩家输入：设定目标层（夹紧到 1..FLOORS）。
 * 关门状态下会排队，门关后即出发；选当前层会原地开门上下客。
 * @param state - 游戏状态（原地修改）。
 * @param floor - 玩家选择的目标层。
 */
export declare function setTarget(state: ElevatorState, floor: number): void;
/** 电梯所在的整数层（moving 中是最近楼层）。 */
export declare function currentFloor(state: ElevatorState): number;
/** 在某层等待的乘客（按生成顺序）。 */
export declare function waitingAt(state: ElevatorState, floor: number): Passenger[];
/**
 * 推进游戏：把 dt 切成固定 SUBSTEP_S 子步，依次执行电梯物理、乘客等待
 * 计时/超时/生成；满意度归零即结束。
 * @param state - 游戏状态（原地修改）。
 * @param dt - 帧间隔秒数（上游已夹紧）。
 */
export declare function stepElevator(state: ElevatorState, dt: number): void;
