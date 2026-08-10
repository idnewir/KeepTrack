#!/bin/bash
# Generates fresh values for Keep Track's required security secrets
# (JWT_SECRET, MFA_ENCRYPTION_KEY) and prints them ready to paste into .env.
#
# Each run produces NEW random values — this does not print a fixed value,
# since a secret that's the same in every clone of this repo isn't a secret.
# Never commit the output of this script anywhere.
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
    echo "Error: openssl is required but not found on PATH." >&2
    exit 1
fi

PYTHON_BIN=""
for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
        PYTHON_BIN="$candidate"
        break
    fi
done
if [ -z "$PYTHON_BIN" ]; then
    echo "Error: python3 (with the 'cryptography' package) is required but not found on PATH." >&2
    exit 1
fi

JWT_SECRET="$(openssl rand -hex 32)"
MFA_ENCRYPTION_KEY="$("$PYTHON_BIN" -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"

echo "# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") — paste into your .env, then delete this output."
echo "JWT_SECRET=${JWT_SECRET}"
echo "MFA_ENCRYPTION_KEY=${MFA_ENCRYPTION_KEY}"
