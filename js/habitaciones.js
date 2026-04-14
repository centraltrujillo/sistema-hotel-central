import { auth, db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, 
    where, addDoc, deleteDoc, getDoc, orderBy, limit, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM ---
const habGrid = document.getElementById('habGrid');
const elLibres = document.getElementById('stat-libres');
const elOcupadas = document.getElementById('stat-ocupadas');

const modal = document.getElementById('modalReserva');
const form = document.getElementById('formNuevaReserva');

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

// Configuración de SweetAlert2 para notificaciones rápidas (Toast)
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer)
      toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
  });

// 1. Variable global (fuera de la función) para controlar el listener
let unsubHabs = null; 

// --- 2. CARGAR TABLERO EN TIEMPO REAL ---
function cargarHabitaciones() {
    // Si ya existe un listener activo, no creamos otro.
    if (unsubHabs) {
        console.log("El listener ya está activo, ignorando llamada duplicada.");
        return; 
    }

    const qHabs = query(collection(db, "habitaciones"), orderBy("numero", "asc"));
    const hoy = getHoyISO();

    console.log("Iniciando conexión en tiempo real con Rack de Habitaciones...");

    // Guardamos la función de desuscripción en la variable global
    unsubHabs = onSnapshot(qHabs, async (snapshot) => {
        // --- OPTIMIZACIÓN: Buscamos reservas ANTES de limpiar el HTML ---
        const qRes = query(collection(db, "reservas"), 
                     where("checkIn", "==", hoy), 
                     where("estado", "==", "reservada"));
        
        const snapRes = await getDocs(qRes);
        const listaReservasHoy = snapRes.docs.map(d => String(d.data().habitacion));

        // Ahora sí, limpiamos y dibujamos (evita parpadeos en blanco largos)
        habGrid.innerHTML = '';
        let stats = { libres: 0, ocupadas: 0 };

        snapshot.docs.forEach(docSnap => {
            const hab = { id: docSnap.id, ...docSnap.data() };
            const est = hab.estado || "Libre";
            const nPers = parseInt(hab.personasActuales) || 0;

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
                            ? '<div class="reserva-hoy-tag" style="color: #800020; font-size: 10px; font-weight: 800; margin-top: 5px;">⚠️ RESERVA HOY</div>' 
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
            modalCheckInDirecto(hab); 
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
   4. MODAL PARA INGRESO DIRECTO (SINCRONIZADO CON RESERVAS.JS)
   ========================================================================== */
   async function modalCheckInDirecto(hab) {
    const modal = document.getElementById('modalReserva');
    const form = document.getElementById('formNuevaReserva');
    const statusDiv = document.getElementById('statusDisponibilidad');
    const hoy = getHoyISO();

    // --- A. INICIALIZACIÓN Y CIERRE ---
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.getElementById('modalTitle').innerText = `Ingreso Directo - Hab. ${hab.numero}`;
    form.reset();
    if(statusDiv) statusDiv.innerHTML = "";

    const cerrar = () => {
        modal.style.display = 'none';
        modal.classList.remove('active');
    };

    const closeBtn = modal.querySelector('.close');
    if (closeBtn) closeBtn.onclick = cerrar;

    window.onclick = (e) => {
        if (e.target === modal) cerrar();
    };

    // Valores por defecto
    document.getElementById('resTarifa').value = hab.precio || 0;
    document.getElementById('resCheckIn').value = hoy;
    document.getElementById('resMedio').value = "personal";

    const selectHab = document.getElementById('resHabitacion');
    if(selectHab) selectHab.innerHTML = `<option value="${hab.numero}" selected>${hab.numero} - ${hab.tipo}</option>`;

    // --- B. CRM: AUTOCOMPLETADO POR DNI ---
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
                Toast.fire({ icon: 'success', title: 'Huésped frecuente cargado' });
            }
        } catch (e) { console.error("Error CRM:", e); }
    };

// --- C. LÓGICA DE CÁLCULOS (Optimizado para evitar NaN) ---
const calcularMontosRack = () => {
    const fInVal = document.getElementById('resCheckIn').value;
    const fOutVal = document.getElementById('resCheckOut').value;
    if (!fInVal || !fOutVal) return;

    const fIn = new Date(fInVal + 'T00:00:00');
    const fOut = new Date(fOutVal + 'T00:00:00');
    const tarifaBase = parseFloat(document.getElementById('resTarifa').value) || 0;
    const tc = parseFloat(document.getElementById('resTipoCambio').value) || 0;
    const moneda = document.getElementById('resMoneda').value;

    if (fOut < fIn) {
        document.getElementById('resTotal').value = "0.00";
        document.getElementById('resDiferencia').value = "0.00";
        return;
    }

    const noches = Math.round((fOut - fIn) / (1000 * 60 * 60 * 24));
    // Si es el mismo día (Day Use), se cobra 1 tarifa base
    let subtotal = (noches === 0) ? tarifaBase : noches * tarifaBase;

    const tieneEarly = document.getElementById("resEarly").value !== "";
    const tieneLate = document.getElementById("resLate").value !== "";
    if (tieneEarly) subtotal += (tarifaBase * 0.5);
    if (tieneLate) subtotal += (tarifaBase * 0.5);

    let totalFinal = subtotal;
    if (moneda === "USD" && tc > 0) totalFinal = subtotal * tc;

    document.getElementById('resTotal').value = totalFinal.toFixed(2);
    // CORRECCIÓN: Evitar NaN en diferencia
    let adelanto = parseFloat(document.getElementById('resAdelantoMonto').value) || 0;
    document.getElementById('resDiferencia').value = (totalFinal - adelanto).toFixed(2);
};

    ['resTarifa', 'resCheckIn', 'resCheckOut', 'resAdelantoMonto', 'resTipoCambio', 'resMoneda', 'resEarly', 'resLate']
    .forEach(id => {
        const el = document.getElementById(id);
        if(el) el.oninput = calcularMontosRack;
    });

    // --- D. GUARDADO ATÓMICO CON ESCUDO ANTI-OVERBOOKING ---
    form.onsubmit = async (e) => {
        e.preventDefault();
        const fInNueva = document.getElementById('resCheckIn').value;
        const fOutNueva = document.getElementById('resCheckOut').value;
        const nPers = parseInt(document.getElementById('resPersonas').value) || 1;

        try {
            // 1. BUSCAR SOLAPAMIENTOS EN LA HABITACIÓN ACTUAL
            const qOver = query(collection(db, "reservas"), 
                          where("habitacion", "==", hab.numero.toString()),
                          where("estado", "==", "reservada"));
            
            const snapOver = await getDocs(qOver);
            let conflicto = null;

            snapOver.forEach(docSnap => {
                const r = docSnap.data();
                if (fInNueva < r.checkOut && fOutNueva > r.checkIn) {
                    conflicto = r;
                }
            });

            if (conflicto) {
                // 2. BUSCAR HABITACIONES ALTERNATIVAS DEL MISMO TIPO LIBRES
                const qHabs = query(collection(db, "habitaciones"), where("tipo", "==", hab.tipo));
                const snapHabs = await getDocs(qHabs);
                let disponibles = [];

                for (const hDoc of snapHabs.docs) {
                    const hData = hDoc.data();
                    if (hData.numero === hab.numero) continue;

                    const qCheck = query(collection(db, "reservas"), 
                                   where("habitacion", "==", hData.numero.toString()),
                                   where("estado", "==", "reservada"));
                    const sCheck = await getDocs(qCheck);
                    
                    let ocupada = false;
                    sCheck.forEach(rd => {
                        const rv = rd.data();
                        if (fInNueva < rv.checkOut && fOutNueva > rv.checkIn) ocupada = true;
                    });
                    if (!ocupada) disponibles.push(hData.numero);
                }

                const listaSugerencias = disponibles.length > 0 
                    ? `<p style="margin-top:10px;">Opciones libres del mismo tipo: <br><b style="color:#27ae60; font-size:18px;">${disponibles.join(', ')}</b></p>`
                    : `<p style="color:#e74c3c; margin-top:10px;">No hay más habitaciones ${hab.tipo} disponibles en estas fechas.</p>`;

                const { isConfirmed } = await Swal.fire({
                    title: '¡Conflicto de Reserva!',
                    html: `
                        <div style="text-align: left; font-size: 14px;">
                            <p>La habitación ya está reservada para <b>${conflicto.huesped}</b> del ${conflicto.checkIn} al ${conflicto.checkOut}.</p>
                            ${listaSugerencias}
                        </div>
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Forzar Ingreso',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#800020'
                });
                if (!isConfirmed) return;
            }

            // 3. PROCEDER CON EL REGISTRO SI NO HAY CONFLICTO O SI SE FORZÓ
            const adelantoMonto = parseFloat(document.getElementById('resAdelantoMonto').value) || 0;
            const metodoPago = document.getElementById('resAdelantoDetalle').value || "Efectivo";

            const reservaData = {
                huesped: document.getElementById('resHuesped').value.toUpperCase(),
                doc: document.getElementById('resDoc').value.trim(),
                telefono: document.getElementById('resTelefono').value,
                nacionalidad: document.getElementById('resNacionalidad').value,
                nacimiento: document.getElementById('resNacimiento').value,
                correo: document.getElementById('resCorreo').value,
                habitacion: hab.numero.toString(),
                checkIn: fInNueva,
                checkOut: fOutNueva,
                medio: document.getElementById('resMedio').value,
                personas: nPers,
                desayuno: document.getElementById('resInfo').value,
                early: document.getElementById('resEarly').value,
                late: document.getElementById('resLate').value,
                cochera: document.getElementById('resCochera').value,
                traslado: document.getElementById('resTraslado').value,
                tarifa: parseFloat(document.getElementById('resTarifa').value) || 0,
                moneda: document.getElementById('resMoneda').value,
                tipoCambio: parseFloat(document.getElementById('resTipoCambio').value) || 0,
                total: parseFloat(document.getElementById('resTotal').value) || 0,
                adelantoMonto: adelantoMonto,
                adelantoDetalle: metodoPago,
                diferencia: parseFloat(document.getElementById('resDiferencia').value) || 0,
                observaciones: document.getElementById('resObservaciones').value,
                recepcion: document.getElementById("resRecepcion").value, 
                recepcionconfi: document.getElementById("resRecepcionconfi").value,
                estado: "checkin",
                fechaRegistro: new Date().toISOString(),
                pagos: adelantoMonto > 0 ? [{
                    fecha: new Date().toISOString(),
                    monto: adelantoMonto,
                    concepto: "Adelanto Check-in",
                    metodo: metodoPago
                }] : [],
                consumos: []
            };

            const docRef = await addDoc(collection(db, "reservas"), reservaData);
            
            await updateDoc(doc(db, "habitaciones", hab.id), { 
                estado: "Ocupada",
                personasActuales: nPers,
                reservaActualId: docRef.id 
            });

            await setDoc(doc(db, "huespedes", reservaData.doc), {
                nombre: reservaData.huesped,
                documento: reservaData.doc,
                telefono: reservaData.telefono,
                correo: reservaData.correo,
                nacionalidad: reservaData.nacionalidad,
                nacimiento: reservaData.nacimiento, 
                ultimaVisita: hoy
            }, { merge: true });

            Swal.fire({ icon: 'success', title: '¡Ingreso Exitoso!', timer: 2000, showConfirmButton: false });
            cerrar();
            
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'No se pudo completar el registro.', 'error');
        }
    };
}

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
                            <label><i class="fas fa-concierge-bell"></i> Medio de Reserva</label>
                            <p><span class="badge-medio">${(r.medio || 'Personal').toUpperCase()}</span></p>
                        </div>
                    </div>

                    <div class="ficha-row separator">
                    <div class="ficha-col">
                        <label><i class="fas fa-sign-in-alt"></i> Fecha Ingreso</label>
                        <p><b>${r.checkIn}</b></p>
                        <p class="val-sub">
                            <i class="fa-regular fa-clock"></i> 
                            ${r.early ? `Hora: ${r.early}` : 'Horario estándar'}
                        </p>
                    </div>
                
                    <div class="ficha-col">
                        <label><i class="fas fa-sign-out-alt"></i> Fecha Salida</label>
                        <p><b style="color: #800020;">${r.checkOut}</b></p>
                        <p class="val-sub">
                            <i class="fa-regular fa-clock"></i> 
                            ${r.late ? `Hora: ${r.late}` : 'Horario estándar'}
                        </p>
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
                    <label><i class="fas fa-tag"></i> Tarifa Base</label>
                    <p>${r.moneda || 'PEN'} ${parseFloat(r.tarifa).toFixed(2)}</p>
                    <small class="val-sub">Por noche/estancia</small>
                </div>

                <div class="ficha-col">
                    <label><i class="fas fa-calculator"></i> Total Alojamiento</label>
                    <p><b>S/ ${parseFloat(r.total).toFixed(2)}</b></p>
                </div>
                
                <div class="ficha-col" id="contenedor-pagos-info">
                    <label><i class="fas fa-hand-holding-dollar"></i> Pagos / Adelantos</label>
                    <p style="color: #27ae60; font-weight: bold;">
                        - S/ ${parseFloat(r.adelantoMonto || 0).toFixed(2)}
                    </p>
                    <button id="btnGestionarPagos" class="btn-pagos-sm">
                        <i class="fas fa-history"></i> VER HISTORIAL / ABONAR
                    </button>
                </div>

                <div class="ficha-col">
                    <label>Saldo Pendiente Hab.</label>
                    <p><b style="color: #800020; font-size: 1.2rem;">S/ ${parseFloat(r.diferencia || 0).toFixed(2)}</b></p>
                </div>
            </div>

                    <div class="ficha-row audit-row">
                        <div class="ficha-col span-2">
                            <label><i class="fas fa-comment-dots"></i> Observaciones:</label>
                            <p class="text-obs">${r.observaciones ? `"${r.observaciones}"` : 'Sin notas adicionales.'}</p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-user-edit"></i> Registrado por:</label>
                            <p class="val-audit">${r.recepcion || 'Sistema'}</p>
                        </div>
                        <div class="ficha-col">
                            <label><i class="fas fa-check-double"></i> Confirmado por:</label>
                            <p class="val-audit">${r.recepcionconfi || '-'}</p>
                        </div>
                    </div>
                </div>

                <div class="consumos-section">
                    <div class="section-title">
                        <span><i class="fas fa-utensils"></i> CONSUMOS ADICIONALES (TIENDA / CAFETERÍA)</span>
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
            document.getElementById('btnGestionarPagos').onclick = () => abrirModalHistorialPagos(resDoc.id, hab, r);
        }
    });
}

/* ==========================================================================
   5.1. HISTORIAL Y REGISTRO DE ABONOS
   ========================================================================== */
   async function abrirModalHistorialPagos(resId, hab, rData) {
    // 1. Construir lista visual (Corrección de estilo: border-bottom)
    const listaPagosHTML = (rData.pagos && rData.pagos.length > 0) 
        ? rData.pagos.map((p, i) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee; font-size: 13px;">
                <span><b style="color: #800020;">#${i+1}</b> ${new Date(p.fecha).toLocaleDateString('es-PE')}</span>
                <span style="color: #555;">${p.metodo}</span>
                <span style="font-weight: bold; color: #27ae60;">S/ ${parseFloat(p.monto).toFixed(2)}</span>
            </div>
        `).join('')
        : '<p style="text-align:center; color:#999; padding:10px;">No hay abonos registrados.</p>';

// 2. Lanzar el modal con tu estilo personalizado
const { value: nuevoAbono } = await Swal.fire({
    title: `<span style="font-family:'Playfair Display'; color:#800020; font-size: 20px;">Historial de Pagos</span>`,
    width: '450px',
    customClass: {
        popup: 'hotel-modal-custom', 
        confirmButton: 'btn-dorado-full', 
        cancelButton: 'btn-secundario'
    },
    html: `
        <div style="text-align: left; font-family: 'Lato', sans-serif;">
            <div style="max-height: 180px; overflow-y: auto; margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff;">
                ${listaPagosHTML}
            </div>
            
            <div style="background: #fdfaf5; padding: 15px; border-radius: 8px; border: 1px dashed #d4af37;">
                <label style="font-size: 10px; font-weight: bold; color: #800020; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">
                    Registrar Nuevo Abono
                </label>
                <div style="display: flex; gap: 8px;">
                    <input id="sw-monto-pago" type="number" class="swal2-input" placeholder="Monto S/" style="margin:0; flex: 1; height: 38px; font-size: 14px;">
                    <select id="sw-metodo-pago" class="swal2-select" style="margin:0; flex: 1; height: 38px; font-size: 13px;">
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Tarjeta">💳 Tarjeta</option>
                        <option value="Transferencia">📱 Transf.</option>
                        <option value="Yape">📱 Yape</option>
                        <option value="Plin">📱 Plin</option>
                    </select>
                </div>
            </div>
        </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'REGISTRAR PAGO',
    cancelButtonText: 'VOLVER',
    buttonsStyling: false, // Para que tome tus clases CSS de botones
    preConfirm: () => {
        const monto = parseFloat(document.getElementById('sw-monto-pago').value);
        const metodo = document.getElementById('sw-metodo-pago').value;
        if (!monto || monto <= 0) {
            Swal.showValidationMessage('Ingrese un monto válido');
            return false;
        }
        return { monto, metodo };
    }
});

    if (nuevoAbono) {
        try {
            const nuevoPagoObj = {
                fecha: new Date().toISOString(),
                monto: nuevoAbono.monto,
                metodo: nuevoAbono.metodo,
                concepto: "Abono a cuenta"
            };

            const pagosActualizados = [...(rData.pagos || []), nuevoPagoObj];
            
            // CORRECCIÓN: parseFloat para asegurar suma numérica
            const sumaAdelantos = pagosActualizados.reduce((acc, p) => acc + (parseFloat(p.monto) || 0), 0);
            const nuevaDiferencia = (parseFloat(rData.total) || 0) - sumaAdelantos;

            await updateDoc(doc(db, "reservas", resId), {
                pagos: pagosActualizados,
                adelantoMonto: sumaAdelantos,
                diferencia: nuevaDiferencia
            });

            await addDoc(collection(db, "pagos"), {
                idReserva: resId,
                huesped: rData.huesped,
                habitacion: hab.numero,
                montoTotal: nuevoAbono.monto,
                metodoPago: nuevoAbono.metodo,
                fechaPago: new Date().toISOString(),
                concepto: "Abono Parcial",
                estado: "completado"
            });

            Toast.fire({ icon: 'success', title: 'Abono registrado con éxito' });
            abrirModalGestionOcupada(hab);

        } catch (e) {
            console.error("Error:", e);
            Swal.fire('Error', 'No se pudo registrar el pago', 'error');
        }
    }
}

/* ==========================================================================
   6. AGREGAR CONSUMO (CON LÓGICA DE PAGO INMEDIATO)
   ========================================================================== */
   async function agregarConsumo(resId, hab) {
    const ahora = new Date();
    const offset = ahora.getTimezoneOffset() * 60000;
    const fechaLocal = new Date(ahora - offset).toISOString().slice(0, 16);

    // Primero obtenemos los datos frescos de la reserva para el historial de pagos
    const resDoc = await getDoc(doc(db, "reservas", resId));
    if (!resDoc.exists()) return;
    const rData = resDoc.data();

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
                <label style="font-size: 11px; color: #5d4037; font-weight: bold; text-transform: uppercase;">Descripción</label>
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

                <div style="margin-top: 15px; padding: 12px; background: #fdfaf5; border-radius: 8px; border: 1px solid #d4af37;">
                    <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px; color: #800020; font-weight: bold; margin: 0;">
                        <input id="sw-pagado" type="checkbox" style="margin-right: 10px; width: 18px; height: 18px; accent-color: #800020;"> 
                        ¿PAGÓ EN EL MOMENTO?
                    </label>
                    
                    <div id="metodo-pago-box" style="display: none; margin-top: 12px;">
                        <label style="font-size: 10px; color: #5d4037; font-weight: bold; text-transform: uppercase;">Método de Pago</label>
                        <select id="sw-metodo" class="swal2-select" style="margin: 5px 0 0 0; width: 100%; font-size: 13px; height: 35px;">
                            <option value="Efectivo">💵 Efectivo</option>
                            <option value="Tarjeta">💳 Tarjeta</option>
                            <option value="Yape">📱 Yape</option>
                            <option value="Plin">📱 Plin</option>
                            <option value="Transferencia">📱 Transferencia</option>

                        </select>
                    </div>
                </div>

                <div id="subtotal-preview" style="margin-top: 20px; padding: 15px; background: #800020; border-radius: 8px; text-align: center; color: white;">
                    <span style="font-size: 11px; text-transform: uppercase; opacity: 0.8;">Monto a registrar:</span>

<strong id="preview-monto" style="display: block; font-size: 24px; font-weight: 900; margin-top: 2px; color: #800020;">S/ 0.00</strong>
                </div>
                <input id="sw-fecha" type="hidden" value="${fechaLocal}">
            </div>`,
        showCancelButton: true,
        confirmButtonText: '✅ REGISTRAR CARGO',
        cancelButtonText: 'CANCELAR',
        focusConfirm: false,
        didOpen: () => {
            const inputCant = document.getElementById('sw-cant');
            const inputPre = document.getElementById('sw-pre');
            const checkPagado = document.getElementById('sw-pagado');
            const metodoBox = document.getElementById('metodo-pago-box');
            const displaySubtotal = document.getElementById('preview-monto');
            
            const actualizarSubtotal = () => {
                const c = parseFloat(inputCant.value) || 0;
                const p = parseFloat(inputPre.value) || 0;
                displaySubtotal.innerText = `S/ ${(c * p).toFixed(2)}`;
            };
            
            inputCant.oninput = actualizarSubtotal;
            inputPre.oninput = actualizarSubtotal;
            checkPagado.onchange = () => {
                metodoBox.style.display = checkPagado.checked ? 'block' : 'none';
            };
        },
        preConfirm: () => {
            const desc = document.getElementById('sw-desc').value.trim();
            const cant = parseInt(document.getElementById('sw-cant').value);
            const pre = parseFloat(document.getElementById('sw-pre').value);
            const pagado = document.getElementById('sw-pagado').checked;
            const metodo = document.getElementById('sw-metodo').value;
            const fecha = document.getElementById('sw-fecha').value;

            if (!desc || isNaN(cant) || cant <= 0 || isNaN(pre) || pre < 0) {
                Swal.showValidationMessage('Complete descripción y montos');
                return false;
            }
            return { desc, cant, pre, fecha, pagado, metodo };
        }
    });

    if (formValues) {
        try {
            const montoTotal = Number((formValues.cant * formValues.pre).toFixed(2));

            // 1. REGISTRAR EL CONSUMO EN LA COLECCIÓN (Para el historial de la habitación)
            await addDoc(collection(db, "consumos"), {
                idReserva: resId,
                descripcion: formValues.desc.toUpperCase(),
                cantidad: formValues.cant,
                precioUnitario: formValues.pre,
                precioTotal: montoTotal,
                fechaConsumo: formValues.fecha,
                estadoPago: formValues.pagado ? "PAGADO" : "PENDIENTE"
            });

            // 2. SI FUE PAGADO, REGISTRAR EN LA RESERVA Y EN LA CAJA (PAGOS.HTML)
            if (formValues.pagado) {
                const nuevoPagoObj = {
                    fecha: new Date().toISOString(),
                    monto: montoTotal,
                    metodo: formValues.metodo,
                    tipo: "Consumos",
                    concepto: `Pago Inmediato: ${formValues.desc.toUpperCase()}`
                };

                const pagosActualizados = [...(rData.pagos || []), nuevoPagoObj];
                const totalAbonoExtras = pagosActualizados
                    .filter(p => p.tipo === "Consumos")
                    .reduce((acc, p) => acc + (parseFloat(p.monto) || 0), 0);

                // Actualizar Reserva
                await updateDoc(doc(db, "reservas", resId), {
                    pagos: pagosActualizados,
                    adelantoConsumos: totalAbonoExtras 
                });

                // Registrar en Caja Diaria
                await addDoc(collection(db, "pagos"), {
                    idReserva: resId,
                    huesped: rData.huesped,
                    habitacion: hab.numero,
                    montoTotal: montoTotal,
                    montoExtras: montoTotal,
                    montoHospedaje: 0,
                    metodoPago: formValues.metodo,
                    fechaPago: new Date().toISOString(),
                    concepto: `Venta Directa: ${formValues.desc}`,
                    atendidoBy: rData.recepcion || "Recepcionista"
                });
            }

            Swal.fire({
                icon: 'success',
                title: formValues.pagado ? 'Venta cobrada con éxito' : 'Cargo añadido a la cuenta',
                toast: true,
                position: 'top-end',
                timer: 2500,
                showConfirmButton: false
            });

            abrirModalGestionOcupada(hab); 

        } catch (e) {
            console.error("Error en consumo:", e);
            Swal.fire('Error', 'No se pudo procesar el cargo.', 'error');
        }
    }
}
/* ==========================================================================
   7. CHECK-OUT (ACTUALIZADO CON LÓGICA DE ABONOS A CONSUMOS)
   ========================================================================== */
   async function realizarCheckOut(resId, hab, rData, totalConsumos) {
    // 1. Cálculos base diferenciados
    const subHosp = parseFloat(rData.total) || 0;
    
    // Obtenemos abonos según su tipo
    const adelantoHospedaje = parseFloat(rData.adelantoMonto || 0); 
    const adelantoConsumos = parseFloat(rData.adelantoConsumos || 0); // <-- NUEVO CAMPO

    // Calculamos saldos pendientes individuales
    const saldoHospedaje = Math.max(0, subHosp - adelantoHospedaje); 
    const saldoExtras = Math.max(0, totalConsumos - adelantoConsumos); // <-- RESTA REAL

    // El total a pagar ahora es la suma de los saldos pendientes
    const granTotalAPagar = Number((saldoHospedaje + saldoExtras).toFixed(2)); 

    // Obtener consumos para el ticket
    const qCons = query(collection(db, "consumos"), where("idReserva", "==", resId));
    const snapCons = await getDocs(qCons);
    const listaConsumos = snapCons.docs.map(d => d.data());

    // 2. Definir bloques visuales dinámicos
    const tituloModal = granTotalAPagar <= 0 ? "Finalizar Estadía" : "Finalizar Estadía y Pago";
    
    const bloqueLiquidacion = granTotalAPagar <= 0 
        ? `<div style="text-align: center; padding: 20px; background: #e8f5e9; border-radius: 10px; border: 1px dashed #27ae60; margin-top: 15px;">
               <div style="font-size: 30px; margin-bottom: 5px;">✨</div>
               <span style="font-weight: bold; color: #2e7d32; text-transform: uppercase; letter-spacing: 1px;">Cuenta Saldada</span>
               <p style="font-size: 12px; color: #666; margin: 5px 0 0 0;">No hay montos pendientes.</p>
           </div>`
        : `<div style="background: #800020; padding: 15px; border-radius: 10px; text-align: center; color: white; margin-top: 15px;">
               <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9;">Saldo Pendiente Total:</span>
               <div style="font-size: 28px; font-weight: 900;">S/ ${granTotalAPagar.toFixed(2)}</div>
           </div>`;

    const { value: metodoSeleccionado, isConfirmed, isDismissed } = await Swal.fire({
        title: `<span style="font-family: 'Playfair Display', serif; color: #800020; font-size: 24px;">${tituloModal}</span>`,
        width: '500px',
        customClass: {
            popup: 'hotel-modal-custom',
            confirmButton: 'btn-checkout-confirm', 
            denyButton: 'btn-checkout-deny',     
            cancelButton: 'btn-cancelar-soft'
        },
        html: `
            <div style="font-family: 'Lato', sans-serif; text-align: left;">
                <div style="background: #fdfaf5; padding: 15px; border-radius: 10px; border: 1px solid #d4af37; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
                        <span>Hospedaje (Pendiente):</span>
                        <span style="font-weight: bold;">S/ ${saldoHospedaje.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #5d4037;">
                        <span>Consumos (Pendiente):</span>
                        <span style="font-weight: bold;">+ S/ ${saldoExtras.toFixed(2)}</span>
                    </div>
                </div>

                ${bloqueLiquidacion}
                
                ${granTotalAPagar > 0 ? `
                <div style="margin-top: 20px;">
                    <label style="font-size: 11px; font-weight: bold; color: #5d4037; text-transform: uppercase;">Método de Pago Final:</label>
                    <select id="metodoPago" class="swal2-select" style="width: 100%; margin: 8px 0 0 0; border-color: #d4af37; height: 40px;">
                    <option value="Efectivo">💵 Efectivo</option>
                    <option value="Tarjeta">💳 Tarjeta</option>
                    <option value="Yape">📱 Yape</option>
                    <option value="Plin">📱 Plin</option>
                    <option value="Transferencia">📱 Transferencia</option>
                    </select>
                </div>` : ''}
            </div>`,
        showCancelButton: true,
        showDenyButton: granTotalAPagar > 0,
        confirmButtonText: '✅ PAGAR E IMPRIMIR',
        denyButtonText: 'SÓLO REGISTRAR',
        cancelButtonText: 'VOLVER',
        buttonsStyling: false,
        preConfirm: () => {
            const select = document.getElementById('metodoPago');
            return select ? select.value : "N/A";
        }
    });

    if (isDismissed) return; 

    try {
        const historialPagosActualizado = [...(rData.pagos || [])];
        
        // Si hay un saldo que pagar al cierre, lo agregamos al historial
        if (granTotalAPagar > 0) {
            historialPagosActualizado.push({
                fecha: new Date().toISOString(),
                monto: granTotalAPagar,
                metodo: metodoSeleccionado,
                tipo: "Liquidación", // Para diferenciarlo de abonos previos
                concepto: "Cierre de Cuenta Final"
            });
        }

        // El total final cobrado es la suma de TODO el historial de pagos
        const totalCobradoHistorico = historialPagosActualizado.reduce((acc, p) => acc + (parseFloat(p.monto) || 0), 0);

        // Registro en caja diaria (solo si hubo pago en este momento)
        if (granTotalAPagar > 0) {
            await addDoc(collection(db, "pagos"), {
                idReserva: resId,
                huesped: rData.huesped,
                habitacion: hab.numero,
                montoTotal: granTotalAPagar,
                montoHospedaje: saldoHospedaje,
                montoExtras: saldoExtras,
                metodoPago: metodoSeleccionado,
                fechaPago: new Date().toISOString(),
                concepto: "Liquidación Check-out",
                atendidoBy: rData.recepcion || "Recepcionista"
            });
        }

        // Impresión
        if (isConfirmed && typeof imprimirTicket === 'function') {
            imprimirTicket(rData, listaConsumos, totalConsumos, granTotalAPagar, metodoSeleccionado);
        }

        // ACTUALIZACIÓN FINAL EN FIREBASE
        await updateDoc(doc(db, "reservas", resId), { 
            estado: "checkout",
            fechaSalidaReal: new Date().toISOString(),
            pagos: historialPagosActualizado,
            adelantoMonto: totalCobradoHistorico, // Actualizamos con la suma total final
            diferencia: 0,
            totalFinalConServicios: subHosp + totalConsumos
        });

        await updateDoc(doc(db, "habitaciones", hab.id), { 
            estado: "Libre", 
            personasActuales: 0,
            reservaActualId: "" 
        });

        Swal.fire({ icon: 'success', title: 'Check-out Exitoso', timer: 2000, showConfirmButton: false });

    } catch (error) {
        console.error("Error en checkout:", error);
        Swal.fire('Error', 'No se pudo completar el cierre.', 'error');
    }
}

async function imprimirTicket(rData, consumos, totalConsumos, pagoActual, metodoPago) {
    let nombreAtendido = "RECEPCIONISTA"; 
    try {
        const user = auth.currentUser;
        if (user) {
            const userDocRef = doc(db, "usuarios", user.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
                nombreAtendido = userSnap.data().nombre || "ADMINISTRADOR";
            }
        }
    } catch (error) { console.error("Error user ticket:", error); }

    const ahora = new Date();
    const fechaEmision = ahora.toLocaleDateString('es-PE') + ' ' + ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    const ventana = window.open('', '_blank', 'width=300,height=600');
    if (!ventana) return;

    const formatF = (f) => {
        if (!f) return "00/00";
        const p = f.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}` : f;
    };

    // --- LÓGICA ALINEADA CON MÓDULO PAGOS ---
    const tarifaBase = parseFloat(rData.tarifa || 0);
    const montoMediaTarifa = tarifaBase / 2;
    const totalRegistradoEnReserva = parseFloat(rData.total || 0); // Este es el total que ya tiene la reserva

    let cargosExtraHospedaje = 0;
    let filasHospedajeHTML = '';

    // 1. Calculamos cuánto del total es "Extra" para desglosarlo como en el modal de Pagos
    let htmlEarly = "";
    if (rData.early && rData.early !== "" && rData.early !== 0) {
        cargosExtraHospedaje += montoMediaTarifa;
        htmlEarly = `<tr><td>(+) EARLY CHECK-IN (${rData.early}:00)</td><td class="text-right">S/ ${montoMediaTarifa.toFixed(2)}</td></tr>`;
    }

    let htmlLate = "";
    if (rData.late && rData.late !== "" && rData.late !== 0) {
        cargosExtraHospedaje += montoMediaTarifa;
        htmlLate = `<tr><td>(+) LATE CHECK-OUT (${rData.late}:00)</td><td class="text-right">S/ ${montoMediaTarifa.toFixed(2)}</td></tr>`;
    }

    // La estancia pura es el total de la reserva menos los cargos que acabamos de identificar
    const estanciaLimpia = totalRegistradoEnReserva - cargosExtraHospedaje;

    filasHospedajeHTML = `
        <tr>
            <td>ESTANCIA (${formatF(rData.checkIn)} - ${formatF(rData.checkOut)})</td>
            <td class="text-right">S/ ${estanciaLimpia.toFixed(2)}</td>
        </tr>
        ${htmlEarly}
        ${htmlLate}
    `;

    // 2. Consumos
    let filasConsumos = (consumos || []).map(c => `
        <tr>
            <td>${c.cantidad || 1}x ${c.descripcion}</td>
            <td class="text-right">S/ ${parseFloat(c.precioTotal || 0).toFixed(2)}</td>
        </tr>
    `).join('');

    // --- CÁLCULOS FINALES ---
    const totalCargosGlobal = totalRegistradoEnReserva + totalConsumos;
    
    // El "Abonado Anteriormente" es el total de cargos menos lo que se está pagando ahora mismo
    const saldoPendienteAntesDeEstePago = totalCargosGlobal - pagoActual;

    ventana.document.write(`
        <html>
        <head>
            <title>Ticket_Hab_${rData.habitacion}</title>
            <style>
                @page { margin: 0; }
                body { font-family: 'Courier New', monospace; width: 260px; padding: 10px; font-size: 11px; color: #000; line-height: 1.2; }
                .text-center { text-align: center; }
                .text-right { text-align: right; white-space: nowrap; }
                .divider { border-top: 1px dashed #000; margin: 8px 0; }
                table { width: 100%; border-collapse: collapse; }
                td { padding: 2px 0; vertical-align: top; }
                .bold { font-weight: bold; }
                .total-final { font-size: 13px; font-weight: bold; border-top: 1px solid #000; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div class="text-center">
                <span class="bold" style="font-size: 15px;">HOTEL CENTRAL</span><br>
                <span style="font-size: 9px;">RUC: 20601852153</span><br>
                <span style="font-size: 9px;">Jr. Simón Bolívar 355 - Trujillo</span>
            </div>
            <div class="divider"></div>
            <div>
                <b>HAB:</b> ${rData.habitacion} | <b>HUESPED:</b> ${rData.huesped.toUpperCase()}<br>
                <b>FECHA EMISIÓN:</b> ${fechaEmision}
            </div>
            <div class="divider"></div>
            <table>
                <thead>
                    <tr style="border-bottom: 1px solid #000; font-size: 9px;">
                        <th align="left">DESCRIPCIÓN</th>
                        <th align="right">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${filasHospedajeHTML}
                    ${filasConsumos}
                </tbody>
            </table>
            <div class="divider"></div>
            <table>
                <tr>
                    <td>TOTAL SERVICIOS</td>
                    <td class="text-right">S/ ${totalCargosGlobal.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>ABONOS PREVIOS</td>
                    <td class="text-right">- S/ ${Math.max(0, saldoPendienteAntesDeEstePago).toFixed(2)}</td>
                </tr>
                <tr class="total-final">
                    <td style="padding-top:5px;">Monto Pagado</td>
                    <td class="text-right" style="padding-top:5px;">S/ ${pagoActual.toFixed(2)}</td>
                </tr>
            </table>
            <div style="margin-top: 10px; font-size: 9px;">
                MÉTODO PAGO: <b>${metodoPago.toUpperCase()}</b><br>
                ATENDIDO POR: ${nombreAtendido}
            </div>
            <div class="divider"></div>
            <div class="text-center" style="font-size: 9px;">
                *** Gracias por su preferencia ***
            </div>
        </body>
        </html>
    `);
    ventana.document.close();
}