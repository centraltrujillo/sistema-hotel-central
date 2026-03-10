import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, doc, updateDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const habGrid = document.getElementById('habGrid');
const searchHab = document.getElementById('searchHab');

// Lista maestra de habitaciones para garantizar que siempre aparezcan las 13
const LISTA_HABITACIONES = ["201", "202", "203", "204", "301", "302", "303", "304", "401", "402", "403", "404", "405"];

// 1. PROTEGER RUTA: Solo permite el acceso si hay un usuario logueado
onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarHabitaciones();
    } else {
        window.location.href = "index.html";
    }
});

// 2. CARGAR HABITACIONES: Fuerza la visualización de las 13 definidas
function cargarHabitaciones() {
    const q = query(collection(db, "habitaciones"), orderBy("numero", "asc"));

    onSnapshot(q, (snapshot) => {
        if (!habGrid) return;
        
        habGrid.innerHTML = ''; 
        
        // Mapeamos los datos de Firebase a un objeto para búsqueda rápida por número
        const dbHabitaciones = {};
        snapshot.forEach(docSnap => {
            dbHabitaciones[docSnap.data().numero] = { id: docSnap.id, ...docSnap.data() };
        });

        let libres = 0;
        let ocupadas = 0;
        const term = searchHab ? searchHab.value.toLowerCase() : "";

        // Iteramos sobre nuestra lista maestra de 13 habitaciones
        LISTA_HABITACIONES.forEach(num => {
            // Si el número no está en la DB, creamos un estado "Libre" por defecto
            const hab = dbHabitaciones[num] || { 
                numero: num, 
                estado: "Libre", 
                piso: num.charAt(0), 
                tipo: "Simple" 
            };

            // Filtro de búsqueda por número
            if (hab.numero.toString().toLowerCase().includes(term)) {
                
                // Actualizamos contadores
                if (hab.estado === "Libre") libres++;
                else if (hab.estado === "Ocupada") ocupadas++;

                const card = document.createElement('div');
                card.className = `hab-card ${hab.estado.toLowerCase()}`;
                
                // HTML de la tarjeta (solo mostramos botón si la habitación existe en DB)
                card.innerHTML = `
                    <div class="hab-header">
                        <span class="hab-number">${hab.numero}</span>
                        <span class="hab-badge">${hab.estado}</span>
                    </div>
                    <div class="hab-body">
                        <p><i class="fa-solid fa-layer-group"></i> Piso ${hab.piso}</p>
                        <p><i class="fa-solid fa-tags"></i> ${hab.tipo}</p> 
                    </div>
                    <div class="hab-footer">
                        ${hab.id ? `
                            <button class="btn-change" data-id="${hab.id}" data-estado="${hab.estado}">
                                <i class="fa-solid fa-arrows-rotate"></i> Marcar como ${hab.estado === 'Libre' ? 'Ocupada' : 'Libre'}
                            </button>` : `<small style="color:red">No reg. en DB</small>`}
                    </div>
                `;
                habGrid.appendChild(card);
            }
        });

        actualizarMiniStats(LISTA_HABITACIONES.length, libres, ocupadas);
    });
}

// 3. EVENTO BUSCADOR: Recarga el grid al escribir
if (searchHab) {
    searchHab.addEventListener('input', cargarHabitaciones);
}

// 4. CAMBIO DE ESTADO: Actualiza en Firestore
habGrid.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-change');
    if (!btn) return;

    const id = btn.getAttribute('data-id');
    const estadoActual = btn.getAttribute('data-estado');
    const nuevoEstado = estadoActual === "Libre" ? "Ocupada" : "Libre";

    try {
        await updateDoc(doc(db, "habitaciones", id), { estado: nuevoEstado });
    } catch (error) {
        console.error("Error al actualizar:", error);
        alert("Error al cambiar el estado.");
    }
});

// 5. ACTUALIZAR CONTADORES: Muestra el total en el dashboard
function actualizarMiniStats(total, libres, ocupadas) {
    const txtTotal = document.getElementById('stat-total');
    const txtLibres = document.getElementById('stat-libres');
    const txtOcupadas = document.getElementById('stat-ocupadas');

    if (txtTotal) txtTotal.innerText = total;
    if (txtLibres) txtLibres.innerText = libres;
    if (txtOcupadas) txtOcupadas.innerText = ocupadas;
}