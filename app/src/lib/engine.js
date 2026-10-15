// QUIZ KNIGHTS バトルエンジン（画面に依存しない。Node でもテストできる）
//  ui = { ask(title, options, {sub,cancel}) -> Promise, toast(msg), changed(snapshot), persist(G) }
export const CANCEL = Symbol('cancel');

/* =====================================================================
   データ定義（数値の調整はここだけ触ればOK）
   ===================================================================== */
export const JOB = {
  sage:     {n:'賢者',        atk:1, hp:5,  d:'通常攻撃の代わりに：死んだプレイヤー1人を体力1で蘇生'},
  monk:     {n:'僧侶',        atk:1, hp:6,  d:'通常攻撃の代わりに：1人を3回復'},
  warrior:  {n:'戦士',        atk:3, hp:7,  d:'通常攻撃の代わりに：自身と他1人に5ダメージ'},
  mage:     {n:'魔法使い',    atk:3, hp:5,  d:'通常攻撃の代わりに：1人に1ダメージ＋そのプレイヤーは次の問題休み'},
  bm:       {n:'バトルマスター',atk:5, hp:2,  d:'通常攻撃の代わりに：1人に8ダメージ（バトル中1度だけ）'},
  tank:     {n:'タンク',      atk:1, hp:10, d:'仲間への攻撃を代わりに受けられる（権利は開始時1、正解で+1。死んでも継続）', tag:'🛡'},
  berserker:{n:'バーサーカー',atk:7, hp:7,  d:'常にボタンにディレイがつく（0.7秒遅れる）', tag:'⏱ ディレイ'},
  mw:       {n:'魔法戦士',    atk:2, hp:5,  d:'通常攻撃が常に敵全体への攻撃になる'},
  thief:    {n:'盗賊',        atk:2, hp:4,  d:'正解したら次の問題のジャンルを選択（理系/文系/青問/緑問/赤問）'},
  playboy:  {n:'遊び人',      atk:0, hp:3,  d:'連答（同じ人が連続正解）したら「勇者」に転職（体力リセット）'},
  hero:     {n:'勇者',        atk:7, hp:7,  d:'通常攻撃の代わりに：自身を3回復し、他1人に4ダメージ'},
  bomb:     {n:'ばくだんいわ',atk:1, hp:5,  d:'死んだら両隣に3ダメージ', tag:'💥'},
  necro:    {n:'ネクロマンサー',atk:1, hp:5,  d:'通常攻撃の代わりに：1人に（死んでいる仲間の人数×1）ダメージ'}
};
export const SELECTABLE = ['sage','monk','warrior','mage','bm','tank','berserker','mw','thief','playboy','bomb','necro']; // 勇者は転職専用
export const GENRES = ['理系','文系','青問','緑問','赤問'];
export const BERSERKER_DELAY_MS = 700;

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

export const jobName = u=>u.isBoss?`${BOSS[u.bossId].n}${BOSS[u.bossId].forms.length>1?'・'+BOSS[u.bossId].forms[u.form]:''}`:JOB[u.job].n;
export const nm = u=>u.name+(u.isBoss?'':`(${JOB[u.job].n})`);
export const bossHp = (S,id)=>Math.max(1,Math.ceil(BOSS[id].hp(S)));
export const bonusOf = a=>(a&&a.isBoss&&a.bossId===1&&a.hp*2<=a.maxHp)?2:0;

