/**
 * Add-in para MyGeotab: Dashboard Logístico
 * Nombre registrado: miDashboard
 */
geotab.addin.miDashboard = function (api, state) {
    // Variables para los gráficos (para poder destruirlos/actualizarlos)
    let graficoCargaInstancia = null;

    // --- FUNCIÓN PARA DIBUJAR EL GRÁFICO ---
    const dibujarGraficoCarga = (stats) => {
        const canvas = document.getElementById('graficoCarga');
        if (!canvas) return; // Si no hay canvas, no hacemos nada

        const ctx = canvas.getContext('2d');

        // Si ya existe un gráfico anterior, lo eliminamos
        if (graficoCargaInstancia) {
            graficoCargaInstancia.destroy();
        }

        graficoCargaInstancia = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Con Carga', 'En Vacío'],
                datasets: [{
                    label: 'Viajes',
                    data: [stats.conCarga, stats.enVacio],
                    backgroundColor: ['#2ecc71', '#e74c3c'],
                    borderColor: ['#27ae60', '#c0392b'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    };

    // --- FUNCIÓN PARA OBTENER DATOS DE LA API ---
    const cargarDatosYProcesar = () => {
        console.log("Solicitando datos de peso a la API...");
        
        const hoy = new Date().toISOString();
        const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const TARA_CAMION = 15000; // Peso base en kg (ajustable)

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
                    if (dato.data > TARA_CAMION) {
                        stats.conCarga++;
                    } else {
                        stats.enVacio++;
                    }
                });
            } else {
                console.warn("No se encontraron datos de peso en las últimas 24h.");
            }

            dibujarGraficoCarga(stats);
        }, (error) => {
            console.error("Error en la llamada API:", error);
        });
    };

    // --- CICLO DE VIDA DEL ADD-IN ---
    return {
        /**
         * initialize se ejecuta una sola vez al cargar la página.
         * Es fundamental llamar al callback rápido.
         */
        initialize: function (api, state, el, callback) {
            console.log("Add-in inicializado correctamente.");
            // Obligatorio para quitar la rueda de carga de Geotab
            if (callback) {
                callback();
            }
        },

        /**
         * focus se ejecuta cada vez que el usuario hace clic en el menú del Add-in.
         */
        focus: function (api, state) {
            console.log("Dashboard en foco. Cargando visualizaciones...");
            // Ejecutamos la carga de datos
            cargarDatosYProcesar();
        },

        /**
         * blur se ejecuta cuando el usuario sale del Add-in.
         */
        blur: function () {
            console.log("Saliendo del Add-in.");
        }
    };
};