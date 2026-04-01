import { auth, db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, doc, updateDoc, query, where, getDocs, deleteDoc, addDoc, setDoc, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- 2. REFERENCIAS AL DOM ---
// Contenedores principales
const tablaBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const btnAbrirModal = document.getElementById("btnAbrirModal"); // El botón flotante "+" o "Nueva Reserva"

// Inputs para cálculos (Formulario Principal)
const inputTarifa = document.getElementById("resTarifa");
const inputCheckIn = document.getElementById("resCheckIn");
const inputCheckOut = document.getElementById("resCheckOut");
const inputTotal = document.getElementById("resTotal");
const inputAdelantoMonto = document.getElementById("resAdelantoMonto"); 
const inputDiferencia = document.getElementById("resDiferencia");
const selectMoneda = document.getElementById("resMoneda");
const inputTipoCambio = document.getElementById("resTipoCambio");

// Otros inputs necesarios para el guardado
const inputHuesped = document.getElementById("resHuesped");
const inputDoc = document.getElementById("resDoc");
const selectHabitacion = document.getElementById("resHabitacion");
const selectMedio = document.getElementById("resMedio");

import { auth, db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, doc, updateDoc, query, where, getDocs, 
    deleteDoc, addDoc, setDoc, orderBy 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- 1. CONFIGURACIÓN Y CONSTANTES GLOBALES ---
const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const coloresMedio = {
    'booking': '#1e40af', 
    'airbnb': '#ff5a5f', 
    'directas': '#7c3aed',
    'expedia': '#ffb400', 
    'personal': '#059669', 
    'dayuse': '#db2777',
    'gmail': '#ea4335'
};

let editId = null; 
let listaReservasGlobal = [];
let habitaciones = [];
let mesActual = new Date().getMonth();
let anioActual = new Date().getFullYear();

// Referencias al DOM
const tablaBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");

import { auth, db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, doc, updateDoc, query, where, getDocs, 
    deleteDoc, addDoc, setDoc, orderBy 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- 1. CONFIGURACIÓN Y CONSTANTES ---
const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
let listaReservasGlobal = [];
let habitaciones = [];
let mesActual = new Date().getMonth();
let anioActual = new Date().getFullYear();

// --- 2. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    // Cargar habitaciones desde Firebase para llenar los SELECTS
    onSnapshot(collection(db, "habitaciones"), (snapshot) => {
        habitaciones = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        cargarHabitacionesSelect(); // Llena el <select id="resHabitacion">
        generarCalendarioGantt();
    });

    escucharReservasGlobal();
    configurarListenersFormPrincipal();
});

// Llena el select del modal de reserva
function cargarHabitacionesSelect() {
    const select = document.getElementById("resHabitacion");
    if (!select) return;
    select.innerHTML = '<option value="">Seleccionar...</option>' + 
        habitaciones.map(h => `<option value="${h.numero}">${h.numero} - ${h.tipo}</option>`).join('');
}

// --- 3. LÓGICA DE CÁLCULOS (Montos y Diferencia) ---
function calcularMontos(prefix = "res") {
    // Referencias dinámicas según el prefijo (res o sw)
    const fIn = document.getElementById(`${prefix}CheckIn`) || document.getElementById(`${prefix}in`);
    const fOut = document.getElementById(`${prefix}CheckOut`) || document.getElementById(`${prefix}out`);
    const inputTarifa = document.getElementById(`${prefix}Tarifa`) || document.getElementById(`${prefix}tarifa`);
    const inputTC = document.getElementById(`${prefix}TipoCambio`) || document.getElementById(`${prefix}tc`);
    const selectMoneda = document.getElementById(`${prefix}Moneda`) || document.getElementById(`${prefix}moneda`);
    const inputAdelanto = document.getElementById(`${prefix}AdelantoMonto`) || document.getElementById(`${prefix}adelanto`);
    
    const inputTotal = document.getElementById(`${prefix}Total`) || document.getElementById(`${prefix}total`);
    const inputDiferencia = document.getElementById(`${prefix}Diferencia`) || document.getElementById(`${prefix}diferencia`);

    if (!fIn?.value || !fOut?.value) return;

    const fechaInicio = new Date(fIn.value + "T12:00:00");
    const fechaFin = new Date(fOut.value + "T12:00:00");

    if (fechaFin > fechaInicio) {
        const noches = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24));
        const tarifaBase = parseFloat(inputTarifa?.value) || 0;
        let totalFinal = noches * tarifaBase;

        // Lógica de Tipo de Cambio si es USD
        const tc = parseFloat(inputTC?.value) || 0;
        if (selectMoneda?.value === "USD" && tc > 0) {
            totalFinal = totalFinal * tc;
        }

        if (inputTotal) inputTotal.value = totalFinal.toFixed(2);
        
        const adelanto = parseFloat(inputAdelanto?.value) || 0;
        if (inputDiferencia) inputDiferencia.value = (totalFinal - adelanto).toFixed(2);
    }
}

