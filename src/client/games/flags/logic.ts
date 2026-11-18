/**
 * 旗帜竞猜纯逻辑：内置 60+ 国旗题库（emoji / 国名 / 大洲 / 冷知识四字段，
 * 预置「北欧十字组」「竖三色组」等易混组），两种题型轮换——看旗选国名 /
 * 看国名选旗；干扰项优先同组、其次同洲。每题 10 秒倒计时，答对得分
 * 剩秒×10 加连击加成；答错不扣分但记入错题。10 题一节、3 节挑战，节末
 * 错题回顾。所有随机走注入 seed（mulberry32），同一 seed 重放完全一致；
 * 逻辑层无 DOM、无定时器，时间由调用方以 dt 推进。
 */

/** 每节题数。 */
export const QUESTIONS_PER_ROUND = 10
/** 总节数。 */
export const TOTAL_ROUNDS = 3
/** 每题作答限时（毫秒）。 */
export const QUESTION_TIME_MS = 10000
/** 每题选项数（4 选 1）。 */
export const OPTION_COUNT = 4
/** 每层连击追加的分（答对时加 combo × COMBO_BONUS）。 */
export const COMBO_BONUS = 5

/** 大洲分类。 */
export type Continent = '亚洲' | '欧洲' | '非洲' | '美洲' | '大洋洲'

/**
 * 程序化条纹描述：等分横/竖条纹 + 可选装饰，足以肉眼辨识国旗，
 * 不追求纹章精确。所有绘制由 render.ts 的 drawFlag 消费，
 * 彻底摆脱 emoji 字体依赖（Windows 的 Segoe 系列无彩色旗绘字形）。
 */
export interface FlagStripes {
  /** 条纹方向：'h' 横条（自上向下）/ 'v' 竖条（自左向右）。 */
  dir: 'h' | 'v'
  /** 条纹颜色序列；重复同色可调整比例（如西班牙 1:2:1 用四段表示）。 */
  colors: string[]
  /** 中心圆颜色（日本/孟加拉等）；有 canton 时仍在全旗范围绘制。 */
  disc?: string
  /** 圆点横向位置 0-1（默认 0.5；葡萄牙国徽、澳大利亚联邦星用）。 */
  discX?: number
  /** 圆点纵向位置 0-1（默认 0.5；沙特铭文、克罗地亚盾徽用）。 */
  discY?: number
  /** 圆内小圆颜色（巴西蓝心）。 */
  inner?: string
  /** 十字颜色（瑞士/北欧十字；有 canton 时画在 canton 内，如希腊）。 */
  cross?: string
  /** 叠在 cross 上的细十字颜色（挪威/英国的红十字）。 */
  cross2?: string
  /** 竖条横向位置 0-1（默认 0.5 居中；北欧十字偏左约 0.34-0.38）。 */
  crossX?: number
  /** 对角斜线颜色（英国米字等；有 canton 时画在 canton 内）。 */
  saltire?: string
  /** 左上角矩形颜色（美国星区/马来西亚等）。 */
  canton?: string
  /** 五角星颜色（越南/摩洛哥等；有 canton 时画在 canton 内，如智利）。 */
  star?: string
  /** 月牙颜色（土耳其/巴基斯坦；开口朝旗尾侧）。 */
  crescent?: string
  /** 旗杆侧三角形颜色（捷克/古巴）。 */
  wedge?: string
}

/**
 * 题库条目：emoji 旗帜、中文国名、所属大洲、一句话冷知识；group 为
 * 预置易混组（'cross' 北欧十字/瑞士十字旗，'tricolor' 竖三色旗），
 * 干扰项抽取时优先同组。stripes 为程序化条纹描述，是旗面的唯一绘制
 * 来源（emoji 字段仅保留作元数据，不参与渲染）。
 */
export interface FlagEntry {
  emoji: string
  name: string
  continent: Continent
  fact: string
  group?: string
  /** 程序化条纹描述：drawFlag 按此绘制旗面。 */
  stripes: FlagStripes
}

