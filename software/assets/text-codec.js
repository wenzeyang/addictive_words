(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NovelTextCodec=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const encodings=[['auto','自动识别'],['utf-8','UTF-8'],['gb18030','GB18030 / GBK / GB2312'],['big5','Big5 繁体中文'],['utf-16le','UTF-16 LE'],['utf-16be','UTF-16 BE']];
 function validate(text){if(!text.trim())throw new Error('文件没有可读取的正文。');const invalid=text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g)||[];if(invalid.length>Math.max(32,text.length*.01))throw new Error('文件含有大量非文本控制字符，请确认选择的是 TXT 小说。');const cleaned=invalid.length?text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''):text;if(!cleaned.trim())throw new Error('文件没有可读取的正文。');return cleaned;}
 function decode(bytes,encoding){return validate(new TextDecoder(encoding,{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));}
 function score(text){const s=text.slice(0,24000),common=(s.match(/[的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现量都两体点问还她它你吗吧很看走声门手心头去把让]/g)||[]).length,bad=(s.match(/[\uE000-\uF8FF\uFFFD]/g)||[]).length;return common/Math.max(s.length,1)-bad/Math.max(s.length,1)*3;}
 function detect(input,requested='auto'){
  const b=input instanceof Uint8Array?input:new Uint8Array(input);if(!b.length)throw new Error('文件为空，请重新选择。');
  if(!encodings.some(([e])=>e===requested))throw new Error('不支持该编码。');
  if(requested!=='auto')return {text:decode(b,requested),encoding:requested,confidence:'manual',note:'按你指定的编码读取，请确认预览。'};
  if((b[0]===255&&b[1]===254&&b[2]===0&&b[3]===0)||(b[0]===0&&b[1]===0&&b[2]===254&&b[3]===255))throw new Error('暂不支持 UTF-32，请先另存为 UTF-8 或 UTF-16。');
  let bom=b[0]===239&&b[1]===187&&b[2]===191?'utf-8':b[0]===255&&b[1]===254?'utf-16le':b[0]===254&&b[1]===255?'utf-16be':null;
  if(bom)return {text:decode(b,bom),encoding:bom,confidence:'bom',note:'已按文件编码标记识别。'};
  try{return {text:decode(b,'utf-8'),encoding:'utf-8',confidence:'valid',note:'通过 UTF-8 校验，可直接使用。'};}catch{}
  let even=0,odd=0;const n=Math.min(b.length,8000);for(let i=0;i<n;i++)if(b[i]===0)(i%2?odd++:even++);
  if(n>4&&Math.max(even,odd)/n>.12){const encoding=odd>even?'utf-16le':'utf-16be';try{return {text:decode(b,encoding),encoding,confidence:'guess',note:'推测为无编码标记的 UTF-16，请确认正文预览。'};}catch{}}
  const choices=[];for(const encoding of ['gb18030','big5'])try{const text=decode(b,encoding);choices.push({encoding,text,score:score(text)});}catch{}
  choices.sort((a,b)=>b.score-a.score);if(!choices.length)throw new Error('无法识别正文编码，请手动选择编码或重新导出 TXT。');
  return {text:choices[0].text,encoding:choices[0].encoding,confidence:'guess',note:'按中文文本特征推测编码，请核对预览；如有乱码可手动更正。'};
 }
 function utf8(text){return new TextEncoder().encode(text);}
 return {encodings,detect,utf8};
});
