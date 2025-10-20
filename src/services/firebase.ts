import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  type Firestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';

export interface LocalizedText {
  lb: string;
  fr: string;
  de: string;
  en: string;
}

export interface QuestionOption {
  id: string;
  label: LocalizedText;
}

export interface QuestionDocument {
  id: string;
  dateKey: string;
  question: LocalizedText;
  options: QuestionOption[];
  article?: {
    title?: string;
    url?: string;
    summary?: LocalizedText | null;
    comments?: number;
  };
  analysis?: LocalizedText | null;
  results?: {
    totalResponses?: number;
    perOption?: Record<string, number>;
    breakdown?: Array<{
      optionId: string;
      percentage: number;
      count: number;
    }>;
    summary?: string;
  };
}

export interface AnswerDocument {
  deviceId: string;
  optionId: string;
  language: keyof LocalizedText;
  answeredAt: string;
}

export interface DeviceDocument {
  deviceId: string;
  points: number;
  shortCode?: string;
  referrer?: string | null;
  referrals?: number;
  fcmToken?: string | null;
  createdAt?: string | null;
  lastAnsweredAt?: string | null;
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

type FirebaseEnvConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

function resolveFirebaseConfig(): FirebaseEnvConfig | null {
  const winConfig =
    typeof window !== 'undefined'
      ? (window as any).__MIR_SINN_FIREBASE__
      : null;
  if (winConfig?.apiKey) {
    return winConfig;
  }

  const envConfig: FirebaseEnvConfig = {
    apiKey: (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_API_KEY,
    authDomain:
      (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_AUTH_DOMAIN,
    projectId:
      (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_PROJECT_ID,
    storageBucket:
      (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId:
      (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_APP_ID,
    measurementId:
      (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_MEASUREMENT_ID,
  };

  const hasAllRequired =
    !!envConfig.apiKey && !!envConfig.projectId && !!envConfig.appId;

  if (hasAllRequired) {
    return envConfig;
  }

  return null;
}

export const isFirebaseConfigured = () => resolveFirebaseConfig() !== null;

function ensureApp(): FirebaseApp | null {
  if (appInstance) {
    return appInstance;
  }
  const config = resolveFirebaseConfig();
  if (!config) {
    console.warn(
      '[firebase] Configuration missing. Provide window.__MIR_SINN_FIREBASE__ or set STENCIL_APP_FIREBASE_* env vars.',
    );
    return null;
  }
  appInstance = initializeApp(config);
  return appInstance;
}

function ensureFirestore(): Firestore | null {
  if (dbInstance) {
    return dbInstance;
  }
  const app = ensureApp();
  if (!app) return null;
  dbInstance = getFirestore(app);
  return dbInstance;
}

export async function getTodayQuestionDoc(
  dateKey: string,
): Promise<QuestionDocument | null> {
  const db = ensureFirestore();
  if (!db) {
    return null;
  }
  try {
    const ref = doc(db, 'questions', dateKey);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    return {
      ...(snapshot.data() as Omit<QuestionDocument, 'id'>),
      id: snapshot.id,
      dateKey,
    };
  } catch (error) {
    console.warn('[firebase] Failed to load question', error);
    return null;
  }
}

export async function setAnswer(
  dateKey: string,
  deviceId: string,
  answer: AnswerDocument,
): Promise<void> {
  const db = ensureFirestore();
  if (!db) return;
  const ensured = await ensureDeviceDocument(deviceId);
  const answerRef = doc(db, 'questions', dateKey, 'answers', deviceId);
  await setDoc(answerRef, answer, { merge: true });

  try {
    const deviceRef = doc(db, 'devices', deviceId);
    let current = ensured?.points;
    if (current == null) {
      const snapshot = await getDoc(deviceRef);
      current =
        snapshot.exists() && typeof snapshot.data()?.points === 'number'
          ? (snapshot.data() as DeviceDocument).points
          : 0;
    }
    await setDoc(
      deviceRef,
      {
        deviceId,
        points: current + 100,
        lastAnsweredAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn('[firebase] Failed to increment device points', error);
  }
}

export async function getAnswerForDevice(
  dateKey: string,
  deviceId: string,
): Promise<AnswerDocument | null> {
  const db = ensureFirestore();
  if (!db) return null;
  try {
    const answerRef = doc(db, 'questions', dateKey, 'answers', deviceId);
    const snapshot = await getDoc(answerRef);
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return {
      ...(data as AnswerDocument),
      deviceId,
    };
  } catch (error) {
    console.warn('[firebase] No existing answer or access denied', error);
    return null;
  }
}

const parseDateKey = (key: string) => {
  const [month, day, year] = key.split('-').map(part => Number(part));
  if (!month || !day || !year) return 0;
  return new Date(year, month - 1, day).getTime();
};

export async function getRecentQuestions(
  limitCount = 14,
): Promise<QuestionDocument[]> {
  const db = ensureFirestore();
  if (!db) {
    return [];
  }
  try {
    const snapshot = await getDocs(collection(db, 'questions'));
    const docs = snapshot.docs.map(docSnap => {
      const data = docSnap.data() as Omit<QuestionDocument, 'id'>;
      const dateKey = (data as any).dateKey || docSnap.id;
      return {
        ...data,
        id: docSnap.id,
        dateKey,
      };
    });
    return docs
      .sort(
        (a, b) =>
          parseDateKey((b as any).dateKey || b.id) -
          parseDateKey((a as any).dateKey || a.id),
      )
      .slice(0, limitCount);
  } catch (error) {
    console.warn('[firebase] Failed to load questions list', error);
    return [];
  }
}

const generateShortCode = (length = 6) => {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 255);
    }
  }
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
};

async function resolveUniqueShortCode(db: Firestore): Promise<string> {
  for (let attempts = 0; attempts < 7; attempts += 1) {
    const candidate = generateShortCode();
    const snapshot = await getDoc(doc(db, 'shortcodes', candidate));
    if (!snapshot.exists()) {
      return candidate;
    }
  }
  return `${Date.now()}`.slice(-6);
}

export async function ensureDeviceDocument(
  deviceId: string,
  referrerCode?: string | null,
): Promise<DeviceDocument | null> {
  const db = ensureFirestore();
  if (!db || !deviceId) return null;
  try {
    const deviceRef = doc(db, 'devices', deviceId);
    const snapshot = await getDoc(deviceRef);
    if (!snapshot.exists()) {
      const shortCode = await resolveUniqueShortCode(db);
      const docData: DeviceDocument = {
        deviceId,
        points: 0,
        shortCode,
        referrer: referrerCode || null,
        referrals: 0,
        fcmToken: null,
        createdAt: new Date().toISOString(),
        lastAnsweredAt: null,
      };
      await Promise.all([
        setDoc(deviceRef, docData),
        setDoc(doc(db, 'shortcodes', shortCode), { deviceId }),
      ]);
      if (referrerCode && referrerCode !== shortCode) {
        await incrementReferrerPoints(db, referrerCode);
      }
      if (typeof window !== 'undefined') {
        (window as any).__DEVICE_SHORT_CODE__ = shortCode;
      }
      return docData;
    }
    const data = snapshot.data() as DeviceDocument;
    const update: Partial<DeviceDocument> = {};
    if (typeof data.points !== 'number') update.points = 0;
    if (!data.deviceId) update.deviceId = deviceId;
    if (!data.shortCode) {
      const code = await resolveUniqueShortCode(db);
      update.shortCode = code;
      await setDoc(doc(db, 'shortcodes', code), { deviceId });
    }
    if (data.referrals == null) {
      update.referrals = 0;
    }
    if (!('createdAt' in data)) {
      update.createdAt = new Date().toISOString();
    }
    if (!('lastAnsweredAt' in data)) {
      update.lastAnsweredAt = null;
    }
    if (!('fcmToken' in data)) {
      update.fcmToken = null;
    }
    let awardedReferrer = false;
    if (referrerCode && !data.referrer && referrerCode !== data.shortCode) {
      update.referrer = referrerCode;
      awardedReferrer = true;
    }
    if (Object.keys(update).length) {
      await setDoc(deviceRef, { deviceId, ...update }, { merge: true });
    }
    const merged = { ...data, ...update, deviceId } as DeviceDocument;
    if (merged.shortCode) {
      await setDoc(doc(db, 'shortcodes', merged.shortCode), { deviceId });
      if (typeof window !== 'undefined') {
        (window as any).__DEVICE_SHORT_CODE__ = merged.shortCode;
      }
    }
    if (awardedReferrer && referrerCode) {
      await incrementReferrerPoints(db, referrerCode);
    }
    return merged;
  } catch (error) {
    console.warn('[firebase] Unable to ensure device document', error);
    return null;
  }
}

async function incrementReferrerPoints(db: Firestore, shortCode: string) {
  try {
    const codeDoc = await getDoc(doc(db, 'shortcodes', shortCode));
    if (!codeDoc.exists()) return;
    const refDeviceId = (codeDoc.data() as { deviceId?: string }).deviceId;
    if (!refDeviceId) return;

    const refRef = doc(db, 'devices', refDeviceId);
    const refSnap = await getDoc(refRef);
    if (!refSnap.exists()) return;
    const refData = refSnap.data() as DeviceDocument;
    await setDoc(
      refRef,
      {
        deviceId: refDeviceId,
        points: (refData.points || 0) + 5,
        referrals: (refData.referrals || 0) + 1,
      },
      { merge: true },
    );
  } catch (error) {
    console.warn('[firebase] Failed to reward referrer', error);
  }
}

export async function updateDeviceMessagingToken(
  deviceId: string,
  token: string,
): Promise<void> {
  const db = ensureFirestore();
  if (!db || !deviceId || !token) return;
  try {
    await ensureDeviceDocument(deviceId);
    const deviceRef = doc(db, 'devices', deviceId);
    await setDoc(
      deviceRef,
      {
        deviceId,
        fcmToken: token,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn('[firebase] Unable to store messaging token', error);
  }
}

export function subscribeToDevice(
  deviceId: string,
  callback: (data: DeviceDocument | null) => void,
): () => void {
  const db = ensureFirestore();
  if (!db || !deviceId) {
    callback(null);
    return () => {};
  }
  const deviceRef = doc(db, 'devices', deviceId);
  return onSnapshot(
    deviceRef,
    snapshot => {
      if (!snapshot.exists()) {
        ensureDeviceDocument(deviceId).catch(error =>
          console.warn('[firebase] Auto-created missing device doc failed', error),
        );
        callback(null);
        return;
      }
      const data = {
        ...(snapshot.data() as DeviceDocument),
        deviceId: snapshot.id,
      };
      if (data.shortCode) {
        (window as any).__DEVICE_SHORT_CODE__ = data.shortCode;
      }
      callback(data);
    },
    error => {
      console.warn('[firebase] Device subscription failed', error);
      callback(null);
    },
  );
}
