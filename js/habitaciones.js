import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, where, addDoc, arrayUnion 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');
const searchHab = document.getElementById('searchHab');

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


// --- 2. GESTIÓN DE CLIC EN HABITACIÓN (CON ALERTA DE CONFLICTO) ---
async function gestionarHabitacion(hab) {
    const estadoActual = hab.estado || "Libre";

    if (estadoActual === "Libre" || estadoActual === "Sucia" || estadoActual.includes("Check-out")) {
        
        // 1. Verificar si hay reservas para hoy (para la alerta)
        const hoy = getHoyISO();
        const qReservasHoy = query(
            collection(db, "reservas"), 
            where("habitacion", "==", hab.numero.toString()),
            where("fechaIngreso", "==", hoy),
            where("estado", "==", "reservado")
        );
        const snapConflictos = await getDocs(qReservasHoy);
        const tieneReservaHoy = !snapConflictos.empty;

        // 2. Buscamos todas las reservas pendientes (para el selector)
        const qGeneral = query(
            collection(db, "reservas"), 
            where("habitacion", "==", hab.numero.toString()),
            where("estado", "==", "reservado")
        );
        const resSnap = await getDocs(qGeneral);
        
        if (!resSnap.empty) {
            const opciones = {};
            resSnap.forEach(doc => {
                const d = doc.data();
                opciones[doc.id] = `${d.huesped} [Entra: ${d.fechaIngreso}]`;
            });
            opciones["manual"] = "--- INGRESO DIRECTO (WALK-IN) ---";

            const { value: reservaId } = await Swal.fire({
                title: 'Gestión de Entrada',
                text: tieneReservaHoy ? '⚠️ ESTA HABITACIÓN TIENE UNA RESERVA PARA HOY.' : 'Seleccione una opción:',
                input: 'select',
                inputOptions: opciones,
                confirmButtonColor: '#5a1914',
                showCancelButton: true
            });

            if (reservaId === "manual") {
                confirmarIngresoManual(hab, tieneReservaHoy);
            } else if (reservaId) {
                const reservaDoc = resSnap.docs.find(d => d.id === reservaId);
                abrirModalCheckIn(hab, reservaId, reservaDoc.data());
            }
        } else {
            // Si no hay reservas pero quieres entrar manual
            confirmarIngresoManual(hab, tieneReservaHoy);
        }
    } else {
        abrirModalOcupada(hab);
    }
}

// Función auxiliar para la advertencia de Walk-in
async function confirmarIngresoManual(hab, conflicto) {
    if (conflicto) {
        const confirm = await Swal.fire({
            title: '¿Está seguro?',
            text: "Esta habitación está reservada para hoy. Si continúa, el huésped con reserva no tendrá habitación disponible.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, ingresar manual',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33'
        });
        if (!confirm.isConfirmed) return;
    }
    abrirModalCheckIn(hab, null, { huesped: "", documento: "", fechaSalida: getHoyISO() });
}

// --- 3. MODAL CHECK-IN (AJUSTADO PARA MANUAL Y RESERVA) ---
async function abrirModalCheckIn(hab, resId, rData) {
    const esManual = resId === null;

    Swal.fire({
        title: `<span style="font-family: 'Playfair Display', serif; color: #5a1914;">${esManual ? 'Check-in Directo' : 'Check-in Reserva'}: Hab. ${hab.numero}</span>`,
        width: '700px',
        html: `
            <div style="text-align: left; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; padding: 10px; font-family: 'Lato', sans-serif;">
                <div>
                    <label style="font-size: 11px; font-weight: bold;">HUÉSPED</label>
                    <input id="swal-huesped" class="swal2-input" style="width:100%; margin:5px 0;" value="${rData.huesped}" ${!esManual ? 'readonly' : ''} placeholder="Nombre del huésped">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold;">HABITACIÓN</label>
                    <input class="swal2-input" style="width:100%; margin:5px 0;" value="${hab.numero}" disabled>
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold;">DNI / PASAPORTE</label>
                    <input id="swal-doc" class="swal2-input" style="width:100%; margin:5px 0;" value="${rData.documento || ''}" placeholder="Ingrese documento">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold;">FECHA SALIDA PREVISTA</label>
                    <input id="swal-out" type="date" class="swal2-input" style="width:100%; margin:5px 0;" value="${rData.fechaSalida || ''}">
                </div>
            </div>
        `,
        confirmButtonText: 'CONFIRMAR ENTRADA',
        confirmButtonColor: '#5a1914',
        showCancelButton: true,
        preConfirm: () => {
            const h = document.getElementById('swal-huesped').value;
            const d = document.getElementById('swal-doc').value;
            const o = document.getElementById('swal-out').value;
            if (!h || !o) return Swal.showValidationMessage('Huésped y Fecha de Salida son obligatorios');
            return { h, d, o };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { h, d, o } = result.value;
            
            if (esManual) {
                // Crear nueva reserva directa
                await addDoc(collection(db, "reservas"), {
                    huesped: h,
                    documento: d,
                    habitacion: hab.numero.toString(),
                    fechaIngreso: getHoyISO(),
                    fechaSalida: o,
                    estado: "checkin",
                    consumo: 0,
                    detallesConsumo: [],
                    fechaCheckInReal: new Date().toISOString()
                });
            } else {
                // Actualizar reserva existente
                await updateDoc(doc(db, "reservas", resId), {
                    estado: "checkin",
                    documento: d,
                    fechaSalida: o,
                    consumo: 0,
                    detallesConsumo: [],
                    fechaCheckInReal: new Date().toISOString()
                });
            }
            
            await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
            Swal.fire('¡Éxito!', 'Habitación ocupada correctamente.', 'success');
        }
    });
}

