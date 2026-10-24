import type { HuntLang } from '../types'

/**
 * Every word the pane draws, in Traditional Chinese and in English. The game
 * keeps ids (a HUD callout is an id in the save), and the drawing looks them up.
 */
const ZH = {
  // the turn side, in the HUD box
  phaseCamp: '待機',
  phaseHunting: '狩獵中',
  phaseRetreat: '撤退',
  // weapons and the camp's pick
  greatsword: '大劍',
  longsword: '太刀',
  bow: '弓',
  random: '隨機',
  weaponInHand: '武器 {weapon}',
  randomSuffix: '（隨機）',
  pickAfterTurn: '・回合結束後可換',
  // the engine's own words
  hit: '被擊中',
  notReady: '魔物資料未就緒',
  // the terminal's words under the picture, and the tally
  hudWho: '・{name}（{kind}）',
  hudSep: '・',
  slainCount: '討伐 {n}',
  listSep: '：',
  pictureCells: '畫面：字元（點此改圖片）',
  pictureImage: '畫面：圖片（點此改字元）',
  // callouts over the fight
  retreat: '撤退',
  huntStart: '狩獵開始',
  huntResume: '繼續狩獵',
  huntDone: '討伐完成',
  slain: '討伐完成！',
  mutualKo: '雙方倒下・討伐完成',
  carted: '力竭…回營',
  dodged: '翻滾閃避',
  // the hunter's attacks, by move id
  charge: '蓄力斬',
  trueCharge: '真蓄力斬',
  tackle: '肩撞',
  lsChain: '縱斬連段',
  lsFade: '袈裟斬',
  lsRound: '氣刃大迴旋斬',
  bowShot: '通常射擊',
  bowQuick: '快速射擊',
  bowPower: '剛射',
} as const

export type TextId = keyof typeof ZH

const EN: Readonly<Record<TextId, string>> = {
  phaseCamp: 'Camp',
  phaseHunting: 'Hunting',
  phaseRetreat: 'Retreat',
  greatsword: 'Great Sword',
  longsword: 'Long Sword',
  bow: 'Bow',
  random: 'Random',
  weaponInHand: 'Weapon: {weapon}',
  randomSuffix: ' (random)',
  pickAfterTurn: ' · pick after the turn',
  hit: 'Hit!',
  notReady: 'Monster data not ready',
  hudWho: ' · {name} ({kind})',
  hudSep: ' · ',
  slainCount: 'Slain {n}',
  listSep: ': ',
  pictureCells: 'Picture: cells (press for image)',
  pictureImage: 'Picture: image (press for cells)',
  retreat: 'Retreat',
  huntStart: 'Hunt start!',
  huntResume: 'Hunt resumes',
  huntDone: 'Hunt complete',
  slain: 'Slain!',
  mutualKo: 'Both down · Slain',
  carted: 'Carted… back to camp',
  dodged: 'Dodged!',
  charge: 'Charged Slash',
  trueCharge: 'True Charged Slash',
  tackle: 'Tackle',
  lsChain: 'Overhead Combo',
  lsFade: 'Fade Slash',
  lsRound: 'Spirit Roundslash',
  bowShot: 'Shot',
  bowQuick: 'Quick Shot',
  bowPower: 'Power Shot',
}

const TABLES: Readonly<Record<HuntLang, Readonly<Record<TextId, string>>>> = { 'zh-TW': ZH, en: EN }

/**
 * The species' own words in English, by the Chinese their definitions
 * (hooks/monsters) are written in: names, kinds, moves, hits, states and
 * reactions. A test runs every species in English and finds no Chinese left.
 */
