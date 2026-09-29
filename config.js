// Base del proxy de Municode. En local lo atiende server.py; publicado como
// sitio estático lo atiende el Cloudflare Worker de worker/municode-proxy.js.
(() => {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  window.MUNI_CONFIG = {
    api: local ? '/api/municode' : 'https://municode-proxy.lifecity.workers.dev',
  };
})();