export function createBattle(ui){
  let G=null, undoStack=[], busy=false, pending=false;

  /* ---------- 通知 ---------- */
  const emit=()=>{
    if(pending)return; pending=true;
    queueMicrotask(()=>{pending=false;ui.changed(G?JSON.parse(JSON.stringify(G)):null);});
  };
  const log=(m,c='')=>{G.log.unshift({m,c});if(G.log.length>300)G.log.pop();emit();};
  const ask=(...a)=>ui.ask(...a);

  /* ---------- ユニット ---------- */
  function mkUnit(name,job){
    const j=JOB[job];
    return {id:G.uid++,name,job,side:'p',isBoss:false,atk:j.atk,maxHp:j.hp,hp:j.hp,alive:true,
            restNow:false,restNext:false,guards:job==='tank'?1:0,used:false,converted:false};
  }
  function mkBoss(id,S){
    const hp=bossHp(S,id);
    return {id:G.uid++,name:BOSS[id].n,job:'boss',side:'e',isBoss:true,bossId:id,form:0,S,atk:0,
            maxHp:hp,hp,alive:true,restNow:false,restNext:false,guards:0,used:false,converted:false};
  }
  const row=u=>u.isBoss?[u]:G.units.filter(x=>!x.isBoss&&(G.mode!=='pvp'||x.side===u.side));
  const neighbors=u=>{const r=row(u),i=r.indexOf(u);return [r[i-1],r[i+1]].filter(Boolean);};
  const foesOf=a=>G.units.filter(u=>u.alive&&u.side!==a.side);
  const dm=(a,n)=>n+bonusOf(a);

  function heal(u,n){
    if(!u.alive)return 0;
    const b=u.hp; u.hp=Math.min(u.maxHp,u.hp+n);
    log(`${nm(u)} は ${u.hp-b} 回復 (HP ${u.hp}/${u.maxHp})`,'heal');
    return u.hp-b;
  }

  /** events:[{src,to,amt}] を処理。タンクの庇い→同時ダメージ→死亡処理（連鎖あり）。実際に与えた合計を返す */
  async function applyEvents(events){
    let total=0, q=events;
    while(q.length){
      q=await protect(q);
      const startAlive=new Set(G.units.filter(u=>u.alive).map(u=>u.id));
      const killer={};
      for(const e of q){
        if(!startAlive.has(e.to.id)||e.amt<=0)continue;
        const real=Math.min(e.amt,Math.max(e.to.hp,0));
        const wasPos=e.to.hp>0;
        e.to.hp-=e.amt; total+=real;
        log(`${nm(e.to)} に ${e.amt} ダメージ${e.src?`（${e.src.name}）`:''} → HP ${Math.max(0,e.to.hp)}/${e.to.maxHp}`,'dmg');
        if(wasPos&&e.to.hp<=0)killer[e.to.id]=e.src;
      }
      const next=[];
      for(const k of G.units.filter(u=>u.alive&&u.hp<=0)){
        if(k.isBoss&&k.form<BOSS[k.bossId].forms.length-1){
          k.form++; k.maxHp=k.hp=bossHp(k.S,k.bossId);
          log(`${k.name} は ${BOSS[k.bossId].forms[k.form]} に変身した！ (HP ${k.hp})`,'sys');
          continue;
        }
        k.alive=false; k.hp=0;
        log(`${nm(k)} は倒れた…`,'sys');
        if(k.job==='bomb'){
          for(const n of neighbors(k)) if(n.alive||startAlive.has(n.id)) next.push({src:k,to:n,amt:3});
          log('💥 ばくだんいわが爆発！','sys');
        }
        const s=killer[k.id];
        if(s&&s.isBoss&&s.bossId===2&&s.form===2&&!k.isBoss&&k.side!==s.side){
          k.side='e';k.alive=true;k.hp=1;k.converted=true;
          log(`${k.name} は魔王の仲間として体力1で復活した！`,'sys');
          for(const f of G.units) if(f.alive&&f.side==='p'&&f.id!==k.id) next.push({src:s,to:f,amt:1});
        }
      }
      q=next;
    }
    return total;
  }

  /** タンクによる庇い（攻撃元と対象が敵対しているときのみ） */
  async function protect(events){
    const out=[];
    for(const e of events){
      let ev=e;
      if(e.src&&e.amt>0&&e.to.alive&&e.src.side!==e.to.side){
        const tanks=G.units.filter(t=>t.alive&&t.job==='tank'&&t.guards>0&&t.side===e.to.side&&t!==e.to);
        if(tanks.length){
          const opts=tanks.map(t=>({label:`${t.name} が代わりに受ける`,sub:`守り残り ${t.guards}`,value:t.id,cls:'ok'}));
          opts.push({label:'庇わない',value:null,cls:'ghost'});
          const c=await ask(`🛡 ${e.to.name} への ${e.amt} ダメージ（${e.src.name}）`,opts,{sub:'タンクが庇いますか？'});
          if(c!==null){const t=G.units.find(x=>x.id===c);t.guards--;log(`🛡 ${t.name} が ${e.to.name} を庇った (守り残り ${t.guards})`,'sys');ev={src:e.src,to:t,amt:e.amt};}
        }
      }
      out.push(ev);
    }
    return out;
  }
  const dmgTo=(src,targets,amt)=>applyEvents(targets.map(t=>({src,to:t,amt})));
  function setRest(t){
    if(!t.alive)return;
    if(t.restNow){log(`${t.name} は今回すでに休みなので連続では休みにならない`);return;}
    t.restNext=true; log(`${t.name} は次の問題休み`,'sys');
  }

  /* ---------- 行動定義 ---------- */
  const P=(label,f)=>({label,f});
  function actionsFor(a){
    const L=[]; const add=(label,desc,prompts,run,opt={})=>L.push({label,desc,prompts,run,...opt});
    const alive=u=>u.alive, foe=u=>u.alive&&u.side!==a.side;
    const notIn=(f)=>(u,picked)=>f(u)&&!picked.includes(u);
    if(a.isBoss){
      const id=a.bossId;
      if(id===1){
        add('技1','敵1体に3ダメージ',[P('対象',foe)],async([t])=>{await dmgTo(a,[t],dm(a,3));});
        add('技2','指定1人に2ダメージ、その両隣に1ダメージ',[P('指定する人',foe)],async([t])=>{
          await applyEvents([{src:a,to:t,amt:dm(a,2)},...neighbors(t).map(n=>({src:a,to:n,amt:dm(a,1)}))]);});
      }else if(id===2){
        if(a.form===0){
          add('技1','2人に1ダメージ。その2人は次のターン休み',[P('1人目',foe),P('2人目',notIn(foe))],async([x,y])=>{
            await dmgTo(a,[x,y],1);setRest(x);setRest(y);});
          add('技2','1人に3ダメージ',[P('対象',foe)],async([t])=>{await dmgTo(a,[t],3);});
        }else if(a.form===1){
          add('技1','自分を2回復',[],async()=>{heal(a,2);});
          add('技2','敵に1ダメージ',[P('対象',foe)],async([t])=>{await dmgTo(a,[t],1);});
        }else{
          add('技1','1人に2ダメージ',[P('対象',foe)],async([t])=>{await dmgTo(a,[t],2);});
        }
      }else if(id===3){
        add('技1','2人に1ダメージ。その後、与えたダメージ分回復',[P('1人目',foe),P('2人目',notIn(foe))],async([x,y])=>{
          const d=await dmgTo(a,[x,y],1);if(d>0)heal(a,d);});
        const pc=G.units.find(u=>u.id===G.prevCorrect);
        add('技2',`直前に正解した相手に4ダメージ${pc?`（${pc.name}）`:'（該当者なし）'}`,[],async()=>{
          const t=G.units.find(u=>u.id===G.prevCorrect);
          if(t&&t.alive&&t.side!==a.side)await dmgTo(a,[t],4);else log('直前の正解者がいないため不発');},
          {disabled:!(pc&&pc.alive&&pc.side!==a.side)});
      }else{
        add('通常ボタンで正解','敵全体に1ダメージ',[],async()=>{await dmgTo(a,foesOf(a),1);});
        add('ディレイボタンで正解','1人を倒す',[P('倒す相手',foe)],async([t])=>{await dmgTo(a,[t],9999);});
      }
      return L;
    }
    // ---- プレイヤー職 ----
    if(a.job==='mw'){
      add(`通常攻撃（敵全体に${dm(a,a.atk)}）`,'常に敵全体へ',[],async()=>{await dmgTo(a,foesOf(a),dm(a,a.atk));});
    }else{
      add(`通常攻撃（${dm(a,a.atk)}）`,'1人に攻撃（自分・味方も可）',[P('攻撃対象',alive)],async([t])=>{await dmgTo(a,[t],dm(a,a.atk));});
    }
    switch(a.job){
      case 'sage': add('蘇生','死んだプレイヤーを体力1で蘇生',[P('蘇生する人',u=>!u.alive&&!u.isBoss&&u.side===a.side)],async([t])=>{
        t.alive=true;t.hp=1;log(`${t.name} が体力1で蘇生した！`,'heal');});break;
      case 'monk': add('回復','1人を3回復',[P('回復する人',alive)],async([t])=>{heal(t,3);});break;
      case 'warrior': add('捨て身の一撃','自身と他1人に5ダメージ',[P('もう1人の対象',u=>u.alive&&u!==a)],async([t])=>{
        await applyEvents([{src:a,to:a,amt:dm(a,5)},{src:a,to:t,amt:dm(a,5)}]);});break;
      case 'mage': add('封じの魔法','1人に1ダメージ＋次の問題休み',[P('対象',alive)],async([t])=>{
        await dmgTo(a,[t],dm(a,1));setRest(t);});break;
      case 'bm': add('必殺の一撃','1人に8ダメージ（バトル中1度だけ）',[P('対象',alive)],async([t])=>{
        a.used=true;await dmgTo(a,[t],dm(a,8));},{disabled:a.used});break;
      case 'hero': add('勇者の剣','自身を3回復し、他1人に4ダメージ',[P('対象',u=>u.alive&&u!==a)],async([t])=>{
        heal(a,3);await dmgTo(a,[t],dm(a,4));});break;
      case 'necro': {
        const n=G.units.filter(u=>!u.alive&&!u.isBoss&&u.side===a.side).length;
        add(`死者の怨念（${n}ダメージ）`,'死んでいる仲間の人数×1ダメージ',[P('対象',alive)],async([t])=>{
          if(n>0)await dmgTo(a,[t],dm(a,n));else log('死んでいる仲間がいない');});break;}
    }
    return L;
  }

  async function pickUnit(label,f,picked){
    const c=G.units.filter(u=>f(u,picked));
    if(!c.length)return null;
    const id=await ask(label,c.map(u=>({label:u.name,sub:`${jobName(u)}　HP ${u.hp}/${u.maxHp}${u.alive?'':'（死亡）'}${u.side==='e'?'　【魔王側】':''}`,value:u.id,cls:u.side==='e'?'foe':'',unit:{job:u.isBoss?'boss':u.job,side:u.side,alive:u.alive}})),{sub:'対象を選んでください'});
    return G.units.find(u=>u.id===id);
  }
  async function runAction(act){
    const picked=[];
    for(const p of act.prompts){
      const t=await pickUnit(p.label,p.f,picked);
      if(!t){log('対象がいないため不発');return;}
      picked.push(t);
    }
    await act.run(picked);
  }

  /* ---------- 進行 ---------- */
  function checkEnd(){
    if(G.over)return;
    if(G.mode==='pvp'){
      const p=G.units.some(u=>u.alive&&u.side==='p'),e=G.units.some(u=>u.alive&&u.side==='e');
      if(!p||!e)G.over=p?'teamp':e?'teame':'draw';
      return;
    }
    if(G.units.filter(u=>u.isBoss).every(b=>!b.alive))G.over='win';
    else if(!G.units.some(u=>u.alive&&u.side==='p'))G.over='lose';
  }
  function endQuestion(correct){
    for(const u of G.units){u.restNow=u.restNext;u.restNext=false;}
    G.prevCorrect=correct?correct.id:null;
    if(!correct)G.streak=0;
    G.q++; G.sel=null;
    log(`── 第${G.q}問 ──`,'sys');
    checkEnd();
  }

  async function doCorrect(a){
    log(`⭕ ${nm(a)} 正解！`,'sys');
    G.streak=(G.prevCorrect===a.id)?(G.streak||1)+1:1;
    if(a.job==='tank'){a.guards++;log(`🛡 ${a.name} の守り回数 +1 (${a.guards})`,'sys');}
    if(a.job==='playboy'&&G.streak>=2){
      const h=JOB.hero;a.job='hero';a.atk=h.atk;a.maxHp=h.hp;a.hp=h.hp;
      log(`🎲→👑 ${a.name} は連答で勇者に転職！体力リセット (HP ${a.hp})`,'sys');
    }
    if(a.isBoss&&a.bossId===3&&a.hp===1)heal(a,5);
    const acts=actionsFor(a);
    const noSpecial=acts.every(x=>x.disabled);
    const c=await ask(`${nm(a)} の行動`,[
      ...acts.map((x,i)=>({label:x.label,sub:x.desc,value:i,disabled:x.disabled||!x.prompts.every(p=>G.units.some(u=>p.f(u,[])))})),
      {label:'何もしない',value:-1,cls:'ghost'}],{sub:noSpecial?'使える行動がありません':'行動を選んでください'});
    if(c>=0)await runAction(acts[c]);
    if(a.job==='thief'&&a.alive&&!G.over){
      const g=await ask('💰 盗賊：次の問題のジャンルを選択',[...GENRES.map(x=>({label:x,value:x})),{label:'選ばない',value:null,cls:'ghost'}]);
      if(g){G.genre=g;G.genreFor=G.q+1;log(`次の問題のジャンル：${g}`,'sys');}
    }
    endQuestion(a);
  }
  async function doWrong(a){
    log(`❌ ${nm(a)} 誤答`,'sys');
    if(a.isBoss&&!G.cfg.bossPenalty)log('魔王は誤答ペナルティなし');
    else await applyEvents([{src:null,to:a,amt:2}]);
    endQuestion(null);
  }
  async function doThrow(){
    log('誰も答えず（スルー）','sys');
    for(const b of G.units) if(b.isBoss&&b.alive&&b.bossId===2&&b.form===2)heal(b,1);
    endQuestion(null);
  }

  /* ---------- トランザクション（取り消し対応） ---------- */
  async function transact(fn){
    if(busy||!G||G.over)return false;
    busy=true; emit();
    const snap=JSON.stringify(G);
    let ok=true;
    try{
      await fn();
      undoStack.push(snap); if(undoStack.length>40)undoStack.shift();
      ui.persist&&ui.persist(G);
    }catch(e){
      ok=false;
      G=JSON.parse(snap);
      if(e!==CANCEL){console.error(e);ui.toast('エラーが発生したため処理を取り消しました: '+e.message);}
    }finally{busy=false;emit();}
    return ok;
  }

  /* ---------- 公開API ---------- */
  return {
    get G(){return G;},
    get busy(){return busy;},
    get canUndo(){return undoStack.length>0;},
    /** players:[{name,job,team,pid?}] */
    start({players,mode='cpu',boss=1,bossPenalty=true}){
      G={mode,uid:1,units:[],log:[],q:1,prevCorrect:null,streak:0,genre:null,genreFor:0,sel:null,over:null,pids:{},cfg:{bossPenalty}};
      const pvp=mode==='pvp';
      for(const p of players){const u=mkUnit(p.name.trim(),p.job);if(pvp)u.side=p.team||'p';G.units.push(u);if(p.pid)G.pids[p.pid]=u.id;}
      if(pvp){
        G.units.sort((a,b)=>(a.side==='p'?0:1)-(b.side==='p'?0:1));
        log('対戦開始！ チームA vs チームB','sys');
      }else{
        const S=G.units.reduce((s,u)=>s+u.atk,0);
        G.units.push(mkBoss(+boss,S));
        const b=G.units[G.units.length-1];
        log(`バトル開始！ ${b.name} (HP ${b.hp}) ／ プレイヤー攻撃合計 ${S}`,'sys');
      }
      log('── 第1問 ──','sys');
      undoStack=[];busy=false;ui.persist&&ui.persist(G);emit();
    },
    load(saved){G=saved;undoStack=[];busy=false;emit();},
    reset(){G=null;undoStack=[];busy=false;emit();},
    select(id){
      if(!G||G.over||busy)return false;
      if(id==null){G.sel=null;emit();return true;}
      const u=G.units.find(x=>x.id===id);
      if(!u||!u.alive||u.restNow)return false;
      G.sel=id;emit();return true;
    },
    correct(){const a=G&&G.units.find(x=>x.id===G.sel);return a?transact(()=>doCorrect(a)):false;},
    wrong(){const a=G&&G.units.find(x=>x.id===G.sel);return a?transact(()=>doWrong(a)):false;},
    skip(){return transact(doThrow);},
    undo(){
      if(busy||!undoStack.length)return false;
      G=JSON.parse(undoStack.pop());G.over=null;ui.persist&&ui.persist(G);emit();return true;
    },
    /** テスト・デバッグ用 */
    _actionsFor:a=>actionsFor(a),
  };
}
