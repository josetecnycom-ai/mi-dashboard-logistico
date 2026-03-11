geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let datosCompletos = [];

    const dibujarGrafico = (datos) => {
        const ctx = document.getElementById('graficoRanking').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        chartInstancia = new Chart(ctx, {
            type: 'bar', // Barras verticales
            data: {
                labels: datos.map(d => d.nombre),
                datasets: [
                    { 
                        label: 'KM VACÍO (<20t)', 
                        data: datos.map(d => Math.round(d.kmEnVacio)), 
                        backgroundColor: '#e74c3c' 
                    },
                    { 
                        label: 'KM CARGA (>20t)', 
                        data: datos.map(d => Math.round(d.kmConCarga)), 
                        backgroundColor: '#2ecc71' 
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { 
                        stacked: true,
                        ticks: { font: { weight: 'bold', size: 12 } }
                    },
                    y: { 
                        stacked: true,
                        title: { display: true, text: 'Kilómetros totales' }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'TOP 10 KM EN VACÍO', font: { size: 18 } }
                }
            }
        });
    };

    const cargarDatos = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";

        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { typeName: "StatusData", search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate, toDate } }],
            ["Get", { typeName: "Trip", search: { fromDate, toDate } }]
        ], (results) => {
            const dispositivos = results[0];
            const pesos = results[1];
            const viajes = results[2];
            
            let stats = dispositivos.map(d => {
                let kmVacio = 0, kmCarga = 0;
                let pesosV = pesos.filter(p => p.device.id === d.id);
                
                viajes.filter(v => v.device.id === d.id).forEach(v => {
                    let p = pesosV.filter(p => new Date(p.dateTime) <= new Date(v.stop)).pop();
                    let pesoKg = p ? (p.data / 1000) : 0;
                    if (pesoKg >= 20000) kmCarga += v.distance;
                    else kmVacio += v.distance;
                });
                return { nombre: d.name, kmEnVacio: kmVacio, kmConCarga: kmCarga };
            }).filter(s => (s.kmEnVacio + s.kmConCarga) > 0);

            datosCompletos = stats.sort((a, b) => b.kmEnVacio - a.kmEnVacio);
            dibujarGrafico(datosCompletos.slice(0, 10));
        }, (e) => console.error(e));
    };

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date();
            const hace30 = new Date();
            hace30.setDate(hoy.getDate() - 30);
            document.getElementById('dateTo').value = hoy.toISOString().split('T')[0];
            document.getElementById('dateFrom').value = hace30.toISOString().split('T')[0];
            document.getElementById('updateBtn').onclick = cargarDatos;
            
            // SEGURIDAD: Solo ejecutar callback si es una función
            if (typeof callback === 'function') {
                callback();
            }
        },
        focus: function () { cargarDatos(); },
        blur: function () {}
    };
};