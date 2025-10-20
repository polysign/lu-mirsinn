import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  type Firestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
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
    authDomain: (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_AUTH_DOMAIN,
    projectId: (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_PROJECT_ID,
    storageBucket: (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_APP_ID,
    measurementId: (globalThis as any).process?.env?.STENCIL_APP_FIREBASE_MEASUREMENT_ID,
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
      '[firebase] Configuration missing. Provide window.__MIR_SINN_FIREBASE__ or set STENCIL_APP_FIREBASE_* env vars.'
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

export async function getTodayQuestionDoc(dateKey: string): Promise<QuestionDocument | null> {
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
  answer: AnswerDocument
): Promise<void> {
  const db = ensureFirestore();
  if (!db) return;
  const answerRef = doc(db, 'questions', dateKey, 'answers', deviceId);
  await setDoc(answerRef, answer, { merge: true });
}

export async function getAnswerForDevice(
  dateKey: string,
  deviceId: string
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

export async function getRecentQuestions(limitCount = 14): Promise<QuestionDocument[]> {
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
