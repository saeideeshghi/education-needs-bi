/* Standalone preview: no portal session or account is required. */
(function () {
  'use strict';
  let theme;
  try { theme = localStorage.getItem('education-needs-bi:theme:v1'); } catch (_) {}
  if (!['light', 'dark'].includes(theme)) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  window.PortalAllowed = true;
})();
