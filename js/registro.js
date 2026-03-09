import { auth, db } from "./firebaseconfig.js"; 
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const formRegistro = document.getElementById("formRegistro");
const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");

// 👁️ Mostrar/ocultar contraseña (Corregido para coincidir con el texto del CSS)
togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.textContent = isPassword ? "OCULTAR" : "MOSTRAR";
});

// 📝 Registrar Personal del Hotel
formRegistro.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Captura de datos del nuevo formulario
  const nombre = document.getElementById("nombre").value.trim();
  const rol = document.getElementById("rol").value; // Captura: Administrador, Recepcionista o Limpieza
  const correo = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  // Validación básica de seguridad
  if (password.length < 6) {
    alert("⚠️ Por seguridad, la contraseña debe tener al menos 6 caracteres.");
    return;
  }

  if (!rol) {
    alert("⚠️ Por favor, asigne un rol al trabajador.");
    return;
  }

  try {
    // 1. Crear usuario en Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
    const user = userCredential.user;

    // 2. Actualizar el nombre en el perfil de Auth
    await updateProfile(user, { displayName: nombre });

    // 3. Guardar información extendida en Firestore
    // Usamos el UID de Auth como ID del documento para que coincida con el Login
    await setDoc(doc(db, "usuarios", user.uid), {
      uid: user.uid,
      nombre: nombre,
      correo: correo,
      rol: rol, // Se guarda el rol seleccionado en el hotel
      fechaRegistro: serverTimestamp(),
      estado: "Activo" // Opcional: para control administrativo
    });

    alert(`✅ Registro exitoso. Se ha creado la cuenta para: ${nombre} (${rol})`);
    
    // Redirigir al login para que el nuevo usuario entre formalmente
    window.location.href = "login.html";

  } catch (error) {
    console.error("Error en el registro:", error);
    let mensaje = "Ocurrió un error al procesar el registro.";
    
    // Gestión de errores de Firebase
    if (error.code === "auth/email-already-in-use") {
        mensaje = "⚠️ Este correo ya está asignado a otro trabajador.";
    } else if (error.code === "auth/invalid-email") {
        mensaje = "⚠️ El formato del correo electrónico no es válido.";
    } else if (error.code === "auth/weak-password") {
        mensaje = "⚠️ La contraseña elegida es muy débil.";
    }
    
    alert(mensaje);
  }
});