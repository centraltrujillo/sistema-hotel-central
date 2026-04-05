import { db } from './firebaseconfig.js';
import { collection, getDocs, onSnapshot, doc, updateDoc, query, where, addDoc
 } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    const calendarEl = document.getElementById('gantt_here');

        // --- REFERENCIAS A INPUTS DEL FORMULARIO ---
const inputCheckIn = document.getElementById("resCheckIn");
const inputCheckOut = document.getElementById("resCheckOut");
const inputTarifa = document.getElementById("resTarifa");
const inputTipoCambio = document.getElementById("resTipoCambio");
const selectMoneda = document.getElementById("resMoneda");
const inputTotal = document.getElementById("resTotal");
const inputAdelantoMonto = document.getElementById("resAdelantoMonto");
const inputDiferencia = document.getElementById("resDiferencia");
const inputDoc = document.getElementById("resDoc");


    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'resourceTimelineMonth',
height: '100%',           
contentHeight: 'auto',      
expandRows: true,           
resourceAreaWidth: '220px', 
slotMinWidth: 28,            
eventHeight: 22,            // Un poco más alto para que el nombre del huésped se lea mejor
stickyHeaderDates: true,    // Mantiene los días (mie 1, jue 2...) siempre a la vista al hacer scroll lateral
resourceOrder: false,       // Mantiene el orden: Habitaciones arriba, Extras y Totales al final


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

