/**
 * 噗呦噗呦游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous 帧循环
 * 推进下落/连锁与渲染；←→ 移动、↑ 旋转（踢墙）、↓ 软降，R 重开（换局号）、
 * P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const puyoGame: MiniGameDefinition;
