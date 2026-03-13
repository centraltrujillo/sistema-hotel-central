import { db } from "./firebaseconfig.js";
import { collection, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    
    const coloresMedio = {
        'booking': '#3b82f6', 'airbnb': '#f43f5e', 'directas': '#8b5cf6',
        'expedia': '#f59e0b', 'personal': '#10b981', 'day use': '#6366f1',
        'mantenimiento': '#fa051a', 'gmail': '#59ea35'
    };

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Agenda' },
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        height: 'auto',
        displayEventTime: true,
        
        eventClick: function(info) {
            const res = info.event.extendedProps.dataReserva;
            const resId = info.event.id;
            if (!res) return;

            const esCheckIn = res.estado === 'checkin';

            Swal.fire({
                title: `<span style="font-family: 'Playfair Display', serif; color: #800020;">Detalle de Reserva</span>`,
                html: `
                    <div style="text-align: left; font-family: 'Lato', sans-serif; border-top: 2px solid #d4a017; padding-top: 15px;">
                        <div style="margin-bottom: 15px; background: #fffaf0; padding: 10px; border-radius: 8px; border: 1px solid #fef3c7;">
                            <strong style="color: #4a3728; font-size: 16px;">Huésped: ${res.huesped}</strong>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px; background: #f8fafc; padding: 15px; border-radius: 10px;">
                            <p style="margin:0;"><b>Habitación:</b> <span class="badge-hab" style="color:#800020; font-weight:bold;">${res.habitacion}</span></p>
                            <p style="margin:0;"><b>Medio:</b> ${res.medio.toUpperCase()}</p>
                            <p style="margin:0;"><b>Entrada:</b> ${res.checkIn}</p>
                            <p style="margin:0;"><b>Salida:</b> ${res.checkOut}</p>
                        </div>
                        <div style="margin-top: 15px; font-size: 14px; padding: 0 5px;">
                            <p style="margin: 5px 0;"><b>Total:</b> <span style="color: #166534; font-weight: bold;">S/ ${res.total}</span></p>
                            <p style="margin: 5px 0;"><b>Teléfono:</b> ${res.telefono || 'N/A'}</p>
                        </div>
                        
                        <div style="margin-top: 20px; display: flex; gap: 10px;">
                            ${!esCheckIn ? 
                                `<button id="btnCheckIn" class="swal2-styled" style="background-color: #10b981; flex: 1; border: none; padding: 10px; border-radius: 8px; color: white; cursor: pointer;">
                                    <i class="fa-solid fa-check"></i> Realizar Check-in
                                </button>` : 
                                `<div style="flex: 1; text-align: center; padding: 10px; background: #dcfce7; color: #166534; border-radius: 8px; font-weight: bold;">
                                    ✓ Huésped ya registrado
                                </div>`
                            }
                            <button onclick="Swal.close()" class="swal2-styled" style="background-color: #64748b; flex: 1; border: none; padding: 10px; border-radius: 8px;">Cerrar</button>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                didOpen: () => {
                    const btn = document.getElementById('btnCheckIn');
                    if(btn) {
                        btn.addEventListener('click', async () => {
                            const ref = doc(db, "reservas", resId);
                            await updateDoc(ref, { estado: "checkin" });
                            Swal.close();
                        });
                    }
                }
            });
        }
    });

    calendar.render();

    onSnapshot(collection(db, "reservas"), (snapRes) => {
        const eventosFull = [];
        snapRes.docs.forEach(doc => {
            const r = doc.data();
            const esCheckIn = r.estado === 'checkin';
            const medioKey = r.medio?.toLowerCase().trim();
            
            eventosFull.push({
                id: doc.id,
                title: esCheckIn ? `✅ ${r.huesped}` : `Hab. ${r.habitacion} - ${r.huesped}`,
                start: r.early ? `${r.checkIn}T${r.early}:00` : r.checkIn,
                end: r.late ? `${r.checkOut}T${r.late}:00` : r.checkOut,
                backgroundColor: esCheckIn ? '#ffffff' : (coloresMedio[medioKey] || '#800020'),
                textColor: esCheckIn ? '#000000' : '#ffffff',
                borderColor: esCheckIn ? '#cbd5e1' : 'transparent',
                extendedProps: { dataReserva: { ...r, id: doc.id } }
            });
        });

        calendar.removeAllEvents();
        calendar.addEventSource(eventosFull);
    });
});