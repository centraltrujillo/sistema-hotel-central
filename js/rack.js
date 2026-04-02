import { db } from './firebaseconfig.js';
import { collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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
        resourceAreaHeaderContent: 'HABITACIONES',
        // Estilo de la celda de la izquierda (como tu Excel)
        resourceLabelContent: function(arg) {
            let tipo = arg.resource.extendedProps.tipo;
            return {
                html: `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding: 0 5px;">
                        <b style="font-size:13px;">${arg.resource.title}</b>
                        <span style="font-size:10px; color:#666; text-transform:uppercase;">${tipo}</span>
                       </div>`
            };
        },
        resources: [], 
        events: []
    });

    calendar.render();

    // 1. CARGAR TUS 13 HABITACIONES
    const cargarHabitaciones = async () => {
        const querySnapshot = await getDocs(collection(db, "habitaciones"));
        const listaHabitaciones = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id, // Esto será 'hab302', 'hab201', etc.
                title: `${data.numero}`, // El número 302
                tipo: data.tipo // Matrimonial, Triple, etc.
            };
        });
        // Ordenar numéricamente para que no salgan desordenadas
        listaHabitaciones.sort((a, b) => a.title.localeCompare(b.title));
        calendar.setOption('resources', listaHabitaciones);
    };

    // 2. ESCUCHAR RESERVAS EN TIEMPO REAL
    const escucharReservas = () => {
        onSnapshot(collection(db, "reservas"), (snapshot) => {
            const listaReservas = snapshot.docs.map(doc => {
                const res = doc.data();
                
                const coloresMedio = {
                    'booking': '#003580',
                    'airbnb': '#FF5A5F',
                    'expedia': '#f89c1c',
                    'directas': '#28a745',
                    'personal': '#6f42c1',
                    'gmail': '#db4437',
                    'dayuse': '#ffc107'
                };

                return {
                    id: doc.id,
                    resourceId: res.resHabitacion, // DEBE coincidir con el ID del doc (ej: "hab302")
                    title: res.resHuesped,
                    start: res.resCheckIn,
                    end: res.resCheckOut,
                    backgroundColor: coloresMedio[res.resMedio?.toLowerCase()] || '#555',
                    borderColor: 'transparent'
                };
            });
            calendar.setOption('events', listaReservas);
        });
    };

    await cargarHabitaciones();
    escucharReservas();
});