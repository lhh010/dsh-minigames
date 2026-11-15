/**
 * 成语接龙 IdiomChain 纯逻辑：内置带拼音首尾的精选成语库，玩家与 AI
 * 轮流接龙（尾字与下一成语首字同音即可接，同字为正接；正接按链位计
 * 分，同音接得固定小分），玩家从 seed 发的 6 张手牌候选中出牌或跳过
 * （跳过送 AI 得分），双方都无牌可接即死局重新起头；5 局累计分定胜负。
 * 全部随机走注入 seed（mulberry32），任何种子下的整局都可以确定性重放。
 */

/** 单条成语词条：成语、简注，以及首字/尾字的无声调拼音（同音判定用）。 */
export interface IdiomEntry {
  /** 四字成语本体。 */
  idiom: string
  /** 一句简注。 */
  meaning: string
  /** 首字无声调拼音。 */
  headPy: string
  /** 尾字无声调拼音。 */
  tailPy: string
}

/** 精选常用四字成语库（160 条，硬编码，含拼音首尾）。 */
export const IDIOMS: readonly IdiomEntry[] = [
  { idiom: '一心一意', meaning: '心思专一，专心致志', headPy: 'yi', tailPy: 'yi' },
  { idiom: '一鸣惊人', meaning: '一叫就令众人震惊', headPy: 'yi', tailPy: 'ren' },
  { idiom: '一帆风顺', meaning: '进展顺利无阻', headPy: 'yi', tailPy: 'shun' },
  { idiom: '一举两得', meaning: '一次做成两件好事', headPy: 'yi', tailPy: 'de' },
  { idiom: '一诺千金', meaning: '信守承诺极有分量', headPy: 'yi', tailPy: 'jin' },
  { idiom: '一往无前', meaning: '勇敢地一直前进', headPy: 'yi', tailPy: 'qian' },
  { idiom: '一丝不苟', meaning: '做事认真细致', headPy: 'yi', tailPy: 'gou' },
  { idiom: '一马当先', meaning: '带头走在最前', headPy: 'yi', tailPy: 'xian' },
  { idiom: '一言九鼎', meaning: '说话极有分量', headPy: 'yi', tailPy: 'ding' },
  { idiom: '一鼓作气', meaning: '趁劲头一次完成', headPy: 'yi', tailPy: 'qi' },
  { idiom: '十全十美', meaning: '完美无缺', headPy: 'shi', tailPy: 'mei' },
  { idiom: '十万火急', meaning: '情况非常紧急', headPy: 'shi', tailPy: 'ji' },
  { idiom: '七上八下', meaning: '心神不定不安', headPy: 'qi', tailPy: 'xia' },
  { idiom: '八仙过海', meaning: '各凭本事办事', headPy: 'ba', tailPy: 'hai' },
  { idiom: '人山人海', meaning: '聚集的人非常多', headPy: 'ren', tailPy: 'hai' },
  { idiom: '人定胜天', meaning: '靠努力战胜自然', headPy: 'ren', tailPy: 'tian' },
  { idiom: '大快人心', meaning: '使人人感到痛快', headPy: 'da', tailPy: 'xin' },
  { idiom: '大器晚成', meaning: '大才成就得晚', headPy: 'da', tailPy: 'cheng' },
  { idiom: '大同小异', meaning: '大体相同小有差别', headPy: 'da', tailPy: 'yi' },
  { idiom: '大公无私', meaning: '公正没有私心', headPy: 'da', tailPy: 'si' },
  { idiom: '万众一心', meaning: '众人齐心协力', headPy: 'wan', tailPy: 'xin' },
  { idiom: '万紫千红', meaning: '百花齐放绚丽', headPy: 'wan', tailPy: 'hong' },
  { idiom: '千军万马', meaning: '兵马众多声势大', headPy: 'qian', tailPy: 'ma' },
  { idiom: '千方百计', meaning: '想尽一切办法', headPy: 'qian', tailPy: 'ji' },
  { idiom: '千辛万苦', meaning: '历尽种种艰辛', headPy: 'qian', tailPy: 'ku' },
  { idiom: '千钧一发', meaning: '情况极其危急', headPy: 'qian', tailPy: 'fa' },
  { idiom: '口是心非', meaning: '嘴上说的与心里想的相反', headPy: 'kou', tailPy: 'fei' },
  { idiom: '口若悬河', meaning: '能言善辩滔滔不绝', headPy: 'kou', tailPy: 'he' },
  { idiom: '山清水秀', meaning: '风景优美秀丽', headPy: 'shan', tailPy: 'xiu' },
  { idiom: '山穷水尽', meaning: '陷入绝境无路可走', headPy: 'shan', tailPy: 'jin' },
  { idiom: '画蛇添足', meaning: '多此一举反而坏事', headPy: 'hua', tailPy: 'zu' },
  { idiom: '画龙点睛', meaning: '关键一笔使整体生动', headPy: 'hua', tailPy: 'jing' },
  { idiom: '亡羊补牢', meaning: '出事后及时补救', headPy: 'wang', tailPy: 'lao' },
  { idiom: '井底之蛙', meaning: '见识狭窄的人', headPy: 'jing', tailPy: 'wa' },
  { idiom: '水到渠成', meaning: '条件成熟事自然成', headPy: 'shui', tailPy: 'cheng' },
  { idiom: '水落石出', meaning: '真相大白', headPy: 'shui', tailPy: 'chu' },
  { idiom: '火上浇油', meaning: '使情况更加糟糕', headPy: 'huo', tailPy: 'you' },
  { idiom: '火树银花', meaning: '灯火烟火绚烂', headPy: 'huo', tailPy: 'hua' },
  { idiom: '心花怒放', meaning: '心情极其愉快', headPy: 'xin', tailPy: 'fang' },
  { idiom: '心旷神怡', meaning: '心胸开阔精神愉快', headPy: 'xin', tailPy: 'yi' },
  { idiom: '心想事成', meaning: '心里想的都能实现', headPy: 'xin', tailPy: 'cheng' },
  { idiom: '半途而废', meaning: '做事中途放弃', headPy: 'ban', tailPy: 'fei' },
  { idiom: '半信半疑', meaning: '又相信又怀疑', headPy: 'ban', tailPy: 'yi' },
  { idiom: '对牛弹琴', meaning: '对不懂的人讲道理', headPy: 'dui', tailPy: 'qin' },
  { idiom: '对答如流', meaning: '回答问题流畅敏捷', headPy: 'dui', tailPy: 'liu' },
  { idiom: '目中无人', meaning: '骄傲自大看不起人', headPy: 'mu', tailPy: 'ren' },
  { idiom: '目瞪口呆', meaning: '惊呆说不出话', headPy: 'mu', tailPy: 'dai' },
  { idiom: '叶公好龙', meaning: '表面爱好实际畏惧', headPy: 'ye', tailPy: 'gong' },
  { idiom: '叶落归根', meaning: '回到本源安返故土', headPy: 'ye', tailPy: 'gui' },
  { idiom: '石破天惊', meaning: '言论事迹惊人', headPy: 'shi', tailPy: 'jing' },
  { idiom: '石沉大海', meaning: '杳无音信', headPy: 'shi', tailPy: 'hai' },
  { idiom: '龙飞凤舞', meaning: '笔势奔放有力', headPy: 'long', tailPy: 'wu' },
  { idiom: '龙腾虎跃', meaning: '威武雄壮气氛热烈', headPy: 'long', tailPy: 'yue' },
  { idiom: '虎头蛇尾', meaning: '做事有始无终', headPy: 'hu', tailPy: 'wei' },
  { idiom: '虎背熊腰', meaning: '体格健壮魁梧', headPy: 'hu', tailPy: 'yao' },
  { idiom: '老当益壮', meaning: '年纪虽老志更坚', headPy: 'lao', tailPy: 'zhuang' },
  { idiom: '老马识途', meaning: '经验丰富熟悉情况', headPy: 'lao', tailPy: 'tu' },
  { idiom: '耳目一新', meaning: '感受焕然一新', headPy: 'er', tailPy: 'xin' },
  { idiom: '耳聪目明', meaning: '听得清看得明', headPy: 'er', tailPy: 'ming' },
  { idiom: '花好月圆', meaning: '美好圆满', headPy: 'hua', tailPy: 'yuan' },
  { idiom: '花枝招展', meaning: '打扮得十分艳丽', headPy: 'hua', tailPy: 'zhan' },
  { idiom: '良药苦口', meaning: '好药味苦却治病', headPy: 'liang', tailPy: 'kou' },
  { idiom: '良师益友', meaning: '好老师与好朋友', headPy: 'liang', tailPy: 'you' },
  { idiom: '足智多谋', meaning: '智谋很多', headPy: 'zu', tailPy: 'mou' },
  { idiom: '身临其境', meaning: '亲自经历那个境地', headPy: 'shen', tailPy: 'jing' },
  { idiom: '身体力行', meaning: '亲身体验努力实行', headPy: 'shen', tailPy: 'xing' },
  { idiom: '返老还童', meaning: '由衰老回到年轻', headPy: 'fan', tailPy: 'tong' },
  { idiom: '金玉良言', meaning: '非常宝贵的劝告', headPy: 'jin', tailPy: 'yan' },
  { idiom: '金枝玉叶', meaning: '出身高贵的后代', headPy: 'jin', tailPy: 'ye' },
  { idiom: '门当户对', meaning: '双方条件相当', headPy: 'men', tailPy: 'dui' },
  { idiom: '门庭若市', meaning: '上门的人很多', headPy: 'men', tailPy: 'shi' },
  { idiom: '马到成功', meaning: '迅速取得成功', headPy: 'ma', tailPy: 'gong' },
  { idiom: '马不停蹄', meaning: '一刻不停地行进', headPy: 'ma', tailPy: 'ti' },
  { idiom: '骑马找马', meaning: '暂且利用现有条件再找更好的', headPy: 'qi', tailPy: 'ma' },
  { idiom: '骑虎难下', meaning: '中途无法停止进退两难', headPy: 'qi', tailPy: 'xia' },
  { idiom: '首屈一指', meaning: '位居第一', headPy: 'shou', tailPy: 'zhi' },
  { idiom: '首当其冲', meaning: '最先受到攻击或遭遇', headPy: 'shou', tailPy: 'chong' },
  { idiom: '高山流水', meaning: '知音难逢或乐曲高妙', headPy: 'gao', tailPy: 'shui' },
  { idiom: '高瞻远瞩', meaning: '目光远大', headPy: 'gao', tailPy: 'zhu' },
  { idiom: '高朋满座', meaning: '宾客极多', headPy: 'gao', tailPy: 'zuo' },
  { idiom: '鬼斧神工', meaning: '技艺精巧非人力所能', headPy: 'gui', tailPy: 'gong' },
  { idiom: '鬼使神差', meaning: '不自觉地做了某事', headPy: 'gui', tailPy: 'chai' },
  { idiom: '天衣无缝', meaning: '完美自然没有破绽', headPy: 'tian', tailPy: 'feng' },
  { idiom: '天长地久', meaning: '时间悠久永恒', headPy: 'tian', tailPy: 'jiu' },
  { idiom: '天真烂漫', meaning: '天然纯真毫不做作', headPy: 'tian', tailPy: 'man' },
  { idiom: '天壤之别', meaning: '差别极大', headPy: 'tian', tailPy: 'bie' },
  { idiom: '地大物博', meaning: '土地广大物产丰富', headPy: 'di', tailPy: 'bo' },
  { idiom: '地久天长', meaning: '历时长久', headPy: 'di', tailPy: 'chang' },
  { idiom: '风和日丽', meaning: '天气晴朗宜人', headPy: 'feng', tailPy: 'li' },
  { idiom: '风平浪静', meaning: '平静无事', headPy: 'feng', tailPy: 'jing' },
  { idiom: '风驰电掣', meaning: '速度极快', headPy: 'feng', tailPy: 'che' },
  { idiom: '风调雨顺', meaning: '风雨适时年成好', headPy: 'feng', tailPy: 'shun' },
  { idiom: '雨过天晴', meaning: '困难过后转好', headPy: 'yu', tailPy: 'qing' },
  { idiom: '雨后春笋', meaning: '新事物大量涌现', headPy: 'yu', tailPy: 'sun' },
  { idiom: '云开见日', meaning: '消除蒙蔽见到光明', headPy: 'yun', tailPy: 'ri' },
  { idiom: '云淡风轻', meaning: '天气晴好宜人', headPy: 'yun', tailPy: 'qing' },
  { idiom: '电光石火', meaning: '瞬间即逝', headPy: 'dian', tailPy: 'huo' },
  { idiom: '火眼金睛', meaning: '眼光锐亮识别力强', headPy: 'huo', tailPy: 'jing' },
  { idiom: '金石为开', meaning: '诚心所至无事不成', headPy: 'jin', tailPy: 'kai' },
  { idiom: '开门见山', meaning: '说话写文章直截了当', headPy: 'kai', tailPy: 'shan' },
  { idiom: '开天辟地', meaning: '前所未有开创之举', headPy: 'kai', tailPy: 'di' },
  { idiom: '见义勇为', meaning: '勇敢地做正义之事', headPy: 'jian', tailPy: 'wei' },
  { idiom: '见多识广', meaning: '见得多知识广博', headPy: 'jian', tailPy: 'guang' },
  { idiom: '识文断字', meaning: '能读书认字有文化', headPy: 'shi', tailPy: 'zi' },
  { idiom: '字里行间', meaning: '文字语句中的含义', headPy: 'zi', tailPy: 'xing' },
  { idiom: '间不容发', meaning: '间隙极小形势危急', headPy: 'jian', tailPy: 'fa' },
  { idiom: '发扬光大', meaning: '使好的得到发展提高', headPy: 'fa', tailPy: 'yang' },
  { idiom: '扬眉吐气', meaning: '摆脱压抑心情舒畅', headPy: 'yang', tailPy: 'qi' },
  { idiom: '气壮山河', meaning: '气势雄壮足以盖过山河', headPy: 'qi', tailPy: 'he' },
  { idiom: '河清海晏', meaning: '天下太平', headPy: 'he', tailPy: 'qing' },
  { idiom: '清风明月', meaning: '清朗闲适高洁', headPy: 'qing', tailPy: 'yue' },
  { idiom: '月明星稀', meaning: '月明亮则星显得稀少', headPy: 'yue', tailPy: 'xi' },
  { idiom: '稀奇古怪', meaning: '少见而奇怪', headPy: 'xi', tailPy: 'guai' },
  { idiom: '怪诞不经', meaning: '荒诞离奇不合常理', headPy: 'guai', tailPy: 'jing' },
  { idiom: '经天纬地', meaning: '才能极大', headPy: 'jing', tailPy: 'di' },
  { idiom: '地利人和', meaning: '地理条件好人心齐', headPy: 'di', tailPy: 'ren' },
  { idiom: '人杰地灵', meaning: '人物英俊之地有灵气', headPy: 'ren', tailPy: 'ling' },
  { idiom: '灵机一动', meaning: '一下子想起办法', headPy: 'ling', tailPy: 'ji' },
  { idiom: '机不可失', meaning: '机会不可错过', headPy: 'ji', tailPy: 'shi' },
  { idiom: '失道寡助', meaning: '失去道义帮助的人少', headPy: 'shi', tailPy: 'zhu' },
  { idiom: '助人为乐', meaning: '把帮助别人当快乐', headPy: 'zhu', tailPy: 'le' },
  { idiom: '乐极生悲', meaning: '高兴过度转生悲事', headPy: 'le', tailPy: 'bei' },
  { idiom: '悲欢离合', meaning: '泛指人生聚散哀乐', headPy: 'bei', tailPy: 'he' },
  { idiom: '合情合理', meaning: '合乎情理', headPy: 'he', tailPy: 'li' },
  { idiom: '理直气壮', meaning: '理由充分说话有力', headPy: 'li', tailPy: 'zhuang' },
  { idiom: '壮志凌云', meaning: '志向远大高入云霄', headPy: 'zhuang', tailPy: 'yun' },
  { idiom: '云消雾散', meaning: '疑虑误会消除', headPy: 'yun', tailPy: 'san' },
  { idiom: '散兵游勇', meaning: '失去统属的士兵', headPy: 'san', tailPy: 'yong' },
  { idiom: '勇往直前', meaning: '勇敢地一直前进', headPy: 'yong', tailPy: 'qian' },
  { idiom: '前因后果', meaning: '事情的来龙去脉', headPy: 'qian', tailPy: 'guo' },
  { idiom: '果不其然', meaning: '果然如此', headPy: 'guo', tailPy: 'ran' },
  { idiom: '然荻读书', meaning: '勤学苦读', headPy: 'ran', tailPy: 'shu' },
  { idiom: '书声琅琅', meaning: '读书声清脆响亮', headPy: 'shu', tailPy: 'lang' },
  { idiom: '朗朗上口', meaning: '诵读顺口流畅', headPy: 'lang', tailPy: 'kou' },
  { idiom: '口蜜腹剑', meaning: '嘴甜心毒', headPy: 'kou', tailPy: 'jian' },
  { idiom: '剑拔弩张', meaning: '形势紧张一触即发', headPy: 'jian', tailPy: 'zhang' },
  { idiom: '张冠李戴', meaning: '弄错了对象', headPy: 'zhang', tailPy: 'dai' },
  { idiom: '戴月披星', meaning: '早出晚归辛勤奔波', headPy: 'dai', tailPy: 'xing' },
  { idiom: '星火燎原', meaning: '小事发展成大势', headPy: 'xing', tailPy: 'yuan' },
  { idiom: '源远流长', meaning: '历史悠久根底深', headPy: 'yuan', tailPy: 'chang' },
  { idiom: '长年累月', meaning: '经历很多年月', headPy: 'chang', tailPy: 'yue' },
  { idiom: '月下老人', meaning: '促成姻缘的媒人', headPy: 'yue', tailPy: 'ren' },
  { idiom: '人生如梦', meaning: '世事无常如一场梦', headPy: 'ren', tailPy: 'sheng' },
  { idiom: '梦寐以求', meaning: '迫切地期望着', headPy: 'meng', tailPy: 'qiu' },
  { idiom: '求同存异', meaning: '谋求一致保留分歧', headPy: 'qiu', tailPy: 'yi' },
  { idiom: '异想天开', meaning: '想法离奇不切实际', headPy: 'yi', tailPy: 'kai' },
  { idiom: '开卷有益', meaning: '读书总有好处', headPy: 'kai', tailPy: 'yi' },
  { idiom: '益寿延年', meaning: '延长寿命', headPy: 'yi', tailPy: 'nian' },
  { idiom: '年富力强', meaning: '年纪轻精力旺盛', headPy: 'nian', tailPy: 'qiang' },
  { idiom: '强词夺理', meaning: '无理强辩', headPy: 'qiang', tailPy: 'li' },
  { idiom: '理所当然', meaning: '从道理上讲应当如此', headPy: 'li', tailPy: 'ran' },
  { idiom: '然糠自照', meaning: '勤奋苦学', headPy: 'ran', tailPy: 'zhao' },
  { idiom: '照本宣科', meaning: '死板地照着念', headPy: 'zhao', tailPy: 'ke' },
  { idiom: '科头跣足', meaning: '不拘礼节随性自然', headPy: 'ke', tailPy: 'zu' },
  { idiom: '足不出户', meaning: '待在家里不外出', headPy: 'zu', tailPy: 'chu' },
  { idiom: '户枢不蠹', meaning: '常动的东西不受侵蚀', headPy: 'hu', tailPy: 'du' },
  { idiom: '独当一面', meaning: '独自负责一个方面', headPy: 'du', tailPy: 'mian' },
  { idiom: '面面俱到', meaning: '各方面都照顾到', headPy: 'mian', tailPy: 'dao' },
  { idiom: '到此为止', meaning: '到这里就结束', headPy: 'dao', tailPy: 'zhi' },
  { idiom: '止于至善', meaning: '达到最完美的境界', headPy: 'zhi', tailPy: 'shan' },
]

