geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let datosVacio = [];
    let datosTabla = [];

    // --- FUNCIÓN GENÉRICA DE EXPORTACIÓN ---
    const exportarExcel = (datos, nombreArchivo) => {
        if (!datos || datos.length === 0) return alert("No hay datos cargados en esta sección.");
        const ws = XLSX.utils.json_to_sheet(datos.map(d => ({
            "Vehículo": d.nombre,
            "KM Vacío": Math.round(d.kmEnVacio),
            "KM Carga": Math.round(d.kmConCarga),
            "KM Totales": Math.round(d.kmEnVacio + d.kmConCarga),
            "Eficiencia %": ((d.kmConCarga / (d.kmEnVacio + d.kmConCarga)) * 100).toFixed(2) + "%"
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
    };

    // --- PROCESADOR DE DATOS ---
    const obtenerDatos = (desdeId, hastaId, callback) => {
        const fromDate = document.getElementById(desdeId).value + "T00:00:00.000Z";
        const toDate = document.getElementById(hastaId).value + "T23:59:59.000Z";

        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { typeName: "StatusData", search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate, toDate } }],
            ["Get", { typeName: "Trip", search: { fromDate, toDate } }]
        ], (results) => {
            const [dispositivos, pesos, viajes] = results;
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
            
            callback(stats.sort((a, b) => b.kmEnVacio - a.kmEnVacio));
        }, (e) => console.error(e));
    };

    // --- UI: DIBUJAR GRÁFICO ---
    const dibujarGrafico = (datos) => {
        const ctx = document.getElementById('chartVacio').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();
        chartInstancia = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: datos.slice(0, 10).map(d => d.nombre),
                datasets: [
                    { label: 'KM Vacío', data: datos.slice(0, 10).map(d => Math.round(d.kmEnVacio)), backgroundColor: '#e74c3c' },
                    { label: 'KM Carga', data: datos.slice(0, 10).map(d => Math.round(d.kmConCarga)), backgroundColor: '#2ecc71' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
        });
    };

    // --- UI: DIBUJAR TABLA ---
    const dibujarTabla = (datos) => {
        const cuerpo = document.getElementById('tablaCuerpo');
        cuerpo.innerHTML = '';
        datos.slice(0, 15).forEach(d => {
            const total = d.kmEnVacio + d.kmConCarga;
            const ef = ((d.kmConCarga / total) * 100).toFixed(1);
            cuerpo.innerHTML += `
                <tr>
                    <td><strong>${d.nombre}</strong></td>
                    <td>${Math.round(d.kmEnVacio)} km</td>
                    <td>${Math.round(d.kmConCarga)} km</td>
                    <td>${Math.round(total)} km</td>
                    <td>
                        <div class="percentage-bar"><div class="percentage-fill" style="width: ${ef}%"></div></div>
                        ${ef}%
                    </td>
                </tr>`;
        });
    };

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date().toISOString().split('T')[0];
            const hace30 = new Date();
            hace30.setDate(hace30.getDate() - 30);
            const inicio = hace30.toISOString().split('T')[0];

            // Setear fechas iniciales en todos los inputs
            ['vacioFrom', 'tablaFrom'].forEach(id => document.getElementById(id).value = inicio);
            ['vacioTo', 'tablaTo'].forEach(id => document.getElementById(id).value = hoy);

            // Listeners Módulo 1
            document.getElementById('vacioUpdate').onclick = () => obtenerDatos('vacioFrom', 'vacioTo', (d) => { datosVacio = d; dibujarGrafico(d); });
            document.getElementById('vacioExcel').onclick = () => exportarExcel(datosVacio, "Ranking_Vacio");

            // Listeners Módulo 2
            document.getElementById('tablaUpdate').onclick = () => obtenerDatos('tablaFrom', 'tablaTo', (d) => { datosTabla = d; dibujarTabla(d); });
            document.getElementById('tablaExcel').onclick = () => exportarExcel(datosTabla, "Tabla_Eficiencia");

            if (typeof callback === 'function') callback();
        },
        focus: function () {
            document.getElementById('vacioUpdate').click();
            document.getElementById('tablaUpdate').click();
        },
        blur: function () {}
    };
};