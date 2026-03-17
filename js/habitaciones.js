import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, where, addDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');
const searchHab = document.getElementById('searchHab');

// 1. PROTEGER RUTA Y CARGAR DATOS
onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarHabitaciones();
    } else {
        window.location.href = "index.html";
    }
});

// 2. FUNCIÓN PRINCIPAL DE GESTIÓN (CLICK EN CARD)
async function gestionarHabitacion(hab) {
    const estadoActual = hab.estado || "Libre";

    if (estadoActual === "Libre") {
        // --- MODAL DE CHECK-IN (Registro de Entrada) ---
        Swal.fire({
            title: `<span style="font-family: 'Playfair Display', serif; color: #5a1914;">Registro de Entrada - Hab. ${hab.numero}</span>`,
            width: '700px',
            html: `
                <div style="text-align: left; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; padding: 10px; font-family: 'Lato', sans-serif;">
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #555;">NOMBRE DEL HUÉSPED</label>
                        <input id="swal-huesped" class="swal2-input" style="width: 100%; margin: 5px 0; font-size: 14px;" placeholder="Nombre completo">
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #555;">NÚMERO DE HABITACIÓN</label>
                        <input class="swal2-input" style="width: 100%; margin: 5px 0; font-size: 14px;" value="${hab.numero}" disabled>
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #555;">DOCUMENTO (DNI/PASAPORTE)</label>
                        <input id="swal-doc" class="swal2-input" style="width: 100%; margin: 5px 0; font-size: 14px;" placeholder="Número de documento">
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #555;">N° DE HUÉSPEDES</label>
                        <input id="swal-pax" type="number" class="swal2-input" style="width: 100%; margin: 5px 0; font-size: 14px;" value="1">
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #555;">FECHA DE SALIDA PREVISTA</label>
                        <input id="swal-out" type="date" class="swal2-input" style="width: 100%; margin: 5px 0; font-size: 14px;">
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: bold; color: #555;">MÉTODO DE PAGO</label>
                        <select id="swal-pago" class="swal2-input" style="width: 100%; margin: 5px 0; font-size: 14px;">
                            <option value="Efectivo">Efectivo</option>
                            <option value="Tarjeta">Tarjeta</option>
                            <option value="Transferencia">Transferencia</option>
                        </select>
                    </div>
                </div>
            `,
            confirmButtonText: 'CONFIRMAR ENTRADA',
            confirmButtonColor: '#5a1914',
            showCancelButton: true,
            cancelButtonText: 'CANCELAR',
            preConfirm: () => {
                const huesped = document.getElementById('swal-huesped').value;
                if (!huesped) return Swal.showValidationMessage('El nombre es obligatorio');
                return {
                    huesped: huesped,
                    doc: document.getElementById('swal-doc').value,
                    pax: document.getElementById('swal-pax').value,
                    out: document.getElementById('swal-out').value,
                    pago: document.getElementById('swal-pago').value
                }
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await addDoc(collection(db, "reservas"), {
                        huesped: result.value.huesped,
                        documento: result.value.doc,
                        habitacion: hab.numero.toString(),
                        pax: result.value.pax,
                        fechaSalida: result.value.out,
                        metodoPago: result.value.pago,
                        estado: "checkin",
                        consumo: 0,
                        detallesConsumo: [], // Array para guardar descripción de gastos
                        fechaCheckIn: new Date().toISOString()
                    });
                    await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
                    Swal.fire('Check-in Exitoso', `Habitación ${hab.numero} ocupada.`, 'success');
                } catch (e) { console.error("Error en Check-in:", e); }
            }
        });
    } else {
        // --- GESTIÓN DE OCUPADA (Consumo y Check-out) ---
        const qReserva = query(
            collection(db, "reservas"), 
            where("habitacion", "==", hab.numero.toString()),
            where("estado", "==", "checkin")
        );
        
        const resSnap = await getDocs(qReserva);
        let reservaId = null;
        let dataRes = { huesped: "Ocupación manual", consumo: 0 };

        if (!resSnap.empty) {
            const docRes = resSnap.docs[0];
            reservaId = docRes.id;
            dataRes = docRes.data();
        }

        const totalC = Number(dataRes.consumo) || 0;

        Swal.fire({
            title: `Habitación ${hab.numero}`,
            html: `
                <div style="text-align: left; font-family: 'Lato', sans-serif;">
                    <p style="margin-bottom: 5px;"><b>Huésped:</b> ${dataRes.huesped}</p>
                    <p style="font-size: 12px; color: #666; margin-top: 0;">Entrada: ${dataRes.fechaCheckIn ? new Date(dataRes.fechaCheckIn).toLocaleDateString() : 'N/A'}</p>
                    <hr>
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h4 style="margin:0; font-size: 14px;"><i class="fa-solid fa-utensils"></i> CONSUMOS EXTRA</h4>
                            <b style="font-size: 18px; color: #166534;">S/ ${totalC.toFixed(2)}</b>
                        </div>
                        ${reservaId ? `
                            <button id="btnAddConsumo" class="swal2-confirm swal2-styled" style="width:100%; margin: 5px 0; font-size: 13px; background-color: #5a1914;">+ Añadir Producto/Servicio</button>
                        ` : '<p style="font-size:11px; color:red;">No hay reserva vinculada.</p>'}
                    </div>
                </div>
            `,
            showDenyButton: true,
            confirmButtonText: 'Cerrar',
            denyButtonText: 'Realizar Check-out',
            denyButtonColor: '#dc2626',
            didOpen: () => {
                const btn = document.getElementById('btnAddConsumo');
                if(btn) btn.onclick = () => añadirConsumoDetallado(reservaId, totalC);
            }
        }).then(async (result) => {
            if (result.isDenied) {
                const confirm = await Swal.fire({
                    title: '¿Confirmar Check-out?',
                    text: `La habitación ${hab.numero} quedará Libre. Total a cobrar: S/ ${totalC.toFixed(2)}`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, finalizar y liberar',
                    confirmButtonColor: '#2e7d32'
                });

                if (confirm.isConfirmed) {
                    if (reservaId) {
                        await updateDoc(doc(db, "reservas", reservaId), { 
                            estado: "finalizado", 
                            fechaCheckOut: new Date().toISOString() 
                        });
                    }
                    await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Libre" });
                    Swal.fire('Habitación Liberada', 'El proceso de salida se completó.', 'success');
                }
            }
        });
    }
}

