import { ensureDeviceIdOnWindow } from '../services/device';
import { ensureDeviceDocument, isFirebaseConfigured } from '../services/firebase';
import { registerMessagingForDevice } from '../services/messaging';
import { initAnalytics, logAnalyticsEvent } from '../services/analytics';
import { firebaseConfig, hasFirebaseConfig } from '../config/firebase-config';

let shouldReloadOnControllerChange = false;
let reloadHandled = false;

export const SERVICE_WORKER_UPDATE_EVENT = 'mir-sinn-sw-update';

export interface ServiceWorkerUpdatePayload {
  applyUpdate: () => boolean;
  isStandalone: boolean;
}

const isStandaloneDisplayMode = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
  } catch (error) {
    console.warn('[sw] Failed to inspect display-mode media query', error);
  }
  return (window.navigator as any).standalone === true;
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' || location.protocol === 'http:') {
    return;
  }
  const autoReloadEnabled = !isStandaloneDisplayMode();
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    const emitUpdateEvent = () => {
      if (typeof window === 'undefined') {
        return;
      }
      const waiting = registration.waiting;
      if (!waiting) {
        return;
      }
      if (!navigator.serviceWorker.controller) {
        return;
      }
      const detail: ServiceWorkerUpdatePayload = {
        isStandalone: !autoReloadEnabled,
        applyUpdate: () => {
          const worker = registration.waiting;
          if (!worker) {
            return false;
          }
          try {
            if (autoReloadEnabled) {
              shouldReloadOnControllerChange = true;
            }
            worker.postMessage({ type: 'SKIP_WAITING' });
            return true;
          } catch (error) {
            console.warn('[sw] Failed to trigger skipWaiting on new worker', error);
            return false;
          }
        },
      };
      window.dispatchEvent(new CustomEvent<ServiceWorkerUpdatePayload>(SERVICE_WORKER_UPDATE_EVENT, { detail }));
    };

    if (registration.waiting && navigator.serviceWorker.controller) {
      emitUpdateEvent();
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          emitUpdateEvent();
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!autoReloadEnabled) {
        return;
      }
      if (!shouldReloadOnControllerChange || reloadHandled) {
        return;
      }
      reloadHandled = true;
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
  initAnalytics();
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
    logAnalyticsEvent('app_bootstrap', {
      deviceId,
      referrer: ref || 'direct',
    });
  }
  registerServiceWorker();
};
