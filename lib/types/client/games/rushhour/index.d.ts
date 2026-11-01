/**
 * 交通堵塞游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击车选中、
 * 再点同排 / 同列目标格移动（或按住拖拽松手落位）；U 撤销、R 重开本关、
 * P 暂停、[ ] 切换关卡（进度经 readLevel/saveLevel('rushhour') 持久化）。
 * 回合制 dirty 帧循环：无操作零重绘，分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const rushhourGame: MiniGameDefinition;
