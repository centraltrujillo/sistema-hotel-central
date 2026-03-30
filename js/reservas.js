import { auth, db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy, getDocs, where, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM ---
const tablaBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const btnAbrirModal = document.getElementById("btnAbrirModal");
const closeModal = document.querySelector(".close-modal");

// Inputs de cálculo
const inputTarifa = document.getElementById("resTarifa");
const inputCheckIn = document.getElementById("resCheckIn");
const inputCheckOut = document.getElementById("resCheckOut");
const inputTotal = document.getElementById("resTotal");
const inputAdelantoMonto = document.getElementById("resAdelantoMonto"); // Actualizado
const inputDiferencia = document.getElementById("resDiferencia");
const selectMoneda = document.getElementById("resMoneda");
const inputTipoCambio = document.getElementById("resTipoCambio");

let editId = null;
let listaReservasGlobal = [];

// --- FUNCIÓN DE INICIO (Llamada por auth-check.js) ---
window.inicializarPagina = () => {
    console.log("Iniciando Módulo de Reservas - Hotel Central");
    
    // Ahora sí, las conexiones a Firebase se disparan solo con sesión activa
    cargarHabitacionesSelect(); 
    escucharReservas();        
};

// --- 1. CARGAR HABITACIONES (Dentro de una función) ---
const cargarHabitacionesSelect = () => {
    const selectHab = document.getElementById("resHabitacion");
    
    // Al estar dentro, este listener solo nace cuando hay un usuario validado
    onSnapshot(collection(db, "habitaciones"), (snapshot) => {
        if (!selectHab) return; 
        selectHab.innerHTML = '<option value="">Seleccionar...</option>';
        snapshot.docs.forEach(docSnap => {
            const hab = docSnap.data();
            const opt = document.createElement("option");
            opt.value = hab.numero;
            opt.textContent = `Hab. ${hab.numero} - ${hab.tipo}`;
            selectHab.appendChild(opt);
        });
    });
};

// --- 2. LÓGICA DE CÁLCULOS (Recargos, Moneda y Validación) ---
const calcularMontos = () => {
    // Referencias a inputs (Asegúrate que coincidan con tus IDs del HTML)
    const fIn = new Date(inputCheckIn.value + 'T00:00:00');
    const fOut = new Date(inputCheckOut.value + 'T00:00:00');
    const tarifaBase = parseFloat(inputTarifa.value) || 0;
    const tc = parseFloat(inputTipoCambio.value) || 0;
    const moneda = selectMoneda.value;

    // Capturar recargos por Early Check-in o Late Check-out
    const tieneEarly = document.getElementById("resEarly").value !== "";
    const tieneLate = document.getElementById("resLate").value !== "";

    // 1. Resetear si las fechas son inválidas o incompletas
    if (!inputCheckIn.value || !inputCheckOut.value || fOut <= fIn) {
        inputTotal.value = "0.00";
        inputDiferencia.value = "0.00";
        return;
    }

    // 2. Cálculo de Noches (Uso de round para mayor precisión en fechas)
    const noches = Math.round((fOut - fIn) / (1000 * 60 * 60 * 24));
    
    // 3. Subtotal base en la moneda de origen (Noches * Tarifa)
    let subtotal = noches * tarifaBase;

    // 4. Aplicación de Recargos (50% de la tarifa base por cada concepto)
    if (tieneEarly) subtotal += (tarifaBase * 0.5);
    if (tieneLate) subtotal += (tarifaBase * 0.5);

    // 5. Conversión Final a Soles (Si la tarifa viene en USD)
    let totalFinal = subtotal;
    if (moneda === "USD") {
        if (tc > 0) {
            totalFinal = subtotal * tc; // Convertimos a Soles para caja
        } else {
            // Si elige USD pero olvida el T. Cambio, el total es 0 para alertar
            totalFinal = 0; 
        }
    }

    inputTotal.value = totalFinal.toFixed(2);

    // 6. Diferencia y Validación de Adelanto
    let adelanto = parseFloat(inputAdelantoMonto.value) || 0;

    // Evitar que el recepcionista ingrese un adelanto mayor al total de la reserva
    if (adelanto > totalFinal && totalFinal > 0) {
        adelanto = totalFinal;
        inputAdelantoMonto.value = totalFinal.toFixed(2);
        
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'El adelanto no puede superar al total',
            showConfirmButton: false,
            timer: 2000
        });
    }

    inputDiferencia.value = (totalFinal - adelanto).toFixed(2);
};

