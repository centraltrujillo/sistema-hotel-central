import { db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, doc, updateDoc, query, where, getDocs, deleteDoc 
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

            // --- FUNCIÓN DEL EDITOR INTEGRAL ---
            const abrirEdicionIntegral = () => {
                Swal.fire({
                    title: `<span style="font-family: 'Playfair Display'; color: #800020;">Editor de Reserva Integral</span>`,
                    width: '1100px',
                    html: `
                        <div id="swal-form-reserva">
                            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 10px;">
                                
                                <div style="grid-column: span 2;"><label>NOMBRES Y APELLIDOS</label><input id="sw-huesped" class="swal2-input" value="${res.huesped}"></div>
                                <div><label>DNI / PASSPORT</label><input id="sw-doc" class="swal2-input" value="${res.doc || ''}"></div>
                                <div><label>FECHA NACIMIENTO</label><input type="date" id="sw-nacimiento" class="swal2-input" value="${res.nacimiento || ''}"></div>
                                
                                <div><label>NACIONALIDAD</label><input id="sw-nacionalidad" class="swal2-input" value="${res.nacionalidad || ''}"></div>
                                <div><label>TELÉFONO</label><input id="sw-telefono" class="swal2-input" value="${res.telefono || ''}"></div>
                                <div style="grid-column: span 2;"><label>CORREO</label><input id="sw-correo" class="swal2-input" value="${res.correo || ''}"></div>

                                <div>
                                    <label>TIPO HABITACIÓN</label>
                                    <select id="sw-tipoHab" class="swal2-select">
                                        <option value="SIMPLE" ${res.tipoHab === 'SIMPLE' ? 'selected' : ''}>SIMPLE</option>
                                        <option value="MATRIMONIAL" ${res.tipoHab === 'MATRIMONIAL' ? 'selected' : ''}>MATRIMONIAL</option>
                                        <option value="DOBLE" ${res.tipoHab === 'DOBLE' ? 'selected' : ''}>DOBLE</option>
                                        <option value="TRIPLE" ${res.tipoHab === 'TRIPLE' ? 'selected' : ''}>TRIPLE</option>
                                    </select>
                                </div>
                                <div><label>HABITACIÓN #</label><input id="sw-habitacion" class="swal2-input" value="${res.habitacion}" readonly></div>
                                <div><label>CHECK IN</label><input type="date" id="sw-in" class="swal2-input" value="${res.checkIn}"></div>
                                <div><label>CHECK OUT</label><input type="date" id="sw-out" class="swal2-input" value="${res.checkOut}"></div>

                                <div>
                                    <label>MEDIO DE RESERVA</label>
                                    <select id="sw-medio" class="swal2-select">
                                        ${Object.keys(coloresMedio).map(m => `<option value="${m}" ${res.medio?.toLowerCase() === m ? 'selected' : ''}>${m.toUpperCase()}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label>MONEDA</label>
                                    <select id="sw-moneda" class="swal2-select">
                                        <option value="PEN" ${res.moneda === 'PEN' ? 'selected' : ''}>Soles (S/)</option>
                                        <option value="USD" ${res.moneda === 'USD' ? 'selected' : ''}>Dólares ($)</option>
                                    </select>
                                </div>
                                <div><label>TIPO CAMBIO</label><input type="number" id="sw-tc" class="swal2-input" value="${res.tipoCambio || '3.80'}" step="0.01"></div>
                                <div><label>TARIFA DIARIA</label><input type="number" id="sw-tarifa" class="swal2-input" value="${res.tarifa}"></div>

                                <div><label>EARLY CHECK-IN</label><input type="time" id="sw-early" class="swal2-input" value="${res.early || ''}"></div>
                                <div><label>LATE CHECK-OUT</label><input type="time" id="sw-late" class="swal2-input" value="${res.late || ''}"></div>
                                <div><label>TOTAL ALOJAMIENTO</label><input type="number" id="sw-total" class="swal2-input" value="${res.total}"></div>
                                <div><label>DIFERENCIA A PAGAR</label><input type="number" id="sw-diferencia" class="swal2-input" value="${res.diferencia || '0.00'}" readonly></div>

                                <div style="grid-column: span 2;"><label>PAGOS ADELANTADOS (MONTO/FECHA/MEDIO)</label><input id="sw-adelanto" class="swal2-input" value="${res.adelanto || ''}"></div>
                                <div><label>COCHERA</label><input id="sw-cochera" class="swal2-input" value="${res.cochera || ''}" placeholder="SI/NO - Lugar"></div>
                                <div><label>TRASLADO</label><input id="sw-traslado" class="swal2-input" value="${res.traslado || ''}"></div>

                                <div><label>DESAYUNO</label><select id="sw-desayuno" class="swal2-select"><option value="CON DESAYUNO" ${res.desayuno === 'CON DESAYUNO' ? 'selected' : ''}>CON DESAYUNO</option><option value="SIN DESAYUNO" ${res.desayuno === 'SIN DESAYUNO' ? 'selected' : ''}>SIN DESAYUNO</option></select></div>
                                <div><label>RECEPCIONADO</label><input id="sw-recepcion" class="swal2-input" value="${res.recepcion || ''}"></div>
                                <div style="grid-column: span 2;"><label>RESERVA CONFIRMADA POR</label><input id="sw-recepcionconfi" class="swal2-input" value="${res.recepcionconfi || ''}"></div>
                            </div>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: '💾 GUARDAR CAMBIOS',
                    confirmButtonColor: '#800020',
                    cancelButtonColor: '#64748b',
                    didOpen: () => {
                        const inputsCalc = ['sw-tarifa', 'sw-in', 'sw-out', 'sw-tc', 'sw-moneda', 'sw-adelanto'];
                        const ejecutarCalculo = () => {
                            const tDiaria = parseFloat(document.getElementById('sw-tarifa').value) || 0;
                            const tCambio = parseFloat(document.getElementById('sw-tc').value) || 1;
                            const mon = document.getElementById('sw-moneda').value;
                            const fIn = new Date(document.getElementById('sw-in').value);
                            const fOut = new Date(document.getElementById('sw-out').value);
                            
                            if (fOut > fIn) {
                                const noches = Math.ceil(Math.abs(fOut - fIn) / (1000 * 60 * 60 * 24));
                                let tAlojamiento = noches * tDiaria;
                                if (mon === "USD") tAlojamiento *= tCambio;
                                document.getElementById('sw-total').value = tAlojamiento.toFixed(2);
                            }

                            const tAloj = parseFloat(document.getElementById('sw-total').value) || 0;
                            const adelantoStr = document.getElementById('sw-adelanto').value;
                            const adelantoNum = parseFloat(adelantoStr.match(/(\d+(\.\d+)?)/)?.[0]) || 0;
                            document.getElementById('sw-diferencia').value = (tAloj - adelantoNum).toFixed(2);
                        };
                        inputsCalc.forEach(id => document.getElementById(id).addEventListener('input', ejecutarCalculo));
                        document.getElementById('sw-moneda').addEventListener('change', ejecutarCalculo);
                    },
                    preConfirm: () => {
                        return {
                            huesped: document.getElementById('sw-huesped').value,
                            doc: document.getElementById('sw-doc').value,
                            nacimiento: document.getElementById('sw-nacimiento').value,
                            nacionalidad: document.getElementById('sw-nacionalidad').value,
                            telefono: document.getElementById('sw-telefono').value,
                            correo: document.getElementById('sw-correo').value,
                            tipoHab: document.getElementById('sw-tipoHab').value,
                            checkIn: document.getElementById('sw-in').value,
                            checkOut: document.getElementById('sw-out').value,
                            medio: document.getElementById('sw-medio').value,
                            moneda: document.getElementById('sw-moneda').value,
                            tipoCambio: document.getElementById('sw-tc').value,
                            tarifa: document.getElementById('sw-tarifa').value,
                            total: document.getElementById('sw-total').value,
                            adelanto: document.getElementById('sw-adelanto').value,
                            diferencia: document.getElementById('sw-diferencia').value,
                            early: document.getElementById('sw-early').value,
                            late: document.getElementById('sw-late').value,
                            desayuno: document.getElementById('sw-desayuno').value,
                            cochera: document.getElementById('sw-cochera').value,
                            traslado: document.getElementById('sw-traslado').value,
                            recepcion: document.getElementById('sw-recepcion').value,
                            recepcionconfi: document.getElementById('sw-recepcionconfi').value
                        };
                    }
                }).then(async (resEdicion) => {
                    if (resEdicion.isConfirmed) {
                        try {
                            await updateDoc(doc(db, "reservas", resId), resEdicion.value);
                            Swal.fire({ icon: 'success', title: 'Actualizado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                        } catch (e) { Swal.fire('Error', 'No se pudo guardar', 'error'); }
                    }
                });
            };

            // --- VISTA INICIAL DE DETALLES ---
            const mSymbol = res.moneda === 'USD' ? '$' : 'S/';
            // Cálculo visual de conversión si es Dólares
            const totalSoles = res.moneda === 'USD' ? (parseFloat(res.total) * parseFloat(res.tipoCambio || 1)).toFixed(2) : res.total;

            Swal.fire({
                title: `<span style="font-family: 'Playfair Display'; color: #800020; font-size: 26px;">Detalle de la Reserva</span>`,
                width: '900px',
                html: `
                    <div style="text-align: left; font-family: 'Lato'; border-top: 3px solid #d4a017; padding-top: 15px;">
                        
                        <div style="background: #fffaf0; padding: 15px; border-radius: 10px; border: 1px solid #fef3c7; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 10px 0; color: #800020; border-bottom: 1px solid #fde68a;">👤 Información del Huésped</h4>
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 14px;">
                                <p style="grid-column: span 2;"><b>Nombre:</b> ${res.huesped}</p>
                                <p><b>Documento:</b> ${res.doc || 'N/A'}</p>
                                <p><b>Teléfono:</b> ${res.telefono || 'N/A'}</p>
                                <p><b>Nacionalidad:</b> ${res.nacionalidad || 'N/A'}</p>
                                <p><b>F. Nacimiento:</b> ${res.nacimiento || 'N/A'}</p>
                                <p style="grid-column: span 3;"><b>Correo:</b> ${res.correo || 'N/A'}</p>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 15px;">
                            <div style="background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0;">
                                <h4 style="color: #1e293b; margin-top:0;">🏨 Estancia y Habitación</h4>
                                <div style="font-size: 14px; line-height: 1.6;">
                                    <p><b>Habitación:</b> <span style="background:#800020; color:white; padding:2px 8px; border-radius:4px;">${res.habitacion} (${res.tipoHab})</span></p>
                                    <p><b>Check-In:</b> ${res.checkIn} ${res.early ? `<span style="color:#3b82f6;">(Early: ${res.early})</span>` : ''}</p>
                                    <p><b>Check-Out:</b> ${res.checkOut} ${res.late ? `<span style="color:#f43f5e;">(Late: ${res.late})</span>` : ''}</p>
                                    <p><b>Medio:</b> <span style="text-transform: uppercase; font-weight:bold; color:#6366f1;">${res.medio}</span></p>
                                    <p><b>Desayuno:</b> ${res.desayuno || 'N/A'}</p>
                                </div>
                            </div>

                            <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; border: 1px solid #dcfce7;">
                                <h4 style="color: #166534; margin-top:0;">💰 Resumen Económico</h4>
                                <div style="font-size: 14px; line-height: 1.6;">
                                    <p><b>Tarifa Diaria:</b> ${mSymbol}${res.tarifa}</p>
                                    <p><b>Total Alojamiento:</b> <span style="font-size: 16px; font-weight: bold;">${mSymbol}${res.total}</span></p>
                                    ${res.moneda === 'USD' ? `<p style="color: #065f46; font-size: 12px; margin-top:-5px;">(Equivale a: <b>S/ ${totalSoles}</b> al T.C. ${res.tipoCambio})</p>` : ''}
                                    <p><b>Adelanto:</b> ${res.adelanto || 'Ninguno'}</p>
                                    <hr style="border:0; border-top:1px solid #bbf7d0; margin: 8px 0;">
                                    <p style="color: #dc2626; font-size: 16px;"><b>Pendiente:</b> S/ ${res.diferencia || '0.00'}</p>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 15px; background: #f1f5f9; padding: 12px; border-radius: 10px; font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                                <p><b>🚗 Cochera:</b> ${res.cochera || 'NO'}</p>
                                <p><b>✈️ Traslado:</b> ${res.traslado || 'NO'}</p>
                            </div>
                            <div>
                                <p><b>🔑 Recibido por:</b> ${res.recepcion || 'N/A'}</p>
                                <p><b>✔️ Confirmado por:</b> ${res.recepcionconfi || 'N/A'}</p>
                            </div>
                        </div>

                        <div style="margin-top: 20px; display: flex; gap: 10px;">
                            ${!esCheckIn ? 
                                `<button id="btnCheckIn" class="swal2-styled" style="background-color: #10b981; flex: 1.5; font-weight: bold;">🚀 REALIZAR CHECK-IN</button>` : 
                                `<div style="flex: 1.5; text-align: center; padding: 12px; background: #dcfce7; color: #166534; border-radius: 8px; font-weight: bold;">${res.estado === 'checkin' ? '✅ EL HUÉSPED ESTÁ EN CASA' : '🏁 RESERVA FINALIZADA'}</div>`
                            }
                            <button id="btnOpenEdit" class="swal2-styled" style="background-color: #3b82f6; flex: 1;">📝 EDITAR</button>
                            <button id="btnEliminarRes" class="swal2-styled" style="background-color: #ef4444; flex: 1;">🗑️ ELIMINAR</button>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                didOpen: () => {
                    // (Tus funciones de botones existentes se mantienen igual)
                    document.getElementById('btnOpenEdit').onclick = () => abrirEdicionIntegral();
                    
                    const btnCheck = document.getElementById('btnCheckIn');
                    if(btnCheck) {
                        btnCheck.onclick = async () => {
                            await updateDoc(doc(db, "reservas", resId), { estado: "checkin" });
                            const qHab = query(collection(db, "habitaciones"), where("numero", "==", Number(res.habitacion)));
                            const snapHab = await getDocs(qHab);
                            if (!snapHab.empty) await updateDoc(doc(db, "habitaciones", snapHab.docs[0].id), { estado: "Ocupada" });
                            Swal.fire('¡Éxito!', 'Huésped ingresado.', 'success');
                        };
                    }

                    document.getElementById('btnEliminarRes').onclick = async () => {
                        const confirm = await Swal.fire({ title: '¿Eliminar reserva?', text: "Esta acción no se puede deshacer", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Sí, eliminar' });
                        if(confirm.isConfirmed) {
                            await deleteDoc(doc(db, "reservas", resId));
                            Swal.fire('Eliminado', 'La reserva ha sido borrada.', 'success');
                        }
                    };
                }
            });
        }
    });

    calendar.render();

    onSnapshot(collection(db, "reservas"), (snap) => {
        const evs = [];
        snap.docs.forEach(dSnap => {
            const r = dSnap.data();
            const esPasado = (r.estado === 'checkin' || r.estado === 'finalizado');
            let titulo = `Hab. ${r.habitacion} - ${r.huesped}`;
            if(r.estado === 'checkin') titulo = `✅ [Hab. ${r.habitacion}] ${r.huesped}`;
            
            evs.push({
                id: dSnap.id,
                title: titulo,
                start: r.early ? `${r.checkIn}T${r.early}:00` : r.checkIn,
                end: r.late ? `${r.checkOut}T${r.late}:00` : r.checkOut,
                backgroundColor: esPasado ? '#ffffff' : (coloresMedio[r.medio?.toLowerCase().trim()] || '#800020'),
                textColor: esPasado ? '#475569' : '#ffffff',
                borderColor: esPasado ? '#cbd5e1' : 'transparent',
                extendedProps: { dataReserva: { ...r, id: dSnap.id } }
            });
        });
        calendar.removeAllEvents();
        calendar.addEventSource(evs);
    });
});