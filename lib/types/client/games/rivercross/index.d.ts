/**
 * 过河 River Crossing 游戏定义：把纯逻辑状态机接成 {@link MiniGameInstance}。
 * 点击角色上 / 下船（只作用于船停靠的一岸），点击「开船」或空格 / 回车
 * 渡河；靠岸后判定：无人看管的岸出现捕食对 → 失败红闪后自动复位本关，
 * 全员到右岸 → 过关并上报 onScore，1.7s 后进入下一关。R 重开本关、
 * P 暂停。渲染走 dirty 按需模式：只有渡河 / 失败 / 过关动画和粒子活动
 * 时逐帧重绘，静止棋盘零重绘（见 frame-scheduler）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const rivercrossGame: MiniGameDefinition;
