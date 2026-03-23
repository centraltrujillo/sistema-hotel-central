import { db } from "./firebaseconfig.js";
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

// --- 1. CARGAR HABITACIONES ---
onSnapshot(collection(db, "habitaciones"), (snapshot) => {
    const selectHab = document.getElementById("resHabitacion");
    selectHab.innerHTML = '<option value="">Seleccionar...</option>';
    snapshot.docs.forEach(docSnap => {
        const hab = docSnap.data();
        const opt = document.createElement("option");
        opt.value = hab.numero;
        opt.textContent = `Hab. ${hab.numero} - ${hab.tipo}`;
        selectHab.appendChild(opt);
    });
});

// --- 2. LÓGICA DE CÁLCULOS (Con recargos por Early/Late) ---
const calcularMontos = () => {
    // Cálculo de Noches (Normalizado a medianoche)
    const fIn = new Date(inputCheckIn.value + 'T00:00:00');
    const fOut = new Date(inputCheckOut.value + 'T00:00:00');
    const tarifaBase = parseFloat(inputTarifa.value) || 0;
    const tc = parseFloat(inputTipoCambio.value) || 1;
    const moneda = selectMoneda.value;

    // Capturar si los campos de tiempo tienen algún valor
    const tieneEarly = document.getElementById("resEarly").value !== "";
    const tieneLate = document.getElementById("resLate").value !== "";

    if (inputCheckIn.value && inputCheckOut.value && fOut > fIn) {
        const noches = Math.ceil((fOut - fIn) / (1000 * 60 * 60 * 24));
        
        // Cálculo base: Noches * Tarifa
        let subtotal = noches * tarifaBase;

        // Aplicar recargos: Media tarifa (0.5) por cada concepto
        if (tieneEarly) subtotal += (tarifaBase * 0.5);
        if (tieneLate) subtotal += (tarifaBase * 0.5);

        // Conversión de moneda si aplica (sobre el total con recargos)
        let totalFinal = subtotal;
        if (moneda === "USD") totalFinal *= tc;

        inputTotal.value = totalFinal.toFixed(2);
    }

    // Diferencia: Total - Adelanto
    const totalActual = parseFloat(inputTotal.value) || 0;
    const adelanto = parseFloat(inputAdelantoMonto.value) || 0;
    inputDiferencia.value = (totalActual - adelanto).toFixed(2);
};

// Listeners actualizados para incluir los campos de tiempo
[
    inputTarifa, 
    inputCheckIn, 
    inputCheckOut, 
    inputAdelantoMonto, 
    inputTipoCambio, 
    selectMoneda,
    document.getElementById("resEarly"),
    document.getElementById("resLate")
].forEach(el => {
    el.addEventListener("input", calcularMontos);
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
        
        Swal.fire({ toast: true, position: 'top-end', title: 'Huésped registrado cargado', icon: 'success', showConfirmButton: false, timer: 1500 });
    }
});

