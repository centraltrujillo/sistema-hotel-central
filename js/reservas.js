import { db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy, getDoc, getDocs, where 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM (Basadas en tu HTML) ---
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
const inputAdelanto = document.getElementById("resAdelanto");
const inputDiferencia = document.getElementById("resDiferencia");
const selectMoneda = document.getElementById("resMoneda");
const inputTipoCambio = document.getElementById("resTipoCambio");

let editId = null;
let listaReservasGlobal = [];

// --- 1. CARGAR HABITACIONES EN EL SELECT ---
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

// --- 2. LÓGICA DE CÁLCULOS AUTOMÁTICOS ---
const calcularMontos = () => {
    const fIn = new Date(inputCheckIn.value);
    const fOut = new Date(inputCheckOut.value);
    const tarifa = parseFloat(inputTarifa.value) || 0;
    const tc = parseFloat(inputTipoCambio.value) || 1;
    const moneda = selectMoneda.value;

    if (inputCheckIn.value && inputCheckOut.value && fOut > fIn) {
        const noches = Math.ceil((fOut - fIn) / (1000 * 60 * 60 * 24));
        let total = noches * tarifa;
        if (moneda === "USD") total *= tc;
        inputTotal.value = total.toFixed(2);
    }

    const totalActual = parseFloat(inputTotal.value) || 0;
    const adelantoStr = inputAdelanto.value;
    const adelantoMonto = parseFloat(adelantoStr.match(/(\d+(\.\d+)?)/)?.[0]) || 0;
    inputDiferencia.value = (totalActual - adelantoMonto).toFixed(2);
};

[inputTarifa, inputCheckIn, inputCheckOut, inputAdelanto, inputTipoCambio, selectMoneda].forEach(el => {
    el.addEventListener("input", calcularMontos);
});

// --- 3. AUTOCOMPLETADO POR DNI ---
document.getElementById("resDoc").addEventListener("blur", async (e) => {
    const dni = e.target.value;
    if (dni.length < 4) return;
    const q = query(collection(db, "huespedes"), where("documento", "==", dni));
    const snap = await getDocs(q);
    if (!snap.empty) {
        const h = snap.docs[0].data();
        document.getElementById("resHuesped").value = h.nombre || h.huesped;
        document.getElementById("resTelefono").value = h.telefono || "";
        document.getElementById("resCorreo").value = h.correo || "";
        document.getElementById("resNacionalidad").value = h.nacionalidad || "";
        Swal.fire({ toast: true, position: 'top-end', title: 'Huésped encontrado', icon: 'info', showConfirmButton: false, timer: 1500 });
    }
});

// --- 4. GUARDAR / ACTUALIZAR RESERVA ---
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const data = {
        huesped: document.getElementById("resHuesped").value,
        doc: document.getElementById("resDoc").value,
        nacimiento: document.getElementById("resNacimiento").value,
        nacionalidad: document.getElementById("resNacionalidad").value,
        telefono: document.getElementById("resTelefono").value,
        correo: document.getElementById("resCorreo").value,
        habitacion: document.getElementById("resHabitacion").value,
        medio: document.getElementById("resMedio").value,
        checkIn: document.getElementById("resCheckIn").value,
        checkOut: document.getElementById("resCheckOut").value,
        personas: document.getElementById("resPersonas").value,
        early: document.getElementById("resEarly").value,
        late: document.getElementById("resLate").value,
        tarifa: inputTarifa.value,
        moneda: selectMoneda.value,
        tipoCambio: inputTipoCambio.value,
        total: inputTotal.value,
        adelanto: inputAdelanto.value,
        diferencia: inputDiferencia.value,
        desayuno: document.getElementById("resInfo").value,
        cochera: document.getElementById("resCochera").value,
        traslado: document.getElementById("resTraslado").value,
        recepcion: document.getElementById("resRecepcion").value,
        recepcionconfi: document.getElementById("resRecepcionconfi").value,
        estado: editId ? (listaReservasGlobal.find(r => r.id === editId).estado) : "reservada",
        fechaRegistro: editId ? (listaReservasGlobal.find(r => r.id === editId).fechaRegistro) : new Date().toISOString()
    };

    try {
        if (editId) {
            await updateDoc(doc(db, "reservas", editId), data);
        } else {
            await addDoc(collection(db, "reservas"), data);
        }
        // Sincronizar perfil
        const hRef = collection(db, "huespedes");
        const hQuery = query(hRef, where("documento", "==", data.doc));
        const hSnap = await getDocs(hQuery);
        if (hSnap.empty) await addDoc(hRef, { nombre: data.huesped, documento: data.doc, telefono: data.telefono, correo: data.correo });

        Swal.fire('¡Éxito!', 'Reserva procesada correctamente', 'success');
        cerrarModal();
    } catch (e) { console.error(e); Swal.fire('Error', 'No se pudo guardar', 'error'); }
});