/** 国旗题库（66 面，覆盖五大洲）。 */
export const FLAG_BANK: FlagEntry[] = [
  // 欧洲（24）
  { emoji: '🇮🇹', name: '意大利', continent: '欧洲', fact: '意大利拥有全球最多的联合国教科文组织世界遗产。', group: 'tricolor', stripes: { dir: 'v', colors: ['#009246', '#ffffff', '#ce2b37'] } }, // 意大利
  { emoji: '🇫🇷', name: '法国', continent: '欧洲', fact: '法国是全球接待游客最多的国家。', group: 'tricolor', stripes: { dir: 'v', colors: ['#0055a4', '#ffffff', '#ef4135'] } }, // 法国
  { emoji: '🇮🇪', name: '爱尔兰', continent: '欧洲', fact: '爱尔兰的国庆节圣帕特里克节在全球广泛庆祝。', group: 'tricolor', stripes: { dir: 'v', colors: ['#169b62', '#ffffff', '#ff883e'] } }, // 爱尔兰
  { emoji: '🇧🇪', name: '比利时', continent: '欧洲', fact: '比利时的巧克力门店密度居世界前列。', group: 'tricolor', stripes: { dir: 'v', colors: ['#000000', '#ffd90c', '#ef3340'] } }, // 比利时
  { emoji: '🇭🇺', name: '匈牙利', continent: '欧洲', fact: '匈牙利首都布达佩斯拥有欧洲最多的温泉浴场。', group: 'tricolor', stripes: { dir: 'h', colors: ['#cd2a3e', '#ffffff', '#436f4d'] } }, // 匈牙利
  { emoji: '🇷🇴', name: '罗马尼亚', continent: '欧洲', fact: '罗马尼亚的特兰西瓦尼亚是吸血鬼传说的故乡。', group: 'tricolor', stripes: { dir: 'v', colors: ['#002b7f', '#fcd116', '#ce1126'] } }, // 罗马尼亚
  { emoji: '🇨🇭', name: '瑞士', continent: '欧洲', fact: '瑞士国旗是仅有的两面正方形国旗之一。', group: 'cross', stripes: { dir: 'h', colors: ['#da291c'], cross: '#ffffff' } }, // 瑞士
  { emoji: '🇩🇰', name: '丹麦', continent: '欧洲', fact: '丹麦的国旗是现今仍在使用的最古老国旗。', group: 'cross', stripes: { dir: 'h', colors: ['#c8102e'], cross: '#ffffff', crossX: 0.34 } }, // 丹麦
  { emoji: '🇸🇪', name: '瑞典', continent: '欧洲', fact: '瑞典每年把诺贝尔奖颁发给全球顶尖学者。', group: 'cross', stripes: { dir: 'h', colors: ['#006aa7'], cross: '#fecc00', crossX: 0.38 } }, // 瑞典
  { emoji: '🇳🇴', name: '挪威', continent: '欧洲', fact: '挪威峡湾由冰川切割而成，绵延数百公里。', group: 'cross', stripes: { dir: 'h', colors: ['#ba0c2f'], cross: '#ffffff', cross2: '#00205b', crossX: 0.34 } }, // 挪威
  { emoji: '🇫🇮', name: '芬兰', continent: '欧洲', fact: '芬兰约有 188000 个湖泊，被称为千湖之国。', group: 'cross', stripes: { dir: 'h', colors: ['#ffffff'], cross: '#002f6c', crossX: 0.38 } }, // 芬兰
  { emoji: '🇮🇸', name: '冰岛', continent: '欧洲', fact: '冰岛几乎全部电力来自地热与水电。', group: 'cross', stripes: { dir: 'h', colors: ['#02529c'], cross: '#ffffff', cross2: '#dc1e35', crossX: 0.34 } }, // 冰岛
  { emoji: '🇩🇪', name: '德国', continent: '欧洲', fact: '德国拥有超过 1500 种啤酒。', stripes: { dir: 'h', colors: ['#000000', '#dd0000', '#ffce00'] } }, // 德国
  { emoji: '🇳🇱', name: '荷兰', continent: '欧洲', fact: '荷兰约四分之一的国土低于海平面。', stripes: { dir: 'h', colors: ['#ae1c28', '#ffffff', '#21468b'] } }, // 荷兰
  { emoji: '🇦🇹', name: '奥地利', continent: '欧洲', fact: '奥地利维也纳连续多年被评为最宜居城市。', stripes: { dir: 'h', colors: ['#ed2939', '#ffffff', '#ed2939'] } }, // 奥地利
  { emoji: '🇷🇺', name: '俄罗斯', continent: '欧洲', fact: '俄罗斯横跨 11 个时区，是世界最大国家。', stripes: { dir: 'h', colors: ['#ffffff', '#0039a6', '#d52b1e'] } }, // 俄罗斯
  { emoji: '🇵🇱', name: '波兰', continent: '欧洲', fact: '波兰的肖邦国际钢琴赛每五年举办一次。', stripes: { dir: 'h', colors: ['#ffffff', '#dc143c'] } }, // 波兰
  { emoji: '🇺🇦', name: '乌克兰', continent: '欧洲', fact: '乌克兰是世界最大的葵花籽油出口国。', stripes: { dir: 'h', colors: ['#005bbb', '#ffd500'] } }, // 乌克兰
  { emoji: '🇪🇸', name: '西班牙', continent: '欧洲', fact: '西班牙拥有世界第三多的联合国遗产。', stripes: { dir: 'h', colors: ['#aa151b', '#f1bf00', '#f1bf00', '#aa151b'] } }, // 西班牙
  { emoji: '🇵🇹', name: '葡萄牙', continent: '欧洲', fact: '葡萄牙是世界最古老的图书管理所在地。', stripes: { dir: 'v', colors: ['#046a38', '#046a38', '#da291c', '#da291c', '#da291c'], disc: '#ffe900', discX: 0.4 } }, // 葡萄牙
  { emoji: '🇬🇷', name: '希腊', continent: '欧洲', fact: '希腊拥有约 6000 个岛屿。', stripes: { dir: 'h', colors: ['#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf'], canton: '#0d5eaf', cross: '#ffffff' } }, // 希腊
  { emoji: '🇬🇧', name: '英国', continent: '欧洲', fact: '伦敦地铁是世界最古老的地铁系统。', stripes: { dir: 'h', colors: ['#012169'], saltire: '#ffffff', cross: '#ffffff', cross2: '#c8102e' } }, // 英国
  { emoji: '🇭🇷', name: '克罗地亚', continent: '欧洲', fact: '克罗地亚的领带（克拉瓦塔）发源地。', stripes: { dir: 'h', colors: ['#ff2a2a', '#ffffff', '#171796'], disc: '#e8112d', discY: 0.3 } }, // 克罗地亚
  { emoji: '🇨🇿', name: '捷克', continent: '欧洲', fact: '捷克人均啤酒消费量常年世界第一。', stripes: { dir: 'h', colors: ['#ffffff', '#dc143c'], wedge: '#11457e' } }, // 捷克
  // 亚洲（18）
  { emoji: '🇨🇳', name: '中国', continent: '亚洲', fact: '中国的高铁运营里程占世界七成以上。', stripes: { dir: 'h', colors: ['#de2910'], canton: '#de2910', star: '#ffde00' } }, // 中国
  { emoji: '🇯🇵', name: '日本', continent: '亚洲', fact: '日本由约 14000 个岛屿组成。', stripes: { dir: 'h', colors: ['#ffffff'], disc: '#bc002d' } }, // 日本
  { emoji: '🇰🇷', name: '韩国', continent: '亚洲', fact: '韩国的网络覆盖率常年居世界首位。', stripes: { dir: 'h', colors: ['#ffffff'], disc: '#cd2e3a', inner: '#0047a0' } }, // 韩国
  { emoji: '🇮🇳', name: '印度', continent: '亚洲', fact: '印度的官方语言多达 22 种。', stripes: { dir: 'h', colors: ['#ff9933', '#ffffff', '#138808'], disc: '#000080' } }, // 印度
  { emoji: '🇹🇭', name: '泰国', continent: '亚洲', fact: '泰国是唯一未被欧洲殖民的东南亚国家。', stripes: { dir: 'h', colors: ['#a51931', '#ffffff', '#2d2a4a', '#ffffff', '#a51931'] } }, // 泰国
  { emoji: '🇻🇳', name: '越南', continent: '亚洲', fact: '越南的咖啡产量位居世界第二。', stripes: { dir: 'h', colors: ['#da251d'], star: '#ffff00' } }, // 越南
  { emoji: '🇮🇩', name: '印度尼西亚', continent: '亚洲', fact: '印尼由超过 17000 个岛屿组成。', stripes: { dir: 'h', colors: ['#e70011', '#ffffff'] } }, // 印度尼西亚
  { emoji: '🇲🇾', name: '马来西亚', continent: '亚洲', fact: '马来西亚的首都吉隆坡塔曾是世界最高塔。', stripes: { dir: 'h', colors: ['#cc0001', '#ffffff', '#cc0001', '#ffffff', '#cc0001', '#ffffff', '#cc0001', '#ffffff'], canton: '#010066' } }, // 马来西亚
  { emoji: '🇸🇬', name: '新加坡', continent: '亚洲', fact: '新加坡是东南亚人口密度最高的国家。', stripes: { dir: 'h', colors: ['#ef3340', '#ffffff'], canton: '#ef3340', star: '#ffffff' } }, // 新加坡
  { emoji: '🇵🇭', name: '菲律宾', continent: '亚洲', fact: '菲律宾拥有超过 7000 个岛屿。', stripes: { dir: 'h', colors: ['#0038a8', '#ce1126'], wedge: '#ffffff', star: '#fcd116' } }, // 菲律宾
  { emoji: '🇹🇷', name: '土耳其', continent: '亚洲', fact: '土耳其的伊斯坦布尔横跨欧亚两洲。', stripes: { dir: 'h', colors: ['#e30a17'], crescent: '#ffffff', star: '#ffffff' } }, // 土耳其
  { emoji: '🇸🇦', name: '沙特阿拉伯', continent: '亚洲', fact: '沙特阿拉伯没有一条常年有水的河流。', stripes: { dir: 'h', colors: ['#006c35'], disc: '#ffffff', discY: 0.42 } }, // 沙特阿拉伯
  { emoji: '🇦🇪', name: '阿联酋', continent: '亚洲', fact: '阿联酋的哈利法塔是世界最高建筑。', stripes: { dir: 'v', colors: ['#ff0000', '#00732f', '#ffffff', '#000000'] } }, // 阿联酋
  { emoji: '🇮🇱', name: '以色列', continent: '亚洲', fact: '以色列的死海是地球陆地最低点。', stripes: { dir: 'h', colors: ['#0038b8', '#ffffff', '#0038b8'], star: '#0038b8' } }, // 以色列
  { emoji: '🇵🇰', name: '巴基斯坦', continent: '亚洲', fact: '巴基斯坦的喀喇昆仑公路是世界最高国际公路。', stripes: { dir: 'h', colors: ['#01411c'], crescent: '#ffffff', star: '#ffffff' } }, // 巴基斯坦
  { emoji: '🇮🇷', name: '伊朗', continent: '亚洲', fact: '伊朗的波斯帝国历史超过 2500 年。', stripes: { dir: 'h', colors: ['#239f40', '#ffffff', '#da0000'] } }, // 伊朗
  { emoji: '🇲🇳', name: '蒙古', continent: '亚洲', fact: '蒙古是世界人口密度最低的国家。', stripes: { dir: 'v', colors: ['#c4272f', '#c4272f', '#015197', '#015197', '#015197', '#015197', '#c4272f', '#c4272f'], disc: '#f9cf02', discX: 0.17 } }, // 蒙古
  { emoji: '🇳🇵', name: '尼泊尔', continent: '亚洲', fact: '尼泊尔拥有世界十大高峰中的八座。', stripes: { dir: 'h', colors: ['#003893', '#dc143c', '#dc143c', '#003893'], star: '#ffffff' } }, // 尼泊尔
  // 非洲（10）
  { emoji: '🇪🇬', name: '埃及', continent: '非洲', fact: '埃及的吉萨金字塔已矗立超过 4500 年。', stripes: { dir: 'h', colors: ['#ce1126', '#ffffff', '#000000'] } }, // 埃及
  { emoji: '🇳🇬', name: '尼日利亚', continent: '非洲', fact: '尼日利亚是非洲人口最多的国家。', stripes: { dir: 'v', colors: ['#008751', '#ffffff', '#008751'] } }, // 尼日利亚
  { emoji: '🇿🇦', name: '南非', continent: '非洲', fact: '南非拥有三个首都，职能各不相同。', stripes: { dir: 'h', colors: ['#e03c31', '#ffffff', '#007749', '#ffffff', '#001489'] } }, // 南非
  { emoji: '🇰🇪', name: '肯尼亚', continent: '非洲', fact: '肯尼亚的东非大裂谷肉眼可见从太空。', stripes: { dir: 'h', colors: ['#000000', '#ffffff', '#922529', '#ffffff', '#006600'] } }, // 肯尼亚
  { emoji: '🇪🇹', name: '埃塞俄比亚', continent: '非洲', fact: '埃塞俄比亚采用自己的历法，现在仍是另一个年份。', stripes: { dir: 'h', colors: ['#078930', '#fcd116', '#da121a'], disc: '#0f47af' } }, // 埃塞俄比亚
  { emoji: '🇲🇦', name: '摩洛哥', continent: '非洲', fact: '摩洛哥的舍夫沙万整座城刷成蓝色。', stripes: { dir: 'h', colors: ['#c1272d'], star: '#006233' } }, // 摩洛哥
  { emoji: '🇩🇿', name: '阿尔及利亚', continent: '非洲', fact: '阿尔及利亚是非洲面积最大的国家。', stripes: { dir: 'v', colors: ['#006233', '#ffffff'], star: '#d21034' } }, // 阿尔及利亚
  { emoji: '🇬🇭', name: '加纳', continent: '非洲', fact: '加纳曾是西非黄金贸易的中心。', stripes: { dir: 'h', colors: ['#ce1126', '#fcd116', '#006b3f'], star: '#000000' } }, // 加纳
  { emoji: '🇹🇿', name: '坦桑尼亚', continent: '非洲', fact: '坦桑尼亚的乞力马扎罗是非洲最高峰。', stripes: { dir: 'h', colors: ['#1eb53a', '#fcd116', '#00a3dd'] } }, // 坦桑尼亚
  { emoji: '🇸🇳', name: '塞内加尔', continent: '非洲', fact: '塞内加尔的玫瑰湖因盐藻呈粉红色。', stripes: { dir: 'v', colors: ['#00853f', '#fdef42', '#e31b23'], star: '#00853f' } }, // 塞内加尔
  // 美洲（10）
  { emoji: '🇺🇸', name: '美国', continent: '美洲', fact: '美国拥有世界上最大的经济体量。', stripes: { dir: 'h', colors: ['#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234', '#ffffff', '#b22234'], canton: '#3c3b6e' } }, // 美国
  { emoji: '🇨🇦', name: '加拿大', continent: '美洲', fact: '加拿大拥有全球最长的海岸线。', stripes: { dir: 'v', colors: ['#d80621', '#ffffff', '#d80621'], disc: '#d80621' } }, // 加拿大
  { emoji: '🇲🇽', name: '墨西哥', continent: '美洲', fact: '墨西哥是巧克力和辣椒的发源地。', stripes: { dir: 'v', colors: ['#006847', '#ffffff', '#ce1126'] } }, // 墨西哥
  { emoji: '🇧🇷', name: '巴西', continent: '美洲', fact: '巴西的亚马孙雨林占全球雨林一半以上。', stripes: { dir: 'h', colors: ['#009c3b'], disc: '#ffdf00', inner: '#002776' } }, // 巴西
  { emoji: '🇦🇷', name: '阿根廷', continent: '美洲', fact: '阿根廷以探戈和足球双料闻名于世。', stripes: { dir: 'h', colors: ['#74acdf', '#ffffff', '#74acdf'], disc: '#f6b40e' } }, // 阿根廷
  { emoji: '🇨🇱', name: '智利', continent: '美洲', fact: '智利南北绵延 4300 公里，是世界上最狭长国家。', stripes: { dir: 'h', colors: ['#ffffff', '#d52b1e'], canton: '#0039a6', star: '#ffffff' } }, // 智利
  { emoji: '🇵🇪', name: '秘鲁', continent: '美洲', fact: '秘鲁的马丘比丘建在 2400 米山脊上。', stripes: { dir: 'v', colors: ['#d91023', '#ffffff', '#d91023'] } }, // 秘鲁
  { emoji: '🇨🇴', name: '哥伦比亚', continent: '美洲', fact: '哥伦比亚的鸟类种类数世界第一。', stripes: { dir: 'h', colors: ['#fcd116', '#fcd116', '#003893', '#ce1126'] } }, // 哥伦比亚
  { emoji: '🇨🇺', name: '古巴', continent: '美洲', fact: '古巴的加勒比蜥蜴是特有物种。', stripes: { dir: 'h', colors: ['#002a8f', '#ffffff', '#002a8f', '#ffffff', '#002a8f'], wedge: '#cf142b', star: '#ffffff' } }, // 古巴
  { emoji: '🇧🇴', name: '玻利维亚', continent: '美洲', fact: '玻利维亚的乌尤尼盐沼是世界最大镜子。', stripes: { dir: 'h', colors: ['#d52b1e', '#f9e300', '#007934'] } }, // 玻利维亚
  // 大洋洲（4）
  { emoji: '🇦🇺', name: '澳大利亚', continent: '大洋洲', fact: '澳大利亚的有袋类动物大多为他处没有。', stripes: { dir: 'h', colors: ['#012169'], canton: '#012169', saltire: '#ffffff', cross: '#ffffff', cross2: '#c8102e', disc: '#ffffff', discX: 0.25, discY: 0.72 } }, // 澳大利亚
  { emoji: '🇳🇿', name: '新西兰', continent: '大洋洲', fact: '新西兰是最晚有人类定居的大陆级土地。', stripes: { dir: 'h', colors: ['#012169'], canton: '#012169', saltire: '#ffffff', cross: '#ffffff', cross2: '#c8102e', disc: '#cc142b', discX: 0.62, discY: 0.66 } }, // 新西兰
  { emoji: '🇫🇯', name: '斐济', continent: '大洋洲', fact: '斐济由 333 个热带岛屿组成。', stripes: { dir: 'h', colors: ['#68bfe5'], canton: '#012169', saltire: '#ffffff', cross: '#ffffff', cross2: '#c8102e', disc: '#ffd500', discX: 0.3, discY: 0.7 } }, // 斐济
  { emoji: '🇵🇬', name: '巴布亚新几内亚', continent: '大洋洲', fact: '巴布亚新几内亚使用超过 800 种语言。', stripes: { dir: 'h', colors: ['#ce1126', '#000000'], star: '#ffffff' } }, // 巴布亚新几内亚
]


