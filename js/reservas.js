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

// --- FUNCIONES DE INTERFAZ ---
const cerrarModal = () => {
    modal.style.display = "none";
    form.reset();
    delete form.dataset.id;
};

// --- 1. DISPONIBILIDAD DE HABITACIONES ---
async function cargarHabitacionesDisponibles() {
    const fechaInicio = document.getElementById("resCheckIn").value;
    const fechaFin = document.getElementById("resCheckOut").value;
    
    try {
        const q = query(collection(db, "habitaciones"), orderBy("numero", "asc"));
        const snapHab = await getDocs(q);
        
        selectHabitacion.innerHTML = '<option value="" disabled selected>Seleccione habitación...</option>';
        
        // Si no hay fechas, mostramos todas pero advertimos
        const filtrarPorFecha = fechaInicio && fechaFin;
        let habsOcupadas = [];

        if (filtrarPorFecha) {
            const inicioJS = new Date(fechaInicio + "T00:00:00");
            const finJS = new Date(fechaFin + "T00:00:00");

            habsOcupadas = todasLasReservas
                .filter(res => {
                    if (form.dataset.id && res.id === form.dataset.id) return false;
                    if (res.estado === "Cancelada") return false;
                    const resIn = new Date(res.checkIn + "T00:00:00");
                    const resOut = new Date(res.checkOut + "T00:00:00");
                    return (inicioJS < resOut && finJS > resIn);
                })
                .map(res => res.habitacion.toString());
        }

        snapHab.forEach(docHab => {
            const hab = docHab.data();
            const estaOcupada = habsOcupadas.includes(hab.numero.toString());
            const option = document.createElement("option");
            option.value = hab.numero;
            option.disabled = estaOcupada;
            option.textContent = `Hab. ${hab.numero} - ${hab.tipo} ${estaOcupada ? '(OCUPADA)' : '(Disponible)'}`;
            selectHabitacion.appendChild(option);
        });
    } catch (e) { console.error("Error cargando habitaciones:", e); }
}

// --- 2. KPIs Y RENDERIZADO ---
function actualizarKPIs() {
    const stats = {
        total: todasLasReservas.length,
        pend: todasLasReservas.filter(r => r.estado === "Pendiente").length,
        conf: todasLasReservas.filter(r => r.estado === "Confirmada").length,
        comp: todasLasReservas.filter(r => r.estado === "Completada").length
    };
    document.getElementById("stat-total").innerText = stats.total;
    document.getElementById("stat-pendientes").innerText = stats.pend;
    document.getElementById("stat-confirmadas").innerText = stats.conf;
    document.getElementById("stat-completadas").innerText = stats.comp;
}

function renderizarTabla() {
    const busqueda = buscador.value.toLowerCase();
    const filtradas = todasLasReservas.filter(res => {
        const coincideBusqueda = res.huesped.toLowerCase().includes(busqueda) || res.habitacion.toString().includes(busqueda);
        const coincideEstado = (filtro.value === "todos" || res.estado === filtro.value);
        return coincideBusqueda && coincideEstado;
    });

    tablaReservasBody.innerHTML = filtradas.map(res => `
        <tr>
            <td><strong>${res.huesped}</strong><br><small style="color:#64748b">ID: ${res.id.slice(-5)}</small></td>
            <td><span class="hab-badge">Hab. ${res.habitacion}</span></td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td>${res.personas}</td>
            <td><strong>S/ ${res.total}</strong></td>
            <td>
                <select class="status-select status-${res.estado.toLowerCase()}" onchange="cambiarEstadoReserva('${res.id}', this.value)">
                    <option value="Pendiente" ${res.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="Confirmada" ${res.estado === 'Confirmada' ? 'selected' : ''}>Confirmada</option>
                    <option value="Completada" ${res.estado === 'Completada' ? 'selected' : ''}>Completada</option>
                    <option value="Cancelada" ${res.estado === 'Cancelada' ? 'selected' : ''}>Cancelada</option>
                </select>
            </td>
            <td><button class="btn-edit-table" onclick="cargarParaEditar('${res.id}')"><i class="fa-solid fa-pen"></i></button></td>
        </tr>
    `).join('');
}

// --- 3. LOGICA DE FIREBASE ---
onSnapshot(query(collection(db, "reservas"), orderBy("createdAt", "desc")), (snap) => {
    todasLasReservas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarTabla();
    actualizarKPIs();
});

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
        huesped: document.getElementById("resHuesped").value,
        habitacion: parseInt(selectHabitacion.value), // IMPORTANTE: Guardar como Number
        checkIn: document.getElementById("resCheckIn").value,
        checkOut: document.getElementById("resCheckOut").value,
        personas: document.getElementById("resPersonas").value,
        total: document.getElementById("resPrecio").value,
    };

    if (form.dataset.id) {
        await updateDoc(doc(db, "reservas", form.dataset.id), data);
    } else {
        await addDoc(collection(db, "reservas"), { ...data, estado: "Pendiente", createdAt: serverTimestamp() });
    }
    cerrarModal();
    Swal.fire("Éxito", "Reserva procesada", "success");
});

// Exponer funciones al window para los onclick de la tabla
window.cambiarEstadoReserva = async (id, nuevoEstado) => {
    await updateDoc(doc(db, "reservas", id), { estado: nuevoEstado });
};

window.cargarParaEditar = async (id) => {
    const res = todasLasReservas.find(r => r.id === id);
    document.getElementById("resHuesped").value = res.huesped;
    document.getElementById("resCheckIn").value = res.checkIn;
    document.getElementById("resCheckOut").value = res.checkOut;
    document.getElementById("resPersonas").value = res.personas;
    document.getElementById("resPrecio").value = res.total;
    form.dataset.id = id;
    await cargarHabitacionesDisponibles();
    selectHabitacion.value = res.habitacion;
    modal.style.display = "flex";
};

// --- EVENTOS ---
btnAbrirModal.onclick = () => { form.reset(); delete form.dataset.id; cargarHabitacionesDisponibles(); modal.style.display = "flex"; };
document.querySelector(".close-modal").onclick = cerrarModal;
document.querySelector(".btn-cancel").onclick = cerrarModal;
document.getElementById("resCheckIn").onchange = cargarHabitacionesDisponibles;
document.getElementById("resCheckOut").onchange = cargarHabitacionesDisponibles;
buscador.oninput = renderizarTabla;
filtro.onchange = renderizarTabla;