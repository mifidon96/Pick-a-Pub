#!/usr/bin/env bash
# One-off setup for a new AWS account. Run once, before the first deploy:
#
#   AWS_PROFILE=personal ./scripts/bootstrap.sh
#
# Creates the Terraform state bucket, the GitHub Actions roles and a budget
# alert (infra/bootstrap). If the GitHub CLI (gh) is installed and signed in, it
# also sets up the repo: the dev and prod environments, the account ID variable
# and the alert email secret. Safe to run again.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/infra/bootstrap"
REPO="mifidon96/Pick-a-Pub"

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }
export AWS_PAGER=""

for t in aws terraform; do command -v "$t" >/dev/null || fail "$t is not installed"; done

step "Checking AWS account"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)" || fail "not signed in to AWS (run: aws sso login)"
echo "Account: $ACCOUNT"
echo "Identity: $(aws sts get-caller-identity --query Arn --output text)"
read -r -p "Set up Pick-a-Pub in this account? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || fail "cancelled"

if [[ ! -f "$DIR/terraform.tfvars" ]]; then
  read -r -p "Email for budget and alarm alerts: " email
  [[ "$email" == *@*.* ]] || fail "that does not look like an email address"
  printf 'alert_email = "%s"\n' "$email" > "$DIR/terraform.tfvars"
fi
EMAIL="$(sed -n 's/^alert_email *= *"\(.*\)"/\1/p' "$DIR/terraform.tfvars")"

step "Creating the state bucket, GitHub roles and budget"
terraform -chdir="$DIR" init -input=false
terraform -chdir="$DIR" apply -input=false

step "Setting up GitHub"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh variable set AWS_ACCOUNT_ID --repo "$REPO" --body "$ACCOUNT"
  gh secret set ALERT_EMAIL --repo "$REPO" --body "$EMAIL"
  echo "Match listings need a free key from https://www.football-data.org/client/register"
  read -r -s -p "football-data.org API key (Enter to add it later): " fdkey; echo
  if [[ -n "$fdkey" ]]; then gh secret set FOOTBALL_DATA_API_KEY --repo "$REPO" --body "$fdkey"; fi
  ME="$(gh api user --jq .id)"
  # dev deploys straight away. prod waits for you to press Approve.
  # Both only accept deploys from the main branch.
  for env in dev prod; do
    if [[ "$env" == prod ]]; then
      reviewers="[{\"type\":\"User\",\"id\":$ME}]"
    else
      reviewers="[]"
    fi
    gh api -X PUT "repos/$REPO/environments/$env" --input - >/dev/null <<JSON
{"reviewers": $reviewers, "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
    gh api -X POST "repos/$REPO/environments/$env/deployment-branch-policies" -f name=main -f type=branch >/dev/null 2>&1 || true
    echo "Environment $env ready"
  done
else
  cat <<EOF
The GitHub CLI is not installed or not signed in, so do these by hand on
https://github.com/$REPO/settings:
  1. Secrets and variables > Actions > Variables: AWS_ACCOUNT_ID = $ACCOUNT
  2. Secrets and variables > Actions > Secrets:   ALERT_EMAIL = $EMAIL
     and FOOTBALL_DATA_API_KEY = <free key from football-data.org>
  3. Environments > New environment "dev"  (Deployment branches: main only)
  4. Environments > New environment "prod" (Required reviewers: you; Deployment branches: main only)
EOF
fi

step "Done"
echo "State bucket: $(terraform -chdir="$DIR" output -raw state_bucket)"
echo "Next: AWS_PROFILE=<profile> ./scripts/deploy.sh --env prod"
echo "Then merges to main deploy to dev automatically, and prod after you approve."
