import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, updateDoc, doc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');
const searchHab = document.getElementById('searchHab');

// 1. PROTEGER RUTA
onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarHabitaciones();
    } else {
        window.location.href = "index.html";
    }
});

// 2. FUNCIÓN PARA CAMBIAR ESTADO MANUALMENTE
window.toggleEstado = async (id, estadoActual) => {
    const nuevoEstado = estadoActual === "Libre" ? "Ocupada" : "Libre";
    try {
        await updateDoc(doc(db, "habitaciones", id), {
            estado: nuevoEstado
        });
    } catch (error) {
        console.error("Error al cambiar estado:", error);
    }
};

// 3. CARGAR HABITACIONES: Dinámico desde Firebase
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
                    <div class="hab-footer" style="padding: 10px; font-size: 10px; opacity: 0.6; text-align: center;">
                        Click para alternar estado
                    </div>
                `;

                // Evento de clic para cambiar estado
                card.onclick = () => toggleEstado(hab.id, estadoHab);
                
                habGrid.appendChild(card);
            }
        });

        actualizarMiniStats(docs.length, libres, ocupadas);
    }, (error) => {
        console.error("Error detectado:", error);
    });
}

// 4. BUSCADOR
if (searchHab) {
    searchHab.addEventListener('input', cargarHabitaciones);
}

// 5. ACTUALIZAR CONTADORES
function actualizarMiniStats(total, libres, ocupadas) {
    const txtTotal = document.getElementById('stat-total');
    const txtLibres = document.getElementById('stat-libres');
    const txtOcupadas = document.getElementById('stat-ocupadas');

    if (txtTotal) txtTotal.innerText = total;
    if (txtLibres) txtLibres.innerText = libres;
    if (txtOcupadas) txtOcupadas.innerText = ocupadas;
}