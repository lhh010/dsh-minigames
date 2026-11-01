/**
 * 太极游戏定义：把简化太极逻辑接入 MiniGameInstance —— 点击（自由格）
 * 循环 空→白→黑→空（白圈预置格锁定不可改），全盘填满且每行每列黑白
 * 各半、正交相邻不取相同符号时过关。H 闪烁一个与解不符的格 2.5 秒
 * （任何提示都放弃时间奖励）。已持久化的关卡从上次进度继续；P 暂停；
 * R 重开；[ ] 在已到达关卡间切换。盘面为 dirty 帧循环，空闲零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const taijiGame: MiniGameDefinition;
