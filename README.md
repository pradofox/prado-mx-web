# prado-mx-web

Sitio oficial de PRADO — `prado-mx.com`.

Stack: HTML/CSS/JS vanilla. Sin build. Cloudflare Pages.

## Dev local

Servir la carpeta con cualquier static server:

```
npx serve .
# o
python3 -m http.server 8000
```

## Deploy

Push a `main` → Cloudflare Pages redespliega.

## Estructura

```
index.html         → home
hugo.html          → /hugo
consulting.html    → /consulting
style.css          → global
scroll.js          → Lenis + cursor-follow + parallax
assets/            → imágenes, logos, fonts
_headers           → Cloudflare cache/security
_redirects         → rutas
```

Dirección creativa: sopadeletras®.
