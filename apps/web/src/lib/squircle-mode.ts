/**
 * Runs in <head> before first paint and sets <html data-sq>:
 * "native" when the browser supports CSS corner-shape, otherwise "fallback".
 * Add ?sq=fallback to any URL to test the fallback in Chrome.
 */
export const squircleModeScript = `(function(){var d=document.documentElement;var f=/[?&]sq=fallback/.test(location.search)||!(window.CSS&&CSS.supports("corner-shape","squircle"));d.dataset.sq=f?"fallback":"native"})()`;
