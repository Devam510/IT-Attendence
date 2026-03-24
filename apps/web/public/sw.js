// Vibe Tech Labs — Service Worker for Web Push Notifications
// This file runs as a background worker independent of any open tab.
// It receives push events from the server and shows OS-level notifications.

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate SW immediately without waiting
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim()); // Take control of all open pages
});

// ── Handle incoming push messages from server ──────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Vibe Tech Labs', body: event.data?.text() || 'New notification' };
  }

  const title = data.title || 'Vibe Tech Labs';
  const options = {
    body: data.body || '',
    icon: '/logo.png',               // App icon in notification
    badge: '/logo.png',              // Small icon in Android status bar
    tag: data.tag || 'nexus-notif', // Prevents duplicate notifications of same type
    renotify: true,                  // Makes sound/vibrate even if tag matches
    requireInteraction: data.requireInteraction ?? false, // Keep on screen until dismissed
    data: {
      url: data.url || '/',          // URL to open when notification is clicked
    },
    actions: data.actions || [],     // Optional action buttons
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Handle notification click ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there is already a tab with the app open, focus & navigate it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise, open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
