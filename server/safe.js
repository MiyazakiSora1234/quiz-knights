// セキュリティ用の小さな道具（Cloudflare に依存しない純粋な関数。Node だけでテストできる）

/** 制御文字・文字の向きを変える文字（表示の偽装に使われる）・ゼロ幅文字（コードポイントの範囲） */
const BAD_RANGES = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]];
const isBad = cp => BAD_RANGES.some(([a, b]) => cp >= a && cp <= b);

/** 人に見せる文字列（名前・チャット・部屋名など）を、安全な文字だけにして、長さを切る */
export function clean(v, max) {
  const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  let out = '';
  for (const ch of s.slice(0, max * 4 + 64)) {                   // 長すぎる入力は、先に切って、処理を軽くする
    const cp = ch.codePointAt(0);
    out += (cp === 0x09 || cp === 0x0a || cp === 0x0d) ? ' ' : isBad(cp) ? '' : ch;
  }
  out = out.replace(/\s+/g, ' ').trim().slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? out.slice(0, -1) : out;       // 絵文字の途中で切れたら、その1文字は捨てる
}

/** 文字列が同じか。比べるのにかかる時間が、どこまで一致したかで変わらない */
export function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** 自分自身のプロパティだけを見る（'__proto__' や 'constructor' で、Object の中身を取り出されない） */
export const own = (obj, key) => typeof key === 'string' && !!obj && Object.hasOwn(obj, key) ? obj[key] : undefined;

/** IP アドレスから、保存・比較に使う短い印を作る（IP そのものは保存しない） */
export async function ipTag(ip) {
  if (!ip) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('qk-ip:' + ip));
  return [...new Uint8Array(buf).slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 入れ物方式のレート制限（時間がたつと回復する）。cap=たまる量の上限、perSec=1秒に回復する量。
 * 戻り値 allow(cost) は、使ってよいとき true。使えなかった回数は strikes に数える
 */
export class Bucket {
  constructor(cap, perSec, now = Date.now) { this.cap = cap; this.perSec = perSec; this.tokens = cap; this.now = now; this.last = now(); this.strikes = 0; }
  allow(cost = 1) {
    const t = this.now();
    this.tokens = Math.min(this.cap, this.tokens + ((t - this.last) / 1000) * this.perSec);
    this.last = t;
    if (this.tokens >= cost) { this.tokens -= cost; return true; }
    this.strikes++;
    return false;
  }
}

/** 一定時間あたりの回数の制限（キーごと）。古いキーは自動で捨てる */
export class WindowLimiter {
  constructor(limit, windowMs, now = Date.now, maxKeys = 5000) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.maxKeys = maxKeys; this.map = new Map(); }
  /** 回数を1つ数えて、制限内なら true */
  hit(key) {
    const t = this.now();
    let e = this.map.get(key);
    if (!e || t >= e.reset) { e = { n: 0, reset: t + this.windowMs }; this.map.set(key, e); }
    e.n++;
    if (this.map.size > this.maxKeys) {
      for (const [k, v] of this.map) if (t >= v.reset) this.map.delete(k);                                  // 期限切れを掃除
      for (const k of this.map.keys()) { if (this.map.size <= this.maxKeys) break; this.map.delete(k); }     // それでも多ければ、古いものから捨てる（メモリを使い切らせない）
    }
    return e.n <= this.limit;
  }
}

/** 失敗が続いたら、しばらく受け付けない（パスワード・鍵の総当たり対策） */
export class FailLock {
  constructor(maxFails, lockMs, now = Date.now, maxKeys = 2000) { this.maxFails = maxFails; this.lockMs = lockMs; this.now = now; this.maxKeys = maxKeys; this.map = new Map(); }
  locked(key) { const e = this.map.get(key); return !!e && e.until > this.now(); }
  fail(key) {
    const t = this.now();
    const e = this.map.get(key) ?? { n: 0, until: 0 };
    if (e.until && e.until <= t) { e.n = 0; e.until = 0; }
    e.n++;
    if (e.n >= this.maxFails) e.until = t + this.lockMs;
    this.map.set(key, e);
    if (this.map.size > this.maxKeys) {
      for (const [k, v] of this.map) if (v.until <= t) this.map.delete(k);                                  // 期限切れを掃除
      for (const k of this.map.keys()) { if (this.map.size <= this.maxKeys) break; this.map.delete(k); }     // それでも多ければ、古いものから捨てる（メモリを使い切らせない）
    }
  }
  ok(key) { this.map.delete(key); }
}

/** WebSocket の接続元が、このサイト自身か（別のサイトのページから勝手に接続されないように）。Origin が無い（アプリ以外の道具）ときは通す */
export function sameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try { return new URL(origin).host === url.host; } catch { return false; }
}
