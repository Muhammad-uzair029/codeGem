#!/usr/bin/env bash
# Rule 17 [R/O]: CI/CD — pipelines must include security scanning.
. "$(dirname "$0")/_lib.sh"
RULE_ID=17; RULE_NAME="CI/CD security scanning"; RULE_TAGS="R/O"
header

CI_DIR="$REPO_ROOT/.github/workflows"
if [ ! -d "$CI_DIR" ]; then
  fail ".github/workflows/ missing — no CI to gate."
  finish
fi

sec_steps=0
for f in "$CI_DIR"/*.yml "$CI_DIR"/*.yaml; do
  [ -f "$f" ] || continue
  c=$(grep -InE "(trivy|snyk|gitleaks|trufflehog|semgrep|codeql|dependabot|grype|bandit|safety|npm audit|pnpm audit|pip-audit)" "$f" 2>/dev/null | wc -l | tr -d ' ')
  sec_steps=$((sec_steps + c))
done

if [ "$sec_steps" -eq 0 ]; then
  fail "no security scanner step (trivy/snyk/gitleaks/codeql/semgrep/bandit/audit) in .github/workflows/"
else
  pass "$sec_steps security scanner step(s) found in CI"
fi

finish
