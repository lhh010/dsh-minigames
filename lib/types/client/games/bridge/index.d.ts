/**
 * 过桥难题 Bridge 游戏定义：把纯逻辑状态机接成 {@link MiniGameInstance}。
 * 点选手电岸上的 1-2 人（再点取消），点击桥面或空格 / 回车携灯过桥；
 * 全员到右岸且不超限 → 过关上报 onScore 并进入下一关，累计用时超限 →
 * 超时失败自动重开本关。U 撤回一步、R 重开本关、P 暂停。渲染走 dirty
 * 按需模式：过桥 / 结算动画和粒子活动期间逐帧重绘，静止零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const bridgeGame: MiniGameDefinition;
