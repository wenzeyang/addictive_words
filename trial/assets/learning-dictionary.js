(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LearningDictionary=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const key=s=>String(s||'').replace(/’/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
 function resolve(word,legacy={},data={},gloss=''){
  const d=data.entries?.[key(word)];if(!d)return legacy;
  const examples=(d.examples||[]).slice().sort((a,b)=>Number(!!gloss&&b.zh.includes(gloss))-Number(!!gloss&&a.zh.includes(gloss))).slice(0,2);
  return {...legacy,learningDefinitions:d.definitions,learningPhonetics:d.phonetics,learningSource:'KyleBing 正序完整词库',examples:examples.length?examples:legacy.examples||[],definitions:d.ecdict||legacy.definitions,source:d.ecdict?'ECDICT':legacy.source||'ECDICT',learningPhrases:(d.phrases||[]).slice(0,8)};
 }
 return {key,resolve};
});
