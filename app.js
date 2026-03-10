geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null; // Guardamos el gráfico aquí para poder borrarlo/actualizarlo

    // Función para dibujar el gráfico
    const dibujarGrafico = (datos) => {
        const ctx = document.getElementById('graficoCarga').getContext('2d');
        
        // Si ya existe un gráfico, lo destruimos antes de crear uno nuevo (evita errores visuales)
        if (chartInstancia) { chartInstancia.destroy(); }

        chartInstancia = new Chart(ctx, {
            type: 'pie', // Tipo de gráfico: Tarta
            data: {
                labels: ['Con Carga', 'En Vacío'],
                datasets: [{
                    data: [datos.conCarga, datos.enVacio],
                    backgroundColor: ['#2ecc71', '#e74c3c'], // Verde para carga, Rojo para vacío
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    };

    const obtenerDatosPeso = (fechaInicio, fechaFin) => {
        api.call("Get", {
            "typeName": "StatusData",
            "search": {
                "diagnosticSearch": { "id": "aVrWeoUlmHE2AXsV_j0Kc7g" },
                "fromDate": fechaInicio,
                "toDate": fechaFin
            }
        }, (results) => {
            let stats = { conCarga: 0, enVacio: 0 };
            const TARA_CAMION = 15000; // Ajusta según la flota real

            results.forEach(dato => {
                if (dato.data > TARA_CAMION) { stats.conCarga++; } 
                else { stats.enVacio++; }
            });

            dibujarGrafico(stats); // <--- ¡Aquí dibujamos el gráfico!
        }, (e) => console.error(e));
    };

    return {
        initialize: function (el, callback) {
            callback();
        },
        focus: function () {
            // Al entrar, pedimos datos de las últimas 24 horas como prueba
            const hoy = new Date().toISOString();
            const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            obtenerDatosPeso(ayer, hoy);
        },
        blur: function () { }
    };
};