// --- CONTADOR ACTUALIZADO: SUMA TODO (HAB + EXTRAS) ---
slotLabelContent: function(arg) {
    if (arg.level > 0) { 
        const fechaSlot = arg.date;
        const eventos = calendar.getEvents();
        let count = 0;

        eventos.forEach(ev => {
            // Contamos si es una habitación o si es una fila de extras
            const esContable = ev.resourceId && (ev.resourceId.startsWith('hab') || ev.resourceId.startsWith('extra'));

            // Si el evento cae en esta fecha, sumamos al total
            if (esContable && fechaSlot >= ev.start && fechaSlot < ev.end) {
                count++;
            }
        });

        return { 
            html: `
                <div style="font-size: 10px; color: #64748b; font-weight: 600;">${arg.text}</div>
                <div style="background: #6e0d25; color: white; border-radius: 4px; padding: 1px 4px; display: inline-block; font-size: 11px; font-weight: 800; margin-top: 2px; min-width: 18px;">
                    ${count > 0 ? count : '0'}
                </div>` 
        };
    }
},

        eventClick: function(info) {
            const r = info.event.extendedProps; 
            const idReserva = info.event.id;
        
            Swal.fire({
                title: `
                    <div class="modal-header-gestion" style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 10px 0; border-bottom: 2px solid #D4AF37;">
                        <div style="text-align: left;">
                            <span style="background: #6e0d25; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 800;">HABITACIÓN ${r.habitacion}</span>
                            <br><small style="color: #64748b; font-size: 12px; text-transform: uppercase;">${r.tipoHab || 'Estándar'}</small>
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
                        <button onclick="window.hacerCheckIn('${idReserva}')" style="background: #16a34a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 12px;"><i class="fas fa-key"></i> CHECK-IN</button>
                        <button onclick="window.hacerCheckOut('${idReserva}')" style="background: #6e0d25; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 12px;"><i class="fas fa-sign-out-alt"></i> CHECK-OUT</button>
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
            
            // --- 1. Referencia al select de tu HTML ---
            const selectHab = document.getElementById('resHabitacion');
            if (selectHab) {
                selectHab.innerHTML = '<option value="" disabled selected>Seleccione...</option>';
            }
    
            let listaHabitaciones = querySnapshot.docs.map(doc => {
                const data = doc.data();
                
                // --- 2. Llenar el select del formulario mientras recorremos ---
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

            listaHabitaciones.sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));

            const extrasYTotal = [
                { id: 'extra1', title: 'CHECK OL 1', tipo: 'EXTRAS' },
                { id: 'extra2', title: 'CHECK OL 2', tipo: 'EXTRAS' },
                { id: 'extra3', title: 'CHECK OL 3', tipo: 'EXTRAS' },
                { id: 'extra4', title: 'CHECK OL 4', tipo: 'EXTRAS' },
                { id: 'extra5', title: 'CHECK OL 5', tipo: 'EXTRAS' },
                { id: 'total-row', title: 'TOTAL OCUP', tipo: 'DIARIO' }
            ];

            // Envía las habitaciones primero para que aparezcan arriba
            calendar.setOption('resources', [...listaHabitaciones, ...extrasYTotal]);

        } catch (error) {
            console.error("Error en cargarHabitaciones:", error);
            calendar.setOption('resources', [{ id: 'total-row', title: 'TOTAL OCUP', tipo: 'DIARIO' }]);
        }
    };


    const escucharReservas = () => {
        onSnapshot(collection(db, "reservas"), (snapshot) => {
            const eventosFinales = [];
            snapshot.docs.forEach(doc => {
                const data = doc.data();
    const idReserva = doc.id;
    
    // Definir colores originales por medio
    const colores = { 
        'booking': '#003580', 'airbnb': '#FF5A5F', 'expedia': '#f89c1c', 
        'directas': '#28a745', 'personal': '#6f42c1', 'gmail': '#db4437', 'dayuse': '#ffc107' 
    };

    // Lógica de Color Dinámico y Checkmark
    let colorFinal = colores[data.medio?.toLowerCase()] || '#555';
    let textoNombre = data.huesped || 'Sin nombre';
    let colorTexto = '#ffffff'; // Blanco por defecto para fondos oscuros
    let colorBorde = 'transparent';

    // Si ya se registró (Check-in o Check-out)
    if (data.estado === 'checkin' || data.estado === 'checkout') {
        colorFinal = '#ffffff';      // Fondo blanco
        colorTexto = '#1e293b';      // Texto oscuro para que se lea en el blanco
        colorBorde = '#cbd5e1';      // Borde gris suave para que no se pierda el bloque
        textoNombre = `✅ ${textoNombre}`; // Añadimos el check al nombre
    }

    const esDayUse = data.medio?.toLowerCase() === 'dayuse' || data.tipoVenta?.toLowerCase() === 'day use';

    // 1. EVENTO EN LA HABITACIÓN (Usando las nuevas variables)
    eventosFinales.push({
        id: idReserva,
        resourceId: `hab${data.habitacion}`, 
        title: textoNombre, // Ahora lleva el ✅ si corresponde
        start: esDayUse ? `${data.checkIn}T08:00:00` : data.checkIn,
        end: esDayUse ? `${data.checkIn}T20:00:00` : data.checkOut,
        backgroundColor: colorFinal, // Blanco si hay check-in
        textColor: colorTexto,       // Oscuro si hay check-in
        borderColor: colorBorde,     // Gris si hay check-in
        allDay: !esDayUse,
        extendedProps: { ...data }
    });

                // 2. LATE CHECK-OUT (FILA EXTRA 1)
                if (data.lateCheckOut && data.lateCheckOut !== "Normal" && !esDayUse) {
                    const horaLate = data.lateCheckOut.includes(':') ? data.lateCheckOut : "15:00";
                    eventosFinales.push({
                        id: idReserva + '_late',
                        resourceId: 'extra1', 
                        title: `LATE ${data.habitacion} (${horaLate})`,
                        start: `${data.checkOut}T${horaLate}:00`, 
                        end: `${data.checkOut}T23:59:00`, // IMPORTANTE: Termina casi a medianoche para que sume al contador
                        backgroundColor: '#d9f99d',
                        textColor: '#166534',
                        extendedProps: { ...data, esExtra: true }
                    });
                }

                // 3. DAY USE (FILA EXTRA 3)
                if (esDayUse) {
                    const hEntrada = data.earlyCheckIn || "09:00";
                    const hSalida = data.lateCheckOut || "18:00";
                    eventosFinales.push({
                        id: idReserva + '_dayuse',
                        resourceId: 'extra3', 
                        title: `DAY USE ${data.habitacion} (${hEntrada}-${hSalida})`,
                        start: `${data.checkIn}T${hEntrada.includes(':') ? hEntrada : hEntrada+':00'}:00`,
                        end: `${data.checkIn}T${hSalida.includes(':') ? hSalida : hSalida+':00'}:00`,
                        backgroundColor: '#fef3c7',
                        textColor: '#92400e',
                        extendedProps: { ...data, esExtra: true }
                    });
                }
            });
            calendar.setOption('events', eventosFinales);
        });
    };

    await cargarHabitaciones(); 
    escucharReservas();        
    calendar.render();
});

// --- 2. LÓGICA DE CÁLCULOS ---
const calcularMontos = () => {
    if (!inputCheckIn.value || !inputCheckOut.value) return;

    const fIn = new Date(inputCheckIn.value + 'T00:00:00');
    const fOut = new Date(inputCheckOut.value + 'T00:00:00');
    const tarifaBase = parseFloat(inputTarifa.value) || 0;
    const tc = parseFloat(inputTipoCambio.value) || 1; // Default 1 para evitar division por 0
    const moneda = selectMoneda.value;

    const tieneEarly = document.getElementById("resEarly").value !== "";
    const tieneLate = document.getElementById("resLate").value !== "";

    if (fOut <= fIn) {
        inputTotal.value = "0.00";
        inputDiferencia.value = "0.00";
        return;
    }

    const noches = Math.round((fOut - fIn) / (1000 * 60 * 60 * 24));
    let subtotal = noches * tarifaBase;

    // Recargos (50% de la tarifa por Early o Late)
    if (tieneEarly) subtotal += (tarifaBase * 0.5);
    if (tieneLate) subtotal += (tarifaBase * 0.5);

    let totalFinal = moneda === "USD" ? subtotal * tc : subtotal;

    inputTotal.value = totalFinal.toFixed(2);

    let adelanto = parseFloat(inputAdelantoMonto.value) || 0;

    if (adelanto > totalFinal && totalFinal > 0) {
        adelanto = totalFinal;
        inputAdelantoMonto.value = totalFinal.toFixed(2);
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'El adelanto no puede superar al total',
            showConfirmButton: false,
            timer: 2000
        });
    }

    inputDiferencia.value = (totalFinal - adelanto).toFixed(2);
};

// Listeners para cálculos en tiempo real
[inputTarifa, inputCheckIn, inputCheckOut, inputAdelantoMonto, inputTipoCambio, selectMoneda, 
 document.getElementById("resEarly"), document.getElementById("resLate")].forEach(el => {
    if(el) el.addEventListener("input", calcularMontos);
});

// --- 3. AUTOCOMPLETADO POR DNI ---
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

            
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'Huésped reconocido',
                showConfirmButton: false,
                timer: 1500
            });
        }
    });
}

// --- FUNCIONES GLOBALES ---
window.abrirModal = () => { 
    // Opcional: Limpiar el formulario al abrir
    const form = document.getElementById('formReserva'); // Asegúrate que tu <form> tenga este ID
    if(form) form.reset(); 
    
    document.getElementById('modalReserva').classList.add('active'); 
};

window.cerrarModal = () => { document.getElementById('modalReserva').classList.remove('active'); };
window.editarReserva = (id) => { Swal.fire('Editar', `Abriendo editor para reserva: ${id}`, 'info'); };

window.hacerCheckIn = async (id) => {
    const { isConfirmed } = await Swal.fire({
        title: '¿Confirmar Check-In?',
        text: "La reserva pasará a estado OCUPADA",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#16a34a'
    });
    if (isConfirmed) {
        try {
            await updateDoc(doc(db, "reservas", id), { estado: "checkin" });
            Swal.fire('¡Éxito!', 'Check-In registrado.', 'success');
        } catch (e) { Swal.fire('Error', 'No se pudo actualizar', 'error'); }
    }
};

window.hacerCheckOut = async (id) => {
    const { isConfirmed } = await Swal.fire({
        title: '¿Confirmar Check-Out?',
        text: "La habitación quedará libre",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6e0d25'
    });
    if (isConfirmed) {
        try {
            await updateDoc(doc(db, "reservas", id), { estado: "checkout" });
            Swal.fire('¡Éxito!', 'Check-Out registrado.', 'success');
        } catch (e) { Swal.fire('Error', 'No se pudo completar', 'error'); }
    }
};

