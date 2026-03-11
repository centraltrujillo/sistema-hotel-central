import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, getDoc, where, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const tablaReservasBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const btnAbrirModal = document.getElementById("btnAbrirModal");
const buscador = document.getElementById("buscarReserva");
const filtro = document.getElementById("filtroReserva");
const selectHabitacion = document.getElementById("resHabitacion");

let todasLasReservas = [];

// --- 1. GESTIÓN DE HUÉSPED AUTOMÁTICA ---
async function registrarHuespedTemporal(nombre) {
    try {
        const q = query(collection(db, "huespedes"), where("nombre", "==", nombre));
        const snap = await getDocs(q);
        
        // Solo creamos si no existe previamente
        if (snap.empty) {
            await addDoc(collection(db, "huespedes"), {
                nombre: nombre,
                fechaRegistro: new Date(),
                categoria: "Regular"
            });
        }
    } catch (error) {
        console.error("Error al sincronizar huésped:", error);
    }
}

// --- 2. CARGA DINÁMICA DE HABITACIONES ---
async function cargarHabitaciones(valorSeleccionado = "") {
    try {
        const q = query(collection(db, "habitaciones"), orderBy("numero", "asc"));
        const snapshot = await getDocs(q);
        
        selectHabitacion.innerHTML = '<option value="" disabled selected>Seleccione habitación...</option>';
        
        snapshot.forEach(doc => {
            const habData = doc.data();
            const option = document.createElement("option");
            option.value = habData.numero;
            option.textContent = `Habitación ${habData.numero}`;
            if (habData.numero.toString() === valorSeleccionado.toString()) option.selected = true;
            selectHabitacion.appendChild(option);
        });
        actualizarDisponibilidad();
    } catch (error) {
        console.error("Error cargando habitaciones:", error);
    }
}

// --- 3. VALIDACIÓN DE DISPONIBILIDAD ---
function actualizarDisponibilidad() {
    const fechaInicio = document.getElementById("resCheckIn").value;
    const fechaFin = document.getElementById("resCheckOut").value;
    if (!fechaInicio || !fechaFin) return;

    const inicioJS = new Date(fechaInicio);
    const finJS = new Date(fechaFin);
    const idEdicion = form.dataset.id;

    const habsOcupadas = todasLasReservas
        .filter(res => {
            if (idEdicion && res.id === idEdicion) return false;
            if (res.estado === "Completada" || res.estado === "Cancelada") return false;
            const resInicio = new Date(res.checkIn);
            const resFin = new Date(res.checkOut);
            return (inicioJS < resFin && finJS > resInicio);
        })
        .map(res => res.habitacion.toString());

    Array.from(selectHabitacion.options).forEach(option => {
        if (option.value === "") return;
        const estaOcupada = habsOcupadas.includes(option.value);
        option.disabled = estaOcupada;
        option.textContent = option.value + (estaOcupada ? " (OCUPADA)" : " (Disponible)");
    });
}

// --- 4. SINCRONIZACIÓN DE ESTADO EN HABITACIONES ---
async function sincronizarHabitacion(numeroHab, estadoReserva) {
    const q = query(collection(db, "habitaciones"), where("numero", "==", numeroHab.toString()));
    const snap = await getDocs(q);
    if (!snap.empty) {
        const nuevoEstado = (estadoReserva === "Confirmada") ? "Ocupada" : "Libre";
        await updateDoc(doc(db, "habitaciones", snap.docs[0].id), { estado: nuevoEstado });
    }
}

// --- 5. RENDERIZADO ---
onSnapshot(query(collection(db, "reservas"), orderBy("createdAt", "desc")), (snapshot) => {
    todasLasReservas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderizarTabla();
});

function renderizarTabla() {
    const busqueda = buscador.value.toLowerCase();
    const estadoFiltro = filtro.value;

    const filtradas = todasLasReservas.filter(res => {
        const coincideBusqueda = res.huesped.toLowerCase().includes(busqueda) || res.habitacion.includes(busqueda);
        const coincideEstado = (estadoFiltro === "todos" || res.estado === estadoFiltro);
        return coincideBusqueda && coincideEstado;
    });

    tablaReservasBody.innerHTML = filtradas.map(res => `
        <tr>
            <td><strong>${res.huesped}</strong></td>
            <td>Hab. ${res.habitacion}</td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td>
                <select class="status-select select-dinamico" data-id="${res.id}">
                    <option value="Pendiente" ${res.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="Confirmada" ${res.estado === 'Confirmada' ? 'selected' : ''}>Confirmada</option>
                    <option value="Completada" ${res.estado === 'Completada' ? 'selected' : ''}>Completada</option>
                </select>
            </td>
            <td>
                <button class="btn-edit" data-id="${res.id}"><i class="fa-solid fa-pen-to-square"></i></button>
            </td>
        </tr>
    `).join('');
}

// --- 6. EVENTOS Y SUBMIT ---
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombreHuesped = document.getElementById("resHuesped").value;
    const datosReserva = {
        huesped: nombreHuesped,
        habitacion: selectHabitacion.value,
        checkIn: document.getElementById("resCheckIn").value,
        checkOut: document.getElementById("resCheckOut").value,
        personas: document.getElementById("resPersonas").value,
        total: document.getElementById("resPrecio").value
    };

    if (form.dataset.id) {
        await updateDoc(doc(db, "reservas", form.dataset.id), datosReserva);
    } else {
        await addDoc(collection(db, "reservas"), { ...datosReserva, estado: "Pendiente", createdAt: serverTimestamp() });
        // Sincronización automática a modulo huéspedes
        await registrarHuespedTemporal(nombreHuesped);
    }

    modal.style.display = "none";
    Swal.fire("Éxito", "Reserva guardada", "success");
});

tablaReservasBody.addEventListener("change", async (e) => {
    if (e.target.classList.contains("select-dinamico")) {
        const id = e.target.dataset.id;
        const nuevoEstado = e.target.value;
        await updateDoc(doc(db, "reservas", id), { estado: nuevoEstado });
        const resSnap = await getDoc(doc(db, "reservas", id));
        await sincronizarHabitacion(resSnap.data().habitacion, nuevoEstado);
    }
});

btnAbrirModal.onclick = () => { form.reset(); delete form.dataset.id; cargarHabitaciones(); modal.style.display = "flex"; };
document.querySelector(".close-modal").onclick = () => modal.style.display = "none";
document.getElementById("resCheckIn").addEventListener("change", actualizarDisponibilidad);
document.getElementById("resCheckOut").addEventListener("change", actualizarDisponibilidad);
buscador.addEventListener("input", renderizarTabla);
filtro.addEventListener("change", renderizarTabla);