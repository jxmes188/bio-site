/* =========================================================
   Upload checks
   - realTypeMatches: the file's first bytes must match its extension
   - cleanSvg: SVGs are only accepted if they're plain drawings.
     Anything that could run code or load something from elsewhere
     (scripts, event handlers, links, styles, entities, foreign
     content) gets the whole file rejected rather than "fixed".
   ========================================================= */
const fs = require("fs");

function realTypeMatches(filePath, ext) {
  let b;
  try {
    const fd = fs.openSync(filePath, "r");
    b = Buffer.alloc(16);
    fs.readSync(fd, b, 0, 16, 0);
    fs.closeSync(fd);
  } catch { return false; }
  const ascii = (s, e) => b.toString("latin1", s, e);
  switch (ext) {
    case ".png": return b[0] === 0x89 && ascii(1, 4) === "PNG";
    case ".jpg": case ".jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case ".gif": return ascii(0, 4) === "GIF8";
    case ".webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case ".ico": return b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0;
    case ".cur": return b[0] === 0 && b[1] === 0 && b[2] === 2 && b[3] === 0;
    case ".svg": return true; // text; checked properly by cleanSvg
    case ".mp4": case ".m4a": return ascii(4, 8) === "ftyp";
    case ".webm": return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case ".mp3": return ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case ".ogg": return ascii(0, 4) === "OggS";
    case ".wav": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
    default: return false;
  }
}

const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "use", "symbol",
  "lineargradient", "radialgradient", "stop", "clippath", "mask", "pattern", "title", "desc", "text", "tspan",
  "filter", "fegaussianblur", "feoffset", "feblend", "fecolormatrix", "femerge", "femergenode", "feflood",
  "fecomposite", "fedropshadow", "femorphology"
]);
const BAD_VALUE = /javascript:|vbscript:|data:|expression\s*\(|@import|url\s*\(\s*['"]?\s*(?!#)/i;
const OK_ENTITIES = /&(?!(amp|lt|gt|quot|apos);)/;

/** Returns the cleaned SVG text, or null if the file isn't a safe, plain SVG. */
function cleanSvg(text) {
  let s = String(text).replace(/^﻿/, "");
  if (s.length > 200 * 1024) return null;
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?xml-stylesheet/i.test(s)) return null;
  s = s.replace(/<!--[\s\S]*?-->/g, "");               // comments are dropped
  s = s.replace(/^\s*<\?xml[^?]*\?>/i, "");             // plain xml header is fine
  if (/<!--|<\?/.test(s)) return null;                  // unclosed comment / other processing instruction
  if (!/^\s*<svg[\s>]/i.test(s)) return null;

  const tags = s.match(/<[^>]*>/g) || [];
  // Every "<" must start a tag we looked at
  if ((s.match(/</g) || []).length !== tags.length) return null;

  for (const tag of tags) {
    const m = /^<\/?\s*([a-zA-Z][\w:-]*)/.exec(tag);
    if (!m || !SVG_TAGS.has(m[1].toLowerCase())) return null;
    if (tag.startsWith("</")) continue;
    // Attributes: name="value" or name='value' only
    const body = tag.slice(m[0].length).replace(/\/?>$/, "");
    const attrRe = /\s*([^\s=\/>"']+)\s*=\s*("[^"]*"|'[^']*')/y;
    let pos = 0;
    while (pos < body.length) {
      if (/^\s*$/.test(body.slice(pos))) break;
      attrRe.lastIndex = pos;
      const a = attrRe.exec(body);
      if (!a) return null;                              // unquoted or odd attribute
      pos = attrRe.lastIndex;
      const name = a[1].toLowerCase();
      const value = a[2].slice(1, -1);
      if (name.startsWith("on")) return null;
      if (name === "href" || name.endsWith(":href")) { if (!/^#[\w-]+$/.test(value)) return null; }
      if (BAD_VALUE.test(value) || OK_ENTITIES.test(value)) return null;
    }
  }
  // Text between tags can't hold entities that decode into markup
  if (OK_ENTITIES.test(s.replace(/<[^>]*>/g, ""))) return null;
  return s.trim();
}

module.exports = { realTypeMatches, cleanSvg };
