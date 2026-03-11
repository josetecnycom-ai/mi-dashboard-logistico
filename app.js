geotab.addin.miDashboard = function (api, state) {
    let graficoCargaInstancia = null;

    // --- FUNCIÓN PARA DIBUJAR ---
    const dibujarGraficoCarga = (stats) => {
        const canvas = document.getElementById('graficoCarga');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (graficoCargaInstancia) {
            graficoCargaInstancia.destroy();
        }

        graficoCargaInstancia = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Con Carga', 'En Vacío'],
                datasets: [{
                    data: [stats.conCarga, stats.enVacio],
                    backgroundColor: ['#2ecc71', '#e74c3c'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    };

    // --- FUNCIÓN PARA OBTENER DATOS ---
    const cargarDatos = () => {
        const hoy = new Date().toISOString();
        const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const TARA_CAMION = 15000; 

        api.call("Get", {
            "typeName": "StatusData",
            "search": {
                "diagnosticSearch": { "id": "aVrWeoUlmHE2AXsV_j0Kc7g" },
                "fromDate": ayer,
                "toDate": hoy
            }
        }, (results) => {
            let stats = { conCarga: 0, enVacio: 0 };
            if (results && results.length > 0) {
                results.forEach(dato => {
                    if (dato.data > TARA_CAMION) stats.conCarga++;
                    else stats.enVacio++;
                });
            }
            dibujarGraficoCarga(stats);
        }, (e) => console.error("Error API:", e));
    };

    return {
        // CORRECCIÓN: Usamos solo 3 argumentos
        initialize: function (api, state, callback) {
            console.log("Inicializando Add-in...");
            // Ejecutamos el callback que Geotab espera (el 3er argumento)
            if (typeof callback === 'function') {
                callback();
            }
        },

        focus: function (api, state) {
            console.log("Dashboard en foco.");
            cargarDatos();
        },

        blur: function () {
            console.log("Saliendo.");
        }
    };
};