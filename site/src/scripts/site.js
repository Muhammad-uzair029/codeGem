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
      btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      btn.classList.toggle('done', ok);
      if (!ok) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('done');
      }, 1800);
    }
  });

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
