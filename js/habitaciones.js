import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, 
    onSnapshot, 
    doc, 
    updateDoc, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";


const habGrid = document.getElementById('habGrid');
const searchHab = document.getElementById('searchHab');

// 1. PROTEGER RUTA
onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarHabitaciones();
    } else {
        // Corregido: redirigir a index.html si no hay sesión
        window.location.href = "index.html";
    }
});

// 2. CARGAR HABITACIONES EN TIEMPO REAL
function cargarHabitaciones() {
    const q = query(collection(db, "habitaciones"), orderBy("numero", "asc"));

    onSnapshot(q, (snapshot) => {
        if (!habGrid) return;
        
        habGrid.innerHTML = ''; 
        
        let libres = 0;
        let ocupadas = 0;
        const term = searchHab.value.toLowerCase(); // Para el buscador

        snapshot.forEach((docSnap) => {
            const hab = docSnap.data();
            const id = docSnap.id;

            // Lógica de contadores globales
            if (hab.estado === "Libre") libres++;
            else if (hab.estado === "Ocupada") ocupadas++;

            // Filtro de búsqueda por número
            if (hab.numero.toString().toLowerCase().includes(term)) {
                const card = document.createElement('div');
                // Clase dinámica: hab-card libre o hab-card ocupada
                card.className = `hab-card ${hab.estado.toLowerCase()}`;
                
                card.innerHTML = `
    <div class="hab-header">
        <span class="hab-number">${hab.numero}</span>
        <span class="hab-badge">${hab.estado}</span>
    </div>
    <div class="hab-body">
        <p><i class="fa-solid fa-layer-group"></i> Piso ${hab.piso || hab.numero.toString().charAt(0)}</p>
        <p><i class="fa-solid fa-tags"></i> ${hab.tipo || 'Simple'}</p> 
    </div>
    <div class="hab-footer">
        <button class="btn-change" data-id="${id}" data-estado="${hab.estado}">
            <i class="fa-solid fa-arrows-rotate"></i> 
            Marcar como ${hab.estado === 'Libre' ? 'Ocupada' : 'Libre'}
        </button>
    </div>
`;
habGrid.appendChild(card);
            }
        });

        actualizarMiniStats(snapshot.size, libres, ocupadas);
    });
}

// 3. EVENTO PARA EL BUSCADOR
if (searchHab) {
    searchHab.addEventListener('input', () => {
        cargarHabitaciones(); // Recarga y filtra en tiempo real
    });
}

// 4. FUNCIÓN PARA CAMBIAR ESTADO
habGrid.addEventListener('click', async (e) => {
    // Detectar click en el botón o en el icono dentro del botón
    const btn = e.target.closest('.btn-change');
    if (!btn) return;

    const id = btn.getAttribute('data-id');
    const estadoActual = btn.getAttribute('data-estado');
    const nuevoEstado = estadoActual === "Libre" ? "Ocupada" : "Libre";

    try {
        const habRef = doc(db, "habitaciones", id);
        await updateDoc(habRef, {
            estado: nuevoEstado
        });
        // No hace falta recargar, onSnapshot lo hace solo
    } catch (error) {
        console.error("Error al actualizar:", error);
        alert("Error al cambiar el estado.");
    }
});

// 5. ACTUALIZAR CONTADORES SUPERIORES POR ID
function actualizarMiniStats(total, libres, ocupadas) {
    const txtTotal = document.getElementById('stat-total');
    const txtLibres = document.getElementById('stat-libres');
    const txtOcupadas = document.getElementById('stat-ocupadas');

    if (txtTotal) txtTotal.innerText = total;
    if (txtLibres) txtLibres.innerText = libres;
    if (txtOcupadas) txtOcupadas.innerText = ocupadas;
}