// --- 4. CRUD: CREAR (Formulario Principal) ---
const formNuevaReserva = document.getElementById("formNuevaReserva");
if (formNuevaReserva) {
    formNuevaReserva.onsubmit = async (e) => {
        e.preventDefault();

        // Mapeo exacto de tu HTML a Firebase
        const data = {
            huesped: document.getElementById('resHuesped').value,
            doc: document.getElementById('resDoc').value,
            telefono: document.getElementById('resTelefono').value,
            nacionalidad: document.getElementById('resNacionalidad').value,
            nacimiento: document.getElementById('resNacimiento').value,
            correo: document.getElementById('resCorreo').value,
            
            habitacion: document.getElementById('resHabitacion').value,
            checkIn: document.getElementById('resCheckIn').value,
            checkOut: document.getElementById('resCheckOut').value,
            medio: document.getElementById('resMedio').value,
            personas: document.getElementById('resPersonas').value,
            desayuno: document.getElementById('resInfo').value,
            early: document.getElementById('resEarly').value,
            late: document.getElementById('resLate').value,
            cochera: document.getElementById('resCochera').value,
            traslado: document.getElementById('resTraslado').value,
            
            tarifa: parseFloat(document.getElementById('resTarifa').value) || 0,
            moneda: document.getElementById('resMoneda').value,
            tipoCambio: parseFloat(document.getElementById('resTipoCambio').value) || 0,
            total: parseFloat(document.getElementById('resTotal').value) || 0,
            adelantoMonto: parseFloat(document.getElementById('resAdelantoMonto').value) || 0,
            diferencia: parseFloat(document.getElementById('resDiferencia').value) || 0,
            adelantoDetalle: document.getElementById('resAdelantoDetalle').value,
            
            observaciones: document.getElementById('resObservaciones').value,
            recepcion: document.getElementById('resRecepcion').value,
            recepcionconfi: document.getElementById('resRecepcionconfi').value,
            
            estado: "reservada",
            fechaRegistro: new Date().toISOString()
        };

        try {
            await addDoc(collection(db, "reservas"), data);
            Swal.fire('¡Éxito!', 'Reserva guardada correctamente', 'success');
            cerrarModal();
            formNuevaReserva.reset();
        } catch (error) {
            console.error("Error al guardar:", error);
            Swal.fire('Error', 'No se pudo guardar la reserva', 'error');
        }
    };
}

// --- 5. LECTURA (Escuchar cambios en tiempo real) ---
function escucharReservasGlobal() {
    const q = query(collection(db, "reservas"), orderBy("fechaRegistro", "desc"));
    onSnapshot(q, (snap) => {
        listaReservasGlobal = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarReservasEnGantt(); // Tu función que dibuja en el calendario
    });
}

// --- 6. LISTENERS PARA CÁLCULOS AUTOMÁTICOS ---
function configurarListenersFormPrincipal() {
    const ids = [
        'resCheckIn', 'resCheckOut', 'resTarifa', 
        'resAdelantoMonto', 'resMoneda', 'resTipoCambio'
    ];
    
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => calcularMontos("res"));
        }
    });
}

