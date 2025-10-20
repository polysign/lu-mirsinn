import { ensureDeviceIdOnWindow } from '../services/device';
import { ensureDeviceDocument, isFirebaseConfigured } from '../services/firebase';
import { registerMessagingForDevice } from '../services/messaging';
import { firebaseConfig, hasFirebaseConfig } from '../config/firebase-config';

let swRefreshQueued = false;

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' || location.protocol === 'http:') {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    const triggerSkipWaiting = (worker: ServiceWorker | null) => {
      if (worker && worker.state === 'installed' && navigator.serviceWorker.controller) {
        worker.postMessage({ type: 'SKIP_WAITING' });
      }
    };

    if (registration.waiting) {
      triggerSkipWaiting(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => triggerSkipWaiting(newWorker));
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swRefreshQueued) return;
      swRefreshQueued = true;
      window.location.reload();
    });
  } catch (err) {
    console.warn('[sw] Failed to register service worker', err);
  }
};

const injectFirebaseConfig = () => {
  if (hasFirebaseConfig()) {
    (window as any).__MIR_SINN_FIREBASE__ = firebaseConfig;
  }
};

const attachFirebaseConfigFlag = () => {
  (window as any).__MIR_SINN_HAS_FIREBASE__ = isFirebaseConfigured();
};

export default async () => {
  injectFirebaseConfig();
  attachFirebaseConfigFlag();
  const deviceId = await ensureDeviceIdOnWindow();
  let ref = null;
  try {
    const params = new URLSearchParams(window.location.search);
    ref = params.get('from');
  } catch {
    ref = null;
  }
  if (isFirebaseConfigured()) {
    const deviceDoc = await ensureDeviceDocument(deviceId, ref);
    if (deviceDoc?.shortCode) {
      (window as any).__DEVICE_SHORT_CODE__ = deviceDoc.shortCode;
    }
    registerMessagingForDevice(deviceId);
  }
  registerServiceWorker();
};