/** 题型：看旗选国名 / 看国名选旗。 */
export type QuestionKind = 'flag-to-name' | 'name-to-flag'

/** 一道题：题型、题面与选项的题库下标（含正确答案）、答案位次。 */
export interface FlagsQuestion {
  kind: QuestionKind
  /** 题面（正确答案）的题库下标。 */
  promptIndex: number
  /** 四个选项的题库下标（随机顺序）。 */
  options: number[]
  /** 正确答案在 options 中的位次（0-3）。 */
  answerPos: number
}

/** 一条错题：题面下标与玩家所选（null 为超时未答）。 */
export interface WrongRecord {
  promptIndex: number
  chosenIndex: number | null
}

export type FlagsPhase = 'question' | 'feedback' | 'review' | 'over'

export interface FlagsState {
  phase: FlagsPhase
  /** 当前节（0-2）。 */
  round: number
  /** 节内题号（0 基，范围 [0, QUESTIONS_PER_ROUND)）。 */
  indexInRound: number
  /** 当前题目。 */
  question: FlagsQuestion
  /** 剩余作答时间（毫秒），由调用方按 dt 递减。 */
  remainingMs: number
  score: number
  /** 当前连续答对次数。 */
  combo: number
  /** 本局最高连击。 */
  bestCombo: number
  /** 上一题判定：'correct' | 'wrong'（含超时）| null（尚未作答）。 */
  lastResult: 'correct' | 'wrong' | null
  /** 全局错题收集（跨节累计，供回顾与结束展示）。 */
  wrongs: WrongRecord[]
  /** 已出过题的题库下标（避免一局内重复出题）。 */
  used: number[]
  rng: () => number
}

