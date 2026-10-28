import { installCommand } from '../lib/commands.js';

export const origin = () => window.location.origin;

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* private mode etc. */
  }
}

/** Rewrites every install command on the page with this site's real origin. */
export function renderCommands(root = document) {
  root.querySelectorAll('[data-install]').forEach((el) => {
    const args = (el.getAttribute('data-args') || '').split(' ').filter(Boolean);
    el.textContent = installCommand(el.getAttribute('data-os'), origin(), args);
  });
}

function setOs(os) {
  document.documentElement.dataset.os = os;
  document.querySelectorAll('[data-os-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.osTab === os)));
  store('cg-os', os);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Fades [data-reveal] elements in as they scroll into view (motion only). */
function initReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!document.documentElement.classList.contains('motion') || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  els.forEach((el) => io.observe(el));
}

let live;
/** Screen-reader announcement (copy feedback etc.). */
function announce(msg) {
  if (!live) {
    live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
  }
  live.textContent = '';
  setTimeout(() => (live.textContent = msg), 30);
}

/** "/" or Cmd/Ctrl+K focuses the skill search (or opens Browse with it focused). */
function initShortcuts() {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  document.querySelectorAll('[data-kbd-hint]').forEach((k) => (k.textContent = mac ? '\u2318K' : '/'));
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const isK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k';
    const isSlash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing;
    if (!isK && !isSlash) return;
    e.preventDefault();
    const q = document.getElementById('q');
    if (q) {
      q.focus();
      q.select();
    } else {
      window.location.href = '/browse/#q';
    }
  });
}

/** Mobile menu: the nav collapses behind a button on narrow screens. */
function initMenu() {
  const btn = document.getElementById('menu-toggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('menu-open', open);
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      set(false);
      btn.focus();
    }
  });
  matchMedia('(min-width: 1080px)').addEventListener('change', (e) => e.matches && set(false));
}

export function initSite() {
  renderCommands();
  initReveal();
  setOs(document.documentElement.dataset.os === 'windows' ? 'windows' : 'unix');

  document.addEventListener('click', async (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const tab = target.closest('[data-os-tab]');
    if (tab) {
      setOs(tab.dataset.osTab);
      return;
    }
    const btn = target.closest('.copy');
    if (btn) {
      const code = btn.parentElement && btn.parentElement.querySelector('code');
      if (!code) return;
      const ok = await copyText(code.textContent || '');
      const txt = btn.querySelector('.copy-txt') || btn;
      txt.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      btn.classList.toggle('done', ok);
      announce(ok ? 'Command copied to clipboard' : 'Copy failed. The command is selected; press Ctrl+C.');
      if (!ok) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        txt.textContent = 'Copy';
        btn.classList.remove('done');
      }, 1800);
    }
  });

  initShortcuts();
  initMenu();

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      store('cg-theme', next);
    });
  }
}
