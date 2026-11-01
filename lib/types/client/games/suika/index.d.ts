/**
 * 合成大西瓜游戏定义：把纯逻辑接成 {@link MiniGameInstance}——←→ 移动
 * 投放列（指针移动同样生效）、空格/点击投放（400ms 冷却），continuous
 * 帧循环推进确定性物理与渲染，R 重开、P 暂停，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const suikaGame: MiniGameDefinition;
