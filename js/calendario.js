import { db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, doc, updateDoc, query, where, getDocs, deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    // Configuración de colores por medio
    const coloresMedio = {
        'booking': '#3b82f6', 'airbnb': '#f43f5e', 'directas': '#8b5cf6',
        'expedia': '#f59e0b', 'personal': '#10b981', 'day use': '#6366f1',
        'mantenimiento': '#fa051a', 'gmail': '#59ea35'
    };

    // 1. GENERAR LA ESTRUCTURA DE LA TABLA (TIPO GANTT/EXCEL)
    function generarCalendarioGantt(mes, anio) {
        const contenedor = document.getElementById('gantt-container');
        if (!contenedor) return;

        const diasEnMes = new Date(anio, mes + 1, 0).getDate();
        
        let html = `
            <table class="gantt-table">
                <thead>
                    <tr>
                        <th class="sticky-col">HABITACIONES</th>`;
        
        for (let i = 1; i <= diasEnMes; i++) {
            html += `<th>${i}</th>`;
        }
        html += `</tr></thead><tbody>`;

        const habitaciones = ["201", "202", "203", "204", "301", "302", "303", "304", "305", "401", "402", "403", "404"];

        habitaciones.forEach(num => {
            html += `<tr><td class="sticky-col hab-name">Hab. ${num}</td>`;
            for (let i = 1; i <= diasEnMes; i++) {
                const fechaId = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                html += `<td id="cell-${num}-${fechaId}" class="calendar-cell"></td>`;
            }
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        contenedor.innerHTML = html;
        
        escucharReservas();
    }

    // 2. ESCUCHAR CAMBIOS EN FIREBASE Y PINTAR
    function escucharReservas() {
        onSnapshot(collection(db, "reservas"), (snap) => {
            // Limpiar todas las celdas antes de repintar
            document.querySelectorAll('.calendar-cell').forEach(c => {
                c.innerHTML = '';
                c.style.backgroundColor = 'transparent';
                c.onclick = null;
                c.classList.remove('has-reservation');
            });

            snap.docs.forEach(dSnap => {
                const res = dSnap.data();
                const resId = dSnap.id;
                
                // Corregir desfase de fechas al crear objeto Date
                const inicio = new Date(res.checkIn + "T12:00:00");
                const fin = new Date(res.checkOut + "T12:00:00");
                
                let actual = new Date(inicio);
                while (actual < fin) {
                    const fechaStr = actual.toISOString().split('T')[0];
                    const celda = document.getElementById(`cell-${res.habitacion}-${fechaStr}`);
                    
                    if (celda) {
                        celda.style.backgroundColor = coloresMedio[res.medio?.toLowerCase().trim()] || '#800020';
                        celda.classList.add('has-reservation');
                        celda.onclick = () => verDetalleReserva(res, resId);
                        
                        // Nombre en la primera celda del rango
                        if (actual.getTime() === inicio.getTime()) {
                            celda.innerHTML = `<span class="res-label">${res.huesped.split(' ')[0]}</span>`;
                        }
                    }
                    actual.setDate(actual.getDate() + 1);
                }
            });
        });
    }

    // 3. MODAL DE EDICIÓN INTEGRAL
    const abrirEdicionIntegral = (res, resId) => {
        Swal.fire({
            title: `<span style="font-family: 'Playfair Display'; color: #800020;">Editor de Reserva Integral</span>`,
            width: '1100px',
            html: `
                <div id="swal-form-reserva">
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 10px; text-align: left;">
                        <div style="grid-column: span 2;"><label>NOMBRES Y APELLIDOS</label><input id="sw-huesped" class="swal2-input" value="${res.huesped}"></div>
                        <div><label>DNI / PASSPORT</label><input id="sw-doc" class="swal2-input" value="${res.doc || ''}"></div>
                        <div><label>FECHA NACIMIENTO</label><input type="date" id="sw-nacimiento" class="swal2-input" value="${res.nacimiento || ''}"></div>
                        <div><label>NACIONALIDAD</label><input id="sw-nacionalidad" class="swal2-input" value="${res.nacionalidad || ''}"></div>
                        <div><label>TELÉFONO</label><input id="sw-telefono" class="swal2-input" value="${res.telefono || ''}"></div>
                        <div style="grid-column: span 2;"><label>CORREO</label><input id="sw-correo" class="swal2-input" value="${res.correo || ''}"></div>
                        <div><label>HABITACIÓN #</label><input id="sw-habitacion" class="swal2-input" value="${res.habitacion}" readonly></div>
                        <div><label>CHECK IN</label><input type="date" id="sw-in" class="swal2-input" value="${res.checkIn}"></div>
                        <div><label>CHECK OUT</label><input type="date" id="sw-out" class="swal2-input" value="${res.checkOut}"></div>
                        <div>
                            <label>MEDIO DE RESERVA</label>
                            <select id="sw-medio" class="swal2-select" style="width:100%">
                                ${Object.keys(coloresMedio).map(m => `<option value="${m}" ${res.medio?.toLowerCase() === m ? 'selected' : ''}>${m.toUpperCase()}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label>MONEDA</label>
                            <select id="sw-moneda" class="swal2-select" style="width:100%">
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
                        <div style="grid-column: span 2;"><label>PAGOS ADELANTADOS</label><input id="sw-adelanto" class="swal2-input" value="${res.adelanto || ''}"></div>
                        <div><label>COCHERA</label><input id="sw-cochera" class="swal2-input" value="${res.cochera || ''}"></div>
                        <div><label>TRASLADO</label><input id="sw-traslado" class="swal2-input" value="${res.traslado || ''}"></div>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '💾 GUARDAR CAMBIOS',
            confirmButtonColor: '#800020',
            preConfirm: () => {
                return {
                    huesped: document.getElementById('sw-huesped').value,
                    doc: document.getElementById('sw-doc').value,
                    checkIn: document.getElementById('sw-in').value,
                    checkOut: document.getElementById('sw-out').value,
                    medio: document.getElementById('sw-medio').value,
                    tarifa: document.getElementById('sw-tarifa').value,
                    total: document.getElementById('sw-total').value,
                    moneda: document.getElementById('sw-moneda').value,
                    diferencia: document.getElementById('sw-diferencia').value
                    // Agrega aquí los demás campos si los necesitas guardar
                };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                await updateDoc(doc(db, "reservas", resId), result.value);
                Swal.fire('¡Actualizado!', '', 'success');
            }
        });
    };

    // 4. VISTA DETALLE (MODAL PRINCIPAL)
    function verDetalleReserva(res, resId) {
        const mSymbol = res.moneda === 'USD' ? '$' : 'S/';
        const totalSoles = res.moneda === 'USD' ? (parseFloat(res.total) * parseFloat(res.tipoCambio || 1)).toFixed(2) : res.total;
        const esCheckIn = res.estado === 'checkin';

        Swal.fire({
            title: `<span style="font-family: 'Playfair Display'; color: #800020; font-size: 26px;">Detalle de la Reserva</span>`,
            width: '900px',
            html: `
                <div style="text-align: left; font-family: 'Lato'; border-top: 3px solid #d4a017; padding-top: 15px;">
                    <div style="background: #fffaf0; padding: 15px; border-radius: 10px; border: 1px solid #fef3c7; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #800020;">👤 Información del Huésped</h4>
                        <p><b>Nombre:</b> ${res.huesped} | <b>Documento:</b> ${res.doc || 'N/A'}</p>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div style="background: #f8fafc; padding: 15px; border-radius: 10px;">
                            <h4>🏨 Estancia</h4>
                            <p><b>Habitación:</b> ${res.habitacion}</p>
                            <p><b>Check-In:</b> ${res.checkIn}</p>
                            <p><b>Check-Out:</b> ${res.checkOut}</p>
                        </div>
                        <div style="background: #f0fdf4; padding: 15px; border-radius: 10px;">
                            <h4>💰 Pagos</h4>
                            <p><b>Total:</b> ${mSymbol}${res.total}</p>
                            <p style="color:red"><b>Pendiente:</b> S/ ${res.diferencia || '0.00'}</p>
                        </div>
                    </div>
                    <div style="margin-top: 20px; display: flex; gap: 10px;">
                        ${!esCheckIn ? `<button id="btnCheckIn" class="swal2-confirm swal2-styled" style="background:#10b981; flex:1">🚀 CHECK-IN</button>` : ''}
                        <button id="btnOpenEdit" class="swal2-confirm swal2-styled" style="background:#3b82f6; flex:1">📝 EDITAR</button>
                        <button id="btnEliminarRes" class="swal2-confirm swal2-styled" style="background:#ef4444; flex:1">🗑️ ELIMINAR</button>
                    </div>
                </div>
            `,
            showConfirmButton: false,
            didOpen: () => {
                document.getElementById('btnOpenEdit').onclick = () => abrirEdicionIntegral(res, resId);
                
                document.getElementById('btnEliminarRes').onclick = async () => {
                    const confirm = await Swal.fire({ title: '¿Eliminar?', showCancelButton: true });
                    if(confirm.isConfirmed) {
                        await deleteDoc(doc(db, "reservas", resId));
                        Swal.close();
                    }
                };

                const btnCheck = document.getElementById('btnCheckIn');
                if(btnCheck) {
                    btnCheck.onclick = async () => {
                        await updateDoc(doc(db, "reservas", resId), { estado: "checkin" });
                        // Lógica para marcar habitación ocupada
                        const qHab = query(collection(db, "habitaciones"), where("numero", "==", Number(res.habitacion)));
                        const snapHab = await getDocs(qHab);
                        if (!snapHab.empty) await updateDoc(doc(db, "habitaciones", snapHab.docs[0].id), { estado: "Ocupada" });
                        Swal.fire('¡Éxito!', 'Check-in realizado', 'success');
                    };
                }
            }
        });
    }

    // INICIAR: Marzo 2026 (Mes 2)
    generarCalendarioGantt(2, 2026);
});