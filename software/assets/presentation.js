(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReadingDesign=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const themes=[
  {id:'moss',name:'青苔书页',subtitle:'校园日常，清朗耐读',paper:'#FCFDF8',bg:'#EDF1EA',ink:'#263C32',muted:'#52665B',accent:'#2D654D',line:'#CAD6CB',soft:'#E3ECE2',onAccent:'#FFFFFF',font:'sans',layout:'清爽双栏'},
  {id:'sea',name:'海盐晨读',subtitle:'蓝白留白，适合清晨',paper:'#FCFDFF',bg:'#EAF1F8',ink:'#23394D',muted:'#52677A',accent:'#285E91',line:'#C6D6E6',soft:'#E1ECF7',onAccent:'#FFFFFF',font:'sans',layout:'宽松书页'},
  {id:'rose',name:'玫瑰来信',subtitle:'淡粉书笺，适合甜宠',paper:'#FFFAFC',bg:'#F6EDF1',ink:'#49303D',muted:'#795C6B',accent:'#934B6D',line:'#E4CCD7',soft:'#F2E3EB',onAccent:'#FFFFFF',font:'serif',layout:'信笺题签'},
  {id:'night',name:'午夜书灯',subtitle:'低亮度，适合夜读',paper:'#202D3B',bg:'#18212D',ink:'#EDF0F5',muted:'#B8C7D8',accent:'#A8C8EC',line:'#44556A',soft:'#2A3C50',onAccent:'#18212D',font:'serif',layout:'沉静夜读'},
  {id:'ink',name:'墨白专注',subtitle:'收起装饰，专注文字',paper:'#FFFFFF',bg:'#EDEEEE',ink:'#272A2C',muted:'#5C6266',accent:'#363D42',line:'#CED2D5',soft:'#E9ECEE',onAccent:'#FFFFFF',font:'sans',layout:'简洁阅读'},
  {id:'walnut',name:'栗木书房',subtitle:'暖纸宋体，适合长篇',paper:'#FCF6E9',bg:'#EDE3D4',ink:'#45382C',muted:'#715C48',accent:'#75512D',line:'#D8C5AB',soft:'#EDE0CA',onAccent:'#FFFFFF',font:'serif',layout:'纸本书页'}
 ];
 const listIds=["gmat", "gre", "sat", "tem8", "tem4", "pep-high", "cet6", "cet4", "business", "fltrp-junior", "toefl", "postgrad", "ielts", "highschool", "pep-junior", "pep-primary", "toeic"];
 const availableIds=[...listIds];
 const defaults={"gmat": "#684A9E", "gre": "#966B28", "sat": "#4F6898", "tem8": "#956278", "tem4": "#586F36", "pep-high": "#48776E", "cet6": "#167F85", "cet4": "#208457", "business": "#86634B", "fltrp-junior": "#3C7894", "toefl": "#B77227", "postgrad": "#8B5DB3", "ielts": "#3478CE", "highschool": "#A35D30", "pep-junior": "#687099", "pep-primary": "#8B5962", "toeic": "#B84E7B"};
 function cleanColors(input){const out={...defaults};for(const id of listIds)if(/^#[0-9a-f]{6}$/i.test(input?.[id]))out[id]=input[id];return out;}
 const defaultExcluded=["pep-junior","pep-primary"];
 function cleanProfile(value){const scope=Array.isArray(value?.scope)?availableIds.filter(id=>value.scope.includes(id)):[...availableIds];const visible=Array.isArray(value?.visible)?scope.filter(id=>value.visible.includes(id)):[...scope];const excluded=availableIds.filter(id=>(Array.isArray(value?.excluded)?value.excluded:defaultExcluded).includes(id));return {scope,visible,excluded,showSupplement:value?.showSupplement!==false};}
 function membership(wordId,data){return data.members[wordId]||[];}
 function displayMembership(wordId,profile,data){return membership(wordId,data).filter(id=>profile.visible.includes(id));}
 function isVisible(wordId,profile,data){const ids=membership(wordId,data);if(ids.some(id=>profile.excluded?.includes(id)))return false;return ids.length?displayMembership(wordId,profile,data).length>0:profile.showSupplement;}
 function gradient(ids,colors){const c=cleanColors(colors);if(!ids.length)return 'none';return 'linear-gradient(90deg,'+ids.map((id,i)=>`${c[id]} ${i/ids.length*100}% ${(i+1)/ids.length*100}%`).join(',')+')';}
 function contrast(a,b){const lum=x=>{const v=x.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
 function mix(a,b,t){return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*t+parseInt(b.slice(i,i+2),16)*(1-t)).toString(16).padStart(2,'0')).join('');}
 function cleanThemes(input){return [0,1,2].map(i=>{const base=themes[i],v=Array.isArray(input)?input[i]||{}:{},out={...base,id:'custom'+(i+1),name:typeof v.name==='string'?v.name.replace(/[<>]/g,'').slice(0,18):'我的主题 '+(i+1),subtitle:'自定义书页',layout:'个人配色'};for(const k of ['paper','bg','ink','accent'])if(/^#[0-9a-f]{6}$/i.test(v[k]))out[k]=v[k];out.muted=mix(out.ink,out.paper,.78);out.line=mix(out.ink,out.paper,.22);out.soft=mix(out.accent,out.paper,.1);out.onAccent=contrast(out.accent,'#FFFFFF')>=contrast(out.accent,'#18212D')?'#FFFFFF':'#18212D';return out;});}
 function allThemes(s={}){return [...themes,...cleanThemes(s.customThemes)];}
 function getTheme(s={}){return allThemes(s).find(t=>t.id===s.theme)||themes[0];}
 return {defaultExcluded,themes,listIds,availableIds,defaults,cleanColors,cleanProfile,membership,displayMembership,isVisible,gradient,contrast,cleanThemes,allThemes,getTheme};
});
