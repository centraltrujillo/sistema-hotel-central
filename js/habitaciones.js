import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc, getDocs, 
    where, addDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');

onAuthStateChanged(auth, (user) => {
    if (user) { cargarHabitaciones(); } 
    else { window.location.href = "index.html"; }
});

function getHoyISO() {
    const fecha = new Date();
    const offset = fecha.getTimezoneOffset();
    const ajustada = new Date(fecha.getTime() - (offset * 60 * 1000));
    return ajustada.toISOString().split('T')[0];
}

// --- GESTIÓN DE ENTRADA ---
async function abrirModalCheckIn(hab) {
    const hoy = getHoyISO();
    const q = query(collection(db, "reservas"), 
              where("habitacion", "==", hab.numero.toString()), 
              where("fechaIngreso", "==", hoy),
              where("estado", "==", "reservado"));
    
    const snap = await getDocs(q);
    let opciones = { "manual": "➕ Ingreso Directo" };
    snap.forEach(d => { opciones[d.id] = `🏨 Reserva: ${d.data().huesped}`; });

    const { value: selectedId } = await Swal.fire({
        title: `Check-in Hab. ${hab.numero}`,
        input: 'select',
        inputOptions: opciones,
        confirmButtonColor: '#5a1914',
        showCancelButton: true
    });

    if (selectedId) {
        if (selectedId !== "manual") {
            await updateDoc(doc(db, "reservas", selectedId), { estado: "checkin" });
        } else {
            await addDoc(collection(db, "reservas"), {
                huesped: "Huésped Directo",
                habitacion: hab.numero.toString(),
                fechaIngreso: hoy,
                estado: "checkin"
            });
        }
        await updateDoc(doc(db, "habitaciones", hab.id), { estado: "Ocupada" });
    }
}

// --- GESTIÓN DE OCUPADA (CONSUMOS + SALIDA) ---
async function abrirModalGestionOcupada(hab) {
    const qRes = query(collection(db, "reservas"), 
                 where("habitacion", "==", hab.numero.toString()), 
                 where("estado", "==", "checkin"));
    const snapRes = await getDocs(qRes);
    if (snapRes.empty) return;

    const resDoc = snapRes.docs[0];
    const resId = resDoc.id;
    const rData = resDoc.data();

    const qCons = query(collection(db, "consumos"), where("idReserva", "==", resId));
    const snapCons = await getDocs(qCons);
    const lista = snapCons.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = lista.reduce((acc, cur) => acc + cur.monto, 0);

    let html = `<div class="tabla-scroll"><table style="width:100%">`;
    lista.forEach(c => {
        html += `<tr><td style="text-align:left; padding:8px;">${c.descripcion}</td>
                 <td>S/ ${c.monto.toFixed(2)}</td>
                 <td><button onclick="eliminarConsumo('${c.id}')" class="btn-del">×</button></td></tr>`;
    });
    html += `</table></div><div class="total-caja"><span>TOTAL:</span><b>S/ ${total.toFixed(2)}</b></div>
             <button id="btnNewCons" class="btn-main">+ AÑADIR CONSUMO</button>`;

    Swal.fire({
        title: `Habitación ${hab.numero}`,
        html: `<p style="text-align:left"><b>Huésped:</b> ${rData.huesped}</p>${html}`,
        showDenyButton: true,
        confirmButtonText: 'Cerrar',
        denyButtonText: 'Procesar Check-out',
        didOpen: () => {
            document.getElementById('btnNewCons').onclick = () => registrarConsumo(resId, hab);
        }
    }).then(result => {
        if (result.isDenied) confirmarCheckOut(resId, hab.id, total);
    });
}

async function registrarConsumo(resId, hab) {
    const { value: val } = await Swal.fire({
        title: 'Nuevo Cargo',
        html: '<input id="d" class="swal2-input" placeholder="Producto"><input id="m" type="number" class="swal2-input" placeholder="S/">',
        preConfirm: () => ({ d: document.getElementById('d').value, m: document.getElementById('m').value })
    });
    if (val?.d && val?.m) {
        await addDoc(collection(db, "consumos"), { idReserva: resId, descripcion: val.d, monto: parseFloat(val.m) });
        abrirModalGestionOcupada(hab);
    }
}

window.eliminarConsumo = async (id) => {
    await deleteDoc(doc(db, "consumos", id));
    location.reload();
};

async function confirmarCheckOut(resId, habId, total) {
    const { isConfirmed } = await Swal.fire({
        title: '¿Confirmar Salida?',
        text: `Total extras: S/ ${total.toFixed(2)}`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#5a1914'
    });
    if (isConfirmed) {
        await updateDoc(doc(db, "reservas", resId), { estado: "finalizado" });
        await updateDoc(doc(db, "habitaciones", habId), { estado: "Libre" });
    }
}

// --- CARGA DE DATOS ---
function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"));
    const hoy = getHoyISO();

    onSnapshot(qHabs, async (snapshot) => {
        habGrid.innerHTML = '';
        let s = { t: snapshot.size, l: 0, o: 0 };

        const qRes = query(collection(db, "reservas"), where("fechaIngreso", "==", hoy), where("estado", "==", "reservado"));
        const snapRes = await getDocs(qRes);
        const lRes = snapRes.docs.map(d => d.data().habitacion);

        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => a.numero - b.numero);

        docs.forEach(hab => {
            const est = hab.estado || "Libre";
            est === "Libre" ? s.l++ : s.o++;
            const rHoy = lRes.includes(hab.numero.toString());

            const card = document.createElement('div');
            card.className = `hab-card ${est.toLowerCase()}`;
            card.innerHTML = `
                <span class="hab-number">${hab.numero}</span>
                <div class="hab-body">
                    <p style="font-size:13px;">Piso ${hab.piso} - ${hab.tipo}</p>
                    <span class="hab-badge">${est}</span>
                    ${rHoy && est !== "Ocupada" ? '<p style="color:#800020; font-weight:bold; font-size:10px; margin-top:5px;">LLEGADA HOY</p>' : ''}
                </div>`;
            card.onclick = () => est === "Ocupada" ? abrirModalGestionOcupada(hab) : abrirModalCheckIn(hab);
            habGrid.appendChild(card);
        });

        document.getElementById('stat-total').innerText = s.t;
        document.getElementById('stat-libres').innerText = s.l;
        document.getElementById('stat-ocupadas').innerText = s.o;
    });
}

// --- BUSCADOR ---
document.getElementById('searchHab').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.hab-card').forEach(card => {
        card.style.display = card.querySelector('.hab-number').innerText.includes(term) ? 'flex' : 'none';
    });
});