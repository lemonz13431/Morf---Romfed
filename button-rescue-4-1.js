/* Morf 4.1 pre-app button rescue.
   This registers before the main app router, so core buttons still work if a later
   script/listener crashes or stops the normal handlers. It uses MorfCore directly
   and leaves the existing UI + syntax alone. */
(function(){
  'use strict';
  var SAFE_IDS = {
    generateBtn: 'generate', analyzeBtn: 'analyze', pickRandomBtn: 'pick', alphabetizeBtn: 'alpha', selectAllBtn: 'copy',
    exportBtn: 'export', importBtn: 'import', importPastedSettingsBtn: 'pasteImport', copySettingsBtn: 'copySettings',
    clearLocalBtn: 'clearLocal', resetDefaultsBtn: 'reset', sampleBtn: 'sample', addNameCategoryBtn: 'addNameCat',
    addLexiconBtn: 'addLexCat', addVocabularyBtn: 'addVocCat', addAdditionalBtn: 'addPattern'
  };
  var STORE_KEY = 'morf-3-5-1-settings';
  var lastResults = [];
  var lastStats = {};
  function $(id){ return document.getElementById(id); }
  function q(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function status(msg, kind){ var el=$('status'); if(el){ el.textContent=msg; el.dataset.kind=kind||'info'; } }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>'"]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]; }); }
  function core(){ return window.MorfCore || null; }
  function appState(){ try { return window.MorfApp && window.MorfApp.getState && window.MorfApp.getState(); } catch(e){ return null; } }
  function safeState(){
    var M = core();
    if(!M) throw new Error('MorfCore did not load. Re-upload the full HTML file.');
    if(!window.__MorfSafeState){
      var st = appState();
      window.__MorfSafeState = M.normalizeState(st || M.DEFAULT_STATE);
    }
    return window.__MorfSafeState;
  }
  function mutateAppState(newState){
    var st = appState();
    if(!st) return;
    Object.keys(st).forEach(function(k){ delete st[k]; });
    Object.assign(st, JSON.parse(JSON.stringify(newState)));
  }
  function refreshMainUi(){
    try { if(window.MorfApp && typeof window.MorfApp.syncControls === 'function') window.MorfApp.syncControls(); } catch(_) {}
    try { if(window.MorfApp && typeof window.MorfApp.renderDictionary === 'function') window.MorfApp.renderDictionary(); } catch(_) {}
  }
  function textVal(id){ var el=$(id); return el ? el.value : ''; }
  function checked(id){ var el=$(id); return !!(el && el.checked); }
  function readDomIntoState(st){
    var M = core();
    st.generator = st.generator || {};
    st.advanced = st.advanced || {};
    st.font = st.font || {};
    if($('pattern')) st.generator.pattern = textVal('pattern');
    if($('genCount') && !checked('meaningsMode') && !checked('swadeshMode')) st.generator.count = Math.max(1, Math.min(9999, Number(textVal('genCount') || 100)));
    ['avoidDuplicates','capitalize','newlineEach','detectLexicon','meaningsMode','assignCoreMeanings','swadeshMode'].forEach(function(id){ if($(id)) st.generator[id] = checked(id); });
    if($('meaningsText')) st.generator.meaningsText = textVal('meaningsText');
    if($('rewrites')) st.advanced.rewrites = textVal('rewrites');
    if($('forbidden')) st.advanced.forbidden = textVal('forbidden');
    if($('starts')) st.advanced.starts = textVal('starts');
    if($('contains')) st.advanced.contains = textVal('contains');
    if($('ends')) st.advanced.ends = textVal('ends');
    if(M && $('additionalList') && q('#additionalList .card').length){
      st.additionalPatterns = q('#additionalList .card').map(function(card){ return {
        id: card.dataset.id || M.uid('add'), letter: (card.querySelector('.addLetter')||{}).value || '',
        name: (card.querySelector('.addName')||{}).value || '', pattern: (card.querySelector('.addPattern')||{}).value || ''
      }; });
    }
    if(M && $('lexiconList') && q('#lexiconList .card').length){
      st.lexiconCategories = q('#lexiconList .card').map(function(card){ return {
        id: card.dataset.id || M.uid('lex'), letter: (card.querySelector('.lexLetter')||{}).value || '',
        name: (card.querySelector('.lexName')||{}).value || '', placement: (card.querySelector('.lexPlacement')||{}).value || 'anywhere',
        appliesWords: !(card.querySelector('.lexAppliesWords') && !card.querySelector('.lexAppliesWords').checked),
        appliesNames: !!(card.querySelector('.lexAppliesNames') && card.querySelector('.lexAppliesNames').checked),
        entries: M.textToEntries ? M.textToEntries((card.querySelector('.lexEntries')||{}).value || '', 'lex') : []
      }; });
    }
    if(M && $('vocabularyList') && q('#vocabularyList .card').length){
      st.vocabularyCategories = q('#vocabularyList .card').map(function(card){ return {
        id: card.dataset.id || M.uid('voc'), variable: ((card.querySelector('.vocVariable')||{}).value || '').replace(/^\.+|\.+$/g,'').trim(),
        name: (card.querySelector('.vocName')||{}).value || '',
        entries: M.textToEntries ? M.textToEntries((card.querySelector('.vocEntries')||{}).value || '', 'vocab') : []
      }; });
    }
    if(M && $('namesList') && q('#namesList .card').length){
      st.nameCategories = q('#namesList .card').map(function(card){ return {
        id: card.dataset.id || M.uid('name'), variable: ((card.querySelector('.nameVariable')||{}).value || '').replace(/^\.+|\.+$/g,'').trim(),
        name: (card.querySelector('.nameCatName')||{}).value || '', type: (card.querySelector('.nameType')||{}).value || 'name',
        entries: M.textToNameEntries ? M.textToNameEntries((card.querySelector('.nameEntries')||{}).value || '') : []
      }; });
    }
    if(st.generator.meaningsMode){ st.generator.assignCoreMeanings=false; st.generator.swadeshMode=false; }
    if(st.generator.swadeshMode){ st.generator.assignCoreMeanings=false; st.generator.meaningsMode=false; }
    return M.normalizeState(st);
  }
  function meanings(st){ return st.generator && st.generator.meaningsMode ? String(st.generator.meaningsText || '').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean) : []; }
  function renderResults(results, stats, st){
    lastResults = results || []; lastStats = stats || {};
    var wrap=$('results'), out=$('outputText'), stat=$('resultStats');
    if(!wrap) return;
    if(!results || !results.length){
      wrap.innerHTML='<div class="notice error">Generated 0 words. Check the pattern, filters, forbidden sequences, or imported categories.</div>';
      if(out) out.value=''; if(stat) stat.textContent='Printed 0'; return;
    }
    wrap.innerHTML = results.map(function(item, i){
      var segs = item.segs || [];
      var segHtmls = segs.map(function(seg){ return '<button class="segment" type="button" data-form="'+esc(seg.form || '')+'" data-gloss="'+esc(seg.gloss === '?' ? '' : (seg.gloss || ''))+'"><span class="segForm">'+esc(seg.form || '')+'</span><span class="segCat">'+esc(seg.source || seg.cat || '?')+'</span></button>'; }).join('');
      return '<article class="resultItem'+(item.picked?' picked':'')+'"><div class="resultTop"><span class="num">'+(i+1)+'</span><strong class="word">'+esc(item.word)+'</strong>'+(item.picked?'<span class="tag pickedTag">random pick</span>':'')+(item.gloss?' <span class="gloss">'+esc(item.gloss)+'</span>':'')+'</div><div class="resultSegmentsWrap"><span class="resultPiecesLabel">pieces</span><div class="segments">'+(segHtmls || '<span class="muted">No segmentation</span>')+'</div></div><div class="resultAddButtons"><button class="small quickAddWord" type="button" data-prefer="vocab" data-form="'+esc(item.word)+'" data-gloss="'+esc(item.gloss||'')+'">Add to Vocabulary</button><button class="small quickAddWord" type="button" data-prefer="lex" data-form="'+esc(item.word)+'" data-gloss="'+esc(item.gloss||'')+'">Add to Lexicon</button><button class="small quickAddWord" type="button" data-prefer="name" data-form="'+esc(item.word)+'" data-gloss="'+esc(item.gloss||'')+'">Add to Names</button></div></article>';
    }).join('');
    if(out) out.value = results.map(function(r){ return r.gloss ? r.word + ' — ' + r.gloss : r.word; }).join(st.generator && st.generator.newlineEach ? '\n' : ' ');
    if(stat) stat.textContent = 'Printed ' + (stats.generated || results.length) + (stats.requested ? ' of ' + stats.requested : '');
  }
  function doGenerate(){
    var M=core(); if(!M){ status('MorfCore did not load. Re-upload the full HTML file.', 'error'); return false; }
    var st = readDomIntoState(safeState()); window.__MorfSafeState = st; mutateAppState(st);
    if(!String(st.generator.pattern||'').trim()){ status('Enter a generator pattern first.', 'error'); return false; }
    var ms = meanings(st); var count = ms.length || (st.generator.swadeshMode ? 256 : Number(st.generator.count || 100));
    try { var run=M.generateWords(st,{count:count, meanings:ms}); renderResults(run.results, run.stats, st); status(run.stats.generated ? 'Generated '+run.stats.generated+'/'+run.stats.requested+'.' : 'Generated 0 words. Check filters or pattern.', run.stats.generated?'success':'error'); }
    catch(e){ status('Generate failed: '+e.message, 'error'); var wrap=$('results'); if(wrap) wrap.innerHTML='<div class="notice error">'+esc(e.message)+'</div>'; }
    return false;
  }
  function segHtml(seg){ return '<button class="segment" type="button" data-form="'+esc(seg.form||'')+'" data-gloss="'+esc(seg.gloss||'')+'"><span class="segForm">'+esc(seg.form||'')+'</span><span class="segCat">'+esc(seg.cat||seg.source||'?')+'</span></button>'; }
  function doAnalyze(){
    var M=core(); if(!M){ status('MorfCore did not load.', 'error'); return false; }
    var input=$('analysisInput'), box=$('analysisOutput'); if(!input || !input.value.trim()){ status('Type something to analyze.', 'error'); return false; }
    var st=readDomIntoState(safeState()); window.__MorfSafeState=st; mutateAppState(st);
    try { var items=M.analyzeText(input.value.trim(), st); if(box) box.innerHTML=items.map(function(it){ return '<article class="analysisCard"><h3>'+esc(it.word)+'</h3><div class="segments">'+(it.primary||[]).map(segHtml).join('')+'</div><div class="miniGloss"><strong>Gloss:</strong> '+esc(M.glossForSegments ? M.glossForSegments(it.primary||[]) : '')+'</div></article>'; }).join(''); status('Analyzed '+items.length+' token'+(items.length===1?'':'s')+'.','success'); }
    catch(e){ if(box) box.innerHTML='<div class="notice error">'+esc(e.message)+'</div>'; status('Analyze failed: '+e.message,'error'); }
    return false;
  }
  function download(name, text){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'application/json'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function doExport(){ var M=core(); if(!M){ status('MorfCore did not load.', 'error'); return false; } var st=readDomIntoState(safeState()); window.__MorfSafeState=st; mutateAppState(st); download('morf-3-5-settings.morf', M.exportState(st)); status('Exported settings file.','success'); return false; }
  function doImport(){ var inp=$('importFile'); if(!inp){ status('Import input is missing.', 'error'); return false; } inp.removeAttribute('accept'); inp.click(); return false; }
  function applyImported(text, label){
    var M=core();
    if(!M){ status('MorfCore did not load.', 'error'); return false; }
    try{
      var imported = M.importState ? M.importState(text, { preserveFrom: safeState() }) : M.normalizeState(JSON.parse(text));
      var st = M.normalizeState(imported);
      window.__MorfSafeState = st;
      if(window.MorfApp && typeof window.MorfApp.setState === 'function'){
        window.MorfApp.setState(st, { imported: true, source: label || 'settings' });
      }
      mutateAppState(st);
      writeControls(st);
      refreshMainUi();
      status('Imported '+(label||'settings')+'.','success');
      return true;
    }catch(e){
      status('Import failed: '+e.message,'error');
      return false;
    }
  }
  function doPasteImport(){ var box=$('pasteSettingsBox'); if(!box || !box.value.trim()){ status('Paste settings JSON first.', 'error'); return false; } if(applyImported(box.value, 'pasted settings')) box.value=''; return false; }
  function doCopySettings(){ var M=core(), st=readDomIntoState(safeState()), json=M.exportState(st); if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(json).then(function(){status('Settings JSON copied.','success');}, function(){download('morf-3-5-settings.morf', json);}); } else download('morf-3-5-settings.morf', json); return false; }
  function doClear(){ try{ localStorage.removeItem(STORE_KEY); }catch(_){} window.__MorfSafeState=null; status('Autosave cleared for this build.','success'); return false; }
  function doReset(){ var M=core(); if(!M) return false; window.__MorfSafeState=M.normalizeState(M.DEFAULT_STATE); mutateAppState(window.__MorfSafeState); writeControls(window.__MorfSafeState); refreshMainUi(); status('Starter settings restored.','success'); return false; }
  function doSample(){ var st=safeState(); st.generator=st.generator||{}; st.advanced=st.advanced||{}; st.generator.pattern='P R S / [CV]{2}(C) / <CV>&(CV) / .n.'; st.advanced.rewrites='ti=chi\ntu=tsu\n<C>=&1&1'; st.advanced.forbidden='kkk\nppp\nVVV'; writeControls(st); status('Loaded generic sample pattern.','success'); return false; }
  function writeControls(st){
    if($('pattern')) $('pattern').value = (st.generator&&st.generator.pattern)||'';
    if($('genCount')) $('genCount').value = (st.generator&&st.generator.count)||100;
    ['avoidDuplicates','capitalize','newlineEach','detectLexicon','meaningsMode','assignCoreMeanings','swadeshMode'].forEach(function(id){ if($(id)) $(id).checked=!!(st.generator&&st.generator[id]); });
    if($('meaningsText')) $('meaningsText').value=(st.generator&&st.generator.meaningsText)||'';
    if($('meaningsTextWrap')) $('meaningsTextWrap').hidden=!(st.generator&&st.generator.meaningsMode);
    ['rewrites','forbidden','starts','contains','ends'].forEach(function(id){ if($(id)) $(id).value=(st.advanced&&st.advanced[id])||''; });
  }
  function addNameCat(evt){ if(evt && evt.preventDefault) evt.preventDefault(); var M=core(), st=safeState(); st.nameCategories=st.nameCategories||[]; st.nameCategories.push({id:M.uid('name'), variable:'F', name:'New names', type:'person name', entries:[]}); window.__MorfSafeState=st; mutateAppState(st); writeControls(st); refreshMainUi(); if(window.MorfSwitchTab) window.MorfSwitchTab('names'); status('Added a name category.','success'); return false; }
  window.addNameCategory = addNameCat;
  window.MorfAddNameCategoryClick = window.MorfAddNameCategoryClick || addNameCat;
  function addLexCat(){ var M=core(), st=safeState(); st.lexiconCategories=st.lexiconCategories||[]; st.lexiconCategories.push({id:M.uid('lex'), letter:'X', name:'New category', placement:'anywhere', entries:[]}); mutateAppState(st); refreshMainUi(); status('Added a lexicon category.','success'); return false; }
  function addVocCat(){ var M=core(), st=safeState(); st.vocabularyCategories=st.vocabularyCategories||[]; st.vocabularyCategories.push({id:M.uid('voc'), variable:'x', name:'New vocabulary', entries:[]}); mutateAppState(st); refreshMainUi(); status('Added a vocabulary category.','success'); return false; }
  function addPattern(){ var M=core(), st=safeState(); st.additionalPatterns=st.additionalPatterns||[]; st.additionalPatterns.push({id:M.uid('add'), letter:'X', name:'New pattern', pattern:'a/e/i'}); mutateAppState(st); refreshMainUi(); status('Added an additional pattern.','success'); return false; }
  function doPick(){ if(!lastResults.length){ status('Generate words first, then pick random.','error'); return false; } lastResults.forEach(function(r){r.picked=false;}); var idx=Math.floor(Math.random()*lastResults.length); var item=lastResults.splice(idx,1)[0]; item.picked=true; lastResults.unshift(item); renderResults(lastResults,lastStats,safeState()); status('Random pick moved to the top.','success'); return false; }
  function doAlpha(){ if(!lastResults.length){ status('Generate words first, then alphabetize.','error'); return false; } lastResults.sort(function(a,b){return String(a.word).localeCompare(String(b.word));}); renderResults(lastResults,lastStats,safeState()); status('Alphabetized generated words.','success'); return false; }
  function doSelect(){ var out=$('outputText'); if(!out){ return false; } out.focus(); out.select(); try{ document.execCommand('copy'); status('Output selected/copied.','success'); }catch(e){ status('Output selected.','info'); } return false; }
  window.MorfSafeButton = function(evt){ var b=evt && evt.target && evt.target.closest ? evt.target.closest('button') : null; if(!b || !SAFE_IDS[b.id]) return true; if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); } var a=SAFE_IDS[b.id]; return dispatch(a); };
  function dispatch(a){
    if(a==='generate') return doGenerate(); if(a==='analyze') return doAnalyze(); if(a==='pick') return doPick(); if(a==='alpha') return doAlpha(); if(a==='copy') return doSelect();
    if(a==='export') return doExport(); if(a==='import') return doImport(); if(a==='pasteImport') return doPasteImport(); if(a==='copySettings') return doCopySettings(); if(a==='clearLocal') return doClear(); if(a==='reset') return doReset(); if(a==='sample') return doSample();
    if(a==='addNameCat') return addNameCat(); if(a==='addLexCat') return addLexCat(); if(a==='addVocCat') return addVocCat(); if(a==='addPattern') return addPattern(); return false;
  }
  document.addEventListener('click', function(evt){ var b=evt.target && evt.target.closest ? evt.target.closest('button') : null; if(b && SAFE_IDS[b.id]) window.MorfSafeButton(evt); }, true);
  document.addEventListener('change', function(evt){ if(evt.target && evt.target.id==='importFile'){ var file=evt.target.files && evt.target.files[0]; if(!file) return; var r=new FileReader(); r.onload=function(){ applyImported(String(r.result||''), file.name); evt.target.value=''; }; r.onerror=function(){ status('Could not read import file.','error'); }; r.readAsText(file); } }, true);
  window.addEventListener('error', function(e){ status('Script issue: '+(e.message||'unknown')+'. The rescue buttons are still active.', 'error'); });
})();
