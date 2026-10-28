// Renders SKILL.md bodies safely. Raw HTML in the markdown is shown as text
// (skills use things like <mod>/<feat> outside code spans), and relative links
// are pointed at the right page or raw file on this site.
import { Marked } from 'marked';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function makeMarked(skillName, skillNames) {
  const known = new Set(skillNames);
  const rewrite = (href) => {
    if (!href || /^(https?:|mailto:|#)/.test(href)) return href;
    // ../other-skill/SKILL.md  ->  /skill/other-skill/
    const m = href.match(/^\.\.\/([a-z0-9._-]+)\/SKILL\.md(#.*)?$/);
    if (m && known.has(m[1])) return `/skill/${m[1]}/`;
    if (href.startsWith('../')) {
      const rest = href.slice(3);
      const [first] = rest.split('/');
      if (known.has(first)) return `/skills/${rest}`;
      return href;
    }
    return `/skills/${skillName}/${href.replace(/^\.\//, '')}`;
  };
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      html({ text }) {
        return escapeHtml(text);
      },
    },
    walkTokens(token) {
      if (token.type === 'link' || token.type === 'image') token.href = rewrite(token.href);
    },
  });
  return marked;
}

/** Full markdown document. */
export function renderMarkdown(md, skillName, skillNames) {
  return makeMarked(skillName, skillNames).parse(md);
}

/** One line of inline markdown (backticks, bold), HTML escaped. */
export function renderInline(md) {
  const marked = new Marked();
  marked.use({ renderer: { html: ({ text }) => escapeHtml(text) } });
  return marked.parseInline(md || '');
}
