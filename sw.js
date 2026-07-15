// Service Worker — KATRESELI decorações PWA
// CACHE_V é atualizado automaticamente pelo build.js a cada deploy
const CACHE_V = "katreseli-v2606191732";

// Arquivos de CSS/imagens/fontes que podem ir ao cache (assets estáticos)
const STATIC_CSS = [
  "/css/style.css",
  "/manifest.json",
];

// ── Install: cacheia só os CSS/assets estáticos ───────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_V).then(c => c.addAll(STATIC_CSS).catch(() => {}))
  );
  // Ativa imediatamente sem esperar o cliente fechar
  self.skipWaiting();
});

// ── Activate: limpa caches velhos ─────────────────────────────────────────────
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_V).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", e => {
  const url = e.request.url;

  // ① Firebase e CDNs externos — nunca interceptar
  if (
    url.includes("firestore.googleapis") ||
    url.includes("identitytoolkit")      ||
    url.includes("securetoken.googleapis") ||
    url.includes("firebase")             ||
    url.includes("googleapis.com")       ||
    url.includes("gstatic.com")          ||
    url.includes("cdnjs.cloudflare.com") ||
    url.includes("fonts.")
  ) return;

  // ② HTML e JS — SEMPRE NETWORK FIRST, sem cache
  //    Garante que qualquer deploy novo é recebido imediatamente
  const isAppFile = /\.(html|js)(\?.*)?$/.test(url) || url.endsWith("/");
  if (isAppFile) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .catch(() => caches.match(e.request)) // offline fallback
    );
    return;
  }

  // ③ CSS e outros assets — cache first, atualiza em background (stale-while-revalidate)
  e.respondWith(
    caches.open(CACHE_V).then(async cache => {
      const cached = await cache.match(e.request);
      const fetchPromise = fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === "GET") {
          cache.put(e.request, res.clone());
        }
        return res;
      }).catch(() => null);

      return cached || await fetchPromise || new Response("Offline", { status: 503 });
    })
  );
});

// ── Mensagens (usado pelo botão "Atualizar sistema") ──────────────────────────
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