window.verDetalleReserva = (res, resId) => {
    const mSymbol = res.moneda === 'USD' ? '$' : 'S/';
    const estado = res.estado || "reservada"; // Estado por defecto
    
    // Configuración dinámica del botón de acción principal
    let botonAccion = '';
    if (estado === "reservada") {
        botonAccion = `<button id="btnEstado" class="swal2-confirm swal2-styled" style="background:#10b981; flex:1;">🚀 PROCESAR CHECK-IN</button>`;
    } else if (estado === "checkin") {
        botonAccion = `<button id="btnEstado" class="swal2-confirm swal2-styled" style="background:#f59e0b; flex:1;">🔑 PROCESAR CHECK-OUT</button>`;
    } else {
        botonAccion = `<button id="btnEstado" class="swal2-confirm swal2-styled" style="background:#6b7280; flex:1;" disabled>✅ FINALIZADO</button>`;
    }

    Swal.fire({
        title: `<span style="font-family: 'Playfair Display'; color: #800020; font-size: 26px;">Detalle de la Reserva</span>`,
        width: '1100px',
        showCloseButton: true,
        showConfirmButton: false,
        customClass: { htmlContainer: 'swal-grid-4' },
        html: `
            <div class="swal-section-title">👤 DATOS DEL HUÉSPED</div>
            <div class="span-2"><label>Nombres</label><b>${res.huesped}</b></div>
            <div class="span-1"><label>DNI/Pasaporte</label>${res.doc || '---'}</div>
            <div class="span-1"><label>Teléfono</label>${res.telefono || '---'}</div>
            <div class="span-1"><label>Nacionalidad</label>${res.nacionalidad || '---'}</div>
            <div class="span-1"><label>F. Nacimiento</label>${res.nacimiento || '---'}</div>
            <div class="span-2"><label>Correo</label>${res.correo || '---'}</div>

            <div class="swal-section-title">🏨 DETALLES DE LA ESTANCIA</div>
            <div class="span-1"><label>Habitación</label><b>${res.habitacion}</b></div>
            <div class="span-1"><label>Check-In</label>${res.checkIn}</div>
            <div class="span-1"><label>Check-Out</label>${res.checkOut}</div>
            <div class="span-1"><label>Estado Actual</label><b style="text-transform: uppercase; color: #800020;">${estado}</b></div>
            
            <div class="span-1"><label>Medio</label><span class="badge-${res.medio}">${res.medio?.toUpperCase()}</span></div>
            <div class="span-1"><label>N° Pers.</label>${res.personas || '1'}</div>
            <div class="span-1"><label>Desayuno</label>${res.desayuno || '---'}</div>
            <div class="span-1"><label>Cochera</label>${res.cochera || 'NO'}</div>

            <div class="swal-section-title">💰 TARIFA Y PAGOS</div>
            <div class="highlight-section span-4">
                <div class="span-1"><label>Total Estancia</label><b>${mSymbol}${res.total}</b></div>
                <div class="span-1"><label>Adelanto</label><b style="color:#10b981;">${mSymbol}${res.adelantoMonto}</b></div>
                <div class="span-1"><label>Pendiente</label><b style="color:#ef4444;">${mSymbol}${res.diferencia}</b></div>
                <div class="span-1"><label>Moneda</label>${res.moneda}</div>
            </div>

            <div class="span-4" style="margin-top: 25px; display: flex; gap: 10px;">
                ${botonAccion}
                <button id="btnOpenEdit" class="swal2-confirm swal2-styled" style="background:#3b82f6; flex:1;">📝 EDITAR</button>
                <button id="btnEliminarRes" class="swal2-confirm swal2-styled" style="background:#ef4444; flex:1;">🗑️ ELIMINAR</button>
            </div>
        `,
        didOpen: () => {
            const btnEstado = document.getElementById('btnEstado');
            
            if (btnEstado && !btnEstado.disabled) {
                btnEstado.onclick = async () => {
                    let nuevoEstado = "";
                    let mensajeExito = "";

                    if (estado === "reservada") {
                        nuevoEstado = "checkin";
                        mensajeExito = "¡Check-In realizado! El huésped ya está en la habitación.";
                    } else if (estado === "checkin") {
                        nuevoEstado = "checkout";
                        mensajeExito = "¡Check-Out realizado! La estancia ha finalizado.";
                    }

                    try {
                        await updateDoc(doc(db, "reservas", resId), { estado: nuevoEstado });
                        Swal.fire('¡Éxito!', mensajeExito, 'success');
                    } catch (error) {
                        Swal.fire('Error', 'No se pudo actualizar el estado', 'error');
                    }
                };
            }

            document.getElementById('btnOpenEdit').onclick = () => abrirEdicionIntegral(res, resId);
            
            document.getElementById('btnEliminarRes').onclick = async () => {
                const result = await Swal.fire({ 
                    title: '¿Eliminar?', 
                    text: "Esta acción no se puede deshacer",
                    icon: 'warning',
                    showCancelButton: true, 
                    confirmButtonColor: '#ef4444',
                    confirmButtonText: 'Sí, eliminar'
                });
                if(result.isConfirmed) {
                    await deleteDoc(doc(db, "reservas", resId));
                    Swal.fire('Eliminado', 'La reserva ha sido borrada.', 'success');
                }
            };
        }
    });
};