/** 总局数。 */
export const ROUNDS = 5
/** 每局玩家的出牌/跳过次数。 */
export const TURNS_PER_ROUND = 4
/** 手牌候选数量。 */
export const HAND_SIZE = 6
/** 每回合时限（毫秒）。 */
export const TURN_MS = 20_000
/** 玩家跳过时 AI 得到的分数。 */
export const SKIP_GIFT = 5
/** 同音（不同字）接龙的固定得分（正接为 10×链位）。 */
export const HOMOPHONE_GAIN = 5
/** AI 找到接龙的概率（其余情况跳过）。 */
export const AI_PLAY_RATE = 0.7

/** 接龙判定结果：exact 同字正接 / homophone 同音不同字 / null 不可接。 */
export type LinkKind = 'exact' | 'homophone'

/** mulberry32 确定性随机数发生器。 */
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
 * 接龙判定：上一条成语的尾字与下一条的首字同字为 exact，同音不同字为
 * homophone，否则不可接。
 * @param prev - 链上上一条成语。
 * @param next - 待接的成语。
 * @returns 接法，或 null 表示接不上。
 */
export function linkKind(prev: IdiomEntry, next: IdiomEntry): LinkKind | null {
  const tail = prev.idiom.charAt(3)
  const head = next.idiom.charAt(0)
  if (tail === head) return 'exact'
  if (prev.tailPy === next.headPy && prev.tailPy !== '') return 'homophone'
  return null
}

