/**
 * Dashboard Logístico Pro - Geotab Add-in
 * Nombre registrado: miDashboard
 */
geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let todosLosDatosParaExcel = [];

    // --- 1. PROCESAMIENTO DE DATOS ---
    const procesarDatos = (dispositivos, registrosPeso) => {
        const UMBRAL_CARGA_KG = 20000;
        let statsPorCamion = {};

        dispositivos.forEach(d => {
            statsPorCamion[d.id] = { 
                nombre: d.name, // Aquí Geotab suele traer la matrícula o nombre del vehículo
                conCarga: 0, 
                enVacio: 0,
                totalRegistros: 0
            };
        });

        registrosPeso.forEach(reg => {
            if (statsPorCamion[reg.device.id]) {
                const pesoKg = reg.data / 1000;
                if (pesoKg >= UMBRAL_CARGA_KG) statsPorCamion[reg.device.id].conCarga++;
                else statsPorCamion[reg.device.id].enVacio++;
                statsPorCamion[reg.device.id].totalRegistros++;
            }
        });

        let flotaCompleta = Object.values(statsPorCamion).filter(v => v.totalRegistros > 0);
        todosLosDatosParaExcel = flotaCompleta.sort((a, b) => b.enVacio - a.enVacio);

        // Tomamos el Top 10 para la visualización clara
        let top10Inactivos = [...todosLosDatosParaExcel].slice(0, 10);
        dibujarGrafico(top10Inactivos);
    };

    // --- 2. GENERACIÓN DEL GRÁFICO (MÁS GRANDE Y CLARO) ---
    const dibujarGrafico = (datosTop10) => {
        const ctx = document.getElementById('graficoRanking').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        chartInstancia = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: datosTop10.map(d => d.nombre),
                datasets: [
                    {
                        label: 'Viajes en VACÍO (< 20t)',
                        data: datosTop10.map(d => d.enVacio),
                        backgroundColor: '#e74c3c',
                        barThickness: 30 // Grosor fijo de la barra para que se vea contundente
                    },
                    {
                        label: 'Viajes con CARGA (> 20t)',
                        data: datosTop10.map(d => d.conCarga),
                        backgroundColor: '#2ecc71',
                        barThickness: 30
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false, // Permite que use toda la altura del contenedor CSS
                scales: {
                    x: { 
                        stacked: true, 
                        grid: { display: false },
                        title: { display: true, text: 'Cantidad de Mediciones detectadas' }
                    },
                    y: { 
                        stacked: true,
                        ticks: {
                            autoSkip: false, // Obliga a mostrar todas las matrículas
                            font: {
                                size: 14, // Fuente más grande para las matrículas
                                weight: 'bold'
                            }
                        }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    title: { 
                        display: true, 
                        text: 'RANKING: 10 VEHÍCULOS CON MAYOR ACTIVIDAD EN VACÍO',
                        font: { size: 18 }
                    }
                }
            }
        });
    };

    // --- 3. EXPORTACIÓN A EXCEL ---
    const descargarExcel = () => {
        if (todosLosDatosParaExcel.length === 0) return alert("No hay datos");
        const dataExcel = todosLosDatosParaExcel.map(d => ({
            "Matrícula/Vehículo": d.nombre,
            "Registros Vacío": d.enVacio,
            "Registros Carga": d.conCarga,
            "% Eficiencia": ((d.conCarga / (d.conCarga + d.enVacio)) * 100).toFixed(2) + "%"
        }));
        const ws = XLSX.utils.json_to_sheet(dataExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte");
        XLSX.writeFile(wb, "Analisis_Carga_Completo.xlsx");
    };

    // --- 4. CARGA DE DATOS ---
    const cargarDatos = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";

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