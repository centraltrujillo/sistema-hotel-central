import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const tablaReservasBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const btnAbrirModal = document.getElementById("btnAbrirModal");
const buscador = document.getElementById("buscarReserva");
const filtro = document.getElementById("filtroReserva");

let todasLasReservas = [];

// 1. ESCUCHAR FIREBASE Y ACTUALIZAR KPIs
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

// 2. RENDERIZAR CON CAMBIO DE ESTADO DINÁMICO
function renderizarTabla() {
    const busqueda = buscador.value.toLowerCase();
    const estadoFiltro = filtro.value;

    const filtradas = todasLasReservas.filter(res => {
        const coincideBusqueda = res.huesped.toLowerCase().includes(busqueda) || res.habitacion.includes(busqueda);
        const coincideEstado = (estadoFiltro === "todos" || res.estado === estadoFiltro);
        return coincideBusqueda && coincideEstado;
    });

    const listaFinal = busqueda === "" && estadoFiltro === "todos" ? filtradas.slice(0, 10) : filtradas;

    tablaReservasBody.innerHTML = listaFinal.map(res => `
        <tr>
            <td><strong>${res.huesped}</strong></td>
            <td>Hab. ${res.habitacion}</td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td>${res.personas}</td>
            <td>S/ ${parseFloat(res.total).toFixed(2)}</td>
            <td>
                <select class="status-select select-dinamico" data-id="${res.id}" data-actual="${res.estado}">
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

// 3. EVENTOS DE TABLA (EDITAR, ELIMINAR, CAMBIAR ESTADO)
tablaReservasBody.addEventListener("change", async (e) => {
    if (e.target.classList.contains("select-dinamico")) {
        const id = e.target.dataset.id;
        const nuevoEstado = e.target.value;
        await updateDoc(doc(db, "reservas", id), { estado: nuevoEstado });
        Swal.fire({ title: "Estado actualizado", icon: "success", timer: 1000, showConfirmButton: false });
    }
});

tablaReservasBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains("btn-del")) {
        const result = await Swal.fire({ title: '¿Eliminar reserva?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#800020' });
        if (result.isConfirmed) await deleteDoc(doc(db, "reservas", id));
    }

    if (btn.classList.contains("btn-edit")) {
        const snap = await getDoc(doc(db, "reservas", id));
        const data = snap.data();
        document.getElementById("resHuesped").value = data.huesped;
        document.getElementById("resHabitacion").value = data.habitacion;
        document.getElementById("resCheckIn").value = data.checkIn;
        document.getElementById("resCheckOut").value = data.checkOut;
        document.getElementById("resPersonas").value = data.personas;
        document.getElementById("resPrecio").value = data.total;
        form.dataset.id = id;
        modal.style.display = "flex";
    }
});

// 4. GUARDAR (SIEMPRE PENDIENTE POR DEFECTO)
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = form.dataset.id;
    const datos = {
        huesped: document.getElementById("resHuesped").value,
        habitacion: document.getElementById("resHabitacion").value,
        checkIn: document.getElementById("resCheckIn").value,
        checkOut: document.getElementById("resCheckOut").value,
        personas: document.getElementById("resPersonas").value,
        total: document.getElementById("resPrecio").value,
        estado: id ? todasLasReservas.find(r => r.id === id).estado : "Pendiente"
    };

    if (id) await updateDoc(doc(db, "reservas", id), datos);
    else await addDoc(collection(db, "reservas"), { ...datos, createdAt: new Date() });
    
    modal.style.display = "none";
    form.reset();
    Swal.fire("Éxito", "Reserva procesada correctamente", "success");
});

// Modal y Buscadores
btnAbrirModal.onclick = () => { form.reset(); delete form.dataset.id; modal.style.display = "flex"; };
document.querySelector(".close-modal").onclick = () => modal.style.display = "none";
document.querySelector(".btn-cancel").onclick = () => modal.style.display = "none";
buscador.addEventListener("input", renderizarTabla);
filtro.addEventListener("change", renderizarTabla);