// --- 4. MODAL GESTIÓN OCUPADA (CON DESGLOSE DE CONSUMO) ---
async function abrirModalOcupada(hab) {
    const q = query(collection(db, "reservas"), where("habitacion", "==", hab.numero.toString()), where("estado", "==", "checkin"));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const resDoc = snap.docs[0];
    const rData = resDoc.data();
    const listaExtras = rData.detallesConsumo || [];
    const totalC = Number(rData.consumo) || 0;

    // Construcción del HTML para el desglose
    let htmlDesglose = `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 15px;">
            <div style="background: #f1f5f9; padding: 8px 12px; display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0;">
                <span>DESCRIPCIÓN</span>
                <span>MONTO</span>
            </div>
            <div style="max-height: 150px; overflow-y: auto; background: white;">
    `;

    if (listaExtras.length > 0) {
        listaExtras.forEach(item => {
            const fechaItem = item.fecha ? new Date(item.fecha).toLocaleDateString() : '';
            htmlDesglose += `
                <div style="display:flex; justify-content:space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                    <div>
                        <div style="font-weight: 600; color: #1e293b;">${item.descripcion}</div>
                        <div style="font-size: 10px; color: #94a3b8;">${fechaItem}</div>
                    </div>
                    <b style="color: #5a1914;">S/ ${item.monto.toFixed(2)}</b>
                </div>`;
        });
    } else {
        htmlDesglose += `<p style="padding: 15px; font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Sin consumos extras.</p>`;
    }
    htmlDesglose += `</div></div>`;

    Swal.fire({
        title: `<span style="font-family: 'Playfair Display'; color: #5a1914;">Gestión Hab. ${hab.numero}</span>`,
        width: '500px',
        html: `
            <div style="text-align: left; font-family: 'Lato', sans-serif;">
                <p style="margin-bottom: 15px;"><b>Huésped:</b> ${rData.huesped}</p>
                <h4 style="font-size: 13px; color: #5a1914; margin-bottom: 8px;">DESGLOSE DE CONSUMOS</h4>
                ${htmlDesglose}
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #fff1f0; border-radius: 8px; border: 1px solid #ffa39e; margin-bottom: 15px;">
                    <b style="color: #5a1914; font-size: 13px;">TOTAL ACUMULADO:</b>
                    <b style="font-size: 18px; color: #cf1322;">S/ ${totalC.toFixed(2)}</b>
                </div>
                <button id="btnSumar" class="swal2-confirm swal2-styled" style="width: 100%; margin: 0; background-color: #5a1914; border-radius: 6px;">+ AÑADIR PRODUCTO</button>
            </div>
        `,
        showDenyButton: true,
        confirmButtonText: 'Cerrar',
        denyButtonText: 'Procesar Check-out',
        denyButtonColor: '#444',
        didOpen: () => {
            document.getElementById('btnSumar').onclick = () => añadirExtra(resDoc.id, totalC);
        }
    }).then((result) => {
        if (result.isDenied) {
            procesarCheckOutAutomatico(resDoc.id, hab.id, hab.numero, totalC, rData);
        }
    });
}

