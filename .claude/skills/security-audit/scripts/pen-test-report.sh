#!/usr/bin/env bash
# End-to-end pen-test orchestrator.
# Runs every rule script in .claude/bin/NN-*.sh, captures output, maps findings to OWASP Top 10 (2021),
# and writes a markdown report to docs/security/pen-test-report-YYYY-MM-DD.md.
#
# Usage:
#   bash .claude/bin/pen-test-report.sh            # report → docs/security/
#   bash .claude/bin/pen-test-report.sh --stdout   # also print report to stdout
#
# Written for bash 3.2+ (macOS default). No associative arrays.

set -u
BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BIN_DIR/../../../.." && pwd)"
REPORT_DIR="$REPO_ROOT/docs/security"
DATE="$(date +%Y-%m-%d)"
TIME="$(date +%H:%M:%S%z)"
SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo no-git)"
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo no-git)"
REPORT_FILE="$REPORT_DIR/pen-test-report-$DATE.md"
ALSO_STDOUT=0
[ "${1:-}" = "--stdout" ] && ALSO_STDOUT=1

mkdir -p "$REPORT_DIR"

# Severity by rule id. Critical = direct RCE / auth bypass / data exfil.
severity_of() {
  case "$1" in
    04|06|14|15|22|23|27|30|31|35|38|41|42) echo "Critical" ;;
    01|05|07|08|09|11|13|16|17|20|21|24|25|26|28|32|33|34|36|37|40) echo "High" ;;
    02|18|29|39) echo "Medium" ;;
    03|10|12|19) echo "Low" ;;
    *) echo "Medium" ;;
  esac
}

# OWASP Top 10 2021 primary mapping.
owasp_of() {
  case "$1" in
    04|06|19|32) echo "A01" ;;
    22|26|27|28|40) echo "A02" ;;
    14|21|31|33|34|35) echo "A03" ;;
    13|18|37|41|42) echo "A04" ;;
    05|07|08|16|20|25|36) echo "A05" ;;
    24)                   echo "A06" ;;
    09|11|29|38)          echo "A07" ;;
    15|17|23)             echo "A08" ;;
    01|02|39)             echo "A09" ;;
    30)                   echo "A10" ;;
    *)                    echo "—"   ;;
  esac
}

owasp_name() {
  case "$1" in
    A01) echo "A01:2021 — Broken Access Control" ;;
    A02) echo "A02:2021 — Cryptographic Failures" ;;
    A03) echo "A03:2021 — Injection" ;;
    A04) echo "A04:2021 — Insecure Design" ;;
    A05) echo "A05:2021 — Security Misconfiguration" ;;
    A06) echo "A06:2021 — Vulnerable & Outdated Components" ;;
    A07) echo "A07:2021 — Identification & Authentication Failures" ;;
    A08) echo "A08:2021 — Software & Data Integrity Failures" ;;
    A09) echo "A09:2021 — Security Logging & Monitoring Failures" ;;
    A10) echo "A10:2021 — Server-Side Request Forgery (SSRF)" ;;
    *)   echo "—" ;;
  esac
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

INDEX="$TMP/index.tsv"
: > "$INDEX"

total=0; pass_n=0; warn_n=0; fail_n=0
crit=0; high=0; med=0; low=0

