import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, getDoc, getDocs, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM ---
const modal = document.getElementById('modalHuesped');
const formHuesped = document.getElementById('formHuesped');
const container = document.getElementById('huespedesContainer');
const modalTitle = document.getElementById('modalTitle');
const inputBusqueda = document.getElementById('buscarHuesped');
const totalH = document.getElementById('totalHuespedesHoy');

// --- VARIABLES DE ESTADO ---
let listaHuespedesGlobal = [];
let listaFiltrada = [];
let paginaActual = 1;
const huespedesPorPagina = 10;

// --- CARGAR DATOS EN TIEMPO REAL ---
function cargarHuespedes() {
    const q = query(collection(db, "huespedes"), orderBy("ultimaVisita", "desc"));
    onSnapshot(q, (snapshot) => {
        listaHuespedesGlobal = [];
        snapshot.forEach((docSnap) => {
            listaHuespedesGlobal.push({ id: docSnap.id, ...docSnap.data() });
        });
        listaFiltrada = [...listaHuespedesGlobal];
        renderizarHuespedes();
        if (totalH) totalH.innerText = snapshot.size;
    });
}

// --- MODIFICACIÓN EN RENDERIZAR HUÉSPEDES ---
function renderizarHuespedes() {
    container.innerHTML = '';
    const inicio = (paginaActual - 1) * huespedesPorPagina;
    const fin = inicio + huespedesPorPagina;
    const itemsParaMostrar = listaFiltrada.slice(inicio, fin);

    if (itemsParaMostrar.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-users-slash"></i>
                <p>No se encontraron huéspedes registrados.</p>
            </div>`;
        actualizarControlesPagina(0);
        return;
    }

    itemsParaMostrar.forEach((h) => {
        const nombre = (h.huesped || h.nombre || "SIN NOMBRE").toUpperCase();
        const documento = h.doc || h.documento || "---";
        const celular = h.telefono || h.celular || "---";
        const categoria = (h.categoria || "Regular").toLowerCase(); // Normalizamos para el CSS

        // Lógica de iniciales mejorada (toma primera letra de nombre y apellido si existe)
        const iniciales = nombre.split(' ').map(n => n[0]).join('').substring(0, 2);

        let esCumpleaños = false;
        if (h.nacimiento) {
            const hoy = new Date();
            const cumple = new Date(h.nacimiento);
            // Ajuste para evitar problemas de zona horaria en la comparación
            if (hoy.getDate() === cumple.getUTCDate() && hoy.getMonth() === cumple.getUTCMonth()) {
                esCumpleaños = true;
            }
        }

        const card = document.createElement('div');
        card.className = `huesped-card ${esCumpleaños ? 'birthday-highlight' : ''}`;
        card.innerHTML = `
        ${esCumpleaños ? '<div class="birthday-ribbon"><i class="fa-solid fa-cake-candles"></i></div>' : ''}
        <div class="h-avatar">${nombre.charAt(0).toUpperCase()}</div>
        <div class="h-info">
            <span class="badge ${categoria.toLowerCase()}">${categoria}</span>
            <h4>${nombre} ${esCumpleaños ? '🎂' : ''}</h4>
            <p><i class="fa-solid fa-id-card"></i> ${documento}</p>
            <p><i class="fa-solid fa-phone"></i> ${celular}</p>
        </div>
        <div class="h-actions">
            <button onclick="verDetalles('${h.id}')" title="Ver"><i class="fa-solid fa-eye"></i></button>
            <button onclick="editarHuesped('${h.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
        </div>
    `;
        container.appendChild(card);
    });
    actualizarControlesPagina(listaFiltrada.length);
}

// --- PAGINACIÓN ---
function actualizarControlesPagina(totalItems) {
    let paginacionContainer = document.getElementById('paginacionControls');
    const totalPaginas = Math.ceil(totalItems / huespedesPorPagina);
    if (!paginacionContainer) return;
    
    if (totalPaginas <= 1) {
        paginacionContainer.style.display = 'none';
        return;
    }

    paginacionContainer.style.display = 'flex';
    paginacionContainer.innerHTML = `
        <button ${paginaActual === 1 ? 'disabled' : ''} onclick="cambiarPagina(-1)"><i class="fa-solid fa-chevron-left"></i></button>
        <span>Página ${paginaActual} de ${totalPaginas}</span>
        <button ${paginaActual === totalPaginas ? 'disabled' : ''} onclick="cambiarPagina(1)"><i class="fa-solid fa-chevron-right"></i></button>
    `;
}

window.cambiarPagina = (dir) => {
    paginaActual += dir;
    renderizarHuespedes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- BÚSQUEDA ---
if (inputBusqueda) {
    inputBusqueda.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase().trim();
        listaFiltrada = listaHuespedesGlobal.filter(h => {
            const nombre = (h.huesped || h.nombre || "").toLowerCase();
            const docNum = (h.doc || h.documento || "").toLowerCase();
            return nombre.includes(termino) || docNum.includes(termino);
        });
        paginaActual = 1;
        renderizarHuespedes();
    });
}

// --- GUARDAR / EDITAR ---
formHuesped.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('huespedId').value;
    
    const datos = {
        huesped: document.getElementById('resHuesped').value.toUpperCase(),
        doc: document.getElementById('resDoc').value,
        telefono: document.getElementById('resTelefono').value,
        nacionalidad: document.getElementById('resNacionalidad').value,
        nacimiento: document.getElementById('resNacimiento').value,
        correo: document.getElementById('resCorreo').value,
        tipoDoc: document.getElementById('tipoDocH').value,
        motivo: document.getElementById('motivoH').value,
        ultimaVisita: new Date().toISOString()
    };

    try {
        if (id) { 
            await updateDoc(doc(db, "huespedes", id), datos); 
        } else { 
            await addDoc(collection(db, "huespedes"), { ...datos, fechaRegistro: serverTimestamp() }); 
        }
        cerrarModal();
        Swal.fire("¡Éxito!", "Datos guardados correctamente", "success");
    } catch (error) { 
        console.error(error); 
        Swal.fire("Error", "No se pudo guardar", "error");
    }
});

// --- FUNCIONES DEL MODAL ---
window.verDetalles = async (id) => {
    const docSnap = await getDoc(doc(db, "huespedes", id));
    if (docSnap.exists()) { 
        llenarModal(docSnap.data(), true); 
        modalTitle.innerText = "Ficha del Huésped"; 
        modal.style.display = 'flex'; 
    }
};

window.editarHuesped = async (id) => {
    const docSnap = await getDoc(doc(db, "huespedes", id));
    if (docSnap.exists()) { 
        document.getElementById('huespedId').value = id;
        llenarModal(docSnap.data(), false); 
        modalTitle.innerText = "Editar Huésped"; 
        modal.style.display = 'flex'; 
    }
};

function llenarModal(h, esLectura) {
    document.getElementById('resHuesped').value = h.huesped || h.nombre || '';
    document.getElementById('resDoc').value = h.doc || h.documento || '';
    document.getElementById('resTelefono').value = h.telefono || h.celular || '';
    document.getElementById('resNacionalidad').value = h.nacionalidad || '';
    document.getElementById('resNacimiento').value = h.nacimiento || '';
    document.getElementById('resCorreo').value = h.correo || h.email || '';
    document.getElementById('tipoDocH').value = h.tipoDoc || 'DNI';
    document.getElementById('motivoH').value = h.motivo || '';

    const inputs = formHuesped.querySelectorAll('input, select, textarea');
    inputs.forEach(i => i.disabled = esLectura);
    const actions = document.querySelector('.form-actions');
    if (actions) actions.style.display = esLectura ? 'none' : 'flex';
}

window.abrirModalNuevo = () => {
    formHuesped.reset();
    document.getElementById('huespedId').value = "";
    modalTitle.innerText = "Nuevo Huésped";
    const inputs = formHuesped.querySelectorAll('input, select, textarea');
    inputs.forEach(i => i.disabled = false);
    const actions = document.querySelector('.form-actions');
    if (actions) actions.style.display = 'flex';
    modal.style.display = 'flex';
};

window.cerrarModal = () => { 
    modal.style.display = 'none'; 
    formHuesped.reset(); 
};

// --- EXPORTAR A EXCEL ---
window.exportarHuespedesExcel = async () => {
    if (listaHuespedesGlobal.length === 0) return;
    Swal.fire({ title: 'Generando reporte...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    let excel = `<table border="1"><tr style="background-color: #800020; color: white;">
                <th>NOMBRE</th><th>DOC</th><th>N° DOCUMENTO</th><th>CELULAR</th>
                <th>CORREO</th><th>ÚLT. VISITA</th></tr>`;

    for (const h of listaHuespedesGlobal) {
        const fVisita = h.ultimaVisita ? new Date(h.ultimaVisita).toLocaleDateString() : "---";
        excel += `<tr><td>${h.huesped || h.nombre || "---"}</td><td>${h.tipoDoc || "---"}</td><td>${h.doc || h.documento || "---"}</td>
                <td>${h.telefono || h.celular || "---"}</td><td>${h.correo || h.email || "---"}</td><td>${fVisita}</td></tr>`;
    }
    excel += `</table>`;
    const url = 'data:application/vnd.ms-excel,' + encodeURIComponent(excel);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reporte_Huespedes.xls`;
    a.click();
    Swal.close();
};

cargarHuespedes();