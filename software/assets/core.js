(function (root, factory) {
  const design = typeof module === 'object' && module.exports ? require('./presentation.js') : root.ReadingDesign;
  const options = typeof module === 'object' && module.exports ? require('./reading-options.js') : root.ReadingOptions;
  const shelf = typeof module === 'object' && module.exports ? require('./bookshelf.js') : root.BookShelf;
  const api = factory(design,options,shelf);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StoryCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P,O,S) {
  'use strict';
  const VERSION = 1;
  const STORAGE_KEY = 'zhiyu-story-cet4-v1';
  const modes = ['learn', 'recall', 'spell', 'chinese', 'challenge'];
  function dayKey(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function defaults() {
    return {schemaVersion: VERSION, exclusionDefaultsVersion:1, settings: {mode:'learn',fontSize:20,lineHeight:2.3,goal:10,autoSpeak:true,theme:'moss',markStyle:'segments',illustrationMode:'chapter',lexColors:{...P.defaults},...O.clean()},
      lastChapter:'ch01', shelf:S.clean(), bookProfiles:{}, bookTags:{}, translationEdits:{}, importDraft:{name:'',scope:['cet4','ielts'],excluded:[...P.defaultExcluded]}, progress:{}, saved:{}, practice:{}, days:{}, feedback:[]};
  }
  function normalizeAnswer(value) {
    return String(value).normalize('NFKC').toLowerCase().trim().replace(/[’‘]/g,"'")
      .replace(/[.!?。！？]+$/g,'').replace(/\s+/g,' ').trim();
  }
  function checkAnswer(value, expected) { return normalizeAnswer(value) === normalizeAnswer(expected); }
  function shuffle(items, random=Math.random) {
    const copy=items.slice();
    for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
    return copy;
  }
  function buildQuiz(ids, words, count=10, random=Math.random, chapterId=null, preferredOccurrences=null) {
    const candidates=[...new Set(ids)].map(id=>words[id]).filter(Boolean);
    const picked=shuffle(candidates.filter(w=>w.en.length<=48), random).slice(0,count);
    return picked.map((word,index)=>{
      const occurrence=preferredOccurrences?.[word.id]||word.occurrences.find(o=>o.chapterId===chapterId)||word.occurrences[0];
      const gloss=occurrence.gloss;
      const canSpell=word.kind==='word' || word.kind==='phrase' && word.en.length<25;
      const type=index%4===3 && canSpell ? 'spell' : 'choice';
      const incorrect=[];
      const seen=new Set([gloss]);
      for(const other of shuffle(Object.values(words).filter(w=>w.id!==word.id),random)){
        const g=other.glosses[0];
        if(seen.has(g)||word.glosses.includes(g)||word.glosses.some(x=>x.includes(g)||g.includes(x)))continue;
        if((word.kind==='word') !== (other.kind==='word'))continue;
        seen.add(g);incorrect.push(g);if(incorrect.length===3)break;
      }
      return {wordId:word.id,en:word.en,gloss,type,occurrence,
        choices:shuffle([gloss,...incorrect],random)};
    });
  }
  function ensureDay(state,now=Date.now()) {
    const key=dayKey(now);
    if(!state.days[key])state.days[key]={seconds:0,answered:0,correct:0,reviewed:0,wordIds:[]};
    return state.days[key];
  }
  function saveWord(state,id,chapterId,now=Date.now(),paragraph=0,occurrence=null) {
    if(!state.saved[id]) state.saved[id]={added:now,due:now,interval:0,reviews:0,known:false,mistakes:0,chapterId,paragraph};
    if(occurrence?.source==='chinese-mechanical'&&state.saved[id].chapterId===chapterId&&state.saved[id].paragraph===paragraph)state.saved[id].matchedGloss=String(occurrence.gloss||'').slice(0,120);
    return state.saved[id];
  }
  function recordAnswer(state,question,correct,now=Date.now()) {
    const id=question.wordId,day=ensureDay(state,now);
    day.answered++;day.correct+=correct?1:0;
    if(!day.wordIds.includes(id))day.wordIds.push(id);
    const entry=state.practice[id]||(state.practice[id]={correct:0,wrong:0,last:now});
    entry[correct?'correct':'wrong']++;entry.last=now;
    if(!correct){const w=saveWord(state,id,question.occurrence.chapterId,now,question.occurrence.paragraph,question.occurrence);w.mistakes++;w.known=false;w.due=now;w.chapterId=question.occurrence.chapterId;w.paragraph=question.occurrence.paragraph;if(question.occurrence.source==='chinese-mechanical')w.matchedGloss=String(question.occurrence.gloss).slice(0,120);else delete w.matchedGloss;}
  }
  function reviewWord(state,id,rating,now=Date.now()) {
    const word=state.saved[id];if(!word)return;
    word.reviews++;
    if(rating==='again'){word.interval=0;word.due=now+10*60*1000;word.known=false;}
    else if(rating==='good'){word.interval=word.interval<=0?1:Math.min(30,Math.max(3,word.interval*2));word.due=now+word.interval*86400000;word.known=false;}
    else if(rating==='easy'){word.interval=Math.max(7,Math.min(60,word.interval*3||7));word.due=now+word.interval*86400000;word.known=true;}
    ensureDay(state,now).reviewed++;
  }
  function dueIds(state,now=Date.now()) {return Object.keys(state.saved).filter(id=>state.saved[id].due<=now).sort((a,b)=>state.saved[a].due-state.saved[b].due);}
  function streak(state,now=new Date()) {
    let n=0;const d=new Date(now);const active=k=>state.days[k] && (state.days[k].seconds>=30||state.days[k].answered>0||state.days[k].reviewed>0);
    if(!active(dayKey(d)))d.setDate(d.getDate()-1);
    for(let i=0;i<3660&&active(dayKey(d));i++){n++;d.setDate(d.getDate()-1);}return n;
  }
  function finite(value, fallback, min=0,max=Number.MAX_SAFE_INTEGER) {return typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;}
  function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
  function migrateChapters(input,data) {
    if(!input||typeof input!=='object')return input;
    let out=input;
    for(const book of data.books||[]){const m=book.chapterMigration;if(!m?.mappings)continue;
      const locate=(id,paragraph=0)=>{const rs=m.mappings[id];if(!rs?.length)return null;const n=Math.max(0,Number(paragraph)||0),r=rs.find(r=>n>=r[0]&&n<=r[1])||rs[rs.length-1];return [r[2],r[3]+Math.max(0,Math.min(n,r[1])-r[0])];};
      out={...out,progress:{...out.progress},saved:{...out.saved}};
      for(const [id,p]of Object.entries(input.progress||{})){if(!p||typeof p!=='object')continue;const target=locate(id,p.paragraph);if(!target)continue;const [cid,pi]=target,prior=out.progress[cid];if(!prior||(p.updated||0)>(prior.updated||0))out.progress[cid]={...p,paragraph:pi,ratio:pi/Math.max(1,m.counts[cid]-1),completed:false};delete out.progress[id];}
      for(const [cid,ids]of Object.entries(m.required||{}))if(ids.length&&ids.every(id=>input.progress?.[id]?.completed)&&!input.progress?.[cid])out.progress[cid]={...out.progress[cid],completed:true,ratio:1,paragraph:m.counts[cid]-1,updated:Math.max(...ids.map(id=>Number(input.progress[id].updated)||0))};
      for(const [id,w]of Object.entries(out.saved)){if(!w||typeof w!=='object')continue;const target=locate(w.chapterId,w.paragraph);if(target)out.saved[id]={...w,chapterId:target[0],paragraph:target[1]};}
      const last=locate(out.lastChapter,input.progress?.[out.lastChapter]?.paragraph);if(last)out.lastChapter=last[0];
    }return out;
  }
  function sanitize(input,data) {
    input=migrateChapters(input,data);
    if(!object(input)||input.schemaVersion!==VERSION)throw new Error('这不是可识别的学习备份，或备份版本暂不兼容。');
    const out=defaults();const chapters=new Set(data.chapters.map(c=>c.id));
    if(object(input.settings)){
      out.settings.mode=modes.includes(input.settings.mode)?input.settings.mode:'learn';
      out.settings.autoSpeak=input.settings.autoSpeak!==false;
      out.settings.theme=P.allThemes(input.settings).some(t=>t.id===input.settings.theme)?input.settings.theme:'moss';
      out.settings.customThemes=P.cleanThemes(input.settings.customThemes);
      out.settings.markStyle=input.settings.markStyle==='stacked'?'stacked':'segments';
      out.settings.illustrationMode=['chapter','inline','scene','none'].includes(input.settings.illustrationMode)?input.settings.illustrationMode:'chapter';
      out.settings.lexColors=P.cleanColors(input.settings.lexColors);
      out.settings.goal=finite(input.settings.goal,10,5,50);
      Object.assign(out.settings,O.clean(input.settings));
    }
    out.shelf=S.clean(input.shelf);
    if(chapters.has(input.lastChapter))out.lastChapter=input.lastChapter;
    if(object(input.bookProfiles))for(const book of data.books||[])if(Object.hasOwn(input.bookProfiles,book.id))out.bookProfiles[book.id]=P.cleanProfile(input.bookProfiles[book.id]);
    if(object(input.bookTags))for(const book of data.books||[])if(Array.isArray(input.bookTags[book.id]))out.bookTags[book.id]=[...new Set(input.bookTags[book.id].filter(tag=>typeof tag==='string').map(tag=>tag.trim().slice(0,24)).filter(Boolean))].slice(0,12);
    if(object(input.translationEdits))for(const [key,edit] of Object.entries(input.translationEdits)){
      if(!object(edit)||!/^[^|]{1,120}\|\d{1,5}\|[^|]{1,120}$/.test(key)||!['remove','replace'].includes(edit.action))continue;
      if(edit.action==='remove'){out.translationEdits[key]={action:'remove'};continue;}
      if(typeof edit.wordId!=='string'||typeof edit.en!=='string'||typeof edit.gloss!=='string')continue;
      out.translationEdits[key]={action:'replace',wordId:edit.wordId.slice(0,120),en:edit.en.slice(0,120),gloss:edit.gloss.slice(0,120),lists:Array.isArray(edit.lists)?[...new Set(edit.lists.filter(x=>typeof x==='string').map(x=>x.slice(0,40)))].slice(0,20):[],definitions:typeof edit.definitions==='string'?edit.definitions.slice(0,4000):'',ipa:typeof edit.ipa==='string'?edit.ipa.slice(0,160):'',source:typeof edit.source==='string'?edit.source.slice(0,120):''};
    }
    if(object(input.importDraft))out.importDraft={name:typeof input.importDraft.name==='string'?input.importDraft.name.slice(0,200):'',scope:P.cleanProfile({scope:input.importDraft.scope}).scope,excluded:P.cleanProfile(input.importDraft).excluded};
    if(input.exclusionDefaultsVersion!==1){
      for(const p of Object.values(out.bookProfiles))p.excluded=[...new Set([...p.excluded,...P.defaultExcluded])];
      out.importDraft.excluded=[...new Set([...out.importDraft.excluded,...P.defaultExcluded])];
    }
    if(object(input.progress))for(const [id,p]of Object.entries(input.progress))if(chapters.has(id)&&object(p))out.progress[id]={ratio:finite(p.ratio,0,0,1),completed:p.completed===true,updated:finite(p.updated,0),paragraph:finite(p.paragraph,0,0,9999),...([1,2,3,4].includes(p.travelPart)?{travelPart:p.travelPart}:{})};
    if(object(input.saved))for(const[id,w]of Object.entries(input.saved))if(Object.hasOwn(data.words,id)&&object(w))out.saved[id]={added:finite(w.added,Date.now()),due:finite(w.due,Date.now()),interval:finite(w.interval,0,0,365),reviews:finite(w.reviews,0),known:w.known===true,mistakes:finite(w.mistakes,0),chapterId:chapters.has(w.chapterId)?w.chapterId:data.words[id].chapters[0],paragraph:finite(w.paragraph,0,0,9999),...(typeof w.matchedGloss==='string'?{matchedGloss:w.matchedGloss.slice(0,120)}:{})};
    if(object(input.practice))for(const[id,w]of Object.entries(input.practice))if(Object.hasOwn(data.words,id)&&object(w))out.practice[id]={correct:finite(w.correct,0),wrong:finite(w.wrong,0),last:finite(w.last,0)};
    if(object(input.days))for(const[key,d]of Object.entries(input.days))if(/^\d{4}-\d{2}-\d{2}$/.test(key)&&object(d))out.days[key]={seconds:finite(d.seconds,0,0,86400),answered:finite(d.answered,0),correct:Math.min(finite(d.correct,0),finite(d.answered,0)),reviewed:finite(d.reviewed,0),wordIds:Array.isArray(d.wordIds)?[...new Set(d.wordIds.filter(id=>Object.hasOwn(data.words,id)))]:[]};
    if(Array.isArray(input.feedback))out.feedback=input.feedback.slice(-100).filter(x=>object(x)&&typeof x.text==='string').map(x=>({text:x.text.slice(0,5000),date:finite(x.date,0),chapterId:chapters.has(x.chapterId)?x.chapterId:null}));
    return out;
  }
  function merge(current,incoming,data) {
    const next=sanitize(incoming,data),out=sanitize(current,data);
    out.shelf=S.merge(out.shelf,next.shelf);
    Object.assign(out.bookTags,next.bookTags);
    Object.assign(out.translationEdits,next.translationEdits);
    for(const[id,p]of Object.entries(next.bookProfiles))if(!Object.hasOwn(out.bookProfiles,id))out.bookProfiles[id]=p;
    for(const[id,p]of Object.entries(next.progress)){const old=out.progress[id];out.progress[id]=!old?p:{...((p.updated||0)>(old.updated||0)?p:old),completed:old.completed||p.completed};}
    for(const[id,w]of Object.entries(next.saved)){const old=out.saved[id];if(!old||w.reviews>old.reviews)out.saved[id]=w;}
    for(const[id,w]of Object.entries(next.practice)){const old=out.practice[id];out.practice[id]=!old?w:{correct:Math.max(old.correct,w.correct),wrong:Math.max(old.wrong,w.wrong),last:Math.max(old.last,w.last)};}
    for(const[key,d]of Object.entries(next.days)){const old=out.days[key];out.days[key]=!old?d:{seconds:Math.max(old.seconds,d.seconds),answered:Math.max(old.answered,d.answered),correct:Math.max(old.correct,d.correct),reviewed:Math.max(old.reviewed,d.reviewed),wordIds:[...new Set([...old.wordIds,...d.wordIds])]};}
    const unique=new Map([...out.feedback,...next.feedback].map(f=>[f.date+'|'+f.text,f]));out.feedback=[...unique.values()].slice(-100);
    return out;
  }
  return {VERSION,STORAGE_KEY,defaults,dayKey,normalizeAnswer,checkAnswer,shuffle,buildQuiz,ensureDay,saveWord,recordAnswer,reviewWord,dueIds,streak,sanitize,merge,migrateChapters};
});
