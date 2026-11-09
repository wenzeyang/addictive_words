(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BookLanguage=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const names={zh:'原版中文',en:'原版英文',bilingual:'原版双语'};
 function detect(text){
  let zh=0,en=0,zhBlocks=0,enBlocks=0;
  for(const line of String(text||'').split(/\r?\n/)){
   const c=(line.match(/[\u4e00-\u9fff]/g)||[]).length,e=(line.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
   zh+=c;en+=e;if(c>=8)zhBlocks++;if(e>=4&&c<3)enBlocks++;
  }
  if(zhBlocks>=2&&enBlocks>=2&&zh>=40&&en>=40)return 'bilingual';
  return zh>en?'zh':'en';
 }
 function source(book){if(names[book?.sourceLanguage])return book.sourceLanguage;if(book?.bilingual||book?.textbook||book?.dk||book?.kind==='travel')return 'bilingual';return 'zh';}
 function label(book){return names[source(book)];}
 // Old converted records are Chinese source texts, despite their generated English annotations.
 function stamp(record){if(!names[record.book.sourceLanguage])record.book.sourceLanguage=record.original?detect(record.original):source(record.book);return record;}
 return {names,detect,source,label,stamp};
});
