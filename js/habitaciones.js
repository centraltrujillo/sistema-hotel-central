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

// 1. PROTEGER RUTA
onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarHabitaciones();
    } else {
        window.location.href = "login.html";
    }
});

// 2. CARGAR HABITACIONES EN TIEMPO REAL
function cargarHabitaciones() {
    const q = query(collection(db, "habitaciones"), orderBy("numero", "asc"));

    onSnapshot(q, (snapshot) => {
        habGrid.innerHTML = ''; // Limpiar grid
        
        // Contadores para las mini-stats de arriba
        let libres = 0;
        let ocupadas = 0;

        snapshot.forEach((docSnap) => {
            const hab = docSnap.data();
            const id = docSnap.id;

            if (hab.estado === "Libre") libres++;
            else ocupadas++;

            // Crear el elemento de la tarjeta
            const card = document.createElement('div');
            card.className = `hab-card ${hab.estado.toLowerCase()}`;
            
            card.innerHTML = `
                <div class="hab-header">
                    <span class="hab-number">${hab.numero}</span>
                    <span class="hab-badge">${hab.estado}</span>
                </div>
                <div class="hab-body">
                    <p><i class="fa-solid fa-layer-group"></i> Piso ${hab.piso || hab.numero.charAt(0)}</p>
                    <p><i class="fa-solid fa-tags"></i> Colonial Standard</p>
                </div>
                <div class="hab-footer">
                    <button class="btn-change" data-id="${id}" data-estado="${hab.estado}">
                        <i class="fa-solid fa-arrows-rotate"></i> 
                        Marcar como ${hab.estado === 'Libre' ? 'Ocupada' : 'Libre'}
                    </button>
                </div>
            `;
            habGrid.appendChild(card);
        });

        // Actualizar las mini-tarjetas de arriba (Opcional si usas los IDs correctos)
        actualizarMiniStats(snapshot.size, libres, ocupadas);
    });
}

// 3. FUNCIÓN PARA CAMBIAR ESTADO (Click en botón)
habGrid.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-change') || e.target.parentElement.classList.contains('btn-change')) {
        const button = e.target.classList.contains('btn-change') ? e.target : e.target.parentElement;
        const id = button.getAttribute('data-id');
        const estadoActual = button.getAttribute('data-estado');
        const nuevoEstado = estadoActual === "Libre" ? "Ocupada" : "Libre";

        try {
            const habRef = doc(db, "habitaciones", id);
            await updateDoc(habRef, {
                estado: nuevoEstado
            });
            console.log(`Habitación ${id} cambiada a ${nuevoEstado}`);
        } catch (error) {
            console.error("Error al actualizar estado:", error);
            alert("No se pudo cambiar el estado.");
        }
    }
});

// 4. ACTUALIZAR CONTADORES SUPERIORES
function actualizarMiniStats(total, libres, ocupadas) {
    const stats = document.querySelectorAll('.stat-card-mini h3');
    if (stats.length >= 3) {
        stats[0].innerText = total;      // Total
        stats[1].innerText = libres;     // Disponibles
        stats[2].innerText = ocupadas;   // Ocupadas
    }
}