// --- 5. FUNCIÓN CHECK-OUT AUTOMÁTICO ---
async function procesarCheckOutAutomatico(resId, habId, habNumero, totalExtras, rData) {
    const ahora = new Date();
    const fechaSalidaPrevista = new Date(`${rData.fechaSalida}T12:00:00`);
    
    let estadoAuto = "Libre";
    let subMensaje = "Salida a tiempo.";

    if (ahora < fechaSalidaPrevista) {
        estadoAuto = "Early Check-out";
        subMensaje = "Salida anticipada detectada.";
    } else {
        const margen = new Date(fechaSalidaPrevista.getTime() + (60 * 60 * 1000));
        if (ahora > margen) {
            estadoAuto = "Late Check-out";
            subMensaje = "Salida después del horario límite.";
        }
    }

    const { value: decision } = await Swal.fire({
        title: 'Finalizar Estancia',
        html: `
            <div style="text-align: left; font-family: 'Lato', sans-serif; font-size: 14px;">
                <p><b>Estado detectado:</b> ${estadoAuto}</p>
                <p style="color:#666; font-size:12px;">${subMensaje}</p>
                <hr>
                <p><b>Total Extras:</b> S/ ${totalExtras.toFixed(2)}</p>
                <hr>
                <label style="font-weight:bold; font-size:12px;">¿Cómo dejar la habitación?</label>
            </div>
        `,
        input: 'select',
        inputOptions: {
            [estadoAuto]: `Marcar como ${estadoAuto}`,
            'Sucia': 'Enviar a Limpieza (Sucia)',
            'Libre': 'Libre Inmediatamente'
        },
        showCancelButton: true,
        confirmButtonText: 'Confirmar Salida',
        confirmButtonColor: '#5a1914'
    });

    if (decision) {
        try {
            await updateDoc(doc(db, "reservas", resId), { 
                fechaCheckOutReal: ahora.toISOString(),
                tipoSalida: estadoAuto,
                totalExtrasCobrados: totalExtras
            });
            await updateDoc(doc(db, "habitaciones", habId), { estado: decision });
            Swal.fire('Completado', `La habitación ${habNumero} ahora está ${decision}`, 'success');
        } catch (e) {
            console.error(e);
        }
    }
}

// --- 6. AGREGAR EXTRA ---
async function añadirExtra(resId, totalActual) {
    const { value: formValues } = await Swal.fire({
        title: 'Registrar Nuevo Consumo',
        html: `
            <input id="ex-desc" class="swal2-input" placeholder="Producto/Servicio">
            <input id="ex-monto" type="number" class="swal2-input" placeholder="Precio S/">
        `,
        preConfirm: () => {
            const d = document.getElementById('ex-desc').value;
            const m = document.getElementById('ex-monto').value;
            if(!d || !m) return Swal.showValidationMessage('Complete todos los campos');
            return { d, m: parseFloat(m) };
        }
    });

    if (formValues) {
        await updateDoc(doc(db, "reservas", resId), {
            consumo: totalActual + formValues.m,
            detallesConsumo: arrayUnion({ 
                descripcion: formValues.d, 
                monto: formValues.m, 
                fecha: new Date().toISOString() 
            })
        });
        Swal.fire('Añadido', '', 'success');
    }
}

// --- 7. RENDERIZADO PRINCIPAL ---
function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"));
    const hoy = getHoyISO();

    onSnapshot(qHabs, async (snapshot) => {
        if (!habGrid) return;
        habGrid.innerHTML = '';
        let libres = 0, ocupadas = 0;
        
        const qReservasHoy = query(collection(db, "reservas"), where("fechaIngreso", "==", hoy), where("estado", "==", "reservado"));
        const snapReservas = await getDocs(qReservasHoy);
        const habsReservadasHoy = snapReservas.docs.map(d => d.data().habitacion);

        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => a.numero - b.numero);

        docs.forEach((hab) => {
            const estadoHab = hab.estado || "Libre";
            const estaReservada = habsReservadasHoy.includes(hab.numero.toString());

            if (estadoHab === "Libre") libres++; else ocupadas++;

            const card = document.createElement('div');
            card.className = `hab-card ${estadoHab.toLowerCase().replace(/\s+/g, '-')}`;
            
            card.innerHTML = `
                <div class="hab-header">
                    <span class="hab-number">${hab.numero}</span>
                    <span class="hab-badge">${estadoHab}</span>
                </div>
                <div class="hab-body">
                    <p><i class="fa-solid fa-layer-group"></i> Piso ${hab.piso}</p>
                    <p><i class="fa-solid fa-tags"></i> ${hab.tipo}</p>
                    ${estaReservada && (estadoHab === "Libre" || estadoHab === "Sucia" || estadoHab.includes("Check-out")) ? 
                        `<p style="color: #5a1914; font-weight: bold; font-size: 11px; margin-top: 10px;">
                            <i class="fa-solid fa-calendar-check"></i> RESERVADA PARA HOY
                        </p>` : ''}
                </div>
                <div class="hab-footer" style="text-align:center; font-size:10px; font-weight:bold; color:${estadoHab==='Ocupada'?'#ef6c00':'#2e7d32'}">
                    ${estadoHab === 'Ocupada' ? 'VER GESTIÓN / EXTRAS' : 'GESTIONAR ENTRADA'}
                </div>
            `;

            card.onclick = () => gestionarHabitacion(hab);
            habGrid.appendChild(card);
        });
        actualizarMiniStats(docs.length, libres, ocupadas);
    });
}

function actualizarMiniStats(total, libres, ocupadas) {
    if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = total;
    if(document.getElementById('stat-libres')) document.getElementById('stat-libres').innerText = libres;
    if(document.getElementById('stat-ocupadas')) document.getElementById('stat-ocupadas').innerText = ocupadas;
}