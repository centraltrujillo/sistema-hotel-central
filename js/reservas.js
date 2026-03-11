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
        
        if (snap.empty) {
            await addDoc(collection(db, "huespedes"), {
                nombre: nombre,
                fechaRegistro: serverTimestamp(),
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
        
        snapshot.forEach(docHab => {
            const habData = docHab.data();
            const option = document.createElement("option");
            // Guardamos como string para el value, pero manejamos como Number para Firebase
            option.value = habData.numero; 
            option.textContent = `Habitación ${habData.numero} - ${habData.tipo}`;
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
            if (res.estado === "Cancelada") return false;
            const resInicio = new Date(res.checkIn);
            const resFin = new Date(res.checkOut);
            return (inicioJS < resFin && finJS > resInicio);
        })
        .map(res => res.habitacion.toString());

    Array.from(selectHabitacion.options).forEach(option => {
        if (option.value === "") return;
        const estaOcupada = habsOcupadas.includes(option.value);
        option.disabled = estaOcupada;
        option.textContent = `Hab. ${option.value} ${estaOcupada ? "(OCUPADA)" : "(Disponible)"}`;
    });
}

// --- 4. SINCRONIZACIÓN DE ESTADO EN HABITACIONES ---
async function sincronizarHabitacion(numeroHab, estadoReserva) {
    // Importante: Convertir a Number para que coincida con tu base de datos
    const num = parseInt(numeroHab);
    const q = query(collection(db, "habitaciones"), where("numero", "==", num));
    const snap = await getDocs(q);

    if (!snap.empty) {
        // Confirmada -> Ocupada | Pendiente/Completada -> Libre (o Limpieza si se desea)
        let nuevoEstado = "Libre";
        if (estadoReserva === "Confirmada") nuevoEstado = "Ocupada";
        if (estadoReserva === "Completada") nuevoEstado = "Limpieza";

        await updateDoc(doc(db, "habitaciones", snap.docs[0].id), { 
            estado: nuevoEstado 
        });
    }
}

// --- 5. RENDERIZADO Y CONTADORES ---
onSnapshot(query(collection(db, "reservas"), orderBy("createdAt", "desc")), (snapshot) => {
    todasLasReservas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderizarTabla();
    actualizarKPIsReservas(); 
});

function actualizarKPIsReservas() {
    const pendientes = todasLasReservas.filter(r => r.estado === "Pendiente").length;
    const confirmadas = todasLasReservas.filter(r => r.estado === "Confirmada").length;
    
    // IDs que deben existir en tus cards de reservas.html
    if(document.getElementById("stat-pendientes")) document.getElementById("stat-pendientes").innerText = pendientes;
    if(document.getElementById("stat-confirmadas")) document.getElementById("stat-confirmadas").innerText = confirmadas;
}

function renderizarTabla() {
    const busqueda = buscador.value.toLowerCase();
    const estadoFiltro = filtro.value;

    const filtradas = todasLasReservas.filter(res => {
        const coincideBusqueda = res.huesped.toLowerCase().includes(busqueda) || res.habitacion.toString().includes(busqueda);
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
                    <option value="Cancelada" ${res.estado === 'Cancelada' ? 'selected' : ''}>Cancelada</option>
                </select>
            </td>
            <td>
                <button class="btn-edit" onclick="abrirEditar('${res.id}')"><i class="fa-solid fa-pen"></i></button>
            </td>
        </tr>
    `).join('');
}

// --- 6. EVENTOS ---
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombreHuesped = document.getElementById("resHuesped").value;
    const habitacion = selectHabitacion.value;

    const datosReserva = {
        huesped: nombreHuesped,
        habitacion: habitacion,
        checkIn: document.getElementById("resCheckIn").value,
        checkOut: document.getElementById("resCheckOut").value,
        personas: document.getElementById("resPersonas").value,
        total: document.getElementById("resPrecio").value
    };

    try {
        if (form.dataset.id) {
            await updateDoc(doc(db, "reservas", form.dataset.id), datosReserva);
            Swal.fire("Actualizado", "Reserva modificada correctamente", "success");
        } else {
            await addDoc(collection(db, "reservas"), { 
                ...datosReserva, 
                estado: "Pendiente", 
                createdAt: serverTimestamp() 
            });
            await registrarHuespedTemporal(nombreHuesped);
            Swal.fire("Guardado", "Nueva reserva registrada", "success");
        }
        modal.style.display = "none";
        form.reset();
    } catch (e) {
        console.error(e);
        Swal.fire("Error", "No se pudo procesar la reserva", "error");
    }
});

// Listener para cambios de estado directos en la tabla
tablaReservasBody.addEventListener("change", async (e) => {
    if (e.target.classList.contains("select-dinamico")) {
        const id = e.target.dataset.id;
        const nuevoEstado = e.target.value;
        
        await updateDoc(doc(db, "reservas", id), { estado: nuevoEstado });
        const resSnap = await getDoc(doc(db, "reservas", id));
        await sincronizarHabitacion(resSnap.data().habitacion, nuevoEstado);
    }
});

btnAbrirModal.onclick = () => { 
    form.reset(); 
    delete form.dataset.id; 
    cargarHabitaciones(); 
    modal.style.display = "flex"; 
};

document.querySelector(".close-modal").onclick = () => modal.style.display = "none";
buscador.addEventListener("input", renderizarTabla);
filtro.addEventListener("change", renderizarTabla);