/**
 * mulberry32 确定性随机：同一 seed 生成同一序列。
 * @param seed - 32 位无符号整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 用 rng 就地打乱数组（Fisher-Yates）。
 * @param arr - 待打乱数组。
 * @param rng - 随机源。
 */
function shuffle(arr: number[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i] as number
    arr[i] = arr[j] as number
    arr[j] = tmp
  }
}

/**
 * 从候选池抽取 n 个互不相同的元素（池本身无重复）。
 * @param pool - 候选池。
 * @param n - 抽取数量。
 * @param rng - 随机源。
 * @returns 抽取结果（池不足 n 个时全返）。
 */
function pickFrom(pool: number[], n: number, rng: () => number): number[] {
  const copy = [...pool]
  shuffle(copy, rng)
  return copy.slice(0, n)
}

/**
 * 答对一题的得分：剩余秒数（向上取整）×10，再加 combo × COMBO_BONUS。
 * @param remainingMs - 作答时剩余毫秒。
 * @param combo - 本次作答前的连击数。
 * @returns 应加的分数。
 */
export function scoreFor(remainingMs: number, combo: number): number {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000)
  return seconds * 10 + combo * COMBO_BONUS
}

/**
 * 生成一道题：题型按全局题号奇偶轮换；题面从未用条目中抽取；干扰项
 * 优先同易混组（组内不足 3 个时退回同洲），仍不足再从其余条目补齐。
 * @param rng - 随机源。
 * @param questionNumber - 全局 0 基题号（决定题型轮换）。
 * @param used - 已出过题的题库下标（本题题面会从中排除）。
 * @returns 生成的题目（不修改 used，由调用方登记）。
 */
