import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, 
    where, addDoc, deleteDoc, getDoc, orderBy 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');

onAuthStateChanged(auth, (user) => {
    if (user) { cargarHabitaciones(); } 
    else { window.location.href = "index.html"; }
});

function getHoyISO() {
    const fecha = new Date();
    const offset = fecha.getTimezoneOffset();
    const ajustada = new Date(fecha.getTime() - (offset * 60 * 1000));
    return ajustada.toISOString().split('T')[0];
}

// --- 1. CARGAR TABLERO ---
function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"));
    const hoy = getHoyISO();

    onSnapshot(qHabs, async (snapshot) => {
        habGrid.innerHTML = '';
        let s = { l: 0, o: 0 };

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
                        ? '<p style="color:#800020; font-weight:bold; font-size:10px; margin-top:5px;">⚠️ RESERVA PARA HOY</p>' 
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

// --- 2. MODAL CHECK-IN + ANTI OVERBOOKING ---
async function abrirModalCheckIn(hab) {
    const hoy = getHoyISO();

    // VALIDACIÓN ANTI-OVERBOOKING: Verificar si ya hay alguien con checkin en esta hab
    const qCheck = query(collection(db, "reservas"), 
                   where("habitacion", "==", hab.numero.toString()), 
                   where("estado", "==", "checkin"));
    const snapCheck = await getDocs(qCheck);

    if (!snapCheck.empty) {
        Swal.fire('Error', 'Esta habitación ya tiene un check-in activo en el sistema.', 'error');
        return;
    }

    const q = query(collection(db, "reservas"), 
              where("habitacion", "==", hab.numero.toString()), 
              where("checkIn", "==", hoy),
              where("estado", "==", "reservada"));
    
    const snap = await getDocs(q);
    let opciones = { "directo": "➕ Venta del Día (Cliente nuevo)" };
    snap.forEach(d => { opciones[d.id] = `🏨 Reserva: ${d.data().huesped}`; });

    const { value: choice } = await Swal.fire({
        title: `Check-in Hab. ${hab.numero}`,
        input: 'select',
        inputOptions: opciones,
        confirmButtonColor: '#5a1914',
        showCancelButton: true
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
        // CRÍTICO: Esto hace que la casita cambie a color vino
        await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
    }
}

// --- 3. MODAL GESTIÓN (DATOS COMPLETOS - ACTUALIZADO) ---
async function abrirModalGestionOcupada(hab) {
    const qRes = query(collection(db, "reservas"), 
                 where("habitacion", "==", hab.numero.toString()), 
                 where("estado", "==", "checkin"));
    
    const snapRes = await getDocs(qRes);
    if (snapRes.empty) return;

    const resDoc = snapRes.docs[0];
    const r = resDoc.data(); 

    // Consultar consumos
    const qCons = query(collection(db, "consumos"), where("idReserva", "==", resDoc.id));
    const snapCons = await getDocs(qCons);
    let totalCons = 0;
    let tablaCons = '';

    snapCons.forEach(c => {
        const item = c.data();
        totalCons += parseFloat(item.precio);
        // Usamos la clase consumo-row del CSS
        tablaCons += `
            <div class="consumo-row">
                <span>${item.descripcion}</span>
                <b>S/ ${parseFloat(item.precio).toFixed(2)}</b>
            </div>`;
    });

    Swal.fire({
        title: `<span style="font-family: var(--font-titles); color: var(--vino-tinto);">Habitación ${hab.numero}</span>`,
        width: '750px', 
        html: `
            <div class="cuenta-modal-container">
                <div class="info-huesped-grid">
                    <div>
                        <h4>Huésped</h4>
                        <p><b>Nombre:</b> ${r.huesped}</p>
                        <p><b>Doc:</b> ${r.doc || 'N/A'}</p>
                        <p><b>Tel:</b> ${r.telefono || 'N/A'}</p>
                    </div>
                    <div>
                        <h4>Estadía</h4>
                        <p><b>Ingreso:</b> ${r.checkIn}</p>
                        <p><b>Salida:</b> ${r.checkOut}</p>
                        <p><b>Pax:</b> ${r.personas || '1'} | 🚗: ${r.cochera || 'No'}</p>
                    </div>
                </div>

                <h4 style="font-family: var(--font-titles); margin-top: 20px; color: var(--marron-zocalo);">🛒 Consumos Extra</h4>
                
                <div class="consumos-scroll-area">
                    ${tablaCons || '<p style="text-align:center; color:#94a3b8; padding: 20px;">No hay consumos registrados aún.</p>'}
                </div>
                
                <div class="liquidacion-footer">
                    <span>TOTAL EXTRAS:</span>
                    <span class="monto-total">S/ ${totalCons.toFixed(2)}</span>
                </div>

                <button id="btnAddConsumo" class="btn-dorado-full">
                    + REGISTRAR NUEVO CONSUMO
                </button>
            </div>
        `,
        showDenyButton: true,
        denyButtonText: '🏁 FINALIZAR ESTADÍA (CHECK-OUT)',
        confirmButtonText: 'CERRAR VENTANA',
        confirmButtonColor: 'var(--gris-antracita)',
        customClass: {
            denyButton: 'btn-checkout-final' // Clase vino tinto para el botón de salida
        },
        didOpen: () => {
            document.getElementById('btnAddConsumo').onclick = () => agregarConsumo(resDoc.id, hab);
        }
    }).then(result => {
        if (result.isDenied) realizarCheckOut(resDoc.id, hab, r, totalCons);
    });
}

// --- 4. AGREGAR CONSUMO (Igual) ---
async function agregarConsumo(resId, hab) {
    const { value: f } = await Swal.fire({
        title: 'Nuevo Consumo',
        html: '<input id="c-desc" class="swal2-input" placeholder="Qué compró?"><input id="c-price" class="swal2-input" type="number" placeholder="Precio S/">',
        preConfirm: () => ({ d: document.getElementById('c-desc').value, p: document.getElementById('c-price').value })
    });
    if (f && f.d && f.p) {
        await addDoc(collection(db, "consumos"), { idReserva: resId, descripcion: f.d, precio: parseFloat(f.p), fecha: new Date().toISOString() });
        abrirModalGestionOcupada(hab);
    }
}

// --- 5. CHECK-OUT ---
async function realizarCheckOut(resId, hab, rData, totalConsumos) {
    const subHosp = parseFloat(rData.total) || 0;
    const granTotal = subHosp + totalConsumos;

    const qCons = query(collection(db, "consumos"), where("idReserva", "==", resId));
    const snapCons = await getDocs(qCons);
    const listaConsumos = snapCons.docs.map(d => d.data());

    const { value: metodo, isConfirmed } = await Swal.fire({
        title: `<span style="font-family: var(--font-titles); color: var(--vino-tinto);">Finalizar Estadía</span>`,
        html: `
            <div class="checkout-container">
                <div class="checkout-resumen">
                    <p>Hospedaje: <b>S/ ${subHosp.toFixed(2)}</b></p>
                    <p>Extras: <b>S/ ${totalConsumos.toFixed(2)}</b></p>
                    <span class="checkout-total-destacado">TOTAL: S/ ${granTotal.toFixed(2)}</span>
                </div>
                
                <label class="checkout-select-label">Método de Pago:</label>
                <select id="metodoPago" class="swal2-select custom-select-pago">
                    <option value="Efectivo">💵 Efectivo</option>
                    <option value="Tarjeta">💳 Tarjeta (Visa/MC)</option>
                    <option value="Transferencia">📱 Yape / Plin / Transferencia</option>
                </select>
            </div>`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '✅ PAGAR E IMPRIMIR',
        showDenyButton: true,
        denyButtonText: 'SÓLO REGISTRAR PAGO',
        customClass: {
            confirmButton: 'btn-pagar-imprimir',
            denyButton: 'btn-solo-pagar'
        },
        preConfirm: () => document.getElementById('metodoPago').value
    });


    if (isConfirmed || Swal.getDenyButton().classList.contains('swal2-deny')) {
        try {
            // A. REGISTRO EN COLECCIÓN DE PAGOS 
            await addDoc(collection(db, "pagos"), {
                idReserva: resId,
                huesped: rData.huesped,
                habitacion: hab.numero,
                montoHospedaje: subHosp,
                montoExtras: totalConsumos,
                montoTotal: granTotal,
                metodoPago: metodo || "No especificado",
                fechaPago: new Date() 
            });

            // B. ¿IMPRIMIR TICKET? (Solo si eligió el botón verde)
            if (isConfirmed) {
                imprimirTicket(rData, listaConsumos, totalConsumos, granTotal);
            }

            // C. ACTUALIZAR ESTADOS EN FIREBASE
            await updateDoc(doc(db, "reservas", resId), { estado: "finalizado" });
            await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Libre" });

            Swal.fire('¡Check-out Exitoso!', 'Ingreso guardado y habitación liberada.', 'success');

        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Hubo un problema al procesar el pago.', 'error');
        }
    }
}

function imprimirTicket(rData, consumos, totalConsumos, granTotal) {
    const ventana = window.open('', '_blank');
    const fechaActual = new Date().toLocaleString();
    
    // Generar filas de consumos
    let filasConsumos = consumos.map(c => `
        <tr>
            <td style="padding: 5px 0;">${c.descripcion}</td>
            <td style="text-align: right;">S/ ${parseFloat(c.precio).toFixed(2)}</td>
        </tr>
    `).join('');

    ventana.document.write(`
        <html>
        <head>
            <title>Ticket de Pago - Hab ${rData.habitacion}</title>
            <style>
                body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; padding: 20px; color: #000; }
                .text-center { text-align: center; }
                .divider { border-top: 1px dashed #000; margin: 10px 0; }
                table { width: 100%; font-size: 12px; }
                .total { font-size: 16px; font-weight: bold; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div class="text-center">
                <h2 style="margin:0;">HOTEL CENTRAL</h2>
                <p style="font-size:10px;">RUC: 10XXXXXXXXX<br>Calle Principal 123 - Trujillo</p>
            </div>
            
            <div class="divider"></div>
            <p style="font-size:12px;">
                <b>Ticket de Salida</b><br>
                Fecha: ${fechaActual}<br>
                Huésped: ${rData.huesped}<br>
                Habitación: ${rData.habitacion}
            </p>
            <div class="divider"></div>
            
            <table>
                <thead>
                    <tr><th align="left">Concepto</th><th align="right">Importe</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 5px 0;">Estadía (${rData.checkIn} al ${rData.checkOut})</td>
                        <td style="text-align: right;">S/ ${parseFloat(rData.total).toFixed(2)}</td>
                    </tr>
                    ${filasConsumos}
                </tbody>
            </table>
            
            <div class="divider"></div>
            <table>
                <tr>
                    <td class="total">TOTAL A PAGAR</td>
                    <td class="total" align="right">S/ ${granTotal.toFixed(2)}</td>
                </tr>
            </table>
            
            <div class="divider"></div>
            <p class="text-center" style="font-size:10px;">¡Gracias por su preferencia!<br>Vuelva pronto.</p>
        </body>
        </html>
    `);
    ventana.document.close();
}
