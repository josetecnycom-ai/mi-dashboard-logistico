geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let datosUltimaConsulta = [];

    // Función para procesar y dibujar el ranking
    const procesarRanking = (dispositivos, registrosPeso) => {
        const TARA_CAMION = 15000;
        let statsPorCamion = {};

        // Inicializar todos los dispositivos
        dispositivos.forEach(d => {
            statsPorCamion[d.id] = { nombre: d.name, conCarga: 0, enVacio: 0 };
        });

        // Contabilizar registros de peso
        registrosPeso.forEach(reg => {
            if (statsPorCamion[reg.device.id]) {
                if (reg.data > TARA_CAMION) statsPorCamion[reg.device.id].conCarga++;
                else statsPorCamion[reg.device.id].enVacio++;
            }
        });

        // Convertir a array y filtrar los que tienen datos
        let resultado = Object.values(statsPorCamion)
            .filter(v => (v.conCarga + v.enVacio) > 0)
            // Ordenar por quienes tienen más viajes en vacío (Ranking solicitado)
            .sort((a, b) => b.enVacio - a.enVacio);

        datosUltimaConsulta = resultado; // Guardar para el Excel
        dibujarBarChart(resultado);
    };

    const dibujarBarChart = (data) => {
        const ctx = document.getElementById('graficoRanking').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        chartInstancia = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.nombre),
                datasets: [
                    { label: 'En Vacío', data: data.map(d => d.enVacio), backgroundColor: '#e74c3c' },
                    { label: 'Con Carga', data: data.map(d => d.conCarga), backgroundColor: '#2ecc71' }
                ]
            },
            options: {
                indexAxis: 'y', // Hace que las barras sean horizontales
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true } }
            }
        });
    };

    const descargarExcel = () => {
        if (datosUltimaConsulta.length === 0) return alert("No hay datos para exportar");
        
        const worksheet = XLSX.utils.json_to_sheet(datosUltimaConsulta.map(d => ({
            "Vehículo": d.nombre,
            "Registros en Vacío": d.enVacio,
            "Registros con Carga": d.conCarga,
            "% Eficiencia": ((d.conCarga / (d.conCarga + d.enVacio)) * 100).toFixed(2) + "%"
        })));
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Carga");
        XLSX.writeFile(workbook, "Reporte_Eficiencia_Flota.xlsx");
    };

    const cargarTodo = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";

        // Multicall para obtener Vehículos y Pesos a la vez
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
            procesarRanking(results[0], results[1]);
        }, (e) => console.error(e));
    };

    return {
        initialize: function (api, state, callback) {
            // Establecer fechas por defecto (últimos 30 días)
            const hoy = new Date();
            const hace30 = new Date();
            hace30.setDate(hoy.getDate() - 30);
            
            document.getElementById('dateTo').value = hoy.toISOString().split('T')[0];
            document.getElementById('dateFrom').value = hace30.toISOString().split('T')[0];

            // Asignar eventos a botones
            document.getElementById('updateBtn').addEventListener('click', cargarTodo);
            document.getElementById('exportBtn').addEventListener('click', descargarExcel);

            if (callback) callback();
        },
        focus: function () {
            cargarTodo();
        },
        blur: function () {}
    };
};