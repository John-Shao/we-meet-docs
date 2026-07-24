#!/usr/bin/env bash
# Create or upgrade a Docs Django superuser in the running backend pod.
#
# This account is for signing in to the Docs Django admin site (/admin/) to
# manage users and administrative data. It is separate from the Keycloak SSO
# account used by normal Docs users.
#
# Usage:
#   bash deploy/aliyun-docs/create-superuser.sh
#   NAMESPACE=docs DEPLOYMENT=impress-docs-backend bash deploy/aliyun-docs/create-superuser.sh
#
# The email and password are read interactively and are never written to a file
# or included literally in the shell command history.
set -euo pipefail

NAMESPACE="${NAMESPACE:-docs}"
DEPLOYMENT="${DEPLOYMENT:-impress-docs-backend}"

command -v kubectl >/dev/null || {
  echo "ERROR: kubectl is required." >&2
  exit 1
}

kubectl -n "$NAMESPACE" get deployment "$DEPLOYMENT" >/dev/null || {
  echo "ERROR: deployment/$DEPLOYMENT was not found in namespace $NAMESPACE." >&2
  exit 1
}

echo "Waiting for deployment/$DEPLOYMENT to be ready..."
kubectl -n "$NAMESPACE" rollout status "deployment/$DEPLOYMENT" --timeout=120s

read -r -p "Administrator email: " ADMIN_EMAIL
[[ -n "$ADMIN_EMAIL" ]] || { echo "ERROR: email cannot be empty." >&2; exit 1; }

read -r -s -p "Administrator password: " ADMIN_PASSWORD
echo
read -r -s -p "Confirm password: " ADMIN_PASSWORD_CONFIRM
echo
[[ -n "$ADMIN_PASSWORD" ]] || { echo "ERROR: password cannot be empty." >&2; exit 1; }
[[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || {
  echo "ERROR: passwords do not match." >&2
  exit 1
}
unset ADMIN_PASSWORD_CONFIRM

kubectl -n "$NAMESPACE" exec -i "deployment/$DEPLOYMENT" -- \
  env "ADMIN_EMAIL=$ADMIN_EMAIL" "ADMIN_PASSWORD=$ADMIN_PASSWORD" \
  sh -ceu 'python manage.py createsuperuser --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD"'

unset ADMIN_EMAIL ADMIN_PASSWORD
echo "Superuser operation completed."
