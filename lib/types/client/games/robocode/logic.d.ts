/**
 * 编程机器人 RoboCode 纯逻辑：关卡定义与解析、程序（基础指令 + 循环块）
 * 校验、循环展开与确定性逐步执行。无 DOM、无随机源——同一关卡与同一
 * 程序永远产出逐字段相同的执行轨迹，渲染层与测试都直接消费这份轨迹。
 */
/** 朝向枚举：0=北 1=东 2=南 3=西（右转为 +1 mod 4，左转为 +3 mod 4）。 */
export type Dir = 0 | 1 | 2 | 3;
/** 基础指令：前进、左转、右转、跳跃（跨一格坑/尖刺）、双格前进。 */
export type Op = 'F' | 'L' | 'R' | 'J' | 'F2';
/** 循环块开始记号，n 为重复次数（1..8）。 */
export interface LoopToken {
    loop: number;
}
/** 程序槽中的一个记号：基础指令、循环开始（LoopToken）或循环结束 'end'。 */
export type Token = Op | 'end' | LoopToken;
/** 格子类型编码（cells 数组元素）。 */
export declare const CELL_FLOOR = 0;
export declare const CELL_WALL = 1;
export declare const CELL_CHIP = 2;
export declare const CELL_GATE = 3;
export declare const CELL_SPIKE = 4;
export declare const CELL_PIT = 5;
/** 循环次数允许范围。 */
export declare const LOOP_MIN_N = 1;
export declare const LOOP_MAX_N = 8;
/** 循环最大嵌套层数。 */
export declare const MAX_NESTING = 2;
/** 关卡原始规格（字符串网格 + 约束 + 参考程序）。 */
export interface RoboLevelSpec {
    /** 关卡序号（从 0 起）。 */
    readonly id: number;
    /** 关卡名。 */
    readonly name: string;
    /** 等宽字符串网格：每行一个字符串，R=起点。 */
    readonly grid: readonly string[];
    /** 机器人初始朝向。 */
    readonly startDir: Dir;
    /** 指令槽上限（谜题核心约束）。 */
    readonly maxSlots: number;
    /** 总步数预算（运行期执行步数上限）。 */
    readonly budget: number;
    /** 参考程序（已验证可解）。 */
    readonly reference: readonly Token[];
}
/** 解析后的可执行关卡。 */
export interface RoboLevel {
    readonly id: number;
    readonly name: string;
    readonly w: number;
    readonly h: number;
    /** 格子类型（行优先，索引 y*w+x）。 */
    readonly cells: Uint8Array;
    readonly startX: number;
    readonly startY: number;
    readonly startDir: Dir;
    readonly maxSlots: number;
    readonly budget: number;
    /** 芯片总数。 */
    readonly chipsTotal: number;
    readonly reference: readonly Token[];
}
/**
 * 解析关卡规格为可执行关卡。
 * @param spec 原始规格（网格等宽、恰含一个 R 与一个 G、至少一枚芯片）。
 * @returns 解析后的关卡。
 * @throws 网格非法（不等宽 / 缺 R / 缺 G / 未知字符）时抛错——关卡是内置数据，错误应在加载期暴露。
 */
export declare function parseLevel(spec: RoboLevelSpec): RoboLevel;
/** 内置 10 关：直线收集 → 转向序列 → 必须用循环 → 嵌套循环 → 综合迷宫 → 长途跋涉 → 环形回路 → 险途折返 → 十芯巡检 → 终极考验。 */
export declare const ROBOCODE_LEVELS: readonly RoboLevelSpec[];
/**
 * 全部内置关卡（按序解析）。
 * @returns 解析后的关卡数组。
 */
export declare function getLevels(): RoboLevel[];
/**
 * 展开程序：消除循环块得到基础指令序列。
 * @param tokens 待展开的程序记号。
 * @returns 展开结果：ops 为指令序列，opToken[i] 为 ops[i] 来源槽位索引；结构非法（未闭合 / 多余 end / 嵌套超限 / 超出展开保护）返回 null。
 */
export declare function expandProgram(tokens: readonly Token[]): {
    ops: Op[];
    opToken: number[];
} | null;
/**
 * 校验程序是否可在该关卡运行。
 * @param level 提供槽位与预算约束的关卡。
 * @param tokens 待校验的程序。
 * @returns null 表示合法；否则为中文错误原因。
 */
export declare function validateProgram(level: RoboLevel, tokens: readonly Token[]): string | null;
/** 一步的事件类型：正常动作 / 拾取 / 过关 / 中断原因。 */
export type StepEvent = 'move' | 'turn' | 'jump' | 'pick' | 'win' | 'blocked' | 'spike' | 'budget';
/** 执行轨迹中的一步（事件后的机器人状态）。 */
export interface RunStep {
    /** 该步的基础指令。 */
    op: Op;
    /** 事件后所在格。 */
    x: number;
    y: number;
    /** 事件后朝向。 */
    dir: Dir;
    /** 事件类型。 */
    event: StepEvent;
    /** 事件后剩余芯片数。 */
    chipsLeft: number;
}
/** 一次程序执行的完整结果。 */
export interface RunResult {
    /** won=进入终点闸门；crashed=中途中断（撞墙/尖刺/预算）；incomplete=执行完毕但未过关。 */
    status: 'won' | 'crashed' | 'incomplete';
    /** 中文原因描述。 */
    reason: string;
    /** 逐步轨迹（含最后一步的中断/过关事件）。 */
    steps: RunStep[];
    /** 结束时机器人状态。 */
    x: number;
    y: number;
    dir: Dir;
    /** 结束时剩余芯片数。 */
    chipsLeft: number;
}
/**
 * 逐步执行展开后的指令序列。
 * 语义：F 撞墙/出界/坑/未开的闸门即中断；踩尖刺即中断；进入芯片格拾取；
 * 全部芯片拾取后闸门开启，踩入即过关；J 向前跳两格（中间格可以是坑/尖刺，
 * 不拾取其中芯片），落点为墙/坑/出界/未开闸门则中断，落点尖刺则中断。
 * @param level 目标关卡。
 * @param ops 展开后的指令序列。
 * @returns 完整执行结果（确定性：同输入同输出）。
 */
export declare function executeProgram(level: RoboLevel, ops: readonly Op[]): RunResult;
/** runProgram 的返回：合法时给出完整结果与 op→槽位映射。 */
export interface CompiledRun {
    /** null 表示可运行；否则为校验错误原因。 */
    error: string | null;
    /** 执行结果（error 非 null 时为 null）。 */
    result: RunResult | null;
    /** 展开后第 i 条指令对应的槽位索引（运行进度高亮用）。 */
    opToken: number[];
}
/**
 * 校验并执行一段槽位程序（编辑器到轨迹的一步到位入口）。
 * @param level 目标关卡。
 * @param tokens 槽位记号。
 * @returns 校验错误或确定性执行结果。
 */
export declare function runProgram(level: RoboLevel, tokens: readonly Token[]): CompiledRun;
