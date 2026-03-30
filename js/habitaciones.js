import { auth, db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, 
    where, addDoc, deleteDoc, getDoc, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM ---
const habGrid = document.getElementById('habGrid');
const elLibres = document.getElementById('stat-libres');
const elOcupadas = document.getElementById('stat-ocupadas');

// --- 1. INICIALIZACIÓN (Llamada por auth-check.js) ---
window.inicializarPagina = () => {
    console.log("Rack de Habitaciones Conectado");
    cargarHabitaciones();
};

// Función auxiliar para fechas (Trujillo, Perú)
function getHoyISO() {
    const fecha = new Date();
    return fecha.toISOString().split('T')[0];
}

// --- 2. CARGAR TABLERO EN TIEMPO REAL ---
function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"), orderBy("numero", "asc"));
    const hoy = getHoyISO();

    // Listener en tiempo real para habitaciones
    onSnapshot(qHabs, async (snapshot) => {
        habGrid.innerHTML = '';
        let stats = { libres: 0, ocupadas: 0 };

        // Buscamos reservas para hoy de forma eficiente
        const qRes = query(collection(db, "reservas"), 
                     where("checkIn", "==", hoy), 
                     where("estado", "==", "reservada"));
        
        const snapRes = await getDocs(qRes);
        const listaReservasHoy = snapRes.docs.map(d => String(d.data().habitacion));

        snapshot.docs.forEach(docSnap => {
            const hab = { id: docSnap.id, ...docSnap.data() };
            const est = hab.estado || "Libre";
            const nPers = parseInt(hab.personasActuales) || 0;

            // Actualizar contadores
            if (est === "Libre" || est === "Disponible") stats.libres++;
            else if (est === "Ocupada") stats.ocupadas++;

            const tieneReservaHoy = listaReservasHoy.includes(String(hab.numero));
            const iconoDinamico = obtenerIconoSegunOcupacion(est, nPers);

            const card = document.createElement('div');
            card.className = `hab-card ${est.toLowerCase()}`;
            
            card.innerHTML = `
                <div class="hab-header">
                    <div class="hab-number">${hab.numero}</div>
                    <div class="hab-type">${hab.tipo}</div>
                </div>
                <div class="hab-body">
                    <div class="hab-icon">
                        <i class="fa-solid ${iconoDinamico}"></i> 
                    </div>
                    <div class="hab-footer-info">
                        <span class="hab-badge">${est.toUpperCase()}</span>
                        ${tieneReservaHoy && (est === "Libre" || est === "Disponible") 
                            ? '<div class="reserva-hoy-tag">⚠️ RESERVA PARA HOY</div>' 
                            : ''}
                    </div>
                </div>`;

            card.onclick = () => {
                if (est === "Ocupada") abrirModalGestionOcupada(hab);
                else abrirModalCheckIn(hab);
            };
            
            habGrid.appendChild(card);
        });

        if (elLibres) elLibres.innerText = stats.libres;
        if (elOcupadas) elOcupadas.innerText = stats.ocupadas;
    });
}

// Iconos según ocupación (UX Mejorada)
function obtenerIconoSegunOcupacion(estado, p) {
    if (estado !== "Ocupada") return 'fa-hotel'; 
    if (p === 1) return 'fa-user';
    if (p === 2) return 'fa-user-group';
    if (p >= 3 && p <= 4) return 'fa-users';
    return 'fa-people-group'; 
}

/* ==========================================================================
   3. MODAL CHECK-IN (ELECCIÓN DE ORIGEN)
   ========================================================================== */
async function abrirModalCheckIn(hab) {
    const hoy = getHoyISO();

    // Buscamos reservas programadas para hoy en esta habitación
    const q = query(collection(db, "reservas"), 
              where("habitacion", "==", hab.numero.toString()), 
              where("checkIn", "==", hoy),
              where("estado", "==", "reservada"));
    
    const snap = await getDocs(q);
    let opciones = {};
    let datosReservas = {};

    snap.forEach(d => { 
        const data = d.data();
        opciones[d.id] = `🏨 Reserva: ${data.huesped}`; 
        datosReservas[d.id] = data; 
    });
    
    opciones["directo"] = "➕ Venta Directa (Cliente nuevo)";

    const { value: choice } = await Swal.fire({
        title: `Ingreso - Hab. ${hab.numero}`,
        input: 'select',
        inputOptions: opciones,
        confirmButtonColor: '#800020',
        showCancelButton: true,
        cancelButtonText: 'Cancelar'
    });

    if (choice) {
        if (choice === "directo") {
            abrirModalNuevaReservaDirecta(hab); // Función que me pasarás luego
        } else {
            ejecutarCheckInReservaExistente(choice, hab, datosReservas[choice]);
        }
    }
}

