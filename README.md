# QUIZ KNIGHTS（クイズ騎士団）

早押しクイズと連携する、職業ありのバトルゲーム。遠隔参加の早押し付き。

## 構成
- `app/` … フロント（Svelte 5 + Vite）
  - `src/lib/engine.js` ゲームの全ルール（画面に依存しない）。`app/test/` に自動テスト一式
    - `engine/jobs/interactions` 個別ルール、`explore` 全職業×全行動×全対象の分岐を総当たり、`fuzz` 数万手のランダム戦闘で毎手の整合性を検査、`server` 早押し・部屋・引き継ぎ
  - `src/lib/net.js` WebSocket 接続（自動再接続・サーバーとの時計ずれ補正）
  - `src/lib/host.svelte.js` 進行役の状態（部屋・名簿・早押し受付）
  - `src/pages/` 部屋一覧 `List` / 進行役 `Host`（準備・バトル）/ 参加者 `Play`
  - `src/theme.css` 共通デザイン（金=主操作、緑=正解・回復、赤=誤答・敵、青=味方）
- `src/worker.js` … サーバー（Cloudflare Workers + Durable Objects）
  - 部屋ごとに1つの Durable Object が早押しの時計を一括管理し、同時押しは「押下時刻＋ディレイ」で判定
- `dist/` … ビルド結果（Git 管理外）。Workers Assets で配信

## 開発
```
npm install
npm test              # 自動テスト（ルール・全分岐・ランダム戦闘・サーバー。約180件）
npm run build         # app/ → dist/
npm run worker        # http://localhost:8787 （ビルド済みの dist を配信）
npm run dev           # Vite 開発サーバー（:5173、/api と /ws は :8787 にプロキシ）
```
`npm run dev` を使うときは、別のターミナルで `npm run worker` も起動してください。

## 公開（Cloudflare 無料プラン）
```
npx wrangler login
npm run deploy        # ビルドしてデプロイ
```
`main` への push で自動デプロイしたい場合は、GitHub の Secrets に
`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録してください（`.github/workflows/deploy.yml`）。
動作確認用に別名で公開するなら `npx wrangler deploy --name quiz-knights-dev`。

## 早押し判定
- 各端末が時計ずれを補正した押下時刻を送信し、サーバーが `押下時刻 + ディレイ` の最小の人を勝者にします。
- 通信遅延の許容は `TOLERANCE_MS`（`src/worker.js`、既定150ms）。
- バーサーカーは +700ms（`app/src/lib/engine.js` の `BERSERKER_DELAY_MS`）。

## 部屋
- 1〜16番の固定枠。進行役が30分不在だと自動で閉じます。
- 進行役を別の画面で開くと、後から開いた画面が引き継ぎ、前の画面は停止します。

## テストの種類

- `npm test` — すべてのテスト（約4万件、1分弱）
- **ゴールデンテスト**（`app/test/golden.test.mjs`）… 決まった乱数で戦闘を最後まで進め、結果を `app/test/golden/engine.json` と比べます。リファクタリングで挙動が変わると失敗します。意図して挙動を変えたときだけ `npm run test:update-golden` で保存し直します。
- **画面の状態クラス**（`app/test/stores.test.mjs`）… 参加者の `PlayStore` と進行役の `HostStore` を、偽のサーバー・偽の保存領域で動かし、受け取ったメッセージでの状態の変化と、送るメッセージを確かめます（Vite でルーン付きの `.svelte.js` を読み込みます）。
- **アイテム・裁定**（`items*.test.mjs`・`rulings.test.mjs`）… アイテムの効果・乱戦・全職業×全アイテムと、ルール画面の裁定がエンジンの動きと合っているかを確かめます。
- **静的検査**（`app/test/static.test.mjs`）… すべての Svelte がコンパイルでき、import の行き先と名前が存在し、孤立したファイルがないことを確かめます。
- **組み合わせテスト**（`matrix.*.test.mjs`）… 職業×職業、魔王×難易度×人数、ランダム戦闘などを1ケース1テストで流します。
- **サーバーのテスト**（`server.test.mjs`）… `wrangler dev` を起動して、実際の部屋・早押し・チャットを検証します。
