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

// KPIs
const totalH = document.getElementById('totalHuespedesHoy');

// --- VARIABLES DE PAGINACIÓN Y ESTADO ---
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

// --- RENDERIZADO DE TARJETAS CON PAGINACIÓN Y CUMPLEAÑOS ---
function renderizarHuespedes() {
    container.innerHTML = '';
    
    // Lógica de Paginación
    const inicio = (paginaActual - 1) * huespedesPorPagina;
    const fin = inicio + huespedesPorPagina;
    const itemsParaMostrar = listaFiltrada.slice(inicio, fin);

    if (itemsParaMostrar.length === 0) {
        container.innerHTML = `<p style="text-align:center; color: #64748b; grid-column: 1/-1; padding: 40px;">No se encontraron huéspedes.</p>`;
        actualizarControlesPagina(0);
        return;
    }

    itemsParaMostrar.forEach((h) => {
        const nombre = h.nombre || h.huesped || "Sin nombre";
        const documento = h.documento || h.doc || "---";
        const celular = h.celular || h.telefono || "No registrado";
        const categoria = h.categoria || "Regular";

        // Detección de Cumpleaños
        let esCumpleaños = false;
        if (h.fechaNac) {
            const hoy = new Date();
            const cumple = new Date(h.fechaNac);
            if (hoy.getDate() === cumple.getDate() + 1 && hoy.getMonth() === cumple.getMonth()) {
                esCumpleaños = true;
            }
        }

        const card = document.createElement('div');
        card.className = `huesped-card animated-fade ${esCumpleaños ? 'birthday-highlight' : ''}`;
        card.innerHTML = `
            ${esCumpleaños ? '<div class="birthday-ribbon"><i class="fa-solid fa-cake-candles"></i> ¡Cumpleaños!</div>' : ''}
            <div class="h-avatar">${nombre.charAt(0).toUpperCase()}</div>
            <div class="h-info">
                <h4>${nombre} ${esCumpleaños ? '🎂' : ''}</h4>
                <p><i class="fa-solid fa-id-card"></i> ${h.tipoDoc || 'DOC'}: ${documento}</p>
                <p><i class="fa-solid fa-phone"></i> ${celular}</p>
                <span class="badge ${categoria.toLowerCase()}">${categoria}</span>
            </div>
            <div class="h-actions">
                <button onclick="verDetalles('${h.id}')" title="Ver Ficha"><i class="fa-solid fa-eye"></i></button>
                <button onclick="editarHuesped('${h.id}')" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
            </div>
        `;
        container.appendChild(card);
    });

    actualizarControlesPagina(listaFiltrada.length);
}

// --- CONTROLES DE PAGINACIÓN ---
function actualizarControlesPagina(totalItems) {
    let paginacionContainer = document.getElementById('paginacionControls');
    
    // Crear el contenedor si no existe en el HTML
    if (!paginacionContainer) {
        paginacionContainer = document.createElement('div');
        paginacionContainer.id = 'paginacionControls';
        paginacionContainer.className = 'pagination-container';
        container.after(paginacionContainer);
    }

    const totalPaginas = Math.ceil(totalItems / huespedesPorPagina);
    
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

// --- BÚSQUEDA FILTRADA (CON RESET DE PÁGINA) ---
if (inputBusqueda) {
    inputBusqueda.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase().trim();
        listaFiltrada = listaHuespedesGlobal.filter(h => {
            const nombre = (h.nombre || h.huesped || "").toLowerCase();
            const docNum = (h.documento || h.doc || "").toLowerCase();
            return nombre.includes(termino) || docNum.includes(termino);
        });
        paginaActual = 1;
        renderizarHuespedes();
    });
}

