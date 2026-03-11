import { db } from "./firebaseconfig.js";
import { 
    collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// --- 1. LÓGICA DE INTERFAZ ---
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
};

// --- 2. PROCESO DE CHECK-IN ---
const checkinForm = document.getElementById('checkinForm');
checkinForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const habitacionNum = document.getElementById('ci_habitacion').value.trim();
    const nombreHuesped = document.getElementById('ci_nombre').value.trim();

    try {
        // A. Buscar la habitación
        const qHab = query(collection(db, "habitaciones"), where("numero", "==", habitacionNum));
        const snapHab = await getDocs(qHab);

        if (snapHab.empty) return Swal.fire("Error", "La habitación no existe.", "error");
        
        const habDoc = snapHab.docs[0];
        if (habDoc.data().estado !== "Libre") {
            return Swal.fire("Aviso", `La habitación ${habitacionNum} no está disponible.`, "warning");
        }

        // B. Buscar si existe reserva "Confirmada" para sincronizar
        const qRes = query(
            collection(db, "reservas"), 
            where("habitacion", "==", habitacionNum),
            where("estado", "==", "Confirmada")
        );
        const snapRes = await getDocs(qRes);

        // C. Ejecutar actualizaciones
        await updateDoc(doc(db, "habitaciones", habDoc.id), {
            estado: "Ocupada",
            huespedActual: nombreHuesped
        });

        // Si hay una reserva, marcar como completada
        if (!snapRes.empty) {
            await updateDoc(doc(db, "reservas", snapRes.docs[0].id), { estado: "Completada" });
        }

        // D. Registrar estancia
        await addDoc(collection(db, "estancias"), {
            huesped: nombreHuesped,
            habitacion: habitacionNum,
            tipo: "Check-in",
            fecha: serverTimestamp(),
            metodoPago: document.getElementById('ci_pago').value
        });

        Swal.fire("¡Éxito!", "Check-in registrado y reserva sincronizada.", "success");
        checkinForm.reset();

    } catch (error) {
        console.error("Error en Check-in:", error);
        Swal.fire("Error", "No se pudo procesar el Check-in.", "error");
    }
});

// --- 3. PROCESO DE CHECK-OUT ---
const checkoutForm = document.getElementById('checkoutForm');
checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const habitacionNum = document.getElementById('co_habitacion').value.trim();

    try {
        const qHab = query(collection(db, "habitaciones"), where("numero", "==", habitacionNum));
        const snapHab = await getDocs(qHab);

        if (snapHab.empty) return Swal.fire("Error", "Habitación no encontrada.", "error");

        const habDoc = snapHab.docs[0];
        const habData = habDoc.data();

        if (habData.estado !== "Ocupada") {
            return Swal.fire("Aviso", "Esta habitación no está marcada como ocupada.", "info");
        }

        // Actualizar habitación a Limpieza
        await updateDoc(doc(db, "habitaciones", habDoc.id), {
            estado: "Limpieza",
            huespedActual: ""
        });

        // Registrar salida
        await addDoc(collection(db, "estancias"), {
            habitacion: habitacionNum,
            huesped: habData.huespedActual || "Desconocido",
            tipo: "Check-out",
            fecha: serverTimestamp()
        });

        Swal.fire("¡Check-out realizado!", "Habitación marcada para limpieza.", "success");
        checkoutForm.reset();

    } catch (error) {
        console.error("Error en Check-out:", error);
        Swal.fire("Error", "No se pudo procesar el Check-out.", "error");
    }
});