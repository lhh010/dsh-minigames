/**
 * 音乐盒纯逻辑：程序化生成五声音阶短旋律，玩家逐音点击复现，错一位扣
 * 一命。全部随机来自注入的 seed（mulberry32），同一 seed 完全可重放；
 * 本层只做序列与判定，不接触 DOM、音频与计时器。
 */
/** 七个唱名音级（do..si，大调音阶的级数）。 */
export declare const SCALE = 7;
/** 唱名显示文本，下标即音级。 */
export declare const SOLFEGE: readonly ["do", "re", "mi", "fa", "sol", "la", "si"];
/** 大调五声音阶在七音级中的位置：do re mi sol la。 */
export declare const PENTATONIC: readonly [0, 1, 2, 4, 5];
/** 总关数。 */
export declare const MAX_LEVEL = 5;
/** 初始命数。 */
export declare const START_LIVES = 3;
/** 每局可用提示次数。 */
export declare const MAX_HINTS = 2;
/** 从第几关起可能生成和弦（两音同拍）。 */
export declare const CHORD_LEVEL = 4;
/** 和弦出现的概率（和弦关）。 */
export declare const CHORD_CHANCE = 0.35;
/** 每答对一个音的基础分。 */
export declare const NOTE_SCORE = 10;
/** 过关奖励 = 关数 * LEVEL_BONUS。 */
export declare const LEVEL_BONUS = 50;
/**
 * mulberry32 确定性伪随机数发生器（闭包，返回 [0,1)）。
 * @param seed - 非负整数种子。
 * @returns 产生确定性随机序列的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 旋律中的一拍：一个主音，和弦拍再带一个和声音（notes 长度 1 或 2）。 */
export interface MelodyStep {
    /** 本拍需要点击的音级集合（升序）。 */
    notes: number[];
    /** 时值：1 短拍或 2 长拍。 */
    beats: 1 | 2;
}
export type MusicBoxPhase = 'listening' | 'input' | 'level-clear' | 'game-over' | 'complete';
/** 一局的可判定状态；index 层负责计时、音频与动画。 */
export interface MusicBoxState {
    phase: MusicBoxPhase;
    /** 当前关（1..MAX_LEVEL）。 */
    level: number;
    /** 当前关要复现的旋律。 */
    melody: MelodyStep[];
    /** 玩家正在复现的拍下标。 */
    inputIndex: number;
    /** 每一拍已填音级的掩码：bit k 对应 melody[i].notes[k]。 */
    slotFilled: number[];
    lives: number;
    score: number;
    hintsLeft: number;
    /** 提示揭示的当前拍剩余待填音级，null 表示无提示。 */
    hintNotes: number[] | null;
    /** 本关剩余可播放次数。 */
    playsLeft: number;
    /** 创建本局时注入的 seed（重放开局用）。 */
    seed: number;
    /** 派生随机源；同一 seed 下逐关演化一致。 */
    rng: () => number;
}
/** 某关的旋律长度：5 音（第 1 关）到 9 音（第 5 关）。 */
export declare function levelLength(level: number): number;
/** 某关允许的播放次数（含开场自动播放）：3 3 2 2 1。 */
export declare function levelPlays(level: number): number;
/**
 * 生成某一关的旋律：五声音阶选音、节奏型三选一、和弦关可能加和声。
 * @param rng - 由 seed 派生的确定性随机源。
 * @param level - 关数。
 * @returns 新旋律数组。
 */
export declare function generateMelody(rng: () => number, level: number): MelodyStep[];
/**
 * 用 seed 开一局：第 1 关旋律就绪，处于待播放态。
 * @param seed - 非负整数种子；相同 seed 逐关生成完全相同的旋律。
 * @returns 初始状态。
 */
export declare function createMusicBoxState(seed: number): MusicBoxState;
/** 一次播放里的一个事件：某拍在 atMs 毫秒处响 durMs 毫秒。 */
export interface PlaybackEvent {
    slot: number;
    notes: number[];
    atMs: number;
    durMs: number;
}
/** 每一拍的基准时长（短拍），长拍翻倍。 */
export declare const BEAT_MS = 420;
/** 相邻两拍之间的额外间隙。 */
export declare const BEAT_GAP_MS = 140;
/**
 * 把旋律展开为按时间排序的播放事件表（index 层照此驱动音频与跳动动画）。
 * @param melody - 要播放的旋律。
 * @returns 事件数组，atMs 严格递增。
 */
export declare function buildPlayback(melody: MelodyStep[]): PlaybackEvent[];
/**
 * 开始一次播放：消耗一次播放机会并进入 listening 态。
 * @returns true 表示播放开始；false 表示本关次数已用完。
 */
export declare function startPlayback(state: MusicBoxState): boolean;
/**
 * 播放结束：切入输入态，从第一拍重新开始复现。
 * @returns true 表示成功切入 'input'。
 */
export declare function finishPlayback(state: MusicBoxState): boolean;
/** 当前拍尚未填的音级集合（按 notes 内顺序）。 */
export declare function remainingNotes(state: MusicBoxState): number[];
/**
 * 输入一个音级（点击音符条或按数字键）。
 * @returns 'ignored' 非输入态或非法音级；'correct' 填上一音但本拍未完；
 *   'slot-done' 本拍完成但旋律未完；'level-clear' 整段复现成功；
 *   'miss' 答错扣一命（当前拍进度重置）；'game-over' 命用光。
 */
export declare function inputNote(state: MusicBoxState, note: number): 'ignored' | 'correct' | 'slot-done' | 'level-clear' | 'miss' | 'game-over';
/**
 * 使用一次提示：揭示当前拍剩余待填的唱名。
 * @returns 被揭示的音级数组；无提示次数或不在输入态时为 null。
 */
export declare function useHint(state: MusicBoxState): number[] | null;
/**
 * 过关后推进：进入下一关（更长更快更难），第 MAX_LEVEL 关后通关。
 * @returns true 表示推进成功。
 */
export declare function nextLevel(state: MusicBoxState): boolean;
