/**
 * 残局挑战游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击白子选中、
 * 高亮合法落点、再点落点走子；U 悔棋、H 提示（限 3 次）、R 重开、P 暂停；
 * 过关后点击任意处进入下一题（8 题循环）。回合制 dirty 帧循环：无操作零
 * 重绘，过关粒子仍在动时持续重绘，得分经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const chessendGame: MiniGameDefinition;
