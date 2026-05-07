import { auth, db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy, getDocs, where, setDoc,
    limit, startAfter, endBefore, limitToLast
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM ---
const tablaBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const btnAbrirModal = document.getElementById("btnAbrirModal");
const closeModal = document.querySelector(".close-modal");

// --- VARIABLES DE PAGINACIÓN ---
let ultimoDoc = null;      
let primerDoc = null;      
const limitePorPagina = 15; 
let paginaActual = 1;

// Inputs de cálculo
const inputTarifa = document.getElementById("resTarifa");
const inputCheckIn = document.getElementById("resCheckIn");
const inputCheckOut = document.getElementById("resCheckOut");
const inputTotal = document.getElementById("resTotal");
const inputAdelantoMonto = document.getElementById("resAdelantoMonto"); 
const inputDiferencia = document.getElementById("resDiferencia");
const selectMoneda = document.getElementById("resMoneda");
const inputTipoCambio = document.getElementById("resTipoCambio");

let editId = null;
let listaReservasGlobal = [];

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
    if (!inputCheckIn.value || !inputCheckOut.value || fOut < fIn) {
        inputTotal.value = "0.00";
        inputDiferencia.value = "0.00";
        return;
    }

    // 2. Cálculo de Noches (Uso de round para mayor precisión en fechas)
    const noches = Math.round((fOut - fIn) / (1000 * 60 * 60 * 24));
    
    // 3. Subtotal base
let subtotal = 0;

if (noches === 0) {
    // ES DAY USE: El subtotal es el monto manual que pongas en el input Tarifa
    subtotal = tarifaBase; 
} else {
    // RESERVA NORMAL: Multiplica noches por la tarifa base
    subtotal = noches * tarifaBase;
}

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

        // --- VALORES PARA EL PAGO ---
        const montoAdelanto = Number(inputAdelantoMonto.value) || 0;
        const detalleAdelanto = document.getElementById("resAdelantoDetalle").value;
        const quienRecibe = document.getElementById("resRecepcion").value;

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
            adelantoMonto: montoAdelanto,
            diferencia: Number(inputDiferencia.value) || 0,
            early: document.getElementById("resEarly").value,
            late: document.getElementById("resLate").value,
            moneda: selectMoneda.value,
            adelantoDetalle: detalleAdelanto,
            desayuno: document.getElementById("resInfo").value,
            cochera: document.getElementById("resCochera").value,
            traslado: document.getElementById("resTraslado").value,
            observaciones: document.getElementById("resObservaciones").value,
            recepcion: quienRecibe,
            recepcionconfi: document.getElementById("resRecepcionconfi").value,
            estado: editId ? (listaReservasGlobal.find(r => r.id === editId)?.estado || "reservada") : "reservada",
            fechaRegistro: editId ? (listaReservasGlobal.find(r => r.id === editId)?.fechaRegistro || new Date().toISOString()) : new Date().toISOString()
        };

        // c --- GUARDAR O ACTUALIZAR ---
        if (editId) {
            // Si editamos, actualizamos los datos generales sin tocar el array de pagos previo
            await updateDoc(doc(db, "reservas", editId), data);
        } else {
            // SI ES NUEVA: Agregamos el array de pagos con el historial inicial
            data.pagos = [
                {
                    fecha: new Date().toISOString(),
                    concepto: "Adelanto de Reserva",
                    monto: montoAdelanto,
                    metodo: detalleAdelanto,
                    recibidoBy: quienRecibe
                }
            ];
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
                title: 'Huésped guardado',
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

// --- 5. RENDERIZADO Y ESTADÍSTICAS ---

// A. Estadísticas Globales (Escucha TODO para las cards)
const escucharStatsGlobales = () => {
    onSnapshot(collection(db, "reservas"), (snapshot) => {
        const conteo = { booking: 0, airbnb: 0, directas: 0, expedia: 0, personal: 0, dayuse: 0, gmail: 0 };
        
        snapshot.docs.forEach(docSnap => {
            const res = docSnap.data();
            // Limpiamos el texto del medio para que coincida con las llaves del objeto
            const m = res.medio?.toLowerCase().replace(/\s/g, "") || "personal";
            if (conteo.hasOwnProperty(m)) conteo[m]++;
        });

        Object.keys(conteo).forEach(k => {
            const el = document.getElementById(`stat-${k}`);
            if (el) el.textContent = conteo[k];
        });
    });
};

// B. Carga Paginada (Solo trae 15 para la tabla)
// CORRECCIÓN EN RENDERIZADO PARA EVITAR TABLAS VACÍAS
const renderizarTabla = (datos) => {
    if (!tablaBody) return; // Seguridad
    tablaBody.innerHTML = "";
    
    if (datos.length === 0) {
        tablaBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No hay resultados que coincidan</td></tr>';
        return;
    }

    datos.forEach(res => {
        const m = res.medio?.toLowerCase().replace(/\s/g, "") || "personal";
        const tr = document.createElement("tr");
        
        const hoy = new Date().toISOString().split('T')[0];
        const esHoy = res.checkIn === hoy;
        if (esHoy) tr.style.borderLeft = "4px solid #800020";

        tr.innerHTML = `
            <td><strong>${res.huesped}</strong><br><small>${res.doc}</small></td>
            <td>${res.fechaRegistro ? new Date(res.fechaRegistro).toLocaleDateString() : '---'}</td>
            <td><span class="badge-hab">Hab. ${res.habitacion}</span></td>
            <td>${res.checkIn} ${esHoy ? '🚩' : ''}</td>
            <td>${res.checkOut}</td>
            <td style="text-align:center">${res.personas}</td>
            <td><strong>S/ ${Number(res.total).toFixed(2)}</strong></td>
            <td><span class="badge-medio type-${m}">${res.medio}</span></td>
            <td>
                <div class="actions">
                    <button class="btn-edit" onclick="prepararEdicion('${res.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="eliminarReserva('${res.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        tablaBody.appendChild(tr);
    });
};

// CORRECCIÓN EN CARGA PAGINADA (Asegurando el flujo de datos)
const cargarReservasPaginadas = async (direccion = "siguiente") => {
    try {
        const ref = collection(db, "reservas");
        let q;

        // Simplificamos la lógica de la query para asegurar resultados
        if (direccion === "siguiente") {
            q = ultimoDoc 
                ? query(ref, orderBy("fechaRegistro", "desc"), startAfter(ultimoDoc), limit(limitePorPagina))
                : query(ref, orderBy("fechaRegistro", "desc"), limit(limitePorPagina));
        } else {
            q = query(ref, orderBy("fechaRegistro", "desc"), endBefore(primerDoc), limitToLast(limitePorPagina));
        }

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            primerDoc = snapshot.docs[0];
            ultimoDoc = snapshot.docs[snapshot.docs.length - 1];
            
            // Llenamos la lista global y renderizamos inmediatamente
            listaReservasGlobal = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderizarTabla(listaReservasGlobal);
            
            // Actualización de UI de paginación
            actualizarInterfazPaginacion(snapshot.docs.length);
        } else {
            if (paginaActual === 1) {
                tablaBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No hay reservas registradas aún</td></tr>';
            }
        }
    } catch (error) {
        console.error("Error detallado:", error);
        // Si sale un error de "index", revisa el link de la consola
    }
};

const actualizarInterfazPaginacion = (totalEnPagina) => {
    const btnPrev = document.getElementById("btnPrev");
    const btnNext = document.getElementById("btnNext");
    const pageIndicator = document.getElementById("pageInfo");

    if (pageIndicator) pageIndicator.textContent = `Página ${paginaActual}`;
    if (btnPrev) btnPrev.disabled = (paginaActual === 1);
    if (btnNext) btnNext.disabled = (totalEnPagina < limitePorPagina);
};



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

// --- 6. EXPORTAR EXCEL CON RANGO DE FECHAS ---
window.exportarExcel = async () => {
    // 1. Abrimos el modal para pedir las fechas
    const { value: formValues } = await Swal.fire({
        title: '<span style="color:#800020; font-family:Playfair Display;">Exportar Reservas</span>',
        html: `
            <div style="text-align: left; font-family: 'Lato', sans-serif;">
                <label style="font-size: 13px; font-weight: bold;">Fecha Inicio:</label>
                <input type="date" id="swal-input-inicio" class="swal2-input" style="margin-top: 5px;">
                <br><br>
                <label style="font-size: 13px; font-weight: bold;">Fecha Fin:</label>
                <input type="date" id="swal-input-fin" class="swal2-input" style="margin-top: 5px;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-file-excel"></i> Exportar',
        confirmButtonColor: '#166534',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const inicio = document.getElementById('swal-input-inicio').value;
            const fin = document.getElementById('swal-input-fin').value;
            if (!inicio || !fin) {
                Swal.showValidationMessage('Por favor selecciona ambas fechas');
                return false;
            }
            return { inicio, fin };
        }
    });

    // 2. Si el usuario confirmó, procedemos a filtrar y descargar
    if (formValues) {
        const { inicio, fin } = formValues;
        
        // Convertimos las fechas del input a objetos Date para comparar (usando T00:00:00 para evitar desfases)
        const dInicio = new Date(inicio + "T00:00:00");
        const dFin = new Date(fin + "T23:59:59");

        // Filtramos la lista global (usando la fecha de checkIn como referencia)
        const reservasFiltradas = listaReservasGlobal.filter(r => {
            const fechaReserva = new Date(r.checkIn + "T12:00:00");
            return fechaReserva >= dInicio && fechaReserva <= dFin;
        });

        if (reservasFiltradas.length === 0) {
            Swal.fire("Sin datos", "No hay reservas en el rango seleccionado.", "info");
            return;
        }

        // 3. Generamos el HTML del Excel con los datos filtrados
        const excelHTML = `
            <table border="1">
                <thead>
                    <tr style="background:#800020; color:white; font-weight:bold;">
                        <th>HUESPED</th><th>DOC</th><th>HAB</th><th>CHECK-IN</th><th>CHECK-OUT</th><th>TOTAL</th><th>MEDIO</th>
                    </tr>
                </thead>
                <tbody>
                    ${reservasFiltradas.map(r => `
                        <tr>
                            <td>${r.huesped}</td>
                            <td>${r.doc}</td>
                            <td>${r.habitacion}</td>
                            <td>${r.checkIn}</td>
                            <td>${r.checkOut}</td>
                            <td>${parseFloat(r.total || 0).toFixed(2)}</td>
                            <td>${r.medio || 'Directo'}</td>
                        </tr>`).join('')}
                </tbody>
            </table>`;

        // 4. Descarga del archivo
        const blob = new Blob(['\ufeff' + excelHTML], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Reporte_Reservas_${inicio}_al_${fin}.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// --- 7. FILTROS DINÁMICOS ---

// Esta función se llama cada vez que escribes en el buscador o cambias un filtro
const aplicarFiltros = () => {
    const textoBusqueda = document.getElementById("inputBusqueda").value.toLowerCase();
    const filtroEstado = document.getElementById("selectFiltroEstado").value;
    const hoy = new Date().toISOString().split('T')[0];

    const reservasFiltradas = listaReservasGlobal.filter(res => {
        // Filtro por texto (Nombre o Documento)
        const coincideTexto = 
            res.huesped.toLowerCase().includes(textoBusqueda) || 
            res.doc.includes(textoBusqueda);

        // Filtro por estado o categorías especiales
        let coincideEstado = true;
        if (filtroEstado === "hoy") {
            coincideEstado = (res.checkIn === hoy);
        } else if (filtroEstado !== "todos") {
            coincideEstado = (res.estado === filtroEstado);
        }

        return coincideTexto && coincideEstado;
    });

    renderizarTabla(reservasFiltradas);
};

// Vincular a los inputs de tu HTML
document.getElementById("inputBusqueda").addEventListener("input", aplicarFiltros);
document.getElementById("selectFiltroEstado").addEventListener("change", aplicarFiltros);


// --- FUNCIÓN DE INICIO ---
window.inicializarPagina = () => {
    console.log("Iniciando Módulo de Reservas - Hotel Central");
    
    cargarHabitacionesSelect(); 
    
    // 1. Iniciamos la escucha de las cards (Totales reales)
    escucharStatsGlobales(); 
    
    // 2. Cargamos la primera página de la tabla
    cargarReservasPaginadas("siguiente");        
};