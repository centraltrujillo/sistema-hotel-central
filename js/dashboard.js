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
            const userDocRef = doc(db, "usuarios", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                if (uiNombre) uiNombre.innerText = userData.nombre; 
                if (uiRol) uiRol.innerText = userData.rol;      
                console.log(`Sesión iniciada: ${userData.nombre} (${userData.rol})`);
            }
        } catch (error) {
            console.error("Error al obtener datos del usuario:", error);
        }

        // ESPERAR A QUE EL DOM ESTÉ LISTO ANTES DE INICIALIZAR
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', inicializarDashboard);
        } else {
            inicializarDashboard();
        }
    } else {
        window.location.href = "index.html"; 
    }
});

// --- 2. INICIALIZACIÓN DE GRÁFICOS ---
function inicializarGraficos() {
    const elSemanal = document.querySelector("#chart-line");
    const elMensual = document.querySelector("#chart-radial");

    // Gráfico Semanal
    if (elSemanal) {
        chartSemanal = new ApexCharts(elSemanal, {
            chart: { type: 'area', height: 250, toolbar: { show: false }, zoom: { enabled: false } },
            series: [{ name: 'Ingresos S/', data: [0, 0, 0, 0, 0, 0, 0] }],
            xaxis: { categories: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'] },
            colors: ['#800020'], 
            stroke: { curve: 'smooth', width: 3 },
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05, stops: [20, 100] } },
            dataLabels: { enabled: false }
        });
        chartSemanal.render();
    }

    // Gráfico Mensual
    if (elMensual) {
        chartMensual = new ApexCharts(elMensual, {
            chart: { type: 'bar', height: 250, toolbar: { show: false } },
            plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
            series: [{ name: 'Ingresos S/', data: Array(12).fill(0) }],
            xaxis: { 
                categories: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
                labels: { style: { fontSize: '10px' } }
            },
            colors: ['#cc9900']
        });
        chartMensual.render();
    }
}

