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

// --- 1. CARGAR TABLERO (CORREGIDO) ---
function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"));
    const hoy = getHoyISO();

    onSnapshot(qHabs, async (snapshot) => {
        habGrid.innerHTML = '';
        
        // 1. Reiniciamos el contador en cada actualización
        let s = { l: 0, o: 0 };

        const qRes = query(collection(db, "reservas"), 
                     where("checkIn", "==", hoy), 
                     where("estado", "==", "reservada"));
        const snapRes = await getDocs(qRes);
        const listaReservasHoy = snapRes.docs.map(d => d.data().habitacion);

        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        docs.forEach(hab => {
            const est = hab.estado || "Libre";
            
            // 2. INCREMENTAR CONTADORES SEGÚN EL ESTADO
            if (est === "Libre" || est === "Disponible") {
                s.l++; // Sumar a Libres
            } else if (est === "Ocupada") {
                s.o++; // Sumar a Ocupadas
            }

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

        // 3. ACTUALIZAR EL HTML (Asegúrate de que los IDs coincidan con tu HTML)
        const elLibres = document.getElementById('stat-libres');
        const elOcupadas = document.getElementById('stat-ocupadas');

        if (elLibres) elLibres.innerText = s.l;
        if (elOcupadas) elOcupadas.innerText = s.o;
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

// --- 3. MODAL PARA INGRESO DIRECTO (CON AUTOCOMPLETADO Y CÁLCULOS) ---
async function modalCheckInDirecto(hab) {
    const hoy = getHoyISO();
    
    const { value: formValues } = await Swal.fire({
        title: `<span style="font-family: 'Playfair Display'; color: #800020;">Nueva Reserva Directa - Hab. ${hab.numero}</span>`,
        width: '950px',
        showConfirmButton: false, 
        html: `
            <div class="modal-reserva-content" style="width: 100%; border:none; box-shadow:none;">
                <form id="formCheckInDirecto">
                    <div class="form-grid-res" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; padding: 20px; text-align: left;">
                        
                        <div class="form-group">
                            <label>DNI / PASSPORT (Buscar)</label>
                            <input type="text" id="resDoc" class="swal2-input" style="width:100%; margin:0; border: 2px solid var(--vino-tinto);" required placeholder="Escriba y presione Tab">
                        </div>
                        <div class="form-group" style="grid-column: span 2;">
                            <label>Nombres y Apellidos</label>
                            <input type="text" id="resHuesped" class="swal2-input" style="width:100%; margin:0;" required>
                        </div>

                        <div class="form-group"><label>Fecha de Nacimiento</label><input type="date" id="resNacimiento" class="swal2-input" style="width:100%; margin:0;"></div>
                        <div class="form-group"><label>Nacionalidad</label><input type="text" id="resNacionalidad" class="swal2-input" style="width:100%; margin:0;"></div>
                        <div class="form-group"><label>Teléfono</label><input type="tel" id="resTelefono" class="swal2-input" style="width:100%; margin:0;" required></div>

                        <div class="form-group"><label>Correo</label><input type="email" id="resCorreo" class="swal2-input" style="width:100%; margin:0;"></div>
                        <div class="form-group">
                            <label>Habitación</label>
                            <input type="text" id="resHabitacion" class="swal2-input" style="width:100%; margin:0; background:#f1f5f9;" value="${hab.numero}" readonly>
                        </div>
                        <div class="form-group">
                            <label>Medio de Reserva</label>
                            <select id="resMedio" class="swal2-select" style="width:100%; margin:0;">
                                <option value="directas" selected>Directas</option>
                                <option value="whatsapp">Whatsapp</option>
                            </select>
                        </div>

                        <div class="form-group"><label>Check In</label><input type="date" id="resCheckIn" class="swal2-input" style="width:100%; margin:0;" value="${hoy}" readonly></div>
                        <div class="form-group"><label>Check Out</label><input type="date" id="resCheckOut" class="swal2-input" style="width:100%; margin:0;" value="${hoy}"></div>
                        <div class="form-group"><label>N° Personas</label><input type="number" id="resPersonas" class="swal2-input" style="width:100%; margin:0;" min="1" value="1"></div>

                        <div class="form-group"><label>Tarifa Diaria</label><input type="number" id="resTarifa" class="swal2-input" style="width:100%; margin:0;" value="${hab.precio || 0}" step="0.01"></div>
                        <div class="form-group"><label>Total Alojamiento</label><input type="number" id="resTotal" class="swal2-input" style="width:100%; margin:0;" value="${hab.precio || 0}" step="0.01"></div>
                        <div class="form-group"><label>Diferencia Pendiente</label><input type="number" id="resDiferencia" class="swal2-input" style="width:100%; margin:0; background: #f1f5f9; font-weight: bold; color: #800020;" readonly value="0.00"></div>

                        <div class="form-group" style="grid-column: span 2;"><label>Pagos Adelantados (Monto/Fecha/Medio)</label><input type="text" id="resAdelanto" class="swal2-input" style="width:100%; margin:0;" placeholder="Ej: 50.00 Efectivo"></div>
                        <div class="form-group"><label>Cochera</label><input type="text" id="resCochera" class="swal2-input" style="width:100%; margin:0;" placeholder="SI/NO"></div>

                        <div class="form-group"><label>Recepcionado por:</label><input type="text" id="resRecepcion" class="swal2-input" style="width:100%; margin:0;" required></div>
                        <div class="form-group" style="grid-column: span 2;"><label>Confirmada por:</label><input type="text" id="resRecepcionconfi" class="swal2-input" style="width:100%; margin:0;" required></div>
                    </div>

                    <div style="padding: 20px; background: #f8fafc; display: flex; justify-content: flex-end; gap: 10px; border-radius: 0 0 15px 15px;">
                        <button type="button" id="btnCancelarCheckIn" class="swal2-cancel swal2-styled">Cancelar</button>
                        <button type="submit" class="swal2-confirm swal2-styled" style="background-color: #800020; padding: 12px 40px;">CONFIRMAR INGRESO</button>
                    </div>
                </form>
            </div>
        `,
        didOpen: () => {
            const form = document.getElementById('formCheckInDirecto');
            const docInput = document.getElementById('resDoc');
            const inInput = document.getElementById('resCheckIn');
            const outInput = document.getElementById('resCheckOut');
            const tarifaInput = document.getElementById('resTarifa');
            const totalInput = document.getElementById('resTotal');
            const adelantoInput = document.getElementById('resAdelanto');
            const difInput = document.getElementById('resDiferencia');

            // --- 1. LÓGICA DE AUTOCOMPLETADO ---
            docInput.addEventListener('blur', async () => {
                const dni = docInput.value.trim();
                if (dni.length < 3) return; // No buscar si es muy corto

                try {
                    // Buscamos en la colección de huéspedes por el ID del documento
                    const docSnap = await getDoc(doc(db, "huespedes", dni));
                    
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        document.getElementById('resHuesped').value = data.nombre || '';
                        document.getElementById('resTelefono').value = data.telefono || '';
                        document.getElementById('resCorreo').value = data.correo || '';
                        document.getElementById('resNacionalidad').value = data.nacionalidad || '';
                        document.getElementById('resNacimiento').value = data.nacimiento || '';
                        
                        // Pequeño aviso visual
                        Swal.showValidationMessage('Huésped antiguo encontrado. Datos cargados.');
                        setTimeout(() => Swal.resetValidationMessage(), 2000);
                    }
                } catch (error) {
                    console.error("Error buscando huésped:", error);
                }
            });

            // --- 2. LÓGICA DE CÁLCULOS ---
            const realizarCalculos = () => {
                const f1 = new Date(inInput.value);
                const f2 = new Date(outInput.value);
                const tarifa = parseFloat(tarifaInput.value) || 0;
                
                const diff = f2 - f1;
                let dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
                if (dias <= 0) dias = 1;
                
                const nuevoTotal = (dias * tarifa);
                totalInput.value = nuevoTotal.toFixed(2);

                const montoMatch = adelantoInput.value.match(/(\d+(\.\d+)?)/);
                const montoAdelanto = montoMatch ? parseFloat(montoMatch[0]) : 0;
                difInput.value = (nuevoTotal - montoAdelanto).toFixed(2);
            };

            [outInput, tarifaInput, adelantoInput].forEach(el => el.addEventListener('input', realizarCalculos));

            form.onsubmit = (e) => {
                e.preventDefault();
                if (!form.checkValidity()) return;
                
                form.tempValues = {
                    huesped: document.getElementById('resHuesped').value,
                    doc: docInput.value,
                    nacimiento: document.getElementById('resNacimiento').value,
                    nacionalidad: document.getElementById('resNacionalidad').value,
                    telefono: document.getElementById('resTelefono').value,
                    correo: document.getElementById('resCorreo').value,
                    habitacion: hab.numero.toString(),
                    medio: document.getElementById('resMedio').value,
                    checkIn: inInput.value,
                    checkOut: outInput.value,
                    personas: document.getElementById('resPersonas').value,
                    tarifa: parseFloat(tarifaInput.value),
                    total: parseFloat(totalInput.value),
                    diferencia: parseFloat(difInput.value),
                    adelanto: adelantoInput.value,
                    recepcion: document.getElementById('resRecepcion').value,
                    recepcionconfi: document.getElementById('resRecepcionconfi').value,
                    estado: "checkin",
                    tipoVenta: "Directa",
                    fechaRegistro: new Date().toISOString()
                };
                Swal.clickConfirm();
            };

            document.getElementById('btnCancelarCheckIn').onclick = () => Swal.close();
        },
        preConfirm: () => document.getElementById('formCheckInDirecto').tempValues || false
    });

    if (formValues) {
        try {
            await addDoc(collection(db, "reservas"), formValues);
            await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
            
            // Guardar o actualizar datos del huésped para la próxima vez
            await setDoc(doc(db, "huespedes", formValues.doc), {
                nombre: formValues.huesped,
                documento: formValues.doc,
                telefono: formValues.telefono,
                correo: formValues.correo,
                nacionalidad: formValues.nacionalidad,
                nacimiento: formValues.nacimiento,
                ultimaVisita: hoy
            }, { merge: true });

            Swal.fire('¡Éxito!', 'Ingreso y registro de huésped completado.', 'success');
        } catch (e) {
            Swal.fire('Error', 'No se pudo guardar la información.', 'error');
        }
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
                <p style="font-size:10px;">RUC: 20601852153<br>Jr. Simon Bolivar 355 - Trujillo</p>
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
