/* PRADO - SMAE iconography
   Line-art monocromático para los 16 grupos del SMAE. currentColor + stroke
   1.5px sobre viewbox 24x24. Reutilizable en app, admin y email.
   Uso: SMAE_ICONS[groupKey] devuelve un string SVG inline. */
(function (global) {
  const ICONS = {
    // Verduras: hoja
    'verduras': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V11"/><path d="M12 11C12 7 9 4 5 4C5 8 8 11 12 11Z"/><path d="M12 11C12 7 15 4 19 4C19 8 16 11 12 11Z"/></svg>`,
    // Frutas: manzana
    'frutas': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6C10.5 4 7 4 6 7C5 10 7 18 10 20C11 20.5 13 20.5 14 20C17 18 19 10 18 7C17 4 13.5 4 12 6Z"/><path d="M12 6C12 5 12.5 3 14 3"/></svg>`,
    // Cereales sin grasa: espiga
    'cereales-sg': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8"/><path d="M12 8C9 8 7 10 7 13M12 8C15 8 17 10 17 13"/><path d="M12 13C9.5 13 8 14.5 8 17M12 13C14.5 13 16 14.5 16 17"/><path d="M12 5L12 8"/><circle cx="12" cy="4" r="1.5"/></svg>`,
    // Cereales con grasa: espiga + punto (aceite)
    'cereales-cg': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 22V8"/><path d="M11 8C8.5 8 7 10 7 13M11 8C13.5 8 15 10 15 13"/><path d="M11 13C9 13 8 14.5 8 17M11 13C13 13 14 14.5 14 17"/><circle cx="18" cy="9" r="2.5" fill="currentColor" opacity="0.3"/></svg>`,
    // Leguminosas: frijol/medialuna
    'leguminosas': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6C5 8 4 13 6 17C8 21 13 21 16 18C17 17 17 15 16 14C15 13 14 13 13 14C12 15 11 15 10 14C9 13 9 11 10 9C11 7 11 6 10 5C9 4 8 5 8 6Z"/></svg>`,
    // AOA muy bajo en grasa: pez
    'aoa-mb': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12C6 9 10 7 14 7C17 7 19 9 20 12C19 15 17 17 14 17C10 17 6 15 4 12Z"/><path d="M4 12L1 9V15L4 12Z"/><circle cx="16" cy="11" r="0.7" fill="currentColor"/></svg>`,
    // AOA bajo en grasa: muslo de pollo simplificado
    'aoa-b': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17C5 15 5 11 8 9C11 7 14 7 16 9C18 11 18 13 16 14C15 14.5 14 14.5 14 16C14 17.5 13 18 11 18C9 18 8 17.5 7 17Z"/><path d="M7 17L5 19"/></svg>`,
    // AOA moderado en grasa: huevo
    'aoa-m': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="6" ry="8"/></svg>`,
    // AOA alto en grasa: pieza con marca
    'aoa-a': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8C4 6 6 5 8 5H16C18 5 20 6 20 8V16C20 18 18 19 16 19H8C6 19 4 18 4 16V8Z"/><path d="M7 9L10 12L7 15"/><path d="M13 9L17 9M13 12L17 12M13 15L17 15"/></svg>`,
    // Leche descremada: vaso
    'leche-d': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4H17L16 20C16 21 15 21 14 21H10C9 21 8 21 8 20L7 4Z"/><path d="M8 7H16"/></svg>`,
    // Leche semi: vaso medio lleno
    'leche-s': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4H17L16 20C16 21 15 21 14 21H10C9 21 8 21 8 20L7 4Z"/><path d="M7.5 12L16.5 12" stroke-dasharray="2 2"/></svg>`,
    // Leche entera: vaso lleno
    'leche-e': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4H17L16 20C16 21 15 21 14 21H10C9 21 8 21 8 20L7 4Z"/><path d="M7.3 7H16.7" stroke-dasharray="2 2"/></svg>`,
    // Aceites sin proteína: gota
    'aceites-sp': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3C7 9 5 13 5 16C5 19.5 8 22 12 22C16 22 19 19.5 19 16C19 13 17 9 12 3Z"/></svg>`,
    // Aceites con proteína: gota + punto
    'aceites-cp': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3C6 9 4 13 4 16C4 19.5 7 22 11 22C15 22 18 19.5 18 16C18 13 16 9 11 3Z"/><circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.3"/></svg>`,
    // Azúcar sin grasa: cubo
    'azucar-sg': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14"/><path d="M9 9L15 15M15 9L9 15"/></svg>`,
    // Azúcar con grasa: cubo + drop
    'azucar-cg': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="13" height="13"/><path d="M19 14C17.5 16 17 17 17 18.5C17 20 18 21 19 21C20 21 21 20 21 18.5C21 17 20.5 16 19 14Z" fill="currentColor" opacity="0.3"/></svg>`,
  };

  if (typeof window !== 'undefined') {
    window.SMAE_ICONS = ICONS;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ICONS;
  }
})(typeof self !== 'undefined' ? self : this);
