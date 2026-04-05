import { db } from './firebaseconfig.js';
import { collection, getDocs, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    const calendarEl = document.getElementById('gantt_here');

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'resourceTimelineMonth',
        // --- NUEVOS AJUSTES DE VISTA COMPACTA ---
        height: 'auto',              // Evita el scroll interno del calendario
        resourceAreaWidth: '15%',    // Reduce el ancho de la columna de habitaciones
        slotMinWidth: 28,            // Hace las columnas de los días más delgadas
        eventHeight: 20,             // Reduce la altura de las barras de reserva
        stickyHeaderDates: true,     // Mantiene los días visibles al bajar
        // ---------------------------------------
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
        resourceAreaWidth: '220px',
        resourceAreaHeaderContent: 'HABITACIONES',
        

        slotLabelContent: function(arg) {
            // Solo calculamos para el nivel de días (donde aparece D1, L2, etc.)
            if (arg.level > 0) { 
                const fechaSlot = arg.date;
                const eventos = calendar.getEvents();
                let count = 0;

                eventos.forEach(ev => {
                    // Solo contamos si es una habitación real (evitamos contar extras o totales)
                    const esHabitacionReal = ev.resourceId && !ev.resourceId.includes('extra') && ev.resourceId !== 'total-row';
                    if (esHabitacionReal && fechaSlot >= ev.start && fechaSlot < ev.end) {
                        count++;
                    }
                });

                // Retorna el día y, abajo, el total de ocupación en color vino tinto
                return { 
                    html: `
                        <div style="font-size: 11px;">${arg.text}</div>
                        <div style="color: #6e0d25; font-weight: 800; font-size: 13px; margin-top: 2px;">
                            ${count > 0 ? count : ''}
                        </div>` 
                };
            }
        },

        // --- DETALLE AL HACER CLIC ---
        eventClick: function(info) {
            const r = info.event.extendedProps; // 'r' contiene todos los datos de Firebase
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

    // 1. CARGAR HABITACIONES
    const cargarHabitaciones = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "habitaciones"));
            
            // CORRECCIÓN: Se eliminó la redeclaración de listaHabitaciones
            let listaHabitaciones = querySnapshot.docs.map(doc => ({
                id: `hab${doc.data().numero}`, // ID consistente: hab201
                title: doc.data().numero.toString(), 
                tipo: doc.data().tipo 
            }));

// Ordenamos habitaciones numéricamente
listaHabitaciones.sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));

// Ponemos los extras y el total AL FINAL
const extrasYTotal = [
    { id: 'extra1', title: 'CHECK OL 1', tipo: 'EXTRAS' },
    { id: 'extra2', title: 'CHECK OL 2', tipo: 'EXTRAS' },
    { id: 'extra3', title: 'CHECK OL 3', tipo: 'EXTRAS' },
    { id: 'extra4', title: 'CHECK OL 4', tipo: 'EXTRAS' },
    { id: 'extra5', title: 'CHECK OL 5', tipo: 'EXTRAS' },
    { id: 'total-row', title: 'TOTAL OCUP', tipo: 'DIARIO' }
];

calendar.setOption('resources', [...listaHabitaciones, ...extrasYTotal]);

        } catch (error) {
            console.error("Error en cargarHabitaciones:", error);
            calendar.setOption('resources', [{ id: 'total-row', title: 'TOTAL OCUP', tipo: 'DIARIO' }]);
        }
    };

    // 2. ESCUCHAR RESERVAS
    const escucharReservas = () => {
        onSnapshot(collection(db, "reservas"), (snapshot) => {
            const listaReservas = snapshot.docs.map(doc => {
                const data = doc.data();
                const colores = {
                    'booking': '#003580', 'airbnb': '#FF5A5F', 'expedia': '#f89c1c',
                    'directas': '#28a745', 'personal': '#6f42c1', 'gmail': '#db4437', 'dayuse': '#ffc107'
                };

                return {
                    id: doc.id,
                    resourceId: `hab${data.habitacion}`, // Debe coincidir con el ID del recurso
                    title: data.huesped || 'Sin nombre',
                    start: data.checkIn,
                    end: data.checkOut,
                    backgroundColor: colores[data.medio?.toLowerCase()] || '#555',
                    borderColor: 'transparent',
                    allDay: true,
                    extendedProps: { ...data }
                };
            });
            calendar.setOption('events', listaReservas);
        });
    };

 // 1. Preparamos las funciones de carga pero NO renderizamos aún
 await cargarHabitaciones(); // Esperamos a que Firebase traiga los recursos
 escucharReservas();        // Iniciamos el escucha de eventos
 
 // 2. Renderizamos al final con todo cargado
 calendar.render();
});

// --- FUNCIONES GLOBALES ---
window.abrirModal = () => {
    document.getElementById('modalReserva').classList.add('active');
};

window.cerrarModal = () => {
    document.getElementById('modalReserva').classList.remove('active');
};

window.editarReserva = (id) => {
    Swal.fire('Editar', `Abriendo editor para reserva: ${id}`, 'info');
};

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