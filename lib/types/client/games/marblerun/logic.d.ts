/**
 * 滚珠轨道 MarbleRun 纯逻辑：侧视网格上的轨道建造谜题求解器。玩家把
 * 有限库存的轨道件（直板 / 弯板 / 加速带 / 弹板）放置并旋转到网格空
 * 位，搭出一条从左上出珠口到右下目标杯的通路；释放后滚珠受重力沿轨
 * 道滚动（圆—线段碰撞 + 法向消除 + 切向保留 + 摩擦，加速带沿切向加
 * 速，弹板法向反弹增能），进入杯口过关，飞出边界、尖刺碰碎或低速停
 * 滞即失败。全部函数为纯函数或确定性状态机（不触碰 DOM / 计时器 /
 * Math.random，视觉噪声用注入 seed 的 mulberry32 派生），同输入必得
 * 同一结果，可离线单测。
 */
/**
 * mulberry32 确定性伪随机数生成器（物理本身不随机，仅关卡视觉噪声
 * 与渲染杂波使用，保证同 seed 同画面）。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0, 1) 区间随机数的函数；同种子必产出同一序列。
 */
export declare function mulberry32(seed: number): () => number;
/** 轨道件种类。 */
export type PieceKind = 'straight' | 'curveL' | 'curveR' | 'booster' | 'bumper';
/** 碰撞线段来源：轨道件种类或目标杯壁。 */
export type SegKind = PieceKind | 'wall';
/** 一个已放置的轨道件：网格格坐标 + 旋转档位（0 起，顺时针）。 */
export interface Placement {
    /** 列（0 起，向右增大）。 */
    x: number;
    /** 行（0 起，向下增大）。 */
    y: number;
    /** 件种类。 */
    kind: PieceKind;
    /** 旋转档位（对 pieceOrientations 取模后有效）。 */
    rot: number;
}
/** 一条碰撞线段（逻辑像素坐标，kind 决定接触行为）。 */
export interface Seg {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    kind: SegKind;
}
/** 一个尖刺障碍格。 */
export interface SpikeCell {
    x: number;
    y: number;
}
/** 一关的完整定义（手工模板，五关递进）。 */
export interface LevelDef {
    /** 关卡名（HUD 显示）。 */
    name: string;
    /** 视觉噪声种子（同 seed 同画面；不影响物理）。 */
    seed: number;
    /** 出珠口 X（逻辑像素，滚珠生成点）。 */
    spawnX: number;
    /** 出珠口 Y（逻辑像素）。 */
    spawnY: number;
    /** 出珠初速（水平向右，逻辑像素 / 秒）。 */
    spawnVX: number;
    /** 目标杯所在列。 */
    cupX: number;
    /** 目标杯所在行。 */
    cupY: number;
    /** 尖刺障碍格列表。 */
    spikes: SpikeCell[];
    /** 各类轨道件库存数量。 */
    inventory: Record<PieceKind, number>;
    /** 预置参考搭法（测试重放验证可解；也用作「卡关提示」基础）。 */
    reference: Placement[];
}
/** 网格列数。 */
export declare const COLS = 20;
/** 网格行数。 */
export declare const ROWS = 12;
/** 网格单元边长（逻辑像素）。 */
export declare const CELL = 36;
/** 滚珠半径（逻辑像素）。 */
export declare const MARBLE_R = 7;
/** 重力加速度（逻辑像素 / 秒²）。 */
export declare const GRAVITY = 900;
/** 固定物理子步（秒）。 */
export declare const SUB_DT: number;
/** 接触切向阻尼（每秒比例）。 */
export declare const FRICTION = 1.2;
/** 加速带沿切向加速度（逻辑像素 / 秒²）。 */
export declare const BOOST = 700;
/** 弹板反弹恢复系数（法向速度放大倍率）。 */
export declare const BUMPER_REST = 1.4;
/** 停滞判定速度阈值（逻辑像素 / 秒）。 */
export declare const STUCK_SPEED = 14;
/** 停滞判定累计秒数。 */
export declare const STUCK_TIME = 0.75;
/** 单次释放最长模拟秒数。 */
export declare const MAX_RUN_SECONDS = 15;
/** 尖刺命中圆半径（格内 0.5,0.75 处）。 */
export declare const SPIKE_R = 10;
/** 各件有效旋转档数（轮换时取模）。 */
export declare const PIECE_ORIENTATIONS: Record<PieceKind, number>;
/** 件种类的中文名（HUD 库存栏显示）。 */
export declare const PIECE_LABEL: Record<PieceKind, string>;
/** 全部件种类（固定顺序：库存栏 / 选择键 1-5）。 */
export declare const PIECE_KINDS: readonly PieceKind[];
/**
 * 一个轨道件产出的碰撞线段（逻辑像素）。
 * @param p - 放置信息。
 * @returns 线段列表（折线相邻点相连）。
 */
