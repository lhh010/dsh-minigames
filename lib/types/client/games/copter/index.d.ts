/**
 * 洞穴飞行游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染，按住鼠标/触屏或空格施加推力、松开下坠，
 * R 重开、P 暂停，距离（米）经 onScore 上报（最高分由面板管理，
 * 本会话最佳同时留作结束遮罩展示）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const copterGame: MiniGameDefinition;
