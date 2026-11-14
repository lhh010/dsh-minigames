/**
 * 传送门（Portal）纯逻辑：2D 瓦片平台 + 蓝橙双门解谜。固定子步确定性
 * 物理（重力 / 跳跃 / 瓦片 AABB 碰撞）；传送门只能贴在竖直墙面（墙瓦片
 * 的左 / 右侧面），进入一门从另一门射出且速度大小守恒：同朝向门对把
 * 速度整体取反（下落动能翻转为上升——深渊弹射），对朝向门对速度保持
 * 不变（平移穿越）。尖刺 / 激光瓦片与坠出底部即失败，触到出口旗帜即
 * 过关。全部函数纯确定，时间毫秒，物理 px/s；世界坐标 y 向下增大。
 */
/** 瓦片边长 px。 */
export declare const TILE = 32;
/** 关卡列数。 */
export declare const COLS = 21;
/** 关卡行数。 */
export declare const ROWS = 20;
/** 逻辑画布宽 px（COLS * TILE）。 */
export declare const W: number;
/** 逻辑画布高 px（ROWS * TILE）。 */
export declare const H: number;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 1800;
/** 起跳速度 px/s（向上为负；最大跳高 ≈ 114px < 4 瓦片）。 */
export declare const JUMP_VY = -640;
/** 横向操控加速度 px/s^2。 */
export declare const MOVE_ACC = 2000;
/** 横向速度上限 px/s。 */
export declare const MAX_VX = 240;
/** 无输入地面阻尼 px/s^2。 */
export declare const GROUND_DAMP = 1400;
/** 无输入空中阻尼 px/s^2（空中仍保留大部分动量，保证弹射弧线）。 */
export declare const AIR_DAMP = 200;
/** 下落终端速度 px/s。 */
export declare const MAX_FALL = 1000;
/** 角色半宽 px。 */
export declare const PLAYER_HALF_W = 11;
/** 角色半高 px。 */
export declare const PLAYER_HALF_H = 13;
/** 固定物理子步 ms（stepPortal 内部按此切分，保证确定性）。 */
export declare const SUBSTEP_MS = 8;
/** 传送门纵向半高 px（贴墙面的有效穿越区间）。 */
export declare const PORTAL_HALF_H = 28;
/** 传送后禁止再次传送的冷却 ms（防止出仓即被回吸）。 */
export declare const PORTAL_LOCK_MS = 160;
/** 轨迹残影最大采样数。 */
export declare const TRAIL_MAX = 36;
/**
 * mulberry32 确定性随机数发生器（逻辑本身不用随机；导出供渲染层的
 * 门粒子流与测试共用同一实现）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 瓦片种类：空 / 墙（实心，可贴门）/ 尖刺（致死）/ 激光（致死）。 */
export type TileKind = 'empty' | 'wall' | 'spike' | 'laser';
/** 传送门颜色（玩家持有一对门）。 */
export type PortalColor = 'blue' | 'orange';
/** 一扇已放置的传送门：贴在某墙瓦片的左或右侧面（竖直墙面）。 */
export interface Portal {
    /** 所贴墙瓦片列。 */
    col: number;
    /** 所贴墙瓦片行。 */
    row: number;
    /** 门外法线方向：+1 = 墙右侧面朝右，-1 = 墙左侧面朝左。 */
    dir: 1 | -1;
    /** 门面所在平面 x px。 */
    x: number;
    /** 门中心 y px（瓦片中心）。 */
    y: number;
}
/** 一关的手工瓦片图（ROWS 行 x COLS 列字符画）。 */
export interface PortalLevel {
    /** 关名（HUD 显示）。 */
    name: string;
    /** 行数组；字符：'#'墙 '.'空 'S'出生 'F'旗帜 '^'尖刺 '='激光。 */
    rows: string[];
}
/** 解析后的关卡：瓦片种类矩阵 + 出生点 + 旗帜位置。 */
export interface LevelInfo {
    /** 关名。 */
    name: string;
    /** tiles[row][col] 瓦片种类。 */
    tiles: TileKind[][];
    /** 出生瓦片列 / 行。 */
    spawnCol: number;
    spawnRow: number;
    /** 旗帜瓦片列 / 行。 */
    flagCol: number;
    flagRow: number;
}
/**
 * 手工关卡 x5，难度递进：简单穿越 → 深渊弹射（落差加速）→ 双门接力 →
 * 激光峡谷（弹射 + 激光墙）→ 终局双段（接力 + 弹射上旗）。
 */
export declare const LEVELS: PortalLevel[];
/**
 * 解析一关的字符画为瓦片矩阵；结构不合法（行数 / 列数 / 字符 / 出生
 * 点 / 旗帜数量）立即抛错，保证手工数组错误在加载期暴露。
 * @param level - 关卡定义。
 * @returns 解析后的关卡信息。
 */
export declare function parseLevel(level: PortalLevel): LevelInfo;
/**
 * 读瓦片种类；水平越界视为墙（边界封死），竖直越界视为空（可跳出
 * 上下边，坠出底部判负）。
 * @param info - 关卡信息。
 * @param col - 瓦片列。
 * @param row - 瓦片行。
 * @returns 瓦片种类。
 */
export declare function tileKind(info: LevelInfo, col: number, row: number): TileKind;
/**
 * 瓦片是否实心（墙）。
 * @param info - 关卡信息。
 * @param col - 瓦片列。
 * @param row - 瓦片行。
 * @returns 是否实心。
 */
