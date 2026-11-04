/**
 * 钩荡忍者游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染；按住鼠标左键 / 空格发射并保持钩索，松开惯性
 * 飞行；R 重开、P 暂停；距离分经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const grappleGame: MiniGameDefinition;
