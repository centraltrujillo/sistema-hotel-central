import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    updateDoc, 
    deleteDoc, 
    doc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- 1. ELEMENTOS DEL DOM ---
const tablaReservasBody = document.getElementById("tablaReservasBody");
const formNuevaReserva = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const btnAbrirModal = document.getElementById("btnAbrirModal");
const selectHabitacion = document.getElementById("resHabitacion");

// --- 2. GESTIÓN DEL MODAL ---
btnAbrirModal.onclick = () => modal.style.display = "flex";
document.querySelector(".close-modal").onclick = () => modal.style.display = "none";
document.querySelector(".btn-cancel").onclick = () => modal.style.display = "none";

// --- 3. CARGAR HABITACIONES DISPONIBLES EN SELECT ---
onSnapshot(query(collection(db, "habitaciones"), orderBy("numero", "asc")), (snapshot) => {
    selectHabitacion.innerHTML = '<option value="">Seleccionar...</option>';
    snapshot.forEach(doc => {
        const hab = doc.data();
        if (hab.estado === "Libre") {
            const opt = document.createElement("option");
            opt.value = hab.numero;
            opt.textContent = `Hab. ${hab.numero} - ${hab.tipo}`;
            selectHabitacion.appendChild(opt);
        }
    });
});

// --- 4. GUARDAR NUEVA RESERVA ---
formNuevaReserva.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const nuevaReserva = {
        huesped: document.getElementById("resHuesped").value,
        habitacion: document.getElementById("resHabitacion").value,
        checkIn: document.getElementById("resCheckIn").value,
        checkOut: document.getElementById("resCheckOut").value,
        personas: document.getElementById("resPersonas").value,
        total: document.getElementById("resPrecio").value,
        estado: "Confirmada",
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, "reservas"), nuevaReserva);
        Swal.fire({ icon: 'success', title: '¡Reserva guardada!', confirmButtonColor: '#800020' });
        modal.style.display = "none";
        formNuevaReserva.reset();
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar la reserva', confirmButtonColor: '#800020' });
    }
});

// --- 5. RENDERIZAR TABLA EN TIEMPO REAL ---
onSnapshot(query(collection(db, "reservas"), orderBy("createdAt", "desc")), (snapshot) => {
    tablaReservasBody.innerHTML = "";
    let total = 0, conf = 0, pend = 0, comp = 0;

    snapshot.forEach(docSnap => {
        const res = docSnap.data();
        const id = docSnap.id;
        
        total++;
        if (res.estado === "Confirmada") conf++;
        else if (res.estado === "Pendiente") pend++;
        else comp++;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${res.huesped}</td>
            <td>${res.habitacion}</td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td>${res.personas}</td>
            <td>S/ ${res.total}</td>
            <td>
                <select class="status-select" onchange="actualizarEstado('${id}', this.value)">
                    <option value="Pendiente" ${res.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="Confirmada" ${res.estado === 'Confirmada' ? 'selected' : ''}>Confirmada</option>
                    <option value="Completada" ${res.estado === 'Completada' ? 'selected' : ''}>Completada</option>
                </select>
            </td>
            <td>
                <button class="btn-del" onclick="eliminarReserva('${id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tablaReservasBody.appendChild(row);
    });

    document.getElementById("resTotal").innerText = total;
    document.getElementById("resConf").innerText = conf;
    document.getElementById("resPend").innerText = pend;
    document.getElementById("resComp").innerText = comp;
});

// --- 6. FUNCIONES GLOBALES (Llamadas desde el HTML) ---
window.actualizarEstado = async (id, nuevoEstado) => {
    try {
        await updateDoc(doc(db, "reservas", id), { estado: nuevoEstado });
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Estado actualizado', showConfirmButton: false, timer: 2000 });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error al actualizar', confirmButtonColor: '#800020' });
    }
};

window.eliminarReserva = async (id) => {
    const result = await Swal.fire({
        title: '¿Está seguro?',
        text: "No podrá recuperar esta reserva",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#800020',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, eliminar'
    });
    
    if (result.isConfirmed) {
        await deleteDoc(doc(db, "reservas", id));
    }
};