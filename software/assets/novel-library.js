(function(){'use strict';
 let database;function db(){return database||(database=new Promise((resolve,reject)=>{const r=indexedDB.open('zhiy ao-novel-library'.replace(' ',''),1);r.onupgradeneeded=()=>r.result.createObjectStore('books',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));}
 async function all(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('books').objectStore('books').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function save(record){record.addedAt ||= Date.now();const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('books','readwrite');tx.objectStore('books').put(record);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('保存被中止'));});}
 function attach(r){window.BookLanguage?.stamp(r);const D=window.STORY_DATA,L=window.LOCAL_DICTIONARY,X=window.LEXICON_DATA;if(D.books.some(b=>b.id===r.id))return;D.books.push({...r.book,lexiconScope:[...(r.book.lexiconScope||r.scope||[])],lexiconExcluded:[...(r.book.lexiconExcluded||r.excluded||[])],addedAt:r.addedAt||r.book.addedAt||0});D.chapters.push(...r.chapters);for(const [id,w]of Object.entries(r.words)){if(D.words[id]){const old=D.words[id];old.chapters=[...new Set([...old.chapters,...w.chapters])];old.glosses=[...new Set([...old.glosses,...w.glosses])];old.occurrences.push(...w.occurrences);}else D.words[id]={...w,glosses:[...(w.glosses||[])],chapters:[...(w.chapters||[])],occurrences:(w.occurrences||[]).map(o=>({...o}))};if(!L.entries[id])L.entries[id]=r.dictionary[id];X.members[id]=[...(X.byKey?.[w.key]||[])];}}
 async function remove(id){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('books','readwrite');tx.objectStore('books').delete(id);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});}
 async function hydrate(){const rows=await all();for(const r of rows)attach(r);return rows;}
 function validate(records){
  if(!Array.isArray(records)||records.length>500)throw Error('小说备份格式不正确。');
  const ids=new Set(),validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,180}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
  for(const r of records){
   if(!r||!validId(r.id)||ids.has(r.id)||r.book?.id!==r.id||!r.book.imported||!Array.isArray(r.chapters)||!r.words||!r.dictionary||!r.members)throw Error('小说备份结构不完整。');ids.add(r.id);
   const cids=new Set(r.chapters.map(c=>c.id));
   if(cids.size!==r.chapters.length||!Array.isArray(r.book.chapterIds)||r.book.chapterIds.some(id=>!cids.has(id)))throw Error('小说章节引用不完整。');
   for(const c of r.chapters){if(!validId(c.id)||c.bookId!==r.id||!Array.isArray(c.paragraphs)||!Array.isArray(c.wordIds))throw Error('小说章节格式不正确。');for(const p of c.paragraphs){if(!Array.isArray(p))throw Error('小说段落格式不正确。');for(const t of p)if(!t||!(typeof t.text==='string'||validId(t.id)&&r.words[t.id]&&typeof t.en==='string'&&typeof t.zh==='string'))throw Error('小说词条引用不完整。');}}
   for(const c of r.chapters)if(c.bilingual){
    const index=i=>Number.isInteger(i)&&i>=0&&i<c.paragraphs.length;
    if(!Array.isArray(c.parallelRows)||!c.parallelRows.length||c.parallelRows.some(row=>!Array.isArray(row.en)||!row.en.every(index)||!Array.isArray(row.zh)||!row.zh.every(t=>typeof t==='string')||!Array.isArray(row.notes)||row.notes.some(n=>typeof n.expression!=='string'||typeof n.headword!=='string'||typeof n.explanation!=='string'||!index(n.paragraph))||(row.notice!==undefined&&typeof row.notice!=='string')))throw Error('双语段落或表达笔记格式不正确。');
    if(c.chineseMechanicalVersion!==undefined){if(c.chineseMechanicalVersion!==1||!Array.isArray(c.chineseParagraphs)||JSON.stringify(c.chineseParagraphs)!==JSON.stringify(c.parallelRows.flatMap(row=>row.zh))||!Array.isArray(c.chineseWordIds)||c.chineseWordIds.some(id=>!r.words[id])||!Array.isArray(c.englishWordIds)||c.englishWordIds.some(id=>!r.words[id]))throw Error('中文机械匹配数据不完整，原文必须保留。');}
    const coverage=c.parallelRows.flatMap(row=>row.en);if(coverage.length!==c.paragraphs.length||coverage.some((n,i)=>n!==i))throw Error('双语英文段落有遗漏、重复或乱序。');
   }
   for(const [id,w]of Object.entries(r.words))if(!validId(id)||w.id!==id||typeof w.en!=='string'||typeof w.key!=='string'||!Array.isArray(w.glosses)||!Array.isArray(w.chapters)||!Array.isArray(w.occurrences)||!r.dictionary[id]||!Array.isArray(r.members[id])||w.chapters.some(c=>!cids.has(c)))throw Error('小说词条格式不正确。');
  }return records;
 }
 async function restore(records){validate(records);const existing=new Set((await all()).map(r=>r.id)),fresh=records.filter(r=>!existing.has(r.id));if(fresh.length){const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('books','readwrite');for(const r of fresh)tx.objectStore('books').add(r);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('小说恢复已中止'));});for(const r of fresh)attach(r);}return {added:fresh.length,kept:records.length-fresh.length};}
 window.NovelLibrary={all,save,remove,attach,hydrate,validate,restore};
})();
