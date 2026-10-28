// Markdown rendering for Learn lessons and practice answers (build time only).
// - Raw HTML in content is shown as text, never injected.
// - `> [!tip|warning|note] Title` blockquotes become .callout boxes.
// - Fenced code gets a language label and a copy button; a ts block directly
//   followed by a python block (or the reverse) becomes a tab switch.
// - The lesson body is split into its `##` sections for the table of contents.
import { Marked } from 'marked';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const LANG = { ts: 'TypeScript', typescript: 'TypeScript', js: 'JavaScript', javascript: 'JavaScript', python: 'Python', py: 'Python', sql: 'SQL', json: 'JSON', markdown: 'Markdown', md: 'Markdown', text: 'Text', bash: 'Shell', sh: 'Shell', yaml: 'YAML' };
const TAB_LANG = { ts: 'ts', typescript: 'ts', python: 'py', py: 'py' };
const CALLOUT = /^\[!(tip|warning|note)\][ \t]*([^\n]*)\n?([\s\S]*)$/i;
const CALLOUT_LABEL = { tip: 'Tip', warning: 'Warning', note: 'Note' };

export function langLabel(lang) {
  const l = (lang || '').trim().toLowerCase();
  return LANG[l] || (l ? l.toUpperCase() : 'Code');
}

function codeBlock(text, lang) {
  const label = langLabel(lang);
  return `<div class="lc-code" data-lang="${esc((lang || '').toLowerCase())}"><div class="lc-code-head"><span>${esc(label)}</span><button class="lc-copy" type="button" data-copy aria-label="Copy ${esc(label)} code">Copy</button></div><pre class="codeblock"><code>${esc(text)}</code></pre></div>`;
}

function makeMarked({ headingShift = 0 } = {}) {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      html({ text }) {
        return esc(text);
      },
      code({ text, lang }) {
        return codeBlock(text, lang);
      },
      heading({ tokens, depth }) {
        const d = Math.min(6, depth + headingShift);
        return `<h${d}>${this.parser.parseInline(tokens)}</h${d}>\n`;
      },
      table(token) {
        // Default table markup, wrapped so wide tables scroll instead of the page.
        const head = token.header.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = token.rows
          .map((r) => `<tr>${r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`)
          .join('');
        return `<div class="lc-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
      blockquote(token) {
        const first = token.tokens[0];
        const m = first && first.type === 'paragraph' ? first.text.match(CALLOUT) : null;
        if (!m) return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`;
        const kind = m[1].toLowerCase();
        const title = m[2].trim() || CALLOUT_LABEL[kind];
        const rest = m[3].trim();
        const firstPara = rest ? `<p>${inline.parseInline(rest)}</p>` : '';
        return `<div class="callout ${kind}" role="note"><p class="callout-title">${inline.parseInline(title)}</p>${firstPara}${this.parser.parse(token.tokens.slice(1))}</div>\n`;
      },
    },
  });
  return marked;
}

const inline = new Marked();
inline.use({ renderer: { html: ({ text }) => esc(text) } });

const body = makeMarked();
const answer = makeMarked({ headingShift: 2 });

let tabSeq = 0;
function tabs(a, b) {
  const id = `code-${++tabSeq}`;
  const items = [a, b];
  const list = items
    .map((t, i) => `<button type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-lang="${esc(t.lang)}">${esc(langLabel(t.lang))}</button>`)
    .join('');
  const panels = items.map((t, i) => `<div role="tabpanel" id="${id}-p${i}" aria-labelledby="${id}-t${i}" data-panel="${i}">${codeBlock(t.text, t.lang)}</div>`).join('');
  return `<div class="lc-tabs" data-code-tabs><div class="lc-tablist" role="tablist" aria-label="Code language">${list}</div>${panels}</div>`;
}

/** Renders a markdown chunk, merging adjacent ts/python code blocks into tabs. */
function renderWithTabs(md) {
  const tokens = body.lexer(md);
  let html = '';
  let batch = [];
  const flush = () => {
    if (!batch.length) return;
    batch.links = tokens.links;
    html += body.parser(batch);
    batch = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'code') {
      let j = i + 1;
      while (tokens[j] && tokens[j].type === 'space') j++;
      const n = tokens[j];
      const a = TAB_LANG[(t.lang || '').toLowerCase()];
      const b = n && n.type === 'code' ? TAB_LANG[(n.lang || '').toLowerCase()] : null;
      if (a && b && a !== b) {
        flush();
        html += tabs(t, n);
        i = j;
        continue;
      }
    }
    batch.push(t);
  }
  flush();
  return html;
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Lesson body -> { intro, sections: [{ id, title, html, isInterview }] }.
 * Sections follow the fixed `##` headings from CONTENT_FORMAT.md.
 */
export function renderLesson(md) {
  // Split on `## ` lines that are outside fenced code blocks.
  const chunks = [{ title: null, lines: [] }];
  let fence = null;
  for (const line of md.split('\n')) {
    const f = line.match(/^(```+|~~~+)/);
    if (f) fence = fence ? (line.startsWith(fence) ? null : fence) : f[1];
    const h = !fence && line.match(/^## (.+)$/);
    if (h) chunks.push({ title: h[1].trim(), lines: [] });
    else chunks[chunks.length - 1].lines.push(line);
  }
  const [head, ...rest] = chunks;
  const introMd = head.lines.join('\n');
  const intro = introMd.trim() ? renderWithTabs(introMd) : '';
  const sections = rest.map((c) => ({ id: slugify(c.title), title: c.title, html: renderWithTabs(c.lines.join('\n')), isInterview: /^interview angle$/i.test(c.title) }));
  return { intro, sections };
}

/** Block markdown for answers and explanations (headings shifted down). */
export function renderMd(md) {
  return answer.parse(md || '');
}

/** One line of inline markdown, HTML escaped. */
export function renderInlineMd(md) {
  return inline.parseInline(String(md ?? ''));
}
