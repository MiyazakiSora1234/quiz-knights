// バトルエンジンの入口（画面に依存しない。Node でもテストできる）
//   engine/data.js     職業・魔王のデータと、状態タグなどの純粋な関数
//   engine/context.js  ダメージ処理・対象選択などの共通部品
//   engine/jobs.js     職業と魔王の行動の定義
//   engine/items.js    アイテムの効果と配り方
//   engine/ai.js       CPUの頭脳（盤面の採点）
//   engine/battle.js   正解・誤答・スルー・取り消しの進行
export * from './engine/data.js';
export { createBattle } from './engine/battle.js';
