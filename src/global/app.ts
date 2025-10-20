import { ensureDeviceIdOnWindow } from '../services/device';
import { isFirebaseConfigured } from '../services/firebase';
import { firebaseConfig, hasFirebaseConfig } from '../config/firebase-config';

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
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
  await ensureDeviceIdOnWindow();
  injectFirebaseConfig();
  attachFirebaseConfigFlag();
  registerServiceWorker();
};
