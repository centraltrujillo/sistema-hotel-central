import { db } from './firebaseconfig.js';
import { 
    collection, getDocs, onSnapshot, doc, updateDoc, query, where, addDoc, increment, setDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let calendar;

document.addEventListener('DOMContentLoaded', async () => {
    const calendarEl = document.getElementById('gantt_here');
    
    // --- 1. DECLARACIONES INICIALES (EVITA ERRORES DE REFERENCIA) ---
    const formulario = document.getElementById('formNuevaReserva');
    const inputCheckIn = document.getElementById("resCheckIn");
    const inputCheckOut = document.getElementById("resCheckOut");
    const inputTarifa = document.getElementById("resTarifa");
    const inputTipoCambio = document.getElementById("resTipoCambio");
    const selectMoneda = document.getElementById("resMoneda");
    const inputTotal = document.getElementById("resTotal");
    const inputAdelantoMonto = document.getElementById("resAdelantoMonto");
    const inputDiferencia = document.getElementById("resDiferencia");
    const inputDoc = document.getElementById("resDoc");

    // --- 2. LÓGICA DE CÁLCULOS ---
    const calcularMontos = () => {
        if (!inputCheckIn.value || !inputCheckOut.value) return;

        const fIn = new Date(inputCheckIn.value + 'T00:00:00');
        const fOut = new Date(inputCheckOut.value + 'T00:00:00');
        const tarifaBase = parseFloat(inputTarifa.value) || 0;
        const tc = parseFloat(inputTipoCambio.value) || 1;
        const moneda = selectMoneda.value;

        const tieneEarly = document.getElementById("resEarly").value !== "";
        const tieneLate = document.getElementById("resLate").value !== "";

        if (fOut <= fIn) {
            inputTotal.value = "0.00";
            inputDiferencia.value = "0.00";
            return;
        }

        const noches = Math.round((fOut - fIn) / (1000 * 60 * 60 * 24));
        let subtotal = (noches === 0) ? tarifaBase : noches * tarifaBase;

        if (tieneEarly) subtotal += (tarifaBase * 0.5);
        if (tieneLate) subtotal += (tarifaBase * 0.5);

        let totalFinal = moneda === "USD" ? subtotal * tc : subtotal;
        inputTotal.value = totalFinal.toFixed(2);

        let adelanto = parseFloat(inputAdelantoMonto.value) || 0;
        if (adelanto > totalFinal && totalFinal > 0) {
            adelanto = totalFinal;
            inputAdelantoMonto.value = totalFinal.toFixed(2);
        }
        inputDiferencia.value = (totalFinal - adelanto).toFixed(2);
    };

    // --- 3. VERIFICACIÓN DE DISPONIBILIDAD (REAL TIME) ---
    const verificarDisponibilidadRealTime = async () => {
        const hab = document.getElementById("resHabitacion").value;
        const fIn = inputCheckIn.value;
        const fOut = inputCheckOut.value;
        const statusDiv = document.getElementById("statusDisponibilidad");
        const btnGuardar = formulario.querySelector('button[type="submit"]');
        const editId = formulario.dataset.editId;

        if (!hab || !fIn || !fOut) {
            if (statusDiv) statusDiv.innerHTML = "";
            if (btnGuardar) btnGuardar.disabled = false;
            return;
        }

        try {
            const q = query(collection(db, "reservas"), where("habitacion", "==", hab));
            const snap = await getDocs(q);
            let ocupado = false;

            snap.forEach(docSnap => {
                const res = docSnap.data();
                if (editId && docSnap.id === editId) return;
                if (fIn < res.checkOut && fOut > res.checkIn) ocupado = true;
            });

            if (statusDiv) {
                if (ocupado) {
                    statusDiv.innerHTML = "✖ Habitación ocupada";
                    statusDiv.style.color = "#f43f5e";
                    btnGuardar.disabled = true;
                } else {
                    statusDiv.innerHTML = "✔ Disponible";
                    statusDiv.style.color = "#10b981";
                    btnGuardar.disabled = false;
                }
            }
        } catch (e) { console.error("Error disponibilidad:", e); }
    };

    // --- 4. AUTOCOMPLETADO POR DNI ---
    if (inputDoc) {
        inputDoc.addEventListener("blur", async (e) => {
            const dni = e.target.value.trim();
            if (dni.length < 4) return;
            const q = query(collection(db, "huespedes"), where("documento", "==", dni));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const h = snap.docs[0].data();
                document.getElementById("resHuesped").value = h.nombre || "";
                document.getElementById("resTelefono").value = h.telefono || "";
                document.getElementById("resCorreo").value = h.correo || "";
                document.getElementById("resNacionalidad").value = h.nacionalidad || "";
                document.getElementById("resNacimiento").value = h.nacimiento || "";
            }
        });
    }

    // --- 5. GUARDAR / ACTUALIZAR (FUNCIÓN ÚNICA) ---
    if (formulario) {
        formulario.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = formulario.dataset.editId;
            
            const datosReserva = {
                huesped: document.getElementById("resHuesped").value,
                doc: inputDoc.value.trim(),
                telefono: document.getElementById("resTelefono").value,
                nacionalidad: document.getElementById("resNacionalidad").value,
                nacimiento: document.getElementById("resNacimiento").value,
                correo: document.getElementById("resCorreo").value,
                habitacion: document.getElementById("resHabitacion").value,
                checkIn: inputCheckIn.value,
                checkOut: inputCheckOut.value,
                medio: document.getElementById("resMedio").value,
                personas: parseInt(document.getElementById("resPersonas").value) || 1,
                desayuno: document.getElementById("resInfo").value,
                early: document.getElementById("resEarly").value,
                late: document.getElementById("resLate").value,
                cochera: document.getElementById("resCochera").value,
                traslado: document.getElementById("resTraslado").value,
                tarifa: Number(inputTarifa.value) || 0,
                moneda: selectMoneda.value,
                tipoCambio: Number(inputTipoCambio.value) || 1,
                total: Number(inputTotal.value) || 0,
                adelantoMonto: Number(inputAdelantoMonto.value) || 0,
                adelantoDetalle: document.getElementById("resAdelantoDetalle").value,
                diferencia: Number(inputDiferencia.value) || 0,
                observaciones: document.getElementById("resObservaciones").value,
                recepcion: document.getElementById("resRecepcion").value,
                recepcionconfi: document.getElementById("resRecepcionconfi").value,
                estado: "reservada",
                fechaRegistro: editId ? (formulario.dataset.fechaReg || new Date().toISOString()) : new Date().toISOString()
            };

            try {
                if (editId) {
                    await updateDoc(doc(db, "reservas", editId), datosReserva);
                } else {
                    await addDoc(collection(db, "reservas"), datosReserva);
                }

                // Sync Huésped
                if (datosReserva.doc !== "") {
                    const hRef = doc(db, "huespedes", datosReserva.doc);
                    await setDoc(hRef, {
                        nombre: datosReserva.huesped.toUpperCase(),
                        documento: datosReserva.doc,
                        telefono: datosReserva.telefono,
                        correo: datosReserva.correo,
                        nacionalidad: datosReserva.nacionalidad,
                        nacimiento: datosReserva.nacimiento,
                        ultimaVisita: new Date().toISOString()
                    }, { merge: true });
                }

                Swal.fire('¡Éxito!', 'Operación completada', 'success');
                formulario.reset();
                delete formulario.dataset.editId;
                window.cerrarModal();
            } catch (error) {
                console.error("Error al guardar:", error);
                Swal.fire('Error', 'No se pudo guardar la reserva', 'error');
            }
        });
    }

    // --- 6. LISTENERS PARA CÁLCULOS Y DISPONIBILIDAD ---
    [inputTarifa, inputCheckIn, inputCheckOut, inputAdelantoMonto, inputTipoCambio, selectMoneda, 
     document.getElementById("resEarly"), document.getElementById("resLate")].forEach(el => {
        if(el) el.addEventListener("input", () => {
            calcularMontos();
            verificarDisponibilidadRealTime(); // Verifica mientras cambian fechas
        });
    });

    document.getElementById("resHabitacion").addEventListener("change", verificarDisponibilidadRealTime);