// --- EXPORTAR A EXCEL CON CONTEO DE VISITAS ---
window.exportarHuespedesExcel = async () => {
    if (listaHuespedesGlobal.length === 0) return;
    Swal.fire({ title: 'Generando reporte...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    let excel = `<table border="1"><tr style="background-color: #800020; color: white; font-weight: bold;">
                <th>NOMBRE</th><th>DOC</th><th>N° DOCUMENTO</th><th>CELULAR</th>
                <th>CORREO</th><th>CATEGORÍA</th><th>TOTAL VISITAS</th><th>ÚLT. VISITA</th></tr>`;

    for (const h of listaHuespedesGlobal) {
        const qReservas = query(collection(db, "reservas"), where("doc", "==", h.documento || h.doc || ""));
        const snapReservas = await getDocs(qReservas);
        const totalVisitas = snapReservas.size;
        const fVisita = h.ultimaVisita ? new Date(h.ultimaVisita).toLocaleDateString() : "---";
        excel += `<tr><td>${h.nombre || h.huesped || "---"}</td><td>${h.tipoDoc || "---"}</td><td>${h.documento || h.doc || "---"}</td>
                <td>${h.celular || h.telefono || "---"}</td><td>${h.email || h.correo || "---"}</td><td>${h.categoria || "Regular"}</td>
                <td style="text-align:center;">${totalVisitas}</td><td>${fVisita}</td></tr>`;
    }
    excel += `</table>`;
    const url = 'data:application/vnd.ms-excel,' + encodeURIComponent(excel);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reporte_Huespedes_Frecuentes.xls`;
    a.click();
    Swal.close();
};

// --- GUARDAR / EDITAR ---
formHuesped.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('huespedId').value;
    const datos = {
        nombre: document.getElementById('nombreH').value,
        nacionalidad: document.getElementById('nacionalidadH').value,
        tipoDoc: document.getElementById('tipoDocH').value,
        documento: document.getElementById('documentoH').value,
        fechaNac: document.getElementById('fechaNacH').value,
        celular: document.getElementById('celularH').value,
        residencia: document.getElementById('residenciaH').value,
        email: document.getElementById('emailH').value,
        motivo: document.getElementById('motivoH').value,
        categoria: document.getElementById('categoriaH').value,
        ultimaVisita: new Date().toISOString()
    };
    try {
        if (id) { await updateDoc(doc(db, "huespedes", id), datos); }
        else { await addDoc(collection(db, "huespedes"), { ...datos, fechaRegistro: serverTimestamp() }); }
        cerrarModal();
        Swal.fire("Éxito", "Datos guardados", "success");
    } catch (e) { console.error(e); }
});

// --- FUNCIONES DE MODAL ---
window.verDetalles = async (id) => {
    const docSnap = await getDoc(doc(db, "huespedes", id));
    if (docSnap.exists()) { llenarModal(docSnap.data(), true); modalTitle.innerText = "Ficha del Huésped"; modal.style.display = 'flex'; }
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
    document.getElementById('nombreH').value = h.nombre || h.huesped || '';
    document.getElementById('tipoDocH').value = h.tipoDoc || 'DNI';
    document.getElementById('documentoH').value = h.documento || h.doc || '';
    document.getElementById('celularH').value = h.celular || h.telefono || '';
    document.getElementById('emailH').value = h.email || h.correo || '';
    document.getElementById('nacionalidadH').value = h.nacionalidad || '';
    document.getElementById('fechaNacH').value = h.fechaNac || h.fechaNacimiento || '';
    document.getElementById('residenciaH').value = h.residencia || '';
    document.getElementById('motivoH').value = h.motivo || '';
    document.getElementById('categoriaH').value = h.categoria || 'Regular';
    const inputs = formHuesped.querySelectorAll('input, select, textarea');
    inputs.forEach(i => i.disabled = esLectura);
    const actions = document.querySelector('.form-actions');
    if (actions) actions.style.display = esLectura ? 'none' : 'flex';
}

window.cerrarModal = () => { modal.style.display = 'none'; formHuesped.reset(); document.getElementById('huespedId').value = ""; };


// --- ASEGURAR DISPONIBILIDAD GLOBAL PARA HTML ---
window.verDetalles = verDetalles;
window.editarHuesped = editarHuesped;
window.cerrarModal = cerrarModal;
window.cambiarPagina = cambiarPagina; 


cargarHuespedes();