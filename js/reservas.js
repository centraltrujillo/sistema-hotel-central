import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy, getDoc, getDocs, where 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS ---
const tablaBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const selectHabitacion = document.getElementById("resHabitacion");
const inputTarifa = document.getElementById("resTarifa");
const inputCheckIn = document.getElementById("resCheckIn");
const inputCheckOut = document.getElementById("resCheckOut");
const inputTotal = document.getElementById("resTotal");
const inputAdelanto = document.getElementById("resAdelanto");
const inputDiferencia = document.getElementById("resDiferencia");
const inputDocDNI = document.getElementById("resDoc"); // Referencia para autocompletado

// Nuevas referencias Moneda/TC
const selectMoneda = document.getElementById("resMoneda");
const inputTipoCambio = document.getElementById("resTipoCambio");

let editId = null;
let listaReservasGlobal = [];

// --- NUEVA FUNCIÓN: SINCRONIZAR PERFIL DE HUÉSPED ---
const sincronizarPerfilHuesped = async (datos) => {
    try {
        const huespedesRef = collection(db, "huespedes");
        const q = query(huespedesRef, where("documento", "==", datos.doc));
        const snap = await getDocs(q);

        const infoHuesped = {
            nombre: datos.huesped,
            documento: datos.doc,
            fechaNacimiento: datos.nacimiento || "",
            nacionalidad: datos.nacionalidad || "",
            telefono: datos.telefono || "",
            correo: datos.correo || "",
            ultimaVisita: new Date().toISOString()
        };

        if (snap.empty) {
            infoHuesped.fechaRegistro = new Date().toISOString();
            await addDoc(huespedesRef, infoHuesped);
        } else {
            const docId = snap.docs[0].id;
            await updateDoc(doc(db, "huespedes", docId), infoHuesped);
        }
    } catch (error) {
        console.error("Error sincronizando huésped:", error);
    }
};

// --- NUEVA FUNCIÓN: AUTOCOMPLETADO POR DNI ---
inputDocDNI.addEventListener("blur", async () => {
    const dni = inputDocDNI.value.trim();
    if (dni.length < 5) return;

    try {
        const q = query(collection(db, "huespedes"), where("documento", "==", dni));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const datos = snap.docs[0].data();
            document.getElementById("resHuesped").value = datos.nombre || "";
            document.getElementById("resNacimiento").value = datos.fechaNacimiento || "";
            document.getElementById("resNacionalidad").value = datos.nacionalidad || "";
            document.getElementById("resTelefono").value = datos.telefono || "";
            document.getElementById("resCorreo").value = datos.correo || "";

            Swal.fire({
                toast: true, position: 'top-end', icon: 'info',
                title: `Huésped frecuente: ${datos.nombre}`,
                showConfirmButton: false, timer: 2000
            });
        }
    } catch (e) { console.error("Error buscando huésped:", e); }
});

// --- 1. CARGAR HABITACIONES ---
onSnapshot(collection(db, "habitaciones"), (snapshot) => {
    selectHabitacion.innerHTML = '<option value="">Seleccionar...</option>';
    snapshot.docs.forEach(docSnap => {
        const hab = docSnap.data();
        const option = document.createElement("option");
        option.value = hab.numero;
        option.textContent = `Hab. ${hab.numero} - ${hab.tipo}`;
        selectHabitacion.appendChild(option);
    });
});

// --- 2. CÁLCULO AUTOMÁTICO DE MONTOS ---
const calcularMontos = () => {
    const fechaIn = new Date(inputCheckIn.value);
    const fechaOut = new Date(inputCheckOut.value);
    let tarifa = parseFloat(inputTarifa.value) || 0;
    const tc = parseFloat(inputTipoCambio.value) || 1;
    const moneda = selectMoneda.value;

    if (moneda === "USD" && tc > 0) {
        tarifa = tarifa * tc;
    }

    if (inputCheckIn.value && inputCheckOut.value && fechaOut > fechaIn) {
        const diffTime = Math.abs(fechaOut - fechaIn);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        inputTotal.value = (diffDays * tarifa).toFixed(2);
    }

    const total = parseFloat(inputTotal.value) || 0;
    const adelantoMatch = inputAdelanto.value.match(/(\d+(\.\d+)?)/);
    const adelantoMonto = adelantoMatch ? parseFloat(adelantoMatch[0]) : 0;
    inputDiferencia.value = (total - adelantoMonto).toFixed(2);
};