window.abrirEdicionIntegral = async (res, resId) => {
    Swal.fire({
        title: '<span style="color: #800020;">Editar Reserva Completa</span>',
        width: '1150px',
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        confirmButtonColor: '#800020',
        html: `
            <div class="swal-grid-4">
                <div class="span-2"><label>Nombres</label><input id="sw-huesped" class="swal2-input" value="${res.huesped}"></div>
                <div class="span-1"><label>DNI</label><input id="sw-doc" class="swal2-input" value="${res.doc}"></div>
                <div class="span-1"><label>Teléfono</label><input id="sw-tel" class="swal2-input" value="${res.telefono || ''}"></div>
                
                <div class="span-1">
                    <label>Habitación</label>
                    <select id="sw-habitacion" class="swal2-select">
                        ${habitaciones.map(h => `<option value="${h.numero}" ${h.numero == res.habitacion ? 'selected' : ''}>${h.numero}</option>`).join('')}
                    </select>
                </div>
                <div class="span-1"><label>Check In</label><input type="date" id="sw-in" class="swal2-input" value="${res.checkIn}"></div>
                <div class="span-1"><label>Check Out</label><input type="date" id="sw-out" class="swal2-input" value="${res.checkOut}"></div>
                <div class="span-1">
                    <label>Medio</label>
                    <select id="sw-medio" class="swal2-select">
                        <option value="booking" ${res.medio=='booking'?'selected':''}>Booking</option>
                        <option value="airbnb" ${res.medio=='airbnb'?'selected':''}>Airbnb</option>
                        <option value="directas" ${res.medio=='directas'?'selected':''}>Directas</option>
                        <option value="personal" ${res.medio=='personal'?'selected':''}>Personal</option>
                    </select>
                </div>

                <div class="span-1"><label>N° Personas</label><input type="number" id="sw-pers" class="swal2-input" value="${res.personas || 1}"></div>
                <div class="span-1"><label>Desayuno</label>
                    <select id="sw-des" class="swal2-select">
                        <option ${res.desayuno=='CON DESAYUNO'?'selected':''}>CON DESAYUNO</option>
                        <option ${res.desayuno=='SIN DESAYUNO'?'selected':''}>SIN DESAYUNO</option>
                    </select>
                </div>
                <div class="span-1"><label>Early C.I.</label><input type="time" id="sw-early" class="swal2-input" value="${res.early || ''}"></div>
                <div class="span-1"><label>Late C.O.</label><input type="time" id="sw-late" class="swal2-input" value="${res.late || ''}"></div>

                <div class="span-1"><label>Tarifa</label><input type="number" id="sw-tarifa" class="swal2-input" value="${res.tarifa}"></div>
                <div class="span-1"><label>Adelanto</label><input type="number" id="sw-adelanto" class="swal2-input" value="${res.adelantoMonto}"></div>
                <div class="span-1"><label>Total</label><input id="sw-total" class="swal2-input input-total" value="${res.total}" readonly></div>
                <div class="span-1"><label>Pendiente</label><input id="sw-diferencia" class="swal2-input input-diferencia" value="${res.diferencia}" readonly></div>

                <div class="span-2"><label>Observaciones</label><input id="sw-obs" class="swal2-input" value="${res.observaciones || ''}"></div>
                <div class="span-1"><label>Recibido</label><input id="sw-rec" class="swal2-input" value="${res.recepcion}"></div>
                <div class="span-1"><label>Confirmado</label><input id="sw-conf" class="swal2-input" value="${res.recepcionconfi}"></div>
            </div>
        `,
        didOpen: () => {
            ['sw-in', 'sw-out', 'sw-tarifa', 'sw-adelanto'].forEach(id => {
                document.getElementById(id).addEventListener('input', () => calcularMontos("sw-"));
            });
        },
        preConfirm: () => {
            return {
                huesped: document.getElementById('sw-huesped').value,
                doc: document.getElementById('sw-doc').value,
                telefono: document.getElementById('sw-tel').value,
                habitacion: document.getElementById('sw-habitacion').value,
                checkIn: document.getElementById('sw-in').value,
                checkOut: document.getElementById('sw-out').value,
                medio: document.getElementById('sw-medio').value,
                personas: document.getElementById('sw-pers').value,
                desayuno: document.getElementById('sw-des').value,
                early: document.getElementById('sw-early').value,
                late: document.getElementById('sw-late').value,
                tarifa: parseFloat(document.getElementById('sw-tarifa').value),
                adelantoMonto: parseFloat(document.getElementById('sw-adelanto').value),
                total: parseFloat(document.getElementById('sw-total').value),
                diferencia: parseFloat(document.getElementById('sw-diferencia').value),
                observaciones: document.getElementById('sw-obs').value,
                recepcion: document.getElementById('sw-rec').value,
                recepcionconfi: document.getElementById('sw-conf').value,
                ultimaEdicion: new Date().toISOString()
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await updateDoc(doc(db, "reservas", resId), result.value);
            Swal.fire('¡Actualizado!', '', 'success');
        }
    });
};

// --- 7. MODAL HELPERS ---
window.cerrarModal = () => {
    const modal = document.getElementById("modalReserva");
    if (modal) modal.style.display = 'none';
};