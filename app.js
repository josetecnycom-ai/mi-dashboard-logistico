geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let todosLosDatosParaExcel = [];

    const procesarKilometros = (dispositivos, registrosPeso, viajes) => {
        const UMBRAL_CARGA_KG = 20000;
        let statsPorCamion = {};

        dispositivos.forEach(d => {
            statsPorCamion[d.id] = { nombre: d.name, kmConCarga: 0, kmEnVacio: 0 };
        });

        let pesosPorCamion = {};
        registrosPeso.forEach(reg => {
            if (!pesosPorCamion[reg.device.id]) pesosPorCamion[reg.device.id] = [];
            pesosPorCamion[reg.device.id].push(reg);
        });

        viajes.forEach(viaje => {
            if (!statsPorCamion[viaje.device.id]) return;
            const pesosDelCamion = pesosPorCamion[viaje.device.id] || [];
            const pesoAsociado = pesosDelCamion.filter(p => new Date(p.dateTime) <= new Date(viaje.stop)).pop();
            const pesoKg = pesoAsociado ? (pesoAsociado.data / 1000) : 0;

            if (pesoKg >= UMBRAL_CARGA_KG) {
                statsPorCamion[viaje.device.id].kmConCarga += viaje.distance;
            } else {
                statsPorCamion[viaje.device.id].kmEnVacio += viaje.distance;
            }
        });

        // 1. Convertir a array y filtrar solo los que tienen movimiento
        let resultados = Object.values(statsPorCamion).filter(v => (v.kmConCarga + v.kmEnVacio) > 0);
        
        // 2. ORDENAR estrictamente por KM en Vacío (Mayor a Menor)
        resultados.sort((a, b) => b.kmEnVacio - a.kmEnVacio);
        
        // Guardar lista completa para el Excel
        todosLosDatosParaExcel = resultados;

        // 3. SELECCIONAR solo los primeros 10 para el gráfico
        let top10Inactivos = resultados.slice(0, 10);
        
        dibujarGrafico(top10Inactivos);
    };

    const dibujarGrafico = (datos) => {
        const ctx = document.getElementById('graficoRanking').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        chartInstancia = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: datos.map(d => d.nombre),
                datasets: [
                    { 
                        label: 'KM EN VACÍO', 
                        data: datos.map(d => Math.round(d.kmEnVacio)), 
                        backgroundColor: '#e74c3c',
                        barPercentage: 0.8, // Controla el ancho de la barra
                        categoryPercentage: 0.9
                    },
                    { 
                        label: 'KM CON CARGA', 
                        data: datos.map(d => Math.round(d.kmConCarga)), 
                        backgroundColor: '#2ecc71',
                        barPercentage: 0.8,
                        categoryPercentage: 0.9
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false, // Permite que el gráfico use la altura del CSS
                scales: {
                    x: { stacked: true },
                    y: { 
                        stacked: true,
                        ticks: { 
                            autoSkip: false,
                            font: { size: 12, weight: 'bold' } 
                        } 
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    title: { 
                        display: true, 
                        text: 'RANKING: 10 VEHÍCULOS CON MÁS KM EN VACÍO',
                        font: { size: 16 }
                    }
                }
            }
        });
    };

    // ... (Mantener funciones descargarExcel, cargarDatos e initialize igual que v1.0.5)
    const descargarExcel = () => {
        if (todosLosDatosParaExcel.length === 0) return alert("No hay datos.");
        const dataExcel = todosLosDatosParaExcel.map(d => ({
            "Vehículo": d.nombre,
            "KM Vacío": Math.round(d.kmEnVacio),
            "KM Carga": Math.round(d.kmConCarga),
            "% Eficiencia": ((d.kmConCarga / (d.kmEnVacio + d.kmConCarga)) * 100).toFixed(2) + "%"
        }));
        const ws = XLSX.utils.json_to_sheet(dataExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "KM Carga");
        XLSX.writeFile(wb, "Reporte_KM_v106.xlsx");
    };

    const cargarDatos = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";
        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { typeName: "StatusData", search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate, toDate } }],
            ["Get", { typeName: "Trip", search: { fromDate, toDate } }]
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