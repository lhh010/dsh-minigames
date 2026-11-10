/**
 * 弹跳机器人游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键 /
 * WASD 或点击底部方向按钮发起一回合（所有机器人同向滑行），滑行动画
 * 期间逐帧 dirty 重绘；U 撤回、R 重开本关、P 暂停、[ ] 切换关卡（进度
 * 经 readLevel/saveLevel('ricochet') 持久化）。分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const ricochetGame: MiniGameDefinition;
