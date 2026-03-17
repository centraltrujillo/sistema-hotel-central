import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, 
    where, addDoc, deleteDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');

onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarHabitaciones();
    } else {
        window.location.href = "index.html";
    }
});

// --- 1. UTILIDADES ---
function getHoyISO() {
    return new Date().toISOString().split('T')[0];
}

// --- 2. GESTIÓN DE CLIC (ABRIR MODAL SEGÚN ESTADO) ---
async function gestionarHabitacion(hab) {
    if (hab.estado === "Ocupada") {
        abrirModalGestionOcupada(hab);
    } else {
        abrirModalCheckIn(hab);
    }
}

// --- 3. MODAL CHECK-IN (SOLO PARA ENTRADA) ---
async function abrirModalCheckIn(hab) {
    const hoy = getHoyISO();
    const q = query(collection(db, "reservas"), 
              where("habitacion", "==", hab.numero.toString()), 
              where("fechaIngreso", "==", hoy),
              where("estado", "==", "reservado"));
    
    const snap = await getDocs(q);
    let opciones = { "manual": "Ingreso Directo (Sin Reserva)" };
    let reservaData = {};

    snap.forEach(d => {
        opciones[d.id] = `Reserva: ${d.data().huesped}`;
        reservaData[d.id] = d.data();
    });

    const { value: selectedId } = await Swal.fire({
        title: `Check-in Hab. ${hab.numero}`,
        input: 'select',
        inputOptions: opciones,
        confirmButtonColor: '#5a1914',
        showCancelButton: true
    });

    if (selectedId) {
        if (selectedId !== "manual") {
            // Actualizar reserva existente a checkin
            await updateDoc(doc(db, "reservas", selectedId), { estado: "checkin" });
        } else {
            // Crear reserva manual rápida
            await addDoc(collection(db, "reservas"), {
                huesped: "Huésped Directo",
                habitacion: hab.numero.toString(),
                fechaIngreso: hoy,
                estado: "checkin"
            });
        }
        await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
        Swal.fire('¡Check-in Exitoso!', '', 'success');
    }
}

