import { db } from "./firebaseconfig.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth'
        },
        height: 'auto'
    });

    calendar.render();

    // Sincronización en tiempo real
    onSnapshot(collection(db, "reservas"), (snapRes) => {
        onSnapshot(collection(db, "eventos"), (snapEv) => {
            const eventosFull = [];

            // 1. Reservas
            snapRes.docs.forEach(doc => {
                const r = doc.data();
                eventosFull.push({
                    title: `${r.huesped} (Hab. ${r.habitacion})`,
                    start: r.checkIn,
                    end: r.checkOut,
                    backgroundColor: r.estado === 'Confirmada' ? '#2e7d32' : '#d4a017'
                });
            });

            // 2. Eventos (Mantenimiento, Limpieza, etc.)
            snapEv.docs.forEach(doc => {
                const e = doc.data();
                // Mapeamos el tipo a tu clase CSS (ej: "Mantenimiento" -> "type-mantenimiento")
                const cssClass = `type-${e.tipo?.toLowerCase() || 'admin'}`;
                eventosFull.push({
                    title: e.titulo,
                    start: e.fecha,
                    className: cssClass // Aquí aplica tus colores definidos en CSS
                });
            });

            calendar.removeAllEvents();
            calendar.addEventSource(eventosFull);
        });
    });
});