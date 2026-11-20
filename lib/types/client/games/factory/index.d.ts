/**
 * 传送带工厂 Factory 装配层：把纯逻辑与渲染接成 MiniGameInstance——
 * 点击工具面板选传送带/机器/擦除，点击空地放置、点击已放件旋转，
 * 右键移除，滚轮转向；Enter/空格运行模拟（可视化物品流动）或停止重摆，
 * R 重开、P 暂停、[ ] 切换关卡、B/M/E 快捷选工具。摆盘期为 dirty 按需
 * 重绘，模拟期逐帧推进（每 150ms 一个模拟 tick）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const factoryGame: MiniGameDefinition;
