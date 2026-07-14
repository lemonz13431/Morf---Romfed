# Morf 4.1

Morf is a browser-based language workshop for building words, names, morphemes, meanings, and dictionaries in one connected place. It can be used for conlangs, worldbuilding, fantasy/sci-fi names, fictional cultures, naming systems, tabletop settings, or any project where words and names should feel like they belong together.

Version 4.1 keeps the Version 4 Family / Related to links and adds **tilde shorthand** for variations and broader families. These are different from variations, synonyms, homonyms, and nicknames: a family link connects separate entries that are related, derived, named after, pluralized, adjectivalized, demonymic, or otherwise part of the same larger family.

## Running Morf

Open `index.html` in a browser, or host the full project folder on GitHub Pages/Netlify/etc. The full project uses these files together:

- `index.html`
- `styles.css` / `styles-4-0.css`
- `morf-core.js` / `morf-core-4-0.js`
- `app.js` / `app-4-0.js`
- `button-rescue.js` / `button-rescue-4-0.js`
- `tab-switcher.js` / `tab-switcher-4-0.js`
- `version-fix.js` / `version-fix-4-0.js`

There is also a backup all-in-one file: `morf_4_0_standalone.html`.

## The four main stores

### Additional Patterns

Additional Patterns are reusable sound or spelling patterns. They are usually uppercase variables like `C`, `V`, `N`, or `L`.

Example:

```text
C = p/t/k/s/m/n/l/r
V = a/e/i/o/u
```

A generator pattern like `CVC` can then make words like `pam`, `tuk`, or `ler`.

### Lexicon

Lexicon categories hold morphemes: prefixes, roots, suffixes, infixes, particles, stems, and other meaningful pieces. Each category has a letter code, like `P`, `R`, or `S`, and a placement rule.

Examples:

```text
pre- = before
sil = bird
-less = without
```

Lexicon entries can be used in generator patterns by writing the category letter.

### Vocabulary

Vocabulary categories hold whole words. They use dot variables like `.n.`, `.verb.`, or `.place.`.

Example:

```text
dog = type of animal
doglike = like a dog ;{V{Nouns}dog};
```

### Names

Names are proper nouns: people, places, titles, groups, deities, objects, and other worldbuilding names. They use double-dot variables like `..F..` or `..P..`.

Names can have spelling variations, nicknames, literal analysis, and family links.

Example:

```text
Isabella/Isabel, Bella/Belle/Isa = example personal name
Isabellatown = town named after Isabella ;{N{First names}Isabella};
```

## Generator syntax

- `C`, `V`, `P`, `R`, etc. expand Additional Patterns or Lexicon categories.
- `.n.` expands a whole Vocabulary word from the `n` category.
- `..F..` expands a whole Name from the `F` category.
- `/` separates alternatives.
- `[a/b]` is a required choice group.
- `(a/b)` is an optional group.
- `{n}` and `{min,max}` repeat the previous token or group.
- `<...>` captures generated output.
- `&`, `&1`, `&2`, etc. repeat captured output.
- `C!m,n` means generate `C` except `m` or `n`.

Examples:

```text
[CV]{2}
<CV>&
P R S
.n. S
..F.. ..L..
```

## Rewrites, forbidden sequences, and filters

Advanced generator settings include:

```text
ti=chi
nb=mb
<C>=&1&1
```

Forbidden sequences reject generated words that contain a blocked sequence. Filters check the final word as a whole string.

`$...$` forcing works for starts/ends filters. For example:

```text
Starts with: $pep$
```

Morf first tries to fit `pep` into the existing pattern; if that is not possible, it may prepend/append it.

## Variations, synonyms, homonyms, nicknames, and families

### Variations

Variations are multiple spellings/forms of the same entry.

```text
mor[o/u] = water
Carolin(e) = personal name
Joopemora/Jopemora = bakery
```

The dictionary shows the first expanded form as the main entry and the rest under **See variations**.

### Synonyms

Synonyms are separate vocabulary/lexicon entries with the exact same meaning.

```text
bri,feez = from
```

### Homonyms / additional meanings

A single form can have multiple meanings.

```text
jar = magic/dust
kyme = magic(al)
```

### Nicknames

For names, commas create nicknames.

```text
Isabella, Izzy/Issy = meaning
```

A slash at the top level creates another full name unit.

```text
[Isabella, Izzy]/Issy = meaning
```

### Families / Related to links

Family links connect separate entries that belong together but are not the same entry.

Format:

```text
;{ENTRYTYPE{CATEGORY}TARGET};
```

Entry types:

```text
L = Lexicon
V = Vocabulary
N = Names
```

Examples:

```text
peachy = describes a peach ;{V{Nouns}peach};
peaches = plural of peach ;{V{Nouns}peach};
Dariaville = town named after Daria ;{N{First names}Daria};
Dariaviller = demonym ;{N{Place names}Dariaville};
joopish = bread-like ;{L{Roots}joop};
```

The linked entry shows **Related to**, and the target entry shows **See family**.

Example dictionary behavior:

```text
Dariaviller
Demonym
Related to: Dariaville
```

And on `Dariaville`:

```text
See family
- Dariaviller
```

The category part is optional but useful when the same spelling exists in multiple places:

```text
;{N{Feminine names}Syn};
;{V{Nouns}peach};
;{L{R}joop};
```

The target can also use spelling expansion syntax:

```text
peachie-keen = playful phrase ;{V{Nouns}peach[y/ie]};
```

## Translator / Analyzer

The translator segments input into known Lexicon entries, Vocabulary entries, Name entries, and unknown chunks. It respects placement rules:

- Prefix/start items must be in the start zone.
- Middle/infix items must be inside.
- Suffix/end items must be in the end zone.
- Name-aware lexicon categories can apply only to names if configured that way.

Quoted spans stay literal:

```text
"New York"
```

## Dictionary

The Dictionary combines Lexicon, Vocabulary, and Names. It shows:

- main form
- meaning(s)
- entry type
- category
- variable/code
- placement/type
- variations
- additional meanings
- nicknames/source names
- related names
- family links

Click entries to edit or move them.

## Import/export

Morf exports `.morf` JSON files and can import `.morf`, `.json`, pasted JSON, and older Morf-style settings. Version 4.1 remains compatible with projects that do not have Names or Family links yet.


## Version 4.1 tilde shorthand

Morf 4.1 adds shorthand markers that can be used anywhere the pattern engine reads Morf syntax, including generator patterns, filters, rewrites, forbidden rules, and family-link targets.

- `form~` means “use the stored spelling variations for the entry that contains this form.” If `mor[o/u] = water` exists, then `moru~` can expand to `moro` or `moru`. If `k[i/y]me = magic` exists, then `kime~` can expand to `kime` or `kyme`.
- `form~~` means “use the broader family around this form.” It includes the entry itself, entries it is related to, and sibling entries that point to the same family target. For example, if `peachy` and `peaches` both point to `peach`, then `peachy~~` can find `peachy`, `peach`, and `peaches`.

This is useful when a stored entry has long variation syntax, but you want to refer to all its forms without retyping the whole thing.

Examples:

```text
Isabela~ CVNV
peachy keen = playful phrase ;{V{Adjectives}peachy~~};
Synfolk = people of Syn ;{N{Feminine names}Syn~};
```
