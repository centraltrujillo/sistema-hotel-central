import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- 1. ESTADO DE AUTENTICACIÓN ---
// Verifica que el usuario tenga permiso para ver el Dashboard
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Acceso concedido:", user.email);
        inicializarDashboard();
    } else {
        console.log("Acceso denegado, redirigiendo al login...");
        window.location.href = "index.html"; 
    }
});

// --- 2. FUNCIÓN PRINCIPAL DEL DASHBOARD ---
function inicializarDashboard() {
    // Referencias a los elementos del HTML
    const kpiOcupacion = document.getElementById('kpi-ocupacion');
    const kpiHuespedes = document.getElementById('kpi-huespedes');
    const kpiReservas = document.getElementById('kpi-reservas');
    const kpiIngresos = document.getElementById('kpi-ingresos');
    const listCheckins = document.getElementById('list-checkins');

    // A. ESCUCHA DE HABITACIONES (KPI: Ocupación)
    // Filtra solo las que están ocupadas para el conteo real
    const qHab = query(collection(db, "habitaciones"), where("estado", "==", "Ocupada"));
    onSnapshot(qHab, (snapshot) => {
        kpiOcupacion.innerText = `${snapshot.size}/13`;
    });

    // B. ESCUCHA DE RESERVAS PARA HOY (KPI: Reservas)
    const fechaHoy = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
    const qResHoy = query(collection(db, "reservas"), where("fecha_entrada", "==", fechaHoy));
    onSnapshot(qResHoy, (snapshot) => {
        kpiReservas.innerText = snapshot.size;
    });

    // C. ESCUCHA DE HUÉSPEDES ACTUALES (KPI: Huéspedes)
    // Cuenta huéspedes con reserva en estado "Check-in" o activa
    const qHuespedes = query(collection(db, "reservas"), where("estado_reserva", "==", "Check-in"));
    onSnapshot(qHuespedes, (snapshot) => {
        kpiHuespedes.innerText = snapshot.size;
    });

    // D. ESCUCHA DE ÚLTIMOS MOVIMIENTOS (Tabla: Check-ins/Outs)
    const qOps = query(collection(db, "operaciones"), orderBy("timestamp", "desc"), limit(5));
    onSnapshot(qOps, (snapshot) => {
        listCheckins.innerH TML = ''; // Limpiar antes de actualizar
        
        if (snapshot.empty) {
            listCheckins.innerHTML = '<p style="text-align:center; padding:10px;">Sin actividad hoy</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const item = document.createElement('div');
            item.className = 'checkin-item'; // Asegúrate de tener este estilo en tu CSS
            item.innerHTML = `
                <div class="ci-info">
                    <strong>Hab. ${data.habitacion}</strong> - ${data.huesped}
                    <br><small style="color: ${data.tipo === 'entrada' ? '#2e7d32' : '#c62828'}">
                        ${data.tipo === 'entrada' ? '📥 Check-in' : '📤 Check-out'}
                    </small>
                </div>
                <div class="ci-time">${time}</div>
            `;
            listCheckins.appendChild(item);
        });
    });

    // E. ESCUCHA DE INGRESOS MENSUALES (KPI: Ingresos)
    onSnapshot(collection(db, "reservas"), (snapshot) => {
        let totalAcumulado = 0;
        snapshot.forEach(doc => {
            const res = doc.data();
            // Aquí puedes añadir lógica para filtrar solo el mes actual si lo deseas
            totalAcumulado += Number(res.total_pago || 0);
        });
        kpiIngresos.innerText = `S/${totalAcumulado.toLocaleString()}`;
    });
}

// --- 3. LOGOUT (Cierre de Sesión) ---
const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        const confirmar = confirm("¿Deseas salir del sistema del Hotel Central?");
        if (confirmar) {
            try {
                await signOut(auth);
                window.location.href = "index.html";
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
                alert("Hubo un error al cerrar sesión.");
            }
        }
    });
}