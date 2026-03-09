
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

//hotel-central: Firebase web app
const firebaseconfig = {
    apiKey: "AIzaSyC84EHSAPR2snpZDMRhWJiFDfF9TFp816I",
    authDomain: "hotel-central-110b9.firebaseapp.com",
    projectId: "hotel-central-110b9",
    storageBucket: "hotel-central-110b9.firebasestorage.app",
    messagingSenderId: "473109685781",
    appId: "1:473109685781:web:2ba78f837f390aa337501c"
  };

// Inicializa Firebase
const app = initializeApp(firebaseconfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exportar servicios para otros scripts
export { app, auth, db };