export declare function pieceSegments(p: Placement): Seg[];
/**
 * 目标杯的杯壁线段（左右壁 + 杯底，逻辑像素）。
 * @param level - 关卡定义。
 */
export declare function cupSegments(level: LevelDef): Seg[];
/**
 * 汇总全部碰撞线段（轨道件 + 杯壁）。
 * @param level - 关卡定义。
 * @param placements - 已放置轨道件。
 */
export declare function buildSegments(level: LevelDef, placements: readonly Placement[]): Seg[];
/**
 * 出珠口所在格（该格禁止放置）。
 * @param level - 关卡定义。
 */
export declare function spawnCell(level: LevelDef): {
    x: number;
    y: number;
};
/**
 * 某格是否为不可放置的封锁格（出珠口 / 目标杯 / 尖刺）。
 * @param level - 关卡定义。
 * @param cx - 列。
 * @param cy - 行。
 */
export declare function isBlockedCell(level: LevelDef, cx: number, cy: number): boolean;
/**
 * 汇总库存件总数。
 * @param inventory - 库存表。
 */
export declare function totalPieces(inventory: Readonly<Record<PieceKind, number>>): number;
/** 建造盘面：已放件 + 库存账目 + 撤回栈（确定性，可离线单测）。 */
export interface BoardState {
    /** 当前关卡序号（0 起）。 */
    levelIndex: number;
    /** 关卡定义（levelFor 的直接引用）。 */
    level: LevelDef;
    /** 已放置轨道件。 */
    placements: Placement[];
    /** 剩余库存。 */
    inventory: Record<PieceKind, number>;
    /** 撤回栈快照（placements + inventory 深拷贝）。 */
    history: {
        placements: Placement[];
        inventory: Record<PieceKind, number>;
    }[];
}
/** 放置校验失败原因。 */
export type PlaceReject = 'grid' | 'occupied' | 'blocked' | 'inventory';
/**
 * 建造盘面初始化（库存满额、棋盘为空）。
 * @param levelIndex - 关卡序号（越界钳制）。
 */
export declare function createBoard(levelIndex: number): BoardState;
/**
 * 轨道件放置合法性：格在盘面内、不与已有件重叠、不在封锁格（出珠
 * 口 / 杯 / 尖刺）、且该类库存 > 0。
 * @param board - 建造盘面。
 * @param cx - 列。
 * @param cy - 行。
 * @param kind - 件种类。
 * @returns 合法返回 null；否则返回失败原因。
 */
export declare function placeReject(board: BoardState, cx: number, cy: number, kind: PieceKind): PlaceReject | null;
/**
 * 放置一个轨道件（成功时记账并压入撤回栈）。
 * @param board - 建造盘面（就地修改）。
 * @param cx - 列。
 * @param cy - 行。
 * @param kind - 件种类。
 * @param rot - 旋转档位。
 * @returns 合法返回 null；否则返回失败原因（盘面不变）。
 */
export declare function placePiece(board: BoardState, cx: number, cy: number, kind: PieceKind, rot: number): PlaceReject | null;
/**
 * 找到某格上的件下标。
 * @param board - 建造盘面。
 * @param cx - 列。
 * @param cy - 行。
 */
