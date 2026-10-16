#!/usr/bin/env bash
# Copies the static site (which lives at the repo root so GitHub Pages can
# serve it directly) into www/, the only safe webDir Capacitor will accept
# (it refuses "." - the project root - outright, since copying that in
# would also sweep up node_modules, android/, .git, etc).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf www
mkdir -p www
cp index.html manifest.webmanifest sw.js www/
cp -r css js icons www/