export declare function isSolid(info: LevelInfo, col: number, row: number): boolean;
/**
 * 构造一扇门（调用方需先用 canPlacePortal 校验）。
 * @param col - 墙瓦片列。
 * @param row - 墙瓦片行。
 * @param dir - 外法线方向。
 * @returns 门数据。
 */
export declare function makePortal(col: number, row: number, dir: 1 | -1): Portal;
/**
 * 传送门放置合法性：只能贴竖直墙面——该瓦片必须是墙，且门朝向的相邻
 * 瓦片必须是空（地面 / 天花板水平面与悬空处都放不了），且不得与另一
 * 扇门抢同一墙面。
 * @param info - 关卡信息。
 * @param col - 目标墙瓦片列。
 * @param row - 目标墙瓦片行。
 * @param dir - 门朝向（+1 右侧面 / -1 左侧面）。
 * @param other - 另一扇已放置的门（可空）。
 * @returns 是否可放。
 */
export declare function canPlacePortal(info: LevelInfo, col: number, row: number, dir: 1 | -1, other: Portal | null): boolean;
/**
 * 传送速度映射：大小严格守恒。同朝向门对速度整体取反（下落翻转为上升
 * ——落差弹射）；对朝向门对速度保持不变（平移穿越）。
 * @param vx - 入门时横向速度。
 * @param vy - 入门时纵向速度。
 * @param dirA - 入门门外法线方向。
 * @param dirB - 出门门外法线方向。
 * @returns 出门速度分量。
 */
export declare function teleportVelocity(vx: number, vy: number, dirA: 1 | -1, dirB: 1 | -1): {
    vx: number;
    vy: number;
};
/** 阶段：进行中 / 失败（本关重来）/ 过关。 */
export type PortalPhase = 'playing' | 'dead' | 'won';
/** 单步内产生、供渲染层消费的可视事件。 */
export type PortalEvent = {
    type: 'warp';
    x: number;
    y: number;
    color: PortalColor;
} | {
    type: 'die';
    cause: 'spike' | 'laser' | 'fall';
    x: number;
    y: number;
} | {
    type: 'win';
    x: number;
    y: number;
} | {
    type: 'place';
    color: PortalColor;
    col: number;
    row: number;
};
/** 帧输入：左 / 右横移 + 跳跃（按住可在落地瞬间连跳）。 */
export interface PortalInput {
    left: boolean;
    right: boolean;
    jump: boolean;
}
/** 一局游戏的完整可测状态。 */
export interface PortalState {
    /** 注入种子（渲染动画相位派生用；物理无随机）。 */
    seed: number;
    /** 当前关卡下标。 */
    levelIndex: number;
    /** 当前关卡解析结果。 */
    info: LevelInfo;
    /** 对局内毫秒。 */
    t: number;
    /** 角色中心与速度。 */
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 是否踩地。 */
    grounded: boolean;
    /** 剩余跳数（落地回满 2——支持二段跳）。 */
    jumpsLeft: number;
    phase: PortalPhase;
    /** 阶段最近一次切换时的 t。 */
    phaseAt: number;
    /** 本关死亡次数（R 重开清零，死亡自增）。 */
    deaths: number;
    blue: Portal | null;
    orange: Portal | null;
    /** 传送冷却剩余 ms。 */
    lockMs: number;
    /** 本步事件（每次 stepPortal 开头清空）。 */
    events: PortalEvent[];
    /** 轨迹残影采样（最近在前）。 */
    trail: {
        x: number;
        y: number;
    }[];
}
/**
 * 新开一局（或切到某关）。
 * @param seed - 注入种子。
 * @param levelIndex - 起始关卡下标（默认 0）。
 * @param deaths - 携带的死亡计数（默认 0）。
 * @returns 初始状态（角色站在出生瓦片中心）。
 */
export declare function createPortalState(seed: number, levelIndex?: number, deaths?: number): PortalState;
/**
 * 重开当前关（死亡后自动 / 按 R 手动）。
 * @param state - 当前状态（原地重置，关卡与死亡策略由参数决定）。
 * @param countDeath - 是否计入一次死亡（自动重开计，手动 R 不计）。
 */
export declare function restartLevel(state: PortalState, countDeath: boolean): void;
/**
 * 放置 / 移动一扇传送门（非法位置直接忽略，不改状态）。
 * @param state - 当前状态。
 * @param col - 墙瓦片列。
 * @param row - 墙瓦片行。
 * @param dir - 门朝向。
 * @param color - 蓝门或橙门。
 * @returns 是否放置成功。
 */
export declare function placePortal(state: PortalState, col: number, row: number, dir: 1 | -1, color: PortalColor): boolean;
/**
 * 推进一帧：内部按 SUBSTEP_MS 切分为固定子步（确定性），非进行中只走
 * 时钟（供遮罩倒计时），并记录轨迹残影。
 * @param state - 当前状态（原地推进）。
 * @param dtMs - 帧时长 ms。
 * @param input - 本帧输入。
 */
export declare function stepPortal(state: PortalState, dtMs: number, input: PortalInput): void;
/**
 * 当前分值 = 已过关数（进行中为本关下标，过关瞬间为本关下标 + 1）。
 * @param state - 当前状态。
 * @returns 分值。
 */
export declare function portalScore(state: PortalState): number;
