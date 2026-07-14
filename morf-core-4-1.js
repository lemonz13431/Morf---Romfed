(function(root){
  'use strict';

  const VERSION = 'Morf 4.1';
  const MAX_ENUM = 750;
  const MAX_ATTEMPTS = 250;

  function uid(prefix='id'){
    return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

  function escapeRegExp(str){
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeNewlines(str){ return String(str || '').replace(/\r\n?/g, '\n'); }

  function trimDots(str){ return String(str || '').replace(/^\.+/, '').replace(/\.+$/, '').trim(); }

  function capList(arr, limit=MAX_ENUM){
    if(!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for(const item of arr){
      const s = String(item ?? '');
      if(seen.has(s)) continue;
      seen.add(s);
      out.push(s);
      if(out.length >= limit) break;
    }
    return out;
  }

  function pick(arr, rng=Math.random){
    if(!arr || !arr.length) return undefined;
    return arr[Math.floor(rng() * arr.length)];
  }

  function chooseWeighted(options, rng=Math.random){
    if(!options || !options.length) return null;
    let total = 0;
    for(const opt of options) total += Math.max(1, Number(opt.weight) || 1);
    let roll = rng() * total;
    for(const opt of options){
      roll -= Math.max(1, Number(opt.weight) || 1);
      if(roll <= 0) return opt;
    }
    return options[options.length - 1];
  }

  function isUpper(ch){ return /^[A-Z]$/.test(ch); }

  function splitTopLevel(str, sep){
    str = String(str || '');
    const parts = [];
    let cur = '';
    let quote = false;
    let square = 0, paren = 0, angle = 0, brace = 0;
    for(let i=0;i<str.length;i++){
      const ch = str[i];
      if(quote){
        cur += ch;
        if(ch === '"') quote = false;
        continue;
      }
      if(ch === '"') { quote = true; cur += ch; continue; }
      if(ch === '[') square++;
      else if(ch === ']') square = Math.max(0, square - 1);
      else if(ch === '(') paren++;
      else if(ch === ')') paren = Math.max(0, paren - 1);
      else if(ch === '<') angle++;
      else if(ch === '>') angle = Math.max(0, angle - 1);
      else if(ch === '{') brace++;
      else if(ch === '}') brace = Math.max(0, brace - 1);
      if(ch === sep && square === 0 && paren === 0 && angle === 0 && brace === 0){
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    parts.push(cur);
    return parts;
  }



  function findMatchingBracket(str, start, open, close){
    let depth = 0;
    let quote = '';
    for(let i = start; i < str.length; i++){
      const ch = str[i];
      if(quote){ if(ch === quote) quote = ''; continue; }
      if(ch === '"' || ch === "'"){ quote = ch; continue; }
      if(ch === open) depth++;
      else if(ch === close){
        depth--;
        if(depth === 0) return i;
      }
    }
    return -1;
  }

  function expandNameSpelling(raw, limit=200){
    raw = stripAffixMarks(String(raw || '').trim());
    if(!raw) return [];
    function combine(a, b){
      const out = [];
      for(const x of a){
        for(const y of b){
          out.push(x + y);
          if(out.length >= limit) return capList(out, limit);
        }
      }
      return capList(out, limit);
    }
    function expandSeq(str){
      const top = splitTopLevel(str, '/').map(x => x.trim()).filter(x => x.length || str.includes('/'));
      if(top.length > 1){
        let out = [];
        for(const part of top){
          out.push(...expandSeq(part));
          if(out.length >= limit) break;
        }
        return capList(out, limit);
      }
      let acc = [''];
      for(let i = 0; i < str.length; i++){
        const ch = str[i];
        if(ch === '"' || ch === "'"){
          const quote = ch;
          let j = i + 1, lit = '';
          while(j < str.length && str[j] !== quote){ lit += str[j++]; }
          acc = combine(acc, [lit]);
          i = j < str.length ? j : str.length;
          continue;
        }
        if(ch === '['){
          const j = findMatchingBracket(str, i, '[', ']');
          if(j !== -1){
            const inside = str.slice(i + 1, j);
            const pieces = splitTopLevel(inside, '/').map(x => x.trim()).filter(Boolean);
            let vals = [];
            for(const piece of (pieces.length ? pieces : [inside])) vals.push(...expandSeq(piece));
            acc = combine(acc, vals.length ? vals : ['']);
            i = j;
            continue;
          }
        }
        if(ch === '('){
          const j = findMatchingBracket(str, i, '(', ')');
          if(j !== -1){
            const inside = str.slice(i + 1, j);
            const pieces = splitTopLevel(inside, '/').map(x => x.trim()).filter(Boolean);
            let vals = [''];
            for(const piece of (pieces.length ? pieces : [inside])) vals.push(...expandSeq(piece));
            acc = combine(acc, vals);
            i = j;
            continue;
          }
        }
        acc = combine(acc, [ch]);
      }
      return capList(acc, limit);
    }
    return capList(expandSeq(raw).map(stripAffixMarks).filter(Boolean), limit);
  }

  function splitList(str){
    const raw = splitTopLevel(String(str || '').replace(/\|/g, ','), ',');
    return raw.map(s => s.trim()).filter(Boolean);
  }

  function isPlainObject(value){
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(obj, key){
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function cleanString(value, fallback=''){
    return value == null ? fallback : String(value);
  }

  function cleanRefName(value){
    let out = cleanString(value).trim();
    if(out.startsWith('|') && out.endsWith('|') && out.length >= 2) out = out.slice(1, -1).trim();
    if(out.startsWith('.') && out.endsWith('.') && out.length >= 2) out = out.slice(1, -1).trim();
    return out;
  }

  function normalizePlacementName(value){
    const raw = cleanString(value, 'anywhere').trim().toLowerCase();
    if(['start','prefix','pre','initial','beginning','begin'].includes(raw)) return 'start';
    if(['middle','infix','medial','inside'].includes(raw)) return 'middle';
    if(['end','suffix','postfix','final','ending'].includes(raw)) return 'end';
    if(['anywhere','any','root','stem','base','lexeme','free'].includes(raw)) return 'anywhere';
    return 'anywhere';
  }

  function ensureArrayish(value){
    if(Array.isArray(value)) return value;
    if(typeof value === 'string') return normalizeNewlines(value).split('\n').map(line => line.trim()).filter(Boolean);
    if(isPlainObject(value)) return Object.entries(value).map(([key, val]) => {
      if(isPlainObject(val)) return Object.assign({ name: key, letter: key, variable: key, _compatKey: key }, val);
      return { name: key, letter: key, variable: key, _compatKey: key, pattern: val, value: val, entries: Array.isArray(val) ? val : undefined };
    });
    return [];
  }

  function firstCompatField(obj, keys, fallback=''){
    for(const key of keys){
      if(hasOwn(obj, key)) return cleanString(obj[key], fallback);
    }
    return fallback;
  }

  function unwrapCompatState(input){
    const src = isPlainObject(input) ? input : {};
    const fullKeys = ['generator','categories','lexiconCategories','dictionaryCategories','wordCategories','additionalPatterns','patterns','graphemePatterns','vocabularyCategories','vocabCategories','vocab','vocabulary','words','entries','nameCategories','names','pattern','generatorPattern','mainPattern'];
    const looksFull = obj => isPlainObject(obj) && fullKeys.some(k => hasOwn(obj, k));
    for(const key of ['state','data','morf','appState','payload']){
      if(looksFull(src[key])) return src[key];
    }
    // Only unwrap settings if the outer object is not already the settings object.
    if(looksFull(src.settings) && !looksFull(src)) return src.settings;
    return src;
  }

  function rewriteCompatText(value, fallback=''){
    return normalizeNewlines(cleanString(value, fallback)).split('\n').map(line => {
      const trimmed = line.trim();
      if(!trimmed || trimmed.startsWith('//')) return line;
      if(trimmed.includes('=') || !trimmed.includes('>')) return line;
      const idx = line.indexOf('>');
      return line.slice(0, idx) + '=' + line.slice(idx + 1);
    }).join('\n');
  }

  function hasTopLevelChar(str, needle){
    str = String(str || '');
    let quote = false;
    let square = 0, paren = 0, angle = 0, brace = 0;
    for(let i=0;i<str.length;i++){
      const ch = str[i];
      if(quote){
        if(ch === '"') quote = false;
        continue;
      }
      if(ch === '"') { quote = true; continue; }
      if(ch === '[') square++;
      else if(ch === ']') square = Math.max(0, square - 1);
      else if(ch === '(') paren++;
      else if(ch === ')') paren = Math.max(0, paren - 1);
      else if(ch === '<') angle++;
      else if(ch === '>') angle = Math.max(0, angle - 1);
      else if(ch === '{') brace++;
      else if(ch === '}') brace = Math.max(0, brace - 1);
      if(ch === needle && square === 0 && paren === 0 && angle === 0 && brace === 0) return true;
    }
    return false;
  }

  function splitAlternativeParts(str){
    const slashParts = splitTopLevel(str, '/');
    if(slashParts.length > 1) return slashParts;

    // Friendly Morf behavior: Additional patterns are often typed as
    // "B = C, N, L, K". Treat top-level commas as alternatives unless the
    // pattern is using Awkwords exclusion syntax such as "C!m,n".
    if(String(str || '').includes(',') && !hasTopLevelChar(str, '!')){
      const commaParts = splitTopLevel(str, ',')
        .map(part => part.trim().replace(/^(?:and|or)\s+/i, ''))
        .filter(Boolean);
      if(commaParts.length > 1) return commaParts;
    }
    return slashParts;
  }

  function stripAffixMarks(form){
    return String(form || '').trim().replace(/^-+/, '').replace(/-+$/, '');
  }

  function uniqueList(arr){
    const out = [];
    const seen = new Set();
    for(const item of arr || []){
      const s = String(item ?? '').trim();
      if(!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  function combineTextLists(a, b, limit=128){
    const out = [];
    for(const left of a.length ? a : ['']){
      for(const right of b.length ? b : ['']){
        out.push(left + right);
        if(out.length >= limit) return out;
      }
    }
    return out;
  }

  function findTextParen(str){
    let quote = false, depth = 0, start = -1;
    for(let i=0;i<str.length;i++){
      const ch = str[i];
      if(quote){
        if(ch === '"') quote = false;
        continue;
      }
      if(ch === '"'){ quote = true; continue; }
      if(ch === '('){
        if(depth === 0) start = i;
        depth++;
      } else if(ch === ')' && depth > 0){
        depth--;
        if(depth === 0) return { start, end: i };
      }
    }
    return null;
  }

  function expandOptionalText(str, limit=128){
    str = String(str || '');
    const paren = findTextParen(str);
    if(!paren) return [str];
    const before = str.slice(0, paren.start);
    const inner = str.slice(paren.start + 1, paren.end);
    const after = str.slice(paren.end + 1);
    const innerOptions = [''].concat(expandGlossText(inner, limit));
    const afterOptions = expandOptionalText(after, limit);
    const out = [];
    for(const opt of innerOptions){
      for(const tail of afterOptions){
        out.push(before + opt + tail);
        if(out.length >= limit) return out;
      }
    }
    return out;
  }

  function expandGlossText(text, limit=128){
    const raw = String(text || '').trim();
    if(!raw) return [];
    const slashParts = splitTopLevel(raw, '/');
    let out = [];
    if(slashParts.length > 1){
      for(const part of slashParts){
        out.push(...expandGlossText(part, limit));
        if(out.length >= limit) break;
      }
    } else {
      out = expandOptionalText(raw, limit);
    }
    return uniqueList(out.map(s => s.replace(/^"|"$/g, '').replace(/\s+/g, ' ').trim())).slice(0, limit);
  }

  function entryMeanings(entry){
    const raw = entry && (entry.gloss || entry.meaning || entry.label || '');
    const expanded = expandGlossText(raw);
    return expanded.length ? expanded : (raw ? [String(raw).trim()] : []);
  }

  function entryGloss(entry){
    const meanings = entryMeanings(entry);
    return meanings.length ? meanings.join('/') : '';
  }

  function splitEntryForms(left){
    const parts = splitTopLevel(String(left || ''), ',')
      .map(s => s.trim())
      .filter(Boolean);
    return parts.length ? parts : [String(left || '').trim()].filter(Boolean);
  }

  function normalizeFamilyLinkType(value){
    const raw = String(value || '').trim().toUpperCase();
    if(raw === 'L' || raw === 'LEX' || raw === 'LEXICON') return 'L';
    if(raw === 'V' || raw === 'VOC' || raw === 'VOCAB' || raw === 'VOCABULARY') return 'V';
    if(raw === 'N' || raw === 'NAME' || raw === 'NAMES') return 'N';
    return raw ? raw[0] : '';
  }

  function parseFamilyLinkBody(body){
    let s = String(body || '').trim();
    if(s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1).trim();
    else if(s.startsWith('{')) s = s.slice(1).trim();
    const typeMatch = s.match(/^([A-Za-z]+)/);
    if(!typeMatch) return null;
    const type = normalizeFamilyLinkType(typeMatch[1]);
    if(!['L','V','N'].includes(type)) return null;
    s = s.slice(typeMatch[0].length).trim();
    let category = '';
    if(s.startsWith('{')){
      const j = findMatchingBracket(s, 0, '{', '}');
      if(j !== -1){
        category = s.slice(1, j).trim();
        s = s.slice(j + 1).trim();
      }
    }
    const target = s.replace(/^[:\s]+/, '').trim();
    if(!target) return null;
    return { type, category, target };
  }

  function extractFamilyLinks(text){
    let s = String(text || '');
    const links = [];
    let out = '';
    for(let i = 0; i < s.length; i++){
      if(s[i] === ';' && s[i + 1] === '{'){
        const start = i + 1;
        const end = findMatchingBracket(s, start, '{', '}');
        if(end !== -1){
          const link = parseFamilyLinkBody(s.slice(start, end + 1));
          if(link){
            link.raw = s.slice(i, (s[end + 1] === ';' ? end + 2 : end + 1));
            links.push(link);
            i = (s[end + 1] === ';') ? end + 1 : end;
            continue;
          }
        } else {
          const nextSemi = s.indexOf(';', start + 1);
          const stop = nextSemi === -1 ? s.length : nextSemi;
          const link = parseFamilyLinkBody(s.slice(start, stop));
          if(link){
            link.raw = s.slice(i, stop + (nextSemi === -1 ? 0 : 1));
            links.push(link);
            i = stop;
            continue;
          }
        }
      }
      out += s[i];
    }
    return { text: out.replace(/\s+$/, '').trim(), links };
  }

  function formatFamilyLinks(links){
    return (links || []).map(link => {
      const type = normalizeFamilyLinkType(link.type || '');
      const cat = String(link.category || '').trim();
      const target = String(link.target || '').trim();
      if(!type || !target) return '';
      return `;{${type}${cat ? `{${cat}}` : ''}${target}};`;
    }).filter(Boolean).join(' ');
  }

  function parseEntryLine(line, kind='lex'){
    const many = parseEntryLineMany(line, kind);
    return many[0] || null;
  }

  function parseEntryLineMany(line, kind='lex'){
    const raw = String(line || '').trim();
    if(!raw) return [];
    if(raw.startsWith('//')) return [];
    let left = raw, right = '';
    const separators = ['=>', '=', '\t', ' - ', ' — ', ' – ', ':'];
    for(const sep of separators){
      const idx = raw.indexOf(sep);
      if(idx > -1){
        left = raw.slice(0, idx).trim();
        right = raw.slice(idx + sep.length).trim();
        break;
      }
    }
    if(!left) return [];
    const family = extractFamilyLinks(right);
    right = family.text;
    const forms = splitEntryForms(left);
    return forms.map(form => kind === 'vocab'
      ? { id: uid('ve'), word: form, gloss: right, familyLinks: clone(family.links || []) }
      : { id: uid('le'), form, gloss: right, familyLinks: clone(family.links || []) });
  }

  function entriesToText(entries, kind='lex'){
    return (entries || []).map(en => {
      const form = kind === 'vocab' ? (en.word || '') : (en.form || '');
      const gloss = en.gloss || en.meaning || '';
      const links = formatFamilyLinks(en.familyLinks || []);
      const right = [gloss, links].filter(Boolean).join(' ');
      return right ? `${form} = ${right}` : form;
    }).join('\n');
  }

  function textToEntries(text, kind='lex'){
    const out = [];
    for(const line of normalizeNewlines(text).split('\n')){
      out.push(...parseEntryLineMany(line, kind));
    }
    return out.filter(en => kind === 'vocab' ? en.word : en.form);
  }

  const DEFAULT_CORE_MEANINGS = [
    'I','you','we','this','that','who','what','not','all','many','one','two','three','four','five','big','long','wide','thick','heavy','small','short','narrow','thin','woman','man','person','child','wife','husband','mother','father','animal','fish','bird','dog','louse','snake','worm','tree','forest','stick','fruit','seed','leaf','root','bark','flower','grass','rope','skin','meat','blood','bone','fat','egg','horn','tail','feather','hair','head','ear','eye','nose','mouth','tooth','tongue','fingernail','foot','leg','knee','hand','wing','belly','guts','neck','back','breast','heart','liver','drink','eat','bite','suck','spit','vomit','blow','breathe','laugh','see','hear','know','think','smell','fear','sleep','live','die','kill','fight','hunt','hit','cut','split','stab','scratch','dig','swim','fly','walk','come','lie','sit','stand','turn','fall','give','hold','squeeze','rub','wash','wipe','pull','push','throw','tie','sew','count','say','sing','play','float','flow','freeze','swell','sun','moon','star','water','rain','river','lake','sea','salt','stone','sand','dust','earth','cloud','fog','sky','wind','snow','ice','smoke','fire','ash','burn','road','mountain','red','green','yellow','white','black','night','day','year','warm','cold','full','new','old','good','bad','rotten','dirty','straight','round','sharp','dull','smooth','wet','dry','correct','near','far','right','left','at','in','with','and','because','name','root','word','voice','sound','house','home','village','path','door','food','tool','work','song','drum','stone tool','knife','spear','basket','clay','pot','cloth','thread','needle','firewood','friend','enemy','chief','elder','younger sibling','older sibling','brother','sister','grandmother','grandfather','cousin','body','face','forehead','cheek','chin','shoulder','arm','elbow','finger','thumb','hip','skinny','strong','weak','fast','slow','deep','shallow','empty','open','closed','early','late','before','after','above','below','inside','outside','here','there','where','when','how','yes','no','maybe','again','also','only','still','already','never','always','today','tomorrow','yesterday','north','south','east','west','spring','summer','autumn','winter','morning','evening','birth','death','love','anger','peace','gift','trade','story','memory','dream','medicine','spirit','world'
  ];

  const DEFAULT_STATE = {
    meta: { app: 'Morf', version: VERSION, exportedAt: '' },
    generator: {
      pattern: '',
      count: 100,
      avoidDuplicates: true,
      capitalize: false,
      newlineEach: true,
      detectLexicon: false,
      meaningsMode: false,
      meaningsText: '',
      assignCoreMeanings: false,
      swadeshMode: false
    },
    font: { family: 'system', size: 20, bold: false, italic: false },
    advanced: {
      rewrites: '',
      forbidden: '',
      starts: '',
      contains: '',
      ends: ''
    },
    additionalPatterns: [
      { id: 'add_C', letter: 'C', name: 'Consonants', pattern: 'p/t/k/s/m/n/l/r' },
      { id: 'add_V', letter: 'V', name: 'Vowels', pattern: 'a/e/i/o/u' },
      { id: 'add_N', letter: 'N', name: 'Nasals', pattern: 'm/n' },
      { id: 'add_L', letter: 'L', name: 'Liquids', pattern: 'l/r' }
    ],
    lexiconCategories: [
      { id: 'lex_P', letter: 'P', name: 'Prefixes', placement: 'start', appliesWords: true, appliesNames: true, entries: [
        { id: 'le_pre', form: 'pre-', gloss: 'before' }
      ]},
      { id: 'lex_R', letter: 'R', name: 'Roots', placement: 'anywhere', appliesWords: true, appliesNames: true, entries: [
        { id: 'le_sil', form: 'sil', gloss: 'bird' }
      ]},
      { id: 'lex_S', letter: 'S', name: 'Suffixes', placement: 'end', appliesWords: true, appliesNames: true, entries: [
        { id: 'le_less', form: '-less', gloss: 'without' }
      ]},
      { id: 'lex_E', letter: 'E', name: 'Name endings', placement: 'end', appliesWords: false, appliesNames: true, entries: [
        { id: 'le_a_name', form: '-a', gloss: 'name ending' }
      ]}
    ],
    nameCategories: [
      { id: 'name_F', variable: 'F', name: 'First names', type: 'person', entries: [
        { id: 'ne_isabella', name: 'Isabella/Isabel', actual: 'example personal name', literal: '', notes: 'Generic starter example. Replace it with your own names.', nicknames: 'Bella/Belle/Isa' },
        { id: 'ne_isabellatown', name: 'Isabellatown', actual: 'town named after Isabella', literal: '', notes: 'Example family link.', nicknames: '', familyLinks: [{ type: 'N', category: 'First names', target: 'Isabella' }] }
      ]}
    ],
    vocabularyCategories: [
      { id: 'voc_n', variable: 'n', name: 'Nouns', entries: [
        { id: 've_dog', word: 'dog', gloss: 'type of animal' },
        { id: 've_doglike', word: 'doglike', gloss: 'like a dog', familyLinks: [{ type: 'V', category: 'Nouns', target: 'dog' }] }
      ]}
    ]
  };

  class ParseError extends Error {
    constructor(message, index){
      super(index === undefined ? message : `${message} at position ${index}`);
      this.name = 'ParseError';
      this.index = index;
    }
  }

  class PatternParser {
    constructor(text){
      this.text = String(text || '');
    }

    parse(){
      return this.parseAlt(this.text);
    }

    parseAlt(str){
      const parts = splitAlternativeParts(str);
      const options = parts.map(part => {
        const ew = this.extractWeight(part);
        return { type: 'option', node: this.parseSeq(ew.text), weight: ew.weight };
      });
      if(options.length === 1) return options[0].node;
      return { type: 'alt', options };
    }

    extractWeight(part){
      let s = String(part || '');
      let quote = false;
      let square = 0, paren = 0, angle = 0, brace = 0;
      let lastStar = -1;
      for(let i=0;i<s.length;i++){
        const ch = s[i];
        if(quote){ if(ch === '"') quote = false; continue; }
        if(ch === '"') { quote = true; continue; }
        if(ch === '[') square++;
        else if(ch === ']') square = Math.max(0, square - 1);
        else if(ch === '(') paren++;
        else if(ch === ')') paren = Math.max(0, paren - 1);
        else if(ch === '<') angle++;
        else if(ch === '>') angle = Math.max(0, angle - 1);
        else if(ch === '{') brace++;
        else if(ch === '}') brace = Math.max(0, brace - 1);
        else if(ch === '*' && square === 0 && paren === 0 && angle === 0 && brace === 0) lastStar = i;
      }
      if(lastStar >= 0){
        const tail = s.slice(lastStar + 1).trim();
        if(/^\d+$/.test(tail)){
          const weight = Math.min(128, Math.max(1, parseInt(tail, 10)));
          return { text: s.slice(0, lastStar), weight };
        }
      }
      return { text: s, weight: 1 };
    }

    findMatching(str, start, open, close){
      let depth = 0;
      let quote = false;
      for(let i=start;i<str.length;i++){
        const ch = str[i];
        if(quote){
          if(ch === '"') quote = false;
          continue;
        }
        if(ch === '"') { quote = true; continue; }
        if(ch === open) depth++;
        else if(ch === close){
          depth--;
          if(depth === 0) return i;
        }
      }
      throw new ParseError(`Missing closing ${close}`, start);
    }

    readInlineRepeat(str, pos){
      // Legacy Morf supported C2, C1-3, C(2), and C(1-3).
      // Keep normal optional groups intact: C(V) is not consumed here.
      let raw = '';
      let end = pos;
      if(/\d/.test(str[pos] || '')){
        while(end < str.length && /[\d-]/.test(str[end])) raw += str[end++];
      } else if(str[pos] === '('){
        const close = str.indexOf(')', pos + 1);
        if(close > pos){
          const inside = str.slice(pos + 1, close).trim();
          if(/^\d+(?:\s*-\s*\d+)?$/.test(inside)){
            raw = inside;
            end = close + 1;
          }
        }
      }
      if(!raw) return null;
      let min, max;
      if(raw.includes('-')){
        const parts = raw.split('-');
        min = parseInt(parts[0].trim(), 10);
        max = parseInt(parts[1].trim(), 10);
      } else {
        min = max = parseInt(raw.trim(), 10);
      }
      if(!Number.isFinite(min) || min < 0) min = 1;
      if(!Number.isFinite(max) || max < min) max = min;
      return { min: Math.max(0, min), max: Math.min(32, max), end };
    }

    parseSeq(str){
      str = String(str || '');
      const children = [];
      let i = 0;
      while(i < str.length){
        const ch = str[i];
        if(/\s/.test(ch)){
          let j = i;
          while(j < str.length && /\s/.test(str[j])) j++;
          if(children.length && children[children.length - 1].type === 'namevar' && str.slice(j, j + 2) === '..') children.push({ type: 'literal', text: ' ' });
          i = j;
          continue;
        }
        let node = null;
        if(ch === '"'){
          let j = i + 1;
          let lit = '';
          while(j < str.length){
            if(str[j] === '"') break;
            if(str[j] === '\\' && j + 1 < str.length){ lit += str[j + 1]; j += 2; continue; }
            lit += str[j];
            j++;
          }
          if(j >= str.length) throw new ParseError('Missing closing quote', i);
          node = { type: 'literal', text: lit };
          i = j + 1;
        } else if(ch === '['){
          const j = this.findMatching(str, i, '[', ']');
          node = { type: 'group', node: this.parseAlt(str.slice(i + 1, j)), optional: false };
          i = j + 1;
        } else if(ch === '('){
          const j = this.findMatching(str, i, '(', ')');
          node = { type: 'group', node: this.parseAlt(str.slice(i + 1, j)), optional: true };
          i = j + 1;
        } else if(ch === '<'){
          const j = this.findMatching(str, i, '<', '>');
          node = { type: 'capture', node: this.parseAlt(str.slice(i + 1, j)) };
          i = j + 1;
        } else if(ch === '&'){
          let j = i + 1;
          let digits = '';
          while(j < str.length && /\d/.test(str[j])){ digits += str[j]; j++; }
          node = { type: 'backref', index: digits ? parseInt(digits, 10) : null };
          i = j;
        } else if(ch === '.'){
          if(str[i + 1] === '.'){
            const j = str.indexOf('..', i + 2);
            if(j === -1) throw new ParseError('Missing closing double-dot for name variable', i);
            node = { type: 'namevar', name: str.slice(i + 2, j).trim() };
            i = j + 2;
          } else {
            const j = str.indexOf('.', i + 1);
            if(j === -1) throw new ParseError('Missing closing dot for vocabulary variable', i);
            node = { type: 'vocab', name: str.slice(i + 1, j).trim() };
            i = j + 1;
          }
        } else if(ch === '|'){
          const j = str.indexOf('|', i + 1);
          if(j === -1) throw new ParseError('Missing closing pipe reference', i);
          node = { type: 'ref', name: str.slice(i + 1, j).trim() };
          i = j + 1;
        } else if(isUpper(ch)){
          node = { type: 'var', name: ch };
          i++;
        } else {
          let j = i;
          let lit = '';
          while(j < str.length){
            const c = str[j];
            if(/\s/.test(c) || c === '"' || c === '[' || c === '(' || c === '<' || c === '&' || c === '.' || c === '|' || isUpper(c)) break;
            if(c === '!' || c === '{' || c === '^' || c === '~') break;
            lit += c;
            j++;
          }
          if(!lit){
            lit = ch;
            j = i + 1;
          }
          node = { type: 'literal', text: lit };
          i = j;
        }

        if(node && (node.type === 'var' || node.type === 'ref' || node.type === 'vocab' || node.type === 'namevar')){
          const inlineRep = this.readInlineRepeat(str, i);
          if(inlineRep){
            node = { type: 'repeat', node, min: inlineRep.min, max: inlineRep.max };
            i = inlineRep.end;
          }
        }

        if(node && str[i] === '~'){
          let count = 0;
          while(str[i] === '~' && count < 2){ count++; i++; }
          node = { type: 'tilde', mode: count >= 2 ? 'family' : 'variation', node };
        }

        let keepPostfix = true;
        while(keepPostfix && i < str.length){
          keepPostfix = false;
          if(str[i] === '!'){
            i++;
            let j = i;
            let raw = '';
            while(j < str.length){
              const c = str[j];
              if(c === '{' || c === '^' || c === '/' || c === ']' || c === ')' || c === '>') break;
              raw += c;
              j++;
            }
            const excludes = raw.split(',').map(s => s.trim()).filter(Boolean);
            node = { type: 'exclude', node, excludes };
            i = j;
            keepPostfix = true;
          }
          if(str[i] === '{'){
            const j = str.indexOf('}', i + 1);
            if(j === -1) throw new ParseError('Missing closing brace for repetition', i);
            const body = str.slice(i + 1, j).trim();
            let min, max;
            if(/^\d+$/.test(body)){ min = max = parseInt(body, 10); }
            else {
              const m = body.match(/^(\d*)\s*,\s*(\d*)$/);
              if(!m) throw new ParseError('Bad repetition syntax', i);
              min = m[1] === '' ? 0 : parseInt(m[1], 10);
              max = m[2] === '' ? Math.max(min, min + 4) : parseInt(m[2], 10);
            }
            min = Math.max(0, min || 0);
            max = Math.min(32, Math.max(min, max || min));
            node = { type: 'repeat', node, min, max };
            i = j + 1;
            keepPostfix = true;
          }
          if(str[i] === '^'){
            const filters = [];
            while(str[i] === '^'){
              i++;
              let j = i;
              let raw = '';
              let quote = false;
              while(j < str.length){
                const c = str[j];
                if(quote){
                  if(c === '"') quote = false;
                  else raw += c;
                  j++;
                  continue;
                }
                if(c === '"'){ quote = true; j++; continue; }
                if(c === '^' || c === '/' || c === ']' || c === ')' || c === '>') break;
                raw += c;
                j++;
              }
              if(raw.length) filters.push(raw.trim());
              i = j;
            }
            node = { type: 'filter', node, filters };
            keepPostfix = true;
          }
        }
        if(node.type === 'literal' && children.length && children[children.length - 1].type === 'literal'){
          children[children.length - 1].text += node.text;
        } else {
          children.push(node);
        }
      }
      if(children.length === 0) return { type: 'literal', text: '' };
      if(children.length === 1) return children[0];
      return { type: 'seq', children };
    }
  }

  class PatternEngine {
    constructor(state, options={}){
      this.state = normalizeState(state || clone(DEFAULT_STATE));
      this.rng = options.rng || Math.random;
      this.astCache = new Map();
      this.formCache = new Map();
    }

    parse(pattern){
      const key = String(pattern || '');
      if(this.astCache.has(key)) return this.astCache.get(key);
      const ast = new PatternParser(key).parse();
      this.astCache.set(key, ast);
      return ast;
    }

    generate(pattern, options={}){
      const ast = typeof pattern === 'string' ? this.parse(pattern) : pattern;
      const context = {
        captures: options.captures ? options.captures.slice() : [],
        stack: options.stack ? options.stack.slice() : [],
        includeLex: options.includeLex !== false,
        includeAdditional: options.includeAdditional !== false,
        includeVocab: options.includeVocab !== false,
        mode: options.mode || 'generate'
      };
      const res = this.genNode(ast, context);
      return res.ok ? res : { ok: false, text: '', segs: [], reason: res.reason || 'generation failed' };
    }

    genNode(node, context){
      if(!node) return { ok: true, text: '', segs: [] };
      switch(node.type){
        case 'literal': return { ok: true, text: node.text, segs: node.text ? [{ form: node.text, cat: 'literal', gloss: '' }] : [] };
        case 'seq': {
          let text = '';
          let segs = [];
          for(const child of node.children){
            const r = this.genNode(child, context);
            if(!r.ok) return r;
            text += r.text;
            segs = segs.concat(r.segs || []);
          }
          return { ok: true, text, segs };
        }
        case 'alt': {
          const opt = chooseWeighted(node.options, this.rng);
          return this.genNode(opt.node, context);
        }
        case 'group': {
          if(node.optional && this.rng() < 0.5) return { ok: true, text: '', segs: [] };
          return this.genNode(node.node, context);
        }
        case 'capture': {
          const r = this.genNode(node.node, context);
          if(!r.ok) return r;
          context.captures.push(r.text);
          return { ok: true, text: r.text, segs: (r.segs || []).concat([{ form: r.text, cat: 'capture', gloss: `&${context.captures.length}` }]) };
        }
        case 'backref': {
          const idx = node.index == null ? context.captures.length : node.index;
          const val = idx > 0 && idx <= context.captures.length ? context.captures[idx - 1] : '';
          return { ok: true, text: val, segs: val ? [{ form: val, cat: 'copy', gloss: `&${idx}` }] : [] };
        }
        case 'repeat': {
          const n = node.min === node.max ? node.min : node.min + Math.floor(this.rng() * (node.max - node.min + 1));
          let text = '';
          let segs = [];
          for(let i=0;i<n;i++){
            const r = this.genNode(node.node, context);
            if(!r.ok) return r;
            text += r.text;
            segs = segs.concat(r.segs || []);
          }
          return { ok: true, text, segs };
        }
        case 'exclude': {
          for(let i=0;i<MAX_ATTEMPTS;i++){
            const before = context.captures.slice();
            const r = this.genNode(node.node, context);
            if(!r.ok){ context.captures = before; continue; }
            if(!node.excludes.includes(r.text)) return r;
            context.captures = before;
          }
          return { ok: false, text: '', segs: [], reason: 'exclusion removed every sampled option' };
        }
        case 'filter': {
          for(let i=0;i<MAX_ATTEMPTS;i++){
            const before = context.captures.slice();
            const r = this.genNode(node.node, context);
            if(!r.ok){ context.captures = before; continue; }
            if(!node.filters.includes(r.text)) return r;
            context.captures = before;
          }
          return { ok: false, text: '', segs: [], reason: 'fragment filter rejected every sampled option' };
        }
        case 'var': return this.generateVariable(node.name, context);
        case 'vocab': return this.generateVocab(node.name, context);
        case 'namevar': return this.generateName(node.name, context);
        case 'tilde': return this.generateTilde(node, context);
        case 'ref': return this.generateRef(node.name, context);
        default: return { ok: false, text: '', segs: [], reason: `unknown node ${node.type}` };
      }
    }

    generateVariable(name, context){
      const key = `var:${name}`;
      if(context.stack.includes(key)) return { ok: false, text: '', segs: [], reason: `recursive variable ${name}` };
      const candidates = [];
      if(context.includeAdditional){
        const pat = findAdditional(this.state, name);
        if(pat && pat.pattern != null){
          candidates.push({ kind: 'additional', source: pat });
        }
      }
      if(context.includeLex){
        for(const cat of this.state.lexiconCategories || []){
          if((cat.letter || '') === name || (cat.name || '') === name){
            for(const en of cat.entries || []) candidates.push({ kind: 'lex', cat, entry: en });
          }
        }
      }
      if(!candidates.length){
        return { ok: true, text: name, segs: [{ form: name, cat: 'literal', gloss: '' }] };
      }
      for(let attempt=0;attempt<MAX_ATTEMPTS;attempt++){
        const cand = pick(candidates, this.rng);
        if(cand.kind === 'additional'){
          const next = Object.assign({}, context, { stack: context.stack.concat(key), includeLex: true, includeAdditional: true });
          const r = this.generate(cand.source.pattern, next);
          if(r.ok){
            const segs = (r.segs || []).filter(s => s.cat !== 'literal');
            return { ok: true, text: r.text, segs: segs.length ? segs : [{ form: r.text, cat: cand.source.letter || cand.source.name || name, gloss: 'pattern', letter: name }] };
          }
        } else if(cand.kind === 'lex'){
          const forms = this.expandStoredForm(cand.entry.form, { includeLex: false, includeVocab: false });
          const text = stripAffixMarks(pick(forms, this.rng) || cand.entry.form || '');
          return { ok: true, text, segs: [{ form: text, cat: cand.cat.name || cand.cat.letter || name, gloss: entryGloss(cand.entry), meanings: entryMeanings(cand.entry), letter: cand.cat.letter || '', source: 'lexicon', placement: cand.cat.placement || 'anywhere' }] };
        }
      }
      return { ok: false, text: '', segs: [], reason: `no usable expansion for ${name}` };
    }

    generateVocab(name, context){
      const clean = trimDots(name);
      const cats = (this.state.vocabularyCategories || []).filter(c => (c.variable || '') === clean || (c.name || '') === clean);
      const entries = [];
      for(const cat of cats){ for(const en of cat.entries || []) entries.push({ cat, entry: en }); }
      if(!entries.length) return { ok: true, text: `.${clean}.`, segs: [{ form: `.${clean}.`, cat: 'literal', gloss: '' }] };
      const cand = pick(entries, this.rng);
      const forms = this.expandStoredForm(cand.entry.word, { includeLex: false, includeVocab: false });
      const word = stripAffixMarks(pick(forms, this.rng) || cand.entry.word || '');
      return { ok: true, text: word, segs: [{ form: word, cat: cand.cat.name || cand.cat.variable || clean, gloss: entryGloss(cand.entry), meanings: entryMeanings(cand.entry), variable: cand.cat.variable || '', source: 'vocabulary' }] };
    }

    generateName(name, context){
      const clean = trimDots(name);
      const cats = (this.state.nameCategories || []).filter(c => (c.variable || '') === clean || (c.name || '') === clean || (c.type || '') === clean);
      const entries = [];
      for(const cat of cats){ for(const en of cat.entries || []) entries.push({ cat, entry: en }); }
      if(!entries.length) return { ok: true, text: `..${clean}..`, segs: [{ form: `..${clean}..`, cat: 'literal', gloss: '' }] };
      const cand = pick(entries, this.rng);
      const forms = expandNameSpelling(cand.entry.name, 200);
      const word = pick(forms, this.rng) || cand.entry.name || '';
      const gloss = cand.entry.actual || cand.entry.gloss || cand.entry.meaning || '';
      const literal = cand.entry.literal || '';
      return { ok: true, text: word, segs: [{ form: word, cat: cand.cat.name || cand.cat.variable || clean, gloss, literal, actual: gloss, variable: cand.cat.variable || '', source: 'name', nameType: cand.cat.type || '' }] };
    }

    generateTilde(node, context){
      const inner = this.genNode(node.node, context);
      if(!inner.ok) return inner;
      const base = String(inner.text || '').trim();
      if(!base) return inner;
      const forms = this.resolveTildeForms(base, node.mode || 'variation', { limit: 300 });
      const chosen = pick(forms.length ? forms : [base], this.rng) || base;
      return { ok: true, text: chosen, segs: [{ form: chosen, cat: node.mode === 'family' ? 'family' : 'variation', gloss: node.mode === 'family' ? `family of ${base}` : `variation of ${base}`, source: node.mode === 'family' ? 'family' : 'variation' }] };
    }

    enumerateTilde(node, ctx){
      let bases = [];
      try { bases = this.enumNode(node.node, Object.assign({}, ctx, { limit: Math.min(ctx.limit || MAX_ENUM, 200) })); } catch(_) { bases = []; }
      const out = [];
      for(const base of bases){
        out.push(...this.resolveTildeForms(base, node.mode || 'variation', { limit: ctx.limit || MAX_ENUM }));
        if(out.length >= (ctx.limit || MAX_ENUM)) break;
      }
      return capList(out.length ? out : bases, ctx.limit || MAX_ENUM);
    }

    tildeRows(){
      const rows = [];
      for(const cat of this.state.lexiconCategories || []){
        for(const en of cat.entries || []){
          const forms = this.expandStoredForm(en.form, { includeLex: false, includeVocab: false });
          rows.push({ scope: 'lex', type: 'L', category: cat.name || cat.letter || '', categoryKey: cat.letter || cat.name || '', raw: en.form || '', forms, familyLinks: en.familyLinks || [], entry: en, cat });
        }
      }
      for(const cat of this.state.vocabularyCategories || []){
        for(const en of cat.entries || []){
          const forms = this.expandStoredForm(en.word, { includeLex: false, includeVocab: false });
          rows.push({ scope: 'vocab', type: 'V', category: cat.name || cat.variable || '', categoryKey: cat.variable || cat.name || '', raw: en.word || '', forms, familyLinks: en.familyLinks || [], entry: en, cat });
        }
      }
      for(const cat of this.state.nameCategories || []){
        for(const en of cat.entries || []){
          const forms = expandNameSpelling(en.name, 300);
          rows.push({ scope: 'name', type: 'N', category: cat.name || cat.variable || '', categoryKey: cat.variable || cat.name || '', raw: en.name || '', forms, familyLinks: en.familyLinks || [], entry: en, cat });
          if(en.nicknames){
            const nickForms = expandNameSpelling(en.nicknames, 300);
            if(nickForms.length) rows.push({ scope: 'name', type: 'N', category: cat.name || cat.variable || '', categoryKey: cat.variable || cat.name || '', raw: en.nicknames || '', forms: nickForms, familyLinks: [], entry: en, cat, nickname: true });
          }
        }
      }
      return rows;
    }

    normalizeTildeKey(value){
      return String(value || '').trim().toLocaleLowerCase();
    }

    expandTildeBase(token, scope){
      const clean = stripAffixMarks(String(token || '').trim());
      if(!clean) return [];
      let expanded = [];
      try {
        if(scope === 'name') expanded = expandNameSpelling(clean, 300);
        else expanded = this.expandStoredForm(clean, { includeLex: false, includeVocab: false });
      } catch(_) { expanded = []; }
      expanded.push(clean);
      return capList(expanded.map(stripAffixMarks).filter(Boolean), 300);
    }

    familyTypeScope(type){
      const t = String(type || '').trim().toUpperCase();
      if(t === 'L' || t === 'LEX' || t === 'LEXICON') return 'lex';
      if(t === 'V' || t === 'VOC' || t === 'VOCAB' || t === 'VOCABULARY') return 'vocab';
      if(t === 'N' || t === 'NAME' || t === 'NAMES') return 'name';
      return '';
    }

    familyCategoryMatchesRow(row, link){
      const cat = this.normalizeTildeKey(link && link.category);
      if(!cat) return true;
      const vals = [row.category, row.categoryKey, row.cat && row.cat.id, row.cat && row.cat.letter, row.cat && row.cat.variable, row.cat && row.cat.name]
        .map(v => this.normalizeTildeKey(v)).filter(Boolean);
      return vals.includes(cat);
    }

    rowsMatchingTarget(rows, token, scope='', category=''){
      let target = String(token || '').trim();
      const mode = target.endsWith('~~') ? 'family' : target.endsWith('~') ? 'variation' : '';
      if(mode === 'family') target = target.slice(0, -2).trim();
      else if(mode === 'variation') target = target.slice(0, -1).trim();
      const targetForms = [];
      const scopes = scope ? [scope] : ['lex','vocab','name'];
      for(const sc of scopes) targetForms.push(...this.expandTildeBase(target, sc));
      const keys = new Set(targetForms.map(v => this.normalizeTildeKey(v)));
      if(!keys.size) return [];
      const catKey = this.normalizeTildeKey(category);
      return rows.filter(row => {
        if(scope && row.scope !== scope) return false;
        if(catKey && !this.familyCategoryMatchesRow(row, { category })) return false;
        return (row.forms || []).some(f => keys.has(this.normalizeTildeKey(f)));
      });
    }

    linkTargetRows(rows, link){
      const scope = this.familyTypeScope(link && link.type);
      if(!scope) return [];
      return this.rowsMatchingTarget(rows, link.target || '', scope, link.category || '');
    }

    resolveTildeForms(token, mode='variation', options={}){
      const limit = options.limit || MAX_ENUM;
      let base = String(token || '').trim();
      if(base.endsWith('~~')){ mode = 'family'; base = base.slice(0, -2).trim(); }
      else if(base.endsWith('~')){ mode = 'variation'; base = base.slice(0, -1).trim(); }
      const rows = this.tildeRows();
      const anchors = this.rowsMatchingTarget(rows, base);
      const out = [];
      const addRows = list => {
        for(const row of list || []){
          for(const f of row.forms || []){
            if(f) out.push(f);
            if(out.length >= limit) return;
          }
        }
      };
      if(anchors.length) addRows(anchors);
      else {
        // If no stored entry matched, still allow raw spelling syntax like syn(n(e))~ to expand itself.
        addRows([{ forms: this.expandTildeBase(base, 'name').concat(this.expandTildeBase(base, 'vocab')) }]);
      }
      if(mode === 'family'){
        const extra = [];
        for(const anchor of anchors){
          // Things this anchor explicitly points to.
          for(const link of anchor.familyLinks || []){
            const targets = this.linkTargetRows(rows, link);
            for(const t of targets) if(!extra.includes(t)) extra.push(t);
            // Siblings that point to the same target are in the same family.
            for(const other of rows){
              if(other === anchor) continue;
              for(const olink of other.familyLinks || []){
                const otargets = this.linkTargetRows(rows, olink);
                if(targets.some(t => otargets.includes(t)) && !extra.includes(other)) extra.push(other);
              }
            }
          }
          // Things that explicitly point to this anchor.
          for(const other of rows){
            if(other === anchor) continue;
            for(const link of other.familyLinks || []){
              const targets = this.linkTargetRows(rows, link);
              if(targets.includes(anchor) && !extra.includes(other)) extra.push(other);
            }
          }
        }
        addRows(extra);
      }
      return capList(out.filter(Boolean), limit);
    }

    generateRef(name, context){
      const clean = String(name || '').trim();
      const fakeVar = /^[A-Z]$/.test(clean) ? this.generateVariable(clean, context) : null;
      if(fakeVar && fakeVar.text !== clean) return fakeVar;
      const add = findAdditional(this.state, clean);
      if(add){
        const next = Object.assign({}, context, { stack: context.stack.concat(`ref:${clean}`) });
        return this.generate(add.pattern, next);
      }
      const lexCats = (this.state.lexiconCategories || []).filter(c => (c.letter || '') === clean || (c.name || '') === clean);
      const lex = [];
      for(const cat of lexCats){ for(const entry of cat.entries || []) lex.push({ cat, entry }); }
      if(lex.length){
        const cand = pick(lex, this.rng);
        const forms = this.expandStoredForm(cand.entry.form, { includeLex: false, includeVocab: false });
        const text = stripAffixMarks(pick(forms, this.rng) || cand.entry.form || '');
        return { ok: true, text, segs: [{ form: text, cat: cand.cat.name || cand.cat.letter || clean, gloss: entryGloss(cand.entry), meanings: entryMeanings(cand.entry), letter: cand.cat.letter || '', source: 'lexicon', placement: cand.cat.placement || 'anywhere' }] };
      }
      const vcats = (this.state.vocabularyCategories || []).filter(c => (c.variable || '') === clean || (c.name || '') === clean);
      const voc = [];
      for(const cat of vcats){ for(const entry of cat.entries || []) voc.push({ cat, entry }); }
      if(voc.length){
        const cand = pick(voc, this.rng);
        const forms = this.expandStoredForm(cand.entry.word, { includeLex: false, includeVocab: false });
        const word = stripAffixMarks(pick(forms, this.rng) || cand.entry.word || '');
        return { ok: true, text: word, segs: [{ form: word, cat: cand.cat.name || cand.cat.variable || clean, gloss: entryGloss(cand.entry), meanings: entryMeanings(cand.entry), variable: cand.cat.variable || '', source: 'vocabulary' }] };
      }
      return { ok: true, text: `|${clean}|`, segs: [{ form: `|${clean}|`, cat: 'literal', gloss: '' }] };
    }

    expandStoredForm(form, options={}){
      const raw = stripAffixMarks(String(form || ''));
      const cacheKey = JSON.stringify({ raw, options });
      if(this.formCache.has(cacheKey)) return this.formCache.get(cacheKey);
      let out;
      try {
        out = this.enumerate(raw, Object.assign({ limit: 200, includeLex: false, includeVocab: false, includeAdditional: true }, options));
      } catch(e){ out = [raw]; }
      out = capList(out.length ? out : [raw], 200).map(stripAffixMarks).filter(Boolean);
      this.formCache.set(cacheKey, out);
      return out;
    }

    enumerate(pattern, options={}){
      const ast = typeof pattern === 'string' ? this.parse(pattern) : pattern;
      const ctx = {
        stack: options.stack || [],
        limit: options.limit || MAX_ENUM,
        includeLex: options.includeLex !== false,
        includeAdditional: options.includeAdditional !== false,
        includeVocab: options.includeVocab !== false
      };
      return capList(this.enumNode(ast, ctx), ctx.limit);
    }

    enumNode(node, ctx){
      if(!node) return [''];
      const limit = ctx.limit || MAX_ENUM;
      switch(node.type){
        case 'literal': return [node.text];
        case 'seq': {
          let acc = [''];
          for(const child of node.children){
            const vals = this.enumNode(child, ctx);
            const next = [];
            for(const a of acc){
              for(const b of vals){
                next.push(a + b);
                if(next.length >= limit) break;
              }
              if(next.length >= limit) break;
            }
            acc = next;
          }
          return capList(acc, limit);
        }
        case 'alt': {
          const out = [];
          for(const opt of node.options){
            out.push(...this.enumNode(opt.node, ctx));
            if(out.length >= limit) break;
          }
          return capList(out, limit);
        }
        case 'group': {
          const vals = this.enumNode(node.node, ctx);
          return node.optional ? capList(['', ...vals], limit) : vals;
        }
        case 'capture': return this.enumNode(node.node, ctx);
        case 'backref': return [''];
        case 'repeat': {
          let out = [];
          const vals = this.enumNode(node.node, ctx);
          function cart(base, times){
            let acc = [''];
            for(let i=0;i<times;i++){
              const next = [];
              for(const a of acc){
                for(const b of vals){
                  next.push(a + b);
                  if(next.length >= limit) break;
                }
                if(next.length >= limit) break;
              }
              acc = next;
            }
            return acc;
          }
          for(let n=node.min;n<=node.max;n++){
            out.push(...cart(vals, n));
            if(out.length >= limit) break;
          }
          return capList(out, limit);
        }
        case 'exclude': {
          const vals = this.enumNode(node.node, ctx);
          return vals.filter(v => !node.excludes.includes(v));
        }
        case 'filter': {
          const vals = this.enumNode(node.node, ctx);
          return vals.filter(v => !node.filters.includes(v));
        }
        case 'var': return this.enumerateVariable(node.name, ctx);
        case 'vocab': return this.enumerateVocab(node.name, ctx);
        case 'namevar': return this.enumerateName(node.name, ctx);
        case 'tilde': return this.enumerateTilde(node, ctx);
        case 'ref': return this.enumerateRef(node.name, ctx);
        default: return [''];
      }
    }

    enumerateVariable(name, ctx){
      const key = `var:${name}`;
      if(ctx.stack.includes(key)) return [];
      const out = [];
      if(ctx.includeAdditional){
        const pat = findAdditional(this.state, name);
        if(pat) out.push(...this.enumerate(pat.pattern, Object.assign({}, ctx, { stack: ctx.stack.concat(key) })));
      }
      if(ctx.includeLex){
        for(const cat of this.state.lexiconCategories || []){
          if(ctx.mode === 'name' && cat.appliesNames === false) continue;
          if(ctx.mode !== 'name' && cat.appliesWords === false) continue;
          if((cat.letter || '') === name || (cat.name || '') === name){
            for(const en of cat.entries || []) out.push(...this.expandStoredForm(en.form, { includeLex: false, includeVocab: false }));
          }
        }
      }
      return capList(out.length ? out : [name], ctx.limit);
    }

    enumerateVocab(name, ctx){
      if(ctx.includeVocab === false) return [`.${trimDots(name)}.`];
      const clean = trimDots(name);
      const out = [];
      for(const cat of this.state.vocabularyCategories || []){
        if((cat.variable || '') === clean || (cat.name || '') === clean){
          for(const en of cat.entries || []) if(en.word) out.push(...this.expandStoredForm(en.word, { includeLex: false, includeVocab: false }));
        }
      }
      return capList(out.length ? out : [`.${clean}.`], ctx.limit);
    }

    enumerateName(name, ctx){
      const clean = trimDots(name);
      const out = [];
      for(const cat of this.state.nameCategories || []){
        if((cat.variable || '') === clean || (cat.name || '') === clean || (cat.type || '') === clean){
          for(const en of cat.entries || []) if(en.name) out.push(...expandNameSpelling(en.name, ctx.limit));
        }
      }
      return capList(out.length ? out : [`..${clean}..`], ctx.limit);
    }

    enumerateRef(name, ctx){
      const clean = String(name || '').trim();
      const out = [];
      if(/^[A-Z]$/.test(clean)) out.push(...this.enumerateVariable(clean, ctx));
      const add = findAdditional(this.state, clean);
      if(add) out.push(...this.enumerate(add.pattern, Object.assign({}, ctx, { stack: ctx.stack.concat(`ref:${clean}`) })));
      for(const cat of this.state.lexiconCategories || []){
        if((cat.letter || '') === clean || (cat.name || '') === clean){
          for(const en of cat.entries || []) out.push(...this.expandStoredForm(en.form, { includeLex: false, includeVocab: false }));
        }
      }
      for(const cat of this.state.vocabularyCategories || []){
        if((cat.variable || '') === clean || (cat.name || '') === clean){
          for(const en of cat.entries || []) if(en.word) out.push(...this.expandStoredForm(en.word, { includeLex: false, includeVocab: false }));
        }
      }
      return capList(out.length ? out : [`|${clean}|`], ctx.limit);
    }

    compileRegex(pattern, options={}){
      const ast = typeof pattern === 'string' ? this.parse(pattern) : pattern;
      const ctx = { captureCount: 0, lastCapture: 0, stack: [], limit: options.limit || MAX_ENUM };
      const body = this.regexNode(ast, ctx);
      return body || '';
    }

    regexNode(node, ctx){
      if(!node) return '';
      switch(node.type){
        case 'literal': return escapeRegExp(node.text);
        case 'seq': return node.children.map(ch => this.regexNode(ch, ctx)).join('');
        case 'alt': return `(?:${node.options.map(o => this.regexNode(o.node, ctx)).join('|')})`;
        case 'group': {
          const r = this.regexNode(node.node, ctx);
          return node.optional ? `(?:${r})?` : `(?:${r})`;
        }
        case 'capture': {
          const r = this.regexNode(node.node, ctx);
          ctx.captureCount += 1;
          ctx.lastCapture = ctx.captureCount;
          return `(${r})`;
        }
        case 'backref': {
          const idx = node.index == null ? ctx.lastCapture : node.index;
          return idx ? `\\${idx}` : '';
        }
        case 'repeat': {
          const r = this.regexNode(node.node, ctx);
          return node.min === node.max ? `(?:${r}){${node.min}}` : `(?:${r}){${node.min},${node.max}}`;
        }
        case 'exclude': return this.regexNode(node.node, ctx);
        case 'filter': return this.regexNode(node.node, ctx);
        case 'var': return this.regexFromList(this.enumerateVariable(node.name, { stack: [], limit: ctx.limit, includeLex: true, includeAdditional: true, includeVocab: false }));
        case 'vocab': return this.regexFromList(this.enumerateVocab(node.name, { stack: [], limit: ctx.limit, includeVocab: true }));
        case 'namevar': return this.regexFromList(this.enumerateName(node.name, { stack: [], limit: ctx.limit }));
        case 'tilde': return this.regexFromList(this.enumerateTilde(node, { stack: [], limit: ctx.limit, includeLex: true, includeAdditional: true, includeVocab: true }));
        case 'ref': return this.regexFromList(this.enumerateRef(node.name, { stack: [], limit: ctx.limit, includeLex: true, includeAdditional: true, includeVocab: true }));
        default: return '';
      }
    }

    regexFromList(list){
      const vals = capList(list, MAX_ENUM).filter(Boolean).sort((a,b) => b.length - a.length).map(escapeRegExp);
      if(!vals.length) return '(?!)';
      return vals.length === 1 ? vals[0] : `(?:${vals.join('|')})`;
    }
  }

  function findAdditional(state, name){
    const clean = String(name || '').trim();
    const up = clean.toUpperCase();
    return (state.additionalPatterns || []).find(p => {
      const letter = String(p.letter || '').trim();
      const pname = String(p.name || '').trim();
      return letter === clean || pname === clean || (clean.length === 1 && letter.toUpperCase() === up);
    });
  }

  function parseRewriteRules(text, engine){
    const rules = [];
    const lines = normalizeRewriteCompat(cleanString(text, '')).split('\n');
    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed || trimmed.startsWith('//')) continue;
      const idx = trimmed.indexOf('=');
      if(idx === -1) continue;
      const target = trimmed.slice(0, idx).trim();
      const replacement = trimmed.slice(idx + 1).trim();
      if(!target) continue;
      try {
        const body = engine.compileRegex(target);
        if(!body || body === '(?:)?') continue;
        const regex = new RegExp(body, 'gu');
        rules.push({ raw: trimmed, target, replacement, regex });
      } catch(err){
        rules.push({ raw: trimmed, target, replacement, error: err.message });
      }
    }
    return rules;
  }

  function applyRewriteRules(word, rules, engine){
    let out = String(word || '');
    const fired = [];
    for(const rule of rules || []){
      if(rule.error || !rule.regex) continue;
      let changed = false;
      out = out.replace(rule.regex, function(match, ...args){
        changed = true;
        const captures = args.slice(0, -2).map(x => x == null ? '' : String(x));
        const r = engine.generate(rule.replacement, { captures, includeLex: true, includeAdditional: true, includeVocab: true, mode: 'rewrite' });
        return r.ok ? r.text : match;
      });
      if(changed) fired.push(rule.raw);
    }
    return { word: out, fired };
  }

  function parseForbiddenRules(text, engine){
    const rules = [];
    for(const line of normalizeNewlines(text).split('\n')){
      const trimmed = line.trim();
      if(!trimmed || trimmed.startsWith('//')) continue;
      try {
        const body = engine.compileRegex(trimmed);
        if(!body) continue;
        rules.push({ raw: trimmed, regex: new RegExp(body, 'u') });
      } catch(err){
        rules.push({ raw: trimmed, error: err.message });
      }
    }
    return rules;
  }

  function violatesForbidden(word, rules){
    const hit = [];
    for(const rule of rules || []){
      if(rule.error || !rule.regex) continue;
      if(rule.regex.test(word)) hit.push(rule.raw);
      rule.regex.lastIndex = 0;
    }
    return hit;
  }

  function parsePositionFilters(text, engine, kind){
    const specs = [];
    for(const rawPart of splitList(text)){
      let raw = rawPart.trim();
      if(!raw) continue;
      const dollarWrapped = raw.startsWith('$') && raw.endsWith('$') && raw.length >= 2;
      // $...$ means "try to force this at the edge" only for Starts with / Ends with.
      // Contains stays a plain whole-word filter, because there is no obvious safe place to insert it.
      const force = dollarWrapped && kind !== 'contains';
      if(dollarWrapped) raw = raw.slice(1, -1);
      try {
        const body = engine.compileRegex(raw);
        let regex;
        if(kind === 'starts') regex = new RegExp(`^(?:${body})`, 'u');
        else if(kind === 'ends') regex = new RegExp(`(?:${body})$`, 'u');
        else regex = new RegExp(`(?:${body})`, 'u');
        specs.push({ raw, force, regex, kind });
      } catch(err){
        specs.push({ raw, force, kind, error: err.message });
      }
    }
    return specs;
  }

  function filterPasses(word, filters){
    if(!filters || !filters.length) return true;
    return filters.some(f => !f.error && f.regex && f.regex.test(word));
  }

  function buildFullPatternRegex(engine, pattern){
    try {
      const body = engine.compileRegex(pattern);
      if(!body) return null;
      return new RegExp(`^(?:${body})$`, 'u');
    } catch(err){
      return null;
    }
  }

  function fitForcedStart(word, forcedText, fullPatternRegex){
    const base = String(word || '');
    const forced = String(forcedText || '');
    if(!forced) return null;
    if(!fullPatternRegex) return null;
    const maxCut = Math.min(base.length, Math.max(forced.length + 8, 24));
    for(let cut=maxCut; cut>=0; cut--){
      const candidate = forced + base.slice(cut);
      if(fullPatternRegex.test(candidate)) return candidate;
    }
    return null;
  }

  function fitForcedEnd(word, forcedText, fullPatternRegex){
    const base = String(word || '');
    const forced = String(forcedText || '');
    if(!forced) return null;
    if(!fullPatternRegex) return null;
    const maxCut = Math.min(base.length, Math.max(forced.length + 8, 24));
    for(let cut=maxCut; cut>=0; cut--){
      const candidate = base.slice(0, base.length - cut) + forced;
      if(fullPatternRegex.test(candidate)) return candidate;
    }
    return null;
  }

  function applyLiteralPositionAdjustments(word, filterGroups, engine, pattern){
    let out = String(word || '');
    const changed = [];
    const fullPatternRegex = buildFullPatternRegex(engine, pattern);
    for(const spec of (filterGroups.starts || []).filter(f => f.force && !f.error)){
      if(!spec.regex.test(out)){
        const g = engine.generate(spec.raw);
        if(g.ok){
          const fitted = fitForcedStart(out, g.text, fullPatternRegex);
          out = fitted || (g.text + out);
          changed.push(fitted ? `starts-fit:${spec.raw}` : `starts-prepend:${spec.raw}`);
        }
      }
      spec.regex.lastIndex = 0;
    }
    // Contains filters are intentionally never force-adjusted. $...$ is stripped and used as a normal contains filter.
    for(const spec of (filterGroups.ends || []).filter(f => f.force && !f.error)){
      if(!spec.regex.test(out)){
        const g = engine.generate(spec.raw);
        if(g.ok){
          const fitted = fitForcedEnd(out, g.text, fullPatternRegex);
          out = fitted || (out + g.text);
          changed.push(fitted ? `ends-fit:${spec.raw}` : `ends-append:${spec.raw}`);
        }
      }
      spec.regex.lastIndex = 0;
    }
    return { word: out, changed };
  }

  function passesAllPositionFilters(word, filterGroups){
    if(filterGroups.starts && filterGroups.starts.length && !filterPasses(word, filterGroups.starts)) return false;
    if(filterGroups.contains && filterGroups.contains.length && !filterPasses(word, filterGroups.contains)) return false;
    if(filterGroups.ends && filterGroups.ends.length && !filterPasses(word, filterGroups.ends)) return false;
    return true;
  }

  function buildTiles(state, engine, options={}){
    if(!engine) engine = new PatternEngine(state);
    const mode = options.mode || 'word';
    const includeVocab = options.includeVocab !== false;
    const includeNames = options.includeNames !== false;
    const includeLexicon = options.includeLexicon !== false;
    const cacheKey = JSON.stringify({ mode, includeVocab, includeNames, includeLexicon });
    if(engine){
      engine._tilesCacheMap = engine._tilesCacheMap || {};
      if(engine._tilesCacheMap[cacheKey]) return engine._tilesCacheMap[cacheKey];
    }
    const tiles = [];
    if(includeLexicon) for(const cat of state.lexiconCategories || []){
      if(mode === 'word' && cat.appliesWords === false) continue;
      if(mode === 'name' && cat.appliesNames === false) continue;
      for(const en of cat.entries || []){
        const forms = engine.expandStoredForm(en.form, { includeLex: false, includeVocab: false });
        const meanings = entryMeanings(en);
        const gloss = meanings.length ? meanings[0] : '';
        for(const form of forms){
          const stripped = stripAffixMarks(form);
          if(!stripped) continue;
          tiles.push({
            form: stripped,
            raw: en.form || stripped,
            gloss,
            meanings,
            cat: cat.name || cat.letter || 'Lexicon',
            letter: cat.letter || '',
            placement: cat.placement || 'anywhere',
            source: 'lexicon',
            entryId: en.id || ''
          });
        }
      }
    }
    if(includeVocab) for(const cat of state.vocabularyCategories || []){
      for(const en of cat.entries || []){
        const forms = engine.expandStoredForm(en.word, { includeLex: false, includeVocab: false });
        const meanings = entryMeanings(en);
        const gloss = meanings.length ? meanings[0] : '';
        for(const form of forms){
          const word = String(form || '').trim();
          if(!word) continue;
          tiles.push({
            form: word,
            raw: en.word || word,
            gloss,
            meanings,
            cat: cat.name || cat.variable || 'Vocabulary',
            variable: cat.variable || '',
            placement: 'anywhere',
            source: 'vocabulary',
            entryId: en.id || ''
          });
        }
      }
    }
    if(includeNames) for(const cat of state.nameCategories || []){
      for(const en of cat.entries || []){
        const forms = expandNameSpelling(en.name, 200);
        const gloss = en.actual || en.gloss || en.meaning || '';
        let autoLiteral = '';
        try { autoLiteral = (en.literal || (analyzeNameLiteral(en.name, state, { engine }).gloss || '')); } catch(_) { autoLiteral = en.literal || ''; }
        for(const form of forms){
          const name = String(form || '').trim();
          if(!name) continue;
          tiles.push({
            form: name,
            raw: en.name || name,
            gloss,
            meanings: gloss ? [gloss] : [],
            literal: autoLiteral || en.literal || '',
            cat: cat.name || cat.variable || 'Names',
            variable: cat.variable || '',
            placement: 'anywhere',
            source: 'name',
            nameType: cat.type || '',
            entryId: en.id || ''
          });
        }
        if(en.nicknames){
          const nickForms = expandNameSpelling(en.nicknames, 200);
          for(const form of nickForms){
            const nick = String(form || '').trim();
            if(!nick) continue;
            tiles.push({
              form: nick,
              raw: en.nicknames || nick,
              gloss,
              meanings: gloss ? [gloss] : [],
              literal: autoLiteral || en.literal || '',
              cat: cat.name || cat.variable || 'Names',
              variable: cat.variable || '',
              placement: 'anywhere',
              source: 'name',
              nameType: (cat.type || 'name') + ' nickname',
              isNickname: true,
              nicknameOf: (forms && forms[0]) || en.name || '',
              entryId: en.id || ''
            });
          }
        }
      }
    }
    tiles.sort((a,b) => b.form.length - a.form.length || a.form.localeCompare(b.form));
    if(engine) engine._tilesCacheMap[cacheKey] = tiles;
    return tiles;
  }

  function analyzeNameLiteral(name, state, options={}){
    const normalized = normalizeState(state);
    const engine = options.engine || new PatternEngine(normalized);
    const forms = expandNameSpelling(name, 200);
    const raw = String((forms && forms[0]) || name || '').trim();
    const clean = raw.toLocaleLowerCase();
    if(!clean) return { word: raw, primary: [], alternatives: [], gloss: '' };
    const analysis = analyzeWord(clean, normalized, {
      engine,
      maxResults: options.maxResults || 32,
      mode: 'name',
      includeVocab: false,
      includeNames: false,
      includeLexicon: true
    });
    analysis.word = raw;
    analysis.gloss = glossForSegments(analysis.primary || []);
    return analysis;
  }

  function tileAllowed(tile, word, index, prefixSpanLen, canCoverEndSpan){
    const end = index + tile.form.length;
    if(tile.placement === 'start'){
      // Start/prefix tiles are only valid at the beginning, or as part of one
      // unbroken start-zone made of other start tiles. So pre in apprehensive
      // stays unknown, but pre+flor and flor+pre can both be parsed if both
      // pieces are start/root-start entries.
      return index === 0 || (prefixSpanLen > 0 && index === prefixSpanLen);
    }
    if(tile.placement === 'middle') return index > 0 && end < word.length;
    if(tile.placement === 'end') return !!canCoverEndSpan && canCoverEndSpan(index);
    return true;
  }

  function parseScore(parse){
    const unknownChars = parse.reduce((n, s) => n + (s.source === 'unknown' ? s.form.length : 0), 0);
    const vocabExact = parse.length === 1 && parse[0].source === 'vocabulary';
    const known = parse.reduce((n, s) => n + (s.source !== 'unknown' ? s.form.length : 0), 0);
    return { unknownChars, vocabExact, known, segments: parse.length };
  }

  function compareParses(a, b){
    const A = parseScore(a), B = parseScore(b);
    if(A.vocabExact !== B.vocabExact) return A.vocabExact ? -1 : 1;
    if(A.unknownChars !== B.unknownChars) return A.unknownChars - B.unknownChars;
    if(A.known !== B.known) return B.known - A.known;
    return A.segments - B.segments;
  }

  function analyzeWord(word, state, options={}){
    const clean = String(word || '').trim();
    const engine = options.engine || new PatternEngine(state);
    const tiles = buildTiles(state, engine, { mode: options.mode || 'word', includeVocab: options.includeVocab, includeNames: options.includeNames, includeLexicon: options.includeLexicon });
    const tileIndex = new Map();
    for(const tile of tiles){
      const first = tile && tile.form ? tile.form[0] : '';
      if(!first) continue;
      if(!tileIndex.has(first)) tileIndex.set(first, []);
      tileIndex.get(first).push(tile);
    }
    const results = [];
    const maxResults = options.maxResults || 64;
    const seen = new Set();

    function key(segs){ return segs.map(s => `${s.source}:${s.cat}:${s.form}`).join('|'); }

    const endCoverMemo = new Map();
    function canCoverEndSpan(index){
      if(index === clean.length) return true;
      if(index > clean.length) return false;
      if(endCoverMemo.has(index)) return endCoverMemo.get(index);
      let ok = false;
      for(const tile of tiles){
        if(tile.placement !== 'end' || !tile.form) continue;
        if(clean.slice(index, index + tile.form.length) !== tile.form) continue;
        if(canCoverEndSpan(index + tile.form.length)){ ok = true; break; }
      }
      endCoverMemo.set(index, ok);
      return ok;
    }

    function matchesAt(index, prefixSpanLen){
      const out = [];
      const candidates = tileIndex.get(clean[index]) || [];
      for(const tile of candidates){
        if(!tile.form) continue;
        if(clean.slice(index, index + tile.form.length) !== tile.form) continue;
        if(!tileAllowed(tile, clean, index, prefixSpanLen, canCoverEndSpan)) continue;
        out.push(tile);
      }
      return out;
    }

    function dfs(index, prefixSpanLen, unknown, segs){
      if(results.length >= maxResults) return;
      if(index >= clean.length){
        const finalSegs = segs.slice();
        if(unknown) finalSegs.push({ form: unknown, cat: 'unknown', gloss: '?', source: 'unknown' });
        const k = key(finalSegs);
        if(!seen.has(k)){ seen.add(k); results.push(finalSegs); }
        return;
      }
      const opts = matchesAt(index, prefixSpanLen);
      for(const tile of opts){
        const next = segs.slice();
        if(unknown) next.push({ form: unknown, cat: 'unknown', gloss: '?', source: 'unknown' });
        next.push({ form: tile.form, cat: tile.cat, gloss: tile.gloss, meanings: tile.meanings || [], literal: tile.literal || '', actual: tile.gloss || '', letter: tile.letter, variable: tile.variable, source: tile.source, placement: tile.placement, nameType: tile.nameType || '', isNickname: !!tile.isNickname, nicknameOf: tile.nicknameOf || '' });
        const nextPrefix = tile.placement === 'start' ? index + tile.form.length : prefixSpanLen;
        dfs(index + tile.form.length, nextPrefix, '', next);
      }
      dfs(index + 1, prefixSpanLen, unknown + clean[index], segs);
    }

    if(!clean) return { word: clean, primary: [], alternatives: [] };
    dfs(0, 0, '', []);
    results.sort(compareParses);
    const primary = results[0] || [{ form: clean, cat: 'unknown', gloss: '?', source: 'unknown' }];
    const alternatives = results.slice(1, maxResults);
    return { word: clean, primary, alternatives, tilesCount: tiles.length };
  }

  function tokenizeInput(text){
    const src = String(text || '');
    const out = [];
    let cur = '';
    let quote = false;
    for(let i=0;i<src.length;i++){
      const ch = src[i];
      if(quote){
        if(ch === '"'){
          out.push({ text: cur, literal: true });
          cur = '';
          quote = false;
        } else cur += ch;
        continue;
      }
      if(ch === '"'){
        if(cur.trim()) out.push({ text: cur.trim(), literal: false });
        cur = '';
        quote = true;
      } else if(/\s/.test(ch)){
        if(cur.trim()) out.push({ text: cur.trim(), literal: false });
        cur = '';
      } else cur += ch;
    }
    if(cur.trim() || quote) out.push({ text: cur.trim(), literal: quote });
    return out;
  }

  function analyzeText(text, state, options={}){
    const engine = options.engine || new PatternEngine(state);
    return tokenizeInput(text).map(tok => {
      if(tok.literal) return { word: tok.text, literal: true, primary: [{ form: tok.text, cat: 'literal span', gloss: tok.text, source: 'literal' }], alternatives: [] };
      return analyzeWord(tok.text, state, { engine, maxResults: options.maxResults || 64 });
    });
  }

  function glossForSegments(segs){
    return (segs || []).map(s => s.gloss || (s.source === 'unknown' ? '?' : s.form)).filter(Boolean).join('-');
  }

  function generateWords(state, options={}){
    const normalized = normalizeState(state);
    const engine = new PatternEngine(normalized, options);
    const gen = normalized.generator || {};
    const count = Math.max(1, Math.min(9999, Number(options.count || gen.count || 1)));
    const pattern = options.pattern != null ? cleanString(options.pattern, '') : cleanString(gen.pattern, '');
    const avoidDuplicates = options.avoidDuplicates != null ? options.avoidDuplicates : !!gen.avoidDuplicates;
    const capitalize = options.capitalize != null ? options.capitalize : !!gen.capitalize;
    const detectLexicon = options.detectLexicon != null ? options.detectLexicon : !!gen.detectLexicon;

    const rewriteRules = parseRewriteRules(normalized.advanced && normalized.advanced.rewrites, engine);
    const forbiddenRules = parseForbiddenRules(normalized.advanced && normalized.advanced.forbidden, engine);
    const filters = {
      starts: parsePositionFilters(normalized.advanced && normalized.advanced.starts, engine, 'starts'),
      contains: parsePositionFilters(normalized.advanced && normalized.advanced.contains, engine, 'contains'),
      ends: parsePositionFilters(normalized.advanced && normalized.advanced.ends, engine, 'ends')
    };

    const meanings = Array.isArray(options.meanings) ? options.meanings : [];
    const results = [];
    const seen = new Set();
    const stats = { attempts: 0, duplicates: 0, forbidden: 0, filters: 0, failed: 0, rewrites: 0, adjusted: 0, errors: [] };
    const target = meanings.length ? meanings.length : count;
    const maxAttempts = Math.max(2000, target * 350);

    while(results.length < target && stats.attempts < maxAttempts){
      stats.attempts++;
      let built;
      try {
        built = engine.generate(pattern, { mode: String(pattern).includes('..') ? 'name' : 'generate' });
      } catch(err){
        stats.failed++;
        if(stats.errors.length < 10) stats.errors.push(err.message || String(err));
        break;
      }
      if(!built || !built.ok){
        stats.failed++;
        if(built && built.reason && stats.errors.length < 10) stats.errors.push(built.reason);
        continue;
      }
      let word = cleanString(built.text, '');
      const segs = Array.isArray(built.segs) ? built.segs : [];
      try {
        const rewritten = applyRewriteRules(word, rewriteRules, engine);
        word = rewritten.word;
        if(rewritten.fired.length) stats.rewrites++;
        const forbiddenHits = violatesForbidden(word, forbiddenRules);
        if(forbiddenHits.length){ stats.forbidden++; continue; }
        const adjusted = applyLiteralPositionAdjustments(word, filters, engine, pattern);
        word = adjusted.word;
        if(adjusted.changed.length) stats.adjusted++;
        if(!passesAllPositionFilters(word, filters)){ stats.filters++; continue; }
        if(capitalize && word) word = word.charAt(0).toLocaleUpperCase() + word.slice(1);
        if(avoidDuplicates && seen.has(word)){ stats.duplicates++; continue; }
        seen.add(word);
        let analysis = null;
        if(detectLexicon) analysis = analyzeWord(word, normalized, { engine, maxResults: 24 });
        const gloss = meanings.length ? meanings[results.length] : '';
        results.push({ word, gloss, segs, analysis, rewrites: rewritten.fired, adjustments: adjusted.changed });
      } catch(err){
        stats.failed++;
        if(stats.errors.length < 10) stats.errors.push(err.message || String(err));
      }
    }
    stats.generated = results.length;
    stats.requested = target;
    stats.ruleErrors = [...rewriteRules, ...forbiddenRules, ...filters.starts, ...filters.contains, ...filters.ends]
      .filter(r => r.error)
      .map(r => `${r.raw}: ${r.error}`);
    return { results, stats, engine };
  }

  function normalizeRewriteCompat(text){
    return normalizeNewlines(text).split('\n').map(line => {
      const trimmed = line.trim();
      if(!trimmed || trimmed.startsWith('//')) return line;
      if(line.includes('=')) return line;
      const idx = line.indexOf('>');
      if(idx === -1) return line;
      return line.slice(0, idx) + '=' + line.slice(idx + 1);
    }).join('\n');
  }

  function objectMapToArray(value, keyName, valName){
    if(Array.isArray(value)) return value;
    if(!value || typeof value !== 'object') return null;
    return Object.entries(value).map(([key, val]) => {
      if(val && typeof val === 'object' && !Array.isArray(val)){
        const out = Object.assign({}, val);
        if(!out[keyName]) out[keyName] = key;
        if(valName && !out[valName] && typeof val.value === 'string') out[valName] = val.value;
        return out;
      }
      const out = {};
      out[keyName] = key;
      if(valName) out[valName] = String(val ?? '');
      return out;
    });
  }

  function parseLegacyFilterText(text){
    const out = { starts: [], contains: [], ends: [], unsupported: [] };
    for(let line of normalizeNewlines(text).split('\n')){
      line = line.trim();
      if(!line || line.startsWith('//')) continue;
      // Older Morf sometimes stored combined rules like [s- + a + -t].
      // Convert only the simple obvious parts; leave unusual rules disabled instead of
      // silently putting them in Contains and filtering out every generated word.
      line = line.replace(/^\[|\]$/g, '').trim();
      const plusParts = splitTopLevel(line, '+');
      const parts = [];
      for(const piece of plusParts){
        parts.push(...splitTopLevel(piece, ','));
      }
      let understoodAny = false;
      for(let part of (parts.length ? parts : [line])){
        part = part.replace(/^\(|\)$/g, '').trim();
        if(!part) continue;
        if(part.endsWith('-') && part.length > 1){
          out.starts.push(part.slice(0, -1).trim());
          understoodAny = true;
        } else if(part.startsWith('-') && part.length > 1){
          out.ends.push(part.slice(1).trim());
          understoodAny = true;
        } else if(!/[#_>]/.test(part)){
          out.contains.push(part.trim());
          understoodAny = true;
        } else {
          out.unsupported.push(part);
        }
      }
      if(!understoodAny) out.unsupported.push(line);
    }
    out.starts = uniqueList(out.starts);
    out.contains = uniqueList(out.contains);
    out.ends = uniqueList(out.ends);
    out.unsupported = uniqueList(out.unsupported);
    return out;
  }

  function normalizeAdvancedCompat(src, base){
    src = isPlainObject(src) ? src : {};
    const adv = isPlainObject(src.advanced) ? src.advanced : null;
    const oldAdv = isPlainObject(src.advancedSettings) ? src.advancedSettings
      : isPlainObject(src.settings) ? src.settings
      : {};

    // Important import fix: prefer Morf 2 advanced fields even when they are
    // intentionally empty. Also, do not auto-activate the old combined
    // advancedSettings.filters box. Older Morf used a different mini-language
    // there, and importing it as Contains/Starts/Ends could make generation
    // appear broken because every new word was filtered out.
    const rewritesRaw = adv && hasOwn(adv, 'rewrites') ? adv.rewrites
      : adv && hasOwn(adv, 'rewrite') ? adv.rewrite
      : firstCompatField(oldAdv, ['rewrites','rewrite'], base.advanced.rewrites);
    const rewrites = rewriteCompatText(rewritesRaw, base.advanced.rewrites);
    const forbidden = adv && hasOwn(adv, 'forbidden') ? cleanString(adv.forbidden)
      : firstCompatField(oldAdv, ['forbidden'], base.advanced.forbidden);
    const starts = adv && hasOwn(adv, 'starts') ? cleanString(adv.starts)
      : firstCompatField(oldAdv, ['filterStarts','starts'], '');
    const contains = adv && hasOwn(adv, 'contains') ? cleanString(adv.contains)
      : firstCompatField(oldAdv, ['filterContains','contains'], '');
    const ends = adv && hasOwn(adv, 'ends') ? cleanString(adv.ends)
      : firstCompatField(oldAdv, ['filterEnds','ends'], '');
    const legacyFilters = adv && hasOwn(adv, 'legacyFilters') ? cleanString(adv.legacyFilters)
      : cleanString(oldAdv.filters, '');

    return Object.assign({}, base.advanced, { rewrites, forbidden, starts, contains, ends, legacyFilters });
  }

  function normalizeGeneratorCompat(src, base){
    src = isPlainObject(src) ? src : {};
    const oldAdv = isPlainObject(src.advancedSettings) ? src.advancedSettings
      : isPlainObject(src.advanced) ? src.advanced
      : isPlainObject(src.settings) ? src.settings
      : {};
    const rawGen = isPlainObject(src.generator) ? src.generator : {};
    const gen = Object.assign({}, base.generator, rawGen);
    if(hasOwn(src, 'pattern') && !gen.pattern) gen.pattern = cleanString(src.pattern);
    if(hasOwn(src, 'generatorPattern')) gen.pattern = cleanString(src.generatorPattern);
    if(hasOwn(src, 'mainPattern')) gen.pattern = cleanString(src.mainPattern);
    if(hasOwn(rawGen, 'pattern')) gen.pattern = cleanString(rawGen.pattern);
    if(hasOwn(src, 'count') || hasOwn(src, 'wordCount') || hasOwn(src, 'genCount')) gen.count = Number(src.count || src.wordCount || src.genCount) || gen.count;
    if(hasOwn(rawGen, 'count') || hasOwn(rawGen, 'wordCount') || hasOwn(rawGen, 'genCount')) gen.count = Number(rawGen.count || rawGen.wordCount || rawGen.genCount) || gen.count;
    if(hasOwn(oldAdv, 'meaningsMode')) gen.meaningsMode = !!oldAdv.meaningsMode;
    if(hasOwn(oldAdv, 'meaningsText')) gen.meaningsText = cleanString(oldAdv.meaningsText);
    if(hasOwn(src, 'detectLexicon')) gen.detectLexicon = !!src.detectLexicon;
    if(hasOwn(src, 'avoidDuplicates')) gen.avoidDuplicates = !!src.avoidDuplicates;
    gen.count = Math.max(1, Math.min(9999, Number(gen.count || 100)));
    return gen;
  }

  function normalizePatternCompat(patterns, basePatterns){
    const rawList = patterns == null ? basePatterns : ensureArrayish(patterns);
    const list = rawList.length ? rawList : [];
    return list.flatMap(p => {
      if(typeof p === 'string'){
        const parsed = parseEntryLineMany(p, 'lex');
        return parsed.map(row => ({ id: uid('add'), letter: cleanRefName(row.form), name: cleanRefName(row.form), pattern: row.gloss }));
      }
      const letter = cleanRefName((p && (p.letter || p.variable || p.code || p.name)) || '');
      const pattern = cleanString(p && (p.pattern ?? p.value ?? p.expansion ?? p.forms ?? ''), '');
      return [{
        id: (p && p.id) || uid('add'),
        letter: letter || 'C',
        name: cleanString((p && p.name) || letter || 'Pattern'),
        pattern
      }];
    }).filter(p => p.letter && p.pattern);
  }


  function isWrappedBySingleBracketGroup(raw){
    const s = String(raw || '').trim();
    if(!s.startsWith('[') || !s.endsWith(']')) return false;
    return findMatchingBracket(s, 0, '[', ']') === s.length - 1;
  }

  function stripOuterNameGroup(raw){
    let s = String(raw || '').trim();
    while(isWrappedBySingleBracketGroup(s)) s = s.slice(1, -1).trim();
    return s;
  }

  function splitNameTopLevelUnits(left){
    const raw = String(left || '').trim();
    if(!raw) return [];
    const parts = [];
    let cur = '';
    let depthSquare = 0, depthRound = 0, quote = '';
    let sawTopCommaInThisUnit = false;
    for(let i = 0; i < raw.length; i++){
      const ch = raw[i];
      if(quote){ cur += ch; if(ch === quote) quote = ''; continue; }
      if(ch === '"' || ch === "'"){ quote = ch; cur += ch; continue; }
      if(ch === '[') depthSquare++;
      else if(ch === ']') depthSquare = Math.max(0, depthSquare - 1);
      else if(ch === '(') depthRound++;
      else if(ch === ')') depthRound = Math.max(0, depthRound - 1);
      if(ch === ',' && depthSquare === 0 && depthRound === 0) sawTopCommaInThisUnit = true;
      // In name syntax, a top-level slash before the nickname comma starts a new
      // parallel/source name unit. A slash after the comma belongs to the nickname list.
      if(ch === '/' && depthSquare === 0 && depthRound === 0 && !sawTopCommaInThisUnit){
        const piece = cur.trim();
        if(piece) parts.push(piece);
        cur = '';
        sawTopCommaInThisUnit = false;
      } else {
        cur += ch;
      }
    }
    const last = cur.trim();
    if(last) parts.push(last);
    return parts;
  }

  function splitNameMainAndNicknames(left){
    const raw = stripOuterNameGroup(left);
    if(!raw) return { main: '', nicknames: '' };
    let depthSquare = 0, depthRound = 0, quote = '';
    for(let i = 0; i < raw.length; i++){
      const ch = raw[i];
      if(quote){ if(ch === quote) quote = ''; continue; }
      if(ch === '"' || ch === "'"){ quote = ch; continue; }
      if(ch === '[') depthSquare++;
      else if(ch === ']') depthSquare = Math.max(0, depthSquare - 1);
      else if(ch === '(') depthRound++;
      else if(ch === ')') depthRound = Math.max(0, depthRound - 1);
      else if(ch === ',' && depthSquare === 0 && depthRound === 0){
        return { main: raw.slice(0, i).trim(), nicknames: raw.slice(i + 1).trim() };
      }
    }
    return { main: raw, nicknames: '' };
  }

  function normalizeNicknameSpec(spec){
    let s = String(spec || '').trim();
    if(!s) return '';
    if(s.startsWith('[') && !s.endsWith(']')) s += ']';
    s = stripOuterNameGroup(s);
    // Top-level commas inside nickname lists mean more nickname alternatives.
    // Slashes inside nickname lists remain nickname spelling variants/alternatives.
    const commaParts = splitTopLevel(s, ',').map(x => stripOuterNameGroup(x).trim()).filter(Boolean);
    return commaParts.join('/');
  }

  function parseNameEntryLineMany(line){
    const raw = String(line || '').trim();
    if(!raw || raw.startsWith('#') || raw.startsWith('//')) return [];
    const eq = raw.indexOf('=');
    const left = eq >= 0 ? raw.slice(0, eq).trim() : raw;
    let right = eq >= 0 ? raw.slice(eq + 1).trim() : '';
    const family = extractFamilyLinks(right);
    right = family.text;
    const parts = right.split('|').map(s => s.trim());
    const actual = parts[0] || '';
    const literal = parts[1] || '';
    const notes = parts[2] || '';
    const explicitNicknames = parts[3] || '';

    // Name syntax in 3.5:
    //   Jord[a/y]n = meaning                  one name entry with spelling variants
    //   Carolin(e) = meaning                  optional spelling pieces still work
    //   Isabella, Izzy/Issy = meaning         Izzy and Issy are nicknames
    //   [Isabella, Izzy]/Issy = meaning       Issy is a parallel/source name, not a nickname
    //   [Elizabeth,Lizzy,Liz/Lizz]/[[Elisabeth/Elsabet],Elsa] = meaning
    // A comma inside a name unit starts nickname forms. A top-level slash before that
    // comma starts another source-name unit with the same meaning.
    const units = splitNameTopLevelUnits(left);
    const out = [];
    for(const unit of units){
      const parsed = splitNameMainAndNicknames(unit);
      const main = stripOuterNameGroup(parsed.main);
      if(!main) continue;
      const commaNicknames = normalizeNicknameSpec(parsed.nicknames);
      const fieldNicknames = normalizeNicknameSpec(explicitNicknames);
      const nicknames = uniqueList([commaNicknames, fieldNicknames].filter(Boolean)).join('/');
      out.push({ id: uid('ne'), name: main, actual, literal, notes, nicknames, familyLinks: clone(family.links || []) });
    }
    return out;
  }

  function nameEntriesToText(entries){
    return (entries || []).map(e => {
      const left = [e.name || '', e.nicknames || ''].filter(Boolean).join(', ');
      const bits = [e.actual || e.gloss || e.meaning || '', e.literal || '', e.notes || ''];
      while(bits.length && !bits[bits.length - 1]) bits.pop();
      const links = formatFamilyLinks(e.familyLinks || []);
      if(links && bits.length) bits[0] = [bits[0], links].filter(Boolean).join(' ');
      else if(links) bits.push(links);
      return `${left}${bits.length ? ' = ' + bits.join(' | ') : ''}`;
    }).join('\n');
  }

  function textToNameEntries(text){
    const out = [];
    for(const line of normalizeNewlines(text).split('\n')) out.push(...parseNameEntryLineMany(line));
    return out.filter(e => e.name);
  }

  function normalizeNamesCompat(src, baseCategories){
    const raw = src == null ? baseCategories : ensureArrayish(src);
    return (raw.length ? raw : []).map(c => ({
      id: (c && c.id) || uid('name'),
      variable: cleanRefName((c && (c.variable || c.var || c.letter || c.code || c.name)) || 'N') || 'N',
      name: cleanString((c && c.name) || (c && c.variable) || 'Names'),
      type: cleanString(c && (c.type || c.kind || c.nameType), 'other'),
      entries: ensureArrayish(c && (c.entries || c.items || c.names)).flatMap(e => {
        if(typeof e === 'string') return parseNameEntryLineMany(e);
        const first = cleanString(e && (e.name ?? e.word ?? e.form ?? e.text ?? e.value ?? ''), '');
        const rawNicknames = Array.isArray(e && e.nicknames) ? e.nicknames.join(', ') : cleanString(e && (e.nicknames ?? e.nickname ?? ''), '');
        const actual = cleanString(e && (e.actual ?? e.meaning ?? e.gloss ?? e.definition ?? ''), '');
        const literal = cleanString(e && (e.literal ?? e.literalMeaning ?? e.analysis ?? ''), '');
        const notes = cleanString(e && (e.notes ?? e.note ?? ''), '');
        const line = [first, rawNicknames].filter(Boolean).join(', ') + (actual || literal || notes ? ' = ' + [actual, literal, notes].join(' | ') : '');
        const parsed = parseNameEntryLineMany(line);
        const existingFamily = Array.isArray(e && e.familyLinks) ? clone(e.familyLinks) : (Array.isArray(e && e.family) ? clone(e.family) : []);
        if(e && e.id && parsed[0]) parsed[0].id = e.id;
        if(existingFamily.length) parsed.forEach(row => { row.familyLinks = existingFamily.concat(row.familyLinks || []); });
        return parsed;
      }).filter(e => e.name)
    }));
  }

  function normalizeLexiconCompat(categories, baseCategories){
    const rawList = categories == null ? baseCategories : ensureArrayish(categories);
    const list = rawList.length ? rawList : [];
    return list.map(c => {
      const placement = normalizePlacementName(c && (c.placement || c.type || c.position || c.kind));
      const letter = cleanRefName((c && (c.letter || c.code || c.variable || c.name)) || 'L').toUpperCase() || 'L';
      const rawEntries = ensureArrayish(c && (c.entries || c.items || c.forms || c.words));
      return {
        id: (c && c.id) || uid('lex'),
        letter,
        name: cleanString((c && c.name) || letter || 'Lexicon'),
        placement,
        appliesWords: c && Object.prototype.hasOwnProperty.call(c, 'appliesWords') ? !!c.appliesWords : !(c && (c.onlyNames || c.nameOnly)),
        appliesNames: !!(c && (c.appliesNames || c.onlyNames || c.nameOnly)),
        entries: rawEntries.flatMap(e => {
          if(typeof e === 'string') return parseEntryLineMany(e, 'lex');
          const mapStyle = e && e._compatKey && e.form == null && e.word == null && e.text == null && e.value != null;
          const first = mapStyle ? cleanString(e._compatKey, '') : cleanString(e && (e.form ?? e.word ?? e.text ?? e.name ?? e.value ?? ''), '');
          const glossRaw = mapStyle ? cleanString(e.value, '') : cleanString(e && (e.gloss ?? e.meaning ?? e.label ?? e.definition ?? ''), '');
          const family = extractFamilyLinks(glossRaw);
          const existingFamily = Array.isArray(e && e.familyLinks) ? clone(e.familyLinks) : (Array.isArray(e && e.family) ? clone(e.family) : []);
          return splitEntryForms(first).map((form, idx) => ({
            id: (idx === 0 && e && e.id) ? e.id : uid('le'),
            form,
            gloss: family.text,
            familyLinks: existingFamily.concat(family.links || [])
          }));
        }).filter(e => e.form)
      };
    });
  }

  function normalizeVocabularyCompat(src, baseCategories){
    src = isPlainObject(src) ? src : {};
    const sourceCatsRaw = hasOwn(src, 'vocabularyCategories') ? src.vocabularyCategories
      : hasOwn(src, 'vocabCategories') ? src.vocabCategories
      : hasOwn(src, 'vocab') ? src.vocab
      : baseCategories;
    const sourceCats = ensureArrayish(sourceCatsRaw);
    const cats = sourceCats.map(c => ({
      id: (c && c.id) || uid('voc'),
      variable: cleanRefName((c && (c.variable || c.var || c.letter || c.code || c.name)) || 'v').toLowerCase() || 'v',
      name: cleanString((c && c.name) || (c && c.variable) || 'Vocabulary'),
      entries: ensureArrayish(c && (c.entries || c.items || c.words)).flatMap(e => {
        if(typeof e === 'string') return parseEntryLineMany(e, 'vocab');
        const mapStyle = e && e._compatKey && e.word == null && e.form == null && e.text == null && e.value != null;
        const first = mapStyle ? cleanString(e._compatKey, '') : cleanString(e && (e.word ?? e.form ?? e.text ?? e.name ?? e.value ?? ''), '');
        const glossRaw = mapStyle ? cleanString(e.value, '') : cleanString(e && (e.gloss ?? e.meaning ?? e.label ?? e.definition ?? ''), '');
        const family = extractFamilyLinks(glossRaw);
        const existingFamily = Array.isArray(e && e.familyLinks) ? clone(e.familyLinks) : (Array.isArray(e && e.family) ? clone(e.family) : []);
        return splitEntryForms(first).map((word, idx) => ({
          id: (idx === 0 && e && e.id) ? e.id : uid('ve'),
          word,
          gloss: family.text,
          familyLinks: existingFamily.concat(family.links || [])
        }));
      }).filter(e => e.word)
    }));

    const looseRaw = hasOwn(src, 'vocabulary') ? src.vocabulary
      : hasOwn(src, 'words') ? src.words
      : hasOwn(src, 'entries') ? src.entries
      : [];
    const looseEntries = ensureArrayish(looseRaw).flatMap(e => {
      if(typeof e === 'string') return parseEntryLineMany(e, 'vocab');
      const first = cleanString(e && (e.word ?? e.form ?? e.value ?? e.text ?? e.name ?? ''), '');
      const glossRaw = cleanString(e && (e.gloss ?? e.meaning ?? e.label ?? e.definition ?? ''), '');
      const family = extractFamilyLinks(glossRaw);
      const existingFamily = Array.isArray(e && e.familyLinks) ? clone(e.familyLinks) : (Array.isArray(e && e.family) ? clone(e.family) : []);
      return splitEntryForms(first).map((word, idx) => ({
        id: (idx === 0 && e && e.id) ? e.id : uid('ve'),
        word,
        gloss: family.text,
        familyLinks: existingFamily.concat(family.links || [])
      }));
    }).filter(e => e.word);
    if(looseEntries.length){
      let target = cats.find(c => c.variable === 'other') || cats.find(c => c.name && /other|import/i.test(c.name));
      if(!target){
        target = { id: uid('voc'), variable: 'other', name: 'Imported vocabulary', entries: [] };
        cats.push(target);
      }
      target.entries = target.entries.concat(looseEntries);
    }
    return cats;
  }

  function normalizeState(input){
    const base = clone(DEFAULT_STATE);
    let src = isPlainObject(input) ? input : {};
    for(const key of ['state','settings','data','morf','project']){
      if(isPlainObject(src[key]) && (src[key].categories || src[key].lexiconCategories || src[key].additionalPatterns || src[key].advancedSettings || src[key].vocabularyCategories || src[key].generator)){
        src = src[key];
        break;
      }
    }
    const out = clone(base);
    const legacyFilters = parseLegacyFilterText((src.advancedSettings && src.advancedSettings.filters) || '');
    const importWarnings = [];
    if(src.advancedSettings && src.advancedSettings.filters){
      importWarnings.push('Old combined output filters were imported into Legacy filters but left disabled so they cannot block generation. Re-add them in Starts/Contains/Ends if you still want them.');
    }
    out.meta = Object.assign({}, base.meta, isPlainObject(src.meta) ? src.meta : {}, { app: 'Morf', importWarnings });
    out.generator = normalizeGeneratorCompat(src, base);
    out.advanced = normalizeAdvancedCompat(src, base);
    out.font = Object.assign({}, base.font, isPlainObject(src.font) ? src.font : {});
    const hasImportShape = !!(src.categories || src.lexiconCategories || src.additionalPatterns || src.vocabularyCategories || src.advancedSettings || src.vocabulary || src.words || src.entries || src.generator);
    out.additionalPatterns = normalizePatternCompat(src.additionalPatterns ?? src.patterns ?? src.graphemePatterns, base.additionalPatterns);
    out.lexiconCategories = normalizeLexiconCompat(src.lexiconCategories ?? src.categories ?? src.dictionaryCategories ?? src.wordCategories, base.lexiconCategories);
    out.vocabularyCategories = normalizeVocabularyCompat(src, base.vocabularyCategories);
    // Version 2 Morf exports do not have Names. Treat missing names as an empty Names list
    // for imported projects, while keeping starter Names for a true fresh/default state.
    const importedNames = (src.nameCategories ?? src.names ?? src.nameCategories);
    out.nameCategories = normalizeNamesCompat(importedNames, importedNames == null && hasImportShape ? [] : (base.nameCategories || []));
    return out;
  }

  function exportState(state){
    const out = normalizeState(state);
    out.meta = Object.assign({}, out.meta, { app: 'Morf', version: VERSION, exportedAt: new Date().toISOString() });
    return JSON.stringify(out, null, 2);
  }

  function importObjectHasPattern(src){
    if(!isPlainObject(src)) return false;
    if(isPlainObject(src.generator) && hasOwn(src.generator, 'pattern')) return true;
    return hasOwn(src, 'pattern') || hasOwn(src, 'generatorPattern') || hasOwn(src, 'mainPattern');
  }

  function importObjectHasCount(src){
    if(!isPlainObject(src)) return false;
    if(isPlainObject(src.generator) && (hasOwn(src.generator, 'count') || hasOwn(src.generator, 'wordCount') || hasOwn(src.generator, 'genCount'))) return true;
    return hasOwn(src, 'count') || hasOwn(src, 'wordCount') || hasOwn(src, 'genCount');
  }

  function parseImportText(raw){
    let parsed;
    const text = String(raw || '').replace(/^\uFEFF/, '').trim();
    try {
      parsed = JSON.parse(text);
    } catch(err) {
      // Some old exports or copied files may wrap the JSON in extra text.
      // Try the largest brace-wrapped chunk before falling back to plain text.
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if(firstBrace >= 0 && lastBrace > firstBrace){
        try {
          parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
        } catch(_braceErr) {
          parsed = null;
        }
      }
      if(!parsed){
        // Best-effort imports for very old/plain text exports.
        // Awkwords-style text can be pasted/imported as subpatterns plus a pattern.
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const patterns = [];
        let mainPattern = '';
        const meanings = [];
        for(const line of lines){
          const pat = line.match(/^(?:pattern|main|generator)\s*[:=]\s*(.+)$/i);
          if(pat){ mainPattern = pat[1]; continue; }
          const assign = line.match(/^([A-Z][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/);
          if(assign){ patterns.push({ letter: assign[1], name: assign[1], pattern: assign[2] }); continue; }
          meanings.push(line);
        }
        parsed = patterns.length || mainPattern
          ? { additionalPatterns: patterns, generator: { pattern: mainPattern || '' } }
          : { advancedSettings: { meaningsText: meanings.join('\n') || text, meaningsMode: true } };
      }
    }
    return parsed;
  }

  function importState(text, options={}){
    const raw = String(text || '').trim();
    if(!raw) throw new Error('File is empty.');
    const parsed = parseImportText(raw);
    const normalized = normalizeState(parsed);
    const preserve = options && (options.preserveFrom || options.currentState || options.previousState);
    const info = {
      oldMorfLike: !!(isPlainObject(parsed) && (hasOwn(parsed, 'schemaVersion') || hasOwn(parsed, 'categories') || hasOwn(parsed, 'advancedSettings'))),
      preservedPattern: false,
      preservedCount: false
    };
    if(preserve){
      const prev = normalizeState(preserve);
      if(!importObjectHasPattern(parsed)){
        normalized.generator.pattern = prev.generator.pattern;
        info.preservedPattern = !!String(prev.generator.pattern || '').trim();
      }
      if(!importObjectHasCount(parsed)){
        normalized.generator.count = prev.generator.count;
        info.preservedCount = true;
      }
    }
    normalized.importInfo = info;
    if(normalized.meta && info.preservedPattern){
      const warnings = Array.isArray(normalized.meta.importWarnings) ? normalized.meta.importWarnings.slice() : [];
      warnings.unshift('The imported file did not contain a generator pattern, so Morf kept the pattern you already had typed.');
      normalized.meta.importWarnings = warnings;
    }
    return normalized;
  }

  const api = {
    VERSION,
    DEFAULT_STATE,
    DEFAULT_CORE_MEANINGS,
    ParseError,
    PatternParser,
    PatternEngine,
    normalizeState,
    exportState,
    importState,
    generateWords,
    analyzeWord,
    analyzeText,
    analyzeNameLiteral,
    glossForSegments,
    parseRewriteRules,
    applyRewriteRules,
    parseForbiddenRules,
    violatesForbidden,
    parsePositionFilters,
    applyLiteralPositionAdjustments,
    passesAllPositionFilters,
    buildTiles,
    splitTopLevel,
    splitList,
    stripAffixMarks,
    expandNameSpelling,
    expandGlossText,
    entryMeanings,
    entryGloss,
    extractFamilyLinks,
    formatFamilyLinks,
    textToEntries,
    entriesToText,
    textToNameEntries,
    nameEntriesToText,
    uid,
    clone
  };

  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MorfCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
