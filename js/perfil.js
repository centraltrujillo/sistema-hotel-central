import { auth, db } from "./firebaseconfig.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, collection, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// 🔹 Elementos del DOM
const contenido = document.getElementById("contenido");
const tituloPantalla = document.getElementById("titulo-pantalla");
const modal = document.getElementById("modal-profesor");
const usuarioInfo = document.getElementById("usuarioInfo");

// ======================================================
// 🔹 Verificar sesión actual
// ======================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Debes iniciar sesión");
    window.location.href = "login.html";
    return;
  }

  // Obtener datos del usuario desde Firestore
  const userRef = doc(db, "usuarios", user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    alert("No se encontraron tus datos en la base de datos");
    return;
  }

  const usuario = userSnap.data();
  tituloPantalla.textContent = `Perfil ${usuario.rol}`;

  // Botón de cerrar sesión ya existe en HTML
document.getElementById("btnCerrar").addEventListener("click", async () => {
  await signOut(auth);
  localStorage.clear();
  window.location.href = "login.html";
});


  // Renderizar según rol
  if (usuario.rol === "Administrativo") renderAdmin(usuario);
  else if (usuario.rol === "Profesor") renderProfesor(usuario);
  else contenido.innerHTML = "<p>Rol no reconocido.</p>";
});

// ======================================================
// 🔹 ADMINISTRATIVO (con buscador y columna Nivel)
// ======================================================
async function renderAdmin(usuario) {
  contenido.innerHTML = `
    <div class="info">
      <p>Nombre: <span>${usuario.nombre}</span></p>
      <p>Rol: <span>${usuario.rol}</span></p>
    </div>
    <h2>Lista de Profesores</h2>

    <!-- 🔍 Buscador -->
    <input type="text" id="buscador" placeholder="Buscar profesor por nombre, correo o nivel..." style="width: 60%; padding: 8px; margin-bottom: 10px; border-radius: 8px; border: 1px solid #ccc;">

    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Correo</th>
          <th>Grado/Salón/Materia</th>
          <th>Nivel</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody id="lista-profesores"></tbody>
    </table>
  `;

  await renderProfesores();

  // Agregar evento al buscador
  const buscador = document.getElementById("buscador");
  buscador.addEventListener("input", filtrarProfesores);
}

// Lista global para búsqueda
let listaProfesores = [];

// Renderiza la lista de profesores
async function renderProfesores() {
  const tbody = document.getElementById("lista-profesores");
  tbody.innerHTML = "";

  const querySnapshot = await getDocs(collection(db, "usuarios"));
  listaProfesores = []; // reset lista

  querySnapshot.forEach((docSnap) => {
    const prof = docSnap.data();
    if (prof.rol === "Profesor") {
      listaProfesores.push({
        id: docSnap.id,
        nombre: prof.nombre,
        correo: prof.correo,
        grado: prof.grado || "-",
        nivel: prof.nivel || "-" // ← nuevo campo
      });
    }
  });

  mostrarProfesores(listaProfesores);
}

// Muestra los profesores en la tabla
function mostrarProfesores(lista) {
  const tbody = document.getElementById("lista-profesores");
  tbody.innerHTML = "";

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No se encontraron profesores</td></tr>`;
    return;
  }

  lista.forEach((prof) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${prof.nombre}</td>
      <td>${prof.correo}</td>
      <td>${prof.grado}</td>
      <td>${prof.nivel}</td>
      <td>
        <button onclick="editarProfesor('${prof.id}', '${prof.nombre}', '${prof.correo}', '${prof.grado}', '${prof.nivel}')">Editar</button>
        <button onclick="eliminarProfesor('${prof.id}')">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Filtra profesores por nombre, correo o nivel
function filtrarProfesores(e) {
  const texto = e.target.value.toLowerCase();
  const filtrados = listaProfesores.filter(
    (p) =>
      p.nombre.toLowerCase().includes(texto) ||
      p.correo.toLowerCase().includes(texto) ||
      p.nivel.toLowerCase().includes(texto)
  );
  mostrarProfesores(filtrados);
}

// --- Modal acciones ---
window.editarProfesor = (id, nombre, correo, grado, nivel) => {
  document.getElementById("modal-titulo").textContent = "Editar Profesor";
  document.getElementById("nombre-input").value = nombre;
  document.getElementById("correo-input").value = correo;
  document.getElementById("grado-input").value = grado;
  document.getElementById("nivel-input").value = nivel; // nuevo input
  modal.style.display = "flex";
  modal.dataset.id = id;
};

window.cerrarModal = () => {
  modal.style.display = "none";
};

window.guardarProfesor = async () => {
  const id = modal.dataset.id;
  const nombre = document.getElementById("nombre-input").value;
  const correo = document.getElementById("correo-input").value;
  const grado = document.getElementById("grado-input").value;
  const nivel = document.getElementById("nivel-input").value;
  if (!nombre || !correo || !grado || !nivel) {
    alert("Completa todos los campos");
    return;
  }

  await updateDoc(doc(db, "usuarios", id), { nombre, correo, grado, nivel });
  cerrarModal();
  renderProfesores();
};

window.eliminarProfesor = async (id) => {
  if (confirm("¿Desea eliminar este profesor?")) {
    await deleteDoc(doc(db, "usuarios", id));
    renderProfesores();
  }
};


// ======================================================
// 🔹 PROFESOR
// ======================================================
async function renderProfesor(usuario) {
  contenido.innerHTML = `
    <div class="info">
      <p>Nombre: <span>${usuario.nombre}</span></p>
      <p>Rol: <span>${usuario.rol}</span></p>
      <p>Grado/Salón/Materia: <span>${usuario.grado || "-"}</span></p>
      <p>Correo: <span>${usuario.correo}</span></p>
    </div>
    <h2>Comunicados Recientes</h2>
    <table>
      <thead><tr><th>Título</th><th>Descripción</th><th>Fecha</th></tr></thead>
      <tbody id="lista-comunicados"></tbody>
    </table>
  `;

  const tbody = document.getElementById("lista-comunicados");
  const comunicadosSnap = await getDocs(collection(db, "comunicados"));
  const comunicados = [];
  comunicadosSnap.forEach(doc => comunicados.push(doc.data()));

  const ultimos = comunicados.slice(-5).reverse();
  ultimos.forEach(com => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${com.titulo}</td>
      <td>${com.descripcion || "Sin descripción"}</td>
      <td>${com.fecha}</td>
    `;
    tbody.appendChild(tr);
  });
}
