// Funciones para el Modal
window.abrirModal = function() {
    document.getElementById('modalReserva').style.display = 'flex';
};

window.cerrarModal = function() {
    document.getElementById('modalReserva').style.display = 'none';
};

// Configuración básica del Gantt
document.addEventListener('DOMContentLoaded', () => {
    // Ejemplo de tareas (esto vendría de tu base de datos)
    const tasks = [
        {
            id: 'Task 1',
            name: 'Hab. 101 - Juan Pérez',
            start: '2026-04-01',
            end: '2026-04-05',
            progress: 100,
            custom_class: 'gantt-booking' // Aquí aplicas el color de la leyenda
        }
    ];

    const gantt = new Gantt("#gantt_here", tasks, {
        header_height: 50,
        column_width: 30,
        step: 24,
        view_modes: ['Day', 'Week', 'Month'],
        view_mode: 'Day',
        language: 'es'
    });
});