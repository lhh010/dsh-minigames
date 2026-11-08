/**
 * 游戏分类：六类 + 全部。面板选择器的标签栏按此过滤 107 张卡。
 * 每个游戏恰好属于一类；tests/categories.spec.ts 锁定全覆盖。
 */
/** 一个分类的展示信息。 */
export interface Category {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
}
/** 分类目录（展示顺序）。 */
export declare const CATEGORIES: readonly Category[];
/** 查游戏分类；未登记回落休闲（全覆盖测试把遗漏顶出来）。 */
export declare function categoryOf(gameId: string): string;
/** 游戏是否属于经典策展清单。 */
export declare function isClassic(gameId: string): boolean;
/** 某分类在给定游戏表中的数量（标签栏显示 n）。 */
export declare function countByCategory(gameIds: readonly string[], catId: string): number;
