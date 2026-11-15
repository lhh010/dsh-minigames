/**
 * 拆弹专家（Defuse）纯逻辑：Keep Talking 式读规则剪线。每颗炸弹面板
 * 由 seed 确定性地生成：N 根彩线（红黄蓝绿白，4-7 根）+ 面板属性
 * （标记符号 / 序列号 / 电池数）+ 从 8 种规则池抽取的 2-3 张复合条件
 * 规则卡。规则对「面板事实」求值出必须剪 / 禁止剪的颜色集合；玩家
 * 剪断任一非应剪线 → 立即爆炸失败，剪完全部应剪线 → 拆除成功进入
 * 下一颗；倒计时归零 → 爆炸失败。5 颗炸弹递进（线数 / 规则数增加、
 * 时限收紧）。生成时验证规则互不矛盾且至少一根应剪线（保证有解）。
 * 所有随机走注入 seed（mulberry32），同 seed 同局数轨迹完全一致。
 */
/** 逻辑画布尺寸（含 HUD 区域）。 */
export declare const W = 480;
export declare const H = 640;
/** 总炸弹数（过关数）。 */
export declare const MAX_BOMBS = 5;
/** 每根应剪线正确剪断的得分。 */
export declare const CUT_SCORE = 15;
/** 每颗炸弹拆除得分。 */
export declare const BOMB_SCORE = 120;
/** 五颗全拆的胜利加分。 */
export declare const WIN_SCORE = 200;
/** 拆除成功→下一颗的过渡动画时长 ms（期间计时冻结、输入忽略）。 */
export declare const DEFUSE_MS = 800;
/** 线缆颜色（固定五种）。 */
export type WireColor = 'red' | 'yellow' | 'blue' | 'green' | 'white';
/** 全部线缆颜色（渲染与生成共用顺序）。 */
export declare const WIRE_COLORS: readonly WireColor[];
/** 颜色的中文名（规则文本 / 图例用）。 */
export declare const WIRE_LABEL: Record<WireColor, string>;
/** 面板可能出现的标记符号（'' 表示无标记；仅 ★ 计为星标）。 */
export declare const MARKS: readonly string[];
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 第 bombIndex 颗炸弹的线数（4,5,6,7,7 递进，上限 7）。
 * @param bombIndex - 炸弹号（0 起）。
 * @returns 线缆数量。
 */
export declare function wiresFor(bombIndex: number): number;
/**
 * 第 bombIndex 颗炸弹的规则卡数（2,2,3,3,3 递进）。
 * @param bombIndex - 炸弹号（0 起）。
 * @returns 规则数量（2-3）。
 */
export declare function rulesFor(bombIndex: number): number;
/**
 * 第 bombIndex 颗炸弹的倒计时 ms（60s → 36s 收紧）。
 * @param bombIndex - 炸弹号（0 起）。
 * @returns 时限毫秒数。
 */
export declare function timeFor(bombIndex: number): number;
/** 规则卡的八种类型（条件 → 必须剪 / 禁止剪某颜色）。 */
export type DefuseRule = {
    type: 'noStarCutRed';
} | {
    type: 'evenBlueForbidGreen';
} | {
    type: 'dupLetterForbidRedYellow';
} | {
    type: 'batteries2CutYellow';
} | {
    type: 'oddWiresCutLast';
} | {
    type: 'noWhiteForbidBlue';
} | {
    type: 'singleGreenCutGreen';
} | {
    type: 'oddBatteriesCutBlue';
};
/** 全部规则类型池（生成时按 seed 抽取不重复的子集）。 */
export declare const RULE_POOL: readonly DefuseRule['type'][];
/** 由面板属性派生的事实（规则条件的求值输入）。 */
export interface PanelFacts {
    /** 线数。 */
    wireCount: number;
    /** 各颜色线数。 */
    colorCount: Record<WireColor, number>;
    /** 是否有 ★ 标记。 */
    hasStar: boolean;
    /** 序列号字母部分是否含重复字母。 */
    duplicateLetter: boolean;
    /** 电池数。 */
    batteries: number;
    /** 最右一根线的颜色。 */
    lastColor: WireColor;
}
/** 一颗炸弹的完整面板（生成时已验证有解且规则互不矛盾）。 */
export interface DefuseBomb {
    /** 线缆颜色序列（左→右）。 */
    wires: WireColor[];
    /** 标记符号（'' 为无标记）。 */
    mark: string;
    /** 序列号（3 字母 + 2 数字）。 */
    serial: string;
    /** 电池数（0-3）。 */
    batteries: number;
    /** 规则卡（类型不重复）。 */
    rules: DefuseRule[];
    /** 面板事实（求值结果随面板固定）。 */
    facts: PanelFacts;
    /** 各线是否应剪（条件求值 + 禁止优先的最终判定）。 */
    mustCut: boolean[];
}
/** 规则求值结果：必须剪 / 禁止剪的颜色集合。 */
export interface RuleVerdict {
    mustColors: WireColor[];
    forbidColors: WireColor[];
}
/**
 * 由面板派生规则求值所需的事实。
 * @param wires - 线缆颜色序列。
 * @param mark - 标记符号。
 * @param serial - 序列号。
 * @param batteries - 电池数。
 * @returns 面板事实。
 */
