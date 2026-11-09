(function(root){
 'use strict';
 const safeImage=s=>typeof s==='string'&&s.length<4000000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)?s:'';
 function cover(book,E){
  const number=book.id.match(/(\d+)$/)?.[1]||'';
  return `<div class="funny-cover" data-volume="${E(number)}"><span class="funny-cover-series">上瘾单词 · 趣味英语</span><strong>趣味单词书 <b>${E(number)}</b></strong>${safeImage(book.coverData)?`<img src="${E(book.coverData)}" alt="全新绘制的趣味学习插画" loading="lazy">`:''}<span>${E(book.volume.split(' · ')[0])}</span><small>${book.contentRevision===2?'维克老师课堂 · 全文校订':'原书学习内容 · 原创插画'}</small></div>`;
 }
 function revised(c,{E,tokenHTML}){
  const comics=root.FunnyComics?.chapters?.[c.id]||{};
  const hasComics=Object.keys(comics).length>0;
  let showComics=true;try{showComics=localStorage.getItem('shangyin-funny-comics')!=='hidden';}catch{}
  const paragraph=(pi,extra='')=>{
   const tokens=c.paragraphs[pi]||[];
   return `<p id="paragraph-${pi}" data-p="${pi}" class="textbook-block ${extra}">${tokens.map(t=>t.bare?`<button class="textbook-inline-word" data-word="${E(t.id)}" data-chapter="${E(c.id)}" data-paragraph="${pi}" aria-label="查看 ${E(t.en)} 的词卡">${E(t.en)}</button>`:tokenHTML(t,c.id,pi)).join('')}</p>`;
  };
  const sections=c.lessonSections.map((s,si)=>{
   let html='';
   for(let bi=0;bi<s.blocks.length;bi++){
    const b=s.blocks[bi];
    if(b.kind==='example-en'){
     html+='<div class="textbook-example" aria-label="双语例句">'+paragraph(b.paragraph,'textbook-example-en');
     if(s.blocks[bi+1]?.kind==='example-zh')html+=paragraph(s.blocks[++bi].paragraph,'textbook-example-zh');
     html+='</div>';
    }else if(b.kind==='question'){
     html+='<div class="textbook-exercise">'+paragraph(b.paragraph,'textbook-question');
     if(s.blocks[bi+1]?.kind==='answer')html+='<details class="textbook-answers"><summary>查看答案与讲解</summary>'+paragraph(s.blocks[++bi].paragraph)+'</details>';
     html+='</div>';
    }else if(b.kind==='answer'){
     html+='<details class="textbook-answers"><summary>查看答案与讲解</summary>'+paragraph(b.paragraph)+'</details>';
    }else html+=paragraph(b.paragraph);
   }
   const comic=comics[s.title];
   const image=comic&&/^funny-comics\/[a-z0-9-]+\.png$/.test(comic.src)?`<figure class="lesson-comic"><button type="button" data-funny-comic="${E(comic.src)}" data-comic-alt="${E(comic.alt)}" aria-label="放大漫画：${E(s.title)}"><img src="${E(comic.src)}" alt="${E(comic.alt)}" width="1024" height="1536" loading="lazy" decoding="async"></button><figcaption>${E(comic.caption)} · 点击放大</figcaption></figure>`:'';
   return `<section class="textbook-page textbook-lesson" id="textbook-section-${si}"><h2>${E(s.title)}</h2>${image?`<div class="lesson-illustrated">${image}<div class="lesson-prose">${html}</div></div>`:html}</section>`;
  }).join('');
  return `<div class="textbook-content textbook-revised${showComics?'':' comics-hidden'}">${hasComics?`<div class="lesson-comic-tools"><label><input type="checkbox" data-funny-comics-visible ${showComics?'checked':''}>显示趣味漫画</label></div>`:''}<div class="textbook-note"><strong>维克老师趣味课堂</strong><span>全文校订版 · 讲解 / 双语例句 / 小练习</span><details><summary>内容与来源</summary><p>本章重新梳理了词义、搭配与讲解，原书 PDF 第 ${c.sourceRange.map(Number).join('—')} 页为主题来源范围；重组后不再逐页对应。趣味插图按学习主题配图，相近主题可能复用。</p></details></div><details class="textbook-vocabulary"><summary>本章词汇 · ${c.wordIds.length} 个 <small>点词查看音标、释义和例句</small></summary><div>${c.lessonVocabulary.map(t=>`<p>${tokenHTML(t,c.id,t.paragraph)}</p>`).join('')}</div></details><nav class="textbook-pages textbook-sections" aria-label="本章小节">${c.lessonSections.map((s,i)=>`<a href="#textbook-section-${i}" data-textbook-section="${i}">${E(s.title)}</a>`).join('')}</nav>${sections}</div>`;
 }
 function render(c,{E,tokenHTML}){
  if(c.contentRevision===2&&Array.isArray(c.lessonSections))return revised(c,{E,tokenHTML});
  const source=c.textbookPages||[];
  const vocabulary=new Map(c.paragraphs.flatMap((ts,pi)=>ts.filter(t=>t.id).map(t=>[t.en.toLowerCase(),{...t,pi}])));
  function linkedText(text){
   let result='',last=0;
   for(const m of text.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)){
    result+=E(text.slice(last,m.index));const t=vocabulary.get(m[0].toLowerCase());
    result+=t?`<button class="textbook-inline-word" data-word="${E(t.id)}" data-chapter="${E(c.id)}" data-paragraph="${t.pi}" aria-label="查看 ${E(m[0])} 的词卡">${E(m[0])}</button>`:E(m[0]);last=m.index+m[0].length;
   }
   return result+E(text.slice(last));
  }
  const blocks=(list)=>list.map(b=>{
   const text=b.text;
   const english=!/[\u4e00-\u9fff]/.test(text)&&/[A-Za-z]/.test(text);
   const heading=text.length<26&&!/[。！？.!?，,]/.test(text)&&!english;
   return `<${heading?'h3':'p'} class="textbook-block${english?' textbook-english':''}">${linkedText(text)}</${heading?'h3':'p'}>`;
  }).join('');
  const body=(page)=>{
   const list=page.blocks.filter(b=>b.kind==='body');
   const answer=c.textbookVolume===4?list.findIndex(b=>/^Answers?\b/i.test(b.text.trim())):-1;
   return answer<0?blocks(list):blocks(list.slice(0,answer))+`<details class="textbook-aside textbook-answers"><summary>查看原书参考答案</summary>${blocks(list.slice(answer))}</details>`;
  };
  return `<div class="textbook-content"><div class="textbook-note"><strong>学习整理版</strong><span>原书讲解与练习 · PDF 第 ${E(String(c.sourceRange[0]))}—${E(String(c.sourceRange[1]))} 页</span><details><summary>整理说明</summary><p>已剔除推广、出版资料和重复页眉。扫描文字尚未逐字校对，英文连写和个别字词可能有识别误差。下方词汇索引的释义、音标与例句由本地词典补充。</p></details></div><details class="textbook-vocabulary"><summary>本章词汇 · ${c.wordIds.length} 个 <small>点词查看音标、释义和例句</small></summary><div>${c.paragraphs.map((ts,pi)=>`<p id="paragraph-${pi}" data-p="${pi}">${ts.map(t=>tokenHTML(t,c.id,pi)).join('')}</p>`).join('')}</div></details><nav class="textbook-pages" aria-label="本章来源页码">${source.map(p=>`<a href="#textbook-page-${Number(p.page)}" data-textbook-page="${Number(p.page)}">${Number(p.page)}</a>`).join('')}</nav>${source.map(p=>`<section class="textbook-page" id="textbook-page-${Number(p.page)}"><header><span>学习内容</span><small>来源 PDF 第 ${Number(p.page)} 页</small></header>${body(p)}${p.blocks.some(b=>b.kind==='answers')?`<details class="textbook-aside textbook-answers"><summary>查看原书参考答案</summary>${blocks(p.blocks.filter(b=>b.kind==='answers'))}</details>`:''}${p.blocks.some(b=>b.kind==='aside'||b.kind==='labels')?`<details class="textbook-aside"><summary>词根与词汇补充</summary>${blocks(p.blocks.filter(b=>b.kind==='aside'||b.kind==='labels'))}</details>`:''}</section>`).join('')}</div>`;
 }
 document.addEventListener('click',e=>{const a=e.target.closest('[data-textbook-page]');if(!a)return;e.preventDefault();document.getElementById('textbook-page-'+a.dataset.textbookPage)?.scrollIntoView({block:'start',behavior:'smooth'});});
 document.addEventListener('click',e=>{const a=e.target.closest('[data-textbook-section]');if(!a)return;e.preventDefault();document.getElementById('textbook-section-'+a.dataset.textbookSection)?.scrollIntoView({block:'start',behavior:'smooth'});});
 document.addEventListener('change',e=>{if(!e.target.matches('[data-funny-comics-visible]'))return;const show=e.target.checked;document.querySelectorAll('.textbook-revised').forEach(el=>el.classList.toggle('comics-hidden',!show));try{localStorage.setItem('shangyin-funny-comics',show?'visible':'hidden');}catch{}});
 document.addEventListener('click',e=>{
  const button=e.target.closest('[data-funny-comic]');if(!button)return;
  const src=button.dataset.funnyComic;if(!/^funny-comics\/[a-z0-9-]+\.png$/.test(src))return;
  let dialog=document.getElementById('funny-comic-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='funny-comic-dialog';dialog.className='funny-comic-dialog';dialog.setAttribute('aria-label','趣味漫画大图');dialog.innerHTML='<form method="dialog"><button type="submit" autofocus aria-label="关闭漫画大图">关闭</button></form><img alt="">';document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});}
  const image=dialog.querySelector('img');image.src=src;image.alt=button.dataset.comicAlt||'趣味漫画';dialog.showModal();
 });
 root.FunnyReader={render,cover,safeImage};
})(window);
