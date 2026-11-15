/**
 * 开心农场游戏定义：把纯农场逻辑接成 MiniGameInstance——点击田块执行
 * 语境化下一动作（翻地/播种/浇水/收获）、点击作物卡按市价买种并选中、
 * Q 循环切换待种作物、N 过关后进下一关、R 重开本关、P 暂停（暂停即停
 * tick）。dirty 帧循环：进行期每帧标记重绘（生长/成熟闪烁与天气横幅动
 * 画持续变化），结束/暂停静止时零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const farmGame: MiniGameDefinition;
