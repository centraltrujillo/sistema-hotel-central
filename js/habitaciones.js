import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, where 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');
const searchHab = document.getElementById('searchHab');

onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarHabitaciones();
    } else {
        window.location.href = "index.html";
    }
});

// --- FUNCIÓN PARA MOSTRAR DETALLES Y CONSUMO ---
async function gestionarHabitacion(hab) {
    const estadoActual = hab.estado || "Libre";

    if (estadoActual === "Libre") {
        // Opción simple para ocupar
        const { isConfirmed } = await Swal.fire({
            title: `Habitación ${hab.numero}`,
            text: "¿Deseas marcar esta habitación como ocupada manualmente?",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, ocupar',
            cancelButtonText: 'Cancelar'
        });

        if (isConfirmed) {
            await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
        }
    } else {
        // BUSCAR QUIÉN ESTÁ EN LA HABITACIÓN
        // Buscamos en la colección "reservas" donde habitacion == numero y estado == "checkin"
        const qReserva = query(
            collection(db, "reservas"), 
            where("habitacion", "==", hab.numero.toString()),
            where("estado", "==", "checkin")
        );
        
        const resSnap = await getDocs(qReserva);
        let infoHuesped = "Huésped no registrado (Ocupación manual)";
        let reservaId = null;
        let totalConsumo = 0;

        if (!resSnap.empty) {
            const docRes = resSnap.docs[0];
            const dataRes = docRes.data();
            reservaId = docRes.id;
            infoHuesped = dataRes.huesped;
            totalConsumo = dataRes.consumo || 0;
        }

        Swal.fire({
            title: `Habitación ${hab.numero} - OCUPADA`,
            html: `
                <div style="text-align: left; font-family: 'Lato', sans-serif;">
                    <p><b>Huésped:</b> ${infoHuesped}</p>
                    <hr>
                    <div style="background: #f1f5f9; padding: 10px; border-radius: 8px;">
                        <h4 style="margin-top:0;">🍕 Consumos Extra</h4>
                        <p>Total Consumo: <b>S/ ${totalConsumo.toFixed(2)}</b></p>
                        ${reservaId ? `
                            <button id="btnAddConsumo" class="swal2-confirm swal2-styled" style="padding: 5px 10px; font-size: 12px;">+ Añadir Consumo</button>
                        ` : '<small>No se puede añadir consumo a ocupaciones manuales</small>'}
                    </div>
                </div>
            `,
            showDenyButton: true,
            confirmButtonText: 'Cerrar',
            denyButtonText: 'Liberar Habitación',
            didOpen: () => {
                const btnConsumo = document.getElementById('btnAddConsumo');
                if(btnConsumo) {
                    btnConsumo.onclick = () => añadirConsumo(reservaId, totalConsumo);
                }
            }
        }).then(async (result) => {
            if (result.isDenied) {
                await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Libre" });
            }
        });
    }
}

// --- FUNCIÓN PARA AÑADIR CONSUMO A LA RESERVA ---
async function añadirConsumo(resId, consumoActual) {
    const { value: monto } = await Swal.fire({
        title: 'Añadir consumo',
        input: 'number',
        inputLabel: 'Monto en Soles',
        inputPlaceholder: '0.00',
        showCancelButton: true
    });

    if (monto) {
        const nuevoTotal = parseFloat(consumoActual) + parseFloat(monto);
        const resRef = doc(db, "reservas", resId);
        await updateDoc(resRef, { consumo: nuevoTotal });
        Swal.fire('Guardado', `Se añadió S/ ${monto} al consumo.`, 'success');
    }
}

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
                        ${estadoHab === 'Ocupada' ? 'VER DETALLE / CONSUMO' : 'HABITACIÓN LIBRE'}
                    </div>
                `;

                // Cambio de evento: ahora llama a gestionarHabitacion
                card.onclick = () => gestionarHabitacion(hab);
                
                habGrid.appendChild(card);
            }
        });

        actualizarMiniStats(docs.length, libres, ocupadas);
    });
}

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