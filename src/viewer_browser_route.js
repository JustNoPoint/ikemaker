'use strict';

const SURFACE_ROUTES = Object.freeze({
  // A viewer's Browser button is navigation, not an open/close toggle. Using
  // the toggle here disposed an already-open (but hidden) companion and made
  // the button appear to do nothing.
  air: Object.freeze({ command: 'air.browseLists', seed: true }),
  sff: Object.freeze({ command: 'sff.browseLists', seed: true }),
  palette: Object.freeze({ command: 'ikemen.palette.openCompanion', seed: true })
});

const CODING_ROUTE = Object.freeze({ command: 'ikemen.authoringBrowser.open', seed: false });

function forSurface(surface, seed = '') {
  const key=String(surface || '').trim().toLowerCase(),route=SURFACE_ROUTES[key] || CODING_ROUTE;
  if(key==='palette'&&!/\.sff$/i.test(String(seed)))return Object.freeze({command:'',seed:false,reason:'Palette Workshop Browser is available when the workshop is connected to an SFF archive.'});
  return route;
}

function forText(classification = {}) {
  return String(classification.kind || '').toLowerCase() === 'air' ? SURFACE_ROUTES.air : CODING_ROUTE;
}

module.exports = { forSurface, forText, SURFACE_ROUTES, CODING_ROUTE };