/** 时间计分递减系数：满时 1.0，耗尽时 0.5（线性）。 */
export function timeFactor(remainingMs: number): number {
  const ratio = Math.max(0, Math.min(1, remainingMs / TURN_MS))
  return 0.5 + 0.5 * ratio
}

/** 正接得 10×链位、同音接得固定 5 分，再乘时间系数。 */
export function gainFor(kind: LinkKind, chainPos: number, remainingMs: number): number {
  const base = kind === 'exact' ? 10 * chainPos : HOMOPHONE_GAIN
  return Math.round(base * timeFactor(remainingMs))
}

/** AI 的一步棋描述（渲染层做动画与提示用）。 */
export interface AiMove {
  type: 'play' | 'skip'
  /** 出牌时的成语（type 为 play 时有效）。 */
  entry?: IdiomEntry
  /** 出牌时的接法。 */
  kind?: LinkKind
  /** 本次得分。 */
  gain: number
}

/** 一局 match 的全部可变状态（rng 注入，纯数据可重放）。 */
export interface MatchState {
  /** 当前局（1..ROUNDS）。 */
  round: number
  /** 本局已进行的玩家回数（0..TURNS_PER_ROUND）。 */
  turnInRound: number
  /** playing 进行中 / over 五局结束。 */
  phase: 'playing' | 'over'
  /** 当前链条（chain[0] 为起头成语）。 */
  chain: IdiomEntry[]
  /** 当前 6 张手牌候选。 */
  hand: IdiomEntry[]
  /** 已用过的成语（不得重复出）。 */
  used: Set<string>
  playerScore: number
  aiScore: number
  /** 双方连续跳过计数（≥2 触发死局重起）。 */
  consecutiveSkips: number
  /** 死局重起次数。 */
  restarts: number
  /** AI 最近一步（渲染层展示）。 */
  aiLastMove: AiMove | null
  /** 注入的随机流。 */
  rng: () => number
}

