import { db } from "./firebaseconfig.js";
// 1. IMPORTACIONES CORRECTAS DESDE EL INICIO
import { 
    collection, onSnapshot, doc, updateDoc, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

            const esCheckIn = res.estado === 'checkin' || res.estado === 'finalizado';
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
                            </div>
                            <div style="background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0;">
                                <h4 style="margin: 0 0 10px 0; color: #1e293b;">📅 Fechas y Horas</h4>
                                <p style="margin:2px 0;"><b>Check-In:</b> ${res.checkIn} ${res.early ? '('+res.early+')' : ''}</p>
                                <p style="margin:2px 0;"><b>Check-Out:</b> ${res.checkOut} ${res.late ? '('+res.late+')' : ''}</p>
                                <p style="margin:2px 0;"><b>Cochera:</b> ${res.cochera || 'NO'}</p>
                            </div>
                        </div>

                        <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; border: 1px solid #dcfce7; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; color: #166534;">💰 Liquidación de Cuenta</h4>
                            <p style="margin:2px 0;"><b>Total:</b> ${simbolo} ${res.total}</p>
                            <p style="margin:2px 0; color: #dc2626;"><b>Pendiente:</b> S/ ${res.diferencia || '0.00'}</p>
                        </div>

                        <div style="margin-top: 20px; display: flex; gap: 10px;">
                            ${!esCheckIn ? 
                                `<button id="btnCheckIn" class="swal2-styled" style="background-color: #10b981; flex: 1; border: none; padding: 12px; border-radius: 8px; color: white; cursor: pointer; font-weight: bold;">
                                    🚀 REALIZAR CHECK-IN
                                </button>` : 
                                `<div style="flex: 1; text-align: center; padding: 12px; background: #dcfce7; color: #166534; border-radius: 8px; font-weight: bold;">
                                    ${res.estado === 'checkin' ? '✅ HUÉSPED EN CASA' : '🏁 ESTADÍA FINALIZADA'}
                                </div>`
                            }
                            <button onclick="Swal.close()" class="swal2-styled" style="background-color: #64748b; flex: 1; border: none; padding: 12px; border-radius: 8px; color: white; cursor: pointer;">CERRAR</button>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                didOpen: () => {
                    const btn = document.getElementById('btnCheckIn');
                    if(btn) {
                        btn.addEventListener('click', async () => {
                            try {
                                // 1. Actualizar Reserva
                                await updateDoc(doc(db, "reservas", resId), { estado: "checkin" });

                                // 2. Actualizar Habitación (Uso de Number para evitar fallos)
                                const qHab = query(collection(db, "habitaciones"), where("numero", "==", Number(res.habitacion)));
                                const snapHab = await getDocs(qHab);
                                
                                if (!snapHab.empty) {
                                    await updateDoc(doc(db, "habitaciones", snapHab.docs[0].id), { estado: "Ocupada" });
                                }

                                Swal.fire('¡Éxito!', 'Check-in registrado.', 'success');
                            } catch (e) {
                                console.error(e);
                                Swal.fire('Error', 'No se pudo actualizar.', 'error');
                            }
                        });
                    }
                }
            });
        }
    });

    calendar.render();

    // --- ESCUCHADOR EN TIEMPO REAL ---
    onSnapshot(collection(db, "reservas"), (snapshot) => {
        const eventos = [];
        snapshot.docs.forEach(docSnap => {
            const r = docSnap.data();
            const esPasado = (r.estado === 'checkin' || r.estado === 'finalizado');
            
            let titulo = `Hab. ${r.habitacion} - ${r.huesped}`;
            if(r.estado === 'checkin') titulo = `✅ [Hab. ${r.habitacion}] ${r.huesped}`;
            if(r.estado === 'finalizado') titulo = `🏁 [Hab. ${r.habitacion}] ${r.huesped}`;

            eventos.push({
                id: docSnap.id,
                title: titulo,
                start: r.early ? `${r.checkIn}T${r.early}:00` : r.checkIn,
                end: r.late ? `${r.checkOut}T${r.late}:00` : r.checkOut,
                backgroundColor: esPasado ? '#ffffff' : (coloresMedio[r.medio?.toLowerCase().trim()] || '#800020'),
                textColor: esPasado ? '#475569' : '#ffffff',
                borderColor: esPasado ? '#cbd5e1' : 'transparent',
                extendedProps: { dataReserva: { ...r, id: docSnap.id } }
            });
        });
        calendar.removeAllEvents();
        calendar.addEventSource(eventos);
    });
});