// 2. INICIALIZA EL CALENDARIO (Sin el 'const' adelante)
calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'resourceTimelineMonth',
    height: 'parent',
    contentHeight: 'auto',
    expandRows: true,
    resourceAreaWidth: '220px',
    stickyHeaderDates: true,
    handleWindowResize: true,
    resourceOrder: 'index',
    eventOverlap: false, // Evita que un evento se dibuje encima de otro
    eventDisplay: 'block', // Fuerza a que ocupen su propio bloque


locale: 'es', 
    
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            day: 'Día',
            resourceTimelineMonth: 'Mes',
            resourceTimelineDay: 'Día'
        },
    
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'resourceTimelineMonth,resourceTimelineDay'
        },

        // --- CORRECCIÓN DE FECHAS DESAPARECIDAS ---
        slotLabelFormat: [
            { month: 'long', year: 'numeric' }, // Línea 1: abril de 2026
            { weekday: 'short', day: 'numeric' } // Línea 2: L 1, M 2...
        ],

        resourceAreaHeaderContent: 'HABITACIONES',

        slotLabelContent: function(arg) {
            if (arg.level > 0) {
                return { 
                    html: `<div style="font-size: 11px; font-weight: 700; color: #475569; padding: 5px 0;">${arg.text}</div>` 
                };
            }
        },

        // --- CORRECCIÓN AQUÍ: Dejamos la celda limpia ---
        resourceLaneContent: function(arg) {
            if (arg.resource.id === 'total-row') {
                return; // No escribimos nada aquí, dejaremos que el evento lo haga
            }
        },

        // --- AGREGA ESTO: Para que el número del total y el texto se vean bien ---
        eventContent: function(arg) {
            if (arg.event.extendedProps.esTotal) {
                return { 
                    html: `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #6e0d25; font-size: 16px; padding-top: 4px;">
                    ${arg.event.title}
                    </div>` 
                };
            }
            // Para el resto de eventos (reservas, early, late)
            return { html: `<div style="padding: 2px; font-size: 11px;">${arg.event.title}</div>` };
        },

        eventClick: function(info) {
            if (info.event.extendedProps.esTotal) return;

            const r = info.event.extendedProps; 
            const idReserva = info.event.id;

            // --- 1. DEFINICIÓN DE COLORES POR ESTADO ---
    const estadoLimpio = (r.estado || 'reservada').toLowerCase();
    
    const configEstados = {
        'reservada': { bg: '#16a34a', text: '#ffffff', border: 'none' },    // VERDE
        'checkin':   { bg: '#D4AF37', text: '#ffffff', border: 'none' },    // DORADO (Ocre/Oro)
        'checkout':  { bg: '#ffffff', text: '#6e0d25', border: '1px solid #cbd5e1' } // BLANCO con texto Vino y borde
    };

    // Obtenemos la configuración según el estado actual (si no existe, usa reservada por defecto)
    const estilo = configEstados[estadoLimpio] || configEstados['reservada'];
        
// --- LANZAR EL MODAL ---
Swal.fire({
    title: `
    <div class="modal-header-gestion" style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 10px 0; border-bottom: 2px solid #D4AF37;">
    <div style="text-align: left;">
        <span style="background: #6e0d25; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 800;">HABITACIÓN ${r.habitacion}</span>
    </div>
    <div style="background: ${estilo.bg}; color: ${estilo.text}; border: ${estilo.border}; padding: 4px 15px; border-radius: 8px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
        ${estadoLimpio}
    </div>
</div>`,
    width: '900px',
    background: '#f8fafc',
    html: `
        <div class="gestion-container" style="text-align: left; font-family: 'Segoe UI', sans-serif;">
            <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px;">
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;"><i class="fas fa-user-circle"></i> Huésped Titular</label>
                        <p style="margin: 5px 0; font-size: 18px; font-weight: 700; color: #1e293b;">${r.huesped}</p>
                        <p style="margin: 0; font-size: 12px; color: #64748b;">${r.doc} • ${r.nacionalidad || 'Peruana'}</p>
                    </div>
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;"><i class="fas fa-phone"></i> Contacto</label>
                        <p style="margin: 5px 0; font-size: 13px;">${r.telefono || '-'}</p>
                        <p style="margin: 0; font-size: 11px; color: #64748b;">${r.correo || 'Sin correo'}</p>
                    </div>
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;"><i class="fas fa-concierge-bell"></i> Medio</label>
                        <p style="margin: 5px 0;"><span style="background: #6e0d25; color: white; padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: 800;">${(r.medio || 'Directo').toUpperCase()}</span></p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; padding-top: 15px;">
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #64748b;">CHECK-IN</label>
                        <p style="margin: 5px 0; font-weight: 700;">${r.checkIn}</p>
                        <small style="color: #475569;">Hora: ${r.early || 'Normal'}</small>
                    </div>
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #64748b;">CHECK-OUT</label>
                        <p style="margin: 5px 0; font-weight: 700; color: #800020;">${r.checkOut}</p>
                        <small style="color: #475569;">Hora: ${r.late || 'Normal'}</small>
                    </div>
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #64748b;">PAX & COCHERA</label>
                        <p style="margin: 5px 0; font-size: 13px;">${r.personas} Adultos</p>
                        <small style="color: #64748b;">Cochera: <b>${r.cochera || 'No'}</b></small>
                    </div>
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #64748b;">ALIMENTACIÓN</label>
                        <p style="margin: 5px 0; font-size: 13px;">${r.desayuno || 'S/D'}</p>
                        <small style="color: #64748b;">Traslado: ${r.traslado || 'No'}</small>
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center; background: #fffbeb; border: 1px dashed #D4AF37; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                <div>
                    <label style="font-size: 10px; font-weight: 800; color: #92400e;">TARIFA BASE</label>
                    <p style="margin: 5px 0; font-weight: 700;">${r.moneda} ${r.tarifa}</p>
                </div>
                <div>
                    <label style="font-size: 10px; font-weight: 800; color: #92400e;">TOTAL ALOJAMIENTO</label>
                    <p style="margin: 5px 0; font-weight: 800; font-size: 16px;">S/ ${parseFloat(r.total).toFixed(2)}</p>
                </div>
                <div>
                    <label style="font-size: 10px; font-weight: 800; color: #16a34a;">PAGOS / ADELANTOS</label>
                    <p style="margin: 5px 0; font-weight: 700; color: #16a34a;">- S/ ${parseFloat(r.adelantoMonto || 0).toFixed(2)}</p>
                </div>
                <div>
                    <label style="font-size: 10px; font-weight: 800; color: #800020;">SALDO PENDIENTE</label>
                    <p style="margin: 5px 0; font-weight: 800; font-size: 18px; color: #800020;">S/ ${parseFloat(r.diferencia || 0).toFixed(2)}</p>
                </div>
            </div>

            <div style="background: #f1f5f9; padding: 15px; border-radius: 8px;">
                <label style="font-size: 10px; font-weight: 800; color: #475569;"><i class="fas fa-comment-dots"></i> OBSERVACIONES:</label>
                <p style="margin: 5px 0; font-size: 12px; color: #1e293b; font-style: italic;">${r.observaciones ? `"${r.observaciones}"` : 'Sin notas adicionales.'}</p>
                <div style="display: flex; justify-content: space-between; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 5px; font-size: 10px; color: #94a3b8;">
                    <span><b>Registrado por:</b> ${r.recepcion || 'Sistema'}</span>
                    <span><b>Confirmado por:</b> ${r.recepcionconfi || '-'}</span>
                </div>
            </div>

            <div style="text-align: center; margin-top: 20px;">
                <button onclick="Swal.close()" style="background: #64748b; color: white; border: none; padding: 12px 40px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px;">
                    CERRAR VISTA
                </button>
            </div>
        </div>
    `,
    showConfirmButton: false,
    showCloseButton: true
});
        },

        resourceLabelContent: function(arg) {
            let tipo = arg.resource.extendedProps.tipo || '';
            const isTotalRow = arg.resource.id === 'total-row';
            return {
                html: `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding: 0 5px; ${isTotalRow ? 'color:#6e0d25;' : ''}">
                        <b style="font-size:13px;">${arg.resource.title}</b>
                        <span style="font-size:10px; color:#666; text-transform:uppercase;">${tipo}</span>
                       </div>`
            };
        },
        resources: [], 
        events: [],
        eventAllow: function(dropInfo, draggedEvent) {
            return dropInfo.resource.id !== 'total-row';
        }
    });

    const cargarHabitaciones = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "habitaciones"));
            const selectHab = document.getElementById('resHabitacion');
            if (selectHab) selectHab.innerHTML = '<option value="" disabled selected>Seleccione...</option>';
    
            let listaHabitaciones = querySnapshot.docs.map(doc => {
                const data = doc.data();
                if (selectHab) {
                    const option = document.createElement('option');
                    option.value = data.numero; 
                    option.textContent = `Hab. ${data.numero} - ${data.tipo}`;
                    selectHab.appendChild(option);
                }
                return {
                    id: `hab${data.numero}`, 
                    title: data.numero.toString(), 
                    tipo: data.tipo 
                };
            });
            
            // Ordenamos habitaciones numéricamente
            listaHabitaciones.sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));
    
            // Definimos los extras y el total
            const extras = [
                { id: 'extra1', title: 'CHECK OL 1' },
                { id: 'extra2', title: 'CHECK OL 2' },
                { id: 'extra3', title: 'CHECK OL 3' }

            ];
    
            const filaTotal = [{ id: 'total-row', title: 'TOTAL OCUP' }];
    
            // IMPORTANTE: Unimos en este orden exacto
            const recursosFinales = [...listaHabitaciones, ...extras, ...filaTotal];
            
            calendar.setOption('resources', recursosFinales);
    
        } catch (error) {
            console.error("Error en cargarHabitaciones:", error);
        }
    };


    const escucharReservas = () => {
        onSnapshot(collection(db, "reservas"), (snapshot) => {
            const eventosFinales = [];
            const conteoOcupacion = {}; 
    
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const idReserva = doc.id;
                
                const colores = { 
                    'booking': '#1e40af', 'airbnb': '#ff5a5f', 'expedia': '#ffb400', 
                    'directas': '#7c3aed', 'personal': '#059669', 'gmail': '#ea4335', 'dayuse': '#db2777' 
                };
    
                let colorFinal = colores[data.medio?.toLowerCase()] || '#555';
                let textoNombre = data.huesped || 'Sin nombre';
                let colorTexto = '#ffffff'; 
                let colorBorde = 'transparent';
    
                if (data.estado === 'checkin' || data.estado === 'checkout') {
                    colorFinal = '#ffffff';
                    colorTexto = '#000000'; 
                    colorBorde = '#cbd5e1';
                    textoNombre = `✅ ${textoNombre}`; 
                }
    
                const esDayUse = data.medio?.toLowerCase() === 'dayuse' || data.tipoVenta?.toLowerCase() === 'day use';
    
                const registrarOcupacion = (fechaISO) => {
                    if (!fechaISO) return;
                    conteoOcupacion[fechaISO] = (conteoOcupacion[fechaISO] || 0) + 1;
                };
    
                // 1. EVENTO PRINCIPAL (Suma +1)
                eventosFinales.push({
                    id: idReserva,
                    resourceId: `hab${data.habitacion}`, 
                    title: textoNombre,
                    start: esDayUse ? `${data.checkIn}T08:00:00` : data.checkIn,
                    end: esDayUse ? `${data.checkIn}T20:00:00` : data.checkOut,
                    backgroundColor: colorFinal,
                    textColor: colorTexto,
                    borderColor: colorBorde,
                    allDay: !esDayUse,
                    extendedProps: { ...data }
                });
    
                // Lógica de conteo de estancia
                let fActual = new Date(data.checkIn + "T00:00:00");
                let fFin = new Date(data.checkOut + "T00:00:00");
                
                if (esDayUse) {
                    registrarOcupacion(data.checkIn); // La habitación física
                } else {
                    while (fActual < fFin) {
                        registrarOcupacion(fActual.toISOString().split('T')[0]);
                        fActual.setDate(fActual.getDate() + 1);
                    }
                }
    
                // 2. LATE CHECK-OUT (Suma +1 extra al día de salida)
                if (data.late && data.late !== "Normal" && !esDayUse) {
                    registrarOcupacion(data.checkOut);
                    const horaLate = data.late.includes(':') ? data.late : "15:00";
                    eventosFinales.push({
                        id: idReserva + '_late',
                        resourceId: 'extra1', 
                        title: `LATE H-${data.habitacion} (${horaLate})`,
                        start: `${data.checkOut}T12:00:00`, 
                        end: `${data.checkOut}T${horaLate}:00`,
                        backgroundColor: '#d9f99d',
                        textColor: '#166534',
                        allDay: false, 
                        extendedProps: { ...data, esExtra: true }
                    });
                }
    
                // 3. EARLY CHECK-IN (Suma +1 extra al día de entrada)
                if (data.early && data.early !== "Normal" && !esDayUse) {
                    registrarOcupacion(data.checkIn);
                    const horaEarly = data.early.includes(':') ? data.early : "08:00";
                    eventosFinales.push({
                        id: idReserva + '_early',
                        resourceId: 'extra2', 
                        title: `EARLY H-${data.habitacion} (${horaEarly})`,
                        start: `${data.checkIn}T${horaEarly}:00`, 
                        end: `${data.checkIn}T13:00:00`,
                        backgroundColor: '#bae6fd',
                        textColor: '#0369a1',
                        allDay: false, 
                        extendedProps: { ...data, esExtra: true }
                    });
                }
                    
                // 4. DAY USE (Suma +1 ADICIONAL al de la habitación = TOTAL 2)
                if (esDayUse) {
                    registrarOcupacion(data.checkIn); // El segundo punto por ser Day Use
                    const hEntrada = (data.early && data.early !== "Normal") ? data.early : "09:00";
                    const hSalida = (data.late && data.late !== "Normal") ? data.late : "18:00";
                    eventosFinales.push({
                        id: idReserva + '_dayuse',
                        resourceId: 'extra3', 
                        title: `DAY USE H-${data.habitacion} (${hEntrada}-${hSalida})`,
                        start: `${data.checkIn}T${hEntrada}:00`,
                        end: `${data.checkIn}T${hSalida}:00`,
                        backgroundColor: '#fef3c7',
                        textColor: '#92400e',
                        allDay: false,
                        extendedProps: { ...data, esExtra: true }
                    });
                }
            });
    
            // 5. RENDERIZAR TOTALES
            Object.keys(conteoOcupacion).forEach(fecha => {
                eventosFinales.push({
                    resourceId: 'total-row',
                    title: conteoOcupacion[fecha].toString(),
                    start: fecha,
                    end: fecha,
                    allDay: true,
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    extendedProps: { esTotal: true }
                });
            });
    
            calendar.setOption('events', eventosFinales);
        });
    };


// --- FUNCIONES GLOBALES ---
window.abrirModal = () => { 
    const form = document.getElementById('formNuevaReserva');
    form.reset(); 
    delete form.dataset.editId; // IMPORTANTE
    document.getElementById('modalTitle').innerText = "Nueva Reserva";
    document.getElementById('modalReserva').classList.add('active'); 
};

window.cerrarModal = () => { document.getElementById('modalReserva').classList.remove('active'); };

    calendar.render(); // 1. Dibuja el calendario vacío en el HTML
    
    // 2. Ejecuta las funciones que traen la data de Firebase
    try {
        await cargarHabitaciones(); // Carga las filas (Habitaciones + Extras + Total)
        escucharReservas();        // Empieza a escuchar los eventos en tiempo real
        console.log("Rack inicializado correctamente");
    } catch (err) {
        console.error("Error al inicializar el Rack:", err);
    }

});