function pickUnused(state: MatchState): IdiomEntry {
  for (let guard = 0; guard < 1000; guard += 1) {
    const entry = IDIOMS[Math.floor(state.rng() * IDIOMS.length)]!
    if (!state.used.has(entry.idiom)) return entry
  }
  // 兜底：顺序扫描第一个未用的（极小库时才可达）。
  return IDIOMS.find(e => !state.used.has(e.idiom)) ?? IDIOMS[0]!
}

/** 链条尾部的成语（链为空时取库里第一条，仅类型兜底）。 */
export function chainTail(state: MatchState): IdiomEntry {
  return state.chain[state.chain.length - 1] ?? IDIOMS[0]!
}

/** 手牌中可接当前链尾的下标列表。 */
export function playableIndices(state: MatchState): number[] {
  const tail = chainTail(state)
  const out: number[] = []
  state.hand.forEach((card, i) => {
    if (linkKind(tail, card) !== null) out.push(i)
  })
  return out
}

/**
 * 发一手 6 张候选（确定性）：对未用成语下标做局部 Fisher–Yates 洗牌取
 * 前 6 张；若洗出的 6 张全部接不上且库中还有可接的未用成语，则随机换
 * 入一张可接的，保证玩家绝大多数回合有牌可出。全程有界，任何 rng 都
 * 不会死循环。
 * @param state - 比赛状态（就地更新 hand）。
 */
