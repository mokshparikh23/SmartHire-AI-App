/* SEGMENTATION 2026-08-30 ─────────────────────────────────────────────────────
   Language packs for the completeness scorer.

   A pack answers exactly one question about the LAST token of a fragment: can a
   sentence stop here? It never parses structure, and that is what lets the same
   mechanism work across word orders that have nothing else in common.

   English is SVO, so an unfinished sentence trails off on a function word — a
   preposition, an auxiliary, a determiner, a conjunction. "So what is" stops on
   "is", and nothing can follow a sentence that ends there.

   Hindi and Gujarati are SOV, so the shape is mirrored. The dangling tail is a
   POSTPOSITION, sitting after the noun it governs and still waiting for the verb
   — "C# me multiple inheritance ke baare me" stops on "me". And the complete
   tail is the sentence-final VERB, which English rarely has: "…ke baare me
   bataao" is finished precisely because "bataao" is there.

   So `completeTail` carries most of the weight in Hindi and Gujarati and almost
   none in English, where a question mark does that job instead. That asymmetry
   is why these are per-pack lists rather than one shared rule.

   ROMANIZED AND NATIVE ARE SEPARATE PACKS ON PURPOSE. Which one arrives is not
   a property of the speaker but of the transcription path that served the
   utterance, and both can appear inside one code-switched sentence.  */

const DEVANAGARI = /[ऀ-ॿ]/u
const GUJARATI   = /[઀-૿]/u
const LATIN      = /[a-z]/iu

/** Romanized Hindi/Gujarati function words — the marker set that identifies Hinglish. */
const HINGLISH_MARKERS = new Set([
  'me', 'mein', 'ka', 'ke', 'ki', 'ko', 'se', 'par', 'pe', 'hai', 'hain', 'kya',
  'kaise', 'kyun', 'kyu', 'kaun', 'kahan', 'kab', 'aur', 'ya', 'to', 'bhi',
  'nahi', 'nahin', 'wala', 'wali', 'kar', 'karo', 'karta', 'karte', 'karti',
  'batao', 'bataao', 'baare', 'bare', 'liye', 'jo', 'yeh', 'ye', 'woh', 'wo',
  'che', 'chhe', 'ane', 'nu', 'ni', 'no', 'ma', 'thi', 'etle', 'shu', 'kem',
])

/**
 * @typedef {object} LanguagePack
 * @property {string}      id
 * @property {RegExp}     [script]        cheap gate before match() is consulted
 * @property {Function}    match          (tokens) => 0..1 confidence
 * @property {Set<string>} danglingTail   tokens a sentence cannot stop on
 * @property {Set<string>} completeTail   tokens a sentence reliably stops on
 */

/** English — leans on rules 1–2 of the scorer; its completeTail is empty by design. */
const EN = {
  id: 'en',
  script: LATIN,
  match: (tokens) => {
    const hinglish = tokens.filter((t) => HINGLISH_MARKERS.has(t)).length
    // Latin text that is mostly Hinglish markers is not English, and letting
    // this pack vote on it would apply English tail rules to Hindi word order.
    return hinglish / Math.max(1, tokens.length) > 0.25 ? 0 : 0.6
  },
  danglingTail: new Set([
    // auxiliaries and copulas
    'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
    'do', 'does', 'did', 'have', 'has', 'had',
    'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must',
    // determiners
    'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
    'her', 'its', 'our', 'their', 'some', 'any', 'each', 'every', 'both',
    // prepositions and particles
    'of', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'about', 'into',
    'over', 'under', 'between', 'through', 'during', 'against', 'within',
    'than', 'like', 'as', 'per', 'via', 'upon', 'onto',
    // conjunctions
    'and', 'or', 'but', 'so', 'if', 'because', 'while', 'whether', 'nor',
    // interrogatives and verbs that demand an object
    'what', 'how', 'why', 'when', 'where', 'who', 'whom', 'whose', 'which',
    'tell', 'explain', 'describe', 'define', 'give', 'show', 'compare',
    'mean', 'means', 'called', 'using', 'used',
    // degree words that cannot close a clause
    'very', 'more', 'most', 'much', 'many', 'such', 'also', 'just', 'quite',
  ]),
  completeTail: new Set(),
}

