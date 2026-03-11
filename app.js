/**
 * Dashboard Logístico Pro - Geotab Add-in
 * Nombre registrado: miDashboard
 */
geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let todosLosDatosParaExcel = [];

    // --- 1. PROCESAMIENTO DE KILÓMETROS (CON TRIPS) ---
    const procesarKilometros = (dispositivos, registrosPeso, viajes) => {
        const UMBRAL_CARGA_KG = 20000;
        let statsPorCamion = {};

        // Inicializamos los contadores de la flota
        dispositivos.forEach(d => {
            statsPorCamion[d.id] = { nombre: d.name, kmConCarga: 0, kmEnVacio: 0 };
        });

        // Agrupamos los registros de peso por camión para buscar más rápido
        let pesosPorCamion = {};
        registrosPeso.forEach(reg => {
            if (!pesosPorCamion[reg.device.id]) pesosPorCamion[reg.device.id] = [];
            pesosPorCamion[reg.device.id].push(reg);
        });

        // Analizamos cada VIAJE
        viajes.forEach(viaje => {
            if (!statsPorCamion[viaje.device.id]) return;

            const pesosDelCamion = pesosPorCamion[viaje.device.id] || [];
            
            // Buscamos el último registro de peso que ocurrió ANTES o DURANTE este viaje
            const pesoAsociado = pesosDelCamion
                .filter(p => new Date(p.dateTime) <= new Date(viaje.stop))
                .pop(); // Toma el último válido

            const pesoKg = pesoAsociado ? (pesoAsociado.data / 1000) : 0;

            // En Geotab, viaje.distance suele venir en Kilómetros
            if (pesoKg >= UMBRAL_CARGA_KG) {
                statsPorCamion[viaje.device.id].kmConCarga += viaje.distance;
            } else {
                statsPorCamion[viaje.device.id].kmEnVacio += viaje.distance;
            }
        });

        // Filtramos y ordenamos para el Excel y el Gráfico
        let flotaCompleta = Object.values(statsPorCamion).filter(v => (v.kmConCarga + v.kmEnVacio) > 0);
        todosLosDatosParaExcel = flotaCompleta.sort((a, b) => b.kmEnVacio - a.kmEnVacio);

        // Pasamos solo los 10 con más KM en vacío al gráfico
        dibujarGrafico(todosLosDatosParaExcel.slice(0, 10));
    };

    // --- 2. GENERACIÓN DEL GRÁFICO ---
    const dibujarGrafico = (datosTop10) => {
        const ctx = document.getElementById('graficoRanking').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        chartInstancia = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: datosTop10.map(d => d.nombre),
                datasets: [
                    {
                        label: 'KM en VACÍO (< 20t)',
                        data: datosTop10.map(d => Math.round(d.kmEnVacio)),
                        backgroundColor: '#e74c3c',
                        barThickness: 30
                    },
                    {
                        label: 'KM con CARGA (> 20t)',
                        data: datosTop10.map(d => Math.round(d.kmConCarga)),
                        backgroundColor: '#2ecc71',
                        barThickness: 30
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, title: { display: true, text: 'Kilómetros (km)' } },
                    y: { 
                        stacked: true, 
                        ticks: { autoSkip: false, font: { size: 14, weight: 'bold' } } 
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'TOP 10 VEHÍCULOS: KILÓMETROS EN VACÍO VS CARGA', font: { size: 18 } }
                }
            }
        });
    };

    // --- 3. EXPORTACIÓN A EXCEL ---
    const descargarExcel = () => {
        if (todosLosDatosParaExcel.length === 0) return alert("No hay datos para exportar.");
        
        const dataExcel = todosLosDatosParaExcel.map(d => ({
            "Vehículo": d.nombre,
            "KM en Vacío": Math.round(d.kmEnVacio),
            "KM con Carga": Math.round(d.kmConCarga),
            "Total KM": Math.round(d.kmEnVacio + d.kmConCarga),
            "% Distancia Rentable": ((d.kmConCarga / (d.kmEnVacio + d.kmConCarga)) * 100).toFixed(2) + "%"
        }));

        const ws = XLSX.utils.json_to_sheet(dataExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Kilometraje por Carga");
        XLSX.writeFile(wb, "Reporte_KM_Flota.xlsx");
    };

    // --- 4. CARGA DE DATOS ---
    const cargarDatos = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";

        console.log("Cargando Viajes y Pesos...");

        // Pedimos Vehículos, Pesos y VIAJES (Trip)
        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { 
                typeName: "StatusData", 
                search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate: fromDate, toDate: toDate }
            }],
            ["Get", { 
                typeName: "Trip", // <--- ESTA ES LA CLAVE, usamos "Trip"
                search: { fromDate: fromDate, toDate: toDate }
            }]
        ], (results) => {
            console.log("Datos recibidos correctamente.");
            procesarKilometros(results[0], results[1], results[2]);
        }, (err) => {
            console.error("Error al cargar datos:", err);
            alert("Error al cargar datos. Revisa la consola.");
        });
    };

    // --- 5. INICIALIZACIÓN ---
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