import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy, setDoc, getDoc, getDocs, where 
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

let editId = null;
let listaReservasGlobal = [];

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
    const tarifa = parseFloat(inputTarifa.value) || 0;

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

[inputTarifa, inputCheckIn, inputCheckOut, inputAdelanto, inputTotal].forEach(el => {
    el.addEventListener("input", calcularMontos);
});

// --- FUNCIÓN PARA CONTAR POR MEDIO ---
const actualizarContadores = (reservas) => {
    const conteo = { booking: 0, airbnb: 0, directas: 0, personal: 0 };
    reservas.forEach(r => {
        const m = r.medio?.toLowerCase();
        if (conteo.hasOwnProperty(m)) conteo[m]++;
    });
    Object.keys(conteo).forEach(key => {
        const el = document.getElementById(`count-${key}`);
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
            zIndex: 10000 // Asegura que esté por encima del modal
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
            Swal.fire({ title: "Actualizado", icon: "success", zIndex: 10000 });
        } else {
            await addDoc(collection(db, "reservas"), reservaData);
            Swal.fire({ title: "Éxito", icon: "success", zIndex: 10000 });
        }
        cerrarModal();
    } catch (error) {
        Swal.fire({ title: "Error", text: "No se pudo guardar", icon: "error", zIndex: 10000 });
    }
});

// --- 5. RENDERIZADO ---
onSnapshot(query(collection(db, "reservas"), orderBy("fechaRegistro", "desc")), (snapshot) => {
    tablaBody.innerHTML = "";
    listaReservasGlobal = [];
    snapshot.docs.forEach(docSnap => {
        const res = docSnap.data();
        const id = docSnap.id;
        listaReservasGlobal.push({ id, ...res });
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${res.huesped}</strong><br><small>${res.doc}</small></td>
            <td><span class="badge-hab">Hab. ${res.habitacion}</span></td>
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
        modal.classList.add("active");
    }
};

window.eliminarReserva = async (id) => {
    const result = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, borrar', zIndex: 10000 });
    if (result.isConfirmed) await deleteDoc(doc(db, "reservas", id));
};

// --- 6. EXPORTACIÓN ---
window.exportarExcel = async () => {
    const { value: fechas } = await Swal.fire({
        title: 'Exportar Rango', zIndex: 10000,
        html: '<input id="d1" class="swal2-input" type="date"><input id="d2" class="swal2-input" type="date">',
        preConfirm: () => [document.getElementById('d1').value, document.getElementById('d2').value]
    });
    if (fechas && fechas[0] && fechas[1]) {
        const filtradas = listaReservasGlobal.filter(r => r.checkIn >= fechas[0] && r.checkIn <= fechas[1]);
        let excel = `<table><tr><th>HUÉSPED</th><th>HAB</th><th>IN</th><th>OUT</th><th>TOTAL</th></tr>`;
        filtradas.forEach(r => excel += `<tr><td>${r.huesped}</td><td>${r.habitacion}</td><td>${r.checkIn}</td><td>${r.checkOut}</td><td>${r.total}</td></tr>`);
        const url = 'data:application/vnd.ms-excel,' + encodeURIComponent(excel + `</table>`);
        const a = document.createElement("a"); a.href = url; a.download = `Reporte.xls`; a.click();
    }
};

const cerrarModal = () => { modal.classList.remove("active"); form.reset(); editId = null; };
document.querySelector(".close-modal").onclick = cerrarModal;
document.getElementById("btnAbrirModal").onclick = () => { form.reset(); editId = null; modal.classList.add("active"); };