import { auth } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Este código se ejecuta en CUALQUIER página que lo incluya
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Buscamos el elemento del nombre (si existe en esa página)
        const nameDisplay = document.getElementById('userName');
        if (nameDisplay) {
            nameDisplay.innerText = user.displayName || user.email.split('@')[0];
        }
        
        // Ejecutamos la función de inicio específica de cada página si existe
        if (typeof window.inicializarPagina === 'function') {
            window.inicializarPagina();
        }
    } else {
        // Si no hay sesión, al login de una vez
        window.location.href = "index.html"; 
    }
});