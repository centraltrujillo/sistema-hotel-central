import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, addDoc, collection, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Obtener ID de la habitación de la URL (ej: detalle_habitacion.html?hab=201)
const urlParams = new URLSearchParams(window.location.search);
const habNum = urlParams.get('hab');
let currentUser = null;

document.getElementById("tituloHab").textContent = `Habitación ${habNum}`;

// Verificar usuario
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  const userDoc = await getDoc(doc(db, "usuarios", user.uid));
  if (userDoc.exists()) {
    document.getElementById("responsable").textContent = `Revisado por: ${userDoc.data().nombre}`;
  }
});

// Guardar Reporte
document.getElementById("checkForm").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  
  // Convertir formData a objeto plano, asegurando que los checkboxes sean booleanos
  const reportData = {};
  formData.forEach((value, key) => {
    reportData[key] = true; // Si está en FormData, significa que fue marcado
  });
  
  // Asegurar que los checkboxes no marcados sean 'false'
  const checkboxes = e.target.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    reportData[cb.name] = cb.checked;
  });

  try {
    // 1. Guardar reporte en la colección 'reportes_diarios'
    await addDoc(collection(db, "reportes_diarios"), {
      ...reportData,
      habitacion_id: habNum,
      fecha_hora: serverTimestamp(),
      usuario_id: currentUser.uid,
      empleado_nombre: document.getElementById("responsable").textContent.replace("Revisado por: ", "")
    });

    // 2. Actualizar estado de la habitación en colección 'habitaciones'
    await updateDoc(doc(db, "habitaciones", habNum), {
      estado: reportData.requiere_mantenimiento ? "Mantenimiento" : "Disponible",
      ultima_revision: serverTimestamp(),
      responsable_revision: document.getElementById("responsable").textContent.replace("Revisado por: ", "")
    });

    alert("Reporte guardado exitosamente");
    window.location.href = "dashboard.html";

  } catch (error) {
    console.error("Error al guardar: ", error);
    alert("Error al guardar el reporte");
  }
};