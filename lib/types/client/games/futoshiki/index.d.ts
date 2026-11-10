/**
 * 不等数独游戏定义：把纯谜面逻辑接到画布实例上——点击选中格子，数字键
 * 填入，E 清除，方向键移动选中，R 重开、P 暂停，[ / ] 在已解锁关卡间
 * 切换。错误即时红显（行列重复/不等违反），dirty 按需重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const futoshikiGame: MiniGameDefinition;
