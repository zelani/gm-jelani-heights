import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 🔹 Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDfFxqIIuy6nlu6IH36-60ApgQuM6p8uE8",
  authDomain: "gm-jelani-heights-80159.firebaseapp.com",
  projectId: "gm-jelani-heights-80159",
  storageBucket: "gm-jelani-heights-80159.firebasestorage.app",
  messagingSenderId: "689035838710",
  appId: "1:689035838710:web:e0655bc63ee1c4ae29d8d7",
};

// 🔹 Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔹 Export Services
export const auth = getAuth(app);
export const db = getFirestore(app);