[inputTarifa, inputCheckIn, inputCheckOut, inputAdelanto, inputTotal, inputTipoCambio, selectMoneda].forEach(el => {
    el.addEventListener("input", calcularMontos);
});

selectMoneda.addEventListener("change", () => {
    if (selectMoneda.value === "PEN") {
        inputTipoCambio.value = "";
        inputTipoCambio.disabled = true;
        inputTipoCambio.style.background = "#f1f5f9";
    } else {
        inputTipoCambio.disabled = false;
        inputTipoCambio.style.background = "#fff";
    }
    calcularMontos();
});

const actualizarContadores = (reservas) => {
    const conteo = { booking: 0, airbnb: 0, directas: 0, personal: 0, expedia: 0, dayuse: 0 };
    reservas.forEach(r => {
        const m = r.medio?.toLowerCase();
        if (conteo.hasOwnProperty(m)) conteo[m]++;
    });
    Object.keys(conteo).forEach(key => {
        const el = document.getElementById(`stat-${key}`);
        if (el) el.textContent = conteo[key];
    });
};

// --- 3. FUNCIÓN: VERIFICAR DISPONIBILIDAD ---
const verificarDisponibilidad = async (habNum, fIn, fOut, idActual = null) => {
    const q = query(collection(db, "reservas"), where("habitacion", "==", habNum));
    const querySnapshot = await getDocs(q);
    let disponible = true;
    querySnapshot.forEach((docSnap) => {
        if (docSnap.id === idActual) return;
        const res = docSnap.data();
        if (fIn < res.checkOut && fOut > res.checkIn) disponible = false;
    });
    return disponible;
};

// --- 4. GUARDAR / ACTUALIZAR ---
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const habNum = selectHabitacion.value;
    const fIn = inputCheckIn.value;
    const fOut = inputCheckOut.value;

    const esDisponible = await verificarDisponibilidad(habNum, fIn, fOut, editId);
    
    if (!esDisponible) {
        return Swal.fire({
            title: "Habitación Ocupada",
            text: `La habitación ${habNum} ya tiene una reserva en las fechas seleccionadas.`,
            icon: "error",
            confirmButtonColor: "#800020",
            zIndex: 10000 
        });
    }

    const reservaData = {
        huesped: document.getElementById("resHuesped").value,
        doc: document.getElementById("resDoc").value,
        nacimiento: document.getElementById("resNacimiento").value,
        nacionalidad: document.getElementById("resNacionalidad").value,
        telefono: document.getElementById("resTelefono").value,
        correo: document.getElementById("resCorreo").value,
        habitacion: habNum,
        medio: document.getElementById("resMedio").value,
        checkIn: fIn,
        checkOut: fOut,
        early: document.getElementById("resEarly").value,
        late: document.getElementById("resLate").value,
        personas: document.getElementById("resPersonas").value,
        tarifa: document.getElementById("resTarifa").value,
        moneda: selectMoneda.value,
        tipoCambio: inputTipoCambio.value,
        total: document.getElementById("resTotal").value,
        adelanto: document.getElementById("resAdelanto").value,
        diferencia: document.getElementById("resDiferencia").value,
        cochera: document.getElementById("resCochera").value,
        traslado: document.getElementById("resTraslado").value,
        desayuno: document.getElementById("resInfo").value,
        recepcion: document.getElementById("resRecepcion").value,
        recepcionconfi: document.getElementById("resRecepcionconfi").value,
        fechaRegistro: editId ? (listaReservasGlobal.find(r=>r.id === editId)?.fechaRegistro || new Date().toISOString()) : new Date().toISOString(),
        estado: "reservada"
    };

    try {
        if (editId) {
            await updateDoc(doc(db, "reservas", editId), reservaData);
            Swal.fire({ title: "Actualizado", icon: "success" });
        } else {
            await addDoc(collection(db, "reservas"), reservaData);
            Swal.fire({ title: "Éxito", icon: "success" });
        }
        
        // Sincronizar con la colección de huéspedes
        await sincronizarPerfilHuesped(reservaData);
        
        cerrarModal();
    } catch (error) {
        console.error(error);
        Swal.fire({ title: "Error", text: "No se pudo guardar", icon: "error" });
    }
});



