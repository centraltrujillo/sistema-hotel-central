import { auth, db } from "./firebaseconfig.js";
import { 
    collection, onSnapshot, doc, updateDoc, query, where, getDocs, deleteDoc, addDoc, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. CONFIGURACIÓN GLOBAL Y VARIABLES DE ESTADO ---
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    let mesActual = new Date().getMonth();
    let anioActual = new Date().getFullYear();
    let habitaciones = [];
    let editId = null; // Variable global para edición 

    const coloresMedio = {
        'booking': '#1e40af', 
        'airbnb': '#ff5a5f', 
        'directas': '#7c3aed',
        'expedia': '#ffb400', 
        'personal': '#059669', 
        'dayuse': '#db2777',
        'gmail': '#ea4335'
    };

    // --- 2. INICIALIZACIÓN DE CONTROLES (HEADER) ---
    function inicializarControles() {
        const monthSelect = document.getElementById('select-month');
        const yearSelect = document.getElementById('select-year');
        const btnToday = document.getElementById('btn-go-today');
        const btnNuevaReserva = document.getElementById('btn-nueva-reserva');

        if(monthSelect) {
            monthSelect.innerHTML = ""; // Limpiar antes de llenar
            meses.forEach((m, i) => {
                monthSelect.innerHTML += `<option value="${i}" ${i === mesActual ? 'selected' : ''}>${m}</option>`;
            });
            monthSelect.onchange = (e) => { mesActual = parseInt(e.target.value); generarCalendarioGantt(); };
        }

        if(yearSelect) {
            yearSelect.innerHTML = "";
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

        if (btnNuevaReserva) {
            btnNuevaReserva.onclick = abrirModalNuevaReserva;
        }
    }

    // --- 3. GENERAR ESTRUCTURA GANTT ---
    function generarCalendarioGantt() {
        const contenedor = document.getElementById('gantt-container');
        const displayMes = document.getElementById('current-month-display');
        if (!contenedor) return;

        contenedor.innerHTML = ""; 
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
            html += `<tr><td class="sticky-col hab-name">${hab.numero} - ${hab.tipo}</td>`;
            for (let i = 1; i <= diasEnMes; i++) {
                const esHoy = (esMismoMesYAno && fechaHoy.getDate() === i);
                const fechaId = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                html += `<td id="cell-${hab.numero}-${fechaId}" class="calendar-cell ${esHoy ? 'today-column' : ''}"></td>`;
            }
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        contenedor.innerHTML = html;
        escucharReservas();
    }

 // --- 4. ESCUCHAR RESERVAS (TIEMPO REAL) ---
 function escucharReservas() {
    onSnapshot(collection(db, "reservas"), (snap) => {
        // 1. Limpiar celdas antes de repintar
        document.querySelectorAll('.calendar-cell').forEach(c => {
            c.innerHTML = '';
            c.style.backgroundColor = 'transparent';
            c.style.color = ''; // Resetear color de texto
            c.style.border = '1px solid #e2e8f0'; // Resetear borde original
            c.onclick = null;
            c.classList.remove('has-reservation');
        });

        snap.docs.forEach(dSnap => {
            const res = dSnap.data();
            const resId = dSnap.id;
            
            // Forzamos hora 12:00 para evitar errores de zona horaria
            const inicio = new Date(res.checkIn + "T12:00:00");
            const fin = new Date(res.checkOut + "T12:00:00");
            
            // 2. Necesitamos el bucle para pintar cada día de la estancia
            let actual = new Date(inicio);
            
            while (actual < fin) {
                const fechaStr = actual.toISOString().split('T')[0];
                const celda = document.getElementById(`cell-${res.habitacion}-${fechaStr}`);
                
                if (celda) {
                    // --- LÓGICA DE COLOR POR ESTADO ---
                    let colorFinal;
                    
                    // Verificamos si el estado es checkin o checkout (en minúsculas por seguridad)
                    const estadoRes = res.estado?.toLowerCase().trim();

                    if (estadoRes === "checkin" || estadoRes === "checkout") {
                        colorFinal = "#FFFFFF"; // Blanco
                        celda.style.color = "#334155"; // Texto oscuro
                        celda.style.border = "1px solid #d1d5db"; // Borde gris para que resalte el blanco
                    } else {
                        // Color según el canal (Booking, Airbnb, etc.)
                        colorFinal = coloresMedio[res.medio?.toLowerCase().trim()] || '#800020';
                        celda.style.color = "white"; 
                    }

                    celda.style.backgroundColor = colorFinal;
                    celda.classList.add('has-reservation');
                    celda.onclick = () => verDetalleReserva(res, resId);
                    
                    // Solo ponemos el nombre en la celda del primer día
                    if (actual.getTime() === inicio.getTime()) {
                        celda.innerHTML = `<span class="res-label">${res.huesped.split(' ')[0]}</span>`;
                    }
                }
                // 3. Avanzar al siguiente día
                actual.setDate(actual.getDate() + 1);
            }
        });
    });
}


    // --- 5. LÓGICA DE MODAL NUEVA RESERVA (HTML) ---
    function abrirModalNuevaReserva() {
    const modal = document.getElementById('modalReserva');
    const selectHab = document.getElementById('resHabitacion');
    const statusDiv = document.getElementById("statusDisponibilidad");
    const btnGuardar = document.getElementById('formNuevaReserva').querySelector('button[type="submit"]');
    
    editId = null; // Reset de ID de edición
    document.getElementById('formNuevaReserva').reset();
    
    // Limpiar alertas de disponibilidad previas
    if(statusDiv) statusDiv.innerHTML = "";
    if(btnGuardar) {
        btnGuardar.disabled = false;
        btnGuardar.style.opacity = "1";
    }
        
        selectHab.innerHTML = '<option value="">Seleccionar...</option>';
        habitaciones.forEach(hab => {
            selectHab.innerHTML += `<option value="${hab.numero}">${hab.numero} - ${hab.tipo}</option>`;
        });

        modal.style.display = 'flex';
    }

    // Evento para cerrar modal HTML
    window.cerrarModal = () => {
        document.getElementById('modalReserva').style.display = 'none';
    };

    document.getElementById('formNuevaReserva').onsubmit = async (e) => {
    e.preventDefault();

    // Captura total basada en los IDs de tu calendario.html
    const nuevaReserva = {
        // DATOS DEL HUÉSPED
        huesped: document.getElementById('resHuesped').value,
        doc: document.getElementById('resDoc').value,
        telefono: document.getElementById('resTelefono').value,
        nacionalidad: document.getElementById('resNacionalidad').value,
        nacimiento: document.getElementById('resNacimiento').value,
        correo: document.getElementById('resCorreo').value,

        // DETALLES DE LA ESTANCIA
        habitacion: document.getElementById('resHabitacion').value,
        checkIn: document.getElementById('resCheckIn').value,
        checkOut: document.getElementById('resCheckOut').value,
        medio: document.getElementById('resMedio').value,
        personas: document.getElementById('resPersonas').value,
        desayuno: document.getElementById('resInfo').value, // ID 'resInfo' en tu HTML
        early: document.getElementById('resEarly').value,
        late: document.getElementById('resLate').value,
        cochera: document.getElementById('resCochera').value,
        traslado: document.getElementById('resTraslado').value,

        // TARIFA DE LA RESERVA
        // Precios y Totales (Importante: usar Number para cálculos)
    tipoCambio: Number(document.getElementById('resTipoCambio').value) || 0,
    tarifa: Number(document.getElementById('resTarifa').value) || 0,
    total: Number(document.getElementById('resTotal').value) || 0,
    adelanto: Number(document.getElementById('resAdelantoMonto').value) || 0,
    diferencia: Number(document.getElementById('resDiferencia').value) || 0,
    estado: "reservada",
        moneda: document.getElementById('resMoneda').value,
        adelantoDetalle: document.getElementById('resAdelantoDetalle').value,

        // SECCIÓN FINAL (Observaciones y Personal)
        observaciones: document.getElementById('resObservaciones').value,
        recepcion: document.getElementById('resRecepcion').value,
        recepcionconfi: document.getElementById('resRecepcionconfi').value,

        // METADATOS
        estado: "reservada",
        fechaRegistro: editId ? document.getElementById('resFechaRegistroHidden')?.value || new Date().toISOString() : new Date().toISOString()    };
    try {
        if (editId) {
            // --- MODO EDICIÓN ---
            // Usamos doc() y setDoc() para SOBREESCRIBIR el documento existente
            const reservaRef = doc(db, "reservas", editId);
            await setDoc(reservaRef, nuevaReserva, { merge: true });
            
            Swal.fire({
                title: '¡Actualizado!',
                text: 'La reserva se ha modificado correctamente.',
                icon: 'success',
                confirmButtonColor: '#800020'
            });
        } else {
            // --- MODO NUEVA RESERVA ---
            // Usamos addDoc para crear un documento con ID aleatorio nuevo
            const docReserva = await addDoc(collection(db, "reservas"), nuevaReserva);
            
            // Lógica de guardado de huésped (la que ya tienes)
            if (nuevaReserva.doc) {
                const huespedRef = doc(db, "huespedes", nuevaReserva.doc);
                await setDoc(huespedRef, {
                    nombre: nuevaReserva.huesped,
                    documento: nuevaReserva.doc,
                    ultimaVisita: new Date().toISOString()
                }, { merge: true });
            }

            Swal.fire({
                title: '¡Registro Exitoso!',
                text: 'Nueva reserva creada.',
                icon: 'success',
                confirmButtonColor: '#800020'
            });
        }

        // --- LIMPIEZA FINAL ---
        cerrarModal();
        editId = null; // IMPORTANTE: Resetear el ID para la próxima reserva
        document.getElementById('formNuevaReserva').reset(); // Limpiar campos

    } catch (error) {
        console.error("Error al procesar la reserva:", error);
        Swal.fire('Error', 'No se pudo guardar la información.', 'error');
    }
};


// 2. La función mejorada
const verificarDisponibilidadRealTime = async () => {
    const form = document.getElementById('formNuevaReserva');
    const hab = document.getElementById("resHabitacion").value;
    const fIn = document.getElementById("resCheckIn").value;
    const fOut = document.getElementById("resCheckOut").value;
    const statusDiv = document.getElementById("statusDisponibilidad");
    const btnGuardar = form.querySelector('button[type="submit"]');

    if (!hab || !fIn || !fOut) {
        statusDiv.innerHTML = "";
        return;
    }

    statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
    statusDiv.style.color = "orange";

    try {
        const q = query(collection(db, "reservas"), where("habitacion", "==", hab));
        const snap = await getDocs(q);
        let ocupado = false;

        snap.forEach(docSnap => {
            const res = docSnap.data();
            // Si estamos editando, ignoramos la reserva actual para que no se autobreokee
            if (editId && docSnap.id === editId) return;

            // Lógica de traslape
            if (fIn < res.checkOut && fOut > res.checkIn) {
                ocupado = true;
            }
        });

        if (ocupado) {
            statusDiv.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Habitación ocupada en estas fechas';
            statusDiv.style.color = "#e11d48";
            btnGuardar.disabled = true;
            btnGuardar.style.opacity = "0.5";
            btnGuardar.style.cursor = "not-allowed";
        } else {
            statusDiv.innerHTML = '<i class="fa-solid fa-circle-check"></i> Habitación disponible';
            statusDiv.style.color = "#10b981";
            btnGuardar.disabled = false;
            btnGuardar.style.opacity = "1";
            btnGuardar.style.cursor = "pointer";
        }
    } catch (error) {
        console.error(error);
        statusDiv.textContent = "Error al verificar";
    }
};


function calcularMontos(prefix = "res") {
    // 1. Captura de elementos (Prioriza el prefijo o el modal SweetAlert)
    const inputIn = document.getElementById(`${prefix}CheckIn`) || document.getElementById(`sw-in`);
    const inputOut = document.getElementById(`${prefix}CheckOut`) || document.getElementById(`sw-out`);
    const inputTarifa = document.getElementById(`${prefix}Tarifa`) || document.getElementById(`sw-tarifa`); // Corregido ID
    const inputTC = document.getElementById(`${prefix}TipoCambio`) || document.getElementById(`sw-tc`);
    const selectMoneda = document.getElementById(`${prefix}Moneda`) || document.getElementById(`sw-moneda`);
    const inputTotal = document.getElementById(`${prefix}Total`) || document.getElementById(`sw-total`);
    const inputAdelanto = document.getElementById(`${prefix}AdelantoMonto`) || document.getElementById(`sw-adelanto`);
    const inputDiferencia = document.getElementById(`${prefix}Diferencia`) || document.getElementById(`sw-diferencia`);

    // Validar que existan fechas
    if (!inputIn?.value || !inputOut?.value) return;

    const fIn = new Date(inputIn.value + 'T12:00:00');
    const fOut = new Date(inputOut.value + 'T12:00:00');
    const tarifaBase = parseFloat(inputTarifa?.value) || 0;
    
    // CORRECCIÓN: El Tipo de Cambio ahora es lo que ponga la recepcionista (por defecto 0 o vacío)
    const tc = parseFloat(inputTC?.value) || 0; 

    if (fOut > fIn) {
        const noches = Math.ceil((fOut - fIn) / (1000 * 60 * 60 * 24));
        let subtotal = noches * tarifaBase;

        // Cargos adicionales (50% de la tarifa base)
        const early = document.getElementById(`${prefix}Early`) || document.getElementById(`sw-early`);
        const late = document.getElementById(`${prefix}Late`) || document.getElementById(`sw-late`);
        
        if (early?.checked || early?.value === "true") subtotal += (tarifaBase * 0.5);
        if (late?.checked || late?.value === "true") subtotal += (tarifaBase * 0.5);

        let totalFinal = subtotal;

        // CORRECCIÓN: Solo multiplicar si es Dólares y hay un TC válido
        if (selectMoneda?.value === "USD" && tc > 0) {
            totalFinal = subtotal * tc;
        } else {
            // Si es Soles (PEN), el total es simplemente el subtotal acumulado
            totalFinal = subtotal;
        }

        // Mostrar Total
        if (inputTotal) inputTotal.value = totalFinal.toFixed(2);
        
        // CORRECCIÓN: Cálculo de diferencia (Total final en la moneda elegida - Adelanto)
        const adelanto = parseFloat(inputAdelanto?.value) || 0;
        if (inputDiferencia) {
            const dif = totalFinal - adelanto;
            inputDiferencia.value = dif.toFixed(2);
        }
    }
}

    async function buscarHuesped(documento, campos) {
        if (documento.length < 4) return;
        const q = query(collection(db, "huespedes"), where("documento", "==", documento));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const h = snap.docs[0].data();
            Object.keys(campos).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = h[campos[id]] || "";
            });
            Swal.fire({ toast: true, position: 'top-end', title: 'Huésped encontrado', icon: 'success', showConfirmButton: false, timer: 1500 });
        }
    }

    // --- 7. VISTA DETALLE ACTUALIZADA ---
    function verDetalleReserva(res, resId) {
        const mSymbol = res.moneda === 'USD' ? '$' : 'S/';
        
        // CORRECCIÓN: Aseguramos que el adelanto se lea correctamente de Firebase
        // Usamos el operador || por si en algunos documentos se guardó como 'adelanto' y en otros como 'adelantoMonto'
        const adelantoValor = parseFloat(res.adelantoMonto || res.adelanto || 0);
        const totalValor = parseFloat(res.total || 0);
        const diferenciaValor = parseFloat(res.diferencia || 0);
        const tarifaValor = parseFloat(res.tarifa || 0);
    
        Swal.fire({
            title: `<span style="font-family: 'Playfair Display'; color: #800020; font-size: 26px;">Detalle de la Reserva</span>`,
            width: '1100px',
            showCloseButton: true,
            showConfirmButton: false,
            customClass: {
                htmlContainer: 'swal-grid-4' 
            },
            html: `
                <div class="swal-section-title">👤 INFORMACIÓN DEL HUÉSPED</div>
                <div class="span-2"><label>Nombre Completo</label><b>${res.huesped}</b></div>
                <div class="span-1"><label>DNI/Pasaporte</label>${res.doc || '---'}</div>
                <div class="span-1"><label>Teléfono</label>${res.telefono || '---'}</div>
                
                <div class="span-1"><label>Nacionalidad</label>${res.nacionalidad || '---'}</div>
                <div class="span-1"><label>F. Nacimiento</label>${res.nacimiento || '---'}</div>
                <div class="span-2"><label>Correo Electrónico</label>${res.correo || '---'}</div>
    
                <div class="swal-section-title">🏨 DETALLES DE ESTANCIA</div>
                <div class="span-1"><label>Habitación</label><b>${res.habitacion}</b></div>
                <div class="span-1">
                    <label>Medio</label>
                    <span class="badge-${res.medio}" style="padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; color: white;">
                        ${res.medio?.toUpperCase()}
                    </span>
                </div>
                <div class="span-1"><label>Check-In</label>${res.checkIn}</div>
                <div class="span-1"><label>Check-Out</label>${res.checkOut}</div>
    
                <div class="span-1"><label>Personas</label>${res.personas}</div>
                <div class="span-1"><label>Desayuno</label>${res.desayuno || '---'}</div>
                <div class="span-1"><label>Early C.I.</label>${res.early || '--:--'}</div>
                <div class="span-1"><label>Late C.O.</label>${res.late || '--:--'}</div>
                
                <div class="span-1"><label>Cochera</label>${res.cochera || 'NO'}</div>
                <div class="span-3"><label>Traslado</label>${res.traslado || 'Sin servicio de traslado'}</div>
    
                <div class="swal-section-title">💰 TARIFA Y PAGOS</div>
                <div class="highlight-section span-4">
                    <div class="span-1">
                        <label>Tarifa Noche</label>
                        <span style="font-size: 14px;">${mSymbol}${tarifaValor.toFixed(2)}</span>
                    </div>
                    <div class="span-1">
                        <label>Total Estancia</label>
                        <b class="input-total" style="padding:2px 8px; border-radius:4px; background:#f1f5f9;">
                            ${mSymbol}${totalValor.toFixed(2)}
                        </b>
                    </div>
                    <div class="span-1">
                        <label>Adelanto</label>
                        <b class="input-adelanto" style="padding:2px 8px; border-radius:4px; color:#10b981; background:#ecfdf5;">
                            ${mSymbol}${adelantoValor.toFixed(2)}
                        </b>
                    </div>
                    <div class="span-1">
                        <label>Saldo Pendiente</label>
                        <b class="input-diferencia" style="padding:2px 8px; border-radius:4px; color:#ef4444; background:#fef2f2;">
                            ${mSymbol}${diferenciaValor.toFixed(2)}
                        </b>
                    </div>
                    <div class="span-4" style="margin-top: 5px; font-size: 12px; color: #64748b;">
                        <label>Detalle Adelanto:</label> ${res.adelantoDetalle || 'Ninguno'}
                    </div>
                </div>
    
                <div class="swal-section-title">📝NOTAS</div>
                <div class="span-4"><label>Observaciones</label><p style="font-size:13px; background: #f9f9f9; padding: 10px; border-radius: 5px; border-left: 3px solid #800020;">${res.observaciones || 'Sin observaciones adicionales.'}</p></div>
    
                <div class="span-4" style="font-size: 11px; color: #64748b; text-align: right; border-top: 1px solid #eee; padding-top: 10px;">
                    <b>Recibido por:</b> ${res.recepcion || 'Sistema'} | <b>Confirmado por:</b> ${res.recepcionconfi || 'Pendiente'}<br>
                    <b>Fecha de Registro:</b> ${res.fechaRegistro ? new Date(res.fechaRegistro).toLocaleString() : '---'}
                </div>
    
                <div class="span-4" style="margin-top: 20px; display: flex; gap: 10px;">
                    <button id="btnCheckIn" class="btn-save" style="background:#10b981; flex:1; border:none; padding:10px; cursor:pointer; color:white; border-radius:5px; font-weight:bold;">🚀 CHECK-IN</button>
                    <button id="btnOpenEdit" class="btn-save" style="background:#3b82f6; flex:1; border:none; padding:10px; cursor:pointer; color:white; border-radius:5px; font-weight:bold;">📝 EDITAR</button>
                    <button id="btnEliminarRes" class="btn-save" style="background:#ef4444; flex:1; border:none; padding:10px; cursor:pointer; color:white; border-radius:5px; font-weight:bold;">🗑️ ELIMINAR</button>
                </div>
            `,
        showConfirmButton: false,
        didOpen: () => {
            document.getElementById('btnOpenEdit').onclick = () => abrirEdicionIntegral(res, resId);
            document.getElementById('btnEliminarRes').onclick = async () => {
                const result = await Swal.fire({ 
                    title: '¿Eliminar reserva?', 
                    text: "Esta acción no se puede deshacer",
                    icon: 'warning',
                    showCancelButton: true, 
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: 'Sí, eliminar',
                    cancelButtonText: 'Cancelar'
                });
                if(result.isConfirmed) {
                    await deleteDoc(doc(db, "reservas", resId));
                    Swal.fire('Eliminado', 'La reserva ha sido borrada.', 'success');
                }
            };
            document.getElementById('btnCheckIn').onclick = async () => {
                await updateDoc(doc(db, "reservas", resId), { estado: "checkin" });
                Swal.fire('Check-in exitoso', 'El huésped ahora está en estado Check-in', 'success');
            };
        }
    });
}



