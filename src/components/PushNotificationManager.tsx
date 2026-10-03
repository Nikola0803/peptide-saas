'use client';
import { useEffect, useState } from 'react';

type State = 'idle' | 'subscribed' | 'denied' | 'loading' | 'needs-pwa';

export function PushNotificationManager() {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // iOS Safari not in standalone — push not available
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone = (navigator as any).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;
      if (isIOS && !isStandalone) {
        setState('needs-pwa');
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(console.error);

    if (Notification.permission === "granted") {
      setState("subscribed");
    } else if (Notification.permission === "denied") {
      setState("denied");
    }
  }, []);

  async function subscribe() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;

      const res = await fetch("/api/push/vapid");
      const { publicKey } = await res.json();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      setState("subscribed");
    } catch (err) {
      console.error(err);
      setState(Notification.permission === "denied" ? "denied" : "idle");
    }
  }

  if (state === 'needs-pwa') {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
        <i className="ri-add-box-line mt-0.5 shrink-0" />
        <span>Add to Home Screen to enable push notifications</span>
      </div>
    );
  }

  if (state === "subscribed") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        <i className="ri-notification-3-fill" />
        Push notifications on
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <i className="ri-notification-off-line" />
        Notifications blocked in browser settings
      </div>
    );
  }

  if (state === "idle") {
    return (
      <button
        onClick={subscribe}
        className="flex w-full items-center gap-2 rounded-lg bg-green-900/10 px-3 py-2 text-xs font-medium text-green-800 hover:bg-green-900/20"
      >
        <i className="ri-notification-3-line" />
        Enable push notifications
      </button>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-900/10 px-3 py-2 text-xs text-green-800 opacity-60">
        <i className="ri-loader-4-line animate-spin" />
        Enabling…
      </div>
    );
  }

  return null;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
