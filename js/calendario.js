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
            // Variable para el símbolo de moneda dinámico
            const simbolo = res.moneda === 'USD' ? '$' : 'S/';

            Swal.fire({
                title: `<span style="font-family: 'Playfair Display', serif; color: #800020; font-size: 24px;">Detalle de la Reserva</span>`,
                width: '850px',
                html: `
                    <div style="text-align: left; font-family: 'Lato', sans-serif; border-top: 3px solid #d4a017; padding-top: 15px;">
                        
                        <div style="background: #fffaf0; padding: 15px; border-radius: 10px; border: 1px solid #fef3c7; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; color: #800020; border-bottom: 1px solid #fde68a; padding-bottom: 5px;">👤 Información del Huésped</h4>
                            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px;">
                                <p style="margin:2px 0;"><b>Nombre:</b> ${res.huesped}</p>
                                <p style="margin:2px 0;"><b>Doc:</b> ${res.doc || 'N/A'}</p>
                                <p style="margin:2px 0;"><b>Nacionalidad:</b> ${res.nacionalidad || 'N/A'}</p>
                                <p style="margin:2px 0;"><b>Teléfono:</b> ${res.telefono || 'N/A'}</p>
                                <p style="margin:2px 0; grid-column: span 2;"><b>Correo:</b> ${res.correo || 'N/A'}</p>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div style="background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0;">
                                <h4 style="margin: 0 0 10px 0; color: #1e293b;">🏨 Habitación y Medio</h4>
                                <p style="margin:2px 0;"><b>Habitación:</b> <span style="background:#800020; color:white; padding:2px 8px; border-radius:4px;">${res.habitacion}</span></p>
                                <p style="margin:2px 0;"><b>Medio:</b> ${res.medio?.toUpperCase()}</p>
                                <p style="margin:2px 0;"><b>Pax:</b> ${res.personas || '1'}</p>
                                <p style="margin:2px 0;"><b>Desayuno:</b> ${res.desayuno || 'N/A'}</p>
                            </div>
                            <div style="background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0;">
                                <h4 style="margin: 0 0 10px 0; color: #1e293b;">📅 Fechas y Horas</h4>
                                <p style="margin:2px 0;"><b>Check-In:</b> ${res.checkIn} ${res.early ? '('+res.early+')' : ''}</p>
                                <p style="margin:2px 0;"><b>Check-Out:</b> ${res.checkOut} ${res.late ? '('+res.late+')' : ''}</p>
                                <p style="margin:2px 0;"><b>Cochera:</b> ${res.cochera || 'NO'}</p>
                                <p style="margin:2px 0;"><b>Traslado:</b> ${res.traslado || 'N/A'}</p>
                            </div>
                        </div>

                        <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; border: 1px solid #dcfce7; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; color: #166534;">💰 Liquidación de Cuenta</h4>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                                <p style="margin:2px 0;"><b>Moneda:</b> ${res.moneda === 'USD' ? 'Dólares ($)' : 'Soles (S/)'}</p>
                                <p style="margin:2px 0;"><b>Tarifa Diaria:</b> ${simbolo} ${res.tarifa}</p>
                                <p style="margin:2px 0;"><b>Tipo de Cambio:</b> ${res.tipoCambio ? res.tipoCambio : 'N/A'}</p>
                                <p style="margin:2px 0;"><b>Total Alojamiento:</b> ${simbolo} ${res.total}</p>
                            </div>
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #bbf7d0;">
                                <p style="margin:2px 0;"><b>Adelanto:</b> ${res.adelanto || '0.00'}</p>
                                <p style="margin:2px 0; font-size: 1.1em; color: #dc2626;"><b>Diferencia Pendiente:</b> S/ ${res.diferencia || '0.00'}</p>
                            </div>
                        </div>

                        <div style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 10px;">
                            Recepcionado por: ${res.recepcion} | Confirmado por: ${res.recepcionconfi}
                        </div>

                        <div style="margin-top: 20px; display: flex; gap: 10px;">
                            ${!esCheckIn ? 
                                `<button id="btnCheckIn" class="swal2-styled" style="background-color: #10b981; flex: 1; border: none; padding: 12px; border-radius: 8px; color: white; cursor: pointer; font-weight: bold;">
                                    🚀 REALIZAR CHECK-IN
                                </button>` : 
                                `<div style="flex: 1; text-align: center; padding: 12px; background: #dcfce7; color: #166534; border-radius: 8px; font-weight: bold;">
                                    ✅ HUÉSPED EN HABITACIÓN
                                </div>`
                            }
                            <button onclick="Swal.close()" class="swal2-styled" style="background-color: #64748b; flex: 1; border: none; padding: 12px; border-radius: 8px; color: white; cursor: pointer;">CERRAR DETALLES</button>
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
            
            const tituloEvento = esCheckIn 
                ? `[Hab. ${r.habitacion}] ✅ ${r.huesped}` 
                : `Hab. ${r.habitacion} - ${r.huesped}`;

            eventosFull.push({
                id: doc.id,
                title: tituloEvento,
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