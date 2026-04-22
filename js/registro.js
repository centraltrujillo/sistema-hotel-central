import { auth, db } from "./firebaseconfig.js"; 
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- 1. PROTECCIÓN DE RUTA (SOLO ADMIN) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (!userDoc.exists() || userDoc.data().rol !== "Administrador") {
            window.location.href = "dashboard.html"; // Redirigir si no es admin
        }
    } else {
        window.location.href = "index.html"; // Redirigir si no está logueado
    }
});

// --- 2. CONFIGURACIÓN PARA EVITAR CIERRE DE SESIÓN DEL ADMIN ---
// Obtenemos la configuración de tu firebaseconfig.js (asumiendo que la exportas o la pegas aquí)
const firebaseConfig = auth.app.options; 
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

const formRegistro = document.getElementById("formRegistro");
const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");
const COLOR_HOTEL = '#800020';

// 👁️ Mostrar/ocultar contraseña
togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.textContent = isPassword ? "OCULTAR" : "MOSTRAR";
});

// 📝 Registrar Personal
formRegistro.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = document.getElementById("nombre").value.trim();
  const rol = document.getElementById("rol").value; 
  const correo = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  // Validaciones básicas
  if (password.length < 6) {
    Swal.fire({ icon: 'warning', title: 'Contraseña débil', text: 'Mínimo 6 caracteres.', confirmButtonColor: COLOR_HOTEL });
    return;
  }

  Swal.fire({
    title: 'Creando cuenta de personal...',
    text: 'Espere un momento',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    // IMPORTANTE: Usamos secondaryAuth para que el Admin no pierda su sesión
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, correo, password);
    const newUser = userCredential.user;

    await updateProfile(newUser, { displayName: nombre });

    // Guardar en Firestore
    await setDoc(doc(db, "usuarios", newUser.uid), {
      uid: newUser.uid,
      nombre: nombre,
      correo: correo,
      rol: rol,
      fechaRegistro: serverTimestamp(),
      estado: "Activo"
    });

    // Cerrar la sesión de la cuenta nueva (la secundaria) inmediatamente
    await secondaryAuth.signOut();

    Swal.fire({
      icon: 'success',
      title: '¡Personal Registrado!',
      text: `Cuenta creada para ${nombre} como ${rol}`,
      confirmButtonColor: COLOR_HOTEL,
      confirmButtonText: 'Volver al Dashboard'
    }).then(() => {
      window.location.href = "dashboard.html";
    });

    formRegistro.reset();

  } catch (error) {
    console.error(error);
    let mensaje = "Error al procesar el registro.";
    if (error.code === "auth/email-already-in-use") mensaje = "Este correo ya está registrado.";
    
    Swal.fire({ icon: 'error', title: 'Error', text: mensaje, confirmButtonColor: COLOR_HOTEL });
  }
});