(function(){'use strict';
 const origin=b=>b.origin==='prepared'||b.prepared?'prepared':b.imported?'txt':'prepared';
 const label=b=>origin(b)==='prepared'?'预置':'转换';
 function validate(record){
  if(record?.format!=='zhiyu-prepared-book'||record.version!==1||record.book?.origin!=='prepared')throw Error('请选择 .zybook.json 格式的预制学习书。');
  window.NovelLibrary.validate([record]);
  const b=record.book;
  if(typeof b.title!=='string'||!b.title.trim()||typeof b.synopsis!=='string'||typeof b.learningSummary!=='string'||!Array.isArray(b.genre)||!b.genre.every(x=>typeof x==='string')||!Array.isArray(b.wordPreview)||!b.wordPreview.every(x=>typeof x==='string')||typeof b.volume!=='string')throw Error('预制书的简介或标题不完整。');
  if(b.coverData&&(!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.coverData)||b.coverData.length>4000000))throw Error('封面需为不超过 3 MB 的 PNG、JPEG 或 WebP 内嵌图片。');
  if(!Array.isArray(b.wordIds)||b.wordIds.some(id=>!Object.hasOwn(record.words,id)))throw Error('预制书词条索引不完整。');
  for(const c of record.chapters){
   if(typeof c.title!=='string'||typeof c.scene!=='string'||typeof c.blurb!=='string'||!Array.isArray(c.tags)||!c.tags.every(x=>typeof x==='string')||!Array.isArray(c.sceneWordIds)||[...c.wordIds,...c.sceneWordIds].some(id=>!Object.hasOwn(record.words,id)))throw Error('预制书章节资料不完整。');
   if(c.sectionTitles&&Object.values(c.sectionTitles).some(x=>typeof x!=='string'))throw Error('分节标题格式不正确。');
   if(c.lessonSections){
    const index=n=>Number.isInteger(n)&&n>=0&&n<c.paragraphs.length;
    if(c.contentRevision!==2||!Array.isArray(c.lessonSections)||!c.lessonSections.length||c.lessonSections.some(s=>typeof s.title!=='string'||!Array.isArray(s.blocks)||s.blocks.some(b=>!['paragraph','example-en','example-zh','question','answer'].includes(b.kind)||!index(b.paragraph)))||!Array.isArray(c.lessonVocabulary)||c.lessonVocabulary.some(t=>!Object.hasOwn(record.words,t.id)||typeof t.en!=='string'||typeof t.zh!=='string'||!index(t.paragraph)))throw Error('校订课程的段落或词汇引用无效。');
   }
   if(c.textbookPages&&(!Array.isArray(c.textbookPages)||!Array.isArray(c.sourceRange)||c.sourceRange.length!==2||!c.sourceRange.every(Number.isInteger)||c.textbookPages.some(p=>!Number.isInteger(p.page)||!Array.isArray(p.blocks)||p.blocks.some(b=>typeof b.text!=='string'||!['body','aside','labels','answers'].includes(b.kind)))))throw Error('学习书来源页或段落格式不正确。');
   if(c.illustrationData&&(!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.illustrationData)||c.illustrationData.length>4000000))throw Error('学习书插图格式不正确。');
  }
  return record;
 }
 for(const record of window.PREPARED_BOOKS||[])window.NovelLibrary.attach(validate(record));
 window.PreparedLibrary={origin,label,validate,create({E,notify,render}){
  document.addEventListener('change',async e=>{
   if(!e.target.matches('[data-prepared-file]'))return;
   const files=[...e.target.files];e.target.disabled=true;let count=0,skipped=0;const errors=[];
   for(const f of files)try{
    if(f.size>30*1024*1024)throw Error('数据包超过 30 MB。');
    const r=validate(JSON.parse(await f.text()));
    if(window.STORY_DATA.books.some(b=>b.id===r.id)){skipped++;continue;}
    const existingChapters=new Set(window.STORY_DATA.chapters.map(c=>c.id));
    if(r.chapters.some(c=>existingChapters.has(c.id)))throw Error('章节编号与已有书籍冲突。');
    for(const [id,w]of Object.entries(r.words))if(window.STORY_DATA.words[id]&&window.STORY_DATA.words[id].key!==w.key)throw Error('词条编号与已有词条冲突。');
    await window.NovelLibrary.save(r);window.NovelLibrary.attach(r);count++;
   }catch(err){errors.push(f.name+'：'+err.message);}
   render();notify(`已导入 ${count} 本${skipped?'；已有 '+skipped+' 本，保留原书与进度':''}${errors.length?'；'+errors.join('；'):''}`);
  });
  return {view:()=>`<section class="prepared-import"><div><strong>导入预制学习书</strong><p>保留已编排的章节、中英标注与封面，直接加入书架。</p></div><label class="btn secondary">选择书籍数据包<input type="file" data-prepared-file multiple accept=".zybook.json,application/json" aria-label="选择预制学习书数据包"></label><small>支持 .zybook.json · 每本最多 30 MB · 可多选</small></section>`};
 }};
})();