export function dealHand(state: MatchState): void {
  const unused = IDIOMS.filter(e => !state.used.has(e.idiom))
  const idxs = unused.map((_, i) => i)
  const draws = Math.min(idxs.length, HAND_SIZE * 12)
  for (let i = 0; i < draws; i += 1) {
    const j = i + Math.floor(state.rng() * (idxs.length - i))
    const t = idxs[i]!
    idxs[i] = idxs[j]!
    idxs[j] = t
  }
  const hand = idxs.slice(0, Math.min(HAND_SIZE, unused.length)).map(i => unused[i]!)
  const tail = chainTail(state)
  if (hand.length === HAND_SIZE && !hand.some(c => linkKind(tail, c) !== null)) {
    const matches = unused.filter(e => linkKind(tail, e) !== null && !hand.includes(e))
    if (matches.length > 0) {
      const pick = matches[Math.floor(state.rng() * matches.length)]!
      hand[Math.floor(state.rng() * HAND_SIZE)] = pick
    }
  }
  state.hand = hand
}

/** 死局或新局起头：从未用成语里随机挑一条做链首。 */
export function restartChain(state: MatchState): void {
  const head = pickUnused(state)
  state.chain = [head]
  state.used.add(head.idiom)
  state.consecutiveSkips = 0
}

