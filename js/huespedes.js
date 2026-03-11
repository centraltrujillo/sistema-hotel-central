import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, getDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM ---
const modal = document.getElementById('modalHuesped');
const formHuesped = document.getElementById('formHuesped');
const container = document.getElementById('huespedesContainer');
const modalTitle = document.getElementById('modalTitle');

// KPIs
const totalH = document.getElementById('totalHuespedesHoy');

// --- CARGAR DATOS EN TIEMPO REAL ---
function cargarHuespedes() {
    const q = query(collection(db, "huespedes"), orderBy("fechaRegistro", "desc"));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        totalH.innerText = snapshot.size;

        snapshot.forEach((docSnap) => {
            const h = docSnap.data();
            const id = docSnap.id;

            const card = document.createElement('div');
            card.className = 'huesped-card animated-fade';
            card.innerHTML = `
                <div class="h-avatar">${h.nombre.charAt(0)}</div>
                <div class="h-info">
                    <h4>${h.nombre}</h4>
                    <p><i class="fa-solid fa-id-card"></i> ${h.tipoDoc || 'S/D'}: ${h.documento || '---'}</p>
                    <p><i class="fa-solid fa-phone"></i> ${h.celular || 'No registrado'}</p>
                    <span class="badge ${h.categoria?.toLowerCase() || 'regular'}">${h.categoria || 'Regular'}</span>
                </div>
                <div class="h-actions">
                    <button onclick="verDetalles('${id}')" title="Ver Ficha"><i class="fa-solid fa-eye"></i></button>
                    <button onclick="editarHuesped('${id}')" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                </div>
            `;
            container.appendChild(card);
        });
    });
}

// --- LÓGICA DEL FORMULARIO (GUARDAR/EDITAR) ---
formHuesped.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('huespedId').value;
    const tipoDoc = document.getElementById('tipoDocH').value;
    const numDoc = document.getElementById('documentoH').value;

    // Validación DNI Peruano
    if (tipoDoc === 'DNI' && numDoc.length !== 8) {
        Swal.fire("Error", "El DNI debe tener 8 dígitos", "error");
        return;
    }

    const datos = {
        nombre: document.getElementById('nombreH').value,
        nacionalidad: document.getElementById('nacionalidadH').value,
        tipoDoc: tipoDoc,
        documento: numDoc,
        fechaNac: document.getElementById('fechaNacH').value,
        celular: document.getElementById('celularH').value,
        residencia: document.getElementById('residenciaH').value,
        email: document.getElementById('emailH').value,
        motivo: document.getElementById('motivoH').value,
        categoria: document.getElementById('categoriaH').value
    };

    try {
        if (id) {
            await updateDoc(doc(db, "huespedes", id), datos);
            Swal.fire("Actualizado", "Huésped actualizado correctamente", "success");
        } else {
            await addDoc(collection(db, "huespedes"), { ...datos, fechaRegistro: serverTimestamp() });
            Swal.fire("Registrado", "Nuevo huésped guardado", "success");
        }
        cerrarModal();
    } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo guardar", "error");
    }
});

// --- FUNCIONES GLOBALES ---
window.verDetalles = async (id) => {
    const docSnap = await getDoc(doc(db, "huespedes", id));
    if (docSnap.exists()) {
        const h = docSnap.data();
        llenarModal(h, true);
        modalTitle.innerText = "Ficha del Huésped";
        modal.style.display = 'flex';
    }
};

window.editarHuesped = async (id) => {
    const docSnap = await getDoc(doc(db, "huespedes", id));
    if (docSnap.exists()) {
        const h = docSnap.data();
        document.getElementById('huespedId').value = id;
        llenarModal(h, false);
        modalTitle.innerText = "Editar Huésped";
        modal.style.display = 'flex';
    }
};

function llenarModal(h, esLectura) {
    document.getElementById('nombreH').value = h.nombre || '';
    document.getElementById('nacionalidadH').value = h.nacionalidad || '';
    document.getElementById('tipoDocH').value = h.tipoDoc || 'DNI';
    document.getElementById('documentoH').value = h.documento || '';
    document.getElementById('fechaNacH').value = h.fechaNac || '';
    document.getElementById('celularH').value = h.celular || '';
    document.getElementById('residenciaH').value = h.residencia || '';
    document.getElementById('emailH').value = h.email || '';
    document.getElementById('motivoH').value = h.motivo || '';
    document.getElementById('categoriaH').value = h.categoria || 'Regular';

    const inputs = formHuesped.querySelectorAll('input, select, textarea');
    inputs.forEach(i => { i.disabled = esLectura; });
    document.querySelector('.form-actions').style.display = esLectura ? 'none' : 'flex';
}

window.cerrarModal = () => {
    modal.style.display = 'none';
    formHuesped.reset();
    document.getElementById('huespedId').value = "";
};

// Inicializar
cargarHuespedes();