// --- 5. RENDERIZADO (CORREGIDO) ---
onSnapshot(query(collection(db, "reservas"), orderBy("fechaRegistro", "desc")), (snapshot) => {
    tablaBody.innerHTML = "";
    listaReservasGlobal = [];
    
    snapshot.docs.forEach(docSnap => {
        const res = docSnap.data();
        const id = docSnap.id;
        listaReservasGlobal.push({ id, ...res });
        
        // Definir color por estado para la tabla
        const coloresEstado = {
            'reservada': '#3b82f6', // Azul
            'checkin': '#10b981',   // Verde
            'finalizado': '#64748b' // Gris
        };
        const colorActual = coloresEstado[res.estado] || '#800020';

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${res.huesped}</strong><br><small>${res.doc}</small></td>
            <td><span class="badge-hab" style="background:${colorActual}; color:white; padding:2px 8px; border-radius:4px;">Hab. ${res.habitacion}</span></td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td style="text-align:center">${res.personas}</td>
            <td><strong>S/ ${res.total}</strong></td>
            <td><span class="badge-medio type-${res.medio?.toLowerCase().replace(/\s/g, "")}">${res.medio}</span></td>
            <td>
                <div class="actions">
                    <button class="btn-edit" onclick="prepararEdicion('${id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="eliminarReserva('${id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        tablaBody.appendChild(tr);
    });
    actualizarContadores(listaReservasGlobal);
});

// IMPORTANTE: Asegúrate de que estas funciones estén en el scope global (window)
window.prepararEdicion = prepararEdicion;
window.eliminarReserva = eliminarReserva;
window.exportarExcel = exportarExcel;

window.prepararEdicion = async (id) => {
    const docRef = await getDoc(doc(db, "reservas", id));
    if (docRef.exists()) {
        const res = docRef.data();
        editId = id;
        document.getElementById("modalTitle").textContent = "Editar Reserva";
        
        Object.keys(res).forEach(key => {
            const el = document.getElementById(`res${key.charAt(0).toUpperCase() + key.slice(1)}`);
            if (el) el.value = res[key];
        });

        if(res.moneda === "PEN") {
            inputTipoCambio.disabled = true;
            inputTipoCambio.style.background = "#f1f5f9";
        } else {
            inputTipoCambio.disabled = false;
            inputTipoCambio.style.background = "#fff";
        }

        modal.classList.add("active");
    }
};

window.eliminarReserva = async (id) => {
    const result = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, borrar' });
    if (result.isConfirmed) await deleteDoc(doc(db, "reservas", id));
};

// --- 6. EXPORTACIÓN ---
window.exportarExcel = async () => {
    const { value: fechas } = await Swal.fire({
        title: 'Exportar Rango',
        html: '<input id="d1" class="swal2-input" type="date"><input id="d2" class="swal2-input" type="date">',
        preConfirm: () => [document.getElementById('d1').value, document.getElementById('d2').value]
    });
    if (fechas && fechas[0] && fechas[1]) {
        const filtradas = listaReservasGlobal.filter(r => r.checkIn >= fechas[0] && r.checkIn <= fechas[1]);
        let excel = `<table><tr><th>HUÉSPED</th><th>HAB</th><th>IN</th><th>OUT</th><th>TOTAL</th><th>MEDIO</th></tr>`;
        filtradas.forEach(r => excel += `<tr><td>${r.huesped}</td><td>${r.habitacion}</td><td>${r.checkIn}</td><td>${r.checkOut}</td><td>${r.total}</td><td>${r.medio}</td></tr>`);
        const url = 'data:application/vnd.ms-excel,' + encodeURIComponent(excel + `</table>`);
        const a = document.createElement("a"); a.href = url; a.download = `Reporte_Reservas.xls`; a.click();
    }
};

const cerrarModal = () => { 
    modal.classList.remove("active"); 
    form.reset(); 
    editId = null;
    inputTipoCambio.disabled = true;
};

document.querySelector(".close-modal").onclick = cerrarModal;
document.getElementById("btnAbrirModal").onclick = () => { 
    form.reset(); 
    editId = null; 
    document.getElementById("modalTitle").textContent = "Nueva Reserva";
    inputTipoCambio.disabled = true;
    modal.classList.add("active"); 
};