/**
 * AI 一步（确定性）：收集可接成语，rng < AI_PLAY_RATE 时按 rng 挑一条
 * 接上（正接 10×链位、同音 5 分，不吃时间系数），否则跳过。
 * @param state - 比赛状态（就地更新链与分数）。
 * @returns 这一步的描述。
 */
export function aiTurn(state: MatchState): AiMove {
  const tail = chainTail(state)
  const matches = IDIOMS.filter(e => !state.used.has(e.idiom) && linkKind(tail, e) !== null)
  if (matches.length > 0 && state.rng() < AI_PLAY_RATE) {
    const entry = matches[Math.floor(state.rng() * matches.length)]!
    const kind = linkKind(tail, entry)!
    const gain = kind === 'exact' ? 10 * (state.chain.length + 1) : HOMOPHONE_GAIN
    state.chain.push(entry)
    state.used.add(entry.idiom)
    state.aiScore += gain
    state.consecutiveSkips = 0
    const move: AiMove = { type: 'play', entry, kind, gain }
    state.aiLastMove = move
    return move
  }
  state.consecutiveSkips += 1
  const move: AiMove = { type: 'skip', gain: 0 }
  state.aiLastMove = move
  return move
}

/** 双方都跳过后死局重起（aiTurn 之后由动作函数调用）。 */
function resolveDeadlock(state: MatchState): void {
  if (state.consecutiveSkips >= 2) {
    restartChain(state)
    state.restarts += 1
  }
}

