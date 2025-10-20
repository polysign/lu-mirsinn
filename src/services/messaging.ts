import { firebaseConfig } from '../config/firebase-config';
import { isFirebaseConfigured, updateDeviceMessagingToken } from './firebase';
import { initializeApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  isSupported as messagingIsSupported,
} from 'firebase/messaging';

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let appInitialised = false;

const getVapidKey = () =>
  firebaseConfig.vapidKey ||
  (typeof window !== 'undefined'
    ? (window as any).__MIR_SINN_VAPID__
    : undefined);

const ensureMessagingRegistration = async () => {
  if (!('serviceWorker' in navigator)) return null;
  if (!registrationPromise) {
    registrationPromise = (async () => {
      try {
        return await navigator.serviceWorker.register('/messaging-sw.js', {
          scope: '/',
        });
      } catch (err) {
        console.warn('[messaging] Failed to register messaging service worker', err);
        return null;
      }
    })();
  }
  return registrationPromise;
};

export const registerMessagingForDevice = async (deviceId: string, forcePrompt = false) => {
  if (!deviceId || !isFirebaseConfigured()) return;
  const supported = await messagingIsSupported().catch(() => false);
  if (!supported) return;
  if (!('Notification' in window)) return;

  let permission: NotificationPermission = Notification.permission;
  if (forcePrompt || permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return;
  }

  const registration = await ensureMessagingRegistration();
  if (!registration) return;

  if (!appInitialised) {
    initializeApp(firebaseConfig);
    appInitialised = true;
  }

  const vapidKey = getVapidKey();
  if (!vapidKey) {
    console.warn('[messaging] Missing VAPID key; skipping token registration');
    return;
  }

  try {
    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      await updateDeviceMessagingToken(deviceId, token);
    }
  } catch (error) {
    console.warn('[messaging] Unable to retrieve FCM token', error);
  }
};
