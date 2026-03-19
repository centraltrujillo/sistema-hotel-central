import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, 
    where, addDoc, deleteDoc, getDoc, orderBy, setDoc
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

// --- 1. CARGAR TABLERO (DISEÑO PREMIUM ACTUALIZADO) ---
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
            
            if (est === "Libre" || est === "Disponible") {
                s.l++;
            } else if (est === "Ocupada") {
                s.o++;
            }

            const tieneReservaHoy = listaReservasHoy.some(resHab => String(resHab) === String(hab.numero));

            const card = document.createElement('div');
            
            // Usamos el estado en minúsculas para el color (vino o verde)
            card.className = `hab-card ${est.toLowerCase()}`;
            
            // ESTRUCTURA NUEVA: Número y Tipo arriba, Icono en el centro
            card.innerHTML = `
                <div class="hab-header">
                    <div class="hab-number">${hab.numero}</div>
                    <div class="hab-type">${hab.tipo}</div>
                </div>
                <div class="hab-body">
                    <div class="hab-icon">
                        <i class="fa-solid fa-hotel"></i> 
                    </div>
                    <div class="hab-footer-info">
                        <span class="hab-badge">${est}</span>
                        ${tieneReservaHoy && est === "Libre" 
                            ? '<div class="reserva-hoy-tag">⚠️ RESERVA PARA HOY</div>' 
                            : ''}
                    </div>
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

// --- 3. MODAL PARA INGRESO DIRECTO ---

async function modalCheckInDirecto(hab) {
    const hoy = getHoyISO();
    
    const { value: formValues } = await Swal.fire({
        title: `<div style="text-align:left; border-bottom: 2px solid var(--vino-tinto); padding-bottom:10px;">
                    <span style="font-family: var(--font-titles); color: var(--vino-tinto); font-size: 24px; font-weight: bold;">
                        <i class="fas fa-door-open"></i> Nueva Reserva Directa - Hab. ${hab.numero}
                    </span>
                </div>`,
        width: '1000px',
        showConfirmButton: false, 
        customClass: { popup: 'hotel-modal-custom' },
        html: `
            <form id="formCheckInDirecto" class="reserva-grid-compacto">
                
                <div class="reserva-header-section">Información del Huésped</div>
                <div class="grid-row">
                    <div class="f-group">
                        <label>DNI / PASSPORT</label>
                        <input type="text" id="resDoc" class="f-input highlight" required placeholder="Buscar...">
                    </div>
                    <div class="f-group span-2">
                        <label>Nombres y Apellidos</label>
                        <input type="text" id="resHuesped" class="f-input" required>
                    </div>
                    <div class="f-group">
                        <label>Nacimiento</label>
                        <input type="date" id="resNacimiento" class="f-input">
                    </div>
                </div>

                <div class="grid-row">
                    <div class="f-group"><label>Nacionalidad</label><input type="text" id="resNacionalidad" class="f-input"></div>
                    <div class="f-group"><label>Teléfono</label><input type="tel" id="resTelefono" class="f-input" required></div>
                    <div class="f-group span-2"><label>Correo Electrónico</label><input type="email" id="resCorreo" class="f-input"></div>
                </div>

                <div class="reserva-header-section">Detalles de la Estancia</div>
                <div class="grid-row">
                    <div class="f-group"><label>Habitación</label><input type="text" id="resHabitacion" class="f-input readonly" value="${hab.numero}" readonly></div>
                    <div class="f-group"><label>Check In</label><input type="date" id="resCheckIn" class="f-input readonly" value="${hoy}" readonly></div>
                    <div class="f-group"><label>Check Out</label><input type="date" id="resCheckOut" class="f-input" value="${hoy}"></div>
                    <div class="f-group">
                        <label>Medio de Reserva</label>
    <select id="resMedio" class="swal2-select" required>
        <option value="" disabled selected>Seleccione un medio...</option>
        <option value="personal">Personal</option>
        <option value="booking">Booking</option>
        <option value="expedia">Expedia</option>
        <option value="dayuse">Day Use</option>
        <option value="mantenimiento">Mantenimiento</option>
        <option value="gmail">Gmail</option>
        <option value="directas">Directas</option>
        <option value="airbnb">Airbnb</option>
    </select>
                    </div>
                </div>

                <div class="reserva-header-section">Tarifas y Extras</div>
                <div class="grid-row">
                    <div class="f-group"><label>N° Personas</label><input type="number" id="resPersonas" class="f-input" min="1" value="1"></div>
                    <div class="f-group"><label>Tarifa x Noche</label><input type="number" id="resTarifa" class="f-input" value="${hab.precio || 0}"></div>
                    <div class="f-group"><label>Total</label><input type="number" id="resTotal" class="f-input total-bold" value="${hab.precio || 0}"></div>
                    <div class="f-group"><label>Cochera</label><input type="text" id="resCochera" class="f-input" placeholder="No / Placa"></div>
                </div>

                <div class="grid-row">
                    <div class="f-group span-2"><label>Adelantos / Notas</label><input type="text" id="resAdelanto" class="f-input" placeholder="Ej: 50.00 Efectivo"></div>
                    <div class="f-group"><label>Desayuno</label>
                        <select id="resDesayuno" class="f-select">
                            <option value="SIN DESAYUNO" selected>Sin Desayuno</option>
                            <option value="CON DESAYUNO">Con Desayuno</option>
                        </select>
                    </div>
                    <div class="f-group"><label>Diferencia</label><input type="text" id="resDiferencia" class="f-input readonly alert" value="0.00" readonly></div>
                </div>

                <div class="reserva-footer">
                    <div style="font-size: 12px; color: #666; text-align: left;">
                        Registrado por: <input type="text" id="resRecepcion" required style="border:none; border-bottom:1px solid #ccc; outline:none; width:120px;">
                    </div>
                    <div class="botones">
                        <button type="button" id="btnCancelarCheckIn" class="btn-secundario">CANCELAR</button>
                        <button type="submit" class="btn-primario">CONFIRMAR INGRESO</button>
                    </div>
                </div>
            </form>
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

            // --- AUTOCOMPLETADO (Optimizado) ---
            docInput.addEventListener('blur', async () => {
                const dni = docInput.value.trim();
                if (dni.length < 3) return;
                try {
                    const docSnap = await getDoc(doc(db, "huespedes", dni));
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        document.getElementById('resHuesped').value = data.nombre || '';
                        document.getElementById('resTelefono').value = data.telefono || '';
                        document.getElementById('resCorreo').value = data.correo || '';
                        document.getElementById('resNacionalidad').value = data.nacionalidad || '';
                        document.getElementById('resNacimiento').value = data.nacimiento || '';
                        Swal.showValidationMessage('Huésped antiguo encontrado.');
                        setTimeout(() => Swal.resetValidationMessage(), 2000);
                    }
                } catch (e) { console.error(e); }
            });

            // --- CÁLCULOS (Optimizado) ---
            const realizarCalculos = () => {
                const f1 = new Date(inInput.value);
                const f2 = new Date(outInput.value);
                const tarifa = parseFloat(tarifaInput.value) || 0;
                
                let noches = Math.ceil((f2 - f1) / (1000 * 60 * 60 * 24));
                if (noches <= 0) noches = 1;
                
                const nuevoTotal = (noches * tarifa);
                totalInput.value = nuevoTotal.toFixed(2);

                const montoMatch = adelantoInput.value.match(/(\d+(\.\d+)?)/);
                const montoAdelanto = montoMatch ? parseFloat(montoMatch[0]) : 0;
                difInput.value = (nuevoTotal - montoAdelanto).toFixed(2);
            };

            [outInput, tarifaInput, adelantoInput].forEach(el => el.addEventListener('input', realizarCalculos));

            form.onsubmit = (e) => {
                e.preventDefault();
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
                    desayuno: document.getElementById('resDesayuno').value,
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

    // --- GUARDADO EN FIREBASE ---
    if (formValues) {
        try {
            await addDoc(collection(db, "reservas"), formValues);
            await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
            
            const dniHuesped = formValues.doc.toString().trim();
            if (dniHuesped) {
                await setDoc(doc(db, "huespedes", dniHuesped), {
                    nombre: formValues.huesped,
                    documento: dniHuesped,
                    telefono: formValues.telefono || "",
                    correo: formValues.correo || "",
                    nacionalidad: formValues.nacionalidad || "",
                    nacimiento: formValues.nacimiento || "",
                    ultimaVisita: hoy
                }, { merge: true });
            }
            Swal.fire({ icon: 'success', title: 'Ingreso Exitoso', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        } catch (error) {
            Swal.fire('Error', 'No se pudo registrar el ingreso', 'error');
        }
    }
}



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
        const f = new Date(item.fechaConsumo);
        const fechaAmigable = f.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + 
                             ` ${f.getHours()}:${f.getMinutes().toString().padStart(2, '0')}`;

        tablaCons += `
            <div class="consumo-item-lista">
                <div class="c-info">
                    <span class="c-qty">${item.cantidad}x</span>
                    <span class="c-name">${item.descripcion}</span>
                    <span class="c-date">${fechaAmigable}</span>
                </div>
                <div class="c-price">S/ ${parseFloat(item.precio).toFixed(2)}</div>
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


// --- 4. AGREGAR CONSUMO (ESTILO INTEGRADO) ---
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
            const totalItem = formValues.cant * formValues.precio;
            await addDoc(collection(db, "consumos"), {
                idReserva: resId,
                descripcion: formValues.desc.toUpperCase(), // Estandarizamos a mayúsculas
                cantidad: formValues.cant,
                precioUnitario: formValues.precio,
                precio: totalItem, 
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

// --- 5. CHECK-OUT (ESTILO ELITE) ---
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
            await updateDoc(doc(db, "reservas", resId), { estado: "finalizado" });
            await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Libre" });

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


// --- 6. FUNCIÓN DE IMPRESIÓN (FORMATO TICKET TÉRMICO) ---
function imprimirTicket(rData, consumos, totalConsumos, granTotal, metodoPago) {
    const ventana = window.open('', '_blank');
    const fechaActual = new Date().toLocaleString('es-PE');
    
    // Generar filas de consumos con formato compacto
    let filasConsumos = consumos.map(c => `
        <tr>
            <td style="padding: 2px 0; vertical-align: top;">${c.cantidad || 1}x ${c.descripcion}</td>
            <td style="text-align: right; vertical-align: top;">${parseFloat(c.precio).toFixed(2)}</td>
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
                    width: 280px; /* Optimizado para ticketera estándar */
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
                .title { font-size: 16px; margin-bottom: 2px; }
                .total-row { font-size: 14px; font-weight: bold; }
            </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 500);">
            <div class="text-center">
                <span class="bold title">HOTEL CENTRAL</span><br>
                <span style="font-size: 10px;">RUC: 20601852153</span><br>
                <span style="font-size: 10px;">Jr. Simon Bolivar 355 - Trujillo</span>
            </div>
            
            <div class="divider"></div>
            
            <div>
                <b>TICKET DE PAGO</b><br>
                Fecha: ${fechaActual}<br>
                Hab: ${rData.habitacion} [${rData.tipo || 'Hab'}]<br>
                Huésped: ${rData.huesped.toUpperCase()}
            </div>
            
            <div class="divider"></div>
            
            <table>
                <thead>
                    <tr>
                        <th align="left">CONCEPTO</th>
                        <th align="right">SUBT.</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 4px 0;">Estadía (${rData.checkIn} al ${rData.checkOut})</td>
                        <td class="text-right">${parseFloat(rData.total).toFixed(2)}</td>
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

            <div style="margin-top: 5px;">
                <span>Método de Pago: <b>${metodoPago || 'Efectivo'}</b></span>
            </div>
            
            <div class="divider"></div>
            
            <div class="text-center" style="font-size: 10px;">
                *** Gracias por su visita ***<br>
                Trujillo - La Libertad<br>
                <b>www.hotelcentral.com.pe</b>
            </div>
        </body>
        </html>
    `);
    ventana.document.close();
}