/** 玩家行动之后的共同收尾：AI 行动 → 死局处理 → 回合/局推进 → 发牌。 */
function finishTurn(state: MatchState): void {
  aiTurn(state)
  resolveDeadlock(state)
  state.turnInRound += 1
  if (state.turnInRound >= TURNS_PER_ROUND) {
    state.turnInRound = 0
    state.round += 1
    if (state.round > ROUNDS) {
      state.phase = 'over'
      state.hand = []
      return
    }
    restartChain(state)
  }
  dealHand(state)
}

/**
 * 玩家从手牌出牌接龙。
 * @param state - 比赛状态。
 * @param handIndex - 手牌下标（0..5）。
 * @param remainingMs - 剩余时间（毫秒），用于计分递减。
 * @returns ok 是否成功，gain 得分，kind 接法。
 */
export function playerPlay(
  state: MatchState, handIndex: number, remainingMs: number,
): { ok: boolean, gain: number, kind: LinkKind | null } {
  if (state.phase !== 'playing') return { ok: false, gain: 0, kind: null }
  const card = state.hand[handIndex]
  if (card === undefined) return { ok: false, gain: 0, kind: null }
  const kind = linkKind(chainTail(state), card)
  if (kind === null) return { ok: false, gain: 0, kind: null }
  const gain = gainFor(kind, state.chain.length + 1, remainingMs)
  state.chain.push(card)
  state.used.add(card.idiom)
  state.playerScore += gain
  state.consecutiveSkips = 0
  finishTurn(state)
  return { ok: true, gain, kind }
}

