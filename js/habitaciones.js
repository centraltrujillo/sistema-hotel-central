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

// Esta función evita errores de zona horaria y nos da la fecha actual en formato AAAA-MM-DD
function getHoyISO() {
    const fecha = new Date();
    const offset = fecha.getTimezoneOffset();
    const ajustada = new Date(fecha.getTime() - (offset * 60 * 1000));
    return ajustada.toISOString().split('T')[0];
}

function cargarHabitaciones() {
    const qHabs = query(collection(db, "habitaciones"));
    const hoy = getHoyISO();

    onSnapshot(qHabs, async (snapshot) => {
        // 1. Limpiamos el grid para no duplicar casitas
        habGrid.innerHTML = '';
        
        // 2. Preparamos contadores para las estadísticas (Total, Libres, Ocupadas)
        let s = { t: snapshot.size, l: 0, o: 0 };

        // 3. Consultamos si hay reservas para HOY que estén en estado "reservado"
        const qRes = query(collection(db, "reservas"), 
                     where("fechaIngreso", "==", hoy), 
                     where("estado", "==", "reservado"));
        const snapRes = await getDocs(qRes);
        
        // Creamos una lista simple de los números de habitación que tienen reserva hoy
        const listaReservasHoy = snapRes.docs.map(d => d.data().habitacion);

        // 4. Convertimos los documentos de habitaciones a una lista y los ordenamos por número
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => a.numero - b.numero);

        // 5. Empezamos a recorrer cada habitación para crear su "casita"
        docs.forEach(hab => {
            const est = hab.estado || "Libre";
            
            // Sumamos al contador según el estado
            if (est === "Libre") s.l++; else s.o++;

            // Verificamos si esta habitación específica tiene una reserva para hoy
            const tieneReservaHoy = listaReservasHoy.includes(hab.numero.toString());

            // Creamos el contenedor de la "casita"
            const card = document.createElement('div');
            
            // Le ponemos la clase base y la clase del estado (libre u ocupada)
            card.className = `hab-card ${est.toLowerCase()}`;
            
            // Inyectamos el contenido HTML dentro de la tarjeta
            card.innerHTML = `
                <span class="hab-number">${hab.numero}</span>
                <div class="hab-body">
                    <p style="font-size:13px;">Piso ${hab.piso} - ${hab.tipo}</p>
                    <span class="hab-badge">${est}</span>
                    
                    ${tieneReservaHoy && est !== "Ocupada" 
                        ? '<p style="color:#800020; font-weight:bold; font-size:10px; margin-top:5px;">LLEGADA HOY</p>' 
                        : ''}
                </div>`;

            // Definimos qué pasa cuando haces CLIC en la casita
            card.onclick = () => {
                if (est === "Ocupada") {
                    abrirModalGestionOcupada(hab); // Si está ocupada, vamos a consumos/checkout
                } else {
                    abrirModalCheckIn(hab);        // Si está libre, vamos a ingreso/reserva
                }
            };

            // Finalmente, metemos la casita al grid que definimos en el HTML
            habGrid.appendChild(card);
        }); // Aquí cierra el docs.forEach

        // 5. Actualizamos los números de los contadores en la parte superior
        document.getElementById('stat-total').innerText = s.t;
        document.getElementById('stat-libres').innerText = s.l;
        document.getElementById('stat-ocupadas').innerText = s.o;

    }); // Aquí cierra el onSnapshot
} // Aquí cierra la función cargarHabitaciones