// --- LISTENERS PARA CÁLCULO EN TIEMPO REAL ---
[
    inputTarifa, inputCheckIn, inputCheckOut, 
    inputAdelantoMonto, inputTipoCambio, selectMoneda,
    document.getElementById("resEarly"),
    document.getElementById("resLate")
].forEach(el => {
    if(el) {
        el.addEventListener("input", calcularMontos);
        el.addEventListener("change", calcularMontos);
    }
});



// Configuración base para Toasts del Hotel
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true
});



// --- 3. AUTOCOMPLETADO POR DNI ---
document.getElementById("resDoc").addEventListener("blur", async (e) => {
    const dni = e.target.value.trim();
    if (dni.length < 4) return;

    const q = query(collection(db, "huespedes"), where("documento", "==", dni));
    const snap = await getDocs(q);

    if (!snap.empty) {
        const h = snap.docs[0].data();
        document.getElementById("resHuesped").value = h.nombre || "";
        document.getElementById("resTelefono").value = h.telefono || "";
        document.getElementById("resCorreo").value = h.correo || "";
        document.getElementById("resNacionalidad").value = h.nacionalidad || "";
        document.getElementById("resNacimiento").value = h.nacimiento || ""; 
        
        Toast.fire({
            icon: 'success',
            title: 'Huésped ingresado', // sistema lo reconoció
            background: '#f0fdf4' 
        });
    }
});

// --- 4. GUARDAR / ACTUALIZAR ---
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const habSeleccionada = document.getElementById("resHabitacion").value;
    const nuevoIn = document.getElementById("resCheckIn").value;
    const nuevoOut = document.getElementById("resCheckOut").value;

    try {
        // a --- VALIDACIÓN DE DISPONIBILIDAD ---
        const q = query(collection(db, "reservas"), where("habitacion", "==", habSeleccionada));
        const querySnapshot = await getDocs(q);
        let ocupado = false;

        querySnapshot.forEach((docSnap) => {
            if (editId && docSnap.id === editId) return;
            const resExistente = docSnap.data();
            if (nuevoIn < resExistente.checkOut && nuevoOut > resExistente.checkIn) ocupado = true;
        });

        if (ocupado) {
            return Swal.fire({ title: 'Habitación Ocupada', text: 'Ya hay una reserva en estas fechas.', icon: 'error', confirmButtonColor: '#800020' });
        }

        // b --- PREPARACIÓN DE DATOS ---
        const data = {
            huesped: document.getElementById("resHuesped").value,
            doc: document.getElementById("resDoc").value,
            nacimiento: document.getElementById("resNacimiento").value,
            nacionalidad: document.getElementById("resNacionalidad").value,
            telefono: document.getElementById("resTelefono").value,
            correo: document.getElementById("resCorreo").value,
            habitacion: habSeleccionada,
            medio: document.getElementById("resMedio").value,
            checkIn: nuevoIn,
            checkOut: nuevoOut,
            personas: parseInt(document.getElementById("resPersonas").value) || 1,
            tarifa: Number(inputTarifa.value) || 0,
            tipoCambio: Number(inputTipoCambio.value) || 0,
            total: Number(inputTotal.value) || 0,
            adelantoMonto: Number(inputAdelantoMonto.value) || 0,
            diferencia: Number(inputDiferencia.value) || 0,
            early: document.getElementById("resEarly").value,
            late: document.getElementById("resLate").value,
            moneda: selectMoneda.value,
            adelantoDetalle: document.getElementById("resAdelantoDetalle").value,
            desayuno: document.getElementById("resInfo").value,
            cochera: document.getElementById("resCochera").value,
            traslado: document.getElementById("resTraslado").value,
            observaciones: document.getElementById("resObservaciones").value,
            recepcion: document.getElementById("resRecepcion").value,
            recepcionconfi: document.getElementById("resRecepcionconfi").value,
            estado: editId ? (listaReservasGlobal.find(r => r.id === editId)?.estado || "reservada") : "reservada",
            fechaRegistro: editId ? (listaReservasGlobal.find(r => r.id === editId)?.fechaRegistro || new Date().toISOString()) : new Date().toISOString()
        };

        // c --- GUARDAR O ACTUALIZAR ---
        if (editId) {
            await updateDoc(doc(db, "reservas", editId), data);
        } else {
            await addDoc(collection(db, "reservas"), data);
        }

        // d --- SYNC HUÉSPED ---
        const dniLimpio = data.doc ? data.doc.trim() : "";
if (dniLimpio !== "") {
    const hRef = doc(db, "huespedes", dniLimpio);
    await setDoc(hRef, {
        nombre: data.huesped.toUpperCase(),
        documento: dniLimpio,
        telefono: data.telefono,
        correo: data.correo,
        nacionalidad: data.nacionalidad,
        nacimiento: data.nacimiento,
        ultimaVisita: new Date().toISOString()
    }, { merge: true });

    Toast.fire({
        icon: 'success',
        title: 'Huésped guardado', // información nueva se envió a Firebase correctamente
        background: '#fff',
        iconColor: '#800020' 
    });
}

        Swal.fire({ title: '¡Éxito!', text: 'Reserva guardada correctamente', icon: 'success', confirmButtonColor: '#800020' });
        window.cerrarModal();

    } catch (error) {
        console.error("Error:", error);
        Swal.fire('Error', 'No se pudo guardar la reserva', 'error');
    }
});

