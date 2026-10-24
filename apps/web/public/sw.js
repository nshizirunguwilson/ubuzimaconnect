/* UbuzimaConnect service worker.
   - Offline (NFR 8, FR 1.9, 3.10): public pages and the app's code are kept, so the emergency page opens
     without a connection. Registered as /sw.js?cache=1 in production builds only (D59).
     Nothing personal is ever cached: no API answers and no logged-in page.
   - Push (FR 6.6, NFR 13): the text only ever says a new message arrived; tapping it opens the right page. */

const CACHING = new URL(self.location.href).searchParams.get("cache") === "1";
const CACHE = "ubuzima-v1";
/** Pages anyone can see without logging in. Any other page, offline, falls back to the emergency page. */
const PUBLIC_PAGES = ["/", "/emergency", "/check", "/login"];
const STATIC = /^\/(_next\/static\/|icons\/|brand\/|manifest\.webmanifest$)/;

self.addEventListener("install", (event) => {
  if (CACHING) event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Each public page, and the scripts and styles it names, so it works on the first offline visit. */
async function precache() {
  const cache = await caches.open(CACHE);
  for (const page of PUBLIC_PAGES) {
    try {
      const res = await fetch(page, { credentials: "omit" });
      if (!res.ok) continue;
      const html = await res.clone().text();
      await cache.put(page, res);
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [])];
      await Promise.all(assets.map((a) => cache.add(a).catch(() => null)));
    } catch {
      // Offline during install: the next visit fills the cache.
    }
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (!CACHING || req.method !== "GET" || url.origin !== self.location.origin) return;

  // The app's code and icons never change under the same name: the cached copy is used first.
  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: always the network first, so nothing is out of date when online.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && PUBLIC_PAGES.includes(url.pathname)) caches.open(CACHE).then((c) => c.put(url.pathname, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) ?? (await caches.match("/emergency")) ?? Response.error()),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "UbuzimaConnect", body: "You have a new message.", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // keep the default text
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // One notification per kind on the screen, replaced by the newest.
      tag: "ubuzima-message",
      renotify: true,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      const tab = open.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) return tab.navigate(url).then((c) => (c ?? tab).focus());
      return self.clients.openWindow(url);
    }),
  );
});
