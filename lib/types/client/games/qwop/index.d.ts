/**
 * 手忙脚乱 QWOP 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——
 * continuous 帧循环推进模拟与渲染；Q/W 驱动左/右大腿、O/P 驱动左/右
 * 小腿，R 重开、P 暂停；距离分（米）经 onScore 上报（最高分由面板管
 * 理），渲染层另显示本次会话最佳。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const qwopGame: MiniGameDefinition;