export function generateQuestion(rng: () => number, questionNumber: number, used: number[]): FlagsQuestion {
  const kind: QuestionKind = questionNumber % 2 === 0 ? 'flag-to-name' : 'name-to-flag'
  const unused: number[] = []
  for (let i = 0; i < FLAG_BANK.length; i += 1) {
    if (!used.includes(i)) unused.push(i)
  }
  const candidates = unused.length > 0 ? unused : FLAG_BANK.map((_, i) => i)
  const promptIndex = candidates[Math.floor(rng() * candidates.length) % candidates.length] as number
  const entry = FLAG_BANK[promptIndex] as FlagEntry

  const taken = new Set<number>([promptIndex])
  const distractors: number[] = []
  const poolOf = (pred: (i: number) => boolean): number[] => {
    const pool: number[] = []
    for (let i = 0; i < FLAG_BANK.length; i += 1) {
      if (!taken.has(i) && pred(i)) pool.push(i)
    }
    return pool
  }
  // 第一优先：同易混组；第二优先：同洲；最后：其余任意条目。
  const tiers: Array<() => number[]> = [
    () => (entry.group === undefined ? [] : poolOf(i => FLAG_BANK[i]?.group === entry.group)),
    () => poolOf(i => FLAG_BANK[i]?.continent === entry.continent),
    () => poolOf(() => true),
  ]
  for (const tier of tiers) {
    if (distractors.length >= OPTION_COUNT - 1) break
    for (const idx of pickFrom(tier(), OPTION_COUNT - 1 - distractors.length, rng)) {
      distractors.push(idx)
      taken.add(idx)
    }
  }

  const options = [promptIndex, ...distractors]
  shuffle(options, rng)
  return { kind, promptIndex, options, answerPos: options.indexOf(promptIndex) }
}

