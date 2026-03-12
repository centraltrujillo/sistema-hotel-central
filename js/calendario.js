import { db } from "./firebaseconfig.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    
    // Objeto de colores según medio de reserva
    const coloresMedio = {
        'booking': '#3b82f6', // Azul
        'airbnb': '#f43f5e',  // Rosa/Rojo
        'directas': '#8b5cf6', // Morado
        'expedia': '#f59e0b',  // Naranja
        'personal': '#10b981', // Verde
        'day use': '#6366f1',   // Índigo
        'mantenimiento': '#fa051a',
        'gmail': '#59ea35'

    };

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        height: 'auto',
        displayEventTime: true,
        
        // --- MODAL AL HACER CLIC ---
        eventClick: function(info) {
            const res = info.event.extendedProps.dataReserva;
            if (!res) return;

            Swal.fire({
                title: `Reserva de ${res.huesped}`,
                html: `
                    <div style="text-align: left; font-size: 14px;">
                        <p><b>Habitación:</b> ${res.habitacion}</p>
                        <p><b>Check-in:</b> ${res.checkIn} ${res.early ? 'a las ' + res.early : ''}</p>
                        <p><b>Check-out:</b> ${res.checkOut} ${res.late ? 'a las ' + res.late : ''}</p>
                        <p><b>Medio:</b> ${res.medio}</p>
                        <p><b>Total:</b> S/ ${res.total}</p>
                        <p><b>Teléfono:</b> ${res.telefono || 'N/A'}</p>
                        <p><b>Recepcionado por:</b> ${res.recepcion || 'N/A'}</p>
                    </div>
                `,
                icon: 'info',
                confirmButtonColor: '#800020',
                zIndex: 10000
            });
        }
    });

    calendar.render();

    // Sincronización
    onSnapshot(collection(db, "reservas"), (snapRes) => {
        onSnapshot(collection(db, "eventos"), (snapEv) => {
            const eventosFull = [];

            snapRes.docs.forEach(doc => {
                const r = doc.data();
                const medioKey = r.medio?.toLowerCase();
                
                eventosFull.push({
                    title: `${r.huesped} - Hab. ${r.habitacion}`,
                    start: r.early ? `${r.checkIn}T${r.early}:00` : r.checkIn,
                    end: r.late ? `${r.checkOut}T${r.late}:00` : r.checkOut,
                    // Color según el medio o un color por defecto
                    backgroundColor: coloresMedio[medioKey] || '#800020',
                    textColor: '#fff',
                    // Guardamos los datos completos para el modal
                    extendedProps: { dataReserva: r }
                });
            });

            // ... (resto de lógica de snapEv)
            calendar.removeAllEvents();
            calendar.addEventSource(eventosFull);
        });
    });
});