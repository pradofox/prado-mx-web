#!/usr/bin/env python3
"""
nutricion.py — busca la ficha nutrimental de los productos de /super.

Fuentes: Soriana (primaria: su buscador acierta) y HEB (verificación
cruzada). Si las dos coinciden en los macros, la confianza es alta.

El modo de falla de estos buscadores NO es "no encontré": es devolverte
otro producto con toda seguridad (buscar "bachoco pechuga" en HEB regresa
shampoo). Por eso aquí nada se acepta sin puntaje de match, y todo entra
como borrador para que Hugo confirme.

Uso:
  python3 scripts/nutricion.py            # todos los pendientes
  python3 scripts/nutricion.py --limit 5  # prueba corta
  python3 scripts/nutricion.py --dry      # sin escribir SQL

Salida: scripts/nutricion.sql (para aplicar con wrangler d1 execute)
"""
import json, re, sys, time, unicodedata, urllib.parse, urllib.request, subprocess, os

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
PAUSA = 2.5   # respetuoso con los servidores

# ---------- utilidades ----------

def norm(s):
    """minúsculas, sin acentos, sin puntuación."""
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9 ]+', ' ', s)

STOP = {'de','la','el','los','las','con','sin','y','en','gr','g','ml','kg','pza','pzas','x'}

def tokens(s):
    return [t for t in norm(s).split() if t and t not in STOP and not t.isdigit()]

def get(url, timeout=30):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'ignore')

def num(v):
    """'8.3g' -> 8.3 ; '348 mg' -> 348 ; '343 Kcal' -> 343"""
    if not v: return None
    m = re.search(r'(\d+(?:[.,]\d+)?)', v.replace(',', '.'))
    return float(m.group(1)) if m else None

# ---------- Soriana ----------

def soriana_buscar(q):
    html = get("https://www.soriana.com/buscar?q=" + urllib.parse.quote(q))
    vistos, out = set(), []
    for href, slug in re.findall(r'href="(/([a-z0-9-]{6,90})/\d{6,9}\.html)"', html):
        if href in vistos: continue
        vistos.add(href)
        out.append(("https://www.soriana.com" + href, slug.replace('-', ' ')))
    return out[:8]

def soriana_ficha(url):
    """Ojo con dos trampas:
    - 'Otras Grasas' NO es la grasa total (son las insaturadas). El total
      vive en 'Grasas Totales'. Confundirlos mete cifras falsas.
    - Los valores son por 'Tamaño de la Porción', que suele ser 100g pero
      no siempre. Si no es 100g, lo anotamos en vez de asumir.
    - Productos frescos traen basura ('Proteínas = Pollo'); num() la filtra.
    """
    html = get(url)
    filas = re.findall(r'<td><b>([^<]+)</b></td>\s*<td>([^<]*)</td>', html)
    if not filas: return None
    d = {norm(k).strip(): v.strip() for k, v in filas}
    n = {}
    for clave, campo in [('proteinas','protein'), ('carbohidratos','carbs'),
                         ('azucares totales','sugar'), ('fibra','fiber'),
                         ('grasas totales','fat'), ('grasa saturada','sat'),
                         ('grasas trans','trans'), ('sodio','sodium'),
                         ('energia por porcion','kcal')]:
        if clave in d and num(d[clave]) is not None:
            n[campo] = num(d[clave])
    porcion = d.get('tamano de la porcion') or d.get('tamano de porcion')
    if porcion:
        n['basis'] = porcion
        # si la porción no es 100g, los números NO son por 100g: no mentimos
        if num(porcion) != 100:
            n['per_serving'] = True
    if d.get('ingredientes'): n['ingredients'] = d['ingredientes'][:400]
    if d.get('contenido neto'): n['net'] = d['contenido neto']
    # sin al menos proteína o carbos no hay ficha útil
    if not any(k in n for k in ('protein','carbs','kcal')): return None
    return n

# ---------- HEB ----------

def heb_buscar(q):
    html = get("https://www.heb.com.mx/search?q=" + urllib.parse.quote(q))
    vistos, out = set(), []
    for slug in re.findall(r'/([a-z0-9-]{8,80}-\d{5,7})/p', html):
        if slug in vistos: continue
        vistos.add(slug)
        out.append(("https://www.heb.com.mx/%s/p" % slug, slug.replace('-', ' ')))
    return out[:8]

def heb_ficha(url):
    html = get(url)
    txt = html.encode().decode('unicode_escape', 'ignore')
    filas = re.findall(r'<th>([^<]+)</th>\s*<td>([^<]*)</td>', txt)
    if not filas: return None
    d = {}
    for k, v in filas:
        k2 = norm(k.encode('latin1', 'ignore').decode('utf-8', 'ignore') or k).strip()
        d.setdefault(k2, v.strip())
    n = {}
    mapa = [('energia por 100 g','kcal'), ('proteinas totales por 100 g','protein'),
            ('grasas totales por 100 g','fat'), ('carbohidratos totales por 100 g','carbs'),
            ('azucares totales por 100 g','sugar'), ('sodio por 100 g','sodium'),
            ('porcion sugerida','serving')]
    for clave, campo in mapa:
        if clave in d:
            n[campo] = d[clave] if campo == 'serving' else num(d[clave])
    return {k: v for k, v in n.items() if v is not None} or None

