import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, onSnapshot, query, orderBy, limit, doc, where, getDoc, getDocs
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
        const btnConfig = document.getElementById('nav-config'); // Seleccionamos el enlace de configuración

        try {
            const userDocRef = doc(db, "usuarios", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                if (uiNombre) uiNombre.innerText = userData.nombre; 
                if (uiRol) uiRol.innerText = userData.rol;      
                
                // --- LÓGICA DE VISIBILIDAD PARA ADMINISTRADOR ---
                if (userData.rol === "Administrador") {
                    if (btnConfig) {
                        btnConfig.style.display = "block"; // Solo el Admin lo ve
                        console.log("Acceso administrativo habilitado.");
                    }
                }

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
    const elMensual = document.querySelector("#chart-bar"); 

    // Gráfico Semanal
    if (elSemanal) {
        chartSemanal = new ApexCharts(elSemanal, {
            chart: { type: 'area', height: 250, toolbar: { show: false }, zoom: { enabled: false } },
            series: [{ name: 'Ingresos S/', data: [0, 0, 0, 0, 0, 0, 0] }],
            xaxis: { categories: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'] },
            yaxis: {
                labels: {
                    formatter: (value) => `S/ ${value.toFixed(0)}`
                },
                min: 0,
                forceNiceScale: true // Esto obliga a que los números sean "limpios" (100, 200, etc)
            },
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
            plotOptions: { bar: { borderRadius: 4, columnWidth: '60%', dataLabels: { position: 'top' } } },
            // --- CORRECCIÓN AQUÍ: Configuración del eje Y ---
            yaxis: {
                labels: {
                    formatter: (value) => `S/ ${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value.toFixed(0)}`
                }
            },
            series: [{ name: 'Ingresos S/', data: Array(12).fill(0) }],
            xaxis: { 
                categories: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
                labels: { style: { fontSize: '10px' } }
            },
            colors: ['#cc9900'],
            dataLabels: {
                enabled: true,
                formatter: (val) => `S/ ${val.toFixed(0)}`,
                style: { colors: ['#333'], fontSize: '10px' },
                offsetY: -20
            }
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

        // --- LÓGICA PARA OBTENER EL INICIO DE LA SEMANA ACTUAL (LUNES) ---
        const inicioSemana = new Date(ahora);
        const diaHoy = inicioSemana.getDay(); // 0 es Dom, 1 es Lun...
        const diff = inicioSemana.getDate() - diaHoy + (diaHoy === 0 ? -6 : 1); 
        inicioSemana.setDate(diff);
        inicioSemana.setHours(0, 0, 0, 0); // Lunes a las 00:00

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
                
                // 1. FILTRO PARA GRÁFICO SEMANAL: Solo si la fecha es mayor o igual al lunes de esta semana
                if (fechaObj >= inicioSemana) {
                    const dia = fechaObj.getDay();
                    const index = (dia === 0) ? 6 : dia - 1; // Ajustar para que 0 sea Lunes y 6 Domingo
                    ingresosSemana[index] += monto;
                }

                const keyMes = `${m}-${y}`;
                ingresosPorMes[keyMes] = (ingresosPorMes[keyMes] || 0) + monto;

                if (m === mesActual && y === anioActual) totalMesActual += monto;
                if (m === mesPasado && y === anioPasado) totalMesAnterior += monto;
            }
        });

 const elKpiIngresos = document.getElementById('kpi-ingresos');
 if (elKpiIngresos) elKpiIngresos.innerText = `S/ ${totalMesActual.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
 
 actualizarTendencia(totalMesActual, totalMesAnterior, 'trend-ingresos');

 // El gráfico ahora solo mostrará datos de la semana actual
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
const ahora = new Date();
const hoyString = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

// Creamos la consulta para traer solo lo necesario
const qReservasHoy = query(
    collection(db, "reservas"),
    where("checkIn", "==", hoyString),
    where("estado", "==", "reservada")
);

onSnapshot(qReservasHoy, (snapshot) => {
    const elReservas = document.getElementById('kpi-reservas-hoy');
    if (!elReservas) return;

    // snapshot.size nos da el conteo directo, sin necesidad de hacer forEach
    elReservas.innerText = snapshot.size;
});

// E. ACTIVIDAD RECIENTE (Cruce exacto por idReserva)
// E. ACTIVIDAD RECIENTE (Cruce exacto por idReserva)
const qPagos = query(collection(db, "pagos"), orderBy("fechaPago", "desc"), limit(5));
onSnapshot(qPagos, async (snapshot) => {
    const list = document.getElementById('list-checkins');
    if (!list) return;
    list.innerHTML = '';

    for (const docPago of snapshot.docs) {
        const dataPago = docPago.data();
        const idReserva = dataPago.idReserva;
        let tipoExacto = "PAGO DE ESTADÍA"; // Valor por defecto

        // --- PROCESAMIENTO DE FECHA Y HORA ---
        const fRaw = dataPago.fechaPago;
        let tiempoTexto = "";
        if (fRaw) {
            const dateObj = fRaw.toDate ? fRaw.toDate() : new Date(fRaw);
            if (!isNaN(dateObj.getTime())) {
                const fecha = dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
                const hora = dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
                tiempoTexto = `${fecha} ${hora}`;
            }
        }

        try {
            if (idReserva) {
                // 1. BUSCAR EN CONSUMOS
                const qConsumos = query(collection(db, "consumos"), where("idReserva", "==", idReserva));
                const consumoSnap = await getDocs(qConsumos);
                let esConsumo = false;

                if (!consumoSnap.empty) {
                    consumoSnap.forEach(cDoc => {
                        const cData = cDoc.data();
                        if (Number(cData.precioTotal) === Number(dataPago.montoTotal)) {
                            tipoExacto = `CONSUMO: ${cData.descripcion}`;
                            esConsumo = true;
                        }
                    });
                }

                // 2. BUSCAR EN RESERVAS
                if (!esConsumo) {
                    const resRef = doc(db, "reservas", idReserva);
                    const resSnap = await getDoc(resRef);
                    if (resSnap.exists()) {
                        const resData = resSnap.data();
                        if (resData.estado === "finalizada" || resData.estado === "check-out") {
                            tipoExacto = "LIQUIDACIÓN CHECK-OUT";
                        } 
                        else if (dataPago.tipoTicket === "Adelanto" || dataPago.tipoTicket === "Abono") {
                            tipoExacto = "ABONO / RESERVA";
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error al procesar tipo de pago:", error);
        }

        // --- RENDERIZADO EN LA LISTA ---
        const item = document.createElement('div');
        item.className = "activity-item";
        item.innerHTML = `
            <div class="activity-badge"></div>
            <div class="activity-info">
                <p><strong>${dataPago.huesped || 'Huésped'}</strong> - Hab. ${dataPago.habitacion || 'S/N'}</p>
                <small>
                    <span class="badge-tipo" style="background: #fff5f5; color: #800020; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 10px; border: 1px solid #80002030;">
                        ${tipoExacto}
                    </span> | 
                    <strong>S/ ${Number(dataPago.montoTotal || 0).toFixed(2)}</strong>
                    <span style="color: #64748b; margin-left: 5px;"> • ${tiempoTexto}</span>
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