// --- 5. RENDERIZADO Y CONTADORES ---
onSnapshot(query(collection(db, "reservas"), orderBy("fechaRegistro", "desc")), (snapshot) => {
    tablaBody.innerHTML = "";
    listaReservasGlobal = [];
    const conteo = { booking: 0, airbnb: 0, directas: 0, expedia: 0, personal: 0, dayuse: 0 };

    snapshot.docs.forEach(docSnap => {
        const res = docSnap.data();
        const id = docSnap.id;
        listaReservasGlobal.push({ id, ...res });

        // Sumar a contadores
        const m = res.medio?.toLowerCase().replace(/\s/g, "");
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

    // Actualizar números en las cards
    Object.keys(conteo).forEach(k => {
        const el = document.getElementById(`stat-${k}`);
        if (el) el.textContent = conteo[k];
    });
});

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

// --- FUNCIONES DE MODAL ---
window.prepararEdicion = (id) => {
    const res = listaReservasGlobal.find(r => r.id === id);
    if (res) {
        editId = id;
        document.getElementById("modalTitle").textContent = "Editar Reserva";
        // Rellenar todos los campos del formulario usando sus IDs
        document.getElementById("resHuesped").value = res.huesped;
        document.getElementById("resDoc").value = res.doc;
        document.getElementById("resNacimiento").value = res.nacimiento || "";
        document.getElementById("resNacionalidad").value = res.nacionalidad || "";
        document.getElementById("resTelefono").value = res.telefono || "";
        document.getElementById("resCorreo").value = res.correo || "";
        document.getElementById("resHabitacion").value = res.habitacion;
        document.getElementById("resMedio").value = res.medio;
        document.getElementById("resCheckIn").value = res.checkIn;
        document.getElementById("resCheckOut").value = res.checkOut;
        document.getElementById("resPersonas").value = res.personas;
        document.getElementById("resEarly").value = res.early || "";
        document.getElementById("resLate").value = res.late || "";
        document.getElementById("resTarifa").value = res.tarifa;
        document.getElementById("resMoneda").value = res.moneda;
        document.getElementById("resTipoCambio").value = res.tipoCambio || "";
        document.getElementById("resTotal").value = res.total;
        document.getElementById("resAdelanto").value = res.adelanto || "";
        document.getElementById("resDiferencia").value = res.diferencia;
        document.getElementById("resInfo").value = res.desayuno;
        document.getElementById("resCochera").value = res.cochera || "";
        document.getElementById("resTraslado").value = res.traslado || "";
        document.getElementById("resRecepcion").value = res.recepcion || "";
        document.getElementById("resRecepcionconfi").value = res.recepcionconfi || "";
        
        modal.classList.add("active");
    }
};

window.eliminarReserva = async (id) => {
    const res = await Swal.fire({ title: '¿Borrar?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' });
    if (res.isConfirmed) await deleteDoc(doc(db, "reservas", id));
};

const cerrarModal = () => { modal.classList.remove("active"); form.reset(); editId = null; };
btnAbrirModal.onclick = () => { editId = null; document.getElementById("modalTitle").textContent = "Nueva Reserva"; modal.classList.add("active"); };
closeModal.onclick = cerrarModal;