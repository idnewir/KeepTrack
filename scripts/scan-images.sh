#!/bin/bash
# Scans the built Keep Track images for known vulnerabilities with Trivy.
# Build the images first (docker compose -f docker-compose.prod.yml build),
# then run this script. Does nothing destructive — read-only reporting.
set -euo pipefail

if ! command -v trivy >/dev/null 2>&1; then
    echo "Trivy is not installed. Install it first: https://aquasecurity.github.io/trivy/latest/getting-started/installation/" >&2
    exit 1
fi

echo "Scanning keeptrack-backend..."
trivy image --severity HIGH,CRITICAL keeptrack-backend:latest

echo "Scanning keeptrack-frontend..."
trivy image --severity HIGH,CRITICAL keeptrack-frontend:latest
