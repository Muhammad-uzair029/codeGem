#!/usr/bin/env python3
"""usage.py — measure feature-loop token use from Claude Code transcripts.

Reads ~/.claude/projects/<encoded-project>/<session>.jsonl (main thread) and
<session>/subagents/*.jsonl (sub-agents). Read-only. Stdlib only.

  python3 -I usage.py                       # last 10 sessions that ran feature-loop, this project
  python3 -I usage.py --project ~/code/app  # another project
  python3 -I usage.py --any-project         # every project
  python3 -I usage.py --all-sessions        # include sessions that did not run feature-loop
  python3 -I usage.py --last 3 --detail     # biggest sub-agents per session

"input" = input + cache-write + cache-read tokens, i.e. everything the model
re-read that turn (cache reads are billed cheaper, but they are the volume that
grows with context size). "ctx/turn" is that number per assistant turn: when the
main thread's median climbs past ~150k, the coordinator is doing stage work
itself — see SKILL.md §Token budget.
"""
import argparse, glob, json, os, re, statistics
from datetime import datetime

ROOT = os.path.expanduser("~/.claude/projects")


def encode(path):
    return re.sub(r"[^A-Za-z0-9]", "-", os.path.abspath(os.path.expanduser(path)))


def ran_feature_loop(path):
    with open(path, errors="ignore") as fh:
        for line in fh:
            if "<command-name>/feature-loop</command-name>" in line:
                return True
            if '"Skill"' in line and "feature-loop" in line:
                try:
                    for c in json.loads(line)["message"]["content"]:
                        if c.get("type") == "tool_use" and c.get("name") == "Skill" \
                                and str(c.get("input", {}).get("skill", "")).endswith("feature-loop"):
                            return True
                except Exception:
                    pass
    return False


def scan(path):
    """Per-turn input sizes, output total, models, first user prompt."""
    seen, ctx, out, models, first = set(), [], 0, {}, ""
    with open(path, errors="ignore") as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except Exception:
                continue
            m = d.get("message") or {}
            if not first and d.get("type") == "user":
                c = m.get("content")
                if isinstance(c, list):
                    c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
                first = (c or "").replace("\n", " ")[:70]
            u = m.get("usage")
            mid = m.get("id")
            if d.get("type") != "assistant" or not u or (mid is not None and mid in seen):
                continue
            if mid is not None:  # streamed chunks of one message repeat its usage
                seen.add(mid)
            ctx.append(sum(u.get(k, 0) or 0 for k in
                           ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")))
            out += u.get("output_tokens", 0) or 0
            mod = m.get("model", "?")
            models[mod] = models.get(mod, 0) + 1
    return ctx, out, models, first


def k(n):
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.0f}k"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", default=os.getcwd())
    ap.add_argument("--any-project", action="store_true")
    ap.add_argument("--all-sessions", action="store_true")
    ap.add_argument("--last", type=int, default=10)
    ap.add_argument("--detail", action="store_true")
    a = ap.parse_args()

    proj = os.path.abspath(os.path.expanduser(a.project))
    if not a.any_project:  # sessions are filed under the dir claude was started in — walk up to find it
        home, start = os.path.expanduser("~"), proj
        while not os.path.isdir(f"{ROOT}/{encode(proj)}") and os.path.dirname(proj) != proj:
            proj = os.path.dirname(proj)
            if proj == home and start != home:  # never fall back to home-dir sessions
                proj = start
                break
        if not os.path.isdir(f"{ROOT}/{encode(proj)}"):
            proj = start
    pattern = f"{ROOT}/*/*.jsonl" if a.any_project else f"{ROOT}/{encode(proj)}/*.jsonl"
    files = []
    for f in sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True):  # newest first, stop early
        if a.all_sessions or ran_feature_loop(f):
            files.append(f)
            if len(files) >= a.last:
                break
    if not files:
        print(f"no matching sessions under {pattern}")
        return

    print(f"{'session':40} {'main in':>8} {'turns':>5} {'ctx/turn med/p90/max':>22} {'out':>6} | "
          f"{'subs':>4} {'sub in':>7} {'sub out':>7} {'main%':>5}")
    for f in files:
        ctx, out, _, _ = scan(f)
        if not ctx:
            continue
        subs = [(sp, *scan(sp)) for sp in glob.glob(f[:-6] + "/subagents/*.jsonl")]
        s_in = sum(sum(c) for _, c, *_ in subs)
        s_out = sum(o for _, _, o, *_ in subs)
        q = sorted(ctx)
        p90 = q[min(len(q) - 1, int(len(q) * 0.9))]
        when = datetime.fromtimestamp(os.path.getmtime(f)).strftime("%m-%d")
        name = f"{when} {os.path.basename(os.path.dirname(f))[-20:]}/{os.path.basename(f)[:8]}"
        share = sum(ctx) / max(1, sum(ctx) + s_in) * 100
        print(f"{name:40} {k(sum(ctx)):>8} {len(ctx):>5} "
              f"{k(statistics.median(q)) + '/' + k(p90) + '/' + k(q[-1]):>22} {k(out):>6} | "
              f"{len(subs):>4} {k(s_in):>7} {k(s_out):>7} {share:>4.0f}%")
        if a.detail and subs:
            mods = {}
            for _, _, _, m, _ in subs:
                for name_, n in m.items():
                    mods[name_] = mods.get(name_, 0) + n
            print(f"    sub-agent turns by model: {mods}")
            for sp, c, o, _, first in sorted(subs, key=lambda s: -sum(s[1]))[:5]:
                print(f"    {k(sum(c)):>7} in {len(c):>4} turns {k(o):>6} out | {first}")


if __name__ == "__main__":
    main()
