import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, where, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- VARIABLES GLOBALES DE GRÁFICOS ---
let chartLine, chartDonut, chartRadial;

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
    // A. Gráfico de Líneas (Ingresos Semanales)
    chartLine = new ApexCharts(document.querySelector("#chart-line"), {
        chart: { type: 'area', height: 250, toolbar: { show: false }, zoom: { enabled: false } },
        series: [{ name: 'Ingresos S/', data: [0, 0, 0, 0, 0, 0, 0] }],
        xaxis: { categories: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'] },
        colors: ['#800020'],
        stroke: { curve: 'smooth', width: 3 },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.6, opacityTo: 0.1 } },
        dataLabels: { enabled: false }
    });
    chartLine.render();

    // B. Gráfico de Dona (Segmentación CRM)
    chartDonut = new ApexCharts(document.querySelector("#chart-donut"), {
        chart: { type: 'donut', height: 250 },
        series: [0, 0, 0, 0],
        labels: ['VIP', 'Frecuente', 'Corporativo', 'Regular'],
        colors: ['#800020', '#cc9900', '#3d2b1f', '#64748b'],
        legend: { position: 'bottom' },
        plotOptions: { pie: { donut: { size: '65%' } } }
    });
    chartDonut.render();

    // C. Gráfico Radial (% Ocupación)
    chartRadial = new ApexCharts(document.querySelector("#chart-radial"), {
        chart: { height: 250, type: 'radialBar' },
        series: [0],
        plotOptions: {
            radialBar: {
                hollow: { size: '70%' },
                dataLabels: {
                    name: { show: false },
                    value: { fontSize: '22px', fontFamily: 'Playfair Display', formatter: (val) => val + "%" }
                }
            }
        },
        colors: ['#cc9900']
    });
    chartRadial.render();
}

// --- 3. LÓGICA DE DATOS EN TIEMPO REAL ---
function inicializarDashboard() {
    inicializarGraficos();

    // --- KPI & RADIAL: Ocupación ---
    onSnapshot(collection(db, "habitaciones"), (snapshot) => {
        const total = 13; // Capacidad total del hotel
        const ocupadas = snapshot.docs.filter(doc => doc.data().estado === "Ocupada").length;
        const porcentaje = Math.round((ocupadas / total) * 100);

        document.getElementById('kpi-ocupacion').innerText = `${ocupadas}/${total}`;
        chartRadial.updateSeries([porcentaje]);
    });

    // --- KPI & DONUT: Huéspedes (CRM) ---
    onSnapshot(collection(db, "huespedes"), (snapshot) => {
        document.getElementById('kpi-huespedes').innerText = snapshot.size;

        const cat = { vip: 0, frecuente: 0, corporativo: 0, regular: 0 };
        snapshot.forEach(doc => {
            const c = (doc.data().categoria || "Regular").toLowerCase();
            if (cat[c] !== undefined) cat[c]++;
        });

        chartDonut.updateSeries([cat.vip, cat.frecuente, cat.corporativo, cat.regular]);
    });

    // --- KPI & LINE: Ingresos y Flujo ---
    onSnapshot(collection(db, "reservas"), (snapshot) => {
        let totalSoles = 0;
        let ingresosSemana = [0, 0, 0, 0, 0, 0, 0];

        snapshot.forEach(doc => {
            const res = doc.data();
            const monto = Number(res.totalPago || res.precio || 0);
            totalSoles += monto;

            // Lógica de distribución semanal
            if (res.fechaEntrada) {
                const fecha = new Date(res.fechaEntrada);
                const dia = fecha.getDay(); // 0 (Dom) a 6 (Sab)
                const index = (dia === 0) ? 6 : dia - 1; // Ajuste para que Lunes sea 0
                ingresosSemana[index] += monto;
            }
        });

        document.getElementById('kpi-ingresos').innerText = `S/ ${totalSoles.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        chartLine.updateSeries([{ data: ingresosSemana }]);
    });

    // --- ACTIVIDAD RECIENTE (CRM) ---
    const qOps = query(collection(db, "reservas"), orderBy("fechaRegistro", "desc"), limit(5));
    onSnapshot(qOps, (snapshot) => {
        const list = document.getElementById('list-checkins');
        if (!list) return;
        list.innerHTML = '';

        if (snapshot.empty) {
            list.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Sin actividad reciente</p>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = "activity-item"; // Usa la clase de tu CSS
            item.innerHTML = `
                <div class="activity-badge"></div>
                <div class="activity-info">
                    <p>${data.huesped || 'Huésped'} - Hab. ${data.habitacion || '??'}</p>
                    <small>${data.tipoReserva || 'Reserva'} | S/ ${data.totalPago || 0}</small>
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