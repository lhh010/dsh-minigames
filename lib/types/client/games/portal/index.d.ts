/**
 * 传送门游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous 帧
 * 循环推进模拟与渲染；←→/AD 移动、↑/W/空格跳跃；左键放蓝门、右键或
 * Shift+点击放橙门（只能贴竖直墙面）；R 重开本关、P 暂停；过关分数经
 * onScore 上报（最高分由面板管理）。死亡 / 过关 1.2s 后自动重开 / 进关。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const portalGame: MiniGameDefinition;
