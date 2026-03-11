import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, orderBy 
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

// 2. CARGAR HABITACIONES: Dinámico desde Firebase
function cargarHabitaciones() {
    // Escuchamos la colección "habitaciones" en tiempo real
    const q = query(collection(db, "habitaciones"), orderBy("numero", "asc"));

    onSnapshot(q, (snapshot) => {
        if (!habGrid) return;
        
        habGrid.innerHTML = ''; 
        
        let libres = 0;
        let ocupadas = 0;
        const term = searchHab ? searchHab.value.toLowerCase() : "";

        // Si la colección está vacía, mostramos un aviso
        if (snapshot.empty) {
            habGrid.innerHTML = '<p>No hay habitaciones registradas en la base de datos.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const hab = docSnap.data();
            
            // Filtro de búsqueda por número
            if (hab.numero.toString().toLowerCase().includes(term)) {
                
                // Actualizamos contadores en tiempo real
                if (hab.estado === "Libre") libres++;
                else if (hab.estado === "Ocupada") ocupadas++;

                const card = document.createElement('div');
                // La clase CSS se asigna dinámicamente según el estado
                card.className = `hab-card ${hab.estado.toLowerCase()}`;
                
                card.innerHTML = `
                    <div class="hab-header">
                        <span class="hab-number">${hab.numero}</span>
                        <span class="hab-badge">${hab.estado}</span>
                    </div>
                    <div class="hab-body">
                        <p><i class="fa-solid fa-layer-group"></i> Piso ${hab.piso || 'N/A'}</p>
                        <p><i class="fa-solid fa-tags"></i> ${hab.tipo || 'Simple'}</p> 
                    </div>
                    <div class="hab-footer">
                        <small style="font-size: 11px; color: #888;">
                            <i class="fa-solid fa-sync"></i> Sincronizado con Reservas
                        </small>
                    </div>
                `;
                habGrid.appendChild(card);
            }
        });

        // Actualizamos los KPIs superiores
        actualizarMiniStats(snapshot.size, libres, ocupadas);
    });
}

// 3. BUSCADOR
if (searchHab) {
    searchHab.addEventListener('input', cargarHabitaciones);
}

// 4. ACTUALIZAR CONTADORES
function actualizarMiniStats(total, libres, ocupadas) {
    const txtTotal = document.getElementById('stat-total');
    const txtLibres = document.getElementById('stat-libres');
    const txtOcupadas = document.getElementById('stat-ocupadas');

    if (txtTotal) txtTotal.innerText = total;
    if (txtLibres) txtLibres.innerText = libres;
    if (txtOcupadas) txtOcupadas.innerText = ocupadas;
}