/**
 * 弹弓复仇 (Slingshot) pure logic. 拖拽弹弓发射鸟弹轰塌堡垒：
 * 木/石/冰材质耐久各异，块被撞碎裂后上方块自然下落、倾倒，猪被
 * 直接命中、坠落着地或被落块砸中即消灭——全部消灭过关，剩弹定星。
 *
 * 物理为愤怒的小鸟式 2D 刚体：块为任意朝向的矩形（OBB），带中心
 * 位置、线速度、角度与角速度（质量 = 材质 mass × 面积 × 密度）；
 * 猪与鸟为圆。碰撞用 SAT（OBB-OBB 参考面/入射面裁剪出接触点，
 * 圆-盒取最近点）+ 序列冲量求解（累积法向冲量 + 库仑摩擦）+ 直接
 * 位置投影修正穿透（不给静止堆叠注入能量）；偏心冲量经转动惯量产
 * 生角速度，因此撞击可倾倒、抽走底块上方自然塌落。低速且有支撑的
 * 刚体休眠（速度清零、位移为零），失去接触或受冲量即唤醒。固定
 * 子步 (SUBSTEP_HZ) + 纯浮点运算保证同输入逐位一致的确定性重放。
 * 关卡开局做一次确定性落位：把表中互相嵌入/悬空的块去重叠、落到
 * 支撑面、重心对准支撑区间，再用真实子步预落座到全场休眠（LEVELS
 * 表本身不变，玩家看到的第一帧就是静止的堆叠）。
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
/** 冲击阈值：法向接近速度低于它不造成伤害（轻擦）。 */
export declare const IMPACT_MIN = 90;
/** 材质：耐久与质量系数（石最硬最重、冰最脆最轻）。 */
export type Material = 'wood' | 'stone' | 'ice';
export interface MaterialSpec {
    readonly hp: number;
    readonly mass: number;
}
export declare const MATERIALS: Record<Material, MaterialSpec>;
/** 矩形刚体块：x/y 为中心，可平移与旋转。 */
export interface Block {
    x: number;
    y: number;
    w: number;
    h: number;
    mat: Material;
    hp: number;
    vx: number;
    vy: number;
    angle: number;
    av: number;
    broken: boolean;
    /** 休眠：低速且有支撑持续时冻结速度，静止堆叠位移为零。 */
    asleep: boolean;
    /** 低速持续的子步计数。 */
    still: number;
}
/** 猪圆形刚体：被直接命中 / 坠落着地 / 被落块砸中即消灭。 */
export interface Pig {
    x: number;
    y: number;
    vx: number;
    vy: number;
    dead: boolean;
    asleep: boolean;
    still: number;
}
export interface BirdBody {
    x: number;
    y: number;
    vx: number;
    vy: number;
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
    bird: BirdBody | null;
    events: SlingshotEvent[];
    stars: number;
    /** 鸟低速持续的子步计数（滞留判定用）。 */
    birdSlow: number;
}
/** mulberry32 PRNG：小、快、确定性。 */
export declare function mulberry32(seed: number): () => number;
/** 拖拽向量 → 发射初速（弹弓式）。 */
export declare function dragToVelocity(dx: number, dy: number): {
    vx: number;
    vy: number;
} | null;
/** 一块静态块的布局描述（关卡表用，x/y 为左上角）。 */
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
/**
 * 推进一帧（内部按 SUBSTEP_HZ 固定子步）：刚体积分、碰撞冲量、
 * 耐久碎裂、猪消灭。
 */
export declare function stepSlingshot(state: SlingshotState, dtMs: number): void;
/** 开一关。 */
export declare function createSlingshot(seed: number, level: number): SlingshotState;
/** 发射：设置鸟初速（phase 必须为 aim 且有剩弹）。 */
export declare function launch(state: SlingshotState, vx: number, vy: number): boolean;
/** 星级：剩弹 2+ 三星、1 二星、0 一星。 */
export declare function starsFor(state: SlingshotState): number;
/** 包装 step：物理后结算终局（测试与主循环共用的纯入口）。 */
export declare function stepAndJudge(state: SlingshotState, dtMs: number): void;
