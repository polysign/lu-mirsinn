export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  vapidKey?: string;
};

/**
 * Fill in your Firebase web app configuration here.
 * Leave the strings empty if you prefer injecting the settings
 * through environment variables or directly on window.__MIR_SINN_FIREBASE__.
 */
export const firebaseConfig: FirebaseClientConfig = {
  apiKey: "AIzaSyD1JSxGL8iAGSjQL84iBIsTM_Cmo9Bx3kA",
  authDomain: "lu-mirsinn.firebaseapp.com",
  projectId: "lu-mirsinn",
  storageBucket: "lu-mirsinn.firebasestorage.app",
  messagingSenderId: "102516593827",
  appId: "1:102516593827:web:3c12cf92ebf18fae3cdb16",
  measurementId: "G-3EKKDNTBTH",
  vapidKey: ""
};

export const hasFirebaseConfig = () =>
  Object.values(firebaseConfig).some(value => value && value.trim().length > 0);
