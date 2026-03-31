import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- VARIABLES GLOBALES DE GRÁFICOS ---
let chartSemanal, chartMensual;

// --- 1. CONTROL DE ACCESO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('userName').innerText = user.displayName || user.email.split('@')[0];
        inicializarDashboard();
    } else {
        window.location.href = "index.html"; 
    }
});

// --- 2. INICIALIZACIÓN DE GRÁFICOS (ApexCharts) ---
function inicializarGraficos() {
    // A. Gráfico Semanal (Líneas con degradado)
    chartSemanal = new ApexCharts(document.querySelector("#chart-line"), {
        chart: { 
            type: 'area', 
            height: 250, 
            toolbar: { show: false },
            zoom: { enabled: false }
        },
        series: [{ name: 'Ingresos S/', data: [0, 0, 0, 0, 0, 0, 0] }],
        xaxis: { categories: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'] },
        colors: ['#800020'], // Vino Tinto
        stroke: { curve: 'smooth', width: 3 },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.45,
                opacityTo: 0.05,
                stops: [20, 100]
            }
        },
        dataLabels: { enabled: false },
        grid: { borderColor: '#f1f1f1' }
    });
    chartSemanal.render();

    // B. Gráfico Mensual (Barras Oro)
    chartMensual = new ApexCharts(document.querySelector("#chart-radial"), {
        chart: { type: 'bar', height: 250, toolbar: { show: false } },
        plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
        series: [{ name: 'Ingresos Mensuales', data: [0, 0, 0, 0, 0, 0] }],
        xaxis: { categories: [] },
        colors: ['#cc9900'] // Amarillo Ocre/Oro
    });
    chartMensual.render();
}

// --- 3. LÓGICA DE DATOS EN TIEMPO REAL ---
function inicializarDashboard() {
    inicializarGraficos();

    // A. LÓGICA DE PAGOS (KPI Ingresos + Gráficos)
    onSnapshot(collection(db, "pagos"), (snapshot) => {
        let ingresosSemana = [0, 0, 0, 0, 0, 0, 0];
        let ingresosPorMes = {}; 
        let totalMesActual = 0;
        let totalMesAnterior = 0;

        const ahora = new Date();
        const mesActual = ahora.getMonth();
        const anioActual = ahora.getFullYear();

        const fechaPasada = new Date();
        fechaPasada.setMonth(ahora.getMonth() - 1);
        const mesPasado = fechaPasada.getMonth();
        const anioPasado = fechaPasada.getFullYear();

        snapshot.forEach(doc => {
            const data = doc.data();
            const monto = Number(data.montoTotal || 0);
            const fecha = data.fechaPago?.toDate() || new Date();
            const m = fecha.getMonth();
            const y = fecha.getFullYear();
            
            // Lógica Semanal
            const dia = fecha.getDay();
            const index = (dia === 0) ? 6 : dia - 1;
            ingresosSemana[index] += monto;

            // Agrupación Mensual
            const keyMes = `${m}-${y}`;
            ingresosPorMes[keyMes] = (ingresosPorMes[keyMes] || 0) + monto;

            // Comparativa de Meses para KPI
            if (m === mesActual && y === anioActual) totalMesActual += monto;
            if (m === mesPasado && y === anioPasado) totalMesAnterior += monto;
        });

        // Actualizar UI Ingresos
        document.getElementById('kpi-ingresos').innerText = `S/ ${totalMesActual.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        actualizarTendencia(totalMesActual, totalMesAnterior, 'trend-ingresos');

        // Actualizar Gráficos
        chartSemanal.updateSeries([{ data: ingresosSemana }]);

        const mesesLabels = [];
        const mesesData = [];
        const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(ahora.getMonth() - i);
            const mLabel = d.getMonth();
            const yLabel = d.getFullYear();
            mesesLabels.push(nombresMeses[mLabel]);
            mesesData.push(ingresosPorMes[`${mLabel}-${yLabel}`] || 0);
        }
        chartMensual.updateOptions({ xaxis: { categories: mesesLabels } });
        chartMensual.updateSeries([{ data: mesesData }]);
    });

    // B. LÓGICA DE OCUPACIÓN (Basado en tu Firebase de habitaciones)
    onSnapshot(collection(db, "habitaciones"), (snapshot) => {
        const totalHabitaciones = snapshot.size || 25; 
        let ocupadas = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.estado === "Ocupado" || data.estado === "Ocupada") {
                ocupadas++;
            }
        });

        document.getElementById('kpi-ocupacion').innerText = `${ocupadas}/${totalHabitaciones}`;
        const porcentaje = ((ocupadas / totalHabitaciones) * 100).toFixed(0);
        const trend = document.getElementById('trend-ocupacion');
        if(trend) {
            trend.innerText = `${porcentaje}% de ocupación actual`;
            trend.className = "trend-value trend-neutral";
        }
    });

    // C. LÓGICA DE HUÉSPEDES
    onSnapshot(collection(db, "huespedes"), (snapshot) => {
        document.getElementById('kpi-huespedes').innerText = snapshot.size;
        // Aquí podrías añadir lógica de tendencia si guardas fecha de registro
    });

    // D. ACTIVIDAD RECIENTE (Últimos 5 pagos)
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
                    <small>${data.tipoTicket} | <strong>S/ ${data.montoTotal}</strong></small>
                </div>
            `;
            list.appendChild(item);
        });
    });
}

//  E. LÓGICA DE RESERVAS HOY ---
const hoyInicio = new Date();
hoyInicio.setHours(0, 0, 0, 0);

const hoyFin = new Date();
hoyFin.setHours(23, 59, 59, 999);

// Consulta para reservas cuya fecha de creación o estadía sea HOY
onSnapshot(collection(db, "reservas"), (snapshot) => {
    let reservasHoy = 0;
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const fechaReserva = data.checkIn?.toDate(); 
        
        if (fechaReserva >= hoyInicio && fechaReserva <= hoyFin) {
            reservasHoy++;
        }
    });

    const kpiReservas = document.getElementById('kpi-reservas-hoy');
    if (kpiReservas) {
        kpiReservas.innerText = reservasHoy;
    }
    
    // Opcional: Actualizar tendencia de reservas (comparado con un número estático por ahora)
    const trendRes = document.getElementById('trend-reservas');
    if (trendRes) {
        trendRes.innerText = "Sincronizado";
        trendRes.className = "trend-value trend-neutral";
    }
});


// --- 4. FUNCIONES DE APOYO ---
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

// --- 5. LOGOUT ---
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if (confirm("¿Cerrar sesión en Hotel Central?")) {
        await signOut(auth);
        window.location.href = "index.html";
    }
});