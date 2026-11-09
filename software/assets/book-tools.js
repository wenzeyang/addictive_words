(function (root) {
  'use strict';
  const textEncoder = new TextEncoder();

  async function zip(entries) {
    const parts = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const [path, blob] of entries) {
      const name = textEncoder.encode(path);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const crc = root.AudioImport.crc(bytes);
      const local = new Uint8Array(30 + name.length);
      const header = new DataView(local.buffer);
      header.setUint32(0, 0x04034b50, true);
      header.setUint16(4, 20, true);
      header.setUint16(6, 0x800, true);
      header.setUint32(14, crc, true);
      header.setUint32(18, bytes.length, true);
      header.setUint32(22, bytes.length, true);
      header.setUint16(26, name.length, true);
      local.set(name, 30);
      const central = new Uint8Array(46 + name.length);
      const index = new DataView(central.buffer);
      index.setUint32(0, 0x02014b50, true);
      index.setUint16(4, 20, true);
      central.set(local.subarray(4, 30), 6);
      index.setUint32(42, offset, true);
      central.set(name, 46);
      parts.push(local, blob);
      directory.push(central);
      offset += local.length + blob.size;
      directorySize += central.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, directory.length, true);
    end.setUint16(10, directory.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end.buffer], {type:'application/zip'});
  }

  let database;
  function db() {
    return database ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('shangyin-book-packages', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('books', {keyPath:'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  const records = new Map(), objectUrls = new Map();
  async function write(record) {
    const database = await db();
    await new Promise((resolve, reject) => {
      const tx = database.transaction('books', 'readwrite');
      tx.objectStore('books').put(record);
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error || Error('书籍保存未完成'));
    });
    records.set(record.id, record);
  }

  function attach(record) {
    if (record.deleted) return;
    const {manifest, assets} = record;
    for (const url of objectUrls.get(record.id)?.values() || []) URL.revokeObjectURL(url);
    const urls = new Map(assets.map(({name, blob}) => [name, URL.createObjectURL(blob)]));
    objectUrls.set(record.id, urls);
    const existing=root.STORY_DATA.books.find(b=>b.id===record.id);
    if (existing) {
      if (manifest.kind==='story') for (const chapter of manifest.record.chapters) {
        if (chapter.illustration && existing.chapterIds.includes(chapter.id)) root.STORY_DATA.chapters.find(c=>c.id===chapter.id).illustration=chapter.illustration;
      }
      return;
    }
    const asset = name => objectUrls.get(record.id)?.get(name) || '';
    if (manifest.kind === 'dk') root.DkDictionary.register(manifest.dataset, asset);
    if (manifest.kind === 'travel') root.TravelCourse.register(manifest.dataset, asset);
    if (manifest.kind === 'story') root.NovelLibrary.attach(manifest.record);
  }

  async function hydrate() {
    const database = await db();
    const all = await new Promise((resolve,reject) => {
      const request = database.transaction('books').objectStore('books').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    for (const record of all) {
      records.set(record.id, record);
      attach(record);
    }
  }

  const safeId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,179}$/i.test(value) && !['constructor','prototype'].includes(value);
  const safeAsset = value => typeof value === 'string' && /^(?:[\w-]+\/)*[\w.-]+\.(?:webp|png|jpe?g|svg)$/i.test(value) && !value.split('/').includes('..');
  function validate(manifest, assets) {
    if (manifest?.format !== 'shangyin-book-v1' || !safeId(manifest.id)) throw Error('请选择上瘾单词导出的书籍 ZIP');
    const existing = root.STORY_DATA.books.find(b => b.id === manifest.id);
    const expected = existing && (existing.dk ? 'dk' : existing.kind === 'travel' ? 'travel' : 'story');
    if (expected && expected !== manifest.kind) throw Error('书籍类型与现有记录不匹配');
    if (manifest.kind === 'story') {
      const r = manifest.record;
      root.NovelLibrary.validate([r]);
      if(r.format==='zhiyu-prepared-book')root.PreparedLibrary.validate(r);
      if (r.id !== manifest.id || !r.chapters.length || r.book.kind === 'travel' || r.book.dk) throw Error('故事书结构不完整');
      if (r.chapters.some(c => !existing?.chapterIds.includes(c.id) && root.STORY_DATA.chapters.some(old => old.id === c.id))) throw Error('章节编号与已有书籍冲突');
      if (!Array.isArray(r.book.genre) || !Array.isArray(r.book.wordPreview) || !Array.isArray(r.book.wordIds) || r.book.wordIds.some(id=>!Object.hasOwn(r.words,id))) throw Error('故事书索引无效');
      for (const c of r.chapters) {
        if (c.illustration && !assets.has(c.illustration)) throw Error('缺少章节插图');
        if (!Array.isArray(c.tags) || !Array.isArray(c.sceneWordIds) || [...c.wordIds,...c.sceneWordIds].some(id=>!Object.hasOwn(r.words,id))) throw Error('章节词表无效');
        c.number=Number(c.number)||0;
        c.minutes=Number(c.minutes)||0;
      }
      for (const word of Object.values(r.words)) {
        if (!word.occurrences.length || word.occurrences.some(o=>!word.chapters.includes(o.chapterId)||typeof o.gloss!=='string'||!Number.isInteger(o.paragraph))) throw Error('词条位置无效');
        if (!['high','full','scene','prepared','import'].includes(word.source)) word.source='import';
      }
      return;
    }
    const d = manifest.dataset;
    if (!d || d.id !== manifest.id || typeof d.title !== 'string') throw Error('图解书结构不完整');
    const rows = manifest.kind === 'dk' ? d.pages : manifest.kind === 'travel' ? d.units : null;
    if (!Array.isArray(rows) || !rows.length || rows.length>1000) throw Error('图解书章节无效');
    if (manifest.kind==='dk' && (!Array.isArray(d.groups)||d.groups.some((g,index)=>g?.id!==index||typeof g.title!=='string'||typeof g.en!=='string'))) throw Error('DK 主题目录无效');
    const ids = new Set();
    for (const row of rows) {
      if (!safeId(row.id) || ids.has(row.id) || (!existing?.chapterIds.includes(row.id) && root.STORY_DATA.chapters.some(c=>c.id===row.id))) throw Error('图解章节编号无效或冲突');
      ids.add(row.id);
      if (!Array.isArray(row.words) || !row.words.length || !Number.isInteger(row.number) || typeof row.title!=='string'||typeof row.en!=='string') throw Error('图解页结构无效');
      if (manifest.kind === 'dk') {
        if (!d.groups[row.group] || !Number.isInteger(row.width)||!Number.isInteger(row.height)||!Array.isArray(row.regions) || row.regions.some(r=>!validBox(r.box)||!Number.isInteger(r.word)||!row.words[r.word]) || !assets.has(row.image) || row.words.some(w=>typeof w.en!=='string'||typeof w.zh!=='string'||!validBox(w.box)||(w.inline&&!validBox(w.labelBox)))) throw Error('DK 图解资源不完整');
        if (row.textLayers && (!Array.isArray(row.textLayers)||row.textLayers.some(layer=>!['zh','en'].includes(layer.lang)||typeof layer.text!=='string'||!Number.isInteger(layer.color)||layer.color<0||layer.color>0xffffff||![layer.x,layer.y,layer.size].every(Number.isFinite)))) throw Error('DK 文字层无效');
        if (row.labelLayout) {
          if (row.words.some(word=>word.aliasOf!==undefined&&(
              !Number.isInteger(word.aliasOf)||row.words[word.aliasOf]?.aliasOf!==undefined||
              row.words[word.aliasOf]?.en!==word.en||row.words[word.aliasOf]?.zh!==word.zh))) throw Error('DK 词条别名无效');
          const {print,words,headings=[]}=row.labelLayout;
          if (!Array.isArray(print)||!Array.isArray(words)||
              print.some(entry=>!Array.isArray(entry)||!Number.isInteger(entry[0])||!row.textLayers?.[entry[0]]||(entry[1]!==null&&!validSlot(entry[1])))||
              words.some(entry=>!Array.isArray(entry)||!Number.isInteger(entry[0])||!row.words[entry[0]]||
                !['both','zh','en','number','stack'].includes(entry[1])||!validSlot(entry[2])||
                (entry[1]==='stack'&&!validStack(entry[3],row.words[entry[0]].en)))||
              !Array.isArray(headings)||headings.some(entry=>!Array.isArray(entry)||!Number.isInteger(entry[0])||
                typeof row.headings?.[entry[0]]?.zh!=='string'||typeof row.headings[entry[0]].en!=='string'||
                (entry[1]!==null&&(!validSlot(entry[1])||!validStack(entry[2],row.headings[entry[0]].en))))) throw Error('DK 标签位置无效');
        }
        if (row.tiles && (!Array.isArray(row.tiles)||row.tiles.length!==row.words.length||row.tiles.some(box=>!validBox(box)||box[2]<=box[0]||box[3]<=box[1]))) throw Error('重绘图解位置无效');
        if (row.callouts && (!Array.isArray(row.callouts)||row.callouts.length!==row.words.length||row.callouts.some(point=>!point||!['left','right'].includes(point.side)||![point.x,point.y].every(value=>Number.isFinite(value)&&value>=0&&value<=1)))) throw Error('重绘指引线位置无效');
      } else {
        const lists = ['extended','modernPhrases','diagrams','sourceScenes','modernScenes','conversation','references'];
        if (lists.some(key=>!Array.isArray(row[key])) || !Array.isArray(row.drama?.lines) || !assets.has(row.overview) || row.words.some(w=>!assets.has(w.image)||typeof w.term!=='string') || row.diagrams.some(diagram=>!assets.has(diagram.image)||typeof diagram.title!=='string'||!Array.isArray(diagram.hotspots)||diagram.hotspots.some(h=>!Number.isInteger(h.number)))) throw Error('旅行图解资源不完整');
        const words=[...row.words,...row.extended,...row.modernPhrases,...row.diagrams.flatMap(d=>d.hotspots)];
        if (words.some(w=>typeof w.term!=='string'||typeof w.zh!=='string'||(w.id&&!safeId(w.id)))) throw Error('旅行词条结构无效');
        const links=[...row.references.map(r=>r.url),...row.words.flatMap(w=>[w.image_source?.source_page,w.image_source?.license_url].filter(Boolean))];
        if (links.some(url=>typeof url!=='string'||!/^https?:\/\//i.test(url))) throw Error('图解来源链接无效');
      }
    }
  }
  const validBox = box => Array.isArray(box) && box.length===4 && box.every(x=>typeof x==='number'&&x>=0&&x<=1);
  const validSlot = box => validBox(box) && box[2]>0 && box[3]>0 && box[0]+box[2]<=1 && box[1]+box[3]<=1;
  const validStack = (style,text) => Array.isArray(style) && style.length===5 &&
    ['start','center','end'].includes(style[0]) && style.slice(1,4).every(n=>Number.isFinite(n)&&n>=0&&n<=32) &&
    Array.isArray(style[4]) && style[4].length>=1 && style[4].length<=2 &&
    style[4].every(line=>typeof line==='string') && style[4].join(' ')===text;

  async function importZip(file) {
    const entries = await root.AudioImport.unzip(file, {accept:name=>name==='book.json'||name.startsWith('art/'), fullNames:true, maxEntries:1600});
    const manifests = entries.filter(f=>f.name==='book.json');
    if (manifests.length!==1) throw Error('压缩包需要一个 book.json');
    const [manifestFile] = manifests;
    const manifest = JSON.parse(await manifestFile.text());
    const assets = new Map();
    for (const file of entries) {
      if (file === manifestFile) continue;
      const name = file.name.slice(4);
      if (!safeAsset(name) || assets.has(name)) throw Error('图像文件名无效或重复');
      const ext = name.split('.').pop().toLowerCase();
      const mime = ext==='svg'?'image/svg+xml':ext==='jpg'||ext==='jpeg'?'image/jpeg':'image/'+ext;
      if (ext==='svg') {
        const xml=new DOMParser().parseFromString(await file.text(),mime);
        const allowed=new Set(['svg','title','desc','rect','defs','filter','feDropShadow','g','text','tspan','path','line','circle','ellipse','polygon','polyline','image','clipPath','linearGradient','radialGradient','stop']);
        if (xml.doctype || xml.documentElement.localName!=='svg'||[...xml.querySelectorAll('*')].some(node=>!allowed.has(node.localName)||[...node.attributes].some(a=>/^on/i.test(a.localName)||(a.localName==='href'&&!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(a.value))||/url\((?!#[\w-]+\))/i.test(a.value)))) throw Error('SVG 图解包含不支持的内容');
      }
      assets.set(name, file.slice(0,file.size,mime));
    }
    validate(manifest, assets);
    if (root.STORY_DATA.books.some(b=>b.id===manifest.id) && !deleted(manifest.id)) throw Error('这本书已在书架中');
    const record = {id:manifest.id, manifest, assets:[...assets].map(([name,blob])=>({name,blob})), addedAt:Date.now()};
    await write(record);
    attach(record);
    return record.id;
  }

  const deleted = id => records.get(id)?.deleted === true;
  const addedAt = id => records.get(id)?.addedAt || 0;
  async function remove(id) {
    await write({id, deleted:true});
    for (const url of objectUrls.get(id)?.values()||[]) URL.revokeObjectURL(url);
    objectUrls.delete(id);
    await root.NovelLibrary.remove(id).catch(()=>{});
  }

  function download(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  async function exportBook(book, illustrations) {
    const name = book.title.replace(/[<>:"/\\|?*]/g,'-')+'.zip';
    const saved = records.get(book.id);
    const bundledDictionary = book.dk && [root.DK_DATA?.id, root.DK_REDRAWN_DATA?.id].includes(book.id);
    if (bundledDictionary || ((book.dk || book.kind==='travel') && !saved?.manifest)) {
      const asset = book.dk ? root.DkDictionary.asset : root.TravelCourse.asset;
      download(asset('book.zip',book.id),name);
      return;
    }
    let manifest = saved?.manifest, assets = saved?.assets || [];
    if (!manifest || manifest.kind==='story') {
      const {books,chapters,words} = root.STORY_DATA;
      const owned = new Set(book.chapterIds);
      const chaptersCopy = chapters.filter(c=>owned.has(c.id)).map(c=>({...c}));
      const dictionary = {}, members = {}, exportedWords = {};
      assets = [];
      for (const chapter of chaptersCopy) {
        const image = illustrations(chapter.id);
        if (image?.blob && image.enabled) {
          const ext = image.blob.type.split('/')[1] || 'webp';
          chapter.illustration = chapter.id+'.'+ext;
          assets.push({name:chapter.illustration,blob:image.blob});
        } else if (chapter.illustration) {
          const original = saved?.assets.find(a=>a.name===chapter.illustration);
          if (original) assets.push(original);
        }
      }
      for (const id of book.wordIds) {
        const w = words[id];
        exportedWords[id] = {...w, chapters:w.chapters.filter(c=>owned.has(c)), occurrences:w.occurrences.filter(o=>owned.has(o.chapterId))};
        dictionary[id] = root.LOCAL_DICTIONARY.entries[id] || {};
        members[id] = root.LEXICON_DATA.members[id] || [];
      }
      manifest = {format:'shangyin-book-v1', id:book.id, kind:'story', record:{id:book.id,book:{...book,imported:true},chapters:chaptersCopy,words:exportedWords,dictionary,members}};
    }
    const archive = await zip([['book.json', new Blob([JSON.stringify(manifest)])],...assets.map(a=>['art/'+a.name,a.blob])]);
    const url = URL.createObjectURL(archive);
    download(url,name);
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  function createReadout({data, speak, stopAudio, notify}) {
    let run = null;
    function cancel() {
      run = null;
      document.getElementById('book-readout')?.remove();
    }
    async function play(book) {
      stopAudio();
      const words = [...new Set(book.wordIds)].filter(id=>data.words[id]?.en);
      if (!words.length) { notify('这本书没有可朗读的词条'); return; }
      const panel = document.createElement('section');
      panel.id = 'book-readout';
      panel.innerHTML = '<div><strong></strong><p role="status"></p></div><button class="btn secondary small" type="button">停止</button>';
      panel.querySelector('strong').textContent = book.title;
      panel.querySelector('button').addEventListener('click',()=>stopAudio());
      document.body.append(panel);
      const current = run = {panel};
      for (const [index,id] of words.entries()) {
        if (run !== current) return;
        panel.querySelector('p').textContent = `${index+1} / ${words.length} · ${data.words[id].en}`;
        if (!await speak(id)) {
          if (run === current) { cancel(); notify('朗读已停止，请检查当前音色或本地英语语音'); }
          return;
        }
      }
      if (run === current) { cancel(); notify('全书词条朗读完毕'); }
    }
    return {cancel,play};
  }

  root.BookPackages = {hydrate, importZip, exportBook, remove, deleted, addedAt, createReadout, illustration:(bookId,name)=>objectUrls.get(bookId)?.get(name)};
})(window);
