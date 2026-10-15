// データ定義と、画面・ルールの両方から使う純粋な関数（数値の調整はここだけ触ればOK）
export const CANCEL = Symbol('cancel');

/** 職業: n=名前 / atk=攻撃 / hp=体力 / d=説明 / tag=カードに出す印 */
export const JOB = {
  sage:     {n:'賢者',        atk:1, hp:5,  d:'通常攻撃の代わりに：死んだプレイヤー1人を体力1で蘇生'},
  monk:     {n:'僧侶',        atk:1, hp:6,  d:'通常攻撃の代わりに：1人を3回復'},
  warrior:  {n:'戦士',        atk:3, hp:7,  d:'通常攻撃の代わりに：自身と他1人に5ダメージ'},
  mage:     {n:'魔法使い',    atk:3, hp:5,  d:'通常攻撃の代わりに：1人に1ダメージ＋そのプレイヤーは次の問題休み'},
  bm:       {n:'バトルマスター',atk:5, hp:2,  d:'通常攻撃の代わりに：1人に8ダメージ（バトル中1度だけ）'},
  tank:     {n:'タンク',      atk:1, hp:8,  d:'仲間への攻撃を代わりに受けられる（権利は開始時1、正解で+1。死んでも継続）', tag:'🛡'},
  berserker:{n:'バーサーカー',atk:7, hp:7,  d:'常にボタンにディレイがつく（0.7秒遅れる）', tag:'⏱ ディレイ'},
  mw:       {n:'魔法戦士',    atk:2, hp:5,  d:'通常攻撃が常に敵全体への攻撃になる'},
  thief:    {n:'盗賊',        atk:2, hp:4,  d:'正解したら次の問題のジャンルを選択（理系/文系/青問/緑問/赤問）'},
  playboy:  {n:'遊び人',      atk:0, hp:3,  d:'連答（同じ人が連続正解）したら「勇者」に転職（体力リセット）'},
  hero:     {n:'勇者',        atk:7, hp:7,  d:'通常攻撃の代わりに：自身を3回復し、他1人に4ダメージ'},
  bomb:     {n:'ばくだんいわ',atk:1, hp:5,  d:'死んだら両隣に3ダメージ', tag:'💥'},
  necro:    {n:'ネクロマンサー',atk:1, hp:5,  d:'通常攻撃の代わりに：1人に（死んでいる仲間の人数×1）ダメージ'},
  apprentice:{n:'見習い',      atk:1, hp:4,  d:'正解するたびに攻撃+1・最大体力+1（攻撃は最大5まで）'},
  bard:     {n:'吟遊詩人',    atk:0, hp:5,  d:'通常攻撃の代わりに：味方全員を1回復'},
  tactician:{n:'軍師',        atk:1, hp:5,  d:'通常攻撃の代わりに：味方1人の次の誤答ダメージを無効にする'},
  cleric:   {n:'守護神官',    atk:0, hp:6,  d:'通常攻撃の代わりに：味方1人に「バリア」（次のダメージ1回を無効）を付ける'},
  mimic:    {n:'模倣者',      atk:1, hp:5,  d:'通常攻撃の代わりに：直前に正解した人の能力をコピーして使う'},
  poisoner: {n:'毒使い',      atk:1, hp:5,  d:'通常攻撃の代わりに：1人に毒。次の2問が終わるたびに1ダメージ'},
  oracle:   {n:'預言者',      atk:0, hp:5,  d:'通常攻撃の代わりに：敵1人の次の問題のボタンにディレイ（0.7秒）をつける'},
  minelayer:{n:'地雷屋',      atk:2, hp:4,  d:'通常攻撃の代わりに：敵1人に地雷。その人が次に正解したとき3ダメージ'},
  ghost:    {n:'幽霊',        atk:2, hp:3,  d:'死んでも幽霊として残り、1回だけ通常攻撃で答えられる（その後は成仏）'},
  jester:   {n:'道化師',      atk:1, hp:4,  d:'誤答したとき、受けるはずの2ダメージを他の1人に押し付けられる'},
  gambler:  {n:'賭博師',      atk:0, hp:5,  d:'通常攻撃の代わりにコイントス：表なら敵1人に5ダメージ、裏なら自分が3ダメージ'}
};
/** 参加者が選べる職業（勇者は遊び人の転職先なので除く） */
export const SELECTABLE = Object.keys(JOB).filter(k => k !== 'hero');
export const GENRES = ['理系','文系','青問','緑問','赤問'];
export const BERSERKER_DELAY_MS = 700;

/** 魔王: forms=形態名 / hp=プレイヤー攻撃合計Sからの体力 / d=説明 */
export const BOSS = {
  1:{n:'魔王1', forms:['通常'],
     hp:S=>S*1.5, d:'HP=攻撃合計×1.5 / 技1:敵1体に3 / 技2:指定1人に2＋両隣に1 / 残りHP半分以下で与ダメージ+2'},
  2:{n:'魔王2', forms:['第1形態','第2形態','第3形態'],
     hp:S=>S*0.5, d:'3形態（各HP=攻撃合計×0.5）。倒すと次の形態へ。第3形態は倒した敵を体力1で仲間に（死んでも魔王側）／スルーで1回復／敵撃破時に敵全体へ1ダメージ'},
  3:{n:'魔王3', forms:['通常'],
     hp:S=>S*2, d:'HP=攻撃合計×2 / 技1:2人に1ダメージ後その分回復 / 技2:直前正解者に4 / 残りHP1で正解すると5回復'},
  4:{n:'魔王4', forms:['通常'],
     hp:S=>S*1, d:'HP=攻撃合計×1 / ボタン2種：通常ボタン正解=敵全体に1 / ディレイボタン正解=1人を倒す'}
};

export const jobName = u => u.isBoss ? `${BOSS[u.bossId].n}${BOSS[u.bossId].forms.length > 1 ? '・' + BOSS[u.bossId].forms[u.form] : ''}` : JOB[u.job].n;
export const nm = u => u.name + (u.isBoss ? '' : `(${JOB[u.job].n})`);
export const bossHp = (S, id) => Math.max(1, Math.ceil(BOSS[id].hp(S)));
/** 魔王1は、残りHPが半分以下になると与えるダメージが+2 */
export const bonusOf = a => (a && a.isBoss && a.bossId === 1 && a.hp * 2 <= a.maxHp) ? 2 : 0;
/** 画面のアイコン・色分け用: 魔王は 'boss' */
export const iconKey = u => (u.isBoss ? 'boss' : u.job);

/** 画面に出す状態タグ。forHost=false のとき、秘密の情報（地雷）は隠す */
export function statusTags(u, forHost = true, q = null) {
  const t = [];
  if (u.poison > 0) t.push({ t: `☠ 毒×${u.poison}`, cls: 'warn' });
  if (u.barrier > 0) t.push({ t: '🔰 バリア', cls: 'warn' });
  if (u.noWrong) t.push({ t: '📜 誤答無効', cls: 'warn' });
  if (u.ghost) t.push({ t: '👻 幽霊', cls: 'warn' });
  if (u.delayQ != null && q != null && u.delayQ === q) t.push({ t: '⏱ ディレイ中', cls: 'warn' });
  if (forHost && u.mine) t.push({ t: '💣 地雷', cls: 'warn' });
  return t;
}
