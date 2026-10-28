// Lesson page behaviour: reading progress, table-of-contents highlight,
// code copy buttons, ts/python tabs and the self-check quiz.

function readingProgress() {
  const bar = document.querySelector('[data-read-bar]');
  const body = document.querySelector('.lesson-body');
  if (!bar || !body) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    const r = body.getBoundingClientRect();
    const total = r.height - window.innerHeight * 0.6;
    const pct = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
    bar.style.transform = `scaleX(${pct})`;
  };
  addEventListener('scroll', () => (raf ||= requestAnimationFrame(update)), { passive: true });
  addEventListener('resize', update);
  update();
}

function tocHighlight() {
  const links = new Map([...document.querySelectorAll('[data-toc]')].map((a) => [a.dataset.toc, a]));
  const sections = [...document.querySelectorAll('[data-section]')];
  if (!links.size || !sections.length) return;
  const setActive = (id) => {
    links.forEach((a, k) => {
      if (k === id) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  };
  // The current section is the last one whose top has passed 35% of the viewport.
  let raf = 0;
  const update = () => {
    raf = 0;
    const line = window.innerHeight * 0.35;
    let current = sections[0].id;
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s.id;
    setActive(current);
  };
  addEventListener('scroll', () => (raf ||= requestAnimationFrame(update)), { passive: true });
  update();
}

function copyButtons() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.closest('.lc-code')?.querySelector('code')?.textContent || '';
      let ok = false;
      try {
        await navigator.clipboard.writeText(code);
        ok = true;
      } catch {
        // Fallback for browsers without async clipboard permission.
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
      }
      btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      btn.classList.toggle('done', ok);
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('done');
      }, 1600);
    });
  });
}

function codeTabs() {
  let pref = '';
  try { pref = localStorage.getItem('codegem:codeLang') || ''; } catch {}
  const groups = [...document.querySelectorAll('[data-code-tabs]')];
  const select = (group, i, focus) => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const panels = [...group.querySelectorAll('[role="tabpanel"]')];
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(j === i));
      t.tabIndex = j === i ? 0 : -1;
    });
    panels.forEach((p, j) => (p.hidden = j !== i));
    if (focus) tabs[i].focus();
  };
  groups.forEach((group) => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const startAt = Math.max(0, tabs.findIndex((t) => t.dataset.lang === pref));
    select(group, startAt);
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => {
        // Remember the language and apply it to every tab group on the page.
        try { localStorage.setItem('codegem:codeLang', t.dataset.lang || ''); } catch {}
        groups.forEach((g) => {
          const k = [...g.querySelectorAll('[role="tab"]')].findIndex((x) => x.dataset.lang === t.dataset.lang);
          if (k >= 0) select(g, k, g === group);
        });
      });
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const k = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[k].click();
      });
    });
  });
}

function selfCheck() {
  const list = document.querySelector('[data-sc-list]');
  if (!list) return;
  const items = [...list.querySelectorAll('[data-sc]')];
  const score = list.querySelector('[data-sc-score]');
  const results = new Map();
  const paintScore = () => {
    if (!score) return;
    if (results.size < items.length) {
      score.textContent = results.size ? `${results.size} of ${items.length} answered` : '';
      return;
    }
    const right = [...results.values()].filter(Boolean).length;
    score.textContent = right === items.length ? `All ${right} correct. You've got this one.` : `${right} of ${items.length} correct. Re-read the sections above, then try again.`;
  };
  items.forEach((item) => {
    const answer = Number(item.dataset.answer);
    const opts = [...item.querySelectorAll('.quiz-option')];
    const fb = item.querySelector('[data-sc-feedback]');
    const verdict = item.querySelector('[data-sc-verdict]');
    opts.forEach((btn, i) =>
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const right = i === answer;
        opts.forEach((o, j) => {
          o.disabled = true;
          o.setAttribute('aria-pressed', String(j === i));
          o.classList.toggle('is-correct', j === answer);
          o.classList.toggle('is-wrong', j === i && !right);
        });
        verdict.textContent = right ? 'Correct.' : 'Not quite. The highlighted answer is right.';
        item.classList.toggle('is-right', right);
        item.classList.toggle('is-miss', !right);
        fb.hidden = false;
        results.set(item, right);
        paintScore();
        item.querySelector('[data-sc-retry]').hidden = right;
      }),
    );
    item.querySelector('[data-sc-retry]')?.addEventListener('click', () => {
      opts.forEach((o) => {
        o.disabled = false;
        o.setAttribute('aria-pressed', 'false');
        o.classList.remove('is-correct', 'is-wrong');
      });
      item.classList.remove('is-right', 'is-miss');
      fb.hidden = true;
      results.delete(item);
      paintScore();
      opts[0].focus();
    });
  });
}

export function initLessonBody() {
  readingProgress();
  tocHighlight();
  copyButtons();
  codeTabs();
  selfCheck();
}
