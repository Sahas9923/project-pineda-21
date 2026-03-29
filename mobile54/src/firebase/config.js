import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDnxw-3k4-LFXjeNohP7FA65XhoeTfh3L8",
  authDomain: "project-pineda-21.firebaseapp.com",
  projectId: "project-pineda-21",
  storageBucket: "project-pineda-21.firebasestorage.app",
  messagingSenderId: "720680753291",
  appId: "1:720680753291:web:9083a1da849b9b77731c8e",
  measurementId: "G-Q2SHZ9X5BY"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;