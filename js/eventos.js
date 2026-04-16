import { auth, db } from "./firebaseconfig.js";
import { 
    collection, addDoc, onSnapshot, doc, deleteDoc, query 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return; // Seguridad

    // Mostrar fecha actual en el header (Coherencia con tu diseño)
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateText = new Date().toLocaleDateString('es-ES', dateOptions);
    const dateElement = document.getElementById('current-date');
    if (dateElement) dateElement.textContent = dateText.charAt(0).toUpperCase() + dateText.slice(1);

    const eventosRef = collection(db, "eventos");

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        firstDay: 1,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        // Botones en español
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día'
        },

        dateClick: async function(info) {
            const { value: formValues } = await Swal.fire({
                title: 'Nuevo Evento',
                html:
                    `<input id="swal-input1" class="swal2-input" placeholder="Nombre del evento">` +
                    `<input id="swal-input2" type="color" class="swal2-input" value="#800020" title="Color del evento">`,
                showCancelButton: true,
                confirmButtonColor: '#800020', // Tu color burgundy
                cancelButtonText: 'Cancelar',
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
                } catch (error) {
                    Swal.fire('Error', 'No se pudo guardar el evento', 'error');
                }
            }
        },

        eventClick: function(info) {
            Swal.fire({
                title: '¿Eliminar evento?',
                text: info.event.title,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Regresar'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        await deleteDoc(doc(db, "eventos", info.event.id));
                        Swal.fire('Eliminado', 'El evento ha sido quitado.', 'success');
                    } catch (error) {
                        Swal.fire('Error', 'No se pudo eliminar', 'error');
                    }
                }
            });
        }
    });

    calendar.render();

    // --- READ: Escuchar cambios en tiempo real ---
    onSnapshot(query(eventosRef), (snapshot) => {
        const eventos = snapshot.docs.map(doc => ({
            id: doc.id,
            title: doc.data().title,
            start: doc.data().start,
            backgroundColor: doc.data().color,
            borderColor: doc.data().color,
            allDay: true
        }));

        calendar.removeAllEvents();
        calendar.addEventSource(eventos);
    });
});