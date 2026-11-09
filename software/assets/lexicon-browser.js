(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LexiconBrowser=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const normalize=s=>String(s||'').trim().toLowerCase();
 function catalog(index,learning,conversion){
  const fallback=new Map((conversion.entries||[]).map(w=>[normalize(w.en),w]));
  return Object.entries(index.byKey).map(([key,lists])=>{const d=learning.entries[key],c=fallback.get(key);return {key,lists,definition:d?.definitions||c?.definitions||(c?.zh||[]).join('；')||'暂无释义',phonetics:d?.phonetics,examples:d?.examples||[],ecdict:d?.ecdict||'',phrases:d?.phrases||[]};}).sort((a,b)=>a.key.localeCompare(b.key,'en'));
 }
 function filter(rows,{list,letter='',query=''}){const q=normalize(query);return rows.filter(w=>(!list||w.lists.includes(list))&&(!letter||(letter==='#'?!/^[a-z]/i.test(w.key):w.key[0].toUpperCase()===letter))&&(!q||w.key.includes(q)||w.definition.toLowerCase().includes(q)));}
 function page(rows,index=0,size=40){const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.max(0,Math.min(index,pages-1));return {rows:rows.slice(current*size,(current+1)*size),pages,current,total:rows.length};}
 function create({E,icon,render,notify,stopAudio,getState}){
  const X=window.LEXICON_DATA,rows=catalog(X,window.LEARNING_DATA,window.CONVERSION_LEXICON),byKey=new Map(rows.map(w=>[w.key,w]));
  const counts=Object.fromEntries(X.lists.map(l=>[l.id,rows.filter(w=>w.lists.includes(l.id)).length]));
  let list='',letter='',query='',index=0,selected='',timer,player,sequence=0,finishClip=null,pageReading=false;
  let layout='list';try{layout=localStorage.getItem('shangyin-lex-layout')==='cards'?'cards':'list';}catch{}
  function pageStatus(text){const el=document.querySelector('[data-lex-read-status]');if(el)el.textContent=text;const b=document.querySelector('[data-lex-read-page]');if(b){b.textContent=pageReading?'停止朗读':'朗读本页单词';b.setAttribute('aria-pressed',String(pageReading));}}
  async function readPage(){
   if(pageReading){stop();return;}
   stop();stopAudio();pageReading=true;const seq=sequence;
   const current=page(filter(rows,{list,letter,query}),index).rows;
   try{for(let i=0;i<current.length;i++){
    if(seq!==sequence)return;
    const w=current[i];pageStatus(`${i+1} / ${current.length} · ${w.key}`);
    window.Pronunciation.release();const clip=await window.Pronunciation.resolve(w.key);
    if(seq!==sequence)return;
    if(!clip?.src)throw Error('此词暂缺离线录音：'+w.key);
    player=new Audio(clip.src);player.playbackRate=window.Pronunciation.getPreferences().rate;
    const ok=await new Promise(resolve=>{finishClip=resolve;player.onended=()=>resolve(true);player.onerror=()=>resolve(false);player.play().catch(()=>resolve(false));});
    if(seq!==sequence)return;finishClip=null;
    if(!ok)throw Error('未能播放：'+w.key);
   }pageReading=false;player=null;pageStatus('本页朗读完成');}
   catch(err){if(seq===sequence){pageReading=false;pageStatus(err.message);}}
  }
  function stop(){sequence++;finishClip?.(false);finishClip=null;pageReading=false;if(player){player.pause();player=null;}window.LocalTTS?.stop();pageStatus('');}
  function setList(id){list=X.lists.some(l=>l.id===id)?id:'';letter='';query='';index=0;selected='';stop();}
  async function speak(text,example=false){stop();stopAudio();const seq=sequence;try{if(example){await window.LocalTTS.speak(text);return;}const audio=await window.Pronunciation.resolve(text);if(seq!==sequence)return;if(audio?.src){player=new Audio(audio.src);player.playbackRate=window.Pronunciation.getPreferences().rate;await player.play();}else await window.LocalTTS.speak(text);}catch(err){if(seq===sequence)notify('暂时无法朗读：'+err.message);}}
  function detail(){const w=byKey.get(selected);if(!w)return `<aside class="lex-detail lex-detail-empty"><span>${icon('book')}</span><h2>点选一个单词</h2><p>在这里查看音标、中英例句与补充释义。</p></aside>`;
   const dictionary=window.LearningDictionary.resolve(w.key,{},window.LEARNING_DATA);
   const phonetics=window.WordCard.phonetics(w.key,dictionary,window.DUAL_IPA);
   const phoneticHTML=`<div class="lex-phonetics">${[['uk','英'],['us','美']].map(([id,label])=>`<span title="${E(phonetics[id].map(p=>p.ipa).join(' · '))}"><small>${label}</small> ${phonetics[id].length?E('/'+phonetics[id][0].ipa.replace(/^\/|\/$/g,'')+'/'):'暂缺音标'}</span>`).join('')}</div>`;
   const lines=[...new Set(w.definition.split(/\n/).map(s=>s.trim()).filter(Boolean))];
   const definitionHTML=`<p>${E(lines.slice(0,3).join('\n'))}</p>${lines.length>3?`<details class="lex-more-definitions"><summary>展开全部释义 · ${lines.length} 条</summary><p>${E(lines.slice(3).join('\n'))}</p></details>`:''}`;
   return `<aside class="lex-detail" aria-label="词库单词详情"><div class="lex-detail-head"><span>词库释义</span><button class="icon-button" data-lex-close aria-label="关闭词库词卡">${icon('close')}</button></div><div class="lex-detail-body"><div class="lex-word-heading"><h2>${E(w.key)}</h2><button class="icon-button" data-lex-speak="${E(w.key)}" aria-label="朗读 ${E(w.key)}">${icon('sound')}</button></div>${phoneticHTML}<div class="lex-detail-members">${w.lists.map(id=>`<span>${E(X.lists.find(l=>l.id===id)?.name||id)}</span>`).join('')}</div><section class="lex-definition"><h3>学习词库释义</h3>${definitionHTML}</section>${w.examples.slice(0,3).map((ex,i)=>`<section class="lex-example"><div><small>${E(ex.source||'学习词库')} · 例句</small><button class="icon-button" data-lex-example="${i}" aria-label="朗读第 ${i+1} 条例句">${icon('sound')}</button></div><p lang="en">${E(ex.en)}</p>${ex.zh?`<p class="muted">${E(ex.zh)}</p>`:''}</section>`).join('')||'<p class="lex-empty-note">此词暂未收录中英例句。</p>'}${w.phrases.length?`<details class="lex-supplement"><summary>常用词组 · ${w.phrases.length}</summary>${w.phrases.slice(0,12).map(p=>`<p><b>${E(p.en)}</b> ${E(p.zh)}</p>`).join('')}</details>`:''}${w.ecdict?`<details class="lex-supplement"><summary>ECDICT · 补充释义</summary><p>${E(w.ecdict)}</p></details>`:''}${window.WordNet.section(w.key,E)}</div></aside>`;
  }
  function view(){
   if(!list)return `<div class="page lexicon-page"><div class="page-heading"><div><div class="eyebrow">学习词库 / WORD COLLECTIONS</div><h1>从一个单词，读进一个世界。</h1><p>选择词库，查看全部词条、音标和中英例句。</p></div><span class="pill">${X.lists.length} 类词库 · 离线可查</span></div><div class="lex-library-grid">${X.lists.map((l,i)=>`<button class="lex-library-card" data-lex-list="${E(l.id)}" style="--library-color:${E(l.color)}"><span class="lex-library-number">${String(i+1).padStart(2,'0')}</span><h2>${E(l.id==='cet4'?'英语四级':l.id==='cet6'?'英语六级':l.name)}</h2><p><strong>${counts[l.id].toLocaleString()}</strong> 个词条</p><span class="lex-library-enter">查看词库 ${icon('arrow')}</span></button>`).join('')}</div><p class="lex-source-note">按已接入的来源词表分类，同一词可属于多个词库。数量按合并后的词条去重统计，不代表官方考试大纲数量。</p></div>`;
   const l=X.lists.find(l=>l.id===list),matches=filter(rows,{list,letter,query}),result=page(matches,index);index=result.current;
   return `<div class="page lexicon-page"><div class="breadcrumb"><button data-lex-home>全部词库</button><span>/</span><span>${E(l.name)}</span></div><div class="page-heading"><div><h1>${E(l.id==='cet4'?'英语四级':l.id==='cet6'?'英语六级':l.name)}</h1><p>完整词表 ${counts[list].toLocaleString()} 词 · 按字母浏览，或输入英文、中文释义。</p></div><label class="lex-switch">切换词库<select data-lex-switch aria-label="切换词库">${X.lists.map(x=>`<option value="${E(x.id)}" ${x.id===list?'selected':''}>${E(x.name)}</option>`).join('')}</select></label></div><div class="lex-browser-layout"><section class="lex-results"><div class="lex-search-row"><label class="searchbox">${icon('search')}<input id="lex-query" aria-label="搜索词库中的英文或中文" placeholder="搜索英文或中文释义…" value="${E(query)}" autocomplete="off"></label><button class="btn ghost small" data-lex-reset>清除筛选</button></div><div class="lex-alphabet" role="group" aria-label="按首字母筛选">${['',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ','#'].map(x=>`<button data-lex-letter="${x}" aria-pressed="${letter===x}" title="${x==='#'?'其他首字符':x||'全部字母'}">${x||'全部'}</button>`).join('')}</div><div class="lex-view-tools"><div role="group" aria-label="词库显示方式"><button class="btn secondary small" data-lex-layout="list" aria-pressed="${layout==='list'}">列表</button><button class="btn secondary small" data-lex-layout="cards" aria-pressed="${layout==='cards'}">卡片</button></div><button class="btn secondary small" data-lex-read-page aria-pressed="${pageReading}" ${result.rows.length?'':'disabled'}>${pageReading?'停止朗读':'朗读本页单词'}</button><small data-lex-read-status role="status" aria-live="polite"></small></div><div class="lex-result-count" role="status">找到 ${matches.length.toLocaleString()} 个词条${letter?' · 首字母 '+E(letter):''}${query?' · “'+E(query)+'”':''}<small>每页 40 词</small></div><div class="lex-word-list ${layout==='cards'?'lex-word-cards':''}">${result.rows.map(w=>`<button class="lex-word-row ${selected===w.key?'selected':''}" data-lex-word="${E(w.key)}" aria-pressed="${selected===w.key}"><strong lang="en">${E(w.key)}</strong><span>${E(w.definition)}</span>${icon('chevron')}</button>`).join('')||'<div class="empty"><h2>没有匹配的词条</h2><p>试试另一个词，或清除字母和搜索条件。</p><button class="btn secondary" data-lex-reset>查看本词库全部单词</button></div>'}</div><nav class="lex-pagination" aria-label="词库分页"><button class="btn secondary small" data-lex-page="-1" ${index===0?'disabled':''}>上一页</button><span>${index+1} / ${result.pages}</span><button class="btn secondary small" data-lex-page="1" ${index+1===result.pages?'disabled':''}>下一页</button></nav></section>${detail()}</div><p class="lex-source-note">词表来源：${E(l.source||'已接入的分类词库')}。释义与例句以新学习词库为主，ECDICT、WordNet 为补充。</p></div>`;
  }
  function redraw(focus=false){const pos=document.getElementById('lex-query')?.selectionStart;render();if(focus){const input=document.getElementById('lex-query');input?.focus();input?.setSelectionRange(pos,pos);}}
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const a=b.dataset;
   if('lexReadPage'in a)readPage();
   if('lexLayout'in a){layout=a.lexLayout==='cards'?'cards':'list';try{localStorage.setItem('shangyin-lex-layout',layout);}catch{}redraw();}
   if('lexList'in a){setList(a.lexList);history.replaceState(null,'',location.href.split('#')[0]+'#lexicons/'+list);redraw();}
   if('lexHome'in a){setList('');history.replaceState(null,'',location.href.split('#')[0]+'#lexicons');redraw();}
   if('lexLetter'in a){letter=a.lexLetter;index=0;selected='';stop();redraw();}
   if('lexReset'in a){stop();letter=query=selected='';index=0;redraw();}
   if('lexPage'in a){stop();index+=Number(a.lexPage);redraw();document.querySelector('.lex-results')?.scrollIntoView({block:'start'});}
   if('lexWord'in a){stop();selected=a.lexWord;redraw();if(getState?.().settings.autoSpeak)speak(selected);if(window.innerWidth>900&&window.innerWidth<1100)document.querySelector('.lex-detail')?.scrollIntoView({block:'start'});}
   if('lexClose'in a){selected='';stop();redraw();}
   if('lexSpeak'in a)speak(a.lexSpeak);
   if('lexExample'in a){const ex=byKey.get(selected)?.examples[Number(a.lexExample)];if(ex)speak(ex.en,true);}
  });
  document.addEventListener('input',e=>{if(e.target.id!=='lex-query')return;stop();query=e.target.value;index=0;clearTimeout(timer);timer=setTimeout(()=>{if(document.getElementById('lex-query'))redraw(true);},180);});
  document.addEventListener('change',e=>{if(e.target.matches('[data-lex-switch]')){setList(e.target.value);history.replaceState(null,'',location.href.split('#')[0]+'#lexicons/'+list);redraw();}});
  return {view,setList,stop};
 }
 return {catalog,filter,page,create};
});