async function ejecutarCheckInReservaExistente(resId, hab, dataReserva) {
    try {
        // 1. Cambiamos estado de la reserva y aseguramos estructura de pagos/consumos
        await updateDoc(doc(db, "reservas", resId), { 
            estado: "checkin",
            fechaCheckInReal: new Date().toISOString(),
            pagos: dataReserva.pagos || [], // Aseguramos que existan los arrays
            consumos: dataReserva.consumos || []
        });

        // 2. Ocupamos la habitación
        await updateDoc(doc(db, "habitaciones", hab.id), { 
            estado: "Ocupada",
            personasActuales: parseInt(dataReserva.personas) || 1,
            reservaActualId: resId // Guardamos el ID para acceder rápido a consumos
        });

        Swal.fire({ icon: 'success', title: 'Huésped en Habitación', showConfirmButton: false, timer: 1500 });
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo procesar el ingreso', 'error');
    }
}


/* ==========================================================================
   4. MODAL PARA INGRESO DIRECTO (VERSIÓN FINAL OMNI-COMPLETA)
   ========================================================================== */
   async function modalCheckInDirecto(hab) {
    const modal = document.getElementById('modalReserva');
    const form = document.getElementById('formNuevaReserva');
    const statusDiv = document.getElementById('statusDisponibilidad');
    const hoy = getHoyISO();

    // --- A. INICIALIZACIÓN ---
    modal.style.display = 'flex';
    document.getElementById('modalTitle').innerText = `Ingreso Directo - Hab. ${hab.numero}`;
    form.reset();
    if(statusDiv) statusDiv.innerHTML = "";
    
    // Configurar fechas mínimas (No permitir pasado)
    ['resCheckIn', 'resCheckOut'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.setAttribute('min', hoy);
            el.value = hoy;
        }
    });

    document.getElementById('resTarifa').value = hab.precio || 0;
    document.getElementById('resMedio').value = "personal";

    const selectHab = document.getElementById('resHabitacion');
    if(selectHab) selectHab.innerHTML = `<option value="${hab.numero}" selected>${hab.numero} - ${hab.tipo}</option>`;

    // --- B. CRM: AUTOCOMPLETADO POR DNI / RUC ---
    const docInput = document.getElementById('resDoc');
    docInput.onblur = async () => {
        const dni = docInput.value.trim();
        if (dni.length < 3) return;
        try {
            const docSnap = await getDoc(doc(db, "huespedes", dni));
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('resHuesped').value = (data.nombre || '').toUpperCase();
                document.getElementById('resTelefono').value = data.telefono || '';
                document.getElementById('resCorreo').value = data.correo || '';
                document.getElementById('resNacionalidad').value = data.nacionalidad || '';
                document.getElementById('resNacimiento').value = data.nacimiento || '';
                docInput.style.borderColor = '#d4af37'; // Ocre Trujillo
                Toast.fire({ icon: 'info', title: 'Huésped frecuente cargado' });
            }
        } catch (e) { console.error("Error CRM:", e); }
    };

    // --- C. MOTOR DE CÁLCULOS (MONEDA, TC Y NOCHES) ---
    const calcularTodo = () => {
        const fIn = document.getElementById('resCheckIn').value;
        const fOut = document.getElementById('resCheckOut').value;
        if (fOut < fIn) document.getElementById('resCheckOut').value = fIn;

        const f1 = new Date(document.getElementById('resCheckIn').value + 'T12:00:00');
        const f2 = new Date(document.getElementById('resCheckOut').value + 'T12:00:00');
        const tarifa = parseFloat(document.getElementById('resTarifa').value) || 0;
        const adelanto = parseFloat(document.getElementById('resAdelantoMonto').value) || 0;
        const moneda = document.getElementById('resMoneda')?.value || 'PEN';
        const tc = parseFloat(document.getElementById('resTipoCambio')?.value) || 1;
        
        let noches = Math.ceil((f2 - f1) / (1000 * 60 * 60 * 24)) || 1;
        let subtotal = noches * tarifa;
        let totalFinal = (moneda === "USD") ? (subtotal * tc) : subtotal;

        document.getElementById('resTotal').value = totalFinal.toFixed(2);
        document.getElementById('resDiferencia').value = (totalFinal - adelanto).toFixed(2);
        
        if(statusDiv) statusDiv.innerHTML = `<b style="color:#800020">Estadía: ${noches} día(s)</b>`;
    };

    ['resCheckIn', 'resCheckOut', 'resTarifa', 'resAdelantoMonto', 'resMoneda', 'resTipoCambio'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', calcularTodo);
    });
    calcularTodo();

    // --- D. GUARDADO ATÓMICO (RESERVA + HABITACIÓN + CRM) ---
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const fIn = document.getElementById('resCheckIn').value;
        const nPers = parseInt(document.getElementById('resPersonas').value) || 1;
        const adelantoMonto = parseFloat(document.getElementById('resAdelantoMonto').value) || 0;
        const metodoPago = document.getElementById('resAdelantoDetalle').value || "Efectivo";

        try {
            // 1. ESCUDO ANTI-OVERBOOKING
            const qOver = query(collection(db, "reservas"), 
                          where("habitacion", "==", hab.numero.toString()),
                          where("checkIn", "==", fIn),
                          where("estado", "==", "reservada"));
            const snapOver = await getDocs(qOver);

            if (!snapOver.empty) {
                const { isConfirmed } = await Swal.fire({
                    title: '¡Habitación Ocupada/Reservada!',
                    text: 'Existe una reserva programada para hoy. ¿Deseas ignorarla y vender directo?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, vender',
                    confirmButtonColor: '#800020'
                });
                if (!isConfirmed) return;
            }

            // 2. CONSTRUCCIÓN DE DATA (MAPEADO TOTAL)
            const reservaData = {
                huesped: document.getElementById('resHuesped').value.toUpperCase(),
                doc: document.getElementById('resDoc').value.trim(),
                telefono: document.getElementById('resTelefono').value,
                nacionalidad: document.getElementById('resNacionalidad').value,
                nacimiento: document.getElementById('resNacimiento').value,
                correo: document.getElementById('resCorreo').value,
                habitacion: hab.numero.toString(),
                checkIn: fIn,
                checkOut: document.getElementById('resCheckOut').value,
                medio: document.getElementById('resMedio').value,
                personas: nPers,
                desayuno: document.getElementById('resInfo').value,
                earlyCheckIn: document.getElementById('resEarly').value,
                lateCheckOut: document.getElementById('resLate').value,
                cochera: document.getElementById('resCochera').value,
                traslado: document.getElementById('resTraslado').value,
                tarifa: parseFloat(document.getElementById('resTarifa').value),
                moneda: document.getElementById('resMoneda')?.value || 'PEN',
                tipoCambio: parseFloat(document.getElementById('resTipoCambio')?.value) || 0,
                total: parseFloat(document.getElementById('resTotal').value),
                adelantoMonto: adelantoMonto,
                adelantoDetalle: metodoPago,
                diferencia: parseFloat(document.getElementById('resDiferencia').value),
                observaciones: document.getElementById('resObservaciones').value,
                recibidoPor: document.getElementById('resRecepcion').value,
                confirmadoPor: document.getElementById('resRecepcionconfi').value,
                estado: "checkin",
                tipoVenta: "Directa",
                fechaRegistro: new Date().toISOString(),
                // Estructura para Auditoría de Caja y Frigobar
                pagos: adelantoMonto > 0 ? [{
                    fecha: new Date().toISOString(),
                    monto: adelantoMonto,
                    concepto: "Adelanto Check-in",
                    metodo: metodoPago
                }] : [],
                consumos: []
            };

            // 3. EJECUCIÓN EN FIREBASE
            const docRef = await addDoc(collection(db, "reservas"), reservaData);
            
            await updateDoc(doc(db, "habitaciones", hab.id), { 
                estado: "Ocupada",
                personasActuales: nPers,
                reservaActualId: docRef.id // Vínculo maestro
            });

            await setDoc(doc(db, "huespedes", reservaData.doc), {
                nombre: reservaData.huesped,
                documento: reservaData.doc,
                telefono: reservaData.telefono,
                correo: reservaData.correo,
                nacionalidad: reservaData.nacionalidad,
                ultimaVisita: hoy
            }, { merge: true });

            Swal.fire({ icon: 'success', title: '¡Ingreso Exitoso!', showConfirmButton: false, timer: 2000 });
            cerrarModal();
            if (typeof cargarHabitaciones === 'function') cargarHabitaciones();
            
        } catch (error) {
            console.error("Error crítico:", error);
            Swal.fire('Error', 'No se pudo completar el registro.', 'error');
        }
    };
}

