// ブラウザの保存領域（localStorage / sessionStorage）の入口。使えない環境でも落ちない
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export const store = {
  get: k => safe(() => localStorage.getItem(k)),
  set: (k, v) => safe(() => localStorage.setItem(k, v)),
  remove: k => safe(() => localStorage.removeItem(k)),
};
/** タブごとの保存（再読み込みしても残り、タブを閉じると消える） */
export const session = {
  get: k => safe(() => sessionStorage.getItem(k)),
  set: (k, v) => safe(() => sessionStorage.setItem(k, v)),
  remove: k => safe(() => sessionStorage.removeItem(k)),
};

/** 保存キーの一覧（名前は以前のまま。変えると保存済みの内容が読めなくなる） */
export const KEY = {
  name: 'qr_name',
  flavor: 'qr_flavor',
  job: 'qr_job',
  team: 'qr_team',
  genres: 'qr_genres',
  sound: 'qk_sound',
  hostKey: id => 'qr_hk_' + id,    // 進行役の鍵（部屋ごと）
  save: id => 'qr_save_' + id,     // 途中のバトル（部屋ごと）
  pid: id => 'qr_pid_' + id,       // 参加者の識別（部屋ごと・タブごと）
};