/** 就地发出当前题号的题目并消耗 rng、登记题面。 */
function deal(state: FlagsState): void {
  state.question = generateQuestion(state.rng, state.round * QUESTIONS_PER_ROUND + state.indexInRound, state.used)
  if (!state.used.includes(state.question.promptIndex)) state.used.push(state.question.promptIndex)
  state.remainingMs = QUESTION_TIME_MS
  state.lastResult = null
  state.phase = 'question'
}

/**
 * 建立初始状态并发出第一题。
 * @param rng - 注入的 [0,1) 随机源（默认 Math.random；测试请注入 mulberry32）。
 * @returns 就绪的 FlagsState（phase 为 'question'）。
 */
export function createFlagsState(rng: () => number = Math.random): FlagsState {
  const state: FlagsState = {
    phase: 'question', round: 0, indexInRound: 0,
    question: { kind: 'flag-to-name', promptIndex: 0, options: [0, 1, 2, 3], answerPos: 0 },
    remainingMs: QUESTION_TIME_MS, score: 0, combo: 0, bestCombo: 0,
    lastResult: null, wrongs: [], used: [], rng,
  }
  deal(state)
  return state
}

/**
 * 选择选项作答。答对：得分（剩秒×10 + 连击加成）、连击 +1；答错：清
 * 连击、记入错题（不扣分）。两种结果都进入 'feedback' 展示知识卡。
 * @param state - 当前状态（须处于 'question'）。
 * @param optionPos - 选项位次 0-3。
 * @returns 'ignored' 非答题阶段或位次越界；'correct' 答对；'wrong' 答错。
 */
