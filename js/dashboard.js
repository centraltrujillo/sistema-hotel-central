import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, orderBy, limit, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- VARIABLES GLOBALES DE GRÁFICOS ---
let chartSemanal, chartMensual;

// --- FUNCIONES DE APOYO ---

function formatearFechaJS(fecha) {
    if (!fecha) return null;
    if (typeof fecha.toDate === 'function') return fecha.toDate(); 
    return new Date(fecha); 
}

function actualizarTendencia(actual, anterior, elementoId) {
    const elemento = document.getElementById(elementoId);
    if (!elemento) return;

    if (anterior === 0) {
        elemento.innerText = "Primeros datos";
        elemento.className = "trend-value trend-neutral";
        return;
    }

    const diferencia = actual - anterior;
    const porcentaje = ((diferencia / anterior) * 100).toFixed(1);
    
    elemento.innerText = `${Math.abs(porcentaje)}% vs mes anterior`;
    elemento.className = porcentaje >= 0 ? "trend-value trend-positive" : "trend-value trend-negative";
}

// --- 1. CONTROL DE ACCESO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const uiNombre = document.getElementById('userName');
        const uiRol = document.getElementById('userRole');

        try {
            // Referencia a tu colección "usuarios" usando el UID
            const userDocRef = doc(db, "usuarios", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                uiNombre.innerText = userData.nombre; 
                uiRol.innerText = userData.rol;      
                console.log(`Sesión iniciada: ${userData.nombre} (${userData.rol})`);
            } else {
                uiNombre.innerText = user.email.split('@')[0];
                uiRol.innerText = "Usuario";
            }
        } catch (error) {
            console.error("Error al obtener datos del usuario:", error);
            uiNombre.innerText = "Error";
        }

        inicializarDashboard();
    } else {
        window.location.href = "index.html"; 
    }
});

// --- 2. INICIALIZACIÓN DE GRÁFICOS (ApexCharts) ---
function inicializarGraficos() {
    // A. Gráfico Semanal
    chartSemanal = new ApexCharts(document.querySelector("#chart-line"), {
        chart: { type: 'area', height: 250, toolbar: { show: false }, zoom: { enabled: false } },
        series: [{ name: 'Ingresos S/', data: [0, 0, 0, 0, 0, 0, 0] }],
        xaxis: { categories: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'] },
        colors: ['#800020'], 
        stroke: { curve: 'smooth', width: 3 },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05, stops: [20, 100] } },
        dataLabels: { enabled: false }
    });
    chartSemanal.render();

    // B. Gráfico Mensual
    chartMensual = new ApexCharts(document.querySelector("#chart-radial"), {
        chart: { type: 'bar', height: 250, toolbar: { show: false } },
        plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
        series: [{ name: 'Ingresos Mensuales', data: [0, 0, 0, 0, 0, 0] }],
        xaxis: { categories: [] },
        colors: ['#cc9900'] 
    });
    chartMensual.render();
}

// --- 3. LÓGICA DE DATOS EN TIEMPO REAL ---
function inicializarDashboard() {
    inicializarGraficos();

    // Fecha actual en la cabecera
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', opciones);

    // A. PAGOS
    onSnapshot(collection(db, "pagos"), (snapshot) => {
        let ingresosSemana = [0, 0, 0, 0, 0, 0, 0];
        let ingresosPorMes = {}; 
        let totalMesActual = 0;
        let totalMesAnterior = 0;

        const ahora = new Date();
        const mesActual = ahora.getMonth();
        const anioActual = ahora.getFullYear();

        snapshot.forEach(doc => {
            const data = doc.data();
            const monto = Number(data.montoTotal || 0);
            const fechaObj = formatearFechaJS(data.fechaPago);
            
            if (fechaObj) {
                const m = fechaObj.getMonth();
                const y = fechaObj.getFullYear();
                
                // Lógica Semanal (Ajuste para que Lunes sea index 0)
                const dia = fechaObj.getDay();
                const index = (dia === 0) ? 6 : dia - 1;
                ingresosSemana[index] += monto;

                const keyMes = `${m}-${y}`;
                ingresosPorMes[keyMes] = (ingresosPorMes[keyMes] || 0) + monto;

                if (m === mesActual && y === anioActual) totalMesActual += monto;
            }
        });

        document.getElementById('kpi-ingresos').innerText = `S/ ${totalMesActual.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        chartSemanal.updateSeries([{ data: ingresosSemana }]);
    });

    // B. OCUPACIÓN
    onSnapshot(collection(db, "habitaciones"), (snapshot) => {
        const totalHabitaciones = snapshot.size || 25; 
        let ocupadas = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.estado === "Ocupado" || data.estado === "Ocupada") ocupadas++;
        });
        document.getElementById('kpi-ocupacion').innerText = `${ocupadas}/${totalHabitaciones}`;
    });

    // C. HUÉSPEDES
    onSnapshot(collection(db, "huespedes"), (snapshot) => {
        document.getElementById('kpi-huespedes').innerText = snapshot.size;
    });

    // D. RESERVAS HOY
    onSnapshot(collection(db, "reservas"), (snapshot) => {
        const ahora = new Date();
        const hoyString = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`; 

        let reservasHoy = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            const fechaEntrada = formatearFechaJS(data.checkIn);
            if (fechaEntrada) {
                const resString = `${fechaEntrada.getFullYear()}-${String(fechaEntrada.getMonth() + 1).padStart(2, '0')}-${String(fechaEntrada.getDate()).padStart(2, '0')}`;
                if (resString === hoyString && data.estado === "reservada") reservasHoy++;
            }
        });
        document.getElementById('kpi-reservas-hoy').innerText = reservasHoy;
    });

    // E. ACTIVIDAD RECIENTE
    const qPagos = query(collection(db, "pagos"), orderBy("fechaPago", "desc"), limit(5));
    onSnapshot(qPagos, (snapshot) => {
        const list = document.getElementById('list-checkins');
        if (!list) return;
        list.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = "activity-item";
            item.innerHTML = `
                <div class="activity-badge"></div>
                <div class="activity-info">
                    <p>${data.huesped} - Hab. ${data.habitacion}</p>
                    <small>${data.tipoTicket || 'Pago'} | <strong>S/ ${data.montoTotal || 0}</strong></small>
                </div>`;
            list.appendChild(item);
        });
    });
}

// --- 5. LOGOUT ---
document.getElementById('btnLogout')?.addEventListener('click', () => {
    Swal.fire({
        title: '¿Cerrar sesión?',
        text: "Cerrarás sesión del Sistema Hotel Central",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#800020',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, salir',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        backdrop: `rgba(128, 0, 32, 0.1)`
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await signOut(auth);
                Swal.fire({
                    title: '¡Sesión cerrada!',
                    icon: 'success',
                    showConfirmButton: false,
                    timer: 1500,
                    iconColor: '#cc9900' 
                });
                setTimeout(() => window.location.href = "index.html", 1500);
            } catch (error) {
                Swal.fire('Error', 'No se pudo cerrar la sesión', 'error');
            }
        }
    });
});