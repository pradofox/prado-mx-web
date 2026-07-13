#!/usr/bin/env bash
#
# bump.sh — sube el cache-buster ?v=N de un asset en TODOS los .html.
#
# El sitio comparte un solo style.css (y varios .js) entre todas las páginas.
# El bug recurrente ha sido editar el asset pero olvidar subir el ?v= en
# alguna página → el navegador sirve una versión vieja cacheada y el layout
# se rompe. Este script sube la versión en todas las páginas de un golpe.
#
# Uso:
#   ./scripts/bump.sh style.css      # sube style.css?v=N -> v=N+1 en todo
#   ./scripts/bump.sh app.js
#   ./scripts/bump.sh admin.js
#
# Sólo funciona en macOS (usa `sed -i ''`). Corre desde cualquier ubicación.

set -euo pipefail

asset="${1:-}"
if [ -z "$asset" ]; then
  echo "Uso: ./scripts/bump.sh <asset>   (ej. style.css, app.js, admin.js)"
  exit 1
fi

# Raíz del repo = carpeta padre de este script.
cd "$(cd "$(dirname "$0")/.." && pwd)"

# Escapa el punto del nombre para el regex.
esc="$(printf '%s' "$asset" | sed 's/\./\\./g')"

# Versión más alta actual entre todas las páginas.
cur="$(grep -rhoE "${esc}\?v=[0-9]+" ./*.html 2>/dev/null | grep -oE '[0-9]+$' | sort -n | tail -1 || true)"
if [ -z "$cur" ]; then
  echo "No encontré referencias a ${asset}?v= en ningún .html"
  exit 1
fi

next=$((cur + 1))

count=0
for f in ./*.html; do
  if grep -qE "${esc}\?v=[0-9]+" "$f"; then
    sed -i '' -E "s|${esc}\?v=[0-9]+|${asset}?v=${next}|g" "$f"
    count=$((count + 1))
  fi
done

echo "${asset}: v${cur} -> v${next}  (actualizado en ${count} archivo(s) .html)"
echo "Recuerda: git commit + wrangler deploy + purge de cache después."