/* --- UTILITARIOS --- */
function cerrarModal() {
    const m = document.getElementById('modalReserva');
    if(m) m.style.display = 'none';
}

window.addEventListener('click', (e) => {
    if (e.target.id === 'modalReserva') cerrarModal();
});


/* ==========================================================================
   5. MODAL GESTIÓN HABITACIÓN OCUPADA (VISTA 360° DETALLADA)
   ========================================================================== */
   async function abrirModalGestionOcupada(hab) {
    const qRes = query(collection(db, "reservas"), 
                 where("habitacion", "==", hab.numero.toString()), 
                 where("estado", "==", "checkin"),
                 limit(1));
    
    const snapRes = await getDocs(qRes);
    if (snapRes.empty) return;

    const resDoc = snapRes.docs[0];
    const r = resDoc.data(); 

    // --- Lógica de Consumos ---
    const qCons = query(collection(db, "consumos"), where("idReserva", "==", resDoc.id));
    const snapCons = await getDocs(qCons);
    let totalCons = 0;
    let tablaCons = '';

    snapCons.forEach(c => {
        const item = c.data();
        const montoFila = parseFloat(item.precioTotal) || 0;
        totalCons += montoFila;
        const f = item.fechaConsumo?.toDate ? item.fechaConsumo.toDate() : new Date(item.fechaConsumo);
        const fechaAmigable = f.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + 
                             ` ${f.getHours()}:${f.getMinutes().toString().padStart(2, '0')}`;

        tablaCons += `
            <div class="consumo-item-lista">
                <div class="c-info">
                    <span class="c-qty">${item.cantidad || 1}x</span>
                    <span class="c-name">${item.descripcion}</span>
                    <span class="c-date">${fechaAmigable}</span>
                </div>
                <div class="c-price">S/ ${montoFila.toFixed(2)}</div>
            </div>`;
    });

    Swal.fire({
        title: `<div class="modal-header-gestion">
                    <div class="header-left">
                        <span class="room-tag">HABITACIÓN ${hab.numero}</span>
                        <small>${hab.tipo || 'Boutique'}</small>
                    </div>
                    <div class="badge-status-room">OCUPADA</div>
                </div>`,
        width: '1000px',
        customClass: { popup: 'hotel-modal-custom' },
        html: `
            <div class="gestion-container">
                <div class="ficha-huesped">
                    
                    <div class="ficha-row">
                        <div class="ficha-col span-2">
                            <label><i class="fas fa-user-circle"></i> Huésped Titular</label>
                            <p class="val-main">${r.huesped}</p>
                            <p class="val-sub">${r.doc} • ${r.nacionalidad || 'Peruana'}</p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-id-card"></i> Contacto</label>
                            <p>${r.telefono || 'No registrado'}</p>
                            <p class="val-sub">${r.correo || 'Sin correo'}</p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-concierge-bell"></i> Canal de Venta</label>
                            <p><span class="badge-medio">${(r.medio || 'Personal').toUpperCase()}</span></p>
                            <p class="val-sub">Ref: ${r.tipoVenta || 'Directa'}</p>
                        </div>
                    </div>

                    <div class="ficha-row separator">
                        <div class="ficha-col">
                            <label><i class="fas fa-sign-in-alt"></i> Fecha Ingreso</label>
                            <p><b>${r.checkIn}</b></p>
                            <p class="val-sub">${r.earlyCheckIn || 'Check-in estándar'}</p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-sign-out-alt"></i> Fecha Salida</label>
                            <p><b style="color: #800020;">${r.checkOut}</b></p>
                            <p class="val-sub">${r.lateCheckOut || 'Check-out estándar'}</p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-users"></i> Pax & Servicios</label>
                            <p>${r.personas} Adultos</p>
                            <p class="val-sub">Cochera: <b>${r.cochera || 'No'}</b></p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-coffee"></i> Alimentación</label>
                            <p>${r.desayuno || 'Solo Habitación'}</p>
                            <p class="val-sub">Traslado: ${r.traslado || 'No'}</p>
                        </div>
                    </div>

                    <div class="ficha-row highlight-pago">
                        <div class="ficha-col">
                            <label>Tarifa Aplicada</label>
                            <p>${r.moneda || 'PEN'} ${parseFloat(r.tarifa).toFixed(2)}</p>
                        </div>
                        <div class="ficha-col">
                            <label>Total Alojamiento</label>
                            <p><b>S/ ${parseFloat(r.total).toFixed(2)}</b></p>
                        </div>
                        <div class="ficha-col">
                            <label>Adelantos / Garantía</label>
                            <p style="color: #27ae60;">- S/ ${parseFloat(r.adelantoMonto || 0).toFixed(2)}</p>
                            <small>${r.adelantoDetalle || ''}</small>
                        </div>
                        <div class="ficha-col">
                            <label>Saldo Pendiente Hab.</label>
                            <p><b style="color: #800020; font-size: 1.2rem;">S/ ${parseFloat(r.diferencia || 0).toFixed(2)}</b></p>
                        </div>
                    </div>

                    <div class="ficha-row audit-row">
                        <div class="ficha-col span-2">
                            <label><i class="fas fa-comment-dots"></i> Observaciones del Recepcionista:</label>
                            <p class="text-obs">${r.observaciones ? `"${r.observaciones}"` : 'Sin notas adicionales.'}</p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-user-edit"></i> Registrado por:</label>
                            <p class="val-audit">${r.recibidoPor || 'Sistema'}</p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-check-double"></i> Confirmado por:</label>
                            <p class="val-audit">${r.confirmadoPor || '-'}</p>
                        </div>
                    </div>
                </div>

                <div class="consumos-section">
                    <div class="section-title">
                        <span><i class="fas fa-utensils"></i> CONSUMOS ADICIONALES (FRIGOBAR / CAFETERÍA)</span>
                        <button id="btnAddConsumo" class="btn-agregar-sm">+ CARGAR ITEM</button>
                    </div>
                    
                    <div class="lista-consumos">
                        ${tablaCons || '<div class="no-data">No se han registrado consumos en esta habitación.</div>'}
                    </div>

                    <div class="total-bar">
                        <div class="total-label">
                            <small>TOTAL CONSUMOS</small>
                            <span>Subtotal Adicional</span>
                        </div>
                        <div class="total-monto">S/ ${totalCons.toFixed(2)}</div>
                    </div>
                </div>

                <div class="gestion-footer">
                    <button id="btnCerrarModal" class="btn-secundario">CERRAR PANEL</button>
                    <button id="btnFinalizarOut" class="btn-checkout-final">🏁 PROCESAR CHECK-OUT</button>
                </div>
            </div>
        `,
        showConfirmButton: false,
        didOpen: () => {
            document.getElementById('btnAddConsumo').onclick = () => agregarConsumo(resDoc.id, hab);
            document.getElementById('btnCerrarModal').onclick = () => Swal.close();
            document.getElementById('btnFinalizarOut').onclick = () => realizarCheckOut(resDoc.id, hab, r, totalCons);
        }
    });
}

