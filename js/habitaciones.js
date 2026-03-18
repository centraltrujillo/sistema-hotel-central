import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, 
    where, addDoc, deleteDoc, getDoc, orderBy 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');

// --- SEGURIDAD ---
onAuthStateChanged(auth, (user) => {
    if (user) { cargarHabitaciones(); } 
    else { window.location.href = "index.html"; }
});

// --- UTILIDADES ---
function getHoyISO() {
    const fecha = new Date();
    const offset = fecha.getTimezoneOffset();
    const ajustada = new Date(fecha.getTime() - (offset * 60 * 1000));
    return ajustada.toISOString().split('T')[0];
}

// --- 1. CARGAR TABLERO DE HABITACIONES ---
function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"));
    const hoy = getHoyISO();

    onSnapshot(qHabs, async (snapshot) => {
        habGrid.innerHTML = '';
        let s = { l: 0, o: 0 };

        // Buscamos si hay reservas que llegan hoy
        const qRes = query(collection(db, "reservas"), 
                     where("checkIn", "==", hoy), 
                     where("estado", "==", "reservada"));
        const snapRes = await getDocs(qRes);
        const listaReservasHoy = snapRes.docs.map(d => d.data().habitacion);

        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => a.numero - b.numero);

        docs.forEach(hab => {
            const est = hab.estado || "Libre";
            if (est === "Libre") s.l++; else s.o++;

            const tieneReservaHoy = listaReservasHoy.includes(hab.numero.toString());

            const card = document.createElement('div');
            card.className = `hab-card ${est.toLowerCase()}`;
            
            card.innerHTML = `
                <span class="hab-number">${hab.numero}</span>
                <div class="hab-body">
                    <p style="font-size:14px; font-weight:bold; margin:5px 0;">${hab.tipo}</p>
                    <span class="hab-badge">${est}</span>
                    ${tieneReservaHoy && est === "Libre" 
                        ? '<p style="color:#800020; font-weight:bold; font-size:10px; margin-top:5px;">⚠️ LLEGADA HOY</p>' 
                        : ''}
                </div>`;

            card.onclick = () => {
                if (est === "Ocupada") {
                    abrirModalGestionOcupada(hab);
                } else {
                    abrirModalCheckIn(hab);
                }
            };

            habGrid.appendChild(card);
        });

        document.getElementById('stat-libres').innerText = s.l;
        document.getElementById('stat-ocupadas').innerText = s.o;
    });
}

// --- 2. MODAL CHECK-IN (INGRESO) ---
async function abrirModalCheckIn(hab) {
    const hoy = getHoyISO();
    const q = query(collection(db, "reservas"), 
              where("habitacion", "==", hab.numero.toString()), 
              where("checkIn", "==", hoy),
              where("estado", "==", "reservada"));
    
    const snap = await getDocs(q);
    let opciones = { "directo": "➕ Venta del Día (Cliente nuevo)" };
    snap.forEach(d => { opciones[d.id] = `🏨 Reserva: ${d.data().huesped}`; });

    const { value: choice } = await Swal.fire({
        title: `Check-in Hab. ${hab.numero}`,
        text: 'Seleccione una reserva existente o registre ingreso directo',
        input: 'select',
        inputOptions: opciones,
        confirmButtonColor: '#5a1914',
        showCancelButton: true,
        cancelButtonText: 'Cancelar'
    });

    if (choice) {
        if (choice === "directo") {
            await addDoc(collection(db, "reservas"), {
                huesped: "Huésped Directo",
                habitacion: hab.numero.toString(),
                checkIn: hoy,
                estado: "checkin",
                total: 0,
                fechaRegistro: new Date().toISOString()
            });
        } else {
            await updateDoc(doc(db, "reservas", choice), { estado: "checkin" });
        }
        await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
    }
}

