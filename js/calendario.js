import { db, auth } from "./firebaseconfig.js";
import { 
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// ========================================================
// 🔹 Variables
// ========================================================
const daysContainer = document.getElementById("days");
const monthYear = document.getElementById("monthYear");
const modal = document.getElementById("modal");
const closeModal = document.querySelector(".close");
const form = document.getElementById("eventForm");
const view = document.getElementById("eventView");

const btnInicio = document.getElementById("btnInicio");
btnInicio.addEventListener("click", () => window.location.href = "dashboard.html");

let currentDate = new Date();
let eventos = [];
let userRol = "";
let eventoEditando = null;

// ========================================================
// 🔹 Autenticación y rol
// ========================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // Carga directa del rol del usuario logueado
  const usuarioRef = await getDoc(doc(db, "usuarios", user.uid));
  if (usuarioRef.exists()) {
    userRol = usuarioRef.data().rol;
  }

  await cargarEventos();
});

// ========================================================
// 🔹 Renderizar calendario (con estilo y colores por tipo)
// ========================================================
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const months = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  monthYear.textContent = `${months[month]} ${year}`;
  daysContainer.innerHTML = "";

  // Espacios vacíos antes del 1
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.classList.add("empty-day");
    daysContainer.appendChild(empty);
  }

  // Días del mes
  for (let day = 1; day <= lastDate; day++) {
    const fecha = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const div = document.createElement("div");
    div.textContent = day;
    div.classList.add("day");

    // Día actual
    const hoy = new Date();
    if (
      day === hoy.getDate() &&
      month === hoy.getMonth() &&
      year === hoy.getFullYear()
    ) div.classList.add("today");

    // Días con eventos (colores por tipo)
    const evento = eventos.find(e => e.fecha === fecha);
    if (evento) {
      div.classList.add("event-day");

      // Convertir tipo a string seguro y limpiar espacios
      const tipo = String(evento.tipo || "").trim();

      switch (tipo.toLowerCase()) {
        case "examen":
          div.classList.add("evento-examen");
          break;
        case "reunión":
        case "reunion": // por si viene sin tilde
          div.classList.add("evento-reunion");
          break;
        case "feriado":
          div.classList.add("evento-feriado");
          break;
        default:
          div.classList.add("evento-otro");
      }
    }

    div.addEventListener("click", () => abrirModal(fecha));
    div.style.animationDelay = `${day * 0.01}s`;
    daysContainer.appendChild(div);
  }
}


// ========================================================
// 🔹 Navegación
// ========================================================
document.getElementById("prev").addEventListener("click", () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById("next").addEventListener("click", () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  renderCalendar();
});

// ========================================================
// 🔹 Cargar eventos
// ========================================================
async function cargarEventos() {
  const snapshot = await getDocs(collection(db, "calendario"));
  eventos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderCalendar();
}

// ========================================================
// 🔹 Modal
// ========================================================
function abrirModal(fechaSeleccionada) {
  modal.style.display = "flex";
  modal.classList.add("fade-in");
  form.reset();
  eventoEditando = null;
  document.getElementById("fecha").value = fechaSeleccionada;

  const eventoExistente = eventos.find(e => e.fecha === fechaSeleccionada);

  if (userRol === "Admin" || userRol === "Administrativo") {
    view.style.display = "none";
    form.style.display = "block";
    document.getElementById("guardarEvento").style.display = "inline-block";
    document.getElementById("eliminarEvento").style.display = eventoExistente ? "inline-block" : "none";

    if (eventoExistente) {
      document.getElementById("titulo").value = eventoExistente.titulo;
      document.getElementById("descripcion").value = eventoExistente.descripcion;
      document.getElementById("hora").value = eventoExistente.hora || "";
      document.getElementById("tipo").value = eventoExistente.tipo || "";
      eventoEditando = eventoExistente;
    }
  } else {
    form.style.display = "none";
    view.style.display = "block";

    if (eventoExistente) {
      document.getElementById("viewTitulo").textContent = eventoExistente.titulo;
      document.getElementById("viewDescripcion").textContent = eventoExistente.descripcion;
      document.getElementById("viewFecha").textContent = eventoExistente.fecha;
      document.getElementById("viewHora").textContent = eventoExistente.hora || "—";
      document.getElementById("viewTipo").textContent = eventoExistente.tipo || "—";
    } else {
      document.getElementById("viewTitulo").textContent = "Sin eventos";
      document.getElementById("viewDescripcion").textContent = "No hay eventos programados para esta fecha.";
      document.getElementById("viewFecha").textContent = fechaSeleccionada;
      document.getElementById("viewHora").textContent = "—";
      document.getElementById("viewTipo").textContent = "—";
    }
  }
}

closeModal.addEventListener("click", () => {
  modal.classList.remove("fade-in");
  modal.classList.add("fade-out");
  setTimeout(() => {
    modal.style.display = "none";
    modal.classList.remove("fade-out");
  }, 250);
});

// ========================================================
// 🔹 Guardar evento (crear/editar)
// ========================================================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (userRol !== "Admin" && userRol !== "Administrativo") {
    Swal.fire("⛔ Permiso denegado", "Solo los administradores pueden modificar eventos.", "error");
    return;
  }

  const nuevoEvento = {
    titulo: document.getElementById("titulo").value.trim(),
    descripcion: document.getElementById("descripcion").value.trim(),
    fecha: document.getElementById("fecha").value,
    hora: document.getElementById("hora").value,
    tipo: document.getElementById("tipo").value,
    creadoPor: auth.currentUser.uid
  };

  try {
    if (eventoEditando) {
      await updateDoc(doc(db, "calendario", eventoEditando.id), nuevoEvento);
      Swal.fire("✅ Actualizado", "El evento fue modificado correctamente.", "success");
    } else {
      await addDoc(collection(db, "calendario"), nuevoEvento);
      Swal.fire("🎉 Evento agregado", "El evento se creó correctamente.", "success");
    }
    modal.style.display = "none";
    cargarEventos();
  } catch (error) {
    console.error("Error al guardar:", error);
    Swal.fire("⚠️ Error", "No se pudo guardar el evento.", "error");
  }
});

// ========================================================
// 🔹 Eliminar evento
// ========================================================
document.getElementById("eliminarEvento").addEventListener("click", async () => {
  if (userRol !== "Admin" && userRol !== "Administrativo") {
    Swal.fire("⛔ Permiso denegado", "Solo los administradores pueden eliminar eventos.", "error");
    return;
  }

  if (eventoEditando) {
    const result = await Swal.fire({
      title: "¿Eliminar este evento?",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });

    if (result.isConfirmed) {
      await deleteDoc(doc(db, "calendario", eventoEditando.id));
      Swal.fire("🗑️ Eliminado", "El evento fue eliminado correctamente.", "success");
      modal.style.display = "none";
      cargarEventos();
    }
  }
});
