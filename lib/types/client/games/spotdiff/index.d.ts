/**
 * 找不同游戏定义：把纯逻辑（seed 谜题生成 / 命中判定 / 倒计时）接成
 * MiniGameInstance —— 点击任一面板的差异位置即标记一处（两侧同时圈红），
 * 点错扣 1 秒；5 关递进（形状更多、差异更多、容差更紧），全找齐过关，
 * 时间耗尽失败。R 重开本关（换新 seed），P 暂停，过关后空格进下一关。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const spotdiffGame: MiniGameDefinition;
