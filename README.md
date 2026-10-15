# QUIZ KNIGHTS（クイズ騎士団）

早押しクイズと連携する、職業ありのバトルゲーム。遠隔参加の早押し付き。

## 構成
- `public/` … フロント（ビルド不要の素の HTML/JS）。Cloudflare Workers Assets で配信
  - `index.html` 部屋一覧 / `host.html` 進行役 / `play.html` 参加者
- `src/worker.js` … サーバー（Cloudflare Workers + Durable Objects）
  - 部屋ごとに1つの Durable Object が早押しの時計を一括管理し、同時押しは「押下時刻＋ディレイ」で判定

## ローカル実行
```
npm install
npm run dev        # http://localhost:8787
```

## 公開（Cloudflare 無料プラン）
```
npx wrangler login
npm run deploy
```
`main` への push で自動デプロイしたい場合は、GitHub の Secrets に
`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録してください（`.github/workflows/deploy.yml`）。

## 早押し判定
- 各端末が時計ずれを補正した押下時刻を送信し、サーバーが `押下時刻 + ディレイ` の最小の人を勝者にします。
- 通信遅延の許容は `TOLERANCE_MS`（`src/worker.js`、既定150ms）。
- バーサーカーは +700ms（`public/host.html` の `openBuzz`）。

## 部屋
- 1〜16番の固定枠。進行役が30分不在だと自動で閉じます。
