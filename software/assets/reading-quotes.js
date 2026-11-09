(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.ReadingQuotes=api;api.start();}})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Original encouragements: no invented quotations or author attributions.
 const quotes=[
 '读懂一句，就比昨天多了一点自由。','今天记住的词，会在下一本书里与你重逢。','读得慢没关系，停下来想一想也是学习。','把好奇留给故事，把时间留给自己。','不必一次读完，只要今天翻开。',
 '遇到生词，是发现新东西的开始。','每一次重读，都能看见上次错过的东西。','用自己的速度，走到想去的地方。','记不住的时候，给它再见面的机会。','进步不总是显眼，但每一页都算数。',
 '先读懂眼前这一句，下一句慢慢来。','让喜欢的故事，带你多走一小段。','开始不需要完美，需要的是翻开第一页。','今天的小练习，会成为明天的底气。','比起急着读完，更值得在意的是读懂。',
 '一个熟悉的词，也可能有新的故事。','休息一下，再回来，书会等你。','你不必每天学很多，但可以常常遇见英语。','把陌生变成熟悉，靠的是一次次相遇。','允许自己犯错，也允许自己重新开始。',
 '学到的东西，终会用自己的方式派上用场。','留一点时间，给那个想学会英语的自己。','读到有趣的句子，不妨停下来念一遍。','昨天的难句，也许就是今天的小收获。','能看懂一点，就值得继续读下去。',
 '把目标拆小，让每一次开始都轻一点。','一页读不完，就从一段开始。','不认识的词，可以问；没读懂的句，可以再读。','你走过的每一页，都在拓宽自己的世界。','学习不必赶路，也可以沿途看看风景。',
 '读书时的专注，是送给自己的一小段安静。','记忆会模糊，重逢会让它清晰。','从喜欢的内容开始，更容易走得长远。','把会的用起来，把不会的记下来。','不必与别人比速度，先看看自己走了多远。',
 '读懂故事之外，也试着听见语言的声音。','让今天学会的词，走进你自己的句子。','有疑问，说明你正在认真读。','再试一次，有时就能跨过那道小坎。','那些反复见到的词，正在慢慢变成老朋友。',
 '把一本书打开，也把一种可能打开。','看见自己的进步，哪怕只是一点点。','不急着给自己打分，先把故事读下去。','一段读懂的文字，可以撑起一天的好心情。','遇到喜欢的表达，收藏起来，也试着用起来。',
 '学习的路上，认真比匆忙更有用。','今天积攒的一点勇气，明天可以接着用。','多读一遍，不是退步，是看得更清楚。','给自己一点耐心，熟练需要时间。','每次愿意继续，都是一个新的开始。'
 ];
 const interval=600000,epoch=Date.now();let timer;
 function current(now=Date.now()){const index=Math.floor(Math.max(0,now-epoch)/interval)%quotes.length;return {index,text:quotes[index]};}
 function update(){const q=current();document.querySelectorAll('[data-quote-ticker]').forEach(el=>{if(el.textContent!==q.text){el.classList.remove('quote-enter');el.textContent=q.text;void el.offsetWidth;el.classList.add('quote-enter');}});}
 function start(){if(timer)return;timer=setInterval(update,interval);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});}
 return {quotes,interval,epoch,current,start};
});
