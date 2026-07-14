(function(){
  'use strict';

  const M = window.MorfCore;
  if(!M){
    try {
      const el = document.getElementById('status');
      if(el){ el.textContent = 'Script issue: MorfCore did not load. Re-upload the full ZIP files.'; el.dataset.kind='error'; }
    } catch(_) {}
    return;
  }
  const STORE_KEY = 'morf-3-5-compat-settings';
  let state = M.normalizeState(M.DEFAULT_STATE);
  let lastResults = [];
  let lastStats = {};
  let lastElapsed = 0;
  let selectedSegment = null;
  let editingEntry = null;
  let saveTimer = null;

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function setStatus(message, kind='info'){
    const el = $('#status');
    if(!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
  }

  function debounceSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocal, 250);
  }

  function saveLocal(){
    try {
      if(!window.localStorage) return;
      localStorage.setItem(STORE_KEY, M.exportState(state));
    } catch(err){
      // Some website previewers and mobile file viewers block localStorage.
      // The app should still work; only autosave is skipped.
      setStatus('Autosave unavailable here; export still works.', 'info');
    }
  }

  function loadLocal(){
    try {
      if(!window.localStorage) return M.normalizeState(M.DEFAULT_STATE);
      const raw = localStorage.getItem(STORE_KEY);
      if(!raw) return M.normalizeState(M.DEFAULT_STATE);
      return M.importState(raw);
    } catch(err){
      return M.normalizeState(M.DEFAULT_STATE);
    }
  }

  function download(filename, text, type='application/json'){
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function applyOutputFont(){
    const familyMap = {
      system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      arial: 'Arial, Helvetica, sans-serif',
      verdana: 'Verdana, Geneva, sans-serif',
      tahoma: 'Tahoma, Geneva, sans-serif',
      trebuchet: '"Trebuchet MS", sans-serif',
      georgia: 'Georgia, serif',
      garamond: 'Garamond, Baskerville, serif',
      palatino: 'Palatino, "Palatino Linotype", serif',
      courier: '"Courier New", Courier, monospace',
      lucida: '"Lucida Console", Monaco, monospace',
      impact: 'Impact, Haettenschweiler, sans-serif',
      comic: '"Comic Sans MS", "Comic Sans", cursive',
      papyrus: 'Papyrus, fantasy',
      times: '"Times New Roman", Times, serif',
      century: '"Century Gothic", CenturyGothic, sans-serif',
      bookman: '"Bookman Old Style", Bookman, serif',
      candara: 'Candara, Calibri, sans-serif',
      optima: 'Optima, Candara, sans-serif',
      didot: 'Didot, Bodoni 72, serif',
      futura: 'Futura, Trebuchet MS, sans-serif'
    };
    const targets = [$('#results'), $('#outputText'), $('#dictionaryList'), $('#analysisOutput')].filter(Boolean);
    for(const target of targets){
      target.style.fontFamily = familyMap[state.font.family] || familyMap.system;
      target.style.fontSize = `${state.font.size || 20}px`;
      target.style.fontWeight = state.font.bold ? '800' : '400';
      target.style.fontStyle = state.font.italic ? 'italic' : 'normal';
    }
  }

  function syncControls(){
    $('#pattern').value = state.generator.pattern || '';
    $('#genCount').value = state.generator.count || 100;
    $('#avoidDuplicates').checked = !!state.generator.avoidDuplicates;
    $('#capitalize').checked = !!state.generator.capitalize;
    $('#newlineEach').checked = !!state.generator.newlineEach;
    $('#detectLexicon').checked = !!state.generator.detectLexicon;
    $('#meaningsMode').checked = !!state.generator.meaningsMode;
    $('#meaningsText').value = state.generator.meaningsText || '';
    $('#assignCoreMeanings').checked = !!state.generator.assignCoreMeanings;
    $('#swadeshMode').checked = !!state.generator.swadeshMode;
    $('#rewrites').value = state.advanced.rewrites || '';
    $('#forbidden').value = state.advanced.forbidden || '';
    $('#starts').value = state.advanced.starts || '';
    $('#contains').value = state.advanced.contains || '';
    $('#ends').value = state.advanced.ends || '';
    $('#fontFamily').value = state.font.family || 'system';
    $('#fontSize').value = state.font.size || 20;
    $('#fontBold').checked = !!state.font.bold;
    $('#fontItalic').checked = !!state.font.italic;
    updateMeaningModeUI();
    renderEditors();
    renderDictionary();
    applyOutputFont();
  }

  function customMeaningLines(){
    return (state.generator.meaningsText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  function syncMeaningCountDisplay(){
    const countBox = $('#genCount');
    if(!countBox) return;
    if($('#meaningsMode') && $('#meaningsMode').checked){
      const n = customMeaningLines().length;
      countBox.value = n || '';
      countBox.title = n ? `Meanings Mode will generate ${n} word${n === 1 ? '' : 's'}.` : 'Add one meaning per line to set the generated amount.';
    }
  }

  function updateMeaningModeUI(){
    const countBox = $('#genCount');
    const meaningsOn = $('#meaningsMode').checked;
    const swadeshOn = $('#swadeshMode').checked;
    $('#meaningsTextWrap').hidden = !meaningsOn;
    if(countBox) countBox.disabled = meaningsOn || swadeshOn;
    if(meaningsOn){
      syncMeaningCountDisplay();
      $('#assignCoreMeanings').checked = false;
      $('#swadeshMode').checked = false;
      state.generator.assignCoreMeanings = false;
      state.generator.swadeshMode = false;
    } else if(countBox && !swadeshOn){
      const savedCount = Math.max(1, Math.min(9999, Number(state.generator.count || 100)));
      countBox.value = savedCount;
      countBox.title = '';
    }
    if(swadeshOn){
      $('#assignCoreMeanings').checked = false;
      $('#meaningsMode').checked = false;
      state.generator.assignCoreMeanings = false;
      state.generator.meaningsMode = false;
      $('#meaningsTextWrap').hidden = true;
      if(countBox){
        countBox.disabled = true;
        countBox.value = 256;
        countBox.title = 'Swadesh-style mode always generates 256 words.';
      }
    }
  }


  function readGeneratorControlsFromDOM(){
    const el = id => $('#' + id);
    const meaningsOn = !!(el('meaningsMode') && el('meaningsMode').checked);
    const swadeshOn = !!(el('swadeshMode') && el('swadeshMode').checked);
    if(el('pattern')) state.generator.pattern = el('pattern').value;
    if(el('genCount') && !meaningsOn && !swadeshOn) state.generator.count = Math.max(1, Math.min(9999, Number(el('genCount').value || 100)));
    if(el('avoidDuplicates')) state.generator.avoidDuplicates = el('avoidDuplicates').checked;
    if(el('capitalize')) state.generator.capitalize = el('capitalize').checked;
    if(el('newlineEach')) state.generator.newlineEach = el('newlineEach').checked;
    if(el('detectLexicon')) state.generator.detectLexicon = el('detectLexicon').checked;
    if(el('meaningsMode')) state.generator.meaningsMode = meaningsOn;
    if(el('assignCoreMeanings')) state.generator.assignCoreMeanings = el('assignCoreMeanings').checked;
    if(el('swadeshMode')) state.generator.swadeshMode = swadeshOn;
    if(el('meaningsText')) state.generator.meaningsText = el('meaningsText').value;
    if(el('rewrites')) state.advanced.rewrites = el('rewrites').value;
    if(el('forbidden')) state.advanced.forbidden = el('forbidden').value;
    if(el('starts')) state.advanced.starts = el('starts').value;
    if(el('contains')) state.advanced.contains = el('contains').value;
    if(el('ends')) state.advanced.ends = el('ends').value;
    if(state.generator.meaningsMode){
      state.generator.assignCoreMeanings = false;
      state.generator.swadeshMode = false;
    } else if(state.generator.swadeshMode){
      state.generator.assignCoreMeanings = false;
    }
  }

  function bindTabs(){
    $$('.tab').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        if(window.MorfSwitchTab){
          window.MorfSwitchTab(btn.dataset.tab);
          return;
        }
        $$('.tab').forEach(b => b.classList.remove('active'));
        $$('.panel').forEach(p => { p.classList.remove('active'); p.hidden = true; });
        btn.classList.add('active');
        const panel = $('#' + btn.dataset.tab) || $('#tab-' + btn.dataset.tab);
        if(panel){ panel.classList.add('active'); panel.hidden = false; }
        if(btn.dataset.tab === 'dictionary') renderDictionary();
        try { history.replaceState(null, '', '#' + btn.dataset.tab); } catch(err) {}
      });
    });
  }

  function bindGeneratorControls(){
    const on = (sel, type, fn) => { const el = $(sel); if(el) el.addEventListener(type, fn); };
    const bind = (sel, fn) => {
      const el = $(sel);
      if(el) el.addEventListener('input', () => { fn(el); debounceSave(); });
      if(el) el.addEventListener('change', () => { fn(el); debounceSave(); });
    };
    bind('#pattern', el => state.generator.pattern = el.value);
    bind('#genCount', el => state.generator.count = Math.max(1, Math.min(9999, Number(el.value || 1))));
    bind('#avoidDuplicates', el => state.generator.avoidDuplicates = el.checked);
    bind('#capitalize', el => state.generator.capitalize = el.checked);
    bind('#newlineEach', el => state.generator.newlineEach = el.checked);
    bind('#detectLexicon', el => state.generator.detectLexicon = el.checked);
    bind('#meaningsText', el => { state.generator.meaningsText = el.value; syncMeaningCountDisplay(); });
    bind('#rewrites', el => state.advanced.rewrites = el.value);
    bind('#forbidden', el => state.advanced.forbidden = el.value);
    bind('#starts', el => state.advanced.starts = el.value);
    bind('#contains', el => state.advanced.contains = el.value);
    bind('#ends', el => state.advanced.ends = el.value);

    on('#meaningsMode', 'change', e => {
      state.generator.meaningsMode = e.target.checked;
      updateMeaningModeUI();
      debounceSave();
    });
    on('#assignCoreMeanings', 'change', e => {
      state.generator.assignCoreMeanings = e.target.checked;
      if(e.target.checked){
        state.generator.meaningsMode = false;
        state.generator.swadeshMode = false;
        $('#meaningsMode').checked = false;
        $('#swadeshMode').checked = false;
      }
      updateMeaningModeUI();
      debounceSave();
    });
    on('#swadeshMode', 'change', e => {
      state.generator.swadeshMode = e.target.checked;
      if(e.target.checked){
        state.generator.meaningsMode = false;
        state.generator.assignCoreMeanings = false;
        $('#meaningsMode').checked = false;
        $('#assignCoreMeanings').checked = false;
      }
      updateMeaningModeUI();
      debounceSave();
    });

    on('#generateBtn', 'click', generate);
    on('#sampleBtn', 'click', loadSample);
    on('#alphabetizeBtn', 'click', alphabetizeResults);
    on('#pickRandomBtn', 'click', pickRandomResult);
    on('#selectAllBtn', 'click', selectCopyOutput);
  }

  function alphabetizeResults(){
    if(!lastResults.length){ setStatus('Generate words first, then alphabetize.', 'error'); return; }
    lastResults.sort((a,b) => a.word.localeCompare(b.word));
    renderResults(lastResults, lastStats, lastElapsed);
  }

  function pickRandomResult(){
    if(!lastResults.length){ setStatus('Generate words first, then pick random.', 'error'); return; }
    const pickIndex = Math.floor(Math.random() * lastResults.length);
    const picked = Object.assign({}, lastResults[pickIndex], { picked: true });
    const rest = lastResults
      .filter((_, idx) => idx !== pickIndex)
      .map(item => Object.assign({}, item, { picked: false }));
    lastResults = [picked].concat(rest);
    renderResults(lastResults, lastStats, lastElapsed);
    setStatus(`Random pick moved to top: ${picked.word}${picked.gloss ? ' — ' + picked.gloss : ''}`, 'success');
    const top = $('#results .resultItem.picked');
    if(top && top.scrollIntoView) top.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function selectCopyOutput(){
    const out = $('#outputText');
    if(!out){ setStatus('No output box found.', 'error'); return; }
    out.focus();
    out.select();
    try { navigator.clipboard.writeText(out.value); setStatus('Output selected and copied.', 'success'); }
    catch(err){ setStatus('Output selected.', 'info'); }
  }

  function getMeaningsForGeneration(){
    if(state.generator.swadeshMode) return M.DEFAULT_CORE_MEANINGS.slice(0, 256);
    if(state.generator.meaningsMode){
      return customMeaningLines();
    }
    if(state.generator.assignCoreMeanings){
      const pool = M.DEFAULT_CORE_MEANINGS.slice();
      for(let i=pool.length-1;i>0;i--){
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, state.generator.count || 100);
    }
    return [];
  }

  function zeroGenerationMessage(stats){
    const parts = [];
    if(stats.ruleErrors && stats.ruleErrors.length) parts.push('one advanced rule has an issue: ' + stats.ruleErrors[0]);
    if(stats.filters) parts.push('Starts / Contains / Ends filters rejected the generated words');
    if(stats.forbidden) parts.push('Forbidden sequences rejected the generated words');
    if(stats.duplicates) parts.push('Filter duplicates may have exhausted the small word pool');
    if(stats.failed) parts.push('the pattern could not expand with the current imported categories/patterns');
    if(stats.errors && stats.errors.length) parts.push(stats.errors[0]);
    if(!parts.length) parts.push('the current pattern/settings did not produce usable words');
    return 'Generated 0 words: ' + parts.join('; ') + '.';
  }

  function generate(){
    try {
      readGeneratorControlsFromDOM();
      const pattern = (state.generator.pattern || '').trim();
      if(!pattern){
        lastResults = [];
        lastStats = {};
        lastElapsed = 0;
        $('#results').innerHTML = '<div class="notice error">Enter a generator pattern first, like <code>CV</code> or <code>[CV]{2}</code>.</div>';
        $('#outputText').value = '';
        $('#resultStats').textContent = 'No pattern entered';
        setStatus('Enter a generator pattern first.', 'error');
        return;
      }
      const meanings = getMeaningsForGeneration();
      const count = meanings.length || state.generator.count || 100;
      const start = (window.performance && performance.now) ? performance.now() : Date.now();
      const run = M.generateWords(state, { count, meanings });
      const elapsed = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - start);
      lastResults = run.results.map(item => Object.assign({}, item, { picked: false }));
      lastStats = run.stats || {};
      lastElapsed = elapsed;
      renderResults(lastResults, lastStats, lastElapsed);
      const status = run.stats.generated
        ? `Generated ${run.stats.generated}/${run.stats.requested} in ${elapsed} ms. Attempts: ${run.stats.attempts}.`
        : zeroGenerationMessage(run.stats);
      setStatus(status, run.stats.generated ? 'success' : 'error');
      debounceSave();
    } catch(err){
      setStatus(err.message, 'error');
      $('#results').innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
    }
  }

  function isDictionarySegment(seg){
    return seg && (seg.source === 'lexicon' || seg.source === 'vocabulary' || seg.source === 'name');
  }

  function hasDictionarySegments(segs){
    return Array.isArray(segs) && segs.some(isDictionarySegment);
  }

  function collapseGeneratedRuns(segs){
    const out = [];
    let generated = '';
    const flushGenerated = () => {
      if(generated){
        out.push({ form: generated, cat: 'generated', source: 'generated', gloss: '?' });
        generated = '';
      }
    };
    for(const seg of (segs || [])){
      if(isDictionarySegment(seg)){
        flushGenerated();
        out.push(seg);
      } else {
        generated += String((seg && seg.form) || '');
      }
    }
    flushGenerated();
    return out;
  }

  function displaySegmentsForResult(item){
    const word = String((item && item.word) || '');
    const rawSegs = Array.isArray(item && item.segs) ? item.segs : [];
    if(!word || !rawSegs.length) return rawSegs;

    const aligned = [];
    let pos = 0;
    for(const seg of rawSegs){
      const form = String((seg && seg.form) || '');
      if(!form) continue;
      const idx = word.indexOf(form, pos);
      if(idx < 0) continue;
      if(idx > pos){
        aligned.push({ form: word.slice(pos, idx), cat: 'generated', source: 'generated', gloss: '?' });
      }
      aligned.push(Object.assign({}, seg, { form: word.slice(idx, idx + form.length) }));
      pos = idx + form.length;
      if(pos >= word.length) break;
    }
    if(pos < word.length){
      aligned.push({ form: word.slice(pos), cat: 'generated', source: 'generated', gloss: '?' });
    }

    const collapsed = [];
    let unknown = '';
    const flushUnknown = () => {
      if(unknown){
        collapsed.push({ form: unknown, cat: 'generated', source: 'generated', gloss: '?' });
        unknown = '';
      }
    };
    for(const seg of aligned){
      if(isDictionarySegment(seg)){
        flushUnknown();
        collapsed.push(seg);
      } else {
        unknown += String(seg.form || '');
      }
    }
    flushUnknown();
    return collapsed;
  }

  function renderResults(results, stats={}, elapsed=0){
    const wrap = $('#results');
    if(!results.length){
      const requested = stats && stats.requested;
      const msg = requested ? zeroGenerationMessage(stats) : 'No words yet.';
      wrap.innerHTML = `<div class="notice ${requested ? 'error' : ''}">${escapeHtml(msg)}</div>`;
      $('#outputText').value = '';
      let statText = requested ? `Printed 0 of ${stats.requested}` : 'No words';
      if(stats && stats.duplicates) statText += ` · duplicates skipped ${stats.duplicates}`;
      if(stats && stats.forbidden) statText += ` · forbidden skipped ${stats.forbidden}`;
      if(stats && stats.filters) statText += ` · filter skipped ${stats.filters}`;
      if(stats && stats.failed) statText += ` · failed attempts ${stats.failed}`;
      if(stats && stats.ruleErrors && stats.ruleErrors.length) statText += ` · rule issues: ${stats.ruleErrors.slice(0, 3).join('; ')}`;
      $('#resultStats').textContent = statText;
      return;
    }
    wrap.innerHTML = results.map((item, idx) => {
      const analysis = item.analysis && item.analysis.primary ? item.analysis.primary : [];
      // Prefer analyzer output only when it actually found stored dictionary pieces.
      // Otherwise, use the generator's own produced pieces and collapse consecutive
      // Additional Pattern fragments into one generated chunk. So CVC displays as
      // one root-like chunk (ape), while P+CVC displays as known prefix + unknown
      // generated root (pre-ape).
      const baseSegs = hasDictionarySegments(analysis) ? analysis : displaySegmentsForResult(item);
      const segs = collapseGeneratedRuns(baseSegs);
      const segmentsHtml = segs.map(seg => segmentHtml(seg)).join('');
      const gloss = item.gloss || (hasDictionarySegments(analysis) ? M.glossForSegments(analysis) : '');
      const quickGloss = escapeHtml(item.gloss || gloss || '');
      return `<article class="resultItem${item.picked ? ' picked' : ''}" data-word="${escapeHtml(item.word)}">
        <div class="resultTop">
          <span class="num">${idx + 1}</span>
          <strong class="word">${escapeHtml(item.word)}</strong>
          ${item.picked ? '<span class="tag pickedTag">random pick</span>' : ''}
          ${item.gloss ? `<span class="gloss">${escapeHtml(item.gloss)}</span>` : ''}
        </div>
        <div class="resultSegmentsWrap" aria-label="Generated pieces for ${escapeHtml(item.word)}">
          <span class="resultPiecesLabel">pieces</span>
          <div class="segments">${segmentsHtml || '<span class="muted">No segmentation</span>'}</div>
        </div>
        ${gloss && !item.gloss ? `<div class="miniGloss">${escapeHtml(gloss)}</div>` : ''}
        <div class="resultAddButtons">
          <button class="small quickAddWord" type="button" data-prefer="vocab" data-form="${escapeHtml(item.word)}" data-gloss="${quickGloss}">Add to Vocabulary</button>
          <button class="small quickAddWord" type="button" data-prefer="lex" data-form="${escapeHtml(item.word)}" data-gloss="${quickGloss}">Add to Lexicon</button>
          <button class="small quickAddWord" type="button" data-prefer="name" data-form="${escapeHtml(item.word)}" data-gloss="${quickGloss}">Add to Names</button>
        </div>
      </article>`;
    }).join('');

    const outputLines = results.map(item => item.gloss ? `${item.word} — ${item.gloss}` : item.word);
    $('#outputText').value = state.generator.newlineEach ? outputLines.join('\n') : outputLines.join(' ');
    let statText = `Printed ${stats.generated ?? results.length}`;
    if(stats.requested) statText += ` of ${stats.requested}`;
    if(stats.duplicates) statText += ` · duplicates skipped ${stats.duplicates}`;
    if(stats.forbidden) statText += ` · forbidden skipped ${stats.forbidden}`;
    if(stats.filters) statText += ` · filter skipped ${stats.filters}`;
    if(stats.rewrites) statText += ` · rewrites fired ${stats.rewrites}`;
    if(stats.adjusted) statText += ` · positional fixes ${stats.adjusted}`;
    if(elapsed) statText += ` · ${elapsed} ms`;
    if(stats.ruleErrors && stats.ruleErrors.length) statText += ` · rule issues: ${stats.ruleErrors.slice(0, 3).join('; ')}`;
    $('#resultStats').textContent = statText;
    applyOutputFont();
  }

  function segmentHtml(seg){
    if(!seg || !seg.form) return '';
    const source = seg.source || seg.cat || 'segment';
    const labelParts = [`${seg.cat || source}${seg.gloss ? ': ' + seg.gloss : ''}`];
    if(seg.literal) labelParts.push('literal: ' + seg.literal);
    if(seg.actual && seg.actual !== seg.gloss) labelParts.push('actual: ' + seg.actual);
    if(seg.isNickname && seg.nicknameOf) labelParts.push('nickname of: ' + seg.nicknameOf);
    const label = labelParts.filter(Boolean).join(' · ');
    const shownCat = source === 'generated' ? '?' : (seg.cat || source);
    return `<button class="segment" type="button" data-form="${escapeHtml(seg.form)}" data-gloss="${escapeHtml(seg.gloss === '?' ? '' : (seg.gloss || ''))}" data-literal="${escapeHtml(seg.literal || '')}" data-actual="${escapeHtml(seg.actual || seg.gloss || '')}" data-nickname-of="${escapeHtml(seg.nicknameOf || '')}" title="${escapeHtml(label)}">
      <span class="segForm">${escapeHtml(seg.form)}</span><span class="segCat">${escapeHtml(shownCat)}</span>
    </button>`;
  }

  function bindSegmentClicks(){
    document.body.addEventListener('click', e => {
      const editBtn = e.target.closest('.dictEdit');
      if(editBtn){
        e.preventDefault();
        openEntryEditDialog(editBtn.dataset.scope, editBtn.dataset.catid, editBtn.dataset.entryid);
        return;
      }
      const quickWord = e.target.closest('.quickAddWord');
      if(quickWord){
        selectedSegment = { form: quickWord.dataset.form || '', gloss: quickWord.dataset.gloss || '', prefer: quickWord.dataset.prefer || '', literal: quickWord.dataset.literal || '', actual: quickWord.dataset.actual || '' };
        openSegmentDialog(selectedSegment, selectedSegment.prefer);
        return;
      }
      const seg = e.target.closest('.segment');
      if(seg){
        selectedSegment = { form: seg.dataset.form || seg.textContent.trim(), gloss: seg.dataset.gloss || '', literal: seg.dataset.literal || '', actual: seg.dataset.actual || '' };
        openSegmentDialog(selectedSegment);
      }
    });
  }

  function renderEditors(){
    renderAdditionalPatterns();
    renderLexicon();
    renderVocabulary();
    renderNames();
    populateCategorySelects();
  }

  function cardHeader(title, subtitle, delClass){
    return `<div class="cardHead"><div><strong>${escapeHtml(title)}</strong>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}</div><button class="small danger ${delClass}" type="button">Delete</button></div>`;
  }

  function renderAdditionalPatterns(){
    const wrap = $('#additionalList');
    wrap.innerHTML = (state.additionalPatterns || []).map(p => `<section class="card" data-id="${escapeHtml(p.id)}">
      ${cardHeader(p.name || p.letter || 'Pattern', `Variable ${p.letter || '?'}`, 'deleteAdd')}
      <div class="grid two">
        <label>Letter / code<input class="addLetter" maxlength="8" value="${escapeHtml(p.letter || '')}"></label>
        <label>Name<input class="addName" value="${escapeHtml(p.name || '')}"></label>
      </div>
      <label>Pattern<textarea class="addPattern" spellcheck="false">${escapeHtml(p.pattern || '')}</textarea></label>
    </section>`).join('') || '<div class="notice">No additional patterns yet.</div>';
  }

  function renderLexicon(){
    const wrap = $('#lexiconList');
    wrap.innerHTML = (state.lexiconCategories || []).map(c => `<section class="card" data-id="${escapeHtml(c.id)}">
      ${cardHeader(c.name || c.letter || 'Lexicon', `Letter ${c.letter || '?'} · ${c.placement || 'anywhere'}`, 'deleteLex')}
      <div class="grid three">
        <label>Letter<input class="lexLetter" maxlength="8" value="${escapeHtml(c.letter || '')}"></label>
        <label>Name<input class="lexName" value="${escapeHtml(c.name || '')}"></label>
        <label>Placement<select class="lexPlacement">
          ${['start','middle','end','anywhere'].map(v => `<option value="${v}" ${v === (c.placement || 'anywhere') ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>
      </div>
      <div class="grid two compactChecks">
        <label class="check"><input class="lexAppliesWords" type="checkbox" ${c.appliesWords === false ? '' : 'checked'}> Applies to words</label>
        <label class="check"><input class="lexAppliesNames" type="checkbox" ${c.appliesNames ? 'checked' : ''}> Applies to names</label>
      </div>
      <label>Entries <span class="hint">one per line: form = gloss ;{V{Nouns}dog}; links it into a family</span><textarea class="lexEntries" spellcheck="false">${escapeHtml(M.entriesToText(c.entries || [], 'lex'))}</textarea></label>
    </section>`).join('') || '<div class="notice">No lexicon categories yet.</div>';
  }

  function renderVocabulary(){
    const wrap = $('#vocabularyList');
    wrap.innerHTML = (state.vocabularyCategories || []).map(c => `<section class="card" data-id="${escapeHtml(c.id)}">
      ${cardHeader(c.name || c.variable || 'Vocabulary', `Variable .${c.variable || '?'}.`, 'deleteVoc')}
      <div class="grid two">
        <label>Dot variable<input class="vocVariable" value="${escapeHtml(c.variable || '')}"></label>
        <label>Name<input class="vocName" value="${escapeHtml(c.name || '')}"></label>
      </div>
      <label>Whole-word entries <span class="hint">one per line: word = gloss ;{V{Nouns}dog}; to link family forms</span><textarea class="vocEntries" spellcheck="false">${escapeHtml(M.entriesToText(c.entries || [], 'vocab'))}</textarea></label>
    </section>`).join('') || '<div class="notice">No vocabulary categories yet.</div>';
  }



  function renderNames(){
    const wrap = $('#namesList');
    if(!wrap) return;
    wrap.innerHTML = (state.nameCategories || []).map(c => `<section class="card" data-id="${escapeHtml(c.id)}">
      ${cardHeader(c.name || c.variable || 'Names', `Variable ..${c.variable || '?'}.. · ${c.type || 'name'}`, 'deleteNameCat')}
      <div class="grid three">
        <label>Double-dot variable<input class="nameVariable" value="${escapeHtml(c.variable || '')}"></label>
        <label>Name<input class="nameCatName" value="${escapeHtml(c.name || '')}"></label>
        <label>Type<input class="nameType" value="${escapeHtml(c.type || '')}" placeholder="person, place, title..."></label>
      </div>
      <label>Name entries <span class="hint">one per line: Name, Nickname = meaning ;{N{First names}Isabella}; links family names. Literal analysis is detected from Lexicon automatically.</span><textarea class="nameEntries" spellcheck="false" placeholder="Sila, Sil = bird-associated
Jord[a/y]n, Jordy = river child">${escapeHtml(M.nameEntriesToText ? M.nameEntriesToText(c.entries || []) : '')}</textarea></label>
    </section>`).join('') || '<div class="notice">No name categories yet.</div>';
  }


  function addNameCategory(e){
    if(e){ e.preventDefault(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }
    state.nameCategories = state.nameCategories || [];
    let variable = 'F';
    const used = new Set(state.nameCategories.map(c => String(c.variable || '').trim()).filter(Boolean));
    if(used.has(variable)){
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      variable = alphabet.find(ch => !used.has(ch)) || ('N' + (state.nameCategories.length + 1));
    }
    const cat = {
      id: M.uid('name'),
      variable,
      name: 'New names',
      type: 'person name',
      entries: []
    };
    state.nameCategories.push(cat);
    renderNames();
    populateCategorySelects();
    renderDictionary();
    debounceSave();
    if(window.MorfSwitchTab) window.MorfSwitchTab('names');
    setStatus('Added a name category.', 'success');
    return false;
  }

  function bindEditors(){
    $('#addAdditionalBtn').addEventListener('click', () => {
      state.additionalPatterns.push({ id: M.uid('add'), letter: 'X', name: 'New pattern', pattern: 'a/e/i' });
      renderAdditionalPatterns(); debounceSave();
    });
    $('#addLexiconBtn').addEventListener('click', () => {
      state.lexiconCategories.push({ id: M.uid('lex'), letter: 'X', name: 'New category', placement: 'anywhere', entries: [] });
      renderLexicon(); populateCategorySelects(); debounceSave();
    });
    $('#addVocabularyBtn').addEventListener('click', () => {
      state.vocabularyCategories.push({ id: M.uid('voc'), variable: 'x', name: 'New vocabulary', entries: [] });
      renderVocabulary(); populateCategorySelects(); debounceSave();
    });
    const addNameBtn = $('#addNameCategoryBtn');
    if(addNameBtn) addNameBtn.addEventListener('click', addNameCategory);
    $('#resetDefaultsBtn').addEventListener('click', () => {
      if(confirm('Restore the starter Morf settings? This replaces the current local settings.')){
        state = M.normalizeState(M.DEFAULT_STATE);
        lastResults = [];
        syncControls();
        saveLocal();
        setStatus('Starter settings restored.', 'success');
      }
    });

    $('#additionalList').addEventListener('input', e => updateAdditionalFromEvent(e));
    $('#additionalList').addEventListener('click', e => {
      if(e.target.classList.contains('deleteAdd')){
        const id = e.target.closest('.card').dataset.id;
        state.additionalPatterns = state.additionalPatterns.filter(p => p.id !== id);
        renderAdditionalPatterns(); debounceSave();
      }
    });
    $('#lexiconList').addEventListener('input', e => updateLexFromEvent(e));
    $('#lexiconList').addEventListener('change', e => updateLexFromEvent(e));
    $('#lexiconList').addEventListener('click', e => {
      if(e.target.classList.contains('deleteLex')){
        const id = e.target.closest('.card').dataset.id;
        state.lexiconCategories = state.lexiconCategories.filter(c => c.id !== id);
        renderLexicon(); populateCategorySelects(); debounceSave();
      }
    });
    $('#vocabularyList').addEventListener('input', e => updateVocFromEvent(e));
    $('#vocabularyList').addEventListener('click', e => {
      if(e.target.classList.contains('deleteVoc')){
        const id = e.target.closest('.card').dataset.id;
        state.vocabularyCategories = state.vocabularyCategories.filter(c => c.id !== id);
        renderVocabulary(); populateCategorySelects(); debounceSave();
      }
    });
    const namesList = $('#namesList');
    if(namesList){
      namesList.addEventListener('input', e => updateNameFromEvent(e));
      namesList.addEventListener('click', e => {
        if(e.target.classList.contains('deleteNameCat')){
          const id = e.target.closest('.card').dataset.id;
          state.nameCategories = (state.nameCategories || []).filter(c => c.id !== id);
          renderNames(); populateCategorySelects(); debounceSave();
        }
      });
    }
  }

  function updateAdditionalFromEvent(e){
    const card = e.target.closest('.card');
    if(!card) return;
    const p = state.additionalPatterns.find(x => x.id === card.dataset.id);
    if(!p) return;
    if(e.target.classList.contains('addLetter')) p.letter = e.target.value.trim();
    if(e.target.classList.contains('addName')) p.name = e.target.value;
    if(e.target.classList.contains('addPattern')) p.pattern = e.target.value;
    debounceSave();
  }

  function updateLexFromEvent(e){
    const card = e.target.closest('.card');
    if(!card) return;
    const c = state.lexiconCategories.find(x => x.id === card.dataset.id);
    if(!c) return;
    if(e.target.classList.contains('lexLetter')) c.letter = e.target.value.trim();
    if(e.target.classList.contains('lexName')) c.name = e.target.value;
    if(e.target.classList.contains('lexPlacement')) c.placement = e.target.value;
    if(e.target.classList.contains('lexEntries')) c.entries = M.textToEntries(e.target.value, 'lex');
    if(e.target.classList.contains('lexAppliesWords')) c.appliesWords = e.target.checked;
    if(e.target.classList.contains('lexAppliesNames')) c.appliesNames = e.target.checked;
    populateCategorySelects();
    debounceSave();
  }

  function updateVocFromEvent(e){
    const card = e.target.closest('.card');
    if(!card) return;
    const c = state.vocabularyCategories.find(x => x.id === card.dataset.id);
    if(!c) return;
    if(e.target.classList.contains('vocVariable')) c.variable = e.target.value.replace(/^\.+|\.+$/g, '').trim().toLowerCase();
    if(e.target.classList.contains('vocName')) c.name = e.target.value;
    if(e.target.classList.contains('vocEntries')) c.entries = M.textToEntries(e.target.value, 'vocab');
    populateCategorySelects();
    debounceSave();
  }

  function updateNameFromEvent(e){
    const card = e.target.closest('.card');
    if(!card) return;
    const c = (state.nameCategories || []).find(x => x.id === card.dataset.id);
    if(!c) return;
    if(e.target.classList.contains('nameVariable')) c.variable = e.target.value.replace(/^\.+|\.+$/g, '').trim();
    if(e.target.classList.contains('nameCatName')) c.name = e.target.value;
    if(e.target.classList.contains('nameType')) c.type = e.target.value;
    if(e.target.classList.contains('nameEntries')) c.entries = M.textToNameEntries ? M.textToNameEntries(e.target.value) : [];
    populateCategorySelects();
    debounceSave();
  }

  function populateCategorySelects(){
    const lexOptions = (state.lexiconCategories || []).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.letter)}</option>`).join('');
    const vocOptions = (state.vocabularyCategories || []).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.variable)}</option>`).join('');
    const patOptions = (state.additionalPatterns || []).map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml((p.letter || '?') + ' · ' + (p.name || 'Pattern'))}</option>`).join('');
    const nameOptions = (state.nameCategories || []).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.variable)}</option>`).join('');
    const lexSel = $('#segmentLexCat');
    const vocSel = $('#segmentVocCat');
    const nameSel = $('#segmentNameCat');
    if(lexSel) lexSel.innerHTML = lexOptions;
    if(vocSel) vocSel.innerHTML = vocOptions;
    if(nameSel) nameSel.innerHTML = nameOptions;
    const moveLex = $('#moveLexCat');
    const moveVoc = $('#moveVocCat');
    const movePat = $('#movePatternCat');
    const moveName = $('#moveNameCat');
    if(moveLex) moveLex.innerHTML = lexOptions;
    if(moveVoc) moveVoc.innerHTML = vocOptions;
    if(moveName) moveName.innerHTML = nameOptions;
    if(movePat) movePat.innerHTML = patOptions;
    const filter = $('#dictCategoryFilter');
    if(filter){
      const current = filter.value || 'all';
      const opts = ['<option value="all">All categories</option>']
        .concat((state.lexiconCategories || []).map(c => `<option value="lex:${escapeHtml(c.id)}">Lexicon: ${escapeHtml(c.name || c.letter)}</option>`))
        .concat((state.vocabularyCategories || []).map(c => `<option value="voc:${escapeHtml(c.id)}">Vocabulary: ${escapeHtml(c.name || c.variable)}</option>`))
        .concat((state.nameCategories || []).map(c => `<option value="name:${escapeHtml(c.id)}">Names: ${escapeHtml(c.name || c.variable)}</option>`));
      filter.innerHTML = opts.join('');
      filter.value = opts.some(o => o.includes(`value="${current}"`)) ? current : 'all';
    }
  }

  function bindTranslator(){
    const analyzeBtn = $('#analyzeBtn');
    if(analyzeBtn) analyzeBtn.addEventListener('click', analyzeInput);
    const analysisInput = $('#analysisInput');
    if(analysisInput) analysisInput.addEventListener('keydown', e => {
      if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyzeInput();
    });
    const addRawLexBtn = $('#addRawLexBtn');
    if(addRawLexBtn) addRawLexBtn.addEventListener('click', () => {
      const word = (($('#analysisInput') && $('#analysisInput').value) || '').trim().split(/\s+/)[0];
      if(!word){ setStatus('Type a word first.', 'error'); return; }
      selectedSegment = { form: word, gloss: '' };
      openSegmentDialog(selectedSegment);
    });
  }

  function analyzeInput(){
    const text = $('#analysisInput').value.trim();
    if(!text){ setStatus('Type something to analyze.', 'error'); return; }
    try {
      const analyses = M.analyzeText(text, state);
      renderAnalysis(analyses);
      setStatus(`Analyzed ${analyses.length} token${analyses.length === 1 ? '' : 's'}.`, 'success');
    } catch(err){
      $('#analysisOutput').innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
      setStatus(err.message, 'error');
    }
  }

  function glossForMeaningChoice(segs){
    return (segs || []).map(s => s.gloss || (s.source === 'unknown' ? '?' : s.form)).filter(Boolean).join('-');
  }

  function meaningChoiceAlternatives(primary, existingAlts){
    const out = [];
    const seen = new Set();
    const add = (segs) => {
      const key = (segs || []).map(s => `${s.source}:${s.cat}:${s.form}:${s.gloss}`).join('|');
      if(!key || seen.has(key)) return;
      seen.add(key);
      out.push(segs);
    };
    for(const alt of existingAlts || []) add(alt);
    const base = primary || [];
    for(let i=0; i<base.length && out.length < 16; i++){
      const meanings = Array.isArray(base[i].meanings) ? base[i].meanings.filter(Boolean) : [];
      for(const meaning of meanings.slice(1)){
        const clone = base.map(seg => Object.assign({}, seg));
        clone[i].gloss = meaning;
        add(clone);
        if(out.length >= 16) break;
      }
    }
    return out;
  }

  function renderAnalysis(analyses){
    $('#analysisOutput').innerHTML = analyses.map(item => {
      const primaryGloss = M.glossForSegments(item.primary);
      const alts = meaningChoiceAlternatives(item.primary || [], item.alternatives || []);
      const altHtml = alts.slice(0, 10).map((alt, i) => `<details><summary>Alternative ${i + 1}: ${escapeHtml(glossForMeaningChoice(alt) || '(no gloss)')}</summary><div class="segments">${alt.map(segmentHtml).join('')}</div></details>`).join('');
      return `<article class="analysisCard">
        <h3>${escapeHtml(item.word)} ${item.literal ? '<span class="tag">quoted literal</span>' : ''}</h3>
        <div class="segments">${(item.primary || []).map(segmentHtml).join('')}</div>
        <div class="miniGloss"><strong>Gloss:</strong> ${escapeHtml(primaryGloss || '(none)')}</div>
        ${altHtml ? `<div class="alternatives">${altHtml}</div>` : ''}
      </article>`;
    }).join('');
    applyOutputFont();
  }

  function setSegmentDialogMode(mode){
    const isEdit = mode === 'edit';
    const addControls = $('#addCategoryControls');
    const addActions = $('#addSegmentActions');
    const editControls = $('#editEntryControls');
    if(addControls) addControls.hidden = isEdit;
    if(addActions) addActions.hidden = isEdit;
    if(editControls) editControls.hidden = !isEdit;
  }

  function openSegmentDialog(seg, prefer=''){
    editingEntry = null;
    const dialog = $('#segmentDialog');
    $('#segmentForm').value = seg.form || '';
    $('#segmentGloss').value = seg.gloss || '';
    const literalInfo = $('#segmentLiteralInfo');
    if(literalInfo){
      let detected = seg.literal || '';
      if(!detected && prefer === 'name' && M.analyzeNameLiteral){
        try { detected = (M.analyzeNameLiteral(seg.form || '', state).gloss || ''); } catch(_) { detected = ''; }
      }
      literalInfo.hidden = !detected;
      literalInfo.innerHTML = detected ? `<strong>Detected literal meaning:</strong> ${escapeHtml(detected)}${seg.gloss ? `<br><strong>Actual meaning:</strong> ${escapeHtml(seg.gloss)}` : ''}` : '';
    }
    populateCategorySelects();
    setSegmentDialogMode('add');
    $('#segmentDialogTitle').textContent = prefer === 'lex' ? 'Add to Lexicon' : (prefer === 'vocab' ? 'Add to Vocabulary' : (prefer === 'name' ? 'Add to Names' : 'Add segment'));
    $('#addSegmentLex').classList.toggle('primary', prefer !== 'vocab' && prefer !== 'name');
    $('#addSegmentVoc').classList.toggle('primary', prefer === 'vocab');
    const addNameBtnOpen = $('#addSegmentName');
    if(addNameBtnOpen) addNameBtnOpen.classList.toggle('primary', prefer === 'name');
    dialog.showModal();
  }

  function findEntryRef(scope, catId, entryId){
    if(scope === 'lex'){
      const cat = (state.lexiconCategories || []).find(c => c.id === catId);
      const entry = cat && (cat.entries || []).find(e => String(e.id || e.form) === String(entryId));
      return cat && entry ? { scope, cat, entry } : null;
    }
    if(scope === 'vocab'){
      const cat = (state.vocabularyCategories || []).find(c => c.id === catId);
      const entry = cat && (cat.entries || []).find(e => String(e.id || e.word) === String(entryId));
      return cat && entry ? { scope, cat, entry } : null;
    }
    if(scope === 'name'){
      const cat = (state.nameCategories || []).find(c => c.id === catId);
      const entry = cat && (cat.entries || []).find(e => String(e.id || e.name) === String(entryId));
      return cat && entry ? { scope, cat, entry } : null;
    }
    return null;
  }

  function openEntryEditDialog(scope, catId, entryId){
    const ref = findEntryRef(scope, catId, entryId);
    if(!ref){ setStatus('Could not find that dictionary entry to edit.', 'error'); return; }
    editingEntry = { scope, catId, entryId };
    populateCategorySelects();
    $('#segmentDialogTitle').textContent = 'Edit dictionary entry';
    $('#segmentForm').value = scope === 'lex' ? (ref.entry.form || '') : (scope === 'vocab' ? (ref.entry.word || '') : (ref.entry.name || ''));
    $('#segmentGloss').value = scope === 'name' ? (ref.entry.actual || ref.entry.gloss || ref.entry.meaning || '') : (ref.entry.gloss || ref.entry.meaning || '');
    const literalInfo = $('#segmentLiteralInfo');
    if(literalInfo){
      let detected = ref.entry.literal || '';
      if(scope === 'name' && !detected && M.analyzeNameLiteral){
        try { detected = (M.analyzeNameLiteral(ref.entry.name || '', state).gloss || ''); } catch(_) { detected = ''; }
      }
      literalInfo.hidden = !(scope === 'name' && detected);
      literalInfo.innerHTML = (scope === 'name' && detected) ? `<strong>Detected literal meaning:</strong> ${escapeHtml(detected)}` : '';
    }
    setSegmentDialogMode('edit');
    const moveKind = $('#moveEntryKind');
    if(moveKind){
      moveKind.value = scope === 'lex' ? 'lex' : (scope === 'name' ? 'name' : 'vocab');
      if(scope === 'lex' && $('#moveLexCat')) $('#moveLexCat').value = catId;
      if(scope === 'vocab' && $('#moveVocCat')) $('#moveVocCat').value = catId;
      if(scope === 'name' && $('#moveNameCat')) $('#moveNameCat').value = catId;
      updateMoveKindUI();
    }
    $('#segmentDialog').showModal();
  }

  function updateMoveKindUI(){
    const kind = $('#moveEntryKind') ? $('#moveEntryKind').value : 'lex';
    if($('#moveLexWrap')) $('#moveLexWrap').hidden = kind !== 'lex';
    if($('#moveVocWrap')) $('#moveVocWrap').hidden = kind !== 'vocab';
    if($('#moveNameWrap')) $('#moveNameWrap').hidden = kind !== 'name';
    if($('#movePatternWrap')) $('#movePatternWrap').hidden = kind !== 'pattern';
  }

  function saveCurrentEntryEdit(){
    if(!editingEntry){ setStatus('No dictionary entry is open for editing.', 'error'); return; }
    const ref = findEntryRef(editingEntry.scope, editingEntry.catId, editingEntry.entryId);
    if(!ref){ setStatus('That entry no longer exists.', 'error'); return; }
    const form = $('#segmentForm').value.trim();
    const gloss = $('#segmentGloss').value.trim();
    if(!form){ setStatus('Form is blank.', 'error'); return; }
    if(editingEntry.scope === 'lex') { ref.entry.form = form; ref.entry.gloss = gloss; }
    else if(editingEntry.scope === 'vocab') { ref.entry.word = form; ref.entry.gloss = gloss; }
    else { ref.entry.name = form; ref.entry.actual = gloss; }
    renderEditors(); renderDictionary(); debounceSave();
    $('#segmentDialog').close();
    setStatus(`Finished editing ${form}.`, 'success');
  }

  function removeEditingEntry(ref){
    if(ref.scope === 'lex') ref.cat.entries = (ref.cat.entries || []).filter(e => e !== ref.entry);
    if(ref.scope === 'vocab') ref.cat.entries = (ref.cat.entries || []).filter(e => e !== ref.entry);
    if(ref.scope === 'name') ref.cat.entries = (ref.cat.entries || []).filter(e => e !== ref.entry);
  }

  function moveCurrentEntry(){
    if(!editingEntry){ setStatus('No dictionary entry is open for moving.', 'error'); return; }
    const ref = findEntryRef(editingEntry.scope, editingEntry.catId, editingEntry.entryId);
    if(!ref){ setStatus('That entry no longer exists.', 'error'); return; }
    const form = $('#segmentForm').value.trim();
    const gloss = $('#segmentGloss').value.trim();
    if(!form){ setStatus('Form is blank.', 'error'); return; }
    const kind = $('#moveEntryKind') ? $('#moveEntryKind').value : 'lex';
    if(kind === 'lex'){
      let cat = (state.lexiconCategories || []).find(c => c.id === ($('#moveLexCat') && $('#moveLexCat').value));
      if(!cat){ setStatus('Choose a lexicon category first.', 'error'); return; }
      removeEditingEntry(ref);
      cat.entries.push({ id: M.uid('le'), form, gloss });
      setStatus(`Moved ${form} to Lexicon category: ${cat.name || cat.letter}.`, 'success');
    } else if(kind === 'vocab'){
      let cat = (state.vocabularyCategories || []).find(c => c.id === ($('#moveVocCat') && $('#moveVocCat').value));
      if(!cat){ setStatus('Choose a vocabulary category first.', 'error'); return; }
      removeEditingEntry(ref);
      cat.entries.push({ id: M.uid('ve'), word: form, gloss });
      setStatus(`Moved ${form} to Vocabulary category: ${cat.name || cat.variable}.`, 'success');
    } else if(kind === 'name'){
      let cat = (state.nameCategories || []).find(c => c.id === ($('#moveNameCat') && $('#moveNameCat').value));
      if(!cat){ setStatus('Choose a name category first.', 'error'); return; }
      removeEditingEntry(ref);
      cat.entries.push({ id: M.uid('ne'), name: form, actual: gloss, literal: '', notes: '', nicknames: '' });
      setStatus(`Moved ${form} to Name category: ${cat.name || cat.variable}.`, 'success');
    } else {
      let pat = (state.additionalPatterns || []).find(p => p.id === ($('#movePatternCat') && $('#movePatternCat').value));
      if(!pat){ setStatus('Choose an additional pattern first.', 'error'); return; }
      const current = String(pat.pattern || '').trim();
      pat.pattern = current ? `${current}/${form}` : form;
      removeEditingEntry(ref);
      setStatus(`Moved ${form} into Additional pattern ${pat.letter || pat.name}.`, 'success');
    }
    editingEntry = null;
    renderEditors(); populateCategorySelects(); renderDictionary(); debounceSave();
    $('#segmentDialog').close();
  }

  function bindSegmentDialog(){
    $('#closeSegmentDialog').addEventListener('click', () => $('#segmentDialog').close());
    if($('#moveEntryKind')) $('#moveEntryKind').addEventListener('change', updateMoveKindUI);
    if($('#finishEntryEdit')) $('#finishEntryEdit').addEventListener('click', saveCurrentEntryEdit);
    if($('#moveEntryBtn')) $('#moveEntryBtn').addEventListener('click', moveCurrentEntry);
    $('#addSegmentLex').addEventListener('click', () => {
      const form = $('#segmentForm').value.trim();
      if(!form){ setStatus('Segment form is blank.', 'error'); return; }
      let cat = state.lexiconCategories.find(c => c.id === $('#segmentLexCat').value);
      if(!cat){
        cat = { id: M.uid('lex'), letter: 'X', name: 'Quick Lexicon', placement: 'anywhere', entries: [] };
        state.lexiconCategories.push(cat);
      }
      cat.entries.push({ id: M.uid('le'), form, gloss: $('#segmentGloss').value.trim() });
      renderLexicon(); populateCategorySelects(); renderDictionary(); debounceSave();
      $('#segmentDialog').close();
      setStatus(`Added ${form} to ${cat.name || cat.letter}.`, 'success');
    });
    $('#addSegmentVoc').addEventListener('click', () => {
      const word = $('#segmentForm').value.trim();
      if(!word){ setStatus('Word is blank.', 'error'); return; }
      let cat = state.vocabularyCategories.find(c => c.id === $('#segmentVocCat').value);
      if(!cat){
        cat = { id: M.uid('voc'), variable: 'x', name: 'Quick Vocabulary', entries: [] };
        state.vocabularyCategories.push(cat);
      }
      cat.entries.push({ id: M.uid('ve'), word, gloss: $('#segmentGloss').value.trim() });
      renderVocabulary(); populateCategorySelects(); renderDictionary(); debounceSave();
      $('#segmentDialog').close();
      setStatus(`Added ${word} to ${cat.name || cat.variable}.`, 'success');
    });
    const addNameBtn = $('#addSegmentName');
    if(addNameBtn) addNameBtn.addEventListener('click', () => {
      const name = $('#segmentForm').value.trim();
      if(!name){ setStatus('Name is blank.', 'error'); return; }
      let cat = (state.nameCategories || []).find(c => c.id === ($('#segmentNameCat') && $('#segmentNameCat').value));
      if(!cat){
        cat = { id: M.uid('name'), variable: 'N', name: 'Quick Names', type: 'name', entries: [] };
        state.nameCategories = state.nameCategories || [];
        state.nameCategories.push(cat);
      }
      cat.entries.push({ id: M.uid('ne'), name, actual: $('#segmentGloss').value.trim(), literal: '', notes: '', nicknames: '' });
      renderNames(); populateCategorySelects(); renderDictionary(); debounceSave();
      $('#segmentDialog').close();
      setStatus(`Added ${name} to ${cat.name || cat.variable}.`, 'success');
    });
  }

  function uniq(arr){
    const out = [];
    const seen = new Set();
    for(const item of arr || []){
      const key = String(item ?? '').trim();
      if(!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  }



  function expandDictionarySpelling(raw, isName, engine){
    const text = String(raw || '').trim();
    if(!text) return [];
    const primaryExpand = () => {
      if(isName && M.expandNameSpelling) return M.expandNameSpelling(text, 250);
      return engine.expandStoredForm(text, { includeLex: false, includeVocab: false, includeAdditional: true });
    };
    let vals = [];
    try { vals = primaryExpand() || []; } catch(_) { vals = []; }

    // Extra safety for dictionary display: if anything still contains raw syntax,
    // expand the compact spelling notation locally. This keeps /, [], and ()
    // from appearing as the main dictionary headword.
    function splitTopLevelLocal(str, sep){
      const parts = []; let cur = '', sq = 0, par = 0, quote = '';
      for(let i = 0; i < str.length; i++){
        const ch = str[i];
        if(quote){ cur += ch; if(ch === quote) quote = ''; continue; }
        if(ch === '"' || ch === "'"){ quote = ch; cur += ch; continue; }
        if(ch === '[') sq++;
        else if(ch === ']') sq = Math.max(0, sq - 1);
        else if(ch === '(') par++;
        else if(ch === ')') par = Math.max(0, par - 1);
        if(ch === sep && sq === 0 && par === 0){ parts.push(cur); cur = ''; }
        else cur += ch;
      }
      parts.push(cur);
      return parts;
    }
    function findClose(str, start, open, close){
      let depth = 0, quote = '';
      for(let i = start; i < str.length; i++){
        const ch = str[i];
        if(quote){ if(ch === quote) quote = ''; continue; }
        if(ch === '"' || ch === "'"){ quote = ch; continue; }
        if(ch === open) depth++;
        else if(ch === close){ depth--; if(depth === 0) return i; }
      }
      return -1;
    }
    function combine(a,b){
      const out=[];
      for(const x of a){ for(const y of b){ out.push(x+y); if(out.length >= 250) return out; } }
      return out;
    }
    function expandLocal(str){
      str = String(str || '').trim();
      const slashParts = splitTopLevelLocal(str, '/').map(x => x.trim()).filter(Boolean);
      if(slashParts.length > 1){
        let out=[];
        for(const part of slashParts) out.push(...expandLocal(part));
        return out.slice(0,250);
      }
      let acc=[''];
      for(let i=0;i<str.length;i++){
        const ch=str[i];
        if(ch === '['){
          const j=findClose(str,i,'[',']');
          if(j !== -1){
            const inside=str.slice(i+1,j);
            const pieces=splitTopLevelLocal(inside,'/').map(x=>x.trim()).filter(Boolean);
            let vals=[];
            for(const piece of (pieces.length ? pieces : [inside])) vals.push(...expandLocal(piece));
            acc=combine(acc, vals.length ? vals : ['']); i=j; continue;
          }
        }
        if(ch === '('){
          const j=findClose(str,i,'(',')');
          if(j !== -1){
            const inside=str.slice(i+1,j);
            const pieces=splitTopLevelLocal(inside,'/').map(x=>x.trim()).filter(Boolean);
            let vals=[''];
            for(const piece of (pieces.length ? pieces : [inside])) vals.push(...expandLocal(piece));
            acc=combine(acc, vals); i=j; continue;
          }
        }
        if(ch === '"' || ch === "'"){
          const q=ch; let j=i+1, lit='';
          while(j<str.length && str[j]!==q){ lit += str[j++]; }
          acc=combine(acc,[lit]); i = j < str.length ? j : str.length; continue;
        }
        acc=combine(acc,[ch]);
      }
      return acc.slice(0,250);
    }
    const needsFallback = !vals.length || vals.some(v => /[\[\]()/]/.test(String(v)));
    if(needsFallback) vals = expandLocal(text);
    return uniq(vals.map(v => M.stripAffixMarks ? M.stripAffixMarks(v) : v).filter(Boolean));
  }

  function placementLabel(place){
    if(place === 'start') return 'prefix / start';
    if(place === 'middle') return 'middle / infix';
    if(place === 'end') return 'suffix / ending';
    return 'root / anywhere';
  }

  function entryVariants(raw, engine){
    return expandDictionarySpelling(raw, false, engine);
  }

  function nameEntryVariants(raw, engine){
    return expandDictionarySpelling(raw, true, engine);
  }

  function nicknameVariants(raw, engine){
    if(!raw) return [];
    const parts = String(raw || '').split(/\n|,/).map(x => x.trim()).filter(Boolean);
    let out = [];
    for(const part of parts) out.push(...expandDictionarySpelling(part, true, engine));
    return uniq(out);
  }

  function collectDictionaryRows(){
    const engine = new M.PatternEngine(state);
    const rows = [];
    for(const cat of state.lexiconCategories || []){
      for(const en of cat.entries || []){
        const variants = entryVariants(en.form || '', engine);
        const meanings = M.entryMeanings ? M.entryMeanings(en) : (en.gloss ? [en.gloss] : []);
        const entryId = en.id || en.form;
        rows.push({
          id: `lex:${cat.id}:${entryId}`,
          type: 'Lexicon',
          scope: 'lex',
          catId: cat.id,
          entryId,
          form: variants[0] || M.stripAffixMarks(en.form || ''),
          displayForm: variants[0] || M.stripAffixMarks(en.form || ''),
          rawForm: en.form || '',
          variants,
          meanings,
          gloss: meanings.join(' / ') || en.gloss || '',
          cat: cat.name || cat.letter || 'Lexicon',
          code: cat.letter || '',
          place: cat.placement || 'anywhere',
          detail: placementLabel(cat.placement || 'anywhere'),
          categoryId: `lex:${cat.id}`,
          categoryKey: cat.letter || cat.name || '',
          familyLinks: en.familyLinks || []
        });
      }
    }
    for(const cat of state.vocabularyCategories || []){
      for(const en of cat.entries || []){
        const variants = entryVariants(en.word || '', engine);
        const meanings = M.entryMeanings ? M.entryMeanings(en) : (en.gloss ? [en.gloss] : []);
        const entryId = en.id || en.word;
        rows.push({
          id: `voc:${cat.id}:${entryId}`,
          type: 'Word',
          scope: 'vocab',
          catId: cat.id,
          entryId,
          form: variants[0] || M.stripAffixMarks(en.word || ''),
          displayForm: variants[0] || M.stripAffixMarks(en.word || ''),
          rawForm: en.word || '',
          variants,
          meanings,
          gloss: meanings.join(' / ') || en.gloss || '',
          cat: cat.name || cat.variable || 'Vocabulary',
          code: cat.variable ? `.${cat.variable}.` : '',
          place: 'whole word',
          detail: 'whole vocabulary word',
          categoryId: `voc:${cat.id}`,
          categoryKey: cat.variable || cat.name || '',
          familyLinks: en.familyLinks || []
        });
      }
    }

    for(const cat of state.nameCategories || []){
      for(const en of cat.entries || []){
        const variants = nameEntryVariants(en.name || '', engine);
        const meanings = [en.actual || en.gloss || en.meaning || ''].filter(Boolean);
        let detectedLiteral = en.literal || '';
        if(!detectedLiteral && M.analyzeNameLiteral){
          try { detectedLiteral = (M.analyzeNameLiteral(en.name || '', state, { engine }).gloss || ''); } catch(_) { detectedLiteral = ''; }
        }
        const entryId = en.id || en.name;
        const primaryName = variants[0] || (en.name || '');
        const nicknameList = nicknameVariants(en.nicknames || '', engine);
        rows.push({
          id: `name:${cat.id}:${entryId}`,
          type: 'Name',
          scope: 'name',
          catId: cat.id,
          entryId,
          form: primaryName,
          displayForm: primaryName,
          rawForm: en.name || '',
          variants,
          meanings,
          gloss: meanings.join(' / ') || '',
          literal: detectedLiteral || en.literal || '',
          notes: en.notes || '',
          nicknames: en.nicknames || '',
          nicknameVariants: nicknameList,
          cat: cat.name || cat.variable || 'Names',
          code: `..${cat.variable || '?'}..`,
          place: 'name',
          detail: cat.type ? `${cat.type} name` : 'proper name',
          categoryId: `name:${cat.id}`,
          categoryKey: cat.variable || cat.name || '',
          familyLinks: en.familyLinks || []
        });
        for(const nick of nicknameList){
          rows.push({
            id: `nickname:${cat.id}:${entryId}:${nick}`,
            type: 'Nickname',
            scope: 'name',
            catId: cat.id,
            entryId,
            form: nick,
            displayForm: nick,
            rawForm: nick,
            variants: [nick],
            meanings,
            gloss: meanings.join(' / ') || '',
            literal: detectedLiteral || en.literal || '',
            notes: en.notes || '',
            nicknames: '',
            nicknameVariants: [],
            nicknameOf: primaryName,
            nicknameOfVariants: variants,
            cat: cat.name || cat.variable || 'Names',
            code: `..${cat.variable || '?'}..`,
            place: 'nickname',
            detail: cat.type ? `${cat.type} nickname` : 'nickname',
            categoryId: `name:${cat.id}`,
            categoryKey: cat.variable || cat.name || '',
            familyLinks: []
          });
        }
      }
    }

    const byMeaning = new Map();
    const byForm = new Map();
    for(const row of rows){
      for(const meaning of row.meanings || []){
        const key = meaning.trim().toLocaleLowerCase();
        if(!key) continue;
        if(!byMeaning.has(key)) byMeaning.set(key, []);
        byMeaning.get(key).push(row);
      }
      for(const form of row.variants && row.variants.length ? row.variants : [row.form]){
        const key = String(form || '').trim();
        if(!key) continue;
        if(!byForm.has(key)) byForm.set(key, []);
        byForm.get(key).push(row);
      }
    }

    for(const row of rows){
      const synonymMap = new Map();
      for(const meaning of row.meanings || []){
        const group = byMeaning.get(meaning.trim().toLocaleLowerCase()) || [];
        for(const other of group){
          if(other.id === row.id) continue;
          synonymMap.set(other.id, other);
        }
      }
      row.synonyms = Array.from(synonymMap.values()).filter(other => {
        return (row.meanings || []).some(m => (other.meanings || []).some(om => om.trim().toLocaleLowerCase() === m.trim().toLocaleLowerCase()));
      });

      const meaningSet = new Map();
      const primary = (row.meanings || [])[0] || '';
      for(const meaning of (row.meanings || []).slice(1)) meaningSet.set(meaning.toLocaleLowerCase(), meaning);
      for(const form of row.variants && row.variants.length ? row.variants : [row.form]){
        const group = byForm.get(String(form || '').trim()) || [];
        for(const other of group){
          for(const meaning of other.meanings || []){
            if(primary && meaning.trim().toLocaleLowerCase() === primary.trim().toLocaleLowerCase()) continue;
            meaningSet.set(meaning.trim().toLocaleLowerCase(), meaning);
          }
        }
      }
      row.additionalMeanings = Array.from(meaningSet.values());
    }

    function normFamilyText(value){
      return String(value || '').trim().replace(/^\.+|\.+$/g, '').toLocaleLowerCase();
    }
    function scopeForFamilyType(type){
      const raw = String(type || '').trim().toUpperCase();
      if(raw === 'L' || raw === 'LEX' || raw === 'LEXICON') return 'lex';
      if(raw === 'V' || raw === 'VOC' || raw === 'VOCAB' || raw === 'VOCABULARY') return 'vocab';
      if(raw === 'N' || raw === 'NAME' || raw === 'NAMES') return 'name';
      return '';
    }
    function familyCategoryMatches(row, link){
      const cat = normFamilyText(link && link.category);
      if(!cat) return true;
      const candidates = [row.cat, row.code, row.categoryKey, row.categoryId, row.detail]
        .map(normFamilyText)
        .filter(Boolean);
      return candidates.includes(cat) || candidates.some(c => c.endsWith(':' + cat));
    }
    function familyTargetForms(link, scope){
      const target = String((link && link.target) || '').trim();
      if(!target) return [];
      if(target.endsWith('~')){
        try {
          const mode = target.endsWith('~~') ? 'family' : 'variation';
          const expanded = engine.resolveTildeForms ? engine.resolveTildeForms(target, mode, { limit: 500 }) : [];
          if(expanded && expanded.length) return uniq(expanded.map(v => String(v || '').trim()).filter(Boolean));
        } catch(_){}
      }
      let expanded = [];
      try { expanded = expandDictionarySpelling(target, scope === 'name', engine); } catch(_) { expanded = []; }
      expanded.push(target);
      return uniq(expanded.map(v => String(v || '').trim()).filter(Boolean));
    }
    function rowHasFamilyForm(row, forms){
      const rowForms = [row.form, row.displayForm, row.rawForm].concat(row.variants || []).map(v => String(v || '').trim());
      return forms.some(f => rowForms.some(rf => rf && rf.toLocaleLowerCase() === f.toLocaleLowerCase()));
    }

    rows.forEach(row => { row.relatedTo = []; row.family = []; });
    for(const row of rows){
      const linkTargets = [];
      for(const link of row.familyLinks || []){
        const scope = scopeForFamilyType(link.type);
        if(!scope) continue;
        const forms = familyTargetForms(link, scope);
        const matches = rows.filter(other => other.scope === scope && other.id !== row.id && familyCategoryMatches(other, link) && rowHasFamilyForm(other, forms));
        for(const match of matches){
          if(!linkTargets.some(x => x.id === match.id)) linkTargets.push(match);
        }
      }
      row.relatedTo = linkTargets;
      for(const target of linkTargets){
        if(!target.family.some(x => x.id === row.id)) target.family.push(row);
      }
    }
    return rows;
  }

  function dictChip(text, cls=''){
    return `<span class="dictChip ${cls}">${escapeHtml(text)}</span>`;
  }

  function editAttrs(row){
    return `data-scope="${escapeHtml(row.scope)}" data-catid="${escapeHtml(row.catId)}" data-entryid="${escapeHtml(row.entryId)}"`;
  }

  function renderDictionary(){
    const q = ($('#dictionarySearch')?.value || '').trim().toLowerCase();
    const scope = $('#dictionaryScope')?.value || 'all';
    const catFilter = $('#dictCategoryFilter')?.value || 'all';
    let rows = collectDictionaryRows();
    rows = rows.filter(row => {
      if(scope !== 'all' && row.scope !== scope) return false;
      if(catFilter !== 'all' && row.categoryId !== catFilter) return false;
      const hay = [
        row.form, row.displayForm, row.rawForm, row.gloss, row.cat, row.code, row.type, row.detail,
        ...(row.variants || []), ...(row.meanings || []),
        ...(row.synonyms || []).map(s => `${s.form} ${s.gloss} ${s.cat}`),
        ...(row.relatedTo || []).map(r => `${r.form} ${r.gloss} ${r.cat}`),
        ...(row.family || []).map(r => `${r.form} ${r.gloss} ${r.cat}`),
        ...(row.familyLinks || []).map(l => `${l.type || ''} ${l.category || ''} ${l.target || ''}`),
        ...(row.additionalMeanings || []), ...(row.nicknameVariants || [])
      ].join(' ').toLowerCase();
      return !q || hay.includes(q);
    });

    rows.sort((a,b) => a.form.localeCompare(b.form) || a.type.localeCompare(b.type));

    $('#dictionaryList').innerHTML = rows.length ? rows.map(row => {
      const variants = row.variants || [];
      const meaningHtml = (row.meanings && row.meanings.length)
        ? row.meanings.map(m => dictChip(m, 'meaning')).join('')
        : '<span class="muted">No meaning yet</span>';
      const primaryVariant = row.displayForm || row.form || '';
      const variantList = variants.filter(v => String(v) !== String(primaryVariant));
      const variationsHtml = variantList.length ? `<details class="dictDetails"><summary>See variations (${variantList.length})</summary><div class="synonymList">${variantList.map(v => row.scope === 'name' ? `<button type="button" class="synonymItem dictEdit" ${editAttrs(row)}><strong>${escapeHtml(v)}</strong>${(row.nicknameVariants || []).length ? `<details class="dictDetails nestedDetails"><summary>See nicknames (${(row.nicknameVariants || []).length})</summary><div class="dictChips">${(row.nicknameVariants || []).map(n => dictChip(n, 'nameTag')).join('')}</div></details>` : ''}</button>` : `<button type="button" class="synonymItem dictEdit" ${editAttrs(row)}><strong>${escapeHtml(v)}</strong><span>${escapeHtml(row.gloss || '(no meaning)')}</span><em>${escapeHtml(row.type)} variation</em></button>`).join('')}</div></details>` : '';
      const addMeanings = row.additionalMeanings || [];
      const meaningsDetails = addMeanings.length ? `<details class="dictDetails"><summary>Show additional meanings (${addMeanings.length})</summary><div class="dictChips">${addMeanings.map(m => dictChip(m, 'extraMeaning')).join('')}</div></details>` : '';
      const synonyms = row.synonyms || [];
      const nickList = row.nicknameVariants || [];
      const nicknamesHtml = row.scope === 'name' && nickList.length ? `<details class="dictDetails"><summary>See nicknames (${nickList.length})</summary><div class="synonymList">${nickList.map(n => `<button type="button" class="synonymItem dictEdit" ${editAttrs(row)}><strong>${escapeHtml(n)}</strong></button>`).join('')}</div></details>` : '';
      const sourceNamesHtml = row.scope === 'name' && row.nicknameOf ? `<details class="dictDetails"><summary>See source name</summary><div class="synonymList"><button type="button" class="synonymItem dictEdit" ${editAttrs(row)}><strong>${escapeHtml(row.nicknameOf)}</strong></button></div></details>` : '';
      const nameExtraHtml = row.scope === 'name' ? `<div class="dictChips">${row.literal ? dictChip('literal: ' + row.literal, 'extraMeaning') : ''}${row.notes ? dictChip('notes: ' + row.notes, 'extraMeaning') : ''}</div>` : '';
      const synonymTitle = row.scope === 'name' ? 'See related names' : 'See synonyms';
      const synonymButtons = row.scope === 'name'
        ? synonyms.map(s => `<button type="button" class="synonymItem dictEdit" ${editAttrs(s)}><strong>${escapeHtml(s.displayForm || s.form)}</strong></button>`).join('')
        : synonyms.map(s => `<button type="button" class="synonymItem dictEdit" ${editAttrs(s)}><strong>${escapeHtml(s.displayForm || s.form)}</strong><span>${escapeHtml(s.gloss || '(no meaning)')}</span><em>${escapeHtml(s.type)} · ${escapeHtml(s.cat)}</em></button>`).join('');
      const synonymsHtml = synonyms.length ? `<details class="dictDetails"><summary>${synonymTitle} (${synonyms.length})</summary><div class="synonymList">${synonymButtons}</div></details>` : '';
      const familyButton = r => r.scope === 'name'
        ? `<button type="button" class="synonymItem dictEdit" ${editAttrs(r)}><strong>${escapeHtml(r.displayForm || r.form)}</strong></button>`
        : `<button type="button" class="synonymItem dictEdit" ${editAttrs(r)}><strong>${escapeHtml(r.displayForm || r.form)}</strong><span>${escapeHtml(r.gloss || '(no meaning)')}</span><em>${escapeHtml(r.type)} · ${escapeHtml(r.cat)}</em></button>`;
      const relatedTo = row.relatedTo || [];
      const familyRows = row.family || [];
      const relatedToHtml = relatedTo.length ? `<details class="dictDetails"><summary>Related to (${relatedTo.length})</summary><div class="synonymList">${relatedTo.map(familyButton).join('')}</div></details>` : '';
      const familyHtml = familyRows.length ? `<details class="dictDetails"><summary>See family (${familyRows.length})</summary><div class="synonymList">${familyRows.map(familyButton).join('')}</div></details>` : '';
      return `<article class="dictCard">
        <div class="dictMain">
          <button type="button" class="dictWord dictEdit" ${editAttrs(row)} title="Edit this dictionary entry">${escapeHtml(row.displayForm || row.form || '(blank)')}</button>
          <div class="dictMeanings">${meaningHtml}</div>
        </div>
        <div class="dictMeta">
          ${dictChip(row.type, row.scope === 'lex' ? 'lexTag' : 'wordTag')}
          ${dictChip(row.cat)}
          ${row.code ? dictChip(row.code) : ''}
          ${dictChip(row.detail)}
        </div>
        ${variationsHtml}${meaningsDetails}${relatedToHtml}${familyHtml}${nicknamesHtml}${sourceNamesHtml}${nameExtraHtml}${synonymsHtml}
      </article>`;
    }).join('') : '<div class="notice">No matching dictionary entries.</div>';
    $('#dictCount').textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`;
    applyOutputFont();
  }

  window.renderMorfDictionary = renderDictionary;

  function bindDictionary(){
    ['#dictionarySearch', '#dictionaryScope', '#dictCategoryFilter'].forEach(sel => {
      const el = $(sel);
      if(el) el.addEventListener('input', renderDictionary);
      if(el) el.addEventListener('change', renderDictionary);
    });
  }

  function applyImportedSettings(rawText, sourceLabel){
    const backup = M.normalizeState(state);
    try {
      if(rawText == null || !String(rawText).trim()) throw new Error('The imported settings text is empty.');
      try { readGeneratorControlsFromDOM(); } catch(_) {}
      const preserve = M.normalizeState(state);
      const next = M.importState(String(rawText), { preserveFrom: preserve });
      state = M.normalizeState(next);
      if(next.meta && Array.isArray(next.meta.importWarnings) && state.meta){
        state.meta.importWarnings = next.meta.importWarnings.slice();
      }
      lastResults = [];
      syncControls();
      saveLocal();
      const warnings = state.meta && Array.isArray(state.meta.importWarnings) ? state.meta.importWarnings : [];
      const importedFrom = sourceLabel ? ` from ${sourceLabel}` : '';
      const msg = warnings.length ? `Imported settings${importedFrom}. Note: ${warnings[0]}` : `Imported settings${importedFrom}.`;
      setStatus(msg, warnings.length ? 'info' : 'success');
      return true;
    } catch(err){
      state = backup;
      try { syncControls(); } catch(_) {}
      setStatus('Import failed safely: ' + err.message, 'error');
      return false;
    }
  }

  function exportSettings(){
    try {
      const json = M.exportState(state);
      download('morf-3-5-settings.morf', json, 'application/json');
      setStatus('Exported settings file.', 'success');
    } catch(err){
      setStatus('Export failed: ' + err.message, 'error');
    }
  }

  function triggerImportPicker(){
    const input = $('#importFile');
    if(!input){ setStatus('Import file picker was not found.', 'error'); return; }
    input.click();
  }

  function readImportFileFromInput(input){
    const file = input && input.files && input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImportedSettings(reader.result, file.name || 'file');
    reader.onerror = () => setStatus('Could not read that file. Try renaming it to .json or paste its contents below.', 'error');
    reader.readAsText(file);
    try { input.value = ''; } catch(_) {}
  }

  function importPastedSettings(){
    const box = $('#pasteSettingsBox');
    if(applyImportedSettings(box ? box.value : '', 'pasted JSON')){
      if(box) box.value = '';
    }
  }

  async function copySettings(){
    try {
      await navigator.clipboard.writeText(M.exportState(state));
      setStatus('Settings JSON copied.', 'success');
    } catch(err){
      download('morf-3-5-settings.morf', M.exportState(state), 'application/json');
    }
  }

  function clearLocalSettings(){
    if(confirm('Clear the browser autosave for Morf?')){
      try { localStorage.removeItem(STORE_KEY); setStatus('Autosave cleared.', 'success'); }
      catch(err){ setStatus('Autosave was already unavailable here.', 'info'); }
    }
  }

  function bindSettings(){
    function applyImportedSettingsLocal(rawText, sourceLabel){
      const backup = M.normalizeState(state);
      try {
        if(rawText == null || !String(rawText).trim()) throw new Error('The imported settings text is empty.');
        try { readGeneratorControlsFromDOM(); } catch(_) {}
        const preserve = M.normalizeState(state);
        const next = M.importState(String(rawText), { preserveFrom: preserve });
        state = M.normalizeState(next);
        if(next.meta && Array.isArray(next.meta.importWarnings) && state.meta){
          state.meta.importWarnings = next.meta.importWarnings.slice();
        }
        lastResults = [];
        syncControls();
        saveLocal();
        const warnings = state.meta && Array.isArray(state.meta.importWarnings) ? state.meta.importWarnings : [];
        const importedFrom = sourceLabel ? ` from ${sourceLabel}` : '';
        let msg = warnings.length ? `Imported settings${importedFrom}. Note: ${warnings[0]}` : `Imported settings${importedFrom}.`;
        setStatus(msg, warnings.length ? 'info' : 'success');
        return true;
      } catch(err){
        state = backup;
        try { syncControls(); } catch(_) {}
        setStatus('Import failed safely: ' + err.message, 'error');
        return false;
      }
    }

    $('#exportBtn').addEventListener('click', () => {
      const json = M.exportState(state);
      download('morf-3-5-settings.morf', json, 'application/json');
      setStatus('Exported settings file.', 'success');
    });
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => applyImportedSettings(reader.result, file.name || 'file');
      reader.onerror = () => setStatus('Could not read that file. Try renaming it to .json or paste its contents below.', 'error');
      reader.readAsText(file);
      e.target.value = '';
    });
    const importPasteBtn = $('#importPastedSettingsBtn');
    if(importPasteBtn){
      importPasteBtn.addEventListener('click', () => {
        const box = $('#pasteSettingsBox');
        if(applyImportedSettings(box ? box.value : '', 'pasted JSON')){
          if(box) box.value = '';
        }
      });
    }
    $('#copySettingsBtn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(M.exportState(state)); setStatus('Settings JSON copied.', 'success'); }
      catch(err){ download('morf-3-5-settings.morf', M.exportState(state), 'application/json'); }
    });
    $('#clearLocalBtn').addEventListener('click', () => {
      if(confirm('Clear the browser autosave for Morf?')){
        try { localStorage.removeItem(STORE_KEY); setStatus('Autosave cleared.', 'success'); }
        catch(err){ setStatus('Autosave was already unavailable here.', 'info'); }
      }
    });
    $('#fontFamily').addEventListener('change', e => { state.font.family = e.target.value; applyOutputFont(); debounceSave(); });
    $('#fontSize').addEventListener('input', e => { state.font.size = Number(e.target.value || 20); applyOutputFont(); debounceSave(); });
    $('#fontBold').addEventListener('change', e => { state.font.bold = e.target.checked; applyOutputFont(); debounceSave(); });
    $('#fontItalic').addEventListener('change', e => { state.font.italic = e.target.checked; applyOutputFont(); debounceSave(); });
  }

  function loadSample(){
    state.generator.pattern = 'P R S / [CV]{2}(C) / .n. / ..F..';
    state.advanced.rewrites = 'ti=chi\n<C>=&1&1';
    state.advanced.forbidden = 'kkk\nppp\nVVV';
    state.advanced.starts = '';
    state.advanced.contains = '';
    state.advanced.ends = '';
    syncControls();
    debounceSave();
    setStatus('Loaded a generic sample pattern.', 'success');
  }

  function installEmergencyButtonRouter(){
    if(window.MorfEmergencyButtonsInstalled) return;
    window.MorfEmergencyButtonsInstalled = true;
    const route = {
      generateBtn: generate,
      sampleBtn: loadSample,
      pickRandomBtn: pickRandomResult,
      alphabetizeBtn: alphabetizeResults,
      selectAllBtn: selectCopyOutput,
      analyzeBtn: analyzeInput,
      exportBtn: exportSettings,
      importBtn: triggerImportPicker,
      importPastedSettingsBtn: importPastedSettings,
      copySettingsBtn: copySettings,
      clearLocalBtn: clearLocalSettings,
      addNameCategoryBtn: addNameCategory
    };
    document.addEventListener('click', function(e){
      const target = e.target && e.target.closest ? e.target.closest('button') : null;
      if(!target || !target.id || !route[target.id]) return;
      e.preventDefault();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      try { route[target.id](e); }
      catch(err){
        setStatus('Button issue: ' + err.message, 'error');
        try { console.error(err); } catch(_) {}
      }
    }, true);
    document.addEventListener('change', function(e){
      if(e.target && e.target.id === 'importFile'){
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        readImportFileFromInput(e.target);
      }
    }, true);
  }

  installEmergencyButtonRouter();

  window.MorfAddNameCategoryClick = addNameCategory;
  window.addNameCategory = addNameCategory;

  window.MorfGenerateClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    generate();
    return false;
  };
  window.MorfAnalyzeClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    analyzeInput();
    return false;
  };
  window.MorfPickRandomClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    pickRandomResult();
    return false;
  };
  window.MorfAlphabetizeClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    alphabetizeResults();
    return false;
  };
  window.MorfSelectAllClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    selectCopyOutput();
    return false;
  };
  window.MorfExportClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    exportSettings();
    return false;
  };
  window.MorfImportClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    triggerImportPicker();
    return false;
  };
  window.MorfImportPastedClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    importPastedSettings();
    return false;
  };
  window.MorfCopySettingsClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    copySettings();
    return false;
  };
  window.MorfClearLocalClick = function(evt){
    if(evt){ evt.preventDefault(); if(evt.stopImmediatePropagation) evt.stopImmediatePropagation(); }
    clearLocalSettings();
    return false;
  };
  window.MorfApp = {
    generate,
    analyze: analyzeInput,
    renderDictionary,
    syncControls,
    getState: () => state,
    setState: (next, opts={}) => {
      state = M.normalizeState(next);
      lastResults = [];
      lastStats = {};
      syncControls();
      renderResults([]);
      saveLocal();
      const source = opts && opts.source ? ' from ' + opts.source : '';
      setStatus('Imported settings' + source + '.', 'success');
      return state;
    }
  };

  document.addEventListener('click', function(e){
    const btn = e.target && e.target.closest ? e.target.closest('#addNameCategoryBtn') : null;
    if(btn) addNameCategory(e);
  }, true);

  function init(){
    const steps = [
      ['load settings', () => { state = loadLocal(); }],
      ['tabs', bindTabs],
      ['generator', bindGeneratorControls],
      ['editors', bindEditors],
      ['translator', bindTranslator],
      ['segment clicks', bindSegmentClicks],
      ['segment dialog', bindSegmentDialog],
      ['dictionary', bindDictionary],
      ['settings', bindSettings],
      ['sync controls', syncControls],
      ['initial hash', () => {
        if(window.MorfTabs && location.hash && document.getElementById(location.hash.slice(1))){
          window.MorfTabs.show(location.hash.slice(1));
        }
      }],
      ['initial output', () => renderResults([])]
    ];
    const failed = [];
    for(const [name, fn] of steps){
      try { fn(); }
      catch(err){ failed.push(`${name}: ${err.message}`); }
    }
    setStatus(failed.length ? 'Loaded with one issue: ' + failed[0] : 'Ready.', failed.length ? 'error' : 'info');
    if(failed.length) console.warn('Morf init issues:', failed);
  }

  window.addEventListener('error', function(e){
    try { setStatus('Script issue: ' + (e.message || 'unknown error'), 'error'); } catch(_) {}
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
