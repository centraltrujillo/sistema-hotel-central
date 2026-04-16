import { auth, db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, doc, deleteDoc, query 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    const eventosRef = collection(db, "eventos");

    // Inicializar FullCalendar
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        firstDay: 1,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },

        // --- CREATE: Agregar evento al hacer clic en un día ---
        dateClick: async function(info) {
            const { value: formValues } = await Swal.fire({
                title: 'Nuevo Evento',
                html:
                    `<input id="swal-input1" class="swal2-input" placeholder="Nombre del evento">` +
                    `<input id="swal-input2" type="color" class="swal2-input" value="#800020" title="Color del evento">`, // Por defecto burgundy
                showCancelButton: true,
                confirmButtonText: 'Guardar',
                preConfirm: () => {
                    const titulo = document.getElementById('swal-input1').value;
                    if (!titulo) return Swal.showValidationMessage('El título es obligatorio');
                    return [titulo, document.getElementById('swal-input2').value];
                }
            });

            if (formValues) {
                try {
                    await addDoc(eventosRef, {
                        title: formValues[0],
                        start: info.dateStr,
                        color: formValues[1],
                        createdAt: new Date()
                    });
                    // No hace falta calendar.addEvent porque onSnapshot lo hará por nosotros
                } catch (error) {
                    console.error("Error al guardar:", error);
                }
            }
        },

        // --- DELETE: Eliminar evento al hacer clic en él ---
        eventClick: function(info) {
            Swal.fire({
                title: '¿Eliminar evento?',
                text: info.event.title,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#800020',
                confirmButtonText: 'Sí, eliminar'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        // El ID de Firebase está guardado en el id del evento de FullCalendar
                        const id = info.event.id;
                        await deleteDoc(doc(db, "eventos", id));
                        Swal.fire('Eliminado', '', 'success');
                    } catch (error) {
                        console.error("Error al eliminar:", error);
                    }
                }
            });
        }
    });

    calendar.render();

    // --- READ: Escuchar cambios en tiempo real ---
    onSnapshot(query(eventosRef), (snapshot) => {
        const eventos = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            eventos.push({
                id: doc.id, // Importante para poder eliminarlo después
                title: data.title,
                start: data.start,
                backgroundColor: data.color,
                borderColor: data.color,
                allDay: true
            });
        });

        // Limpiar eventos actuales y cargar los nuevos de Firebase
        calendar.removeAllEvents();
        calendar.addEventSource(eventos);
    });
});