# ---------- match ----------

def puntaje(prod_name, brand, candidato):
    """0..1 — qué tanto se parece el candidato a nuestro producto."""
    ct = set(tokens(candidato))
    if not ct: return 0
    # la marca es obligatoria si la tenemos
    if brand:
        bt = tokens(brand)
        if bt and not any(b in ct for b in bt):
            return 0
    pt = [t for t in tokens(prod_name)]
    if not pt: return 0
    hits = sum(1 for t in pt if t in ct)
    return hits / len(pt)

def elegir(prod_name, brand, candidatos, minimo=0.5):
    mejor, mp = None, 0
    for url, nombre in candidatos:
        p = puntaje(prod_name, brand, nombre)
        if p > mp: mejor, mp = (url, nombre), p
    return (mejor, mp) if mejor and mp >= minimo else (None, mp)

def coinciden(a, b):
    """¿dos fuentes independientes dan los mismos macros? (tolerancia 12%)
    Es la red que atrapa los matches equivocados: si Soriana y HEB
    concuerdan, casi seguro es el producto correcto."""
    # comparar per-serving contra per-100g sería comparar peras con manzanas
    if a.get('per_serving') or b.get('per_serving'): return False
    comunes = [k for k in ('protein','carbs','fat','kcal','sugar')
               if isinstance(a.get(k), (int,float)) and isinstance(b.get(k), (int,float))]
    if len(comunes) < 2: return False
    for k in comunes:
        x, y = a[k], b[k]
        if max(x, y) == 0: continue
        if abs(x - y) / max(x, y) > 0.12: return False
    return True

# ---------- main ----------

def productos():
    out = subprocess.run(
        ['npx','wrangler','d1','execute','prado-smae','--remote','--json','--command',
         "SELECT id, name, brand, category FROM super_products WHERE nutri_status='draft' AND nutrition IS NULL ORDER BY sort"],
        capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    m = re.search(r'\[\s*{.*}\s*\]', out.stdout, re.S)
    return json.loads(m.group(0))[0]['results'] if m else []

def main():
    limite = None
    if '--limit' in sys.argv: limite = int(sys.argv[sys.argv.index('--limit')+1])
    dry = '--dry' in sys.argv

    prods = productos()
    if limite: prods = prods[:limite]
    print(f"pendientes: {len(prods)}\n")

    sql, stats = [], {'alta':0,'media':0,'baja':0,'nada':0}
    for p in prods:
        q = f"{p['brand'] or ''} {p['name']}".strip()
        # el nombre de Hugo trae paréntesis y detalles que estorban al buscar
        q = re.sub(r'\([^)]*\)', '', q).strip()
        datos, fuente, match, conf = None, None, None, None
        try:
            cands = soriana_buscar(q); time.sleep(PAUSA)
            sel, pt = elegir(p['name'], p['brand'], cands)
            if sel:
                datos = soriana_ficha(sel[0]); time.sleep(PAUSA)
                if datos: fuente, match, conf = sel[0], sel[1], 'media'
        except Exception as e:
            print(f"  ! soriana {p['id']}: {str(e)[:40]}")
        # verificación cruzada con HEB
        if datos:
            try:
                hc = heb_buscar(q); time.sleep(PAUSA)
                hsel, hp = elegir(p['name'], p['brand'], hc)
                if hsel:
                    hd = heb_ficha(hsel[0]); time.sleep(PAUSA)
                    if hd and coinciden(datos, hd):
                        conf = 'alta'
                        datos = {**hd, **datos}
            except Exception:
                pass
        if not datos:
            stats['nada'] += 1
            print(f"  ✗ {p['name'][:40]}")
            continue
        stats[conf] += 1
        print(f"  {'✓✓' if conf=='alta' else '✓ '} {p['name'][:38]:40} [{conf}] → {match[:40]}")
        if not dry:
            j = json.dumps(datos, ensure_ascii=False).replace("'", "''")
            sql.append(
              f"UPDATE super_products SET nutrition='{j}', nutri_source='{fuente}', "
              f"nutri_match='{match.replace(chr(39), chr(39)*2)[:120]}', nutri_confidence='{conf}' "
              f"WHERE id='{p['id']}';")
    if sql:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nutricion.sql'), 'w') as f:
            f.write('\n'.join(sql))
        print(f"\nescrito scripts/nutricion.sql ({len(sql)} updates)")
    print(f"\nresumen: {stats}")

if __name__ == '__main__':
    main()
