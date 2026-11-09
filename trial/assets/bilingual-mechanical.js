(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./novel-converter.js'):root.NovelConverter);if(typeof module==='object'&&module.exports)module.exports=api;else root.BilingualMechanical=api;})(typeof globalThis!=='undefined'?globalThis:this,function(N){
 'use strict';
 const caches=new WeakMap(),trees=new Map();let source=null,entries=[];
 function configure(data,words){if(source===data)return;source=data;const ids=new Map();for(const w of Object.values(words)){if(!ids.has(w.key)||w.occurrences?.some(o=>o.chapterId.startsWith('resident-evil-')))ids.set(w.key,w.id);}entries=data.entries.map(e=>({...e,id:ids.get(e.en.toLowerCase())||e.id}));trees.clear();}
 function plan(c,profile,mode){
  if(!c.chineseMechanicalVersion)return null;
  const key=JSON.stringify([profile.visible,profile.excluded||[],mode]);let cache=caches.get(c);if(!cache)caches.set(c,cache=new Map());if(cache.has(key))return cache.get(key);
  const treeKey=JSON.stringify([profile.visible,profile.excluded||[]]);let tree=trees.get(treeKey);if(!tree){tree=N.index(entries,profile.visible,profile.excluded||[]);if(trees.size>=4)trees.delete(trees.keys().next().value);trees.set(treeKey,tree);}
  const used=new Set(),seen=new Set(),ids=new Set();let zi=0;
  const rows=c.parallelRows.map(row=>row.zh.map(text=>{const paragraph=c.paragraphs.length+zi++;if(mode==='none')return [{text}];return N.tokenize(text,tree,used,mode!=='first').map(t=>{if(!t.id)return t;const first=!seen.has(t.id);seen.add(t.id);ids.add(t.id);return {...t,first,paragraph,source:'chinese-mechanical'};});}));
  const result={rows,ids:[...ids],stats:{inline:ids.size,supplement:0,total:ids.size}};if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
 }
 function register(c,plan,D){if(!plan)return;for(const t of plan.rows.flat(2)){if(!t.id)continue;const w=D.words[t.id];if(!w)throw Error('中文学习词条未登记：'+t.en);const occ=w.occurrences.find(o=>o.chapterId===c.id&&o.paragraph===t.paragraph);if(occ)Object.assign(occ,{gloss:t.zh,alternatives:t.alternatives,source:t.source});else w.occurrences.push({chapterId:c.id,paragraph:t.paragraph,gloss:t.zh,alternatives:t.alternatives,source:t.source});}}
 function context(c,paragraph){return c.chineseMechanicalVersion&&paragraph>=c.paragraphs.length?c.chineseParagraphs[paragraph-c.paragraphs.length]:undefined;}
 return {configure,plan,register,context};
});
