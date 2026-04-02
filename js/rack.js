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
        resourceAreaHeaderContent: 'HABITACIONES / TOTAL',
        
        // --- LÓGICA PARA EL TOTAL DE OCUPABILIDAD (Fila 22 del Excel) ---
        resourceTimelineDayTick: function(arg) {
            const events = calendar.getEvents();
            let count = 0;
            
            events.forEach(event => {
                // Solo contamos habitaciones reales (no extras ni la fila total)
                const isRealRoom = event.resourceId && !event.resourceId.includes('extra') && event.resourceId !== 'total-row';
                
                // Si la reserva abarca este día
                if (isRealRoom && arg.date >= event.start && arg.date < event.end) {
                    count++;
                }
            });

            return { 
                html: `<div class="total-count-badge" style="font-weight:bold; color:#1e293b;">${count > 0 ? count : ''}</div>` 
            };
        },

        resourceLabelContent: function(arg) {
            let tipo = arg.resource.extendedProps.tipo || '';
            // Estilo especial para la fila de totales
            const isTotalRow = arg.resource.id === 'total-row';
            
            return {
                html: `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding: 0 5px; ${isTotalRow ? 'color: var(--vino-tinto);' : ''}">
                        <b style="font-size:13px;">${arg.resource.title}</b>
                        <span style="font-size:10px; color:#666; text-transform:uppercase;">${tipo}</span>
                       </div>`
            };
        },
        resources: [], 
        events: [],
        // Evita que se puedan arrastrar reservas a la fila de totales
        eventAllow: function(dropInfo, draggedEvent) {
            return dropInfo.resource.id !== 'total-row';
        }
    });

    calendar.render();

    // 1. CARGAR HABITACIONES + FILAS EXTRAS + FILA TOTAL
    const cargarHabitaciones = async () => {
        const querySnapshot = await getDocs(collection(db, "habitaciones"));
        
        // Mapeo de habitaciones reales de Firebase
        let listaHabitaciones = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: `${data.numero}`, 
                tipo: data.tipo 
            };
        });

        // Ordenar numéricamente (201, 202, 301...)
        listaHabitaciones.sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));

        // Filas extras para Late Check-out o Day Use
        const filasExtras = [
            { id: 'extra1', title: 'CHECK OL 1', tipo: 'EXTRAS' },
            { id: 'extra2', title: 'CHECK OL 2', tipo: 'EXTRAS' },
            { id: 'extra3', title: 'DAY USE 1', tipo: 'EXTRAS' }
        ];

        // La fila de "TOTAL OCUP" (Como la fila 22 de tu Excel)
        const filaTotal = [
            { id: 'total-row', title: 'TOTAL OCUP', tipo: 'DIARIO' }
        ];

        // Unimos todo en el orden correcto
        const recursosFinales = [...listaHabitaciones, ...filasExtras, ...filaTotal];
        calendar.setOption('resources', recursosFinales);
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
                    resourceId: res.resHabitacion, 
                    title: res.resHuesped || 'Sin nombre', // Muestra el nombre del huésped en la barra
                    start: res.resCheckIn,
                    end: res.resCheckOut,
                    backgroundColor: coloresMedio[res.resMedio?.toLowerCase()] || '#555',
                    borderColor: 'transparent',
                    allDay: true // Asegura que ocupe el bloque completo del día
                };
            });
            calendar.setOption('events', listaReservas);
        });
    };

    await cargarHabitaciones();
    escucharReservas();
});import { db } from './firebaseconfig.js';
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
        resourceAreaHeaderContent: 'HABITACIONES / TOTAL',
        
        // --- LÓGICA PARA EL TOTAL DE OCUPABILIDAD (Fila 22 del Excel) ---
        resourceTimelineDayTick: function(arg) {
            const events = calendar.getEvents();
            let count = 0;
            
            events.forEach(event => {
                // Solo contamos habitaciones reales (no extras ni la fila total)
                const isRealRoom = event.resourceId && !event.resourceId.includes('extra') && event.resourceId !== 'total-row';
                
                // Si la reserva abarca este día
                if (isRealRoom && arg.date >= event.start && arg.date < event.end) {
                    count++;
                }
            });

            return { 
                html: `<div class="total-count-badge" style="font-weight:bold; color:#1e293b;">${count > 0 ? count : ''}</div>` 
            };
        },

        resourceLabelContent: function(arg) {
            let tipo = arg.resource.extendedProps.tipo || '';
            // Estilo especial para la fila de totales
            const isTotalRow = arg.resource.id === 'total-row';
            
            return {
                html: `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding: 0 5px; ${isTotalRow ? 'color: var(--vino-tinto);' : ''}">
                        <b style="font-size:13px;">${arg.resource.title}</b>
                        <span style="font-size:10px; color:#666; text-transform:uppercase;">${tipo}</span>
                       </div>`
            };
        },
        resources: [], 
        events: [],
        // Evita que se puedan arrastrar reservas a la fila de totales
        eventAllow: function(dropInfo, draggedEvent) {
            return dropInfo.resource.id !== 'total-row';
        }
    });

    calendar.render();

    // 1. CARGAR HABITACIONES + FILAS EXTRAS + FILA TOTAL
    const cargarHabitaciones = async () => {
        const querySnapshot = await getDocs(collection(db, "habitaciones"));
        
        // Mapeo de habitaciones reales de Firebase
        let listaHabitaciones = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: `${data.numero}`, 
                tipo: data.tipo 
            };
        });

        // Ordenar numéricamente (201, 202, 301...)
        listaHabitaciones.sort((a, b) => a.title.localeCompare(b.title, undefined, {numeric: true}));

        // Filas extras para Late Check-out o Day Use
        const filasExtras = [
            { id: 'extra1', title: 'CHECK OL 1', tipo: 'EXTRAS' },
            { id: 'extra2', title: 'CHECK OL 2', tipo: 'EXTRAS' },
            { id: 'extra3', title: 'DAY USE 1', tipo: 'EXTRAS' }
        ];

        // La fila de "TOTAL OCUP" (Como la fila 22 de tu Excel)
        const filaTotal = [
            { id: 'total-row', title: 'TOTAL OCUP', tipo: 'DIARIO' }
        ];

        // Unimos todo en el orden correcto
        const recursosFinales = [...listaHabitaciones, ...filasExtras, ...filaTotal];
        calendar.setOption('resources', recursosFinales);
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
                    resourceId: res.resHabitacion, 
                    title: res.resHuesped || 'Sin nombre', // Muestra el nombre del huésped en la barra
                    start: res.resCheckIn,
                    end: res.resCheckOut,
                    backgroundColor: coloresMedio[res.resMedio?.toLowerCase()] || '#555',
                    borderColor: 'transparent',
                    allDay: true // Asegura que ocupe el bloque completo del día
                };
            });
            calendar.setOption('events', listaReservas);
        });
    };

    await cargarHabitaciones();
    escucharReservas();
});