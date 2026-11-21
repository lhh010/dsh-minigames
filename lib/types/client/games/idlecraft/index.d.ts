/**
 * 小作坊 IdleCraft 游戏定义：把纯经济逻辑接成 MiniGameInstance——空格或
 * 点击大齿轮敲打、1-5 购买对应机器、U 花钱提前解锁下一级（全局 ×2）、
 * R 重开本局、P 暂停（暂停即停表，倒计时与自动产出全部冻结）、结算后 N
 * 进下一局。continuous 帧循环：齿轮旋转、按压动画、数字滚动与飘字逐帧
 * 变化；dt 累加驱动固定 100ms 逻辑 tick（调度器已钳制单帧 dt ≤ 50ms）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const idlecraftGame: MiniGameDefinition;
