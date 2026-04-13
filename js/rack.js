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
                earlyCheckIn: document.getElementById("resEarly").value,
                lateCheckOut: document.getElementById("resLate").value,
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
                recibidoPor: document.getElementById("resRecepcion").value,
                confirmadoPor: document.getElementById("resRecepcionconfi").value,
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
        
            Swal.fire({
                title: `
                    <div class="modal-header-gestion" style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 10px 0; border-bottom: 2px solid #D4AF37;">
                        <div style="text-align: left;">
                            <span style="background: #6e0d25; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 800;">HABITACIÓN ${r.habitacion}</span>
                        </div>
                        <div style="background: #16a34a; color: white; padding: 4px 15px; border-radius: 8px; font-size: 12px; font-weight: bold;">${(r.estado || 'RESERVADA').toUpperCase()}</div>
                    </div>`,
                width: '900px',
                background: '#f8fafc',
                html: `
                    <div style="padding: 10px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 20px; text-align: left; background: white; padding: 15px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 15px;">
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;"><i class="fas fa-user"></i> Huésped Titular</label>
                                <p style="margin: 5px 0; font-size: 16px; font-weight: 700; color: #1e293b;">${r.huesped}</p>
                                <p style="margin: 0; font-size: 12px; color: #64748b;">${r.doc} • ${r.nacionalidad || 'Peruana'}</p>
                            </div>
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;"><i class="fas fa-phone"></i> Contacto</label>
                                <p style="margin: 5px 0; font-size: 13px;">${r.telefono || '-'}</p>
                                <p style="margin: 0; font-size: 11px; color: #64748b;">${r.correo || 'Sin correo'}</p>
                            </div>
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;"><i class="fas fa-tag"></i> Origen</label>
                                <p style="margin: 5px 0;"><span style="background: #e2e8f0; padding: 4px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; color: #475569;">${(r.medio || 'Directo').toUpperCase()}</span></p>
                            </div>
                        </div>
        
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; text-align: left; background: white; padding: 15px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 15px;">
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">Check-In</label>
                                <p style="margin: 5px 0; font-weight: 700;">${r.checkIn}</p>
                                <small style="color: #64748b;">Hora: ${r.early || 'Normal'}</small>
                            </div>
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">Check-Out</label>
                                <p style="margin: 5px 0; font-weight: 700; color: #800020;">${r.checkOut}</p>
                                <small style="color: #64748b;">Hora: ${r.late || 'Normal'}</small>
                            </div>
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">Pax & Cochera</label>
                                <p style="margin: 5px 0; font-size: 13px;">${r.personas} Adultos</p>
                                <small style="color: #64748b;">Cochera: <b>${r.cochera || 'No'}</b></small>
                            </div>
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">Servicios</label>
                                <p style="margin: 5px 0; font-size: 13px;">${r.desayuno || 'S/D'}</p>
                                <small style="color: #64748b;">Traslado: ${r.traslado || 'No'}</small>
                            </div>
                        </div>
        
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center; background: #fffbeb; border: 1px dashed #D4AF37; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #92400e;">TARIFA DÍA</label>
                                <p style="margin: 5px 0; font-weight: 700;">${r.moneda} ${r.tarifa}</p>
                            </div>
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #92400e;">TOTAL HOSPEDAJE</label>
                                <p style="margin: 5px 0; font-weight: 800; font-size: 16px;">S/ ${parseFloat(r.total).toFixed(2)}</p>
                            </div>
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #16a34a;">ADELANTOS</label>
                                <p style="margin: 5px 0; font-weight: 700; color: #16a34a;">- S/ ${parseFloat(r.adelantoMonto || 0).toFixed(2)}</p>
                            </div>
                            <div>
                                <label style="font-size: 10px; font-weight: 800; color: #800020;">SALDO PENDIENTE</label>
                                <p style="margin: 5px 0; font-weight: 800; font-size: 18px; color: #800020;">S/ ${parseFloat(r.diferencia || 0).toFixed(2)}</p>
                            </div>
                        </div>
        
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; padding: 0 10px;">
                            <span><b>Obs:</b> ${r.observaciones || 'Sin notas'}</span>
                            <span><b>Registrado por:</b> ${r.recibidoPor || 'Sistema'}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: center; gap: 12px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                        <button onclick="window.editarReserva('${idReserva}')" style="background: #64748b; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 12px;"><i class="fas fa-edit"></i> EDITAR</button>
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
                { id: 'extra1', title: 'CHECK OL 1', tipo: 'EXTRA' },
                { id: 'extra2', title: 'CHECK OL 2', tipo: 'EXTRA' },
                { id: 'extra3', title: 'CHECK OL 3', tipo: 'EXTRA' },
                { id: 'extra4', title: 'CHECK OL 4', tipo: 'EXTRA' },
                { id: 'extra5', title: 'CHECK OL 5', tipo: 'EXTRA' }
            ];
    
            const filaTotal = [{ id: 'total-row', title: 'TOTAL OCUP', tipo: 'DIARIO' }];
    
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
            const conteoOcupacion = {}; // Objeto para sumar: { "2026-04-13": total }
    
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const idReserva = doc.id;
                
                // 1. Configuración de Colores y Estilos
                const colores = { 
                    'booking': '#1e40af', 'airbnb': '#ff5a5f', 'expedia': '#ffb400', 
                    'directas': '#7c3aed', 'personal': '#059669', 'gmail': '#ea4335', 'dayuse': '#db2777' 
                };
    
                let colorFinal = colores[data.medio?.toLowerCase()] || '#555';
                let textoNombre = data.huesped || 'Sin nombre';
                let colorTexto = '#ffffff'; 
                let colorBorde = 'transparent';
    
                // Si está en Check-in o Check-out: Fondo Blanco, Texto Negro
                if (data.estado === 'checkin' || data.estado === 'checkout') {
                    colorFinal = '#ffffff';
                    colorTexto = '#000000'; 
                    colorBorde = '#cbd5e1';
                    textoNombre = `✅ ${textoNombre}`; 
                }
    
                const esDayUse = data.medio?.toLowerCase() === 'dayuse' || data.tipoVenta?.toLowerCase() === 'day use';
    
                // --- FUNCIÓN PARA SUMAR AL CONTADOR DIARIO ---
                const sumarAlTotal = (fechaISO) => {
                    if (!fechaISO) return;
                    conteoOcupacion[fechaISO] = (conteoOcupacion[fechaISO] || 0) + 1;
                };
    
                // 2. EVENTO PRINCIPAL EN HABITACIÓN
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
    
                // Conteo de estancia (sin contar el día de salida a menos que sea Day Use)
                let fActual = new Date(data.checkIn + "T00:00:00");
                let fFin = new Date(data.checkOut + "T00:00:00");
                if (esDayUse) {
                    sumarAlTotal(data.checkIn);
                } else {
                    while (fActual < fFin) {
                        sumarAlTotal(fActual.toISOString().split('T')[0]);
                        fActual.setDate(fActual.getDate() + 1);
                    }
                }
    
// --- DENTRO DE snapshot.docs.forEach(doc => { ... }) ---

// 3. LATE CHECK-OUT (Mismo día de la salida)
if (data.lateCheckOut && data.lateCheckOut !== "Normal" && !esDayUse) {
    const horaLate = data.lateCheckOut.includes(':') ? data.lateCheckOut : "15:00";
    eventosFinales.push({
        id: idReserva + '_late',
        resourceId: 'extra1', 
        title: `LATE H-${data.habitacion} (${horaLate})`,
        // Inicia y termina el MISMO día del checkOut
        start: `${data.checkOut}T12:00:00`, 
        end: `${data.checkOut}T${horaLate}:00`,
        backgroundColor: '#d9f99d',
        textColor: '#166534',
        allDay: false, // Obligatorio para que respete las horas
        extendedProps: { ...data, esExtra: true }
    });
    // Ya lo estás sumando al total correctamente abajo
}

// 4. EARLY CHECK-IN (Mismo día de la entrada)
if (data.earlyCheckIn && data.earlyCheckIn !== "Normal" && !esDayUse) {
    const horaEarly = data.earlyCheckIn.includes(':') ? data.earlyCheckIn : "08:00";
    eventosFinales.push({
        id: idReserva + '_early',
        resourceId: 'extra2', 
        title: `EARLY H-${data.habitacion} (${horaEarly})`,
        // Inicia y termina el MISMO día del checkIn
        start: `${data.checkIn}T${horaEarly}:00`, 
        end: `${data.checkIn}T13:00:00`,
        backgroundColor: '#bae6fd',
        textColor: '#0369a1',
        allDay: false, 
        extendedProps: { ...data, esExtra: true }
    });
}
    
// 5. DAY USE (Fila Extra 3)
if (esDayUse) {
    const hEntrada = data.earlyCheckIn || "09:00";
    const hSalida = data.lateCheckOut || "18:00";
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
    
            // 6. GENERAR LOS BLOQUES DE "TOTAL OCUPADO" EN LA FILA INFERIOR
            Object.keys(conteoOcupacion).forEach(fecha => {
                eventosFinales.push({
                    resourceId: 'total-row',
                    title: conteoOcupacion[fecha].toString(),
                    start: fecha,
                    end: fecha,
                    allDay: true,
                    display: 'background', // Ocupa toda la celda
                    backgroundColor: 'transparent',
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

window.editarReserva = async (id) => {
    try {
        // 1. Buscamos la reserva directamente en el calendario (ya está en memoria)
        const reserva = calendar.getEventById(id);
        
        if (!reserva) {
            Swal.fire('Error', 'No se encontró la reserva en el sistema', 'error');
            return;
        }

        const r = reserva.extendedProps; // Aquí están todos tus datos de Firestore

        // 2. Preparar el formulario
        const formulario = document.getElementById('formNuevaReserva');
        document.getElementById('modalTitle').innerText = "Editar Reserva";
        formulario.dataset.editId = id; // Guardamos el ID para el updateDoc posterior
        
        // OPCIONAL: Guarda la fecha original si no quieres que cambie al editar
        formulario.dataset.fechaReg = r.fechaRegistro;

        // 3. Llenar el formulario con los datos de 'r'
        document.getElementById("resHuesped").value = r.huesped || "";
        document.getElementById("resDoc").value = r.doc || "";
        document.getElementById("resTelefono").value = r.telefono || "";
        document.getElementById("resNacionalidad").value = r.nacionalidad || "";
        document.getElementById("resNacimiento").value = r.nacimiento || "";
        document.getElementById("resCorreo").value = r.correo || "";
        document.getElementById("resHabitacion").value = r.habitacion || "";
        document.getElementById("resCheckIn").value = r.checkIn || "";
        document.getElementById("resCheckOut").value = r.checkOut || "";
        document.getElementById("resMedio").value = r.medio || "";
        document.getElementById("resPersonas").value = r.personas || 1;
        document.getElementById("resInfo").value = r.desayuno || "SIN DESAYUNO";
        document.getElementById("resEarly").value = r.earlyCheckIn || "";
        document.getElementById("resLate").value = r.lateCheckOut || "";
        document.getElementById("resCochera").value = r.cochera || "";
        document.getElementById("resTraslado").value = r.traslado || "";
        document.getElementById("resTarifa").value = r.tarifa || 0;
        document.getElementById("resMoneda").value = r.moneda || "PEN";
        document.getElementById("resTipoCambio").value = r.tipoCambio || 1;
        document.getElementById("resTotal").value = r.total || 0;
        document.getElementById("resAdelantoMonto").value = r.adelantoMonto || 0;
        document.getElementById("resAdelantoDetalle").value = r.adelantoDetalle || "";
        document.getElementById("resDiferencia").value = r.diferencia || 0;
        document.getElementById("resObservaciones").value = r.observaciones || "";
        document.getElementById("resRecepcion").value = r.recibidoPor || "";
        document.getElementById("resRecepcionconfi").value = r.confirmadoPor || "";

        // 4. Abrir el modal y cerrar el SweetAlert previo
        Swal.close(); 
        document.getElementById('modalReserva').classList.add('active');

    } catch (error) {
        console.error("Error al cargar datos para editar:", error);
        Swal.fire('Error', 'Error crítico al abrir edición', 'error');
    }
};

// --- EL "MOTOR" QUE ENCIENDE TODO ---
// Estas líneas deben ir al final, justo antes de cerrar el DOMContentLoaded

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

window.hacerCheckIn = async (id) => {
    const reservaSnap = await getDocs(query(collection(db, "reservas"))); // O busca el doc específico
    // Necesitamos el número de habitación de esta reserva para actualizar el otro módulo
    const reservaData = (calendar.getEventById(id)).extendedProps;
    const numHab = reservaData.habitacion;

    const { isConfirmed } = await Swal.fire({
        title: '¿Confirmar Check-In?',
        text: `La habitación ${numHab} pasará a estado OCUPADA`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#16a34a'
    });

    if (isConfirmed) {
        try {
            // 1. Actualiza la reserva
            await updateDoc(doc(db, "reservas", id), { estado: "checkin" });
            
            // 2. Actualiza la habitación (Para que el módulo de cuadritos cambie a rojo)
            // Asumiendo que tus docs en 'habitaciones' tienen el ID igual al número (ej: "101")
            await updateDoc(doc(db, "habitaciones", numHab.toString()), { 
                estadoDoc: "checkin" 
            });

            Swal.fire('¡Éxito!', 'Check-In registrado.', 'success');
        } catch (e) { 
            console.error(e);
            Swal.fire('Error', 'No se pudo actualizar', 'error'); 
        }
    }
};

window.hacerCheckOut = async (id) => {
    const reservaData = (calendar.getEventById(id)).extendedProps;
    const numHab = reservaData.habitacion;

    const { isConfirmed } = await Swal.fire({
        title: '¿Confirmar Check-Out?',
        text: "La habitación pasará a limpieza",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6e0d25'
    });

    if (isConfirmed) {
        try {
            // 1. Actualiza la reserva
            await updateDoc(doc(db, "reservas", id), { estado: "checkout" });
            
            // 2. Actualiza la habitación a "sucio" o "disponible"
            await updateDoc(doc(db, "habitaciones", numHab.toString()), { 
                estadoDoc: "checkout" 
            });

            Swal.fire('¡Éxito!', 'Check-Out registrado.', 'success');
        } catch (e) { Swal.fire('Error', 'No se pudo completar', 'error'); }
    }
};