(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BookShelf=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const modes=['compact','detailed','covers'];
 function clean(raw={}){if(!raw||typeof raw!=='object')raw={};const groups=[],ids=new Set(),names=new Set();for(const g of Array.isArray(raw.groups)?raw.groups.slice(0,100):[]){if(!g||typeof g.id!=='string'||!/^g-[a-z0-9-]{1,80}$/i.test(g.id)||typeof g.name!=='string')continue;const name=g.name.trim().slice(0,40);if(!name||ids.has(g.id)||names.has(name))continue;groups.push({id:g.id,name});ids.add(g.id);names.add(name);}const assignments={};if(raw.assignments&&typeof raw.assignments==='object')for(const [book,id]of Object.entries(raw.assignments).slice(0,10000)){if(!['__proto__','constructor','prototype'].includes(book)&&ids.has(id))assignments[book]=id;}const order=Array.isArray(raw.order)?[...new Set(raw.order.filter(id=>typeof id==='string'))].slice(0,10000):[];return {sort:['title','date','manual'].includes(raw.sort)?raw.sort:'manual',order,mode:modes.includes(raw.mode)?raw.mode:'detailed',filter:['all','ungrouped'].includes(raw.filter)||ids.has(raw.filter)?raw.filter:'all',groups,assignments};}
 function saveGroup(raw,id,name){const s=clean(raw);name=String(name).trim();if(!name||name.length>40)throw Error('分组名需为 1–40 个字符。');if(s.groups.some(g=>g.name===name&&g.id!==id))throw Error('已有同名分组。');const old=s.groups.find(g=>g.id===id);if(old)old.name=name;else{if(s.groups.length>=100)throw Error('最多可建立 100 个分组。');if(!/^g-[a-z0-9-]{1,80}$/i.test(id))throw Error('分组编号无效。');s.groups.push({id,name});}return s;}
 function removeGroup(raw,id){const s=clean(raw);s.groups=s.groups.filter(g=>g.id!==id);for(const book of Object.keys(s.assignments))if(s.assignments[book]===id)delete s.assignments[book];if(s.filter===id)s.filter='all';return s;}
 function assign(raw,book,id){const s=clean(raw);if(['__proto__','constructor','prototype'].includes(book))return s;if(id&&s.groups.some(g=>g.id===id))s.assignments[book]=id;else delete s.assignments[book];return s;}
 function includes(raw,book){const s=raw;return s.filter==='all'||(s.filter==='ungrouped'?!s.assignments[book]:s.assignments[book]===s.filter);}
 function merge(a,b){const out=clean(a),other=clean(b),mapped={};for(const g of other.groups){const same=out.groups.find(x=>x.name===g.name);if(same){mapped[g.id]=same.id;continue;}const conflict=out.groups.find(x=>x.id===g.id);let id=g.id;if(conflict){let n=1;while(out.groups.some(x=>x.id==='g-merged-'+n))n++;id='g-merged-'+n;}if(out.groups.length<100){out.groups.push({...g,id});mapped[g.id]=id;}}for(const [book,id]of Object.entries(other.assignments))if(!out.assignments[book]&&mapped[id])out.assignments[book]=mapped[id];return clean(out);}
 function sorted(books,s,date=b=>b.addedAt||0){
  const collator=new Intl.Collator('zh-u-co-pinyin',{numeric:true});
  if(s.sort==='title')return [...books].sort((a,b)=>collator.compare(a.title,b.title));
  if(s.sort==='date')return [...books].sort((a,b)=>date(b)-date(a));
  const position=new Map(s.order.map((id,index)=>[id,index]));
  return [...books].sort((a,b)=>(position.get(a.id)??Infinity)-(position.get(b.id)??Infinity));
 }
 return {modes,sorted,clean,saveGroup,removeGroup,assign,includes,merge};
});
