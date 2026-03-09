import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, query, orderBy, getDocs, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// DOM
const modal = document.getElementById('modalReserva');
const btnCerrar = document.querySelector('.close-modal');
const btnCancelar = document.querySelector('.btn-cancel');
const form = document.getElementById('formNuevaReserva');
const tablaBody = document.getElementById('tablaReservasBody');
const datalist = document.getElementById('listaHuespedesExistentes');

// KPIs
const resTotal = document.getElementById('resTotal');
const resConf = document.getElementById('resConf');
const resPend = document.getElementById('resPend');
const resComp = document.getElementById('resComp');

// --- ABRIR/CERRAR MODAL ---
document.querySelector('.btn-add').onclick = () => {
    cargarHabitacionesLibres();
    cargarSugerenciasHuespedes();
    modal.style.display = 'flex';
};

const cerrarModal = () => { modal.style.display = 'none'; form.reset(); };
btnCerrar.onclick = cerrarModal;
btnCancelar.onclick = cerrarModal;

// --- CARGAR DATOS PARA EL FORMULARIO ---
async function cargarHabitacionesLibres() {
    const selectHab = document.getElementById('resHabitacion');
    const q = query(collection(db, "habitaciones"), where("estado", "==", "Libre"));
    const snap = await getDocs(q);
    selectHab.innerHTML = '<option value="">Seleccionar...</option>';
    snap.forEach(doc => {
        selectHab.innerHTML += `<option value="${doc.data().numero}">Hab. ${doc.data().numero}</option>`;
    });
}

function cargarSugerenciasHuespedes() {
    onSnapshot(collection(db, "huespedes"), (snap) => {
        datalist.innerHTML = '';
        snap.forEach(doc => {
            const opt = document.createElement('option');
            opt.value = doc.data().nombre;
            datalist.appendChild(opt);
        });
    });
}

// --- GUARDAR RESERVA ---
form.onsubmit = async (e) => {
    e.preventDefault();
    
    // Obtener el nombre del recepcionista logueado
    const session = JSON.parse(localStorage.getItem("userSession"));
    const nombreResponsable = session ? session.nombre : "Admin/Sistema";

    const nombreHuesped = document.getElementById('resHuesped').value;

    // Verificar si el huésped existe, si no, crearlo
    const qH = query(collection(db, "huespedes"), where("nombre", "==", nombreHuesped));
    const snapH = await getDocs(qH);
    if (snapH.empty) {
        await addDoc(collection(db, "huespedes"), {
            nombre: nombreHuesped,
            fechaRegistro: serverTimestamp(),
            categoria: "Regular"
        });
    }

    const reserva = {
        huesped: nombreHuesped,
        habitacion: document.getElementById('resHabitacion').value,
        checkIn: document.getElementById('resCheckIn').value,
        checkOut: document.getElementById('resCheckOut').value,
        personas: document.getElementById('resPersonas').value,
        total: document.getElementById('resPrecio').value,
        estado: "Confirmada",
        fechaCreacion: serverTimestamp(),
        registradoPor: nombreResponsable // <-- NUEVO CAMPO
    };

    try {
        await addDoc(collection(db, "reservas"), reserva);
        alert(`Reserva registrada con éxito por ${nombreResponsable}`);
        cerrarModal();
    } catch (err) { console.error(err); }
};

// --- RENDERIZAR TABLA EN TIEMPO REAL ---
function renderReservas() {
    const q = query(collection(db, "reservas"), orderBy("fechaCreacion", "desc"));
    onSnapshot(q, (snapshot) => {
        tablaBody.innerHTML = '';
        let t = 0, c = 0, p = 0, co = 0;

        snapshot.forEach(doc => {
            const r = doc.data();
            t++;
            if(r.estado === "Confirmada") c++;
            else if(r.estado === "Pendiente") p++;
            else co++;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="huesped-cell">
                    <span>${r.huesped}</span>
                    <small style="display:block; color:#94a3b8; font-size:11px;">Registró: ${r.registradoPor || 'N/A'}</small>
                </td>
                <td>Hab. ${r.habitacion}</td>
                <td>${r.checkIn}</td>
                <td>${r.checkOut}</td>
                <td>${r.personas}</td>
                <td>S/ ${r.total}</td>
                <td><span class="status-pill status-${r.estado}">${r.estado}</span></td>
                <td><div class="action-btns"><i class="fa-solid fa-trash"></i></div></td>
            `;
            tablaBody.appendChild(tr);
        });

        resTotal.innerText = t; resConf.innerText = c;
        resPend.innerText = p; resComp.innerText = co;
    });
}

renderReservas();