// --- 5. RENDERIZADO ---
onSnapshot(query(collection(db, "reservas"), orderBy("fechaRegistro", "desc")), (snapshot) => {
    tablaBody.innerHTML = "";
    listaReservasGlobal = [];
    const conteo = { booking: 0, airbnb: 0, directas: 0, expedia: 0, personal: 0, dayuse: 0, gmail: 0 };

    snapshot.docs.forEach(docSnap => {
        const res = docSnap.data();
        const id = docSnap.id;
        listaReservasGlobal.push({ id, ...res });

        const m = res.medio?.toLowerCase().replace(/\s/g, "") || "personal";
        if (conteo.hasOwnProperty(m)) conteo[m]++;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${res.huesped}</strong><br><small>${res.doc}</small></td>
            <td><span class="badge-hab">Hab. ${res.habitacion}</span></td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td style="text-align:center">${res.personas}</td>


            <td><strong>S/ ${Number(res.total).toFixed(2)}</strong></td>
        
            <td><span class="badge-medio type-${m}">${res.medio}</span></td>
            <td>
                <div class="actions">
                    <button class="btn-edit" onclick="prepararEdicion('${id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="eliminarReserva('${id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        tablaBody.appendChild(tr);
    });

    Object.keys(conteo).forEach(k => {
        const el = document.getElementById(`stat-${k}`);
        if (el) el.textContent = conteo[k];
    });
});

// --- FUNCIÓN DE VERIFICACIÓN EN TIEMPO REAL (MODIFICADA) ---
const verificarDisponibilidadRealTime = async () => {
    const hab = document.getElementById("resHabitacion").value;
    const fIn = document.getElementById("resCheckIn").value;
    const fOut = document.getElementById("resCheckOut").value;
    const statusDiv = document.getElementById("statusDisponibilidad");
    const btnGuardar = form.querySelector('button[type="submit"]');

    // 1. Limpieza total si faltan datos (Esto activa el CSS :empty)
    if (!hab || !fIn || !fOut) {
        statusDiv.innerHTML = ""; // Al dejarlo vacío, el div desaparece del diseño
        btnGuardar.disabled = false;
        btnGuardar.style.opacity = "1";
        btnGuardar.style.cursor = "pointer";
        return;
    }

    // 2. Estado de carga: agregamos un fondo sutil para que se note la actividad
    statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando disponibilidad...';
    statusDiv.style.color = "#d4a017"; // Uso de tu variable --amarillo-ocre
    statusDiv.style.backgroundColor = "#fffbeb"; // Fondo ámbar muy claro
    statusDiv.style.border = "1px solid #fef3c7";

    try {
        const q = query(collection(db, "reservas"), where("habitacion", "==", hab));
        const snap = await getDocs(q);
        let ocupado = false;

        snap.forEach(docSnap => {
            const res = docSnap.data();
            if (editId && docSnap.id === editId) return;

            if (fIn < res.checkOut && fOut > res.checkIn) {
                ocupado = true;
            }
        });

        // 3. Resultado: Ajustamos colores y bordes para que parezca una notificación
        if (ocupado) {
            statusDiv.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Habitación ocupada en estas fechas';
            statusDiv.style.color = "#f43f5e"; // --danger-red
            statusDiv.style.backgroundColor = "#fff1f2";
            statusDiv.style.border = "1px solid #ffe4e6";
            
            btnGuardar.disabled = true;
            btnGuardar.style.opacity = "0.5";
            btnGuardar.style.cursor = "not-allowed";
        } else {
            statusDiv.innerHTML = '<i class="fa-solid fa-circle-check"></i> Habitación disponible';
            statusDiv.style.color = "#10b981"; // --success-green
            statusDiv.style.backgroundColor = "#f0fdf4";
            statusDiv.style.border = "1px solid #dcfce7";
            
            btnGuardar.disabled = false;
            btnGuardar.style.opacity = "1";
            btnGuardar.style.cursor = "pointer";
        }
    } catch (error) {
        console.error("Error al verificar:", error);
        statusDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error de conexión';
        statusDiv.style.color = "#475569";
    }
};

// --- LISTENERS PARA DISPARAR LA VERIFICACIÓN ---
[
    document.getElementById("resHabitacion"),
    document.getElementById("resCheckIn"),
    document.getElementById("resCheckOut")
].forEach(el => {
    el.addEventListener("change", verificarDisponibilidadRealTime);
});

// --- FUNCIONES DE MODAL ---
window.prepararEdicion = (id) => {
    const res = listaReservasGlobal.find(r => r.id === id);
    if (res) {
        editId = id;
        document.getElementById("modalTitle").textContent = "Editar Reserva";
        
        // Mapeo masivo de datos al formulario
        document.getElementById("resHuesped").value = res.huesped || "";
        document.getElementById("resDoc").value = res.doc || "";
        document.getElementById("resNacimiento").value = res.nacimiento || "";
        document.getElementById("resNacionalidad").value = res.nacionalidad || "";
        document.getElementById("resTelefono").value = res.telefono || "";
        document.getElementById("resCorreo").value = res.correo || "";
        document.getElementById("resHabitacion").value = res.habitacion || "";
        document.getElementById("resMedio").value = res.medio || "";
        document.getElementById("resCheckIn").value = res.checkIn || "";
        document.getElementById("resCheckOut").value = res.checkOut || "";
        document.getElementById("resPersonas").value = res.personas || 1;
        document.getElementById("resEarly").value = res.early || "";
        document.getElementById("resLate").value = res.late || "";
        document.getElementById("resTarifa").value = res.tarifa || "";
        document.getElementById("resMoneda").value = res.moneda || "PEN";
        document.getElementById("resTipoCambio").value = res.tipoCambio || "";
        document.getElementById("resTotal").value = res.total || "0.00";
        document.getElementById("resAdelantoMonto").value = res.adelantoMonto || "0.00";
        document.getElementById("resAdelantoDetalle").value = res.adelantoDetalle || "";
        document.getElementById("resDiferencia").value = res.diferencia || "0.00";
        document.getElementById("resInfo").value = res.desayuno || "CON DESAYUNO";
        document.getElementById("resCochera").value = res.cochera || "";
        document.getElementById("resTraslado").value = res.traslado || "";
        document.getElementById("resObservaciones").value = res.observaciones || "";
        document.getElementById("resRecepcion").value = res.recepcion || "";
        document.getElementById("resRecepcionconfi").value = res.recepcionconfi || "";

        verificarDisponibilidadRealTime();
        
        modal.classList.add("active");
    }
};

window.eliminarReserva = async (id) => {
    const result = await Swal.fire({ 
        title: '¿Eliminar reserva?', 
        text: "Esta acción no se puede deshacer",
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#800020',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, borrar',
        cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) await deleteDoc(doc(db, "reservas", id));
};


btnAbrirModal.onclick = () => { 
    editId = null; 
    form.reset();
    document.getElementById("modalTitle").textContent = "Nueva Reserva"; 
    
    inputTotal.value = "0.00";
    inputDiferencia.value = "0.00";
    inputTipoCambio.value = ""; 
    
    modal.classList.add("active"); 
};

// --- UNIFICACIÓN DE CERRAR MODAL (Reemplaza tus dos funciones anteriores con esta) ---
window.cerrarModal = () => { 
    modal.classList.remove("active"); 
    form.reset(); 
    editId = null; 
    
    // Limpieza de estados visuales
    const statusDiv = document.getElementById("statusDisponibilidad");
    const btnGuardar = form.querySelector('button[type="submit"]');
    
    if(statusDiv) statusDiv.textContent = "";
    if(btnGuardar) {
        btnGuardar.disabled = false;
        btnGuardar.style.opacity = "1";
        btnGuardar.style.cursor = "pointer";
    }
};


// --- 6. EXPORTAR EXCEL ---
window.exportarExcel = async () => {
    const excel = `
        <table border="1">
            <tr style="background:#800020; color:white;">
                <th>HUÉSPED</th><th>DOC</th><th>HAB</th><th>IN</th><th>OUT</th><th>TOTAL</th><th>MEDIO</th>
            </tr>
            ${listaReservasGlobal.map(r => `
                <tr>
                    <td>${r.huesped}</td><td>${r.doc}</td><td>${r.habitacion}</td>
                    <td>${r.checkIn}</td><td>${r.checkOut}</td><td>${r.total}</td><td>${r.medio}</td>
                </tr>`).join('')}
        </table>`;
    const blob = new Blob(['\ufeff' + excel], { type: 'application/vnd.ms-excel' });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Reporte_Reservas.xls";
    a.click();
};