shopt -s nullglob
echo "Running 42-rule pen-test sweep…" >&2
for s in "$BIN_DIR"/[0-9][0-9]-*.sh; do
  base="$(basename "$s")"
  rid="${base%%-*}"
  total=$((total + 1))
  raw="$TMP/${rid}.out"
  NO_COLOR=1 TERM=dumb bash "$s" > "$raw" 2>&1
  ec=$?
  rname=$(grep -m1 -oE "\[Rule [0-9]+\] [^(]+" "$raw" 2>/dev/null | sed -E "s/^\[Rule [0-9]+\] //; s/ +$//")
  rtags=$(grep -m1 -oE "\([A-Z/]+\)$" "$raw" 2>/dev/null | tr -d '()')
  [ -z "$rname" ] && rname="(unnamed)"
  [ -z "$rtags" ] && rtags="-"
  if [ "$ec" -ne 0 ]; then
    status="FAIL"
    fail_n=$((fail_n + 1))
    case "$(severity_of "$rid")" in
      Critical) crit=$((crit + 1)) ;;
      High)     high=$((high + 1)) ;;
      Medium)   med=$((med + 1))   ;;
      Low)      low=$((low + 1))   ;;
    esac
  elif grep -q "with warnings" "$raw"; then
    status="WARN"; warn_n=$((warn_n + 1))
  else
    status="PASS"; pass_n=$((pass_n + 1))
  fi
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$rid" "$status" "$rname" "$rtags" "$(severity_of "$rid")" "$(owasp_of "$rid")" >> "$INDEX"
done

# Build verdict
verdict="PASS"
if [ "$crit" -gt 0 ] || [ "$high" -gt 0 ]; then
  verdict="FAIL"
elif [ "$med" -gt 0 ]; then
  verdict="PASS (with medium findings)"
fi

emit_owasp_row() {
  local oid="$1"
  local fails="" passes=""
  while IFS=$'\t' read -r rid status rname rtags sev rowasp; do
    [ "$rowasp" = "$oid" ] || continue
    if [ "$status" = "FAIL" ]; then
      fails="${fails}${rid} "
    else
      passes="${passes}${rid} "
    fi
  done < "$INDEX"
  local mark="✅ pass"
  [ -n "$fails" ] && mark="❌ fail"
  [ -z "$fails" ] && fails="—"
  [ -z "$passes" ] && passes="—"
  echo "| $(owasp_name "$oid") | $mark | $fails | $passes |"
}

