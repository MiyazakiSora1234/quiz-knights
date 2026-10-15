/* QUIZ KNIGHTS 職業アイコン（64x64、currentColor＋金のアクセント） */
(function () {
  var sword = '<path d="M32 3l4.5 7v28h-9V10z"/><rect x="19" y="38" width="26" height="5" rx="1.5"/><rect x="29.5" y="43" width="5" height="11"/><circle cx="32" cy="58" r="3.4"/><path class="k" d="M32 12v24" stroke-width="1.6" stroke="#17110c" fill="none" opacity=".55"/>';
  var I = {
    sage: '<path d="M32 15C25 10 15 10 7 13v37c8-3 18-3 25 2z"/><path d="M32 15c7-5 17-5 25-2v37c-8-3-18-3-25 2z"/><path class="k" d="M13 21c5-1 10 0 15 2M13 29c5-1 10 0 15 2M51 21c-5-1-10 0-15 2M51 29c-5-1-10 0-15 2" stroke="#17110c" stroke-width="2" fill="none" opacity=".5"/><path class="a" d="M32 1l2.4 5.6 6 .5-4.6 4 1.4 6-5.2-3.2-5.2 3.2 1.4-6-4.6-4 6-.5z"/>',
    monk: '<circle class="as" cx="32" cy="32" r="27" stroke-width="3"/><rect x="27.5" y="9" width="9" height="46" rx="1.5"/><rect x="14" y="21" width="36" height="9" rx="1.5"/><circle class="a" cx="32" cy="25.5" r="3.2"/>',
    warrior: '<g transform="translate(0 2)">' + sword + '</g><path class="a" d="M19 41h26v3H19z"/>',
    mage: '<path d="M33 3L49 44H15z"/><ellipse cx="32" cy="46" rx="28" ry="8.5"/><path class="a" d="M17 38l30 0 2.5 7-35 0z"/><path class="a" d="M50 10l1.8 4.4 4.7.4-3.6 3 1.1 4.6-4-2.5-4 2.5 1.1-4.6-3.6-3 4.7-.4z"/>',
    bm: '<g transform="rotate(45 32 32) translate(0 -1) scale(.96) translate(1.3 1.3)">' + sword + '</g><g transform="rotate(-45 32 32) translate(0 -1) scale(.96) translate(1.3 1.3)">' + sword + '</g><circle class="a" cx="32" cy="32" r="4.5"/>',
    tank: '<path d="M32 3l23 8v21c0 15-10 24-23 29C19 56 9 47 9 32V11z"/><path class="k" d="M32 11l15 5.5v15.5c0 10.5-7 17-15 20.5-8-3.5-15-10-15-20.5V16.5z" fill="#17110c" opacity=".45"/><path class="as" d="M32 14v36M19 27h26" stroke-width="5"/>',
    berserker: '<rect x="29.5" y="6" width="5" height="52" rx="2"/><path d="M35 9C54 6 61 22 53 36 47 29 41 29 35 31z"/><path d="M29 9C10 6 3 22 11 36 17 29 23 29 29 31z"/><path class="a" d="M35 12c8 0 13 5 14 11-4-3-8-4-14-4z"/><circle cx="32" cy="60" r="3"/>',
    mw: '<g transform="translate(10 6) scale(.82) translate(2 3)">' + sword + '</g><path class="a" d="M14 5l2.8 7.4 7.4 2.8-7.4 2.8L14 25.4l-2.8-7.4L3.8 15.2l7.4-2.8z"/><path class="a" d="M50 40l1.6 4.2 4.2 1.6-4.2 1.6L50 51.6l-1.6-4.2-4.2-1.6 4.2-1.6z"/>',
    thief: '<path d="M21 25C9 34 6 52 21 59h22C58 52 55 34 43 25z"/><path d="M22 18h20l-4.5 8h-11z"/><rect class="a" x="20" y="14" width="24" height="5" rx="2"/><circle class="as" cx="32" cy="43" r="9" stroke-width="3"/><path class="as" d="M32 38v10M28.5 41.5h5a2.2 2.2 0 010 4.5h-4.5" stroke-width="2.2" stroke-linecap="round"/>',
    playboy: '<rect x="7" y="7" width="50" height="50" rx="10"/><g class="k" fill="#17110c"><circle cx="20" cy="20" r="5"/><circle cx="44" cy="20" r="5"/><circle cx="32" cy="32" r="5"/><circle cx="20" cy="44" r="5"/><circle cx="44" cy="44" r="5"/></g><path class="a" d="M7 17a10 10 0 0110-10h30a10 10 0 0110 10" opacity=".0"/>',
    hero: '<path d="M5 45L9 16l14 14 9-20 9 20 14-14 4 29z"/><rect x="5" y="47" width="54" height="9" rx="2.5"/><circle class="a" cx="9" cy="13" r="3.6"/><circle class="a" cx="32" cy="7" r="3.6"/><circle class="a" cx="55" cy="13" r="3.6"/><circle class="a" cx="32" cy="51.5" r="2.8"/><circle class="a" cx="17" cy="51.5" r="2"/><circle class="a" cx="47" cy="51.5" r="2"/>',
    bomb: '<circle cx="28" cy="38" r="21"/><rect x="21" y="11" width="14" height="9" rx="2.5"/><path class="as" d="M35 14c9-4 14-1 15 5" stroke-width="3" stroke-linecap="round"/><path class="a" d="M52 4l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M16 34a13 13 0 019-9" stroke="#17110c" stroke-width="3" fill="none" opacity=".45" stroke-linecap="round"/>',
    necro: '<path d="M32 4C17 4 7 15 7 28c0 8 4 13 11 16v10h8v-6h4v6h4v-6h4v6h8V44c7-3 11-8 11-16C57 15 47 4 32 4z"/><g class="k" fill="#17110c"><circle cx="21.5" cy="29" r="6.5"/><circle cx="42.5" cy="29" r="6.5"/><path d="M32 35l-3.6 8h7.2z"/></g><circle class="a" cx="21.5" cy="29" r="2"/><circle class="a" cx="42.5" cy="29" r="2"/>',
    boss: '<path d="M11 25c0-9 9-13 21-13s21 4 21 13v14c0 12-9 20-21 20S11 51 11 39z"/><path d="M11 26L4 3l19 13z"/><path d="M53 26l7-23-19 13z"/><path class="a" d="M16 30l12 4-3.5 7z"/><path class="a" d="M48 30l-12 4 3.5 7z"/><path class="k" d="M21 49h22" stroke="#17110c" stroke-width="3" fill="none"/><path d="M24 49l2.5 6 2.5-6zM35 49l2.5 6 2.5-6z" fill="#17110c"/>'
  };
  window.QK_ICONS = I;
  window.qkIcon = function (key, cls) {
    var g = I[key] || I.warrior;
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">' + g + '</svg>';
  };
  // アクセント色のクラス（ページ側の --acc を使用）
  var st = document.createElement('style');
  st.textContent = '.ic{width:1em;height:1em;display:inline-block;vertical-align:-.14em;fill:currentColor;overflow:visible}.ic .a{fill:var(--acc,#e0b650)}.ic .as{fill:none;stroke:var(--acc,#e0b650)}';
  document.head.appendChild(st);
})();
