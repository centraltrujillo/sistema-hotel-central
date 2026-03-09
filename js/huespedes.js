import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- REFERENCIAS AL DOM ---
const modal = document.getElementById('modalHuesped');
const btnNuevo = document.querySelector('.btn-add');
const formHuesped = document.getElementById('formNuevoHuesped');
const container = document.getElementById('huespedesContainer');

// KPIs
const totalH = document.getElementById('totalHuespedes');
const totalVip = document.getElementById('totalVip');
const totalActivos = document.getElementById('totalActivos');
const totalRegulares = document.getElementById('totalRegulares');

// --- PROTEGER RUTA ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarHuespedes();
    } else {
        window.location.href = "login.html";
    }
});

// --- FUNCIONES DEL MODAL ---
btnNuevo.onclick = () => modal.style.display = 'flex';

// Función global para cerrar modal (disponible en el HTML)
window.cerrarModal = () => {
    modal.style.display = 'none';
    formHuesped.reset();
};

// Cerrar si hace clic fuera del contenido blanco
window.onclick = (event) => {
    if (event.target == modal) cerrarModal();
};

// --- REGISTRAR EN FIREBASE ---
formHuesped.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nuevoHuesped = {
        nombre: document.getElementById('nombreH').value,
        email: document.getElementById('emailH').value,
        telefono: document.getElementById('telefonoH').value,
        categoria: document.getElementById('estadoH').value, // VIP, Activo, Regular
        fechaRegistro: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "huespedes"), nuevoHuesped);
        alert("Huésped registrado con éxito");
        cerrarModal();
    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Error al guardar el huésped");
    }
});

// --- CARGAR Y ACTUALIZAR EN TIEMPO REAL ---
function cargarHuespedes() {
    const q = query(collection(db, "huespedes"), orderBy("fechaRegistro", "desc"));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        let contVip = 0, contActivo = 0, contRegular = 0;

        snapshot.forEach((doc) => {
            const h = doc.data();
            
            // Contabilizar para KPIs
            if (h.categoria === "VIP") contVip++;
            else if (h.categoria === "Activo") contActivo++;
            else contRegular++;

            // Crear Tarjeta
            const card = document.createElement('div');
            card.className = 'huesped-card';
            card.innerHTML = `
                <div class="h-avatar">${h.nombre.charAt(0)}</div>
                <div class="h-info">
                    <h4>${h.nombre}</h4>
                    <p><i class="fa-solid fa-envelope"></i> ${h.email}</p>
                    <p><i class="fa-solid fa-phone"></i> ${h.telefono}</p>
                    <span class="badge ${h.categoria.toLowerCase()}">${h.categoria}</span>
                </div>
                <div class="h-actions">
                    <button title="Ver Reservas"><i class="fa-solid fa-calendar-days"></i></button>
                    <button title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                </div>
            `;
            container.appendChild(card);
        });

        // Actualizar KPIs en pantalla
        totalH.innerText = snapshot.size;
        totalVip.innerText = contVip;
        totalActivos.innerText = contActivo;
        totalRegulares.innerText = contRegular;
    });
}

// --- BUSCADOR EN TIEMPO REAL ---
document.getElementById('inputBuscar').addEventListener('input', (e) => {
    const filtro = e.target.value.toLowerCase();
    const tarjetas = document.querySelectorAll('.huesped-card');

    tarjetas.forEach(t => {
        const texto = t.innerText.toLowerCase();
        t.style.display = texto.includes(filtro) ? 'flex' : 'none';
    });
});