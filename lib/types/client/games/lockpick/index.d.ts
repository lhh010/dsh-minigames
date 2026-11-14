/**
 * 开锁达人游戏定义：把纯逻辑接成 {@link MiniGameInstance}——←/→ 按住
 * 施加张力，数字键选弹子，空格按住施力顶起 / 松开判定设定，R 重开、
 * P 暂停，continuous 帧循环推进模拟与渲染，分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const lockpickGame: MiniGameDefinition;
