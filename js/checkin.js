import { db } from "./firebaseconfig.js";
import { 
    collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- LÓGICA DE INTERFAZ (Cambiar entre Check-in y Check-out) ---
window.showForm = function(type) {
    const formCheckin = document.getElementById('form-checkin');
    const formCheckout = document.getElementById('form-checkout');
    const tabs = document.querySelectorAll('.tab-btn');

    if (type === 'checkin') {
        formCheckin.style.display = 'block';
        formCheckout.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        formCheckin.style.display = 'none';
        formCheckout.style.display = 'block';
        tabs[1].classList.add('active');
        tabs[0].classList.remove('active');
    }
}

// --- PROCESO DE CHECK-IN ---
const checkinForm = document.getElementById('checkinForm');

checkinForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const habitacionNum = document.getElementById('ci_habitacion').value;
    const nombreHuesped = document.getElementById('ci_nombre').value;

    try {
        // 1. Buscar la habitación en la base de datos
        const q = query(collection(db, "habitaciones"), where("numero", "==", habitacionNum));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert("La habitación no existe.");
            return;
        }

        const habDoc = querySnapshot.docs[0];
        const habData = habDoc.data();

        if (habData.estado !== "Libre") {
            alert(`La habitación ${habitacionNum} no está disponible (Estado: ${habData.estado})`);
            return;
        }

        // 2. Actualizar estado de la habitación a "Ocupada"
        await updateDoc(doc(db, "habitaciones", habDoc.id), {
            estado: "Ocupada",
            huespedActual: nombreHuesped
        });

        // 3. Registrar el evento en una colección de "actividad" o "estancias"
        await addDoc(collection(db, "estancias"), {
            huesped: nombreHuesped,
            habitacion: habitacionNum,
            tipo: "Check-in",
            fecha: serverTimestamp(),
            metodoPago: document.getElementById('ci_pago').value
        });

        alert("✅ Check-in realizado con éxito. Habitación actualizada.");
        checkinForm.reset();

    } catch (error) {
        console.error("Error en Check-in:", error);
        alert("Hubo un error al procesar el Check-in.");
    }
});

// --- PROCESO DE CHECK-OUT ---
const checkoutForm = document.getElementById('checkoutForm');

checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const habitacionNum = document.getElementById('co_habitacion').value;

    try {
        // 1. Buscar la habitación
        const q = query(collection(db, "habitaciones"), where("numero", "==", habitacionNum));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert("La habitación no existe.");
            return;
        }

        const habDoc = querySnapshot.docs[0];
        const habData = habDoc.data();

        if (habData.estado !== "Ocupada") {
            alert("Esta habitación no figura como Ocupada.");
            return;
        }

        // 2. Actualizar estado a "Limpieza" (o Libre)
        await updateDoc(doc(db, "habitaciones", habDoc.id), {
            estado: "Limpieza", // Recomendado para que el personal sepa que debe limpiar
            huespedActual: ""
        });

        // 3. Registrar salida
        await addDoc(collection(db, "estancias"), {
            habitacion: habitacionNum,
            huesped: habData.huespedActual || "N/A",
            tipo: "Check-out",
            fecha: serverTimestamp()
        });

        alert(`✅ Check-out de la Hab. ${habitacionNum} realizado. Se ha marcado para Limpieza.`);
        checkoutForm.reset();

    } catch (error) {
        console.error("Error en Check-out:", error);
        alert("Hubo un error al procesar el Check-out.");
    }
});