const MONSTER_EN: Readonly<Record<string, string>> = {
  // names and kinds
  冰呪龍: 'Velkhana',
  大凶豺龍: 'Great Jagras',
  飛雷龍: 'Tobi-Kadachi',
  蠻顎龍: 'Anjanath',
  冰牙龍: 'Barioth',
  迅龍: 'Nargacuga',
  轟龍: 'Tigrex',
  雷狼龍: 'Zinogre',
  殲世滅盡龍: 'Ruiner Nergigante',
  古龍: 'Elder Dragon',
  古龍種: 'Elder Dragon',
  牙獸種: 'Fanged Beast',
  牙龍種: 'Fanged Wyvern',
  獸龍種: 'Brute Wyvern',
  飛龍種: 'Flying Wyvern',
  // Velkhana
  尾刺: 'Tail stab',
  冰吐息: 'Ice breath',
  被尾刺擊中: 'Hit by tail stab',
  被冰吐息擊中: 'Hit by ice breath',
  // Great Jagras
  前咬: 'Bite',
  腹部重壓: 'Belly slam',
  側身翻壓: 'Body roll',
  吐出胃液團: 'Bile spit',
  被前咬擊中: 'Hit by bite',
  被腹部重壓擊中: 'Hit by belly slam',
  被翻壓擊中: 'Hit by body roll',
  被胃液團擊中: 'Hit by bile',
  膨腹: 'Inflated',
  大凶豺龍膨腹: 'Great Jagras inflates',
  大凶豺龍消腹: 'Great Jagras deflates',
  '腹部破壞！': 'Belly broken!',
  // Tobi-Kadachi
  躍身撲擊: 'Leaping pounce',
  迴身尾掃: 'Spinning tail sweep',
  帶電尾砸: 'Charged tail slam',
  被撲擊擊中: 'Hit by pounce',
  被尾掃擊中: 'Hit by tail sweep',
  被帶電尾砸擊中: 'Hit by charged slam',
  帶電: 'Charged',
  蓄電中: 'Charging',
  蓄電中斷: 'Charge broken',
  飛雷龍蓄電: 'Tobi-Kadachi charging',
  飛雷龍帶電: 'Tobi-Kadachi charged',
  飛雷龍放電: 'Tobi-Kadachi discharges',
  // Anjanath
  俯身咬擊: 'Lunging bite',
  低頭衝撞: 'Head-down charge',
  回身尾掃: 'Turning tail sweep',
  火焰吐息: 'Fire breath',
  被咬擊擊中: 'Hit by bite',
  被衝撞擊中: 'Hit by charge',
  被火焰吐息擊中: 'Hit by fire breath',
  準備中: 'Readying',
  火焰準備: 'Fire ready',
  火焰準備中斷: 'Fire broken',
  火焰準備結束: 'Fire fades',
  蠻顎龍抬起鼻冠: 'Anjanath raises its nose',
  蠻顎龍火焰準備: 'Anjanath readies fire',
  // Barioth
  飛撲: 'Pounce',
  側身撞擊: 'Side slam',
  長尾掃擊: 'Long tail sweep',
  冰息旋風: 'Ice whirlwind',
  被飛撲擊中: 'Hit by pounce',
  被側身撞擊擊中: 'Hit by side slam',
  被冰旋風擊中: 'Hit by whirlwind',
  '翼部破壞！': 'Wing broken!',
  // Nargacuga
  刃翼飛撲: 'Bladewing pounce',
  橫向尾掃: 'Side tail sweep',
  重尾砸地: 'Tail slam',
  二連尾砸: 'Double tail slam',
  尾棘散射: 'Tail spike volley',
  被刃翼飛撲擊中: 'Hit by bladewing',
  被尾砸擊中: 'Hit by tail slam',
  被尾棘擊中: 'Hit by tail spikes',
  憤怒: 'Enraged',
  怒氣解除: 'Rage ends',
  // Tigrex
  連身咬擊: 'Lunging bites',
  折返衝刺: 'Turnback charge',
  三連衝刺: 'Triple charge',
  原地迴旋: 'Spin',
  近身咆哮: 'Close roar',
  被衝刺撞中: 'Hit by charge',
  被迴旋擊中: 'Hit by spin',
  被咆哮衝擊震飛: 'Blown back by the roar',
  疲勞: 'Exhausted',
  轟龍疲勞: 'Tigrex is exhausted',
  // Zinogre
  前爪三連拍: 'Triple claw slam',
  背身重壓: 'Back slam',
  迴旋尾擊: 'Spinning tail',
  雷電爆發: 'Thunder burst',
  被前爪拍中: 'Hit by claws',
  被重壓擊中: 'Hit by slam',
  被尾擊擊中: 'Hit by tail',
  被雷電爆發擊中: 'Hit by thunder burst',
  超帶電: 'Supercharged',
  超帶電解除: 'Supercharge ends',
  雷狼龍超帶電: 'Zinogre supercharged',
  雷狼龍蓄電中: 'Zinogre charging',
  // Ruiner Nergigante
  前爪橫掃: 'Claw sweep',
  肩部衝撞: 'Shoulder charge',
  金屬棘散射: 'Spike burst',
  空中俯衝: 'Dive bomb',
  被前爪掃中: 'Hit by claw sweep',
  被肩撞擊中: 'Hit by shoulder charge',
  被金屬棘擊中: 'Hit by spikes',
  被俯衝重壓: 'Crushed by the dive',
  棘硬化: 'Spikes harden',
  棘再生: 'Spikes regrow',
  '白棘破壞！': 'White spikes broken!',
  '黑棘破壞！': 'Black spikes broken!',
}