/* ==========================================================================
   6. AGREGAR CONSUMO (ESTILO INTEGRADO Y CARGA DINÁMICA)
   ========================================================================== */
   async function agregarConsumo(resId, hab) {
    const ahora = new Date();
    // Ajuste de zona horaria Perú para el input datetime-local
    const offset = ahora.getTimezoneOffset() * 60000;
    const fechaLocal = new Date(ahora - offset).toISOString().slice(0, 16);

    const { value: formValues } = await Swal.fire({
        title: `<span style="font-family: 'Playfair Display', serif; color: #800020; font-size: 22px;">Nuevo Cargo / Consumo</span>`,
        width: '450px',
        customClass: {
            popup: 'hotel-modal-custom',
            confirmButton: 'btn-dorado-full', 
            cancelButton: 'btn-cancelar-soft'
        },
        html: `
            <div style="text-align: left; font-family: 'Lato', sans-serif; padding: 10px;">
                <label style="font-size: 11px; color: #5d4037; font-weight: bold; text-transform: uppercase;">Descripción del Producto/Servicio</label>
                <input id="sw-desc" class="swal2-input" style="margin: 5px 0 15px 0; width: 100%; border-radius: 5px;" placeholder="Ej. Agua San Mateo 600ml">
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <label style="font-size: 11px; color: #5d4037; font-weight: bold; text-transform: uppercase;">Cantidad</label>
                        <input id="sw-cant" type="number" class="swal2-input" value="1" min="1" style="margin: 5px 0; width: 100%; border-radius: 5px;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #5d4037; font-weight: bold; text-transform: uppercase;">Precio Unit. (S/)</label>
                        <input id="sw-pre" type="number" step="0.10" class="swal2-input" placeholder="0.00" style="margin: 5px 0; width: 100%; border-radius: 5px;">
                    </div>
                </div>

                <div style="margin-top: 15px;">
                    <label style="font-size: 11px; color: #5d4037; font-weight: bold; text-transform: uppercase;">Fecha y Hora de Consumo</label>
                    <input id="sw-fecha" type="datetime-local" class="swal2-input" value="${fechaLocal}" style="margin: 5px 0; width: 100%; font-size: 14px; border-radius: 5px;">
                </div>

                <div id="subtotal-preview" style="margin-top: 20px; padding: 15px; background: #fdfaf5; border-radius: 8px; text-align: center; border: 1px dashed #d4af37;">
                    <span style="font-size: 12px; color: #5d4037; letter-spacing: 1px;">SUBTOTAL A CARGAR EN CUENTA:</span>
                    <strong id="preview-monto" style="display: block; font-size: 24px; color: #800020; margin-top: 5px;">S/ 0.00</strong>
                </div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: '✅ REGISTRAR CARGO',
        cancelButtonText: 'CANCELAR',
        focusConfirm: false,
        didOpen: () => {
            const inputCant = document.getElementById('sw-cant');
            const inputPre = document.getElementById('sw-pre');
            const displaySubtotal = document.getElementById('preview-monto');
            
            const actualizarSubtotal = () => {
                const c = parseFloat(inputCant.value) || 0;
                const p = parseFloat(inputPre.value) || 0;
                const total = c * p;
                displaySubtotal.innerText = `S/ ${total.toFixed(2)}`;
            };
            
            inputCant.addEventListener('input', actualizarSubtotal);
            inputPre.addEventListener('input', actualizarSubtotal);
        },
        preConfirm: () => {
            const desc = document.getElementById('sw-desc').value.trim();
            const cant = parseInt(document.getElementById('sw-cant').value);
            const pre = parseFloat(document.getElementById('sw-pre').value);
            const fecha = document.getElementById('sw-fecha').value;

            if (!desc || isNaN(cant) || cant <= 0 || isNaN(pre) || pre < 0 || !fecha) {
                Swal.showValidationMessage('Complete todos los campos con valores válidos');
                return false;
            }
            return { desc, cant, pre, fecha };
        }
    });

    if (formValues) {
        try {
            const totalFila = formValues.cant * formValues.pre;

            // Guardado en la colección de consumos
            await addDoc(collection(db, "consumos"), {
                idReserva: resId,
                descripcion: formValues.desc.toUpperCase(),
                cantidad: formValues.cant,
                precioUnitario: formValues.pre,
                precioTotal: totalFila, // Crucial para el reporte de caja
                fechaConsumo: formValues.fecha,
                registradoEn: new Date().toISOString()
            });
            
            // Notificación rápida (Toast)
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true
            });

            Toast.fire({ icon: 'success', title: 'Cargo añadido correctamente' });

            // REGRESO AUTOMÁTICO AL PANEL DE GESTIÓN
            // Esto refresca la lista y el subtotal general de la habitación
            abrirModalGestionOcupada(hab); 

        } catch (e) {
            console.error("Error registrando consumo:", e);
            Swal.fire('Error', 'No se pudo registrar el cargo en la base de datos.', 'error');
        }
    }
}

/* ==========================================================================
   7. CHECK-OUT (ESTILO ELITE - CIERRE DE CUENTA Y CAJA)
   ========================================================================== */
   async function realizarCheckOut(resId, hab, rData, totalConsumos) {
    const subHosp = parseFloat(rData.total) || 0;
    const adelanto = parseFloat(rData.adelantoMonto || 0);
    const saldoHospedaje = subHosp - adelanto; // Lo que faltaba pagar de la habitación
    const granTotalAPagar = saldoHospedaje + totalConsumos; // Saldo Hab + Todos los consumos

    // Obtener lista de consumos para el ticket/factura
    const qCons = query(collection(db, "consumos"), where("idReserva", "==", resId));
    const snapCons = await getDocs(qCons);
    const listaConsumos = snapCons.docs.map(d => d.data());

    const { value: metodoSeleccionado, isConfirmed, isDenied, isDismissed } = await Swal.fire({
        title: `<span style="font-family: 'Playfair Display', serif; color: #800020; font-size: 24px;">Finalizar Estadía y Pago</span>`,
        width: '550px',
        customClass: {
            popup: 'hotel-modal-custom',
            confirmButton: 'btn-checkout-confirm', // Definir en CSS (Verde esmeralda)
            denyButton: 'btn-checkout-deny',      // Definir en CSS (Vino tinto)
            cancelButton: 'btn-cancelar-soft'
        },
        html: `
            <div class="checkout-container" style="font-family: 'Lato', sans-serif; text-align: left;">
                <div class="checkout-resumen" style="background: #fdfaf5; padding: 20px; border-radius: 10px; border: 1px solid #d4af37; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>Saldo Hospedaje:</span>
                        <span style="font-weight: bold;">S/ ${saldoHospedaje.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; color: #5d4037;">
                        <span>Total Extras/Consumos:</span>
                        <span style="font-weight: bold;">+ S/ ${totalConsumos.toFixed(2)}</span>
                    </div>
                    <div style="border-top: 2px solid #800020; padding-top: 15px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 1px;">Total a Cobrar:</span>
                        <span style="font-size: 28px; font-weight: 800; color: #800020;">S/ ${granTotalAPagar.toFixed(2)}</span>
                    </div>
                </div>
                
                <div style="padding: 0 5px;">
                    <label style="font-size: 11px; font-weight: bold; color: #5d4037; text-transform: uppercase; letter-spacing: 0.5px;">Seleccione Método de Pago:</label>
                    <select id="metodoPago" class="swal2-select" style="width: 100%; margin: 8px 0 0 0; font-size: 16px; border: 1px solid #ccc; border-radius: 5px; height: 45px;">
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Tarjeta">💳 Tarjeta (POS)</option>
                        <option value="Transferencia">📱 Yape / Plin / Transferencia</option>
                    </select>
                </div>
            </div>`,
        icon: 'info',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '✅ PAGAR E IMPRIMIR',
        denyButtonText: 'SÓLO REGISTRAR PAGO',
        cancelButtonText: 'CANCELAR',
        buttonsStyling: false,
        preConfirm: () => {
            return document.getElementById('metodoPago').value;
        }
    });

    if (isDismissed) return; 

    try {
        // A. REGISTRO EN LA COLECCIÓN DE PAGOS (Auditoría de Caja)
        await addDoc(collection(db, "pagos"), {
            idReserva: resId,
            huesped: rData.huesped,
            habitacion: hab.numero,
            montoHospedaje: saldoHospedaje,
            montoExtras: totalConsumos,
            montoTotal: granTotalAPagar,
            metodoPago: metodoSeleccionado,
            fechaPago: new Date().toISOString(),
            atendidoPor: rData.recibidoPor || "Recepcionista", // Trazabilidad
            estado: "completado"
        });

        // B. IMPRESIÓN (Si se eligió el botón verde)
        if (isConfirmed) {
            if (typeof imprimirTicket === 'function') {
                imprimirTicket(rData, listaConsumos, totalConsumos, granTotalAPagar, metodoSeleccionado);
            } else {
                console.warn("La función imprimirTicket no está definida.");
            }
        }

        // C. ACTUALIZACIÓN DE ESTADOS (Cierre de Ciclo)
        // 1. La reserva pasa a historial (checkout)
        await updateDoc(doc(db, "reservas", resId), { 
            estado: "checkout",
            fechaSalidaReal: new Date().toISOString(),
            pagoFinalMetodo: metodoSeleccionado
        });

        // 2. La habitación vuelve a estar disponible y limpia
        await updateDoc(doc(db, "habitaciones", hab.id), { 
            estado: "Libre", 
            personasActuales: 0,
            reservaActualId: "" // Limpiamos el vínculo maestro
        });

        // D. ÉXITO FINAL
        Swal.fire({
            icon: 'success',
            title: 'Check-out Exitoso',
            html: `La Habitación <b>${hab.numero}</b> ha sido liberada.<br>Pago registrado por S/ ${granTotalAPagar.toFixed(2)}`,
            timer: 3500,
            showConfirmButton: false
        });

        // Refrescar el rack de habitaciones si la función existe
        if (typeof cargarHabitaciones === 'function') cargarHabitaciones();

    } catch (error) {
        console.error("Error crítico en checkout:", error);
        Swal.fire('Error de Sistema', 'No se pudo procesar el pago. Verifique su conexión.', 'error');
    }
}

/* ==========================================================================
   8. FUNCIÓN DE IMPRESIÓN DE TICKET (ESTILO TÉRMICO 80mm)
   ========================================================================== */
   async function imprimirTicket(rData, consumos, totalConsumos, granTotal, metodoPago) {
    
    // 1. OBTENER FECHA Y HORA ACTUAL PARA EL TICKET
    const ahora = new Date();
    const fechaTicket = ahora.toLocaleDateString('es-PE') + ' ' + ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    // 2. ABRIR VENTANA DE IMPRESIÓN (Crucial: Definir 'ventana')
    const ventana = window.open('', '_blank', 'width=300,height=600');
    if (!ventana) {
        Swal.fire("Error", "El navegador bloqueó la ventana emergente de impresión.", "error");
        return;
    }

    // 3. GENERAR FILAS DE CONSUMOS (Si existen)
    let filasConsumos = "";
    if (consumos && consumos.length > 0) {
        filasConsumos = consumos.map(c => `
            <tr>
                <td style="padding: 2px 0; vertical-align: top;">${c.cantidad || 1}x ${c.descripcion || c.producto}</td>
                <td style="text-align: right; vertical-align: top;">S/ ${parseFloat(c.precioTotal || 0).toFixed(2)}</td>
            </tr>
        `).join('');
    }

    // 4. CONSTRUCCIÓN DEL HTML DEL TICKET
    ventana.document.write(`
        <html>
        <head>
            <title>Ticket_Hab_${rData.habitacion}</title>
            <style>
                @page { margin: 0; }
                body { 
                    font-family: 'Courier New', Courier, monospace; 
                    width: 260px; 
                    margin: 0; 
                    padding: 10px; 
                    color: #000;
                    font-size: 12px; 
                    line-height: 1.2;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .divider { border-top: 1px dashed #000; margin: 8px 0; }
                table { width: 100%; border-collapse: collapse; }
                .bold { font-weight: bold; }
                .title { font-size: 16px; margin-bottom: 2px; text-transform: uppercase; }
                .total-row { font-size: 14px; font-weight: bold; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div class="text-center">
                <span class="bold title">HOTEL CENTRAL</span><br>
                <span style="font-size: 10px;">RUC: 20601852153</span><br>
                <span style="font-size: 10px;">Jr. Simón Bolívar 355 - Trujillo</span>
            </div>
            
            <div class="divider"></div>
            
            <div>
                <b style="font-size: 13px;">COMPROBANTE DE PAGO</b><br>
                <b>Fecha:</b> ${fechaTicket}<br>
                <b>Habitación:</b> ${rData.habitacion}<br>
                <b>Huésped:</b> ${rData.huesped.toUpperCase()}
            </div>
            
            <div class="divider"></div>
            
            <table>
                <thead>
                    <tr style="border-bottom: 1px solid #000;">
                        <th align="left">CONCEPTO</th>
                        <th align="right">SUBT.</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 5px 0;">Estadía (${rData.checkIn} al ${rData.checkOut})</td>
                        <td class="text-right">S/ ${parseFloat(rData.total).toFixed(2)}</td>
                    </tr>
                    ${filasConsumos}
                </tbody>
            </table>
            
            <div class="divider"></div>
            
            <table>
                <tr class="total-row">
                    <td>TOTAL PAGADO</td>
                    <td class="text-right">S/ ${granTotal.toFixed(2)}</td>
                </tr>
            </table>

            <div style="margin-top: 10px;">
                <span>Medio de Pago: <b>${metodoPago?.toUpperCase() || 'EFECTIVO'}</b></span>
            </div>
            
            <div class="divider"></div>
            
            <div class="text-center" style="font-size: 10px; margin-top: 10px;">
                *** Gracias por su estadía ***<br>
                Trujillo - La Libertad<br>
                <b>www.hotelcentraltrujillo.com</b>
            </div>
        </body>
        </html>
    `);
    
    ventana.document.close();
}