// --- 4. GUARDAR / ACTUALIZAR (CON VALIDACIÓN DE OVERBOOKING) ---
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const habSeleccionada = document.getElementById("resHabitacion").value;
    const nuevoIn = document.getElementById("resCheckIn").value;
    const nuevoOut = document.getElementById("resCheckOut").value;

    try {
        // a --- VALIDACIÓN DE DISPONIBILIDAD ---
        const q = query(
            collection(db, "reservas"), 
            where("habitacion", "==", habSeleccionada)
        );
        
        const querySnapshot = await getDocs(q);
        let ocupado = false;

        querySnapshot.forEach((docSnap) => {
            const resExistente = docSnap.data();
            const idExistente = docSnap.id;

            // Ignorar la misma reserva si estamos editando
            if (editId && idExistente === editId) return;

            // Lógica de solapamiento
            if (nuevoIn < resExistente.checkOut && nuevoOut > resExistente.checkIn) {
                ocupado = true;
            }
        });

        if (ocupado) {
            return Swal.fire({
                title: 'Habitación Ocupada',
                text: 'La habitación ya tiene una reserva en esas fechas.',
                icon: 'error',
                confirmButtonColor: '#800020'
            });
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
            personas: document.getElementById("resPersonas").value,
            early: document.getElementById("resEarly").value,
            late: document.getElementById("resLate").value,
            tarifa: inputTarifa.value,
            moneda: selectMoneda.value,
            tipoCambio: inputTipoCambio.value,
            total: inputTotal.value,
            adelantoMonto: inputAdelantoMonto.value,
            adelantoDetalle: document.getElementById("resAdelantoDetalle").value,
            diferencia: inputDiferencia.value,
            desayuno: document.getElementById("resInfo").value,
            cochera: document.getElementById("resCochera").value,
            traslado: document.getElementById("resTraslado").value,
            observaciones: document.getElementById("resObservaciones").value,
            recepcion: document.getElementById("resRecepcion").value,
            recepcionconfi: document.getElementById("resRecepcionconfi").value,
            estado: editId  ? (listaReservasGlobal.find(r => r.id === editId)?.estado || "reservada")  : "reservada",
            fechaRegistro: editId ? (listaReservasGlobal.find(r => r.id === editId)?.fechaRegistro || new Date().toISOString()) : new Date().toISOString()
    };

        // c --- GUARDAR O ACTUALIZAR ---
        if (editId) {
            await updateDoc(doc(db, "reservas", editId), data);
        } else {
            await addDoc(collection(db, "reservas"), data);
        }

        // 4. --- SYNC HUÉSPED ---
        const hRef = doc(db, "huespedes", data.doc); // Aquí fijamos el ID como el DNI
await setDoc(hRef, { 
    nombre: data.huesped.toUpperCase(), 
    documento: data.doc, 
    telefono: data.telefono, 
    correo: data.correo,
    nacionalidad: data.nacionalidad,
    nacimiento: data.nacimiento
}, { merge: true });

        Swal.fire('¡Listo!', 'La reserva se guardó correctamente', 'success');
        window.cerrarModal();

    } catch (error) {
        console.error("Error completo:", error);
        Swal.fire('Error', 'No se pudo conectar con la base de datos o validar disponibilidad', 'error');
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
            <td><strong>S/ ${res.total}</strong></td>
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

// --- FUNCIÓN DE VERIFICACIÓN EN TIEMPO REAL ---
const verificarDisponibilidadRealTime = async () => {
    const hab = document.getElementById("resHabitacion").value;
    const fIn = document.getElementById("resCheckIn").value;
    const fOut = document.getElementById("resCheckOut").value;
    const statusDiv = document.getElementById("statusDisponibilidad");
    const btnGuardar = form.querySelector('button[type="submit"]');

    // Solo validar si tenemos los 3 datos necesarios
    if (!hab || !fIn || !fOut) {
        statusDiv.textContent = "";
        return;
    }

    statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
    statusDiv.style.color = "orange";

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

        if (ocupado) {
            statusDiv.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Habitación ocupada en estas fechas';
            statusDiv.style.color = "#e11d48"; // Rojo
            btnGuardar.disabled = true;
            btnGuardar.style.opacity = "0.5";
            btnGuardar.style.cursor = "not-allowed";
        } else {
            statusDiv.innerHTML = '<i class="fa-solid fa-circle-check"></i> Habitación disponible';
            statusDiv.style.color = "#10b981"; // Verde
            btnGuardar.disabled = false;
            btnGuardar.style.opacity = "1";
            btnGuardar.style.cursor = "pointer";
        }
    } catch (error) {
        console.error(error);
        statusDiv.textContent = "Error al verificar";
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
    
    // Forzar valores por defecto visuales que el reset() a veces no pone bonito
    inputTotal.value = "0.00";
    inputDiferencia.value = "0.00";
    inputTipoCambio.value = "3.50"; // O el valor que manejes por defecto
    
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