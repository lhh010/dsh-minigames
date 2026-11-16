/**
 * 水排序 WaterSort 游戏定义：把纯逻辑控制器接成 {@link MiniGameInstance}。
 * 交互为点源管再点目标管倾倒；U 撤回、A 加一根空管（每关一次）、
 * R 重开本关（同种子同盘面）、P 暂停。全部试管纯色即过关（上报
 * onScore，1.6s 后自动下一关，第 5 关通关后停在残局重开）。死局时
 * 画面给出重开/加管提示。脏标记渲染：倾倒动画与粒子期间逐帧重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const watersortGame: MiniGameDefinition;