/** Hindi in Devanagari. */
const HI = {
  id: 'hi',
  script: DEVANAGARI,
  match: (tokens) => (tokens.some((t) => DEVANAGARI.test(t)) ? 1 : 0),
  danglingTail: new Set([
    // postpositions — the SOV mirror of an English preposition
    'के', 'का', 'की', 'को', 'से', 'में', 'मे', 'पर', 'पे', 'तक', 'लिए', 'द्वारा',
    'बारे', 'साथ', 'बिना', 'बाद', 'पहले', 'अंदर', 'ऊपर', 'नीचे', 'बीच',
    // conjunctions and connectives
    'और', 'या', 'तो', 'फिर', 'जैसे', 'अगर', 'लेकिन', 'क्योंकि', 'जो', 'कि',
    'तथा', 'एवं', 'परंतु', 'मतलब', 'यानी',
    // interrogatives waiting on a verb
    'क्या', 'कैसे', 'क्यों', 'कौन', 'कहाँ', 'कहां', 'कब', 'कितना', 'कितने',
  ]),
  completeTail: new Set([
    // sentence-final verbs and imperatives — what actually closes an SOV clause
    'बताओ', 'बताइए', 'बताएं', 'बताइये', 'बतायें',
    'समझाओ', 'समझाइए', 'समझाएं', 'कहो', 'कहिए', 'बोलो', 'बोलिए',
    'करो', 'कीजिए', 'करिए', 'दीजिए', 'दो', 'लीजिए',
    'है', 'हैं', 'था', 'थी', 'थे', 'हूँ', 'हूं', 'हो', 'होगा', 'होगी', 'होंगे',
    'चाहिए', 'सकता', 'सकती', 'सकते', 'गया', 'गयी', 'गए', 'रहा', 'रही', 'रहे',
  ]),
}

/** Gujarati in Gujarati script. */
const GU = {
  id: 'gu',
  script: GUJARATI,
  match: (tokens) => (tokens.some((t) => GUJARATI.test(t)) ? 1 : 0),
  danglingTail: new Set([
    'માં', 'ને', 'થી', 'નો', 'ની', 'નું', 'ના', 'નાં', 'પર', 'સુધી', 'માટે',
    'વિશે', 'સાથે', 'વગર', 'પછી', 'પહેલાં', 'ઉપર', 'નીચે', 'વચ્ચે', 'દ્વારા',
    'અને', 'અથવા', 'તો', 'જેમ', 'એટલે', 'પણ', 'કારણ', 'કે', 'મતલબ',
    'શું', 'કેમ', 'કેવી', 'કેવું', 'કોણ', 'ક્યાં', 'ક્યારે', 'કેટલું',
  ]),
  completeTail: new Set([
    'બતાવો', 'સમજાવો', 'કહો', 'બોલો', 'કરો', 'આપો', 'જણાવો',
    'છે', 'છો', 'છું', 'છીએ', 'હતું', 'હતી', 'હતા', 'હશે', 'જોઈએ',
    'શકે', 'શકાય', 'ગયું', 'રહ્યું', 'રહી', 'થાય', 'થશે',
  ]),
}

/** Romanized Hindi/Gujarati, and the code-switched mix this product mostly hears. */
const HINGLISH = {
  id: 'hinglish',
  script: LATIN,
  match: (tokens) => {
    const hits = tokens.filter((t) => HINGLISH_MARKERS.has(t)).length
    if (!hits) return 0
    return Math.min(1, 0.4 + (hits / Math.max(1, tokens.length)) * 1.5)
  },
  danglingTail: new Set([
    // romanized postpositions
    'ka', 'ke', 'ki', 'ko', 'se', 'me', 'mein', 'par', 'pe', 'tak', 'liye',
    'baare', 'bare', 'saath', 'sath', 'bina', 'baad', 'pehle', 'andar', 'beech',
    // Romanization collides across the two languages, so three Gujarati
    // postpositions are deliberately absent: 'thi' is also Hindi "was" (and is
    // in completeTail below), 'na' is the Hindi tag particle that ENDS a
    // question, and 'no' is English. Each would have held a finished sentence.
    'ma', 'ne', 'ni', 'nu', 'sudhi', 'mate', 'vishe',
    // connectives
    'aur', 'ya', 'to', 'phir', 'jaise', 'agar', 'lekin', 'kyunki', 'kyoki',
    'jo', 'ki', 'matlab', 'yaani', 'yani', 'ane', 'athva', 'etle', 'pan',
    // interrogatives still waiting on their verb
    'kya', 'kaise', 'kyun', 'kyu', 'kaun', 'kahan', 'kab', 'kitna', 'kitne',
    'shu', 'kem', 'kevi', 'kone', 'kyare',
  ]),
  completeTail: new Set([
    'batao', 'bataao', 'bataiye', 'bataye', 'batayein', 'bolo', 'boliye',
    'samjhao', 'samjhaiye', 'samjao', 'samjavo', 'kaho', 'kahiye',
    'karo', 'kariye', 'kijiye', 'do', 'dijiye', 'janavo', 'aapo',
    'hai', 'hain', 'tha', 'thi', 'the', 'hoga', 'hogi', 'honge',
    'chahiye', 'sakta', 'sakti', 'sakte', 'raha', 'rahi', 'rahe',
    'che', 'chhe', 'chho', 'hatu', 'hase', 'joie', 'thay', 'thashe',
  ]),
}

export const BUILTIN_PACKS = [EN, HI, GU, HINGLISH]
