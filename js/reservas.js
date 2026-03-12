import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy, setDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS ---
const tablaBody = document.getElementById("tablaReservasBody");
const form = document.getElementById("formNuevaReserva");
const modal = document.getElementById("modalReserva");
const selectHabitacion = document.getElementById("resHabitacion");
const inputTotal = document.getElementById("resTotal");
const inputAdelanto = document.getElementById("resAdelanto");
const inputDiferencia = document.getElementById("resDiferencia");

let editId = null;

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

// --- 2. CÁLCULO DE DIFERENCIA ---
const calcularDiferencia = () => {
    const total = parseFloat(inputTotal.value) || 0;
    const adelantoMatch = inputAdelanto.value.match(/(\d+(\.\d+)?)/);
    const adelantoMonto = adelantoMatch ? parseFloat(adelantoMatch[0]) : 0;
    inputDiferencia.value = (total - adelantoMonto).toFixed(2);
};
inputTotal.addEventListener("input", calcularDiferencia);
inputAdelanto.addEventListener("input", calcularDiferencia);

// --- 3. GUARDAR EN RESERVAS Y HUÉSPEDES ---
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const commonData = {
        huesped: document.getElementById("resHuesped").value,
        doc: document.getElementById("resDoc").value,
        nacimiento: document.getElementById("resNacimiento").value,
        nacionalidad: document.getElementById("resNacionalidad").value,
        telefono: document.getElementById("resTelefono").value,
        correo: document.getElementById("resCorreo").value,
    };

    const reservaData = {
        ...commonData,
        habitacion: selectHabitacion.value,
        medio: document.getElementById("resMedio").value,
        checkIn: document.getElementById("resCheckIn").value,
        checkOut: document.getElementById("resCheckOut").value,
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
        fechaRegistro: new Date().toISOString()
    };

    try {
        // A. Guardar/Actualizar Reserva
        if (editId) {
            await updateDoc(doc(db, "reservas", editId), reservaData);
        } else {
            await addDoc(collection(db, "reservas"), reservaData);
        }

        // B. Sincronizar con la colección "huespedes" (usamos el DNI como ID para no duplicar)
        if (commonData.doc) {
            await setDoc(doc(db, "huespedes", commonData.doc), {
                ...commonData,
                ultimaVisita: new Date().toISOString()
            }, { merge: true });
        }

        Swal.fire("Éxito", "Reserva y datos de huésped guardados", "success");
        cerrarModal();
    } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo procesar la solicitud", "error");
    }
});

// --- 4. RENDERIZADO Y STATS ---
onSnapshot(query(collection(db, "reservas"), orderBy("fechaRegistro", "desc")), (snapshot) => {
    tablaBody.innerHTML = "";
    const counts = { booking: 0, airbnb: 0, directas: 0, expedia: 0, personal: 0, dayuse: 0 };

    snapshot.docs.forEach(docSnap => {
        const res = docSnap.data();
        const m = res.medio?.toLowerCase().replace(/\s/g, "");
        if (counts.hasOwnProperty(m)) counts[m]++;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${res.huesped}</strong><br><small>${res.doc}</small></td>
            <td>Hab. ${res.habitacion}</td>
            <td>${res.checkIn}</td>
            <td>${res.checkOut}</td>
            <td style="text-align:center">${res.personas}</td>
            <td>S/ ${res.total}</td>
            <td><span class="badge-medio type-${m}">${res.medio}</span></td>
            <td>
                <button class="btn-delete" onclick="eliminarReserva('${docSnap.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tablaBody.appendChild(tr);
    });

    Object.keys(counts).forEach(k => {
        const el = document.getElementById(`stat-${k}`);
        if (el) el.textContent = counts[k];
    });
});

// --- 5. EXPORTAR A EXCEL (Función Simple) ---
window.exportarExcel = () => {
    let table = document.querySelector(".res-table");
    let html = table.outerHTML;
    let url = 'data:application/vnd.ms-excel,' + encodeURIComponent(html);
    let link = document.createElement("a");
    link.download = "reporte_reservas_hotel_central.xls";
    link.href = url;
    link.click();
};

const cerrarModal = () => { modal.classList.remove("active"); form.reset(); editId = null; };
document.querySelector(".close-modal").onclick = cerrarModal;
document.getElementById("btnAbrirModal").onclick = () => { modal.classList.add("active"); };