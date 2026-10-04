#!/usr/bin/env bash
# One-time setup for the automated release pipeline (see docs/RELEASING.md).
#
# What this script does:
#   1. Checks that the GitHub CLI is signed in as an admin of the repository.
#   2. Stores your fine-grained GitHub token as the Actions secret RELEASE_TOKEN.
#      release-prepare.yml uses it only to push the version-bump commit to the protected develop branch.
#   3. Creates the release:patch, release:minor, and release:major labels.
#   4. Prints the npm trusted-publishing values. npm needs no token; you enter these values on npmjs.com.
#
# The token is read from a hidden prompt, checked, sent to GitHub on stdin, and never printed or saved.
#
# Usage: scripts/setup-release.sh [owner/repo]     (default: yi-john-huang/sdd-mcp)
set -euo pipefail

REPO="${1:-yi-john-huang/sdd-mcp}"
WORKFLOW="release-publish.yml"
PACKAGE="sdd-mcp-server"

fail() { printf 'Error: %s\n' "$1" >&2; exit 1; }
step() { printf '\n== %s\n' "$1"; }

command -v gh >/dev/null 2>&1 || fail "Install the GitHub CLI (https://cli.github.com), then run this script again."
gh auth status >/dev/null 2>&1 || fail "Sign in first with: gh auth login"

step "1. Check your access to $REPO"
login=$(gh api user --jq .login)
is_admin=$(gh api "repos/$REPO" --jq .permissions.admin)
[ "$is_admin" = "true" ] || fail "$login is not an admin of $REPO. The token must come from an admin, because only admins bypass develop's branch protection."
printf 'Signed in as %s (admin of %s).\n' "$login" "$REPO"

step "2. Create the GitHub token"
cat <<EOF
Create a fine-grained personal access token on this page:
  https://github.com/settings/personal-access-tokens/new

Use these settings:
  - Token name:         sdd-mcp release bump
  - Resource owner:     ${REPO%%/*}
  - Expiration:         your choice (set a reminder to rotate it)
  - Repository access:  Only select repositories -> $REPO
  - Permissions:        Repository permissions -> Contents -> Read and write
                        (Metadata: Read-only is added automatically. Add nothing else.)

Then copy the token. You paste it at the next prompt; the input stays hidden.
EOF

token=""
read -r -s -p "Paste the token: " token
printf '\n'
[ -n "$token" ] || fail "No token entered."

GH_TOKEN="$token" gh api "repos/$REPO" --jq .full_name >/dev/null 2>&1 \
  || { unset token; fail "The token cannot read $REPO. Check its repository access."; }
token_login=$(GH_TOKEN="$token" gh api user --jq .login 2>/dev/null || true)
if [ "$token_login" != "$login" ]; then
  unset token
  fail "The token belongs to '${token_login:-unknown}', not the admin account $login. Create the token while signed in as $login."
fi
# The API reports the account's role, not the token's own permissions, so write access
# cannot be confirmed without a test write. The first release pull request confirms it.
printf 'Token checked: it reads %s and belongs to admin %s.\n' "$REPO" "$login"
printf 'Make sure you granted Contents: Read and write. The first release pull request confirms the push.\n'

step "3. Store it as the RELEASE_TOKEN secret"
printf '%s' "$token" | gh secret set RELEASE_TOKEN --repo "$REPO"
unset token
gh secret list --repo "$REPO" | grep -q '^RELEASE_TOKEN' || fail "RELEASE_TOKEN does not appear in the secret list."
printf 'Stored RELEASE_TOKEN in %s. GitHub shows only its name and update time from now on.\n' "$REPO"

step "4. Create the release labels"
gh label create "release:patch" --repo "$REPO" --color 0E8A16 --description "Release as a patch version" --force >/dev/null
gh label create "release:minor" --repo "$REPO" --color FBCA04 --description "Release as a minor version" --force >/dev/null
gh label create "release:major" --repo "$REPO" --color D93F0B --description "Release as a major version" --force >/dev/null
printf 'Labels ready: release:patch, release:minor, release:major.\n'

step "5. Finish npm trusted publishing on npmjs.com (no token needed)"
cat <<EOF
npm publishing needs no secret. Link the package to the workflow once:
  1. Sign in to https://www.npmjs.com as a maintainer of $PACKAGE.
  2. Open https://www.npmjs.com/package/$PACKAGE/access
  3. Under "Trusted Publisher", choose GitHub Actions and enter:
       Organization or user:  ${REPO%%/*}
       Repository:            ${REPO#*/}
       Workflow filename:     $WORKFLOW
       Environment:           (leave empty)

Setup is complete after that step. The next develop -> master pull request starts the first automated release.
EOF