export declare function pieceAt(board: BoardState, cx: number, cy: number): number;
/**
 * 把某格的件移回库存（全额返还，可撤回）。
 * @param board - 建造盘面（就地修改）。
 * @param cx - 列。
 * @param cy - 行。
 * @returns 命中并移除返回 true。
 */
export declare function removePieceAt(board: BoardState, cx: number, cy: number): boolean;
/**
 * 旋转某格的件（档位 +1 后取模）。
 * @param board - 建造盘面（就地修改）。
 * @param cx - 列。
 * @param cy - 行。
 * @returns 命中并旋转返回 true。
 */
export declare function rotatePieceAt(board: BoardState, cx: number, cy: number): boolean;
/**
 * 撤回上一步建造操作（放置 / 移除 / 旋转的逆操作）。
 * @param board - 建造盘面（就地修改）。
 * @returns 有可撤回步返回 true。
 */
export declare function undo(board: BoardState): boolean;
/** 释放结果：running 进行中；won 入杯；out 出界；stuck 停滞；shattered 碎于尖刺。 */
export type RunOutcome = 'running' | 'won' | 'out' | 'stuck' | 'shattered';
/** 一次释放的确定性物理世界。 */
export interface RunWorld {
    /** 滚珠位置（逻辑像素）。 */
    px: number;
    py: number;
    /** 滚珠速度（逻辑像素 / 秒）。 */
    vx: number;
    vy: number;
    /** 拖尾采样点（旧→新，最多 TRAIL_MAX 个）。 */
    trail: {
        x: number;
        y: number;
    }[];
    /** 结果。 */
    outcome: RunOutcome;
    /** 已模拟秒数。 */
    time: number;
    /** 低速累计秒数（停滞判定）。 */
    stuckFor: number;
    /** 碰撞线段（创建时固定）。 */
    segments: Seg[];
    /** 关卡定义引用。 */
    level: LevelDef;
}
/** 拖尾最多采样点数。 */
export declare const TRAIL_MAX = 24;
/**
 * 创建一次释放世界（滚珠在出珠口以 spawnVX 水平射出）。
 * @param level - 关卡定义。
 * @param placements - 玩家放置的轨道件。
 */
export declare function createRun(level: LevelDef, placements: readonly Placement[]): RunWorld;
/**
 * 目标杯获胜区（逻辑像素矩形：杯口内、杯身中部）。
 * @param level - 关卡定义。
 */
export declare function cupWinZone(level: LevelDef): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
};
/**
 * 推进物理若干秒（内部按固定 SUB_DT 子步，确定性）。
 * @param w - 释放世界（就地修改）。
 * @param dtSeconds - 推进秒数（自动拆子步；结果与调用切分方式无关）。
 */
export declare function stepRun(w: RunWorld, dtSeconds: number): void;
/**
 * 一步模拟到出结果（测试 / 参考搭法验证用）。
 * @param level - 关卡定义。
 * @param placements - 轨道件布局。
 * @param maxSeconds - 模拟上限秒数（默认 MAX_RUN_SECONDS）。
 * @returns 结果世界（outcome / time / 末位置可查）。
 */
export declare function simulate(level: LevelDef, placements: readonly Placement[], maxSeconds?: number): RunWorld;
/**
 * 过关得分：关底基础分 + 剩余库存件奖励。
 * @param levelIndex - 关卡序号（0 起）。
 * @param leftover - 剩余库存件总数。
 */
export declare function scoreFor(levelIndex: number, leftover: number): number;
/**
 * 五关模板。每关 reference 是预置参考搭法（tests 重放验证必胜）；库存
 * 逐关收紧（L4/L5 与参考用量恰好相等——每块板都得用在刀刃上），L3 起
 * 加入尖刺障碍。seed 只驱动视觉噪声，不影响物理确定性。
 */
export declare const LEVELS: readonly LevelDef[];
/**
 * 取关卡定义（序号越界钳制到首尾）。
 * @param index - 关卡序号（0 起）。
 */
export declare function levelFor(index: number): LevelDef;
