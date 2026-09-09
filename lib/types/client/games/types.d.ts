/**
 * The mini-game extension contract: the reserved interface future games
 * implement. A game is a framework-agnostic canvas engine — the panel only
 * knows about this interface, so adding a game never touches the panel, the
 * registry, or the other games.
 */
/** Options the panel hands to a game at creation time. */
export interface MiniGameMountOptions {
    /**
     * Report the current score; the panel displays it in the header and keeps
     * the per-game best in localStorage. Fire only on change (the panel does
     * not throttle).
     */
    onScore?: (score: number) => void;
    /**
     * 请求面板切换暂停（通常由游戏的 P 快捷键触发）。提供此回调后，游戏
     * 不直接修改自身运行状态，暂停状态由面板统一维护。
     */
    onPauseRequest?: () => void;
    /**
     * 请求面板重开（通常由游戏的 R 快捷键触发）。面板可以重新创建实例，
     * 让工具栏状态与当前游戏保持一致。
     */
    onRestartRequest?: (restart?: () => void) => void;
}
/** The runtime handle of one mounted game; the panel drives its lifecycle. */
export interface MiniGameInstance {
    /** Start (or resume) the game loop; safe to call repeatedly. */
    start(): void;
    /** Pause the game loop; state is preserved. */
    pause(): void;
    /** Resume after pause. */
    resume(): void;
    /** 可选的就地重开钩子，面板可用它保留本局的游戏选项。 */
    restart?: () => void;
    /** Stop the loop and release all resources (keyboard, rAF, timers). */
    destroy(): void;
}
/** One selectable game in the panel's picker. */
export interface MiniGameDefinition {
    /** Stable unique id; persisted as the selected game and the best-score key. */
    id: string;
    /** Chinese display title. */
    title: string;
    /** Short emoji icon shown on the picker card and the collapsed rail. */
    icon: string;
    /** One-line description for the picker card. */
    description: string;
    /** Short key hints shown under the canvas (one entry per line/tag). */
    controls: string[];
    /**
     * Mount the game into the host element (a sized <div>; the game creates
     * its own <canvas>). Called once per activation; the returned instance is
     * started by the panel.
     */
    create(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance;
}
