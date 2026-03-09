import { auth, db } from "./firebaseconfig.js"; 
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const formRegistro = document.getElementById("formRegistro");
const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");

// Color institucional para los botones
const COLOR_HOTEL = '#800020';

// 👁️ Mostrar/ocultar contraseña
togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.textContent = isPassword ? "OCULTAR" : "MOSTRAR";
});

// 📝 Registrar Personal del Hotel
formRegistro.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Captura de datos
  const nombre = document.getElementById("nombre").value.trim();
  const rol = document.getElementById("rol").value; 
  const correo = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  // --- VALIDACIONES CON SWEETALERT ---
  if (password.length < 6) {
    Swal.fire({
      icon: 'warning',
      title: 'Contraseña débil',
      text: 'Por seguridad, debe tener al menos 6 caracteres.',
      confirmButtonColor: COLOR_HOTEL
    });
    return;
  }

  if (!rol) {
    Swal.fire({
      icon: 'warning',
      title: 'Falta información',
      text: 'Por favor, asigne un rol al trabajador.',
      confirmButtonColor: COLOR_HOTEL
    });
    return;
  }

  // Mostrar indicador de carga mientras procesa
  Swal.fire({
    title: 'Procesando registro...',
    text: 'Espere un momento por favor',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    // 1. Crear usuario en Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
    const user = userCredential.user;

    // 2. Actualizar el nombre en el perfil de Auth
    await updateProfile(user, { displayName: nombre });

    // 3. Guardar información extendida en Firestore
    await setDoc(doc(db, "usuarios", user.uid), {
      uid: user.uid,
      nombre: nombre,
      correo: correo,
      rol: rol,
      fechaRegistro: serverTimestamp(),
      estado: "Activo"
    });

    // --- ÉXITO ---
    Swal.fire({
      icon: 'success',
      title: '¡Registro Exitoso!',
      text: `Se ha creado la cuenta para: ${nombre} (${rol})`,
      confirmButtonColor: COLOR_HOTEL,
      confirmButtonText: 'Ir al Login'
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = "login.html";
      }
    });

  } catch (error) {
    console.error("Error en el registro:", error);
    let mensaje = "Ocurrió un error al procesar el registro.";
    
    // Gestión de errores de Firebase específicos
    if (error.code === "auth/email-already-in-use") {
        mensaje = "Este correo ya está asignado a otro trabajador.";
    } else if (error.code === "auth/invalid-email") {
        mensaje = "El formato del correo electrónico no es válido.";
    } else if (error.code === "auth/weak-password") {
        mensaje = "La contraseña elegida es muy débil.";
    }
    
    // --- ERROR ---
    Swal.fire({
      icon: 'error',
      title: 'Error de registro',
      text: mensaje,
      confirmButtonColor: COLOR_HOTEL
    });
  }
});