/** Words built at run time: a species' name with a reaction, or a counter. */
const MONSTER_EN_PATTERNS: readonly [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(.+)倒地$/, m => `${MONSTER_EN[m[1]!] ?? m[1]} toppled`],
  [/^(.+)硬直$/, m => `${MONSTER_EN[m[1]!] ?? m[1]} flinched`],
  [/^(.+)憤怒$/, m => `${MONSTER_EN[m[1]!] ?? m[1]} enraged`],
  [/^破翼 (\d+)\/(\d+)$/, m => `Wings ${m[1]}/${m[2]}`],
  [/^白棘 (\d+)$/, m => `White ${m[1]}`],
  [/^黑棘 (\d+)$/, m => `Black ${m[1]}`],
  [/^雷狼龍蓄電 (.+)$/, m => `Zinogre charge ${m[1]}`],
  [/^蓄電 (.+)$/, m => `Charge ${m[1]}`],
]

/** A species' text in English; states joined with ・ are put one by one. */
function monsterEnglish(text: string): string | undefined {
  const own = MONSTER_EN[text]
  if (own !== undefined) return own
  for (const [pattern, put] of MONSTER_EN_PATTERNS) {
    const m = text.match(pattern)
    if (m !== null) return put(m)
  }
  if (text.includes('・')) {
    const parts = text.split('・').map(part => monsterEnglish(part))
    if (parts.every(part => part !== undefined)) return parts.join(' ')
  }
  return undefined
}

/**
 * The text for an id. A string that is no id is a species' own text (or a
 * callout saved before ids): in Chinese it is drawn as it is, in English
 * through the species' words.
 */
export function t(lang: HuntLang, id: string, vars: Readonly<Record<string, string>> = {}): string {
  const text = (TABLES[lang] as Readonly<Record<string, string>>)[id] ?? (lang === 'en' ? monsterEnglish(id) : undefined) ?? id
  return text.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
}

/** Traditional Chinese, however it is written: 繁體中文, Traditional Chinese, zh-TW, zh_Hant, zh-HK. */
const TRADITIONAL = /繁|正體|臺灣|台灣|traditional|\bzh[-_](tw|hk|mo|hant)\b/i

/**
 * The pane's language from the first source that says anything, in order:
 * Claude's `language` setting, then the locale variables, then the system
 * locale. Traditional Chinese draws Chinese; anything else, Simplified
 * Chinese included, draws English.
 */
export function pickLang(sources: readonly unknown[]): HuntLang {
  for (const source of sources) {
    if (typeof source === 'string' && source.trim() !== '') return TRADITIONAL.test(source) ? 'zh-TW' : 'en'
  }
  return 'en'
}
