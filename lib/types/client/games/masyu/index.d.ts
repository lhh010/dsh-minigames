/**
 * 真珠回路游戏定义：把纯逻辑接入 {@link MiniGameInstance}。点击格边
 * 切换画线；H 提示（闪一条应画边，弃时间奖励）；R 重开本关；P 暂停；
 * [ / ] 在已解锁关卡间切换。关卡进度经共享 level-progress 持久化
 * （'masyu'），重挂载从上次进度继续。内部关卡索引 0 基、展示与持久
 * 化 1 基。渲染走脏标记帧循环：输入、悬停、提示闪烁、完成动画或
 * 粒子活跃时才置脏重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const masyuGame: MiniGameDefinition;
