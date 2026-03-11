geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let todosLosDatosParaExcel = [];

    // --- 1. PROCESAMIENTO DE KILÓMETROS ---
    const procesarKilometros = (dispositivos, registrosPeso, logsGps) => {
        const UMBRAL_CARGA_KG = 20000;
        let statsPorCamion = {};

        dispositivos.forEach(d => {
            statsPorCamion[d.id] = { nombre: d.name, kmConCarga: 0, kmEnVacio: 0 };
        });

        // Ordenar pesos por fecha para facilitar la búsqueda
        const pesosOrdenados = registrosPeso.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

        // Agrupar logs de GPS por dispositivo
        dispositivos.forEach(dev => {
            const logsVehiculo = logsGps.filter(l => l.device.id === dev.id)
                                        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

            for (let i = 0; i < logsVehiculo.length - 1; i++) {
                const logActual = logsVehiculo[i];
                const logSiguiente = logsVehiculo[i+1];
                
                // Distancia entre estos dos puntos (Geotab devuelve km en los logs de viaje)
                // Si no viene directo, se calcula por la diferencia de metros si el log lo trae
                const distancia = (logSiguiente.distance - logActual.distance); 

                if (distancia > 0) {
                    // Buscar el último peso conocido antes de este movimiento
                    const pesoCercano = pesosOrdenados.filter(p => p.device.id === dev.id && new Date(p.dateTime) <= new Date(logActual.dateTime)).pop();
                    const pesoKg = pesoCercano ? (pesoCercano.data / 1000) : 0;

                    if (pesoKg >= UMBRAL_CARGA_KG) {
                        statsPorCamion[dev.id].kmConCarga += distancia;
                    } else {
                        statsPorCamion[dev.id].kmEnVacio += distancia;
                    }
                }
            }
        });

        let flotaCompleta = Object.values(statsPorCamion).filter(v => (v.kmConCarga + v.kmEnVacio) > 0);
        todosLosDatosParaExcel = flotaCompleta.sort((a, b) => b.kmEnVacio - a.kmEnVacio);

        dibujarGrafico(todosLosDatosParaExcel.slice(0, 10));
    };

    // --- 2. GRÁFICO DE BARRAS (KILÓMETROS) ---
    const dibujarGrafico = (datos) => {
        const ctx = document.getElementById('graficoRanking').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        chartInstancia = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: datos.map(d => d.nombre),
                datasets: [
                    {
                        label: 'KM en VACÍO',
                        data: datos.map(d => d.kmEnVacio.toFixed(2)),
                        backgroundColor: '#e74c3c',
                        barThickness: 25
                    },
                    {
                        label: 'KM con CARGA',
                        data: datos.map(d => d.kmConCarga.toFixed(2)),
                        backgroundColor: '#2ecc71',
                        barThickness: 25
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, title: { display: true, text: 'Kilómetros Recorridos (km)' } },
                    y: { stacked: true, ticks: { font: { weight: 'bold' } } }
                },
                plugins: {
                    title: { display: true, text: 'TOP 10: KM RECORRIDOS EN VACÍO VS CARGA', font: { size: 18 } }
                }
            }
        });
    };

    // --- 3. EXCEL ---
    const descargarExcel = () => {
        const dataExcel = todosLosDatosParaExcel.map(d => ({
            "Vehículo": d.nombre,
            "KM Vacío": d.kmEnVacio.toFixed(2),
            "KM Carga": d.kmConCarga.toFixed(2),
            "Total KM": (d.kmEnVacio + d.kmConCarga).toFixed(2),
            "% Eficiencia KM": ((d.kmConCarga / (d.kmEnVacio + d.kmConCarga)) * 100).toFixed(2) + "%"
        }));
        const ws = XLSX.utils.json_to_sheet(dataExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Kilometraje");
        XLSX.writeFile(wb, "Reporte_KM_Carga.xlsx");
    };

    // --- 4. CARGA DE DATOS (MULTICALL) ---
    const cargarDatos = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";

        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { 
                typeName: "StatusData", 
                search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate, toDate }
            }],
            ["Get", { 
                typeName: "LogRecord", 
                search: { fromDate, toDate }
            }]
        ], (results) => {
            procesarKilometros(results[0], results[1], results[2]);
        }, (err) => console.error(err));
    };

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date();
            const hace30 = new Date();
            hace30.setDate(hoy.getDate() - 30);
            document.getElementById('dateTo').value = hoy.toISOString().split('T')[0];
            document.getElementById('dateFrom').value = hace30.toISOString().split('T')[0];
            document.getElementById('updateBtn').onclick = cargarDatos;
            document.getElementById('exportBtn').onclick = descargarExcel;
            if (callback) callback();
        },
        focus: function () { cargarDatos(); },
        blur: function () {}
    };
};