export function answer(state: FlagsState, optionPos: number): 'ignored' | 'correct' | 'wrong' {
  if (state.phase !== 'question') return 'ignored'
  if (optionPos < 0 || optionPos >= state.question.options.length) return 'ignored'
  if (optionPos === state.question.answerPos) {
    state.score += scoreFor(state.remainingMs, state.combo)
    state.combo += 1
    state.bestCombo = Math.max(state.bestCombo, state.combo)
    state.lastResult = 'correct'
  } else {
    state.combo = 0
    state.lastResult = 'wrong'
    state.wrongs.push({ promptIndex: state.question.promptIndex, chosenIndex: state.question.options[optionPos] ?? null })
  }
  state.phase = 'feedback'
  return state.lastResult
}

/**
 * 推进剩余作答时间；时间耗尽视为超时：清连击、记入错题（chosen 为
 * null）、进入 'feedback'。
 * @param state - 当前状态。
 * @param dtMs - 本帧流逝的毫秒数（非负）。
 * @returns 'ok' 继续作答；'timeout' 本题超时。
 */
export function tick(state: FlagsState, dtMs: number): 'ok' | 'timeout' {
  if (state.phase !== 'question') return 'ok'
  state.remainingMs -= Math.max(0, dtMs)
  if (state.remainingMs > 0) return 'ok'
  state.remainingMs = 0
  state.combo = 0
  state.lastResult = 'wrong'
  state.wrongs.push({ promptIndex: state.question.promptIndex, chosenIndex: null })
  state.phase = 'feedback'
  return 'timeout'
}

/**
 * 进入下一题 / 下一节：'feedback' 时若节未满则发下一题，否则转入
 * 'review'；'review' 时若节未打完则开新节，否则 'over' 结束。
 * @param state - 当前状态。
 * @returns 'ignored' 无可推进的阶段；'question' 进入新题；'review' 进入
 * 节末回顾；'over' 全部结束。
 */
export function next(state: FlagsState): 'ignored' | 'question' | 'review' | 'over' {
  if (state.phase === 'feedback') {
    if (state.indexInRound + 1 < QUESTIONS_PER_ROUND) {
      state.indexInRound += 1
      deal(state)
      return 'question'
    }
    state.phase = 'review'
    return 'review'
  }
  if (state.phase === 'review') {
    if (state.round + 1 < TOTAL_ROUNDS) {
      state.round += 1
      state.indexInRound = 0
      deal(state)
      return 'question'
    }
    state.phase = 'over'
    return 'over'
  }
  return 'ignored'
}