{
  echo "# Penetration Test Report — claude-code-boilerplate"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| **Date** | $DATE $TIME |"
  echo "| **Branch** | \`$BRANCH\` |"
  echo "| **Commit** | \`$SHA\` |"
  echo "| **Methodology** | Static heuristic source-code audit (42-rule gate + OWASP Top 10 mapping) |"
  echo "| **Scope** | \`apps/\`, \`infra/\`, \`terraform/\`, \`.github/\`, root configs |"
  echo "| **Verdict** | **$verdict** |"
  echo
  echo "> ⚠️ This is an automated static-analysis pass, not a substitute for an external pen-test."
  echo "> It catches misconfigurations and dangerous code patterns. It does **not** exercise the running"
  echo "> application, fuzz inputs, attempt real exploits, or test business-logic flaws. Pair this gate"
  echo "> with dynamic testing (DAST), dependency scanning in CI, and an annual external review."
  echo
  echo "## Executive Summary"
  echo
  echo "- **$total** rules evaluated"
  echo "- **$pass_n** passed · **$warn_n** passed with warnings · **$fail_n** failed"
  echo "- Failure severity: **$crit Critical · $high High · $med Medium · $low Low**"
  echo
  if [ "$fail_n" -eq 0 ]; then
    echo "All 42 rules pass static analysis. Continue with dynamic testing, dependency scans in CI, and external review."
  else
    echo "$fail_n rule(s) failed. Top priority: resolve Critical and High findings before next release."
  fi
  echo
  echo "## Severity Legend"
  echo
  echo "| Severity | Meaning |"
  echo "|---|---|"
  echo "| Critical | Direct path to RCE, auth bypass, or data exfiltration. Block release. |"
  echo "| High     | Exploitable under common conditions or material defense-in-depth gap. |"
  echo "| Medium   | Defense-in-depth or information leak. Schedule for next sprint. |"
  echo "| Low      | Compliance / UX / process hygiene. Track in backlog. |"
  echo
  echo "## OWASP Top 10 (2021) Coverage"
  echo
  echo "| OWASP | Status | Failing rules | Passing rules |"
  echo "|---|---|---|---|"
  for oid in A01 A02 A03 A04 A05 A06 A07 A08 A09 A10; do
    emit_owasp_row "$oid"
  done
  echo
  echo "## Findings"
  echo
  if [ "$fail_n" -eq 0 ]; then
    echo "_No failing rules._"
  else
    echo "| Rule | Severity | OWASP | Tags | Title |"
    echo "|---|---|---|---|---|"
    while IFS=$'\t' read -r rid status rname rtags sev rowasp; do
      [ "$status" = "FAIL" ] || continue
      printf "| %s | %s | %s | %s | %s |\n" "$rid" "$sev" "$rowasp" "$rtags" "$rname"
    done < "$INDEX"
    echo
    echo "### Finding Details"
    while IFS=$'\t' read -r rid status rname rtags sev rowasp; do
      [ "$status" = "FAIL" ] || continue
      script_name="$(basename "$BIN_DIR"/${rid}-*.sh 2>/dev/null | head -1)"
      echo
      echo "#### $rid · $rname — $sev ($rowasp)"
      echo
      echo "**Tags:** $rtags  "
      echo "**Script:** \`.claude/bin/$script_name\`"
      echo
      echo "<details><summary>Scan output</summary>"
      echo
      echo '```'
      cat "$TMP/${rid}.out"
      echo '```'
      echo
      echo "</details>"
    done < "$INDEX"
  fi
  echo
  if [ "$warn_n" -gt 0 ]; then
    echo "## Warnings (advisory)"
    echo
    echo "| Rule | Tags | Title |"
    echo "|---|---|---|"
    while IFS=$'\t' read -r rid status rname rtags sev rowasp; do
      [ "$status" = "WARN" ] || continue
      printf "| %s | %s | %s |\n" "$rid" "$rtags" "$rname"
    done < "$INDEX"
    echo
  fi
  echo "## Methodology & Limitations"
  echo
  echo "- **Static analysis only.** No requests are sent to a running service. Logic flaws that require"
  echo "  runtime context (race conditions on shared state, business-logic abuse, deserialization gadgets"
  echo "  triggered by specific payloads) are out of scope."
  echo "- **Heuristic grep-based detection.** False positives and false negatives are possible. Every"
  echo "  failing finding includes raw scan output so an engineer can confirm."
  echo "- **No exploitation attempted.** This report flags dangerous patterns; whether each is reachable"
  echo "  from an untrusted input must be reviewed manually."
  echo "- **OWASP mapping is indicative**, not exhaustive. A single rule may relate to multiple"
  echo "  categories; the table picks the closest primary fit."
  echo
  echo "## Recommended Next Steps"
  echo
  echo "1. Resolve every **Critical** and **High** finding above; rerun \`make security-all\`."
  echo "2. Wire the gate into CI: fail the pipeline if \`make security-all\` exits non-zero (covers rule 17)."
  echo "3. Add dynamic analysis: dependency scanner (\`trivy\`/\`snyk\`/\`grype\`), SAST (\`semgrep\`/\`codeql\`),"
  echo "   secret scanner (\`gitleaks\`/\`trufflehog\`) on every PR."
  echo "4. Commission an external pen-test before launch and after major architectural changes."
  echo "5. Run a tabletop incident-response drill — \"what do we do when a finding becomes a real breach?\""
  echo
  echo "---"
  echo "_Generated by \`.claude/bin/pen-test-report.sh\`. Source rules under \`.claude/bin/NN-*.sh\`._"
} > "$REPORT_FILE"

echo "Report → $REPORT_FILE"
echo "Summary: $pass_n PASS · $warn_n WARN · $fail_n FAIL  (Critical:$crit High:$high Medium:$med Low:$low)"
echo "Verdict: $verdict"

if [ "$ALSO_STDOUT" -eq 1 ]; then
  echo
  echo "----- BEGIN REPORT -----"
  cat "$REPORT_FILE"
  echo "----- END REPORT -----"
fi

[ "$fail_n" -eq 0 ] || exit 1
