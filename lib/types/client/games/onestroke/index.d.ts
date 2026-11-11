/**
 * 一笔画 (One Stroke) 游戏定义：把纯逻辑接入 {@link MiniGameInstance}——
 * 5 个种子关卡（边数 8→20、奇点 0/2 交替，同关卡同图，R 重开完全一致）。
 * 点击任一节点起笔，再点击相邻节点沿边移动；重复走已画的边判负，走进
 * 死点（剩余度为 0 且未画完）同样提示重开。H 切换提示（奇点金环 + 剩余
 * 度常显），画线动画期间逐帧标脏重绘。过关后 onScore(关卡) 上报并 1.5s
 * 后进入下一关（暂停安全的剩余时间模式）；最高关卡进度持久化。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const onestrokeGame: MiniGameDefinition;
