(function(root){
 'use strict';
 const D=root.STORY_DATA, catalog=root.BOOK_CATALOG, files=new Map(), pending=new Map(), loaded=new Set();
 if(!catalog)return;
 for(const book of catalog.books){files.set(book.id,book.lazyFile);D.books.push(book);}
 D.chapters.push(...catalog.chapters);
 for(const [id,word] of Object.entries(catalog.words)){
  const old=D.words[id];
  if(old){old.chapters=[...new Set([...old.chapters,...word.chapters])];old.glosses=[...new Set([...old.glosses,...word.glosses])];old.occurrences.push(...word.occurrences);}
  else D.words[id]=word;
  root.LEXICON_DATA.members[id]=root.LEXICON_DATA.byKey?.[word.key]||[];
 }
 function needs(id){return files.has(id)&&!loaded.has(id);}
 function accept(record){
  const id=record.id;
  if(!files.has(id)||loaded.has(id))return;
  if(record.format==='zhiyu-prepared-book')root.PreparedLibrary.validate(record);else root.NovelLibrary.validate([record]);root.BookLanguage?.stamp(record);
  Object.assign(D.books.find(b=>b.id===id),record.book);
  const owned=new Set(record.book.chapterIds);
  for(const c of record.chapters){const old=D.chapters.find(x=>x.id===c.id);Object.assign(old,c);delete old.lazy;}
  for(const [wid,w]of Object.entries(record.words)){
   const old=D.words[wid],other=old.occurrences.filter(o=>!owned.has(o.chapterId));
   old.occurrences=[...other,...w.occurrences];old.chapters=[...new Set([...old.chapters,...w.chapters])];old.note=w.note;old.lemma=w.lemma;
   if(!root.LOCAL_DICTIONARY.entries[wid])root.LOCAL_DICTIONARY.entries[wid]=record.dictionary[wid];
  }
  (root.PREPARED_BOOKS??=[]).push(record);loaded.add(id);
 }
 function ensure(id){
  if(!needs(id))return Promise.resolve();
  if(pending.has(id))return pending.get(id);
  const promise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=files.get(id);
   const fail=()=>{script.remove();reject(Error('书籍加载失败，请确认 books 文件夹完整后重试。'));};
   script.onload=()=>{if(loaded.has(id)){script.remove();resolve();}else fail();};script.onerror=fail;
   document.head.append(script);
  }).finally(()=>pending.delete(id));
  pending.set(id,promise);return promise;
 }
 root.LazyBooks={ensure,needs,accept,loaded};
 // A jump needs the complete paragraph before the existing handler scrolls to it.
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-jump-occurrence]');if(!button)return;
  const cid=button.dataset.jumpChapter||D.words[button.dataset.jumpOccurrence]?.occurrences[0]?.chapterId;
  const bid=D.chapters.find(c=>c.id===cid)?.bookId;if(!needs(bid))return;
  event.preventDefault();event.stopImmediatePropagation();
  ensure(bid).then(()=>{if(button.isConnected)button.click();}).catch(error=>{const toast=document.getElementById('toast');toast.textContent=error.message;toast.classList.add('show');});
 },true);
 delete root.BOOK_CATALOG;
})(window);
