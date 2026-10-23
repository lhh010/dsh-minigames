/**
 * Wordle 猜词游戏定义：把纯判定逻辑接成 {@link MiniGameInstance} ——
 * 物理 A–Z/Enter/Backspace 与屏幕键盘点击双输入，无效猜测抖动提示且
 * 不消耗行，胜负后空格/点击换新词再来一局，连胜通过 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const wordleGame: MiniGameDefinition;
