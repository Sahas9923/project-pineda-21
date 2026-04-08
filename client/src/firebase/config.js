import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBPDabX7SZjXeTC19JCG3NJIDm7L6PSzM8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "pineda-v2.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "pineda-v2",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "pineda-v2.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "109221129592",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:109221129592:web:a120c1eaaa4c2616c36c8d",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-W9V51HNYNS",
};

const requiredConfigKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

requiredConfigKeys.forEach((key) => {
  if (!firebaseConfig[key]) {
    console.warn(`Firebase config warning: missing "${key}"`);
  }
});

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export { app };
export default app;