/**
 * 玩家跳过：AI 得 SKIP_GIFT 分，随后 AI 行动（可能死局重起）。
 * @param state - 比赛状态。
 * @returns AI 这一步的描述。
 */
export function playerSkip(state: MatchState): AiMove {
  state.aiScore += SKIP_GIFT
  state.consecutiveSkips += 1
  aiTurn(state)
  resolveDeadlock(state)
  state.turnInRound += 1
  if (state.turnInRound >= TURNS_PER_ROUND) {
    state.turnInRound = 0
    state.round += 1
    if (state.round > ROUNDS) {
      state.phase = 'over'
      state.hand = []
      return state.aiLastMove!
    }
    restartChain(state)
  }
  dealHand(state)
  return state.aiLastMove!
}

/**
 * 建立一场 match：起头一条链、发 6 张手牌（全部由 seed 决定）。
 * @param seed - 种子（同一 seed 得到完全相同的局面与走向）。
 * @returns 初始比赛状态。
 */
export function createMatch(seed: number): MatchState {
  const state: MatchState = {
    round: 1,
    turnInRound: 0,
    phase: 'playing',
    chain: [],
    hand: [],
    used: new Set<string>(),
    playerScore: 0,
    aiScore: 0,
    consecutiveSkips: 0,
    restarts: 0,
    aiLastMove: null,
    rng: mulberry32(seed),
  }
  restartChain(state)
  dealHand(state)
  return state
}

/**
 * 确定性整局脚本（测试重放用）：每回合一律出第一张可接的手牌（按
 * remainingMs 接牌），无牌可接则跳过，直到没有动作可做或终局。
 * @param seed - 比赛种子。
 * @param maxTurns - 最多执行的玩家回合数（防死循环）。
 * @returns 每回合之后的快照序列。
 */
export function playSkipScript(seed: number, maxTurns: number): Array<ReturnType<typeof snapshot>> {
  const state = createMatch(seed)
  const frames: Array<ReturnType<typeof snapshot>> = []
  for (let i = 0; i < maxTurns && state.phase === 'playing'; i += 1) {
    const idx = playableIndices(state)[0]
    if (idx === undefined) playerSkip(state)
    else playerPlay(state, idx, TURN_MS / 2)
    frames.push(snapshot(state))
  }
  return frames
}

/** 终局判定：玩家胜 / AI 胜 / 平局；未结束时为 null。 */
export function finalResult(state: MatchState): 'player' | 'ai' | 'draw' | null {
  if (state.phase !== 'over') return null
  if (state.playerScore > state.aiScore) return 'player'
  if (state.aiScore > state.playerScore) return 'ai'
  return 'draw'
}

/** 重放对比快照：与随机无关的可比较纯数据（测试确定性用）。 */
export function snapshot(state: MatchState): {
  round: number, turnInRound: number, phase: string, chain: string[],
  hand: string[], playerScore: number, aiScore: number, restarts: number,
} {
  return {
    round: state.round,
    turnInRound: state.turnInRound,
    phase: state.phase,
    chain: state.chain.map(e => e.idiom),
    hand: state.hand.map(e => e.idiom),
    playerScore: state.playerScore,
    aiScore: state.aiScore,
    restarts: state.restarts,
  }
}
