import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, getDoc, where, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const tablaReservasBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const btnAbrirModal = document.getElementById("btnAbrirModal");
const buscador = document.getElementById("buscarReserva");
const filtro = document.getElementById("filtroReserva");
const selectHabitacion = document.getElementById("resHabitacion");

let todasLasReservas = [];

// --- 1. GESTIÓN DE HABITACIONES Y DISPONIBILIDAD ---
const LISTA_HABITACIONES = ["201", "202", "203", "204", "301", "302", "303", "304", "401", "402", "403", "404", "405"];

function cargarHabitaciones(valorSeleccionado = "") {
    selectHabitacion.innerHTML = '<option value="" disabled selected>Seleccione habitación...</option>';
    LISTA_HABITACIONES.forEach(hab => {
        const option = document.createElement("option");
        option.value = hab;
        option.textContent = `Habitación ${hab}`;
        if (hab === valorSeleccionado) option.selected = true;
        selectHabitacion.appendChild(option);
    });
}

function actualizarDisponibilidad() {
    const fechaInicio = document.getElementById("resCheckIn").value;
    const fechaFin = document.getElementById("resCheckOut").value;
    const idEdicion = form.dataset.id;

    if (!fechaInicio || !fechaFin) return;

    const inicioJS = new Date(fechaInicio);
    const finJS = new Date(fechaFin);

    const habsOcupadas = todasLasReservas
        .filter(res => {
            if (idEdicion && res.id === idEdicion) return false;
            if (res.estado === "Completada" || res.estado === "Cancelada") return false;
            const resInicio = new Date(res.checkIn);
            const resFin = new Date(res.checkOut);
            return (inicioJS < resFin && finJS > resInicio);
        })
        .map(res => res.habitacion);

    selectHabitacion.innerHTML = '<option value="" disabled selected>Seleccione habitación...</option>';
    
    LISTA_HABITACIONES.forEach(hab => {
        const estaOcupada = habsOcupadas.includes(hab);
        const option = document.createElement("option");
        option.value = hab;
        option.textContent = hab + (estaOcupada ? " (OCUPADA)" : " (Disponible)");
        option.disabled = estaOcupada;
        if (estaOcupada) option.style.color = "#94a3b8";
        selectHabitacion.appendChild(option);
    });
}

// --- 2. FIREBASE Y UI ---
onSnapshot(query(collection(db, "reservas"), orderBy("createdAt", "desc")), (snapshot) => {
    todasLasReservas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    actualizarContadores();
    renderizarTabla();
});

function actualizarContadores() {
    document.getElementById("resTotal").innerText = todasLasReservas.length;
    document.getElementById("resConf").innerText = todasLasReservas.filter(r => r.estado === "Confirmada").length;
    document.getElementById("resPend").innerText = todasLasReservas.filter(r => r.estado === "Pendiente").length;
    document.getElementById("resComp").innerText = todasLasReservas.filter(r => r.estado === "Completada").length;
}

function renderizarTabla() {
    const busqueda = buscador.value.toLowerCase();
    const estadoFiltro = filtro.value;

    const filtradas = todasLasReservas.filter(res => {
        const coincideBusqueda = res.huesped.toLowerCase().includes(busqueda) || res.habitacion.includes(busqueda);
        const coincideEstado = (estadoFiltro === "todos" || res.estado === estadoFiltro);
        return coincideBusqueda && coincideEstado;
    });

    tablaReservasBody.innerHTML = filtradas.slice(0, 10).map(res => `
        <tr>
            <td><strong>${res.huesped}</strong><br><small style="color:gray">Por: ${res.registradoPor || 'Sistema'}</small></td>
            <td>Hab. ${res.habitacion}</td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td>${res.personas}</td>
            <td>S/ ${parseFloat(res.total).toFixed(2)}</td>
            <td>
                <select class="status-select select-dinamico" data-id="${res.id}">
                    <option value="Pendiente" ${res.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="Confirmada" ${res.estado === 'Confirmada' ? 'selected' : ''}>Confirmada</option>
                    <option value="Completada" ${res.estado === 'Completada' ? 'selected' : ''}>Completada</option>
                </select>
            </td>
            <td>
                <button class="btn-edit" data-id="${res.id}"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-del" data-id="${res.id}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

// --- 3. EVENTOS ---
tablaReservasBody.addEventListener("change", async (e) => {
    if (e.target.classList.contains("select-dinamico")) {
        await updateDoc(doc(db, "reservas", e.target.dataset.id), { estado: e.target.value });
        Swal.fire({ title: "Estado actualizado", icon: "success", timer: 1000, showConfirmButton: false });
    }
});

tablaReservasBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains("btn-del")) {
        const result = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#800020' });
        if (result.isConfirmed) await deleteDoc(doc(db, "reservas", id));
    }

    if (btn.classList.contains("btn-edit")) {
        const snap = await getDoc(doc(db, "reservas", id));
        const data = snap.data();
        document.getElementById("resHuesped").value = data.huesped;
        document.getElementById("resCheckIn").value = data.checkIn;
        document.getElementById("resCheckOut").value = data.checkOut;
        document.getElementById("resPersonas").value = data.personas;
        document.getElementById("resPrecio").value = data.total;
        cargarHabitaciones(data.habitacion); // Cargamos y pre-seleccionamos
        form.dataset.id = id;
        modal.style.display = "flex";
    }
});

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const idExistente = form.dataset.id;
    const nombreHuesped = document.getElementById("resHuesped").value;
    const nombreResponsable = JSON.parse(localStorage.getItem("userSession"))?.nombre || "Admin";

    try {
        const qH = query(collection(db, "huespedes"), where("nombre", "==", nombreHuesped));
        const snapH = await getDocs(qH);
        if (snapH.empty) {
            await addDoc(collection(db, "huespedes"), { nombre: nombreHuesped, fechaRegistro: serverTimestamp() });
        }

        const datosReserva = {
            huesped: nombreHuesped,
            habitacion: selectHabitacion.value,
            checkIn: document.getElementById("resCheckIn").value,
            checkOut: document.getElementById("resCheckOut").value,
            personas: document.getElementById("resPersonas").value,
            total: document.getElementById("resPrecio").value,
            registradoPor: nombreResponsable
        };

        if (idExistente) await updateDoc(doc(db, "reservas", idExistente), datosReserva);
        else await addDoc(collection(db, "reservas"), { ...datosReserva, estado: "Pendiente", createdAt: serverTimestamp() });

        modal.style.display = "none";
        form.reset();
        Swal.fire("Éxito", "Proceso completado", "success");
    } catch (e) { Swal.fire("Error", "No se pudo procesar", "error"); }
});

// Listeners de fechas para validar disponibilidad
document.getElementById("resCheckIn").addEventListener("change", actualizarDisponibilidad);
document.getElementById("resCheckOut").addEventListener("change", actualizarDisponibilidad);

btnAbrirModal.onclick = () => { form.reset(); delete form.dataset.id; cargarHabitaciones(); modal.style.display = "flex"; };
document.querySelector(".close-modal").onclick = () => modal.style.display = "none";
document.querySelector(".btn-cancel").onclick = () => modal.style.display = "none";
buscador.addEventListener("input", renderizarTabla);
filtro.addEventListener("change", renderizarTabla);