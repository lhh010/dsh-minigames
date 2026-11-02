/**
 * 弹弓复仇 (Slingshot) pure logic. 拖拽弹弓发射鸟弹轰塌堡垒：
 * 木/石/冰材质耐久各异，块碎裂后上方失去支撑的块与猪坠落，猪被
 * 直接命中、坠落着地或被落块砸中即消灭——全部消灭过关，剩弹定星。
 *
 * 物理从简但确定：固定子步（SUBSTEP_HZ），鸟为圆形刚体，块为轴对齐
 * 矩形（受撞扣耐久、碎裂消失、失支撑整块下落），猪为圆形（受冲击/
 * 坠落消灭）。关卡为手工参数表。
 */
export declare const W = 640;
export declare const H = 420;
export declare const GROUND_Y: number;
export declare const SUBSTEP_HZ = 240;
/** 弹弓锚点（拖拽发射参照 papertoss 模式）。 */
export declare const SLING: {
    x: number;
    y: number;
};
export declare const MIN_DRAG = 14;
export declare const MAX_DRAG = 160;
export declare const MAX_SPEED = 950;
export declare const GRAVITY = 900;
export declare const BALL_R = 10;
export declare const PIG_R = 13;
/** 冲击阈值：鸟命中速度低于它不造成伤害（轻擦）。 */
export declare const IMPACT_MIN = 90;
/** 材质：耐久与质量系数（石最硬最重、冰最脆最轻）。 */
export type Material = 'wood' | 'stone' | 'ice';
export interface MaterialSpec {
    readonly hp: number;
    readonly mass: number;
}
export declare const MATERIALS: Record<Material, MaterialSpec>;
/** 矩形块（静态受撞；失支撑后 vy>0 变为下落刚体）。 */
export interface Block {
    x: number;
    y: number;
    w: number;
    h: number;
    mat: Material;
    hp: number;
    /** 下落速度（0 = 静态支撑中）。 */
    vy: number;
    broken: boolean;
}
/** 猪：被直接命中 / 坠落着地 / 被落块砸中即消灭。 */
export interface Pig {
    x: number;
    y: number;
    vy: number;
    dead: boolean;
}
export type SlingshotEvent = {
    type: 'break';
    x: number;
    y: number;
    mat: Material;
} | {
    type: 'pig';
    x: number;
    y: number;
} | {
    type: 'launch';
    x: number;
    y: number;
} | {
    type: 'land';
    x: number;
    y: number;
};
export type Phase = 'aim' | 'flying' | 'won' | 'lost';
export interface SlingshotState {
    seed: number;
    level: number;
    phase: Phase;
    /** 关卡总弹数与已用弹数。 */
    birds: number;
    used: number;
    blocks: Block[];
    pigs: Pig[];
    /** 飞行中的鸟（null = 待发射）。 */
    bird: {
        x: number;
        y: number;
        vx: number;
        vy: number;
    } | null;
    events: SlingshotEvent[];
    stars: number;
}
/** mulberry32 PRNG：小、快、确定性。 */
export declare function mulberry32(seed: number): () => number;
/** 拖拽向量 → 发射初速（弹弓式）。 */
export declare function dragToVelocity(dx: number, dy: number): {
    vx: number;
    vy: number;
} | null;
/** 一块静态块的布局描述（关卡表用）。 */
export interface BlockSpec {
    x: number;
    y: number;
    w: number;
    h: number;
    mat: Material;
}
/** 关卡表：6 关，块布局 + 猪位 + 弹数。 */
export interface LevelSpec {
    blocks: readonly BlockSpec[];
    pigs: readonly {
        x: number;
        y: number;
    }[];
    birds: number;
}
export declare const LEVELS: readonly LevelSpec[];
/** 开一关。 */
export declare function createSlingshot(seed: number, level: number): SlingshotState;
/** 发射：设置鸟初速（phase 必须为 aim 且有剩弹）。 */
export declare function launch(state: SlingshotState, vx: number, vy: number): boolean;
/** 星级：剩弹 2+ 三星、1 二星、0 一星。 */
export declare function starsFor(state: SlingshotState): number;
/**
 * 推进一帧（内部按 SUBSTEP_HZ 固定子步）：鸟飞行与碰撞、块耐久与
 * 碎裂、失支撑检测（块/猪下落）、猪消灭、终局结算。
 */
export declare function stepSlingshot(state: SlingshotState, dtMs: number): void;
/** 包装 step：物理后结算终局（导出给测试用的纯入口）。 */
export declare function stepAndJudge(state: SlingshotState, dtMs: number): void;