// --- 3. MODAL GESTIÓN OCUPADA (DATOS + CONSUMOS) ---
async function abrirModalGestionOcupada(hab) {
    const qRes = query(collection(db, "reservas"), 
                 where("habitacion", "==", hab.numero.toString()), 
                 where("estado", "==", "checkin"));
    
    const snapRes = await getDocs(qRes);
    if (snapRes.empty) return;

    const resDoc = snapRes.docs[0];
    const rData = resDoc.data();

    // Consultar consumos vinculados a esta estadía
    const qCons = query(collection(db, "consumos"), where("idReserva", "==", resDoc.id));
    const snapCons = await getDocs(qCons);
    let totalConsumos = 0;
    let tablaConsumos = '<table style="width:100%; font-size:13px; margin-top:10px; border-collapse:collapse;">';

    snapCons.forEach(c => {
        const item = c.data();
        totalConsumos += parseFloat(item.precio);
        tablaConsumos += `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:5px;">${item.descripcion}</td>
                <td style="text-align:right;">S/ ${parseFloat(item.precio).toFixed(2)}</td>
            </tr>`;
    });
    tablaConsumos += '</table>';

    Swal.fire({
        title: `<span style="color:#800020">Habitación ${hab.numero}</span>`,
        width: '500px',
        html: `
            <div style="text-align:left; font-family:'Lato', sans-serif;">
                <div style="background:#f8fafc; padding:10px; border-radius:8px; margin-bottom:15px;">
                    <p style="margin:2px 0;"><b>Huésped:</b> ${rData.huesped}</p>
                    <p style="margin:2px 0;"><b>Ingreso:</b> ${rData.checkIn}</p>
                    <p style="margin:2px 0;"><b>Medio:</b> ${rData.medio || 'Directo'}</p>
                </div>
                <h4 style="margin:0; border-bottom:2px solid #5a1914; padding-bottom:5px;">🛒 Consumos Extra</h4>
                ${snapCons.empty ? '<p style="font-size:12px; color:#666;">No hay consumos registrados.</p>' : tablaConsumos}
                <div style="text-align:right; margin-top:10px; font-weight:bold; color:#2e7d32;">
                    Total Extras: S/ ${totalConsumos.toFixed(2)}
                </div>
                <button id="btnAddConsumo" style="width:100%; margin-top:15px; background:#2e7d32; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer;">
                    + AGREGAR CONSUMO
                </button>
            </div>
        `,
        showDenyButton: true,
        denyButtonText: '🏁 REALIZAR CHECK-OUT',
        denyButtonColor: '#800020',
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#64748b',
        didOpen: () => {
            document.getElementById('btnAddConsumo').onclick = () => agregarConsumo(resDoc.id, hab);
        }
    }).then(result => {
        if (result.isDenied) {
            realizarCheckOut(resDoc.id, hab, rData, totalConsumos);
        }
    });
}

// --- 4. AGREGAR CONSUMO ---
async function agregarConsumo(resId, hab) {
    const { value: formValues } = await Swal.fire({
        title: 'Registrar Consumo',
        html:
            '<input id="c-desc" class="swal2-input" placeholder="Descripción">' +
            '<input id="c-price" class="swal2-input" type="number" placeholder="Precio S/">',
        showCancelButton: true,
        confirmButtonColor: '#2e7d32',
        preConfirm: () => {
            const d = document.getElementById('c-desc').value;
            const p = document.getElementById('c-price').value;
            if (!d || !p) return Swal.showValidationMessage('Complete ambos campos');
            return { descripcion: d, precio: parseFloat(p) };
        }
    });

    if (formValues) {
        await addDoc(collection(db, "consumos"), {
            idReserva: resId,
            descripcion: formValues.descripcion,
            precio: formValues.precio,
            fecha: new Date().toISOString()
        });
        abrirModalGestionOcupada(hab); // Refrescar
    }
}

// --- 5. CHECK-OUT Y LIMPIEZA ---
async function realizarCheckOut(resId, hab, rData, totalConsumos) {
    const subtotalHospedaje = parseFloat(rData.total) || 0;
    const granTotal = subtotalHospedaje + totalConsumos;

    const { isConfirmed } = await Swal.fire({
        title: 'Confirmar Salida',
        html: `
            <div style="text-align:left; background:#fff5f5; padding:15px; border-radius:10px; border:1px solid #feb2b2;">
                <p><b>Hospedaje:</b> S/ ${subtotalHospedaje.toFixed(2)}</p>
                <p><b>Extras:</b> S/ ${totalConsumos.toFixed(2)}</p>
                <hr>
                <h2 style="margin:0; color:#800020; text-align:center;">Total: S/ ${granTotal.toFixed(2)}</h2>
            </div>
            <p style="font-size:12px; margin-top:10px; color:#666;">Al confirmar, la habitación quedará LIBRE.</p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'PAGAR Y LIBERAR',
        confirmButtonColor: '#2e7d32'
    });

    if (isConfirmed) {
        // Marcamos reserva como finalizada y liberamos habitación
        await updateDoc(doc(db, "reservas", resId), { estado: "finalizado" });
        await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Libre" });
        
        Swal.fire('¡Check-out exitoso!', `La habitación ${hab.numero} está lista.`, 'success');
    }
}