// --- 3. LÓGICA DE DATOS EN TIEMPO REAL ---
function inicializarDashboard() {
    inicializarGraficos();

    const elFecha = document.getElementById('current-date');
    if (elFecha) {
        const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        elFecha.innerText = new Date().toLocaleDateString('es-ES', opciones);
    }

    // A. PAGOS
    onSnapshot(collection(db, "pagos"), (snapshot) => {
        let ingresosSemana = [0, 0, 0, 0, 0, 0, 0];
        let ingresosPorMes = {}; 
        let totalMesActual = 0;
        let totalMesAnterior = 0;

        const ahora = new Date();
        const mesActual = ahora.getMonth();
        const anioActual = ahora.getFullYear();

        const fechaMesPasado = new Date();
        fechaMesPasado.setMonth(ahora.getMonth() - 1);
        const mesPasado = fechaMesPasado.getMonth();
        const anioPasado = fechaMesPasado.getFullYear();

        snapshot.forEach(doc => {
            const data = doc.data();
            const monto = Number(data.montoTotal || 0);
            const fechaObj = formatearFechaJS(data.fechaPago);
            
            if (fechaObj) {
                const m = fechaObj.getMonth();
                const y = fechaObj.getFullYear();
                
                const dia = fechaObj.getDay();
                const index = (dia === 0) ? 6 : dia - 1;
                ingresosSemana[index] += monto;

                const keyMes = `${m}-${y}`;
                ingresosPorMes[keyMes] = (ingresosPorMes[keyMes] || 0) + monto;

                if (m === mesActual && y === anioActual) totalMesActual += monto;
                if (m === mesPasado && y === anioPasado) totalMesAnterior += monto;
            }
        });

        const elKpiIngresos = document.getElementById('kpi-ingresos');
        if (elKpiIngresos) elKpiIngresos.innerText = `S/ ${totalMesActual.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        
        actualizarTendencia(totalMesActual, totalMesAnterior, 'trend-ingresos');

        if (chartSemanal) chartSemanal.updateSeries([{ data: ingresosSemana }]);

        if (chartMensual) {
            const mesesData = [];
            for (let m = 0; m <= 11; m++) {
                mesesData.push(ingresosPorMes[`${m}-${anioActual}`] || 0);
            }
            chartMensual.updateSeries([{ name: 'Ingresos S/', data: mesesData }]);
        }
    });

    // B. OCUPACIÓN
    onSnapshot(collection(db, "habitaciones"), (snapshot) => {
        const elOcupacion = document.getElementById('kpi-ocupacion');
        if (!elOcupacion) return;
        const totalHabitaciones = snapshot.size || 13; 
        let ocupadas = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.estado === "Ocupado" || data.estado === "Ocupada") ocupadas++;
        });
        elOcupacion.innerText = `${ocupadas}/${totalHabitaciones}`;
    });

    // C. HUÉSPEDES
    onSnapshot(collection(db, "huespedes"), (snapshot) => {
        const elHuespedes = document.getElementById('kpi-huespedes');
        if (elHuespedes) elHuespedes.innerText = snapshot.size;
    });

    // D. RESERVAS HOY
    onSnapshot(collection(db, "reservas"), (snapshot) => {
        const elReservas = document.getElementById('kpi-reservas-hoy');
        if (!elReservas) return;
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
        elReservas.innerText = reservasHoy;
    });

// E. ACTIVIDAD RECIENTE (Detección de Consumos vs Check-out vs Abonos)
const qPagos = query(collection(db, "pagos"), orderBy("fechaPago", "desc"), limit(5));
onSnapshot(qPagos, async (snapshot) => {
    const list = document.getElementById('list-checkins');
    if (!list) return;
    list.innerHTML = '';

    for (const docPago of snapshot.docs) {
        const dataPago = docPago.data();
        const idReserva = dataPago.idReserva;
        let tipoExacto = "Pago de Estadía"; 

        try {
            if (idReserva) {
                // 1. ¿ES UN CONSUMO? (Cruce con colección consumos)
                const qConsumos = query(collection(db, "consumos"), where("idReserva", "==", idReserva));
                const consumoSnap = await getDocs(qConsumos);
                let esConsumo = false;

                consumoSnap.forEach(cDoc => {
                    const cData = cDoc.data();
                    // Si el monto coincide con un consumo registrado
                    if (Number(cData.precioTotal) === Number(dataPago.montoTotal)) {
                        tipoExacto = `Consumo: ${cData.descripcion}`;
                        esConsumo = true;
                    }
                });

                // 2. ¿ES CHECK-OUT O ABONO? (Cruce con colección reservas)
                if (!esConsumo) {
                    const resRef = doc(db, "reservas", idReserva);
                    const resSnap = await getDoc(resRef);
                    
                    if (resSnap.exists()) {
                        const resData = resSnap.data();
                        
                        // Si la reserva ya terminó o el pago es por el saldo pendiente al salir
                        if (resData.estado === "finalizada" || resData.estado === "check-out") {
                            tipoExacto = "Liquidación Check-out";
                        } 
                        // Si es el primer pago registrado
                        else if (dataPago.tipoTicket === "Adelanto" || dataPago.tipoTicket === "Abono") {
                            tipoExacto = "Abono / Reserva";
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error al procesar tipo de pago:", error);
        }

        const item = document.createElement('div');
        item.className = "activity-item";
        item.innerHTML = `
            <div class="activity-badge"></div>
            <div class="activity-info">
                <p><strong>${dataPago.huesped}</strong> - Hab. ${dataPago.habitacion}</p>
                <small>
                    <span class="badge-tipo" style="background: #fff5f5; color: #800020; padding: 2px 5px; border-radius: 4px; font-weight: 700; font-size: 10px; border: 1px solid #80002020;">
                        ${tipoExacto.toUpperCase()}
                    </span> | 
                    <strong>S/ ${Number(dataPago.montoTotal).toFixed(2)}</strong>
                </small>
            </div>`;
        list.appendChild(item);
    }
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
        reverseButtons: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await signOut(auth);
                window.location.href = "index.html";
            } catch (error) {
                console.error("Error al cerrar sesión");
            }
        }
    });
});