/**
 * 贤贤 KenKen 游戏定义：把笼运算逻辑接成 MiniGameInstance —— 点击（或
 * 方向键）选中格子，数字键 1-6 填入，E 清除，N 切换铅笔候选模式；行/
 * 列重复与已填满笼的结果错误实时红显。全盘无误即过关：onScore 上报
 * 关卡分 + 时限奖励，1.5 秒后自动进入下一关（进度持久化）。R 重开、
 * P 暂停（过关倒计时冻结）、[ ] 在已到达关卡间切换。渲染按 dirty 按
 * 需重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const kenkenGame: MiniGameDefinition;
