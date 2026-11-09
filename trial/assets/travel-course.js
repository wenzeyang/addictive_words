(function(root){
'use strict';
const original=root.TRAVEL_DATA;if(!original)return;
const D=root.STORY_DATA,L=root.LOCAL_DICTIONARY;
const unitById=new Map(),wordRecords=new Map();
const defaultAsset=path=>(root.TRAVEL_ASSET_BASE||'travel/')+path.replace(/^assets\//,'');
const editions=new Map();
function register(data,asset=defaultAsset){
 if(editions.has(data.id))return;
 editions.set(data.id,{data,asset});
 for(const u of data.units){
  const c={id:u.id,number:u.number,bookId:data.id,kind:'travel',scene:u.title,title:u.en,blurb:u.goal,icon:'airport',tags:['旅行英语'],paragraphs:[],wordIds:[],sceneWordIds:[],minutes:15,chars:0,annotationCount:0};
  const registered=new Map();
  function register(row,part,suffix){
   const en=row.term.trim(),key=en.toLowerCase(),known=registered.get(key);if(known)return known;
   const id=(data===original?'travel-':data.id+'-')+(row.id||`u${String(u.number).padStart(2,'0')}-${suffix}`),paragraph=c.paragraphs.length;
   const w={id,en,key,lemma:key,kind:en.includes(' ')?'phrase':'word',source:'travel',note:row.usage_note||'',glosses:[row.zh],chapters:[c.id],occurrences:[{chapterId:c.id,paragraph,gloss:row.zh}],travel:{part,unit:u.number,sourcePage:row.source_pdf_page,origin:row.origin||'supplement',image:row.image,imageSource:row.image_source}};
   D.words[id]=w;L.entries[id]={ipa:row.ipa||'',ipaAccent:'英式',ipaSource:'旅行英语内容稿 · 宽式英音',definitions:[row.pos,row.zh,row.usage_note].filter(Boolean).join('\n'),source:'旅行英语 · 情境释义',examples:[]};
   c.paragraphs.push([{text:`${u.title} · `},{id,en,zh:row.zh}]);c.wordIds.push(id);registered.set(key,id);wordRecords.set(id,{...row,id,part});return id;
  }
  u.words.forEach(w=>{w.wordId=register(w,1,w.id);c.sceneWordIds.push(w.wordId);});
  u.extended.forEach((w,i)=>w.wordId=register(w,2,'extended-'+i));
  u.modernPhrases.forEach((w,i)=>w.wordId=register(w,2,'phrase-'+i));
  u.diagrams.forEach(d=>d.hotspots.forEach(h=>h.wordId=register({...h,id:undefined},1,d.id+'-'+h.number)));
  c.annotationCount=c.wordIds.length;unitById.set(u.id,u);D.chapters.push(c);
 }
 D.books.push({id:data.id,kind:'travel',category:'scenes',title:data.title,volume:data.edition,genre:['旅行英语','图解词汇','双语会话'],
  synopsis:'从机场出发，走进车站、酒店、餐馆和商店。用清晰图片认识旅途中会遇到的英语，再练习手机支付、电子证件、AI工具和真实交流。',
  learningSummary:'23个单元，保留原书分类与四个学习模块；619张独立词图，搭配延伸词汇、双语会话和分类实用场景。',
  wordPreview:['airport','boarding pass','mobile wallet','eSIM','prescription'],chapterIds:data.units.map(u=>u.id),wordIds:[...new Set(data.units.flatMap(u=>D.chapters.find(c=>c.id===u.id).wordIds))]});
}
register(original);
function create(api){
 const {E,icon,getState,persist,render,navigate,selectWord,wordPanel,readingTools,stopAudio,notify,saveScroll}=api;
 let data=original;
 const asset=path=>editions.get(data.id).asset(path);
 function selectEdition(id){if(id)data=editions.get(id).data;}
 let activePart=1,activeUnit='',group='all',query='',selectedId='';
 const state=()=>getState();
 const parts=['图解词汇','延伸词汇','会话练习','场景与短剧'];
 function unit(c){return unitById.get(c.id);}
 function setPart(p){saveScroll();activePart=p;group='all';query='';const c=D.chapters.find(c=>c.id===activeUnit);state().progress[c.id]={...(state().progress[c.id]||{}),travelPart:p,ratio:0,updated:Date.now()};persist();render();}
 function cover(book){selectEdition(book?.id);return `<div class="travel-cover"><img src="${E(asset(data.units[0].overview))}" alt="现代机场出发大厅" width="360" height="220"><div><small>上瘾单词 · 专题场景</small><strong>带着英语<br>去旅行</strong><span>23个单元 · 现代旅行英语</span></div></div>`;}
 function bookPage(b,filter){selectEdition(b.id);
  const all=D.chapters.filter(c=>c.bookId===b.id),last=all.find(c=>c.id===state().lastChapter)||all[0],done=all.filter(c=>state().progress[c.id]?.completed).length;
  const shown=all.filter(c=>filter==='read'?state().progress[c.id]?.completed:filter==='unread'?!state().progress[c.id]?.completed:true);
  return `<div class="page travel-book-page"><div class="breadcrumb"><button data-nav="scenes">专题场景</button><span>/</span>旅行英语</div><header class="page-heading"><div><h1>${E(b.title)}</h1><p>${E(b.learningSummary)}</p></div><span class="pill">已完成 ${done} / 23 单元</span></header><section class="travel-book-intro"><div><h2>下一段旅程，先练一句。</h2><p>${E(b.synopsis)}</p><div class="travel-book-facts"><span>619 幅独立词图</span><span>9 幅编号图解</span><span>4 个学习模块</span></div><button class="btn" data-open-chapter="${last.id}">${icon('book')}${state().progress[last.id]?'继续学习 · '+E(last.scene):'开始第一单元'}</button></div><img src="${E(asset(data.units[0].overview))}" alt="机场出发大厅中的自助值机和旅客" width="680" height="383"></section><div class="section-heading"><h2>单元目录 <small>按旅行顺序，也可以挑场景学习</small></h2><div class="filter-row">${[['all','全部单元'],['unread','还没完成'],['read','已经完成']].map(([v,t])=>`<button class="filter ${filter===v?'active':''}" data-shelf-filter="${v}">${t}</button>`).join('')}</div></div><div class="travel-unit-grid">${shown.map(c=>{const u=unit(c),p=state().progress[c.id];return `<button class="travel-unit-card" data-open-chapter="${c.id}"><img src="${E(asset(u.overview))}" alt="${E(u.title)}场景" width="384" height="216" loading="lazy"><span class="travel-unit-copy"><small>单元 ${u.number}${p?.completed?' · 已完成':''}</small><strong>${E(u.title)}</strong><span lang="en">${E(u.en)}</span><span>${u.words.length} 个图解词条 · ${u.sourceScenes.length+u.modernScenes.length} 项分类练习</span></span></button>`;}).join('')}</div>${shown.length?'':'<p class="empty">当前筛选下没有单元，可以切换到“全部单元”。</p>'}</div>`;
 }
 function wordButton(w){return `<button class="travel-word-card ${selectedId===w.wordId?'selected':''}" data-travel-word="${E(w.wordId)}" aria-pressed="${selectedId===w.wordId}"><img src="${E(asset(w.image))}" alt="${E(w.zh)}" width="1024" height="768" loading="lazy" decoding="async" data-travel-image><span class="travel-word-copy"><strong class="travel-en" lang="en">${E(w.term)}</strong><span class="travel-ipa">${E(w.ipa)}</span><span class="travel-zh">${E(w.zh)}</span></span></button>`;}
 function diagram(d){return `<figure class="travel-shared-figure"><figcaption><h3>${E(d.title)}</h3><a href="${E(asset(d.image))}" target="_blank" rel="noopener">查看高清原图 ${icon('external')}</a></figcaption><div class="travel-diagram-scroll" tabindex="0" aria-label="${E(d.title)}，可横向滚动"><div class="travel-diagram-stage"><img src="${E(asset(d.image))}" alt="${E(d.title)}，编号对应下方词语" width="2400" height="1350" loading="lazy" data-travel-image>${d.hotspots.map(h=>`<button class="travel-hotspot" style="left:${h.x*100}%;top:${h.y*100}%" data-travel-word="${E(h.wordId)}" aria-label="${h.number}，${E(h.term)}，${E(h.zh)}" title="${h.number}. ${E(h.term)}"></button>`).join('')}</div></div><p class="travel-hint">点击编号或下方词语查看词卡；窄屏可左右滑动图解。</p><div class="travel-diagram-legend">${d.hotspots.map(h=>`<button data-travel-word="${E(h.wordId)}"><b>${h.number}</b><span class="travel-en" lang="en">${E(h.term)}</span><span class="travel-zh">${E(h.zh)}</span></button>`).join('')}</div><details class="travel-source"><summary>图解说明与来源</summary><p>${E(d.note)}</p><p>${E(d.source)} · 虚构教学数据</p></details></figure>`;}
 function categoryEntries(u){return [...new Set(u.words.map(w=>w.group))].map((name,i)=>({id:'travel-group-'+i,name})).concat(u.diagrams.map(d=>({id:'travel-diagram-'+d.id,name:d.title.split('：')[0]})));}
 function vocabulary(u){
  const names=[...new Set(u.words.map(w=>w.group))];
  return `<div class="travel-vocab-grid">${names.map((n,i)=>`<h3 class="travel-group-heading" id="travel-group-${i}" data-travel-section>${E(n)}</h3>${u.words.filter(w=>w.group===n).map(wordButton).join('')}`).join('')}${u.diagrams.map(d=>`<div class="travel-diagram-section" id="travel-diagram-${E(d.id)}" data-travel-section>${diagram(d)}</div>`).join('')}</div>`;
 }
 function categoryNav(u){return `<nav class="travel-category-nav" aria-label="本单元图解分类"><strong>本页分类</strong>${categoryEntries(u).map((c,i)=>`<button data-travel-anchor="${E(c.id)}" ${i===0?'aria-current="location"':''}>${E(c.name)}</button>`).join('')}</nav>`;}
 let scrollRoot=null,spyFrame=0;
 function afterRender(){
  scrollRoot=document.querySelector('.travel-reading-scroll');if(!scrollRoot)return;
  const sc=scrollRoot;
  function update(){spyFrame=0;if(!sc.isConnected)return;const sections=[...sc.querySelectorAll('[data-travel-section]')],top=sc.getBoundingClientRect().top+36;let active=sections[0];for(const item of sections){if(item.getBoundingClientRect().top<=top)active=item;else break;}if(sc.scrollTop+sc.clientHeight>=sc.scrollHeight-5)active=sections.at(-1);if(active)document.querySelectorAll('[data-travel-anchor]').forEach(b=>{const yes=b.dataset.travelAnchor===active.id;b.classList.toggle('active',yes);if(yes)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');});}
  sc.addEventListener('scroll',()=>{if(!spyFrame)spyFrame=requestAnimationFrame(update);},{passive:true});requestAnimationFrame(update);
 }
 function phraseRows(rows){return `<div class="travel-phrase-list">${rows.map(w=>`<div><button data-travel-word="${E(w.wordId)}" class="travel-en" lang="en">${E(w.term)}</button><span class="travel-zh">${E(w.zh)}</span></div>`).join('')}</div>`;}
 function extended(u){return `${u.extended.length?`<h3>${u.number===22?'原书拨号图示字段':'原书延伸词汇'}</h3>${phraseRows(u.extended)}`:'<p class="travel-hint">原书本章没有独立延伸词表，原会话保留在“会话练习”；下面补充当代场景表达。</p>'}<h3 class="travel-section-title">现代扩展</h3>${phraseRows(u.modernPhrases)}`;}
 function rich(text){return E(text).replace(/`([^`]+)`/g,'<code>$1</code>');}
 function say(en){return `<button class="icon-button travel-say" data-travel-say="${E(en)}" aria-label="朗读 ${E(en)}">${icon('sound')}</button>`;}
 function dialogue(lines){return `<div class="travel-dialogue">${lines.map(l=>`<div class="travel-dialogue-line"><span class="travel-role">${E(l.role)}</span><div><p class="travel-en" lang="en">${E(l.en)}</p><p class="travel-zh">${E(l.zh)}</p></div>${say(l.en)}</div>`).join('')}</div>`;}
 function scenes(u){return `<h3>分类实用表达</h3><div class="travel-scene-list">${u.sourceScenes.map(s=>`<section><h4>${E(s.name)}</h4><div class="travel-expression"><p class="travel-en" lang="en">${E(s.english)}</p>${say(s.english)}</div><p class="travel-zh">${E(s.chinese)}</p></section>`).join('')}</div><h3 class="travel-section-title">现代场景问答</h3><div class="travel-scene-list">${u.modernScenes.map(s=>`<section><h4>${E(s.name)}</h4>${dialogue([{role:'A',en:s.question,zh:s.translation.split('／')[0]},{role:'B',en:s.answer,zh:s.translation.split('／').slice(1).join('／')}])}</section>`).join('')}</div><h3 class="travel-section-title">旅游实用短剧</h3><p class="travel-scenario">${E(u.drama.scenario)}</p>${dialogue(u.drama.lines)}${u.reminder?`<div class="travel-reminder"><strong>现代旅行提醒</strong><p>${rich(u.reminder)}</p></div>`:''}`;}
 function reader(c){selectEdition(c.bookId);
  const u=unit(c);if(activeUnit!==c.id){activeUnit=c.id;activePart=state().progress[c.id]?.travelPart||1;group='all';query='';selectedId='';}
  const p=state().progress[c.id],mode=state().settings.mode;
  return `<div class="reader-page travel-reader"><div class="reader-top"><div class="breadcrumb"><button data-nav="scenes">专题场景</button><span>/</span><button data-open-book="${data.id}">带着英语去旅行</button><span>/</span>${E(u.title)}</div><div class="reader-top-right">${readingTools.toolbar()}<button class="btn ghost small" data-start-quiz="${c.id}">${icon('target')}单元练习</button></div></div><div class="reader-grid"><section class="reader-main" aria-label="旅行英语学习内容"><div class="travel-unit-toolbar"><label>学习单元<select data-travel-unit aria-label="选择旅行英语单元">${data.units.map(x=>`<option value="${x.id}" ${x.id===c.id?'selected':''}>${x.number}. ${E(x.title)}</option>`).join('')}</select></label><div class="mode-switch" role="group" aria-label="旅行英语阅读方式">${[['learn','双语'],['recall','只看英文'],['spell','回想英文']].map(([m,t])=>`<button data-travel-mode="${m}" class="${mode===m?'active':''}">${t}</button>`).join('')}</div></div><div class="travel-part-tabs" role="group" aria-label="旅行英语学习模块">${parts.map((t,i)=>`<button data-travel-part="${i+1}" aria-pressed="${activePart===i+1}" class="${activePart===i+1?'active':''}">${icon(['book','plus','sound','travel'][i])}<span>Part ${i+1}</span><b>${t}</b></button>`).join('')}</div><div class="travel-content-layout ${activePart===1?'has-category-nav':''}">${activePart===1?categoryNav(u):''}<div id="reading-scroll" class="reading-scroll travel-reading-scroll mode-${E(mode)}" tabindex="0" aria-label="可滚动的旅行英语内容"><header class="travel-unit-heading"><p>单元 ${u.number} / 23</p><h1>${E(u.title)}<small lang="en">${E(u.en)}</small></h1><p>${E(u.goal)}</p></header><div class="travel-part-content">${activePart===1?vocabulary(u):activePart===2?extended(u):activePart===3?dialogue(u.conversation):scenes(u)}</div><div class="travel-unit-end"><button class="btn secondary" data-complete="${c.id}">${icon('check')}${p?.completed?'已读完':'标记本单元完成'}</button>${data.units[u.number]?`<button class="btn" data-open-chapter="${data.units[u.number].id}">下一单元 ${icon('arrow')}</button>`:`<button class="btn" data-open-book="${data.id}">返回单元目录</button>`}<details class="travel-source"><summary>教学说明与资料来源</summary><p>会话中的金额、时限、服务承诺及证件均为虚构教学示例。实际要求请向相应服务方确认。</p><p><a href="${E((root.TRAVEL_ASSET_BASE||'travel/')+'图片署名与许可.md')}" target="_blank" rel="noopener">图片署名与许可</a></p>${u.references.map(r=>`<p><a href="${E(r.url)}" target="_blank" rel="noopener">${E(r.label)}</a></p>`).join('')}</details></div></div></div><div class="reader-bottom"><div class="progress-track"><span id="read-percent">${Math.round((p?.ratio||0)*100)}%</span><div class="mini-bar"><span id="read-bar" style="width:${(p?.ratio||0)*100}%"></span></div></div><span>学习进度自动保存</span><button data-open-book="${data.id}" class="muted">返回目录</button></div></section><aside class="reader-rail" aria-label="旅行英语词卡"><section class="rail-card" id="word-panel">${wordPanel()}</section><section class="rail-card travel-help"><h3>看图、点词，再开口</h3><p>点小图或大图编号，在词卡中听读音、查看词义，也可以加入生词本复习。</p></section></aside></div><button class="mobile-word-scrim" data-close-word aria-label="关闭词卡"></button></div>`;
 }
 function focusWord(id){selectedId=id;selectWord(id,activeUnit);document.querySelectorAll('[data-travel-word]').forEach(b=>{const yes=b.dataset.travelWord===id;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));});}
 function locate(id,occ){const record=wordRecords.get(id);if(!record)return;const p=state().progress[occ.chapterId]||{};state().progress[occ.chapterId]={...p,travelPart:record.part,ratio:0,updated:Date.now()};activeUnit='';persist();}
 let inputTimer;
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const a=b.dataset;
  if(a.travelAnchor){const target=document.getElementById(a.travelAnchor);if(target&&scrollRoot){scrollRoot.scrollTo({top:scrollRoot.scrollTop+target.getBoundingClientRect().top-scrollRoot.getBoundingClientRect().top-16,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
  if(a.travelPart)setPart(Number(a.travelPart));
  if(a.travelWord)focusWord(a.travelWord);
  if(a.travelMode){saveScroll();state().settings.mode=a.travelMode;persist();render();}
  if(a.travelSay){stopAudio();root.LocalTTS.speak(a.travelSay).catch(err=>notify(err.message));}
 });
 document.addEventListener('change',e=>{if(e.target.matches('[data-travel-unit]'))navigate('reader',e.target.value);if(e.target.matches('[data-travel-group]')){group=e.target.value;saveScroll();state().progress[activeUnit]={...(state().progress[activeUnit]||{}),ratio:0};render();}});
 document.addEventListener('input',e=>{if(!e.target.matches('[data-travel-search]'))return;const value=e.target.value,pos=e.target.selectionStart;clearTimeout(inputTimer);inputTimer=setTimeout(()=>{query=value;saveScroll();state().progress[activeUnit]={...(state().progress[activeUnit]||{}),ratio:0};render();const input=document.querySelector('[data-travel-search]');input?.focus();input?.setSelectionRange(pos,pos);},180);});
 document.addEventListener('error',e=>{const im=e.target;if(im.matches?.('img[data-travel-image]')&&!im.nextElementSibling?.classList.contains('travel-image-error')){im.hidden=true;const p=document.createElement('p');p.className='travel-image-error';p.textContent='图片未能打开，请将随附的图片文件夹与网页放在一起。';im.after(p);}},true);
 function clearSelection(){selectedId='';document.querySelectorAll('[data-travel-word].selected').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});}
 return {reader,bookPage,cover,locate,asset,clearSelection,afterRender};
}
function wordSource(w,E){const t=w.travel,photo=t.imageSource;return `旅行英语 · ${t.sourcePage?'原书PDF '+t.sourcePage+' 页':'现代扩展'}${photo?.type==='licensed-photo'?`<p>图片：${E(photo.author)} · <a href="${E(photo.source_page)}" target="_blank" rel="noopener">来源</a> · <a href="${E(photo.license_url)}" target="_blank" rel="noopener">${E(photo.license)}</a></p>`:''}`;}
root.TravelCourse={create,register,isBook:b=>b?.kind==='travel',isChapter:c=>c?.kind==='travel',wordSource,data:original,asset:defaultAsset};
})(window);
