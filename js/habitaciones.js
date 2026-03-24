import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, 
    where, addDoc, deleteDoc, getDoc, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Referencias a elementos del DOM
const habGrid = document.getElementById('habGrid');
const elLibres = document.getElementById('stat-libres');
const elOcupadas = document.getElementById('stat-ocupadas');

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

// --- 1. CARGAR TABLERO (DISEÑO PREMIUM ACTUALIZADO) ---
function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"));
    const hoy = getHoyISO();

    onSnapshot(qHabs, async (snapshot) => {
        habGrid.innerHTML = '';
        
        let s = { l: 0, o: 0 };

        // Buscamos reservas para hoy para mostrar la alerta amarilla
        const qRes = query(collection(db, "reservas"), 
                     where("checkIn", "==", hoy), 
                     where("estado", "==", "reservada"));
        
        const snapRes = await getDocs(qRes);
        const listaReservasHoy = snapRes.docs.map(d => String(d.data().habitacion));

        snapshot.docs.forEach(docSnap => {
            const hab = { id: docSnap.id, ...docSnap.data() };
            const est = hab.estado || "Libre";
            const nPers = hab.personasActuales || 0; // Se obtiene de la base de datos

            // Estadísticas
            if (est === "Libre" || est === "Disponible") s.l++;
            else if (est === "Ocupada") s.o++;

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
                        <span class="hab-badge">${est}</span>
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

        // Actualizar contadores superiores
        if (elLibres) elLibres.innerText = s.l;
        if (elOcupadas) elOcupadas.innerText = s.o;
    });
}

//Función Auxiliar para los Iconos Dinámicos
 
function obtenerIconoSegunOcupacion(estado, numPersonas) {
    if (estado !== "Ocupada") return 'fa-hotel'; 

    const p = parseInt(numPersonas) || 1;

    if (p === 1) return 'fa-user';            // 1 persona (Individual)
    if (p === 2) return 'fa-user-group';      // 2 personas (Pareja)
    if (p >= 3 && p <= 4) return 'fa-users';  // 3 a 4 personas (Grupo/Familia)
    if (p >= 5) return 'fa-people-group';     // 5 a más (Delegación/Grupo Grande)
    
    return 'fa-users'; // Por si acaso
}


/* ==========================================================================
   2. MODAL CHECK-IN (ELECCIÓN DE ORIGEN)
   ========================================================================== */
   async function abrirModalCheckIn(hab) {
    const hoy = getHoyISO();

    // A. VALIDACIÓN ANTI-OVERBOOKING (Evita doble check-in en la misma hab)
    const qCheck = query(collection(db, "reservas"), 
                   where("habitacion", "==", hab.numero.toString()), 
                   where("estado", "==", "checkin"));
    const snapCheck = await getDocs(qCheck);

    if (!snapCheck.empty) {
        Swal.fire('Atención', 'Esta habitación ya tiene un proceso de ingreso activo.', 'warning');
        return;
    }

    // B. BUSCAR RESERVAS PROGRAMADAS PARA HOY
    const q = query(collection(db, "reservas"), 
              where("habitacion", "==", hab.numero.toString()), 
              where("checkIn", "==", hoy),
              where("estado", "==", "reservada"));
    
    const snap = await getDocs(q);
    let opciones = {};
    let datosReservas = {}; // Para guardar la info de personas temporalmente

    snap.forEach(d => { 
        const data = d.data();
        opciones[d.id] = `🏨 Reserva: ${data.huesped}`; 
        datosReservas[d.id] = data.personas || 1; // Guardamos el N° de personas
    });
    
    opciones["directo"] = "➕ Venta del Día (Cliente nuevo)";

    // C. DIÁLOGO DE SELECCIÓN
    const { value: choice } = await Swal.fire({
        title: `Check-in Hab. ${hab.numero}`,
        input: 'select',
        inputOptions: opciones,
        inputPlaceholder: '¿Cómo desea registrar el ingreso?',
        confirmButtonColor: '#800020', // Tu color Vino Tinto
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        preConfirm: async (value) => {
            if (!value) {
                Swal.showValidationMessage('Debes seleccionar una opción');
                return false;
            }
            // ADVERTENCIA: Si elige "Directo" pero hay una reserva esperando
            if (value === "directo" && !snap.empty) {
                const result = await Swal.fire({
                    title: '¿Confirmar Venta Directa?',
                    text: "Existe una reserva para hoy en esta habitación. ¿Desea ignorarla y continuar?",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, proceder',
                    cancelButtonText: 'No, revisar reserva'
                });
                return result.isConfirmed ? "directo" : false;
            }
            return value;
        }
    });

    // D. EJECUCIÓN DE LA RUTA ELEGIDA
    if (choice) {
        if (choice === "directo") {
            // Caso 1: Es un cliente nuevo, abrimos el formulario largo
            modalCheckInDirecto(hab); 
        } else {
            // Caso 2: Es una reserva que ya existe en el sistema
            try {
                const nPers = datosReservas[choice]; // Recuperamos el número de personas

                // 1. Actualizamos la Reserva a estado "checkin"
                await updateDoc(doc(db, "reservas", choice), { 
                    estado: "checkin" 
                });

                // 2. Actualizamos la Habitación (ESTO ACTIVA EL ICONO)
                await updateDoc(doc(db, "habitaciones", hab.id), { 
                    estado: "Ocupada",
                    personasActuales: parseInt(nPers) 
                });

                Swal.fire({
                    icon: 'success',
                    title: 'Check-in Exitoso',
                    text: 'La habitación ahora figura como OCUPADA',
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (error) {
                console.error(error);
                Swal.fire('Error', 'No se pudo procesar el ingreso.', 'error');
            }
        }
    }
}

/* ==========================================================================
   3. MODAL PARA INGRESO DIRECTO (CORREGIDO)
   ========================================================================== */
   async function modalCheckInDirecto(hab) {
    const modal = document.getElementById('modalReserva');
    const form = document.getElementById('formNuevaReserva');
    const hoy = getHoyISO();

    modal.style.display = 'flex';
    document.getElementById('modalTitle').innerText = `Ingreso Directo - Hab. ${hab.numero}`;
    
    form.reset();
    document.getElementById('resCheckIn').value = hoy;
    document.getElementById('resCheckOut').value = hoy;
    document.getElementById('resTarifa').value = hab.precio || 0;
    
    // IMPORTANTE: Asegúrate de que el campo de Moneda y TC existan en tu HTML nativo
    if(document.getElementById('resTipoCambio')) document.getElementById('resTipoCambio').value = ""; 

    const selectHab = document.getElementById('resHabitacion');
    selectHab.innerHTML = `<option value="${hab.numero}" selected>${hab.numero} - ${hab.tipo}</option>`;

    // B. AUTOCOMPLETADO POR DNI (Mejorado)
    const docInput = document.getElementById('resDoc');
    docInput.onblur = async () => {
        const dni = docInput.value.trim();
        if (dni.length < 3) return;
        
        // Usamos la misma lógica de búsqueda que en el modal de edición
        const docSnap = await getDoc(doc(db, "huespedes", dni));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('resHuesped').value = data.nombre || '';
            document.getElementById('resTelefono').value = data.telefono || '';
            document.getElementById('resCorreo').value = data.correo || '';
            document.getElementById('resNacionalidad').value = data.nacionalidad || '';
            document.getElementById('resNacimiento').value = data.nacimiento || '';
            docInput.style.borderColor = '#d4af37'; // Ocre para éxito
        }
    };

    // C. LÓGICA DE CÁLCULOS (Sincronizada con el resto del sistema)
    const calcularTotales = () => {
        // CORRECCIÓN: Añadimos la hora T12:00:00 para evitar errores de zona horaria
        const f1 = new Date(document.getElementById('resCheckIn').value + 'T12:00:00');
        const f2 = new Date(document.getElementById('resCheckOut').value + 'T12:00:00');
        const tarifaBase = parseFloat(document.getElementById('resTarifa').value) || 0;
        const adelanto = parseFloat(document.getElementById('resAdelantoMonto').value) || 0;
        const moneda = document.getElementById('resMoneda')?.value || 'PEN';
        const tc = parseFloat(document.getElementById('resTipoCambio')?.value) || 0;
        
        let noches = Math.ceil((f2 - f1) / (1000 * 60 * 60 * 24));
        if (noches <= 0) noches = 1; 
        
        let subtotal = noches * tarifaBase;
        let totalFinal = subtotal;

        // CORRECCIÓN: Aplicar TC solo si es USD
        if (moneda === "USD" && tc > 0) {
            totalFinal = subtotal * tc;
        }

        document.getElementById('resTotal').value = totalFinal.toFixed(2);
        document.getElementById('resDiferencia').value = (totalFinal - adelanto).toFixed(2);
    };

    // Escuchar cambios (Añadimos Moneda y TC a los listeners)
    ['resCheckIn', 'resCheckOut', 'resTarifa', 'resAdelantoMonto', 'resMoneda', 'resTipoCambio'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', calcularTotales);
    });
    
    calcularTotales();

    // D. GUARDADO EN FIREBASE
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const nPers = document.getElementById('resPersonas').value;

        // CORRECCIÓN: Estandarización de nombres de campos para que coincidan con el detalle
        const reservaData = {
            huesped: document.getElementById('resHuesped').value.toUpperCase(),
            doc: document.getElementById('resDoc').value,
            telefono: document.getElementById('resTelefono').value,
            nacionalidad: document.getElementById('resNacionalidad').value,
            nacimiento: document.getElementById('resNacimiento').value,
            correo: document.getElementById('resCorreo').value,
            habitacion: hab.numero.toString(),
            checkIn: document.getElementById('resCheckIn').value,
            checkOut: document.getElementById('resCheckOut').value,
            medio: document.getElementById('resMedio').value,
            personas: parseInt(nPers),
            desayuno: document.getElementById('resInfo').value,
            tarifa: parseFloat(document.getElementById('resTarifa').value),
            moneda: document.getElementById('resMoneda')?.value || 'PEN', // Guardar moneda
            tipoCambio: parseFloat(document.getElementById('resTipoCambio')?.value) || 0, // Guardar TC
            total: parseFloat(document.getElementById('resTotal').value),
            adelantoMonto: parseFloat(document.getElementById('resAdelantoMonto').value) || 0,
            adelantoDetalle: document.getElementById('resAdelantoDetalle').value,
            diferencia: parseFloat(document.getElementById('resDiferencia').value),
            cochera: document.getElementById('resCochera').value,
            observaciones: document.getElementById('resObservaciones').value,
            recibidoPor: document.getElementById('resRecepcion').value, // Estandarizado
            confirmadoPor: document.getElementById('resRecepcionconfi').value, // Estandarizado
            estado: "checkin",
            tipoVenta: "Directa",
            fechaRegistro: new Date().toISOString()
        };

        try {
            await addDoc(collection(db, "reservas"), reservaData);
            
            await updateDoc(doc(db, "habitaciones", hab.id), { 
                estado: "Ocupada",
                personasActuales: parseInt(nPers)
            });

            // Guardar o actualizar datos del huésped para autocompletado futuro
            await setDoc(doc(db, "huespedes", reservaData.doc), {
                nombre: reservaData.huesped,
                documento: reservaData.doc,
                telefono: reservaData.telefono,
                correo: reservaData.correo,
                nacionalidad: reservaData.nacionalidad,
                ultimaVisita: hoy
            }, { merge: true });

            Swal.fire({ icon: 'success', title: '¡Check-In Directo Exitoso!', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
            cerrarModal(); 
            // Tip: Aquí podrías llamar a una función para refrescar el dashboard
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'No se pudo completar el registro.', 'error');
        }
    };
}

function cerrarModal() {
    document.getElementById('modalReserva').style.display = 'none';
}

// Reemplaza el window.onclick por esto:
window.addEventListener('click', (event) => {
    const modal = document.getElementById('modalReserva');
    if (event.target === modal) {
        cerrarModal();
    }
});

/* ==========================================================================
   4. MODAL GESTION OCUPADA HABITACION
   ========================================================================== */
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
        
        // 1. Usamos precioTotal (el monto ya multiplicado por la cantidad)
        const montoFila = parseFloat(item.precioTotal) || 0;
        totalCons += montoFila;

        // 2. Manejo seguro de fecha (Soporta Timestamp de Firebase o String)
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
                    <span>Habitación ${hab.numero}</span>
                    <small>${hab.tipo || 'Doble'}</small>
                </div>`,
        width: '900px',
        customClass: { popup: 'hotel-modal-custom' },
        html: `
            <div class="gestion-container">
                <div class="ficha-huesped">
                    <div class="ficha-row">
                        <div class="ficha-col span-2">
                            <label>Huésped Principal</label>
                            <p class="val-main">${r.huesped}</p>
                            <p class="val-sub">${r.doc || 'Sin DNI'} • ${r.nacionalidad || 'Nacionalidad N/A'}</p>
                        </div>
                        <div class="ficha-col">
                            <label>Contacto</label>
                            <p>${r.telefono || '-'}</p>
                            <p class="val-sub">${r.correo || 'Sin correo'}</p>
                        </div>
                        <div class="ficha-col">
                            <label>Medio Reserva</label>
                            <p><span class="badge-medio">${r.medio?.toUpperCase() || 'DIRECTA'}</span></p>
                        </div>
                    </div>

                    <div class="ficha-row separator">
                        <div class="ficha-col">
                            <label>Ingreso</label>
                            <p><b>${r.checkIn}</b></p>
                        </div>
                        <div class="ficha-col">
                            <label>Salida Prevista</label>
                            <p><b style="color: var(--vino-tinto);">${r.checkOut}</b></p>
                        </div>
                        <div class="ficha-col">
                            <label>Pax / Cochera</label>
                            <p>${r.personas} Pers. | ${r.cochera || 'No'}</p>
                        </div>
                        <div class="ficha-col">
                            <label>Servicios</label>
                            <p class="val-sub">${r.desayuno || 'SIN DESAYUNO'}</p>
                        </div>
                    </div>
                </div>

                <div class="consumos-section">
                    <div class="section-title">
                        <span><i class="fas fa-shopping-cart"></i> CONSUMOS EXTRAS</span>
                        <button id="btnAddConsumo" class="btn-agregar-sm">+ AGREGAR ITEM</button>
                    </div>
                    
                    <div class="lista-consumos">
                        ${tablaCons || '<div class="no-data">No hay consumos registrados aún.</div>'}
                    </div>

                    <div class="total-bar">
                        <div class="total-label">
                            <small>CARGOS ADICIONALES</small>
                            <span>Subtotal Consumos</span>
                        </div>
                        <div class="total-monto">S/ ${totalCons.toFixed(2)}</div>
                    </div>
                </div>

                <div class="gestion-footer">
                    <button id="btnCerrarModal" class="btn-secundario">CERRAR PANEL</button>
                    <button id="btnFinalizarOut" class="btn-checkout-final">🏁 FINALIZAR CHECK-OUT</button>
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


// --- 5. AGREGAR CONSUMO (ESTILO INTEGRADO) ---
async function agregarConsumo(resId, hab) {
    const ahora = new Date();
    // Ajuste de zona horaria Perú
    const offset = ahora.getTimezoneOffset() * 60000;
    const fechaLocal = new Date(ahora - offset).toISOString().slice(0, 16);

    const { value: formValues } = await Swal.fire({
        title: `<span style="font-family: var(--font-titles); color: var(--vino-tinto); font-size: 22px;">Nuevo Cargo / Consumo</span>`,
        width: '450px',
        customClass: {
            popup: 'hotel-modal-custom',
            confirmButton: 'btn-dorado-full', // Usamos el dorado para registrar
            cancelButton: 'btn-cancelar-soft'
        },
        html: `
            <div style="text-align: left; font-family: var(--font-main); padding: 10px;">
                <label style="font-size: 11px; color: var(--marron-zocalo); font-weight: bold; text-transform: uppercase;">Descripción del Producto/Servicio</label>
                <input id="sw-desc" class="swal2-input" style="margin: 5px 0 15px 0; width: 100%;" placeholder="Ej. Agua San Mateo 600ml">
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <label style="font-size: 11px; color: var(--marron-zocalo); font-weight: bold; text-transform: uppercase;">Cantidad</label>
                        <input id="sw-cant" type="number" class="swal2-input" value="1" min="1" style="margin: 5px 0; width: 100%;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: var(--marron-zocalo); font-weight: bold; text-transform: uppercase;">Precio Unit. (S/)</label>
                        <input id="sw-pre" type="number" step="0.10" class="swal2-input" placeholder="0.00" style="margin: 5px 0; width: 100%;">
                    </div>
                </div>

                <div style="margin-top: 15px;">
                    <label style="font-size: 11px; color: var(--marron-zocalo); font-weight: bold; text-transform: uppercase;">Fecha y Hora de Consumo</label>
                    <input id="sw-fecha" type="datetime-local" class="swal2-input" value="${fechaLocal}" style="margin: 5px 0; width: 100%; font-size: 14px;">
                </div>

                <div id="subtotal-preview" style="margin-top: 20px; padding: 10px; background: var(--blanco-colonial); border-radius: 8px; text-align: center; border: 1px dashed var(--amarillo-ocre);">
                    <span style="font-size: 12px; color: var(--marron-zocalo);">SUBTOTAL A CARGAR:</span>
                    <strong style="display: block; font-size: 20px; color: var(--vino-tinto);">S/ 0.00</strong>
                </div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: '✅ REGISTRAR CARGO',
        cancelButtonText: 'CANCELAR',
        didOpen: () => {
            const c = document.getElementById('sw-cant');
            const p = document.getElementById('sw-pre');
            const preview = document.querySelector('#subtotal-preview strong');
            
            const calc = () => {
                const total = (parseFloat(c.value) || 0) * (parseFloat(p.value) || 0);
                preview.innerText = `S/ ${total.toFixed(2)}`;
            };
            
            c.addEventListener('input', calc);
            p.addEventListener('input', calc);
        },
        preConfirm: () => {
            const desc = document.getElementById('sw-desc').value.trim();
            const cant = parseInt(document.getElementById('sw-cant').value);
            const precio = parseFloat(document.getElementById('sw-pre').value);
            const fecha = document.getElementById('sw-fecha').value;

            if (!desc || isNaN(cant) || isNaN(precio) || !fecha) {
                Swal.showValidationMessage('Por favor, complete todos los campos correctamente');
                return false;
            }
            return { desc, cant, precio, fecha };
        }
    });

if (formValues) {
    try {
        const unitario = parseFloat(formValues.precio);
        const cantidad = parseInt(formValues.cant);
        const totalFila = unitario * cantidad; // Cálculo de la fila

        await addDoc(collection(db, "consumos"), {
            idReserva: resId,
            descripcion: formValues.desc.toUpperCase(),
            cantidad: cantidad,
            precioUnitario: unitario,
            precioTotal: totalFila, // <--- CAMPO ESTÁNDAR
            fechaConsumo: formValues.fecha
        });
            
            // Toast de éxito
            Swal.fire({
                icon: 'success',
                title: 'Cargo registrado',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });

            abrirModalGestionOcupada(hab); // Regresamos al panel principal
        } catch (e) {
            Swal.fire('Error', 'No se pudo registrar el consumo', 'error');
        }
    }
}

// --- 6. CHECK-OUT (ESTILO ELITE) ---
async function realizarCheckOut(resId, hab, rData, totalConsumos) {
    const subHosp = parseFloat(rData.total) || 0;
    const granTotal = subHosp + totalConsumos;

    // Obtener lista de consumos para el ticket
    const qCons = query(collection(db, "consumos"), where("idReserva", "==", resId));
    const snapCons = await getDocs(qCons);
    const listaConsumos = snapCons.docs.map(d => d.data());

    const resultado = await Swal.fire({
        title: `<span style="font-family: var(--font-titles); color: var(--vino-tinto); font-size: 24px;">Finalizar Estadía y Pago</span>`,
        width: '500px',
        html: `
            <div class="checkout-container" style="font-family: var(--font-main);">
                <div class="checkout-resumen" style="background: var(--blanco-colonial); padding: 15px; border-radius: 10px; border: 1px solid var(--amarillo-ocre); margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Subtotal Hospedaje:</span>
                        <span style="font-weight: bold;">S/ ${subHosp.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px; color: var(--marron-zocalo);">
                        <span>Total Extras/Consumos:</span>
                        <span style="font-weight: bold;">+ S/ ${totalConsumos.toFixed(2)}</span>
                    </div>
                    <div style="border-top: 2px solid var(--vino-tinto); pt-10; mt-5; display: flex; justify-content: space-between; align-items: center; padding-top: 10px;">
                        <span style="font-weight: 800; color: var(--negro);">TOTAL A COBRAR:</span>
                        <span style="font-size: 24px; font-weight: 800; color: var(--vino-tinto);">S/ ${granTotal.toFixed(2)}</span>
                    </div>
                </div>
                
                <div style="text-align: left;">
                    <label style="font-size: 11px; font-weight: bold; color: var(--marron-zocalo); text-transform: uppercase;">Método de Pago:</label>
                    <select id="metodoPago" class="swal2-select" style="width: 100%; margin: 5px 0 0 0; font-size: 15px; border: 1px solid var(--gris-antracita);">
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Tarjeta">💳 Tarjeta (Visa/MC)</option>
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
        customClass: {
            popup: 'hotel-modal-custom',
            confirmButton: 'btn-pagar-imprimir', // Botón verde (definir en CSS)
            denyButton: 'btn-solo-pagar',       // Botón vino tinto
            cancelButton: 'btn-cancelar-soft'   // Botón gris
        },
        preConfirm: () => {
            return document.getElementById('metodoPago').value;
        }
    });

    if (resultado.isDismissed) return; // <--- AGREGAR ESTO: Si cancela, no hace nada.

if (resultado.isConfirmed || resultado.isDenied) {
    try {
            // El valor de preConfirm llega en resultado.value
            const metodoSeleccionado = resultado.value;

            // A. REGISTRO DE PAGO
            await addDoc(collection(db, "pagos"), {
                idReserva: resId,
                huesped: rData.huesped,
                habitacion: hab.numero,
                montoHospedaje: subHosp,
                montoExtras: totalConsumos,
                montoTotal: granTotal,
                metodoPago: metodoSeleccionado,
                fechaPago: new Date(),
                tipoTicket: resultado.isConfirmed ? "Impreso" : "Digital"
            });

            // B. IMPRESIÓN (Si confirmó con el botón principal)
            if (resultado.isConfirmed) {
                imprimirTicket(rData, listaConsumos, totalConsumos, granTotal, metodoSeleccionado);
            }

            // C. CIERRE DE CICLO
await updateDoc(doc(db, "reservas", resId), { estado: "checkout" });
await updateDoc(doc(db, "habitaciones", hab.id), { 
    estado: "Libre", 
    personasActuales: 0 // <--- AGREGAR ESTO para que el icono vuelva a ser el hotel
});

            Swal.fire({
                icon: 'success',
                title: 'Check-out Completado',
                text: `Habitación ${hab.numero} ahora está LIBRE.`,
                timer: 3000,
                showConfirmButton: false
            });

        } catch (error) {
            console.error("Error en checkout:", error);
            Swal.fire('Error', 'No se pudo procesar el check-out.', 'error');
        }
    }
}


// --- 7. FUNCIÓN DE IMPRESIÓN (FORMATO TICKET TÉRMICO) ---
function imprimirTicket(rData, consumos, totalConsumos, granTotal, metodoPago) {
    // Abrir ventana inmediatamente para evitar bloqueo de pop-ups
    const ventana = window.open('', '_blank');
    const fechaActual = new Date().toLocaleString('es-PE');
    
    // Generar filas de consumos usando el campo estandarizado 'precioTotal'
    let filasConsumos = consumos.map(c => `
        <tr>
            <td style="padding: 2px 0; vertical-align: top;">${c.cantidad || 1}x ${c.descripcion}</td>
            <td style="text-align: right; vertical-align: top;">S/ ${parseFloat(c.precioTotal || 0).toFixed(2)}</td>
        </tr>
    `).join('');

    ventana.document.write(`
        <html>
        <head>
            <title>Ticket_Hab_${rData.habitacion}</title>
            <style>
                @page { margin: 0; }
                body { 
                    font-family: 'Courier New', Courier, monospace; 
                    width: 260px; /* Un poco más estrecho para mayor compatibilidad */
                    margin: 0; 
                    padding: 8px; 
                    color: #000;
                    font-size: 11px; /* Letra un punto más pequeña para que entre más info */
                    line-height: 1.3;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .divider { border-top: 1px dashed #000; margin: 6px 0; }
                table { width: 100%; border-collapse: collapse; }
                .bold { font-weight: bold; }
                .title { font-size: 15px; margin-bottom: 2px; text-transform: uppercase; }
                .total-row { font-size: 13px; font-weight: bold; border-top: 1px solid #000; }
            </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 700);">
            <div class="text-center">
                <span class="bold title">HOTEL CENTRAL</span><br>
                <span style="font-size: 9px;">RUC: 20601852153</span><br>
                <span style="font-size: 9px;">Jr. Simón Bolívar 355 - Trujillo</span>
            </div>
            
            <div class="divider"></div>
            
            <div>
                <b style="font-size: 12px;">TICKET DE PAGO #001</b><br>
                <b>Fecha:</b> ${fechaActual}<br>
                <b>Hab:</b> ${rData.habitacion} [${rData.tipo || 'Hab'}]<br>
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
                        <td style="padding: 4px 0;">Estadía (${rData.checkIn} / ${rData.checkOut})</td>
                        <td class="text-right">S/ ${parseFloat(rData.total).toFixed(2)}</td>
                    </tr>
                    ${filasConsumos}
                </tbody>
            </table>
            
            <div class="divider"></div>
            
            <table>
                <tr class="total-row">
                    <td style="padding-top: 5px;">TOTAL PAGADO</td>
                    <td class="text-right" style="padding-top: 5px;">S/ ${granTotal.toFixed(2)}</td>
                </tr>
            </table>

            <div style="margin-top: 8px;">
                <span>Forma de Pago: <b>${metodoPago?.toUpperCase() || 'EFECTIVO'}</b></span>
            </div>
            
            <div class="divider"></div>
            
            <div class="text-center" style="font-size: 9px;">
                *** Gracias por su preferencia ***<br>
                Trujillo - La Libertad<br>
                <b>www.hotelcentraltrujillo.com</b>
            </div>
        </body>
        </html>
    `);
    ventana.document.close();
}