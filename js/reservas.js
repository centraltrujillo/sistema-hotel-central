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

let todasLasReservas = []; // Caché local para filtrado rápido

// 1. ESCUCHAR CAMBIOS DE FIREBASE
onSnapshot(query(collection(db, "reservas"), orderBy("createdAt", "desc")), (snapshot) => {
    todasLasReservas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderizarTabla();
});

// 2. FUNCIÓN DE RENDERIZADO (Con límite de 10)
function renderizarTabla() {
    const busqueda = buscador.value.toLowerCase();
    const estado = filtro.value;

    const filtradas = todasLasReservas.filter(res => {
        const coincideBusqueda = res.huesped.toLowerCase().includes(busqueda) || res.habitacion.includes(busqueda);
        const coincideEstado = (estado === "todos" || res.estado === estado);
        return coincideBusqueda && coincideEstado;
    });

    // Lógica: Mostrar todo si hay búsqueda, sino solo las 10 últimas
    const mostrarTodo = busqueda !== "" || estado !== "todos";
    const listaFinal = mostrarTodo ? filtradas : filtradas.slice(0, 10);

    tablaReservasBody.innerHTML = listaFinal.map(res => `
        <tr>
            <td>${res.huesped}</td>
            <td>${res.habitacion}</td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td>${res.personas}</td>
            <td>S/ ${res.total}</td>
            <td>${res.estado}</td>
            <td>
                <button class="btn-edit" data-id="${res.id}"><i class="fa-solid fa-edit"></i></button>
                <button class="btn-del" data-id="${res.id}"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    // Indicador si hay más ocultas
    if (!mostrarTodo && filtradas.length > 10) {
        tablaReservasBody.innerHTML += `
            <tr>
                <td colspan="8" style="text-align:center; color: #888; padding: 10px; font-style: italic;">
                    Mostrando 10 de ${filtradas.length} reservas. Usa el buscador para ver más.
                </td>
            </tr>
        `;
    }
}

// 3. GESTIÓN DEL MODAL
btnAbrirModal.onclick = () => {
    form.reset();
    form.removeAttribute("data-id");
    modal.style.display = "flex";
};

document.querySelector(".close-modal").onclick = () => modal.style.display = "none";
document.querySelector(".btn-cancel").onclick = () => modal.style.display = "none";

// 4. EVENTOS DE FILTRO
buscador.addEventListener("input", renderizarTabla);
filtro.addEventListener("change", renderizarTabla);

// 5. ACCIONES (ELIMINAR Y EDITAR - DELEGACIÓN)
tablaReservasBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains("btn-del")) {
        const result = await Swal.fire({ title: '¿Eliminar reserva?', icon: 'warning', showCancelButton: true });
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

// 6. GUARDAR / ACTUALIZAR
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
        estado: "Pendiente"
    };

    try {
        if (id) await updateDoc(doc(db, "reservas", id), datos);
        else await addDoc(collection(db, "reservas"), { ...datos, createdAt: new Date() });
        
        modal.style.display = "none";
        form.reset();
        Swal.fire("Éxito", "Operación realizada", "success");
    } catch (error) {
        Swal.fire("Error", "No se pudo guardar la reserva", "error");
    }
});