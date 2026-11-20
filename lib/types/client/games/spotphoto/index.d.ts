/**
 * 大家来找茬游戏定义：把纯逻辑（seed 照片生成 / 命中判定 / 倒计时）接成
 * MiniGameInstance —— 点击任一张照片的不同位置即标记一处（两侧同时圈红），
 * 点错扣 5 秒；5 关递进（元素 60→100、修改幅度更小、限时 90→50s），五处
 * 全中过关，时间耗尽失败。R 重开本关（换新 seed），P 暂停，过关后空格进
 * 下一关。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const spotphotoGame: MiniGameDefinition;
