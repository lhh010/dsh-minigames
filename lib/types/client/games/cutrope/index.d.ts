/**
 * 剪绳喂糖 game definition：点击或划线剪断绳索（线段与绳折线求交，
 * 一次剪一根，关卡限剪次数），点击气泡可戳破；糖果入怪物嘴过关，
 * 碰尖刺/出界/气泡飞顶/限剪用尽未喂到则扣命重来（3 命）。空格过关
 * 进下一关，R 重开本关（命尽则回到第 1 关重置 3 命），[ ] 切换已解锁
 * 关卡，P 暂停。粒子消费 cut/star/shatter/win 等事件；记录糖果轨迹
 * 拖尾与剪刀划线。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const cutropeGame: MiniGameDefinition;
