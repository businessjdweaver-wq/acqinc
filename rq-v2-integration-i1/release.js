/* RQV2 release manifest. Increment version for each application release. */
(function (root) {
  'use strict';

  const version = 'I1.16.295';

  function url(path) {
    const target = new URL(path, document.baseURI);
    if (target.origin !== location.origin) throw new Error('Release URLs must be same-origin');
    target.searchParams.set('build', version);
    return target.href;
  }

  // Run during parsing so dependent inline scripts retain their existing load order.
  function loadScripts(...paths) {
    for (const path of paths) {
      if (!/^(?:content\/)?[a-z0-9-]+\.js$/.test(path)) throw new Error('Invalid release script path');
      document.write('<script src="' + path + '?build=' + version + '"><\/script>');
    }
  }

  root.RQRelease = Object.freeze({ version, url, loadScripts });

  document.addEventListener('DOMContentLoaded', () => {
    for (const marker of document.querySelectorAll('[data-rq-build]')) {
      marker.textContent = (marker.dataset.rqBuild || '') + version;
    }
    for (const link of document.querySelectorAll('a[data-rq-link]')) {
      link.href = url(link.getAttribute('href'));
    }
  });
})(window);
