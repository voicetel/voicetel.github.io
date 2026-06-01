#!/usr/bin/env bash
# Fail the build if the HEAD commit message contains any assistant or
# IDE-automation fingerprint trailer. Defense-in-depth — Cursor's
# Co-authored-by trailer has slipped through repeatedly even with the
# setting disabled. Run before push, in lint chain, or in CI.
set -euo pipefail

# Pattern intentionally broad: catches Co-authored-by trailers, plain
# "claude" / "anthropic" / "cursoragent" / "generated with" prose, etc.
PATTERN='co-authored-by|cursoragent|anthropic|claude|generated[[:space:]]+(with|by)'

if ! git rev-parse --git-dir >/dev/null 2>&1; then
	echo "check-fingerprint: not in a git repository" >&2
	exit 0
fi

# git cat-file -p HEAD returns tree, parent, author, committer, blank
# line, then the commit message body. Strip the header so the pattern
# matches only the message and trailers — never the author/committer
# lines (which legitimately contain the maintainer's name).
MSG=$(git cat-file -p HEAD | awk 'BEGIN{h=1} /^$/{h=0; next} h==0{print}')

if printf '%s\n' "$MSG" | grep -qiE "$PATTERN"; then
	echo "check-fingerprint: FAIL — HEAD commit contains a forbidden trailer or assistant fingerprint." >&2
	echo "" >&2
	echo "Offending lines:" >&2
	printf '%s\n' "$MSG" | grep -inE "$PATTERN" >&2
	echo "" >&2
	echo "Rebuild the commit via git commit-tree per directives/git-commits.md before pushing." >&2
	exit 1
fi

echo "check-fingerprint: OK"
