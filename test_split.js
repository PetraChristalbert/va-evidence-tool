const text = "Prefix Memorandum in Support of a Supplemental Claim Cond1 Links Memorandum in Support of a Supplemental Claim Cond2 Links";
const chunkRegex = /(?=Memorandum\s+in\s+Support\s+of\s+(?:a\s+)?Supplemental\s+Claim)/gi;
const sections = text.split(chunkRegex);
console.log("Old mode sections:", sections.length);

const text2 = "Cond1 Medical Research / Scientific Literature Links Cond2 Medical Research / Scientific Literature Links";
const anchorRegex = /Medical\s+Research\s*\/\s*Scientific\s+Literature/gi;
const parts = text2.split(anchorRegex);
console.log("New mode parts:", parts.length);