function abrirEdicionIntegral(res, resId) {
    editId = resId; 

    Swal.fire({
        title: '<span style="font-family: \'Playfair Display\'; color: #800020; font-size: 26px;">Editar Reserva Integral</span>',
        width: '1150px',
        confirmButtonText: 'Guardar Cambios',
        confirmButtonColor: '#800020',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        customClass: {
            htmlContainer: 'swal-grid-4' 
        },
        html: `
            <div class="swal-section-title">👤 DATOS DEL HUÉSPED</div>
            <div class="span-2">
                <label>Nombres</label>
                <input id="sw-huesped" class="swal2-input" value="${res.huesped}">
            </div>
            <div class="span-1">
                <label>DNI/Pasaporte</label>
                <input id="sw-doc" class="swal2-input" value="${res.doc || ''}">
            </div>
            <div class="span-1">
                <label>Teléfono</label>
                <input id="sw-telefono" class="swal2-input" value="${res.telefono || ''}">
            </div>
            <div class="span-1">
                <label>Nacionalidad</label>
                <input id="sw-nacionalidad" class="swal2-input" value="${res.nacionalidad || ''}">
            </div>
            <div class="span-1">
                <label>Nacimiento</label>
                <input type="date" id="sw-nacimiento" class="swal2-input" value="${res.nacimiento || ''}">
            </div>
            <div class="span-2">
                <label>Correo</label>
                <input type="email" id="sw-correo" class="swal2-input" value="${res.correo || ''}">
            </div>

            <div class="swal-section-title">🏨 DETALLES DE LA ESTANCIA</div>
            <div class="span-1">
                <label>Habitación</label>
                <select id="sw-habitacion" class="swal2-select">
                    ${habitaciones.map(h => `<option value="${h.numero}" ${h.numero == res.habitacion ? 'selected' : ''}>${h.numero} - ${h.tipo}</option>`).join('')}
                </select>
            </div>
            <div class="span-1">
                <label>Check In</label>
                <input type="date" id="sw-in" class="swal2-input" value="${res.checkIn}">
            </div>
            <div class="span-1">
                <label>Check Out</label>
                <input type="date" id="sw-out" class="swal2-input" value="${res.checkOut}">
            </div>
            <div class="span-1">
                <label>Medio</label>
                <select id="sw-medio" class="swal2-select">
                    <option value="booking" ${res.medio == 'booking' ? 'selected' : ''}>Booking</option>
                    <option value="airbnb" ${res.medio == 'airbnb' ? 'selected' : ''}>Airbnb</option>
                    <option value="directas" ${res.medio == 'directas' ? 'selected' : ''}>Directas</option>
                    <option value="expedia" ${res.medio == 'expedia' ? 'selected' : ''}>Expedia</option>
                    <option value="personal" ${res.medio == 'personal' ? 'selected' : ''}>Personal</option>
                    <option value="dayuse" ${res.medio == 'dayuse' ? 'selected' : ''}>Day Use</option>
                    <option value="gmail" ${res.medio == 'gmail' ? 'selected' : ''}>Gmail</option>
                </select>
            </div>

            <div class="span-3" id="statusDisponibilidad" style="font-size:12px; font-weight:bold; padding-top:10px;"></div>
            <div class="span-1">
                <label>Estado</label>
                <select id="sw-estado" class="swal2-select">
                    <option value="reservada" ${res.estado == 'reservada' ? 'selected' : ''}>RESERVADA</option>
                    <option value="checkin" ${res.estado == 'checkin' ? 'selected' : ''}>CHECK-IN</option>
                    <option value="checkout" ${res.estado == 'checkout' ? 'selected' : ''}>CHECK-OUT</option>
                </select>
            </div>

            <div class="span-1">
                <label>N° Pers.</label>
                <input type="number" id="sw-personas" class="swal2-input" value="${res.personas}">
            </div>
            <div class="span-1">
                <label>Desayuno</label>
                <select id="sw-info" class="swal2-select">
                    <option value="CON DESAYUNO" ${res.desayuno == 'CON DESAYUNO' ? 'selected' : ''}>CON DESAYUNO</option>
                    <option value="SIN DESAYUNO" ${res.desayuno == 'SIN DESAYUNO' ? 'selected' : ''}>SIN DESAYUNO</option>
                </select>
            </div>
            <div class="span-1">
                <label>Early C.I.</label>
                <input type="time" id="sw-early" class="swal2-input" value="${res.early || ''}">
            </div>
            <div class="span-1">
                <label>Late C.O.</label>
                <input type="time" id="sw-late" class="swal2-input" value="${res.late || ''}">
            </div>
            <div class="span-1">
                <label>Cochera</label>
                <input type="text" id="sw-cochera" class="swal2-input" placeholder="SI/NO" value="${res.cochera || ''}">
            </div>
            <div class="span-3">
                <label>Traslado</label>
                <input type="text" id="sw-traslado" class="swal2-input" value="${res.traslado || ''}">
            </div>

            <div class="swal-section-title">💰 TARIFA DE LA RESERVA</div>
            <div class="highlight-section span-4">
                <div class="span-1">
                    <label>Tarifa Noche</label>
                    <input type="number" id="sw-tarifa" class="swal2-input" value="${res.tarifa}">
                </div>
                <div class="span-1">
                    <label>Moneda</label>
                    <select id="sw-moneda" class="swal2-select">
                        <option value="PEN" ${res.moneda == 'PEN' ? 'selected' : ''}>Soles (S/)</option>
                        <option value="USD" ${res.moneda == 'USD' ? 'selected' : ''}>Dólares ($)</option>
                    </select>
                </div>
                <div class="span-1">
                    <label>T. Cambio</label>
                    <input type="number" id="sw-tc" class="swal2-input" step="0.01" value="${res.tipoCambio || ''}" placeholder="Manual">
                </div>
                <div class="span-1">
                    <label>Total Estancia</label>
                    <input id="sw-total" class="swal2-input input-total" value="${res.total}" readonly style="background:#f1f5f9; font-weight:bold;">
                </div>
                <div class="span-1">
                    <label>Adelanto</label>
                    <input type="number" id="sw-adelanto" class="swal2-input input-adelanto" value="${res.adelanto || res.adelantoMonto || 0}" style="color: #10b981; font-weight:bold;">
                </div>
                <div class="span-1">
                    <label>Pendiente</label>
                    <input id="sw-diferencia" class="swal2-input input-diferencia" value="${res.diferencia}" readonly style="background:#fef2f2; color:#ef4444; font-weight:bold;">
                </div>
                <div class="span-2">
                    <label>Detalle Adelanto</label>
                    <input type="text" id="sw-adelantoDetalle" class="swal2-input" value="${res.adelantoDetalle || ''}" placeholder="Ej: Efectivo, Yape, etc.">
                </div>
            </div>

            <div class="swal-section-title">📝 NOTAS Y RECEPCIÓN</div>
            <div class="span-2">
                <label>Observaciones</label>
                <input id="sw-observaciones" class="swal2-input" value="${res.observaciones || ''}">
            </div>
            <div class="span-1">
                <label>Recibido por</label>
                <input id="sw-recepcion" class="swal2-input" value="${res.recepcion || ''}">
            </div>
            <div class="span-1">
                <label>Confirmado por</label>
                <input id="sw-recepcionconfi" class="swal2-input" value="${res.recepcionconfi || ''}">
            </div>

            <input type="hidden" id="sw-fechaRegistro" value="${res.fechaRegistro}">
        `,
        didOpen: () => {
            // 1. Verificación inicial al abrir
            verificarDisponibilidad("sw-");
            
            // 2. Listeners para recálculo automático (Ya incluye el adelanto aquí)
            const idsCalculo = ['sw-in', 'sw-out', 'sw-tarifa', 'sw-adelanto', 'sw-moneda', 'sw-tc'];
            idsCalculo.forEach(id => {
                const el = document.getElementById(id);
                // Usamos 'input' para que calcule mientras escriben, 'change' para los select
                if(el) {
                    const evento = el.tagName === 'SELECT' ? 'change' : 'input';
                    el.addEventListener(evento, () => calcularMontos("sw-"));
                }
            });

            // 3. Listener específico para disponibilidad si cambian habitación
            document.getElementById('sw-habitacion').addEventListener('change', () => verificarDisponibilidad("sw-"));
            
            // 4. Búsqueda automática de huésped por DNI
            const docInput = document.getElementById('sw-doc');
            if(docInput) {
                docInput.onblur = (e) => buscarHuesped(e.target.value, {
                    'sw-huesped': 'nombre', 
                    'sw-telefono': 'telefono', 
                    'sw-nacionalidad': 'nacionalidad', 
                    'sw-correo': 'correo'
                });
            }
        },

        preConfirm: () => {
            const statusDiv = document.getElementById('statusDisponibilidad');
            // Ajustamos la búsqueda de texto según lo que realmente escribe tu función de verificación
            if (statusDiv.innerText.toUpperCase().includes("OCUPADA") || statusDiv.innerText.toUpperCase().includes("NO DISPONIBLE")) {
                Swal.showValidationMessage("La habitación ya está ocupada en esas fechas");
                return false;
            }

            // CORRECCIÓN: Aseguramos que los valores numéricos se guarden como tales
            return {
                huesped: document.getElementById('sw-huesped').value,
                doc: document.getElementById('sw-doc').value,
                telefono: document.getElementById('sw-telefono').value,
                nacionalidad: document.getElementById('sw-nacionalidad').value,
                nacimiento: document.getElementById('sw-nacimiento').value,
                correo: document.getElementById('sw-correo').value,
                habitacion: document.getElementById('sw-habitacion').value,
                checkIn: document.getElementById('sw-in').value,
                checkOut: document.getElementById('sw-out').value,
                medio: document.getElementById('sw-medio').value,
                estado: document.getElementById('sw-estado').value,
                personas: document.getElementById('sw-personas').value,
                desayuno: document.getElementById('sw-info').value,
                early: document.getElementById('sw-early').value,
                late: document.getElementById('sw-late').value,
                cochera: document.getElementById('sw-cochera').value,
                traslado: document.getElementById('sw-traslado').value,
                tarifa: parseFloat(document.getElementById('sw-tarifa').value) || 0,
                moneda: document.getElementById('sw-moneda').value,
                tipoCambio: parseFloat(document.getElementById('sw-tc').value) || 0,
                total: parseFloat(document.getElementById('sw-total').value) || 0,
                adelanto: parseFloat(document.getElementById('sw-adelanto').value) || 0,
                diferencia: parseFloat(document.getElementById('sw-diferencia').value) || 0,
                adelantoDetalle: document.getElementById('sw-adelantoDetalle').value,
                observaciones: document.getElementById('sw-observaciones').value,
                recepcion: document.getElementById('sw-recepcion').value,
                recepcionconfi: document.getElementById('sw-recepcionconfi').value,
                fechaRegistro: document.getElementById('sw-fechaRegistro').value,
                ultimaEdicion: new Date().toISOString()
            };
        }
    }).then(async (result) => {
        editId = null; 
        
        if (result.isConfirmed) {
            try {
                await updateDoc(doc(db, "reservas", resId), result.value);
                Swal.fire({
                    icon: 'success',
                    title: '¡Actualizado!',
                    text: 'La reserva se actualizó correctamente.',
                    confirmButtonColor: '#800020'
                });
            } catch (error) {
                console.error("Error al actualizar:", error);
                Swal.fire('Error', 'No se pudo actualizar la reserva', 'error');
            }
        }
    });
}

    // --- 8. INICIO ORQUESTADO ---
    async function iniciarModulo() {
        inicializarControles();
        
        // Cargar habitaciones en tiempo real
onSnapshot(collection(db, "habitaciones"), (querySnapshot) => {
    habitaciones = []; 
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        // CAMBIO AQUÍ: Aseguramos que el número sea siempre un String
        habitaciones.push({ 
            numero: String(data.numero), 
            tipo: data.tipo || "S/T" 
        });
    });
    // El sort funciona igual, comparando los valores
    habitaciones.sort((a, b) => a.numero - b.numero);
    generarCalendarioGantt();
});

// UNIFICACIÓN DE LISTENERS
    const idsMonitoreo = ["resHabitacion", "resCheckIn", "resCheckOut", "resTarifa", "resAdelantoMonto", "resEarly", "resLate", "resMoneda"];
    
    idsMonitoreo.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener("change", () => {
                calcularMontos("res");
                // Solo verificar disponibilidad si cambió habitación o fechas
                if(["resHabitacion", "resCheckIn", "resCheckOut"].includes(id)) {
                    verificarDisponibilidadRealTime();
                }
            });
            // Para que la tarifa y adelanto calculen mientras escribes
            if(["resTarifa", "resAdelantoMonto"].includes(id)) {
                el.addEventListener("input", () => calcularMontos("res"));
            }
        }
    });

        const docInput = document.getElementById("resDoc");
        if(docInput) {
            docInput.onblur = (e) => buscarHuesped(e.target.value, {
                'resHuesped': 'nombre', 'resTelefono': 'telefono', 'resNacionalidad': 'nacionalidad'
            });
        }
    }

    iniciarModulo();
});