import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- VARIABLES GLOBALES DE GRÁFICOS ---
let chartSemanal, chartDonut, chartMensual;

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
    // A. Gráfico Semanal (Líneas)
    chartSemanal = new ApexCharts(document.querySelector("#chart-line"), {
        chart: { type: 'area', height: 250, toolbar: { show: false } },
        series: [{ name: 'Soles S/', data: [0, 0, 0, 0, 0, 0, 0] }],
        xaxis: { categories: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'] },
        colors: ['#800020'],
        stroke: { curve: 'smooth' }
    });
    chartSemanal.render();

    // B. Gráfico de Dona (Categorías de Huéspedes)
    chartDonut = new ApexCharts(document.querySelector("#chart-donut"), {
        chart: { type: 'donut', height: 250 },
        series: [0, 0, 0, 0],
        labels: ['VIP', 'Frecuente', 'Corporativo', 'Regular'],
        colors: ['#800020', '#cc9900', '#3d2b1f', '#64748b'],
        legend: { position: 'bottom' }
    });
    chartDonut.render();

    // C. Gráfico Mensual (Barras) - REEMPLAZA AL RADIAL
    chartMensual = new ApexCharts(document.querySelector("#chart-radial"), {
        chart: { type: 'bar', height: 250, toolbar: { show: false } },
        plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
        series: [{ name: 'Ingresos Mensuales', data: [0, 0, 0, 0, 0, 0] }],
        xaxis: { categories: ['Mes 1', 'Mes 2', 'Mes 3', 'Mes 4', 'Mes 5', 'Mes 6'] },
        colors: ['#cc9900']
    });
    chartMensual.render();
}

// --- 3. LÓGICA DE DATOS EN TIEMPO REAL ---
function inicializarDashboard() {
    inicializarGraficos();

    // --- LÓGICA UNIFICADA DE PAGOS (Semanal, Mensual y KPI) ---
    onSnapshot(collection(db, "pagos"), (snapshot) => {
        let ingresosSemana = [0, 0, 0, 0, 0, 0, 0];
        let ingresosPorMes = {}; // Para agrupar por mes/año
        let totalMesActual = 0;

        const ahora = new Date();
        const mesActual = ahora.getMonth();
        const anioActual = ahora.getFullYear();

        snapshot.forEach(doc => {
            const data = doc.data();
            const monto = Number(data.montoTotal || 0);
            const fecha = data.fechaPago?.toDate() || new Date();
            
            // 1. Lógica Semanal (Solo si es de la semana actual es opcional, aquí sumamos por día histórico)
            const dia = fecha.getDay();
            const index = (dia === 0) ? 6 : dia - 1;
            ingresosSemana[index] += monto;

            // 2. Lógica Mensual (Agrupación)
            const keyMes = `${fecha.getMonth()}-${fecha.getFullYear()}`;
            ingresosPorMes[keyMes] = (ingresosPorMes[keyMes] || 0) + monto;

            // 3. KPI Mes Actual
            if (fecha.getMonth() === mesActual && fecha.getFullYear() === anioActual) {
                totalMesActual += monto;
            }
        });

        // Actualizar KPI
        document.getElementById('kpi-ingresos').innerText = `S/ ${totalMesActual.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

        // Actualizar Gráfico Semanal
        chartSemanal.updateSeries([{ data: ingresosSemana }]);

        // Actualizar Gráfico Mensual (Últimos 6 meses)
        const mesesLabels = [];
        const mesesData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(ahora.getMonth() - i);
            const m = d.getMonth();
            const y = d.getFullYear();
            const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            
            mesesLabels.push(nombresMeses[m]);
            mesesData.push(ingresosPorMes[`${m}-${y}`] || 0);
        }
        chartMensual.updateOptions({ xaxis: { categories: mesesLabels } });
        chartMensual.updateSeries([{ data: mesesData }]);
    });

    // --- CRM: Categorías de Huéspedes ---
    onSnapshot(collection(db, "huespedes"), (snapshot) => {
        const cat = { vip: 0, frecuente: 0, corporativo: 0, regular: 0 };
        snapshot.forEach(doc => {
            const c = (doc.data().categoria || "Regular").toLowerCase();
            if (cat[c] !== undefined) cat[c]++;
        });
        chartDonut.updateSeries([cat.vip, cat.frecuente, cat.corporativo, cat.regular]);
        document.getElementById('kpi-huespedes').innerText = snapshot.size;
    });

    // --- ACTIVIDAD RECIENTE: Últimos Pagos ---
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
                <div class="activity-badge" style="background: #cc9900;"></div>
                <div class="activity-info">
                    <p>${data.huesped} - Hab. ${data.habitacion}</p>
                    <small>${data.tipoTicket} | <strong>S/ ${data.montoTotal}</strong></small>
                </div>
            `;
            list.appendChild(item);
        });
    });
}

// --- 4. LOGOUT ---
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if (confirm("¿Cerrar sesión en Hotel Central?")) {
        await signOut(auth);
        window.location.href = "index.html";
    }
});