// 3. FUNCIÓN PARA AÑADIR CONSUMO CON DESCRIPCIÓN
async function añadirConsumoDetallado(resId, consumoActual) {
    const { value: formValues } = await Swal.fire({
        title: 'Nuevo Consumo',
        html: `
            <input id="swal-desc" class="swal2-input" placeholder="Descripción (Ej: 2 Aguas, Frigobar)">
            <input id="swal-monto" type="number" class="swal2-input" placeholder="Monto S/">
        `,
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
            const d = document.getElementById('swal-desc').value;
            const m = document.getElementById('swal-monto').value;
            if (!d || !m) return Swal.showValidationMessage('Completa ambos campos');
            return { descripcion: d, monto: parseFloat(m) };
        }
    });

    if (formValues) {
        try {
            const nuevoTotal = consumoActual + formValues.monto;
            await updateDoc(doc(db, "reservas", resId), { 
                consumo: nuevoTotal
            });
            Swal.fire('Guardado', `${formValues.descripcion} cargado correctamente.`, 'success');
        } catch (e) { console.error("Error al cargar consumo:", e); }
    }
}

// 4. RENDERIZADO DE HABITACIONES
function cargarHabitaciones() {
    const q = query(collection(db, "habitaciones"));

    onSnapshot(q, (snapshot) => {
        if (!habGrid) return;
        
        habGrid.innerHTML = ''; 
        let libres = 0;
        let ocupadas = 0;
        const term = searchHab ? searchHab.value.toLowerCase().trim() : "";

        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => a.numero - b.numero);

        docs.forEach((hab) => {
            const numHab = hab.numero ? hab.numero.toString() : "S/N";
            const estadoHab = hab.estado || "Libre";

            if (numHab.includes(term)) {
                if (estadoHab === "Libre") libres++;
                else if (estadoHab === "Ocupada") ocupadas++;

                const card = document.createElement('div');
                card.className = `hab-card ${estadoHab.toLowerCase()}`;
                card.style.cursor = "pointer";
                
                card.innerHTML = `
                    <div class="hab-header">
                        <span class="hab-number">${numHab}</span>
                        <span class="hab-badge">${estadoHab}</span>
                    </div>
                    <div class="hab-body">
                        <p><i class="fa-solid fa-layer-group"></i> Piso ${hab.piso || 'N/A'}</p>
                        <p><i class="fa-solid fa-tags"></i> ${hab.tipo || 'Estándar'}</p> 
                    </div>
                    <div class="hab-footer" style="padding: 10px; font-size: 10px; opacity: 0.8; text-align: center; color: ${estadoHab === 'Ocupada' ? '#ef6c00' : '#2e7d32'}; font-weight: bold;">
                        ${estadoHab === 'Ocupada' ? 'VER GESTIÓN / CONSUMOS' : 'HABITACIÓN LIBRE'}
                    </div>
                `;

                card.onclick = () => gestionarHabitacion(hab);
                habGrid.appendChild(card);
            }
        });

        actualizarMiniStats(docs.length, libres, ocupadas);
    });
}

// 5. BUSCADOR Y STATS
if (searchHab) {
    searchHab.addEventListener('input', cargarHabitaciones);
}

function actualizarMiniStats(total, libres, ocupadas) {
    const txtTotal = document.getElementById('stat-total');
    const txtLibres = document.getElementById('stat-libres');
    const txtOcupadas = document.getElementById('stat-ocupadas');

    if (txtTotal) txtTotal.innerText = total;
    if (txtLibres) txtLibres.innerText = libres;
    if (txtOcupadas) txtOcupadas.innerText = ocupadas;
}