#!/usr/bin/env bash
#
# set-phone.sh — reemplaza un número de teléfono en TODOS los .html.
#
# El número de consulta (recepción de FeelGood) vive hardcodeado en
# ~11 lugares (links wa.me y tel:). Cuando FeelGood cambie de número,
# este script hace el swap completo en un comando.
#
# Uso:
#   ./scripts/set-phone.sh 528132446886 52NUEVONUMERO
#
# Formato: lada país + número, SIN el "1" legacy de México y sin
# espacios ni "+" (ej. 528112345678). Verifica antes en el navegador
# que https://wa.me/52NUEVONUMERO abre el chat correcto.

set -euo pipefail

old="${1:-}"
new="${2:-}"
if [ -z "$old" ] || [ -z "$new" ]; then
  echo "Uso: ./scripts/set-phone.sh <numero_viejo> <numero_nuevo>"
  echo "Ej.: ./scripts/set-phone.sh 528132446886 528112345678"
  exit 1
fi
if ! printf '%s' "$new" | grep -qE '^52[0-9]{10}$'; then
  echo "Ojo: '$new' no parece un número MX válido (esperado: 52 + 10 dígitos, sin el 1 legacy)."
  echo "Continúo de todos modos en 3s (Ctrl+C para abortar)..."
  sleep 3
fi

cd "$(cd "$(dirname "$0")/.." && pwd)"

total=0
for f in ./*.html; do
  n="$(grep -c "$old" "$f" 2>/dev/null || true)"
  if [ "$n" -gt 0 ]; then
    sed -i '' "s/${old}/${new}/g" "$f"
    echo "$f: $n reemplazo(s)"
    total=$((total + n))
  fi
done

if [ "$total" -eq 0 ]; then
  echo "No encontré '$old' en ningún .html. ¿Ya se cambió antes?"
  exit 1
fi

echo ""
echo "Total: $total reemplazos. Prueba https://wa.me/$new y luego:"
echo "  git add -A && git commit -m 'fix: nuevo numero de consulta' && git push && npx wrangler deploy"
