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

docs.forEach(hab => {
    const est = hab.estado || "Libre";
    
    // Convertimos ambos a String para asegurar que la comparación sea exitosa
    const tieneReservaHoy = listaReservasHoy.some(resHab => String(resHab) === String(hab.numero));


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

// --- 2. MODAL CHECK-IN (ELECCIÓN) ---
async function abrirModalCheckIn(hab) {
    const hoy = getHoyISO();

    // A. VALIDACIÓN ANTI-OVERBOOKING (Si ya está ocupada)
    const qCheck = query(collection(db, "reservas"), 
                   where("habitacion", "==", hab.numero.toString()), 
                   where("estado", "==", "checkin"));
    const snapCheck = await getDocs(qCheck);

    if (!snapCheck.empty) {
        Swal.fire('Error', 'Esta habitación ya tiene un check-in activo.', 'error');
        return;
    }

    // B. BUSCAR RESERVAS PARA HOY
    const q = query(collection(db, "reservas"), 
              where("habitacion", "==", hab.numero.toString()), 
              where("checkIn", "==", hoy),
              where("estado", "==", "reservada"));
    
    const snap = await getDocs(q);
    let opciones = {};
    
    snap.forEach(d => { 
        opciones[d.id] = `🏨 Reserva: ${d.data().huesped}`; 
    });
    opciones["directo"] = "➕ Venta del Día (Cliente nuevo)";

    const { value: choice } = await Swal.fire({
        title: `Check-in Hab. ${hab.numero}`,
        input: 'select',
        inputOptions: opciones,
        inputPlaceholder: 'Seleccione una opción',
        confirmButtonColor: '#800020',
        showCancelButton: true,
        preConfirm: async (value) => {
            if (!value) {
                Swal.showValidationMessage('Debes seleccionar una opción');
                return false;
            }
            // ADVERTENCIA DE OVERBOOKING si elige directo habiendo reservas
            if (value === "directo" && !snap.empty) {
                const result = await Swal.fire({
                    title: '¿Estás seguro?',
                    text: "Hay una reserva para hoy. ¿Deseas ignorarla?",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, proceder',
                    cancelButtonText: 'No, cancelar'
                });
                return result.isConfirmed ? "directo" : false;
            }
            return value;
        }
    });

    if (choice) {
        if (choice === "directo") {
            modalCheckInDirecto(hab); 
        } else {
            // Es una reserva existente: Actualizamos estados
            await updateDoc(doc(db, "reservas", choice), { estado: "checkin" });
            await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
            Swal.fire('¡Éxito!', 'Check-in de reserva completado', 'success');
        }
    }
}

// --- 3. MODAL PARA INGRESO DIRECTO (DATOS COMPLETOS) ---
async function modalCheckInDirecto(hab) {
    const hoy = getHoyISO();
    
    const { value: formValues } = await Swal.fire({
        title: `<span style="font-family: var(--font-titles); color: var(--vino-tinto);">Check-in Directo: Hab. ${hab.numero}</span>`,
        width: '600px',
        html: `
            <div style="text-align: left; font-family: var(--font-main); display: grid; grid-template-columns: 1fr 1fr; gap: 15px; padding: 10px;">
                <div style="grid-column: span 2;">
                    <label style="font-size: 12px; font-weight: bold; color: var(--gris-antracita);">NOMBRE COMPLETO</label>
                    <input id="ni-nombre" class="swal2-input" style="width: 100%; margin: 5px 0;">
                </div>
                <div>
                    <label style="font-size: 12px; font-weight: bold; color: var(--gris-antracita);">DNI / CE</label>
                    <input id="ni-doc" class="swal2-input" style="width: 100%; margin: 5px 0;">
                </div>
                <div>
                    <label style="font-size: 12px; font-weight: bold; color: var(--gris-antracita);">TELÉFONO</label>
                    <input id="ni-tel" class="swal2-input" style="width: 100%; margin: 5px 0;">
                </div>
                <div>
                    <label style="font-size: 12px; font-weight: bold; color: var(--gris-antracita);">CANT. PERSONAS (PAX)</label>
                    <input id="ni-personas" type="number" class="swal2-input" style="width: 100%; margin: 5px 0;" value="1" min="1">
                </div>
                <div>
                    <label style="font-size: 12px; font-weight: bold; color: var(--gris-antracita);">FECHA SALIDA</label>
                    <input id="ni-out" type="date" class="swal2-input" style="width: 100%; margin: 5px 0;" value="${hoy}">
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 12px; font-weight: bold; color: var(--gris-antracita);">PRECIO ACORDADO (S/)</label>
                    <input id="ni-precio" type="number" class="swal2-input" style="width: 100%; margin: 5px 0;" value="${hab.precio || 0}">
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 12px; font-weight: bold; color: var(--gris-antracita);">NOTAS / PLACA</label>
                    <textarea id="ni-notas" class="swal2-textarea" style="width: 100%; margin: 5px 0;"></textarea>
                </div>
            </div>`,
        confirmButtonText: 'CONFIRMAR INGRESO',
        confirmButtonColor: 'var(--vino-tinto)',
        showCancelButton: true,
        preConfirm: () => {
            const nombre = document.getElementById('ni-nombre').value;
            const docu = document.getElementById('ni-doc').value;
            const out = document.getElementById('ni-out').value;
            const precio = document.getElementById('ni-precio').value;
            const personas = document.getElementById('ni-personas').value;
            
            if (!nombre || !docu || !out || !precio) {
                Swal.showValidationMessage('Completa los campos obligatorios');
                return false;
            }
            return {
                huesped: nombre,
                doc: docu,
                telefono: document.getElementById('ni-tel').value,
                personas: personas,
                checkOut: out,
                total: parseFloat(precio),
                notas: document.getElementById('ni-notas').value
            };
        }
    });

    if (formValues) {
        // 1. Guardar Reserva como checkin
        await addDoc(collection(db, "reservas"), {
            ...formValues,
            habitacion: hab.numero.toString(),
            checkIn: hoy,
            estado: "checkin",
            fechaRegistro: new Date().toISOString(),
            tipoVenta: "Directa"
        });

        // 2. Historial de Huéspedes
        await addDoc(collection(db, "huespedes"), {
            nombre: formValues.huesped,
            documento: formValues.doc,
            telefono: formValues.telefono,
            ultimaVisita: hoy
        });

        // 3. Ocupar Habitación
        await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
        
        Swal.fire({
            title: '¡Ingreso Exitoso!',
            icon: 'success',
            confirmButtonColor: 'var(--vino-tinto)',
            html: `
                <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <p style="margin: 5px 0;"><b>Huésped:</b> ${formValues.huesped}</p>
                    <p style="margin: 5px 0;"><b>Habitación:</b> <span style="color: var(--vino-tinto); font-weight: bold;">${hab.numero}</span></p>
                    <p style="margin: 5px 0;"><b>Personas:</b> ${formValues.personas}</p>
                    <p style="margin: 5px 0;"><b>Salida:</b> ${formValues.checkOut}</p>
                    <hr style="margin: 10px 0; border: 0; border-top: 1px dashed #cbd5e1;">
                    <p style="margin: 5px 0; text-align: right; font-weight: bold;">Total: S/ ${formValues.total.toFixed(2)}</p>
                </div>
            `
        });
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

    // ... dentro de abrirModalGestionOcupada ...
    snapCons.forEach(c => {
        const item = c.data();
        totalCons += parseFloat(item.precio);

        // FORMATEAR FECHA: Para que se vea "18 Mar, 10:41"
        const f = item.fechaConsumo ? new Date(item.fechaConsumo) : new Date();
        const fechaAmigable = f.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) + 
                             `, ${f.getHours()}:${f.getMinutes().toString().padStart(2, '0')}`;

        // DISEÑO DE FILA: Ahora incluye cantidad y fecha
        tablaCons += `
            <div class="consumo-row" style="align-items: center; padding: 8px 0;">
                <div style="display: flex; flex-direction: column; text-align: left;">
                    <span style="font-weight: bold; color: var(--marron-zocalo);">
                        ${item.cantidad || 1}x ${item.descripcion}
                    </span>
                    <small style="font-size: 10px; color: #888;">${fechaAmigable}</small>
                </div>
                <b style="color: #2e7d32;">S/ ${parseFloat(item.precio).toFixed(2)}</b>
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

async function agregarConsumo(resId, hab) {
    const ahora = new Date();
    // Ajuste de zona horaria para que el input datetime-local muestre la hora actual de Perú
    const offset = ahora.getTimezoneOffset() * 60000;
    const fechaLocal = new Date(ahora - offset).toISOString().slice(0, 16);

    const { value: formValues } = await Swal.fire({
        title: `<span style="font-family: var(--font-titles); color: var(--marron-zocalo); font-size: 18px;">Nuevo Cargo</span>`,
        html: `
            <div style="text-align: left; font-family: var(--font-main); padding: 5px;">
                <label style="font-size: 12px; color: var(--gris-antracita); font-weight: bold;">DESCRIPCIÓN</label>
                <input id="swal-input1" class="swal2-input" style="margin-top:5px; font-size:15px;" placeholder="Ej. Agua San Mateo">
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
                    <div>
                        <label style="font-size: 12px; color: var(--gris-antracita); font-weight: bold;">CANTIDAD</label>
                        <input id="swal-input2" type="number" class="swal2-input" value="1" min="1" style="font-size:15px;">
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--gris-antracita); font-weight: bold;">PRECIO UNIT. (S/)</label>
                        <input id="swal-input3" type="number" step="0.10" class="swal2-input" placeholder="0.00" style="font-size:15px;">
                    </div>
                </div>

                <div style="margin-top: 15px;">
                    <label style="font-size: 12px; color: var(--gris-antracita); font-weight: bold;">FECHA Y HORA</label>
                    <input id="swal-input4" type="datetime-local" class="swal2-input" value="${fechaLocal}" style="font-size:14px;">
                </div>
            </div>`,
        focusConfirm: false,
        confirmButtonText: 'REGISTRAR',
        confirmButtonColor: 'var(--vino-tinto)',
        showCancelButton: true,
        preConfirm: () => {
            const desc = document.getElementById('swal-input1').value;
            const cant = document.getElementById('swal-input2').value;
            const precio = document.getElementById('swal-input3').value;
            const fecha = document.getElementById('swal-input4').value;

            if (!desc || !cant || !precio || !fecha) {
                Swal.showValidationMessage('Todos los campos son obligatorios');
                return false;
            }
            return { desc, cant: parseInt(cant), precio: parseFloat(precio), fecha };
        }
    });

    if (formValues) {
        const totalItem = formValues.cant * formValues.precio;
        await addDoc(collection(db, "consumos"), {
            idReserva: resId,
            descripcion: formValues.desc,
            cantidad: formValues.cant,
            precioUnitario: formValues.precio,
            precio: totalItem, // Total para facilitar la suma del gran total
            fechaConsumo: formValues.fecha
        });
        
        abrirModalGestionOcupada(hab); // Recargamos para ver el cambio
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
    
    // Generar filas de consumos con cantidad
    let filasConsumos = consumos.map(c => `
        <tr>
            <td style="padding: 5px 0;">${c.cantidad || 1}x ${c.descripcion}</td>
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