export declare function panelFacts(wires: WireColor[], mark: string, serial: string, batteries: number): PanelFacts;
/**
 * 对面板事实求值一组规则：条件成立的规则把其颜色并入必须剪 / 禁止剪
 * 集合（oddWiresCutLast 的颜色取事实里的最右线颜色）。
 * @param rules - 规则卡数组。
 * @param facts - 面板事实。
 * @returns 必须剪与禁止剪的颜色集合。
 */
export declare function evaluateRules(rules: DefuseRule[], facts: PanelFacts): RuleVerdict;
/**
 * 规则卡的展示文本（条件 → 结论）。
 * @param rule - 规则卡。
 * @returns 中文规则文本。
 */
export declare function ruleText(rule: DefuseRule): string;
/**
 * 规则卡图例涉及的颜色（条件里的参照色不算，只列结论色）。
 * @param rule - 规则卡。
 * @param facts - 面板事实（oddWiresCutLast 需要最右线颜色）。
 * @returns 图例颜色数组。
 */
export declare function ruleColors(rule: DefuseRule, facts: PanelFacts): WireColor[];
/**
 * 生成第 bombIndex 颗炸弹：seed 确定性抽线 / 属性 / 规则，并验证
 * （至少一根应剪线、无颜色同时落在必须剪与禁止剪集合）；不合法则
 * 用同一 rng 继续抽取重试（上限 400 次，实践中数次内命中）。
 * @param seed - 本局种子。
 * @param round - 局数。
 * @param bombIndex - 炸弹号（0 起）。
 * @returns 已验证有解的炸弹面板。
 */
export declare function buildBomb(seed: number, round: number, bombIndex: number): DefuseBomb;
/** 单步内产生、供渲染层消费的可视事件。 */
export type DefuseEvent = {
    type: 'cut';
    wire: number;
} | {
    type: 'defuse';
    bomb: number;
} | {
    type: 'bomb';
    bomb: number;
} | {
    type: 'explode';
} | {
    type: 'win';
};
/** 一局游戏的完整可测状态。 */
export interface DefuseState {
    /** 本局种子与局数（生成依赖，保持确定性）。 */
    seed: number;
    round: number;
    /** 回合内已流逝 ms。 */
    t: number;
    score: number;
    /** 当前炸弹号（0 起；拆完第 MAX_BOMBS 颗即胜利）。 */
    bombIndex: number;
    /** 五颗炸弹（开局一次性生成）。 */
    bombs: DefuseBomb[];
    /** 当前炸弹各线是否已剪断。 */
    cut: boolean[];
    /** 当前炸弹剩余 ms。 */
    timeLeft: number;
    /** 拆除过渡剩余 ms（>0 时计时冻结、输入忽略）。 */
    defuseMs: number;
    events: DefuseEvent[];
    over: boolean;
    won: boolean;
}
/**
 * 新开一局：同 seed 同 round 的整局轨迹完全一致。
 * @param seed - 外部种子。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createDefuse(seed: number, round?: number): DefuseState;
/**
 * 剪断一根线：已剪 / 结束 / 过渡中忽略；剪到非应剪线立即爆炸失败；
 * 剪到应剪线记分，全部应剪线剪完进入拆除过渡。
 * @param state - 目标状态。
 * @param index - 线缆索引（0 起，左→右）。
 */
export declare function cutWire(state: DefuseState, index: number): void;
/**
 * 推进一帧：倒计时归零即爆炸；拆除过渡结束后装配下一颗炸弹或胜利。
 * 事件写入 state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepDefuse(state: DefuseState, dtMs: number): void;
/**
 * 当前炸弹还需剪的应剪线数量（HUD 进度用，不泄露具体线位）。
 * @param state - 当前状态。
 * @returns 剩余应剪线数量。
 */
export declare function remainingMustCuts(state: DefuseState): number;