// --- 4. MODAL GESTIÓN OCUPADA (CONSUMOS + EARLY/LATE) ---
async function abrirModalGestionOcupada(hab) {
    // 1. Buscar la reserva activa para leer Early/Late
    const qRes = query(collection(db, "reservas"), 
                 where("habitacion", "==", hab.numero.toString()), 
                 where("estado", "==", "checkin"));
    const snapRes = await getDocs(qRes);
    if (snapRes.empty) return;

    const resDoc = snapRes.docs[0];
    const rData = resDoc.data();
    const resId = resDoc.id;

    // 2. Buscar consumos en la colección independiente
    const qConsumos = query(collection(db, "consumos"), where("idReserva", "==", resId));
    const snapCons = await getDocs(qConsumos);
    const listaConsumos = snapCons.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalExtras = listaConsumos.reduce((acc, cur) => acc + cur.monto, 0);

    // 3. Construir el desglose de la tabla
    let htmlDesglose = `
        <div style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px; margin: 10px 0;">
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                <thead style="background: #f4f4f4; position: sticky; top: 0;">
                    <tr><th style="padding: 5px;">Desc.</th><th style="padding: 5px;">S/</th><th></th></tr>
                </thead>
                <tbody>`;
    
    listaConsumos.forEach(c => {
        htmlDesglose += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px;">${c.descripcion}</td>
                <td style="padding: 8px;">${c.monto.toFixed(2)}</td>
                <td style="padding: 8px;">
                    <button onclick="eliminarConsumo('${c.id}', '${hab.id}')" style="color:red; border:none; background:none; cursor:pointer;">×</button>
                </td>
            </tr>`;
    });

    if(listaConsumos.length === 0) htmlDesglose += `<tr><td colspan="3" style="text-align:center; padding:10px; color:#999;">Sin consumos</td></tr>`;
    htmlDesglose += `</tbody></table></div>`;

    // 4. Mostrar Modal Final
    Swal.fire({
        title: `Habitación ${hab.numero}`,
        width: '500px',
        html: `
            <div style="text-align: left; font-family: 'Lato', sans-serif;">
                <p><b>Huésped:</b> ${rData.huesped}</p>
                <div style="margin-bottom: 10px;">
                    ${rData.earlyCheckin ? '<span style="background:#fffbeb; color:#b45309; padding:4px 8px; border-radius:5px; font-size:11px; font-weight:bold; border:1px solid #fcd34d; margin-right:5px;">EARLY CHECK-IN</span>' : ''}
                    ${rData.lateCheckout ? '<span style="background:#fffbeb; color:#b45309; padding:4px 8px; border-radius:5px; font-size:11px; font-weight:bold; border:1px solid #fcd34d;">LATE CHECK-OUT</span>' : ''}
                </div>
                <hr>
                <h4 style="font-size: 14px; color: #5a1914;">DESGLOSE DE EXTRAS</h4>
                ${htmlDesglose}
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; padding:10px; border-radius:5px;">
                    <b>TOTAL EXTRAS:</b>
                    <b style="font-size: 18px; color: #800020;">S/ ${totalExtras.toFixed(2)}</b>
                </div>
                <button id="addEx" class="swal2-confirm swal2-styled" style="width:100%; margin:10px 0 0 0; background:#5a1914;">+ AÑADIR PRODUCTO</button>
            </div>
        `,
        showDenyButton: true,
        confirmButtonText: 'Cerrar',
        denyButtonText: 'Procesar Check-out',
        didOpen: () => {
            document.getElementById('addEx').onclick = () => registrarConsumo(resId, hab);
        }
    }).then((result) => {
        if (result.isDenied) {
            confirmarCheckOut(resId, hab.id, totalExtras);
        }
    });
}

// --- 5. FUNCIONES DE CONSUMOS (COLECCIÓN 'consumos') ---
async function registrarConsumo(resId, hab) {
    const { value: formValues } = await Swal.fire({
        title: 'Nuevo Cargo',
        html: '<input id="d" class="swal2-input" placeholder="Producto"><input id="m" type="number" class="swal2-input" placeholder="S/">',
        preConfirm: () => ({ d: document.getElementById('d').value, m: document.getElementById('m').value })
    });

    if (formValues && formValues.d && formValues.m) {
        await addDoc(collection(db, "consumos"), {
            idReserva: resId,
            descripcion: formValues.d,
            monto: parseFloat(formValues.m),
            fecha: new Date().toISOString()
        });
        abrirModalGestionOcupada(hab); // Refrescar modal sin recargar página
    }
}

window.eliminarConsumo = async (consId, habId) => {
    await deleteDoc(doc(db, "consumos", consId));
    Swal.fire('Eliminado', '', 'success').then(() => location.reload());
};

// --- 6. CHECK-OUT Y LIBERACIÓN ---
async function confirmarCheckOut(resId, habId, total) {
    const { value: decision } = await Swal.fire({
        title: 'Finalizar Estadía',
        text: `Total Extras acumulados: S/ ${total.toFixed(2)}`,
        input: 'select',
        inputOptions: { 'Sucia': 'Enviar a Limpieza', 'Libre': 'Disponible' },
        showCancelButton: true,
        confirmButtonText: 'Cobrar y Salir'
    });

    if (decision) {
        await updateDoc(doc(db, "reservas", resId), { 
            estado: "finalizado", 
            totalConsumos: total,
            fechaSalidaReal: new Date().toISOString() 
        });
        await updateDoc(doc(db, "habitaciones", habId), { estado: decision });
        Swal.fire('Check-out realizado', '', 'success');
    }
}

// --- 7. RENDERIZADO DE CARDS CON INDICADORES ---
function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"));
    const hoy = getHoyISO();

    onSnapshot(qHabs, async (snapshot) => {
        if (!habGrid) return;
        habGrid.innerHTML = '';
        
        // Consultar quién llega hoy para marcar las tarjetas libres
        const qReservasHoy = query(collection(db, "reservas"), where("fechaIngreso", "==", hoy), where("estado", "==", "reservado"));
        const snapRes = await getDocs(qReservasHoy);
        const listaReservasHoy = snapRes.docs.map(d => d.data().habitacion);

        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => a.numero - b.numero);

        docs.forEach((hab) => {
            const estado = hab.estado || "Libre";
            const reservadaHoy = listaReservasHoy.includes(hab.numero.toString());

            const card = document.createElement('div');
            card.className = `hab-card ${estado.toLowerCase()}`;
            card.innerHTML = `
                <div class="hab-header">
                    <span class="hab-number">${hab.numero}</span>
                    <span class="hab-badge">${estado}</span>
                </div>
                <div class="hab-body">
                    <p>Piso ${hab.piso} - ${hab.tipo}</p>
                    ${reservadaHoy && estado !== "Ocupada" ? 
                      `<p style="color: #800020; font-weight: bold; font-size: 11px; margin-top: 5px;">
                        <i class="fa-solid fa-calendar-day"></i> RESERVADA HOY
                       </p>` : ''}
                </div>
                <div class="hab-footer">
                    ${estado === 'Ocupada' ? 'VER GESTIÓN / CONSUMOS' : 'GESTIONAR ENTRADA'}
                </div>
            `;
            card.onclick = () => gestionarHabitacion(hab);
            habGrid.appendChild(card);
        });
    });
}