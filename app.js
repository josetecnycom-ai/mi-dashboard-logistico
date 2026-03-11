/**
 * Dashboard Logístico Pro - Geotab Add-in
 * Nombre registrado: miDashboard
 */
geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let todosLosDatosParaExcel = []; // Guardamos la flota completa aquí

    // --- 1. PROCESAMIENTO DE DATOS ---
    const procesarDatos = (dispositivos, registrosPeso) => {
        const UMBRAL_CARGA_KG = 20000;
        let statsPorCamion = {};

        // Inicializamos todos los camiones de la flota
        dispositivos.forEach(d => {
            statsPorCamion[d.id] = { 
                nombre: d.name, 
                conCarga: 0, 
                enVacio: 0,
                totalRegistros: 0
            };
        });

        // Clasificamos las mediciones de peso
        registrosPeso.forEach(reg => {
            if (statsPorCamion[reg.device.id]) {
                // Convertimos de Gramos a Kilogramos
                const pesoKg = reg.data / 1000;
                
                if (pesoKg >= UMBRAL_CARGA_KG) {
                    statsPorCamion[reg.device.id].conCarga++;
                } else {
                    statsPorCamion[reg.device.id].enVacio++;
                }
                statsPorCamion[reg.device.id].totalRegistros++;
            }
        });

        // Convertimos a Array y filtramos solo los que tienen actividad
        let flotaCompleta = Object.values(statsPorCamion)
            .filter(v => v.totalRegistros > 0);

        // Guardamos para el Excel (toda la flota con actividad)
        todosLosDatosParaExcel = flotaCompleta.sort((a, b) => b.enVacio - a.enVacio);

        // Creamos el Top 10 para el Gráfico (los que más viajes en vacío tienen)
        let top10Inactivos = [...todosLosDatosParaExcel].slice(0, 10);

        dibujarGrafico(top10Inactivos);
    };

    // --- 2. GENERACIÓN DEL GRÁFICO (TOP 10) ---
    const dibujarGrafico = (datosTop10) => {
        const ctx = document.getElementById('graficoRanking').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        chartInstancia = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: datosTop10.map(d => d.nombre),
                datasets: [
                    {
                        label: 'Registros en VACÍO (< 20t)',
                        data: datosTop10.map(d => d.enVacio),
                        backgroundColor: '#e74c3c' // Rojo
                    },
                    {
                        label: 'Registros con CARGA (> 20t)',
                        data: datosTop10.map(d => d.conCarga),
                        backgroundColor: '#2ecc71' // Verde
                    }
                ]
            },
            options: {
                indexAxis: 'y', // Barras horizontales para mejor lectura de nombres
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, title: { display: true, text: 'Cantidad de Registros' } },
                    y: { stacked: true }
                },
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Top 10 Camiones con más Viajes en Vacío' }
                }
            }
        });
    };

    // --- 3. EXPORTACIÓN A EXCEL (FLOTA COMPLETA) ---
    const descargarExcel = () => {
        if (todosLosDatosParaExcel.length === 0) {
            alert("No hay datos para exportar. Por favor, actualiza los datos primero.");
            return;
        }

        const dataExcel = todosLosDatosParaExcel.map(d => ({
            "Vehículo": d.nombre,
            "Viajes/Registros Vacío": d.enVacio,
            "Viajes/Registros Carga": d.conCarga,
            "Total Mediciones": d.totalRegistros,
            "% Eficiencia": ((d.conCarga / d.totalRegistros) * 100).toFixed(2) + "%"
        }));

        const ws = XLSX.utils.json_to_sheet(dataExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Eficiencia Logística");
        XLSX.writeFile(wb, "Reporte_Completo_Carga_Flota.xlsx");
    };

    // --- 4. LLAMADA A LA API ---
    const cargarDatos = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";

        console.log("Cargando datos desde:", fromDate, "hasta:", toDate);

        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { 
                typeName: "StatusData", 
                search: { 
                    diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" },
                    fromDate: fromDate,
                    toDate: toDate
                }
            }]
        ], (results) => {
            procesarDatos(results[0], results[1]);
        }, (err) => {
            console.error("Error en MultiCall:", err);
            alert("Error al obtener datos de Geotab");
        });
    };

    // --- 5. CICLO DE VIDA ---
    return {
        initialize: function (api, state, callback) {
            // Fechas por defecto: últimos 30 días
            const hoy = new Date();
            const hace30 = new Date();
            hace30.setDate(hoy.getDate() - 30);
            
            document.getElementById('dateTo').value = hoy.toISOString().split('T')[0];
            document.getElementById('dateFrom').value = hace30.toISOString().split('T')[0];

            // Listeners
            document.getElementById('updateBtn').onclick = cargarDatos;
            document.getElementById('exportBtn').onclick = descargarExcel;

            if (callback) callback();
        },
        focus: function (api, state) {
            cargarDatos();
        },
        blur: function () {}
    };
};