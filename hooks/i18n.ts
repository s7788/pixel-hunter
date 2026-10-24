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
  // the monster
  velkhana: '冰呪龍',
  elderDragon: '古龍',
  // weapons and the camp's pick
  greatsword: '大劍',
  longsword: '太刀',
  bow: '弓',
  random: '隨機',
  weaponInHand: '武器 {weapon}',
  randomSuffix: '（隨機）',
  pickAfterTurn: '・回合結束後可換',
  // callouts over the fight
  retreat: '撤退',
  huntStart: '狩獵開始',
  huntResume: '繼續狩獵',
  huntDone: '討伐完成',
  slain: '討伐完成！',
  mutualKo: '雙方倒下・討伐完成',
  carted: '力竭…回營',
  hitByBeam: '被冰吐息擊中',
  hitByStab: '被尾刺擊中',
  dodged: '翻滾閃避',
  toppled: '冰呪龍倒地',
  flinched: '冰呪龍硬直',
  iceBeam: '冰吐息',
  tailStab: '尾刺',
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
  velkhana: 'Velkhana',
  elderDragon: 'Elder Dragon',
  greatsword: 'Great Sword',
  longsword: 'Long Sword',
  bow: 'Bow',
  random: 'Random',
  weaponInHand: 'Weapon: {weapon}',
  randomSuffix: ' (random)',
  pickAfterTurn: ' · pick after the turn',
  retreat: 'Retreat',
  huntStart: 'Hunt start!',
  huntResume: 'Hunt resumes',
  huntDone: 'Hunt complete',
  slain: 'Slain!',
  mutualKo: 'Both down · Slain',
  carted: 'Carted… back to camp',
  hitByBeam: 'Hit by ice breath',
  hitByStab: 'Hit by tail stab',
  dodged: 'Dodged!',
  toppled: 'Velkhana toppled',
  flinched: 'Velkhana flinched',
  iceBeam: 'Ice breath',
  tailStab: 'Tail stab',
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

/** The text for an id; a string that is no id (a callout saved before ids) is drawn as it is. */
export function t(lang: HuntLang, id: string, vars: Readonly<Record<string, string>> = {}): string {
  const text = (TABLES[lang] as Readonly<Record<string, string>>)[id] ?? id
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
