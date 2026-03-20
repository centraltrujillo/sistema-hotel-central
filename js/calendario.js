import { db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, doc, updateDoc, query, where, getDocs, deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    // --- CONFIGURACIÓN GLOBAL ---
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    let mesActual = new Date().getMonth();
    let anioActual = new Date().getFullYear();

    const coloresMedio = {
        'booking': '#3b82f6', 'airbnb': '#f43f5e', 'directas': '#8b5cf6',
        'expedia': '#f59e0b', 'personal': '#10b981', 'day use': '#6366f1',
        'mantenimiento': '#fa051a', 'gmail': '#59ea35'
    };

// --- CONFIGURACIÓN GLOBAL ---
let habitaciones = []; // Ahora empezará vacío y se llenará desde Firebase

async function cargarHabitacionesDesdeFirebase() {
    try {
        const querySnapshot = await getDocs(collection(db, "habitaciones"));
        habitaciones = []; // Limpiamos el array
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Guardamos un objeto con el número y el tipo
            habitaciones.push({
                numero: data.numero,
                tipo: data.tipo || "S/T" // "S/T" por si no tiene tipo asignado
            });
        });

        // Opcional: Ordenar por número de habitación
        habitaciones.sort((a, b) => a.numero - b.numero);

        // Una vez que tenemos los datos, generamos el calendario
        generarCalendarioGantt();
    } catch (error) {
        console.error("Error cargando habitaciones:", error);
    }
}



    // --- 1. INICIALIZAR CONTROLES DEL HEADER ---
    function inicializarControles() {
        const monthSelect = document.getElementById('select-month');
        const yearSelect = document.getElementById('select-year');
        const btnToday = document.getElementById('btn-go-today');

        if(monthSelect) {
            meses.forEach((m, i) => {
                monthSelect.innerHTML += `<option value="${i}" ${i === mesActual ? 'selected' : ''}>${m}</option>`;
            });
            monthSelect.onchange = (e) => { mesActual = parseInt(e.target.value); generarCalendarioGantt(); };
        }

        if(yearSelect) {
            for (let i = 2025; i <= 2027; i++) {
                yearSelect.innerHTML += `<option value="${i}" ${i === anioActual ? 'selected' : ''}>${i}</option>`;
            }
            yearSelect.onchange = (e) => { anioActual = parseInt(e.target.value); generarCalendarioGantt(); };
        }
        
        if (btnToday) {
            btnToday.onclick = () => {
                const hoy = new Date();
                mesActual = hoy.getMonth();
                anioActual = hoy.getFullYear();
                if(monthSelect) monthSelect.value = mesActual;
                if(yearSelect) yearSelect.value = anioActual;
                generarCalendarioGantt();
            };
        }
    }

    // --- 2. GENERAR ESTRUCTURA GANTT ---
    function generarCalendarioGantt() {
        const contenedor = document.getElementById('gantt-container');
        const displayMes = document.getElementById('current-month-display');
        if (!contenedor) return;

        if(displayMes) displayMes.innerText = `${meses[mesActual]} ${anioActual}`;
        
        const diasEnMes = new Date(anioActual, mesActual + 1, 0).getDate();
        const fechaHoy = new Date();
        const esMismoMesYAno = (fechaHoy.getMonth() === mesActual && fechaHoy.getFullYear() === anioActual);

        let html = `<table class="gantt-table">
            <thead>
                <tr>
                    <th class="sticky-col">HABITACIONES</th>`;
        
        for (let i = 1; i <= diasEnMes; i++) {
            const esHoy = (esMismoMesYAno && fechaHoy.getDate() === i);
            const fechaObj = new Date(anioActual, mesActual, i);
            const diaSemana = fechaObj.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase();
            html += `<th class="${esHoy ? 'today-header' : ''}">${i}<br><span style="font-size:9px; opacity:0.7">${diaSemana}</span></th>`;
        }
        html += `</tr></thead><tbody>`;

        habitaciones.forEach(hab => {
    // Usamos hab.numero y hab.tipo para la etiqueta
    html += `<tr><td class="sticky-col hab-name">${hab.numero} - ${hab.tipo}</td>`;
    
    for (let i = 1; i <= diasEnMes; i++) {
        const esHoy = (esMismoMesYAno && fechaHoy.getDate() === i);
        const fechaId = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // Importante: El ID de la celda sigue usando solo el número para vincular con las reservas
        html += `<td id="cell-${hab.numero}-${fechaId}" class="calendar-cell ${esHoy ? 'today-column' : ''}"></td>`;
    }
    html += `</tr>`;
});

        html += `</tbody></table>`;
        contenedor.innerHTML = html;
        escucharReservas();
    }

    // --- 3. ESCUCHAR FIREBASE ---
    function escucharReservas() {
        onSnapshot(collection(db, "reservas"), (snap) => {
            document.querySelectorAll('.calendar-cell').forEach(c => {
                c.innerHTML = '';
                c.style.backgroundColor = 'transparent';
                c.onclick = null;
                c.classList.remove('has-reservation');
            });

            snap.docs.forEach(dSnap => {
                const res = dSnap.data();
                const resId = dSnap.id;
                
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
                        
                        if (actual.getTime() === inicio.getTime()) {
                            celda.innerHTML = `<span class="res-label">${res.huesped.split(' ')[0]}</span>`;
                        }
                    }
                    actual.setDate(actual.getDate() + 1);
                }
            });
        });
    }

    // --- 4. MODAL DE EDICIÓN CON CÁLCULOS ---
    const abrirEdicionIntegral = (res, resId) => {
        Swal.fire({
            title: `<span style="font-family: 'Playfair Display'; color: #800020;">Editar Reserva</span>`,
            width: '1100px',
            html: `
                <div id="swal-form-reserva">
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 10px; text-align: left;">
                        <div style="grid-column: span 2;"><label>HUESPED</label><input id="sw-huesped" class="swal2-input" value="${res.huesped}"></div>
                        <div><label>DNI/PXP</label><input id="sw-doc" class="swal2-input" value="${res.doc || ''}"></div>
                        <div><label>TELÉFONO</label><input id="sw-telefono" class="swal2-input" value="${res.telefono || ''}"></div>
                        
                        <div><label>HAB #</label><input id="sw-habitacion" class="swal2-input" value="${res.habitacion}" readonly></div>
                        <div><label>CHECK IN</label><input type="date" id="sw-in" class="swal2-input" value="${res.checkIn}"></div>
                        <div><label>CHECK OUT</label><input type="date" id="sw-out" class="swal2-input" value="${res.checkOut}"></div>
                        <div><label>MEDIO</label>
                            <select id="sw-medio" class="swal2-select" style="width:100%">
                                ${Object.keys(coloresMedio).map(m => `<option value="${m}" ${res.medio?.toLowerCase() === m ? 'selected' : ''}>${m.toUpperCase()}</option>`).join('')}
                            </select>
                        </div>

                        <div><label>MONEDA</label>
                            <select id="sw-moneda" class="swal2-select" style="width:100%">
                                <option value="PEN" ${res.moneda === 'PEN' ? 'selected' : ''}>Soles (S/)</option>
                                <option value="USD" ${res.moneda === 'USD' ? 'selected' : ''}>Dólares ($)</option>
                            </select>
                        </div>
                        <div><label>TIPO CAMBIO</label><input type="number" id="sw-tc" class="swal2-input" value="${res.tipoCambio || '3.80'}" step="0.01"></div>
                        <div><label>TOTAL ALOJAMIENTO</label><input type="number" id="sw-total" class="swal2-input" value="${res.total}"></div>
                        <div><label>ADELANTO (S/)</label><input type="number" id="sw-adelanto" class="swal2-input" value="${res.adelanto || '0.00'}"></div>
                        
                        <div style="grid-column: span 4; background: #fff5f5; padding: 10px; border-radius: 8px; border: 1px dashed #feb2b2;">
                            <label style="color: #c53030; font-weight: 800;">DIFERENCIA PENDIENTE (S/)</label>
                            <input id="sw-diferencia" class="swal2-input" style="color: #c53030; font-weight: bold; background: white;" value="${res.diferencia || '0.00'}" readonly>
                        </div>
                    </div>
                </div>
            `,
            didOpen: () => {
                const totalInput = document.getElementById('sw-total');
                const adelantoInput = document.getElementById('sw-adelanto');
                const tcInput = document.getElementById('sw-tc');
                const monedaSelect = document.getElementById('sw-moneda');
                const diferenciaInput = document.getElementById('sw-diferencia');

                const calcular = () => {
                    let total = parseFloat(totalInput.value) || 0;
                    let adelanto = parseFloat(adelantoInput.value) || 0;
                    let tc = parseFloat(tcInput.value) || 3.80;
                    
                    // Si es dólares, convertimos el total a soles para restar el adelanto (que suele ser en soles)
                    if (monedaSelect.value === 'USD') total = total * tc;
                    
                    diferenciaInput.value = (total - adelanto).toFixed(2);
                };

                [totalInput, adelantoInput, tcInput, monedaSelect].forEach(el => el.addEventListener('input', calcular));
            },
            showCancelButton: true,
            confirmButtonText: '💾 GUARDAR',
            confirmButtonColor: '#800020',
            preConfirm: () => {
                return {
                    huesped: document.getElementById('sw-huesped').value,
                    doc: document.getElementById('sw-doc').value,
                    telefono: document.getElementById('sw-telefono').value,
                    checkIn: document.getElementById('sw-in').value,
                    checkOut: document.getElementById('sw-out').value,
                    medio: document.getElementById('sw-medio').value,
                    moneda: document.getElementById('sw-moneda').value,
                    tipoCambio: document.getElementById('sw-tc').value,
                    total: document.getElementById('sw-total').value,
                    adelanto: document.getElementById('sw-adelanto').value,
                    diferencia: document.getElementById('sw-diferencia').value
                };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                await updateDoc(doc(db, "reservas", resId), result.value);
                Swal.fire('¡Actualizado!', '', 'success');
            }
        });
    };

    // --- 5. VISTA DETALLE ---
    function verDetalleReserva(res, resId) {
    const mSymbol = res.moneda === 'USD' ? '$' : 'S/';
    const esCheckIn = res.estado === 'checkin';

    Swal.fire({
        title: `<span style="font-family: 'Playfair Display'; color: #800020; font-size: 24px;">Detalle de la Reserva</span>`,
        width: '850px',
        html: `
            <div style="text-align: left; font-family: 'Lato'; border-top: 3px solid #d4a017; padding-top: 15px;">
                
                <div style="background: #f8fafc; padding: 15px; border-radius: 10px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
                    <h4 style="margin: 0 0 10px 0; color: #800020; font-size: 16px;">👤 INFORMACIÓN DEL HUÉSPED</h4>
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; font-size: 14px;">
                        <div><b>Nombre:</b><br>${res.huesped}</div>
                        <div><b>Doc/DNI:</b><br>${res.doc || '---'}</div>
                        <div><b>Teléfono:</b><br>${res.telefono || '---'}</div>
                        <div style="grid-column: span 2;"><b>Correo:</b><br>${res.correo || '---'}</div>
                        <div><b>Nacionalidad:</b><br>${res.nacionalidad || '---'}</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                    <div style="background: #fffaf0; padding: 15px; border-radius: 10px; border: 1px solid #fef3c7;">
                        <h4 style="margin: 0 0 10px 0; color: #800020; font-size: 16px;">🏨 ESTANCIA</h4>
                        <div style="font-size: 14px; line-height: 1.6;">
                            <p style="margin: 5px 0;"><b>Habitación:</b> <span style="background:#800020; color:white; padding:2px 6px; border-radius:4px;">${res.habitacion}</span></p>
                            <p style="margin: 5px 0;"><b>Check-In:</b> ${res.checkIn} ${res.early ? `(${res.early} Early)` : ''}</p>
                            <p style="margin: 5px 0;"><b>Check-Out:</b> ${res.checkOut} ${res.late ? `(${res.late} Late)` : ''}</p>
                            <p style="margin: 5px 0;"><b>Medio:</b> ${res.medio?.toUpperCase()}</p>
                        </div>
                    </div>

                    <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; border: 1px solid #dcfce7;">
                        <h4 style="margin: 0 0 10px 0; color: #166534; font-size: 16px;">💰 RESUMEN FINANCIERO</h4>
                        <div style="font-size: 14px; line-height: 1.6;">
                            <p style="margin: 5px 0;"><b>Total:</b> ${mSymbol}${res.total} <small>(TC: ${res.tipoCambio || '3.80'})</small></p>
                            <p style="margin: 5px 0;"><b>Adelanto:</b> S/ ${res.adelanto || '0.00'}</p>
                            <p style="margin: 5px 0; font-size: 16px; color: #c53030;"><b>Pendiente: S/ ${res.diferencia || '0.00'}</b></p>
                            <p style="margin: 5px 0; font-size: 12px; color: #64748b;"><b>Otros:</b> Cochera: ${res.cochera || 'No'} | Traslado: ${res.traslado || 'No'}</p>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px; display: flex; gap: 10px;">
                    ${!esCheckIn ? `<button id="btnCheckIn" class="swal2-confirm swal2-styled" style="background:#10b981; flex:1; margin:0;">🚀 CHECK-IN</button>` : ''}
                    <button id="btnOpenEdit" class="swal2-confirm swal2-styled" style="background:#3b82f6; flex:1; margin:0;">📝 EDITAR</button>
                    <button id="btnEliminarRes" class="swal2-confirm swal2-styled" style="background:#ef4444; flex:1; margin:0;">🗑️ BORRAR</button>
                </div>
            </div>
        `,
        showConfirmButton: false,
        didOpen: () => {
            // Asignar eventos a los botones después de que el modal se abre
            document.getElementById('btnOpenEdit').onclick = () => abrirEdicionIntegral(res, resId);
            
            document.getElementById('btnEliminarRes').onclick = async () => {
                const result = await Swal.fire({
                    title: '¿Estás seguro?',
                    text: "Esta acción no se puede deshacer",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: 'Sí, eliminar'
                });
                if(result.isConfirmed) {
                    await deleteDoc(doc(db, "reservas", resId));
                    Swal.fire('Eliminado', 'La reserva ha sido borrada.', 'success');
                }
            };

            const btnCheck = document.getElementById('btnCheckIn');
            if(btnCheck) {
                btnCheck.onclick = async () => {
                    await updateDoc(doc(db, "reservas", resId), { estado: "checkin" });
                    // Actualizar estado de habitación a "Ocupada"
                    const qHab = query(collection(db, "habitaciones"), where("numero", "==", Number(res.habitacion)));
                    const snapHab = await getDocs(qHab);
                    if (!snapHab.empty) await updateDoc(doc(db, "habitaciones", snapHab.docs[0].id), { estado: "Ocupada" });
                    
                    Swal.fire('¡Check-in!', 'La habitación ahora figura como ocupada.', 'success');
                };
            }
        }
    });
}

    // INICIAR
    inicializarControles();
    generarCalendarioGantt();
});