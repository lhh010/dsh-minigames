/**
 * 七巧板 Tangram 游戏定义：把纯逻辑接入 {@link MiniGameInstance}。指针拖拽
 * 移动板块（可从左侧托盘拖到右侧剪影），Q/E 或滚轮按 45° 步进旋转选中板块，
 * F 翻转平行四边形，数字 1-7 快速选择，R 重开本关（同关卡同种子 → 同布局），
 * P 暂停。全部板块的顶点与质心落入目标区域容差内即过关，过关后上报分数并
 * 1.8s 自动进入下一关（剪影复杂度递进，5 关循环）；最高关卡进度持久化。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 七巧板游戏定义（注册于 games/index.ts）。 */
export declare const tangramGame: MiniGameDefinition;
