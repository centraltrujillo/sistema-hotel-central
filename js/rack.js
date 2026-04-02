import { db } from './firebaseconfig.js';
import { collection, getDocs, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    const calendarEl = document.getElementById('gantt_here');

    const calendar = new FullCalendar.Calendar(calendarEl, {
        plugins: [ 'resourceTimeline' ],
        initialView: 'resourceTimelineMonth',
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'resourceTimelineMonth,resourceTimelineDay'
        },
        resourceAreaWidth: '220px',
        resourceAreaHeaderContent: 'HABITACIONES / TOTAL',
        
        // --- DETALLE AL HACER CLIC (CON TODA LA INFO Y BOTONES) ---
        eventClick: function(info) {
            const res = info.event.extendedProps;
            const idReserva = info.event.id;

            Swal.fire({
                title: `<i class="fas fa-concierge-bell"></i> Gestión de Reserva`,
                width: '850px',
                background: '#f1f5f9',
                html: `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: left; margin-top: 15px;">
                        <div style="background:white; padding:12px; border-radius:10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            <h4 style="color:#6e0d25; border-bottom:2px solid #D4AF37; margin-bottom:10px;">Huésped</h4>
                            <p style="font-size:13px;"><b>Nombre:</b> ${res.huesped}</p>
                            <p style="font-size:13px;"><b>Documento:</b> ${res.doc} (${res.nacionalidad})</p>
                            <p style="font-size:13px;"><b>Teléfono:</b> ${res.telefono}</p>
                            <p style="font-size:13px;"><b>Observaciones:</b> <span style="color:red;">${res.observaciones || '-'}</span></p>
                        </div>
                        <div style="background:white; padding:12px; border-radius:10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            <h4 style="color:#6e0d25; border-bottom:2px solid #D4AF37; margin-bottom:10px;">Estancia</h4>
                            <p style="font-size:13px;"><b>Habitación:</b> ${res.habitacion}</p>
                            <p style="font-size:13px;"><b>Check-In:</b> ${res.checkIn} (${res.early || 'Normal'})</p>
                            <p style="font-size:13px;"><b>Check-Out:</b> ${res.checkOut} (${res.late || 'Normal'})</p>
                            <p style="font-size:13px;"><b>Estado:</b> <span style="text-transform:uppercase; font-weight:bold;">${res.estado}</span></p>
                        </div>
                        <div style="background:white; padding:12px; border-radius:10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            <h4 style="color:#6e0d25; border-bottom:2px solid #D4AF37; margin-bottom:10px;">Pagos</h4>
                            <p style="font-size:13px;"><b>Total:</b> ${res.moneda} ${res.total}</p>
                            <p style="font-size:13px;"><b>Adelanto:</b> ${res.moneda} ${res.adelantoMonto}</p>
                            <p style="font-size:13px; color:red;"><b>Diferencia:</b> ${res.moneda} ${res.diferencia}</p>
                        </div>
                        <div style="background:white; padding:12px; border-radius:10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            <h4 style="color:#6e0d25; border-bottom:2px solid #D4AF37; margin-bottom:10px;">Otros</h4>
                            <p style="font-size:13px;"><b>Medio:</b> ${res.medio}</p>
                            <p style="font-size:13px;"><b>Cochera:</b> ${res.cochera}</p>
                            <p style="font-size:13px;"><b>Desayuno:</b> ${res.desayuno}</p>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 20px; flex-wrap: wrap;">
                        <button onclick="window.editarReserva('${idReserva}')" style="background:#64748b; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;"><i class="fas fa-edit"></i> EDITAR</button>
                        <button onclick="window.hacerCheckIn('${idReserva}')" style="background:#16a34a; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;"><i class="fas fa-sign-in-alt"></i> CHECK-IN</button>
                        <button onclick="window.hacerCheckOut('${idReserva}')" style="background:#6e0d25; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;"><i class="fas fa-sign-out-alt"></i> CHECK-OUT</button>
                    </div>
                `,
                showConfirmButton: false,
                showCloseButton: true
            });
        },

        resourceTimelineDayTick: function(arg) {
            const events = calendar.getEvents();
            let count = 0;
            events.forEach(event => {
                const isRealRoom = event.resourceId && !event.resourceId.includes('extra') && event.resourceId !== 'total-row';
                if (isRealRoom && arg.date >= event.start && arg.date < event.end) {
                    count++;
                }
            });
            return { html: `<div style="font-weight:bold; color:#1e293b;">${count > 0 ? count : ''}</div>` };
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

    calendar.render();

    // 1. CARGAR HABITACIONES + EXTRAS + TOTAL
    const cargarHabitaciones = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "habitaciones"));
            let listaHabitaciones = querySnapshot.docs.map(doc => ({
                id: doc.id,
                title: doc.data().numero.toString(), 
                tipo: doc.data().tipo 
            }));

            listaHabitaciones.sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));

            const extras = [
                { id: 'extra1', title: 'CHECK OL 1', tipo: 'EXTRAS' },
                { id: 'extra2', title: 'CHECK OL 2', tipo: 'EXTRAS' },
                { id: 'total-row', title: 'TOTAL OCUP', tipo: 'DIARIO' }
            ];

            calendar.setOption('resources', [...listaHabitaciones, ...extras]);
        } catch (e) { console.error(e); }
    };

    // 2. ESCUCHAR RESERVAS (USANDO TUS CAMPOS EXACTOS)
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
                    resourceId: `hab${data.habitacion}`, // Ajuste para que coincida con IDs del doc "hab201"
                    title: data.huesped || 'Sin nombre',
                    start: data.checkIn,
                    end: data.checkOut,
                    backgroundColor: colores[data.medio?.toLowerCase()] || '#555',
                    borderColor: 'transparent',
                    allDay: true,
                    extendedProps: { ...data } // Guardar todo para el detalle
                };
            });
            calendar.setOption('events', listaReservas);
        });
    };

    await cargarHabitaciones();
    escucharReservas();
});

// --- FUNCIONES GLOBALES PARA BOTONES DE ACCIÓN ---
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
            Swal.fire('Éxito', 'Estado actualizado a OCUPADA', 'success');
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
            Swal.fire('Éxito', 'Check-Out completado', 'success');
        } catch (e) { Swal.fire('Error', 'No se pudo completar', 'error'); }
    }
};