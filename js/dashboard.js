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
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Mostrar nombre y rol en el Header
        const userNameElem = document.getElementById('userName');
        const userRoleElem = document.getElementById('userRole');

        if (userNameElem) {
            // Usa el nombre de perfil o la primera parte del correo
            userNameElem.innerText = user.displayName || user.email.split('@')[0];
        }
        if (userRoleElem) {
            userRoleElem.innerText = "Administrador"; 
        }

        console.log("Acceso concedido:", user.email);
        inicializarDashboard();
    } else {
        console.log("Acceso denegado, redirigiendo al login...");
        window.location.href = "index.html"; 
    }
});

// --- 2. CONFIGURACIÓN DEL GRÁFICO (ApexCharts) ---
let chart; 

function inicializarGrafico() {
    const options = {
        chart: {
            type: 'area',
            height: 250,
            toolbar: { show: false },
            fontFamily: 'Lato, sans-serif'
        },
        series: [{
            name: 'Ingresos S/',
            data: [0, 0, 0, 0, 0, 0, 0] // Se llenará con datos reales
        }],
        xaxis: {
            categories: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
            labels: { style: { colors: '#888', fontSize: '12px' } }
        },
        colors: ['#800020'], // Color Vino Tinto acorde a tu marca
        stroke: { curve: 'smooth', width: 3 },
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1 }
        },
        dataLabels: { enabled: false }
    };

    chart = new ApexCharts(document.querySelector("#chart-line"), options);
    chart.render();
}

// --- 3. FUNCIÓN PRINCIPAL DEL DASHBOARD ---
function inicializarDashboard() {
    // Iniciar el gráfico vacío
    inicializarGrafico();

    // Referencias a los elementos del HTML
    const kpiOcupacion = document.getElementById('kpi-ocupacion');
    const kpiHuespedes = document.getElementById('kpi-huespedes');
    const kpiReservas = document.getElementById('kpi-reservas');
    const kpiIngresos = document.getElementById('kpi-ingresos');
    const listCheckins = document.getElementById('list-checkins');

    // A. KPI: Ocupación (Habitaciones ocupadas)
    const qHab = query(collection(db, "habitaciones"), where("estado", "==", "Ocupada"));
    onSnapshot(qHab, (snapshot) => {
        if (kpiOcupacion) kpiOcupacion.innerText = `${snapshot.size}/13`;
    });

    // B. KPI: Reservas de Hoy
    const fechaHoy = new Date().toISOString().split('T')[0];
    const qResHoy = query(collection(db, "reservas"), where("fecha_entrada", "==", fechaHoy));
    onSnapshot(qResHoy, (snapshot) => {
        if (kpiReservas) kpiReservas.innerText = snapshot.size;
    });

    // C. KPI: Huéspedes Activos
    const qHuespedes = query(collection(db, "reservas"), where("estado_reserva", "==", "Check-in"));
    onSnapshot(qHuespedes, (snapshot) => {
        if (kpiHuespedes) kpiHuespedes.innerText = snapshot.size;
    });

    // D. Actividad Reciente (Últimas Operaciones)
    const qOps = query(collection(db, "operaciones"), orderBy("timestamp", "desc"), limit(5));
    onSnapshot(qOps, (snapshot) => {
        if (!listCheckins) return;
        
        listCheckins.innerHTML = ''; // Corregido: sin espacio
        
        if (snapshot.empty) {
            listCheckins.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Sin actividad reciente</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            const item = document.createElement('div');
            item.style.cssText = "display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #f1f1f1; align-items: center;";

            item.innerHTML = `
                <div>
                    <strong style="color: #333;">Hab. ${data.habitacion}</strong> - ${data.huesped}
                    <br><small style="color: ${data.tipo === 'entrada' ? '#2e7d32' : '#c62828'}; font-weight: 700;">
                        ${data.tipo === 'entrada' ? '📥 Check-in' : '📤 Check-out'}
                    </small>
                </div>
                <div style="color: #999; font-size: 12px;">${time}</div>
            `;
            listCheckins.appendChild(item);
        });
    });

    // E. KPI: Ingresos Totales y Gráfico Dinámico
    onSnapshot(collection(db, "reservas"), (snapshot) => {
        let totalSoles = 0;
        let ingresosSemana = [0, 0, 0, 0, 0, 0, 0]; // L-M-M-J-V-S-D

        snapshot.forEach(doc => {
            const res = doc.data();
            const monto = Number(res.total_pago || 0);
            totalSoles += monto;

            // Distribuir ingresos en el gráfico según el día de entrada
            if (res.fecha_entrada) {
                const dia = new Date(res.fecha_entrada).getUTCDay(); // 0-6 (Dom-Sab)
                const indice = (dia === 0) ? 6 : dia - 1; // Ajuste: Lunes es 0
                ingresosSemana[indice] += monto;
            }
        });

        if (kpiIngresos) {
            kpiIngresos.innerText = `S/${totalSoles.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        }

        // Actualizar el gráfico con datos reales
        chart.updateSeries([{ data: ingresosSemana }]);
    });
}

// --- 4. LOGOUT ---
const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        if (confirm("¿Cerrar sesión en Hotel Central?")) {
            try {
                await signOut(auth);
                window.location.href = "index.html";
            } catch (error) {
                console.error("Error al salir:", error);
            }
        }
    });
}