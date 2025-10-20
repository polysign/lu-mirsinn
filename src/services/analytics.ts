import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { firebaseConfig } from '../config/firebase-config';
import { isFirebaseConfigured } from './firebase';

let analyticsInstance: ReturnType<typeof getAnalytics> | null = null;
let analyticsReady = false;

export const initAnalytics = () => {
  if (analyticsReady || !isFirebaseConfigured()) {
    return analyticsReady;
  }
  try {
    const app = initializeApp(firebaseConfig, 'analytics-app');
    analyticsInstance = getAnalytics(app);
    analyticsReady = true;
  } catch (error) {
    console.warn('[analytics] Failed to initialize', error);
    analyticsReady = false;
  }
  return analyticsReady;
};

export const logAnalyticsEvent = (eventName: string, params: Record<string, any> = {}) => {
  if (!analyticsReady || !analyticsInstance) return;
  try {
    logEvent(analyticsInstance, eventName, params);
  } catch (error) {
    console.warn('[analytics] Failed to log event', error);
  }
};
