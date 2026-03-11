geotab.addin.miDashboard = function (api, state) {
    let chartInstancia = null;
    let datosVacioGlobal = [];
    let datosTablaGlobal = [];

    // --- FUNCIÓN PARA EXPORTAR A EXCEL ---
    const exportarExcel = (datos, nombreArchivo) => {
        if (!datos || datos.length === 0) return alert("Primero debes cargar los datos.");
        const dataParaExcel = datos.map(d => ({
            "Vehículo": d.nombre,
            "KM Vacío (km)": Math.round(d.kmEnVacio),
            "KM Carga (km)": Math.round(d.kmConCarga),
            "Total (km)": Math.round(d.kmEnVacio + d.kmConCarga),
            "Eficiencia (%)": (d.kmEnVacio + d.kmConCarga) > 0 
                ? ((d.kmConCarga / (d.kmEnVacio + d.kmConCarga)) * 100).toFixed(2) + "%" 
                : "0%"
        }));
        const ws = XLSX.utils.json_to_sheet(dataParaExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte");
        XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
    };

    // --- LÓGICA DE BÚSQUEDA DE DATOS ---
    const obtenerDatos = (idDesde, idHasta, btnId, callback) => {
        const btn = document.getElementById(btnId);
        const status = document.getElementById('status-msg');
        
        const fromDate = document.getElementById(idDesde).value + "T00:00:00.000Z";
        const toDate = document.getElementById(idHasta).value + "T23:59:59.000Z";

        btn.disabled = true;
        if(status) status.innerText = "Consultando MyGeotab...";

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
                    // Buscar el último peso registrado antes del fin del viaje
                    let p = pesosV.filter(p => new Date(p.dateTime) <= new Date(v.stop)).pop();
                    let pesoKg = p ? (p.data / 1000) : 0;
                    
                    if (pesoKg >= 20000) kmCarga += v.distance;
                    else kmVacio += v.distance;
                });
                return { nombre: d.name, kmEnVacio: kmVacio, kmConCarga: kmCarga };
            }).filter(s => (s.kmEnVacio + s.kmConCarga) > 0);

            // Ordenar por KM en vacío por defecto
            stats.sort((a, b) => b.kmEnVacio - a.kmEnVacio);
            
            if(status) status.innerText = "";
            btn.disabled = false;
            callback(stats);
        }, (err) => {
            console.error(err);
            btn.disabled = false;
            alert("Error al obtener datos de la API.");
        });
    };

    // --- DIBUJAR GRÁFICO (TOP 10) ---
    const dibujarGrafico = (datos) => {
        const ctx = document.getElementById('chartVacio').getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        const top10 = datos.slice(0, 10);
        
        chartInstancia = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(d => d.nombre),
                datasets: [
                    { label: 'KM VACÍO', data: top10.map(d => Math.round(d.kmEnVacio)), backgroundColor: '#e74c3c' },
                    { label: 'KM CARGA', data: top10.map(d => Math.round(d.kmConCarga)), backgroundColor: '#2ecc71' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true } },
                plugins: { legend: { position: 'top' } }
            }
        });
    };

    // --- DIBUJAR TABLA PREMIUM ---
    const dibujarTabla = (datos) => {
        const cuerpo = document.getElementById('tablaCuerpo');
        cuerpo.innerHTML = '';
        
        datos.slice(0, 25).forEach(d => {
            const total = d.kmEnVacio + d.kmConCarga;
            const ef = total > 0 ? ((d.kmConCarga / total) * 100).toFixed(1) : 0;
            const colorBarra = ef < 40 ? '#e74c3c' : (ef < 75 ? '#f1c40f' : '#008767');

            cuerpo.innerHTML += `
                <tr>
                    <td><strong>${d.nombre}</strong></td>
                    <td class="num">${Math.round(d.kmEnVacio).toLocaleString()} km</td>
                    <td class="num">${Math.round(d.kmConCarga).toLocaleString()} km</td>
                    <td class="num total-col">${Math.round(total).toLocaleString()} km</td>
                    <td>
                        <div class="ef-container">
                            <div class="ef-bar-bg">
                                <div class="ef-bar-fill" style="width: ${ef}%; background-color: ${colorBarra}"></div>
                            </div>
                            <span style="font-weight:bold; color:${colorBarra}">${ef}%</span>
                        </div>
                    </td>
                </tr>`;
        });
    };

    return {
        initialize: function (api, state, callback) {
            // Fechas por defecto (Últimos 30 días)
            const hoy = new Date().toISOString().split('T')[0];
            const hace30 = new Date();
            hace30.setDate(hace30.getDate() - 30);
            const inicio = hace30.toISOString().split('T')[0];

            document.getElementById('vacioFrom').value = inicio;
            document.getElementById('vacioTo').value = hoy;
            document.getElementById('tablaFrom').value = inicio;
            document.getElementById('tablaTo').value = hoy;

            // Eventos Gráfico
            document.getElementById('vacioUpdate').onclick = () => {
                obtenerDatos('vacioFrom', 'vacioTo', 'vacioUpdate', (datos) => {
                    datosVacioGlobal = datos;
                    dibujarGrafico(datos);
                });
            };
            document.getElementById('vacioExcel').onclick = () => exportarExcel(datosVacioGlobal, "Ranking_Vacio");

            // Eventos Tabla
            document.getElementById('tablaUpdate').onclick = () => {
                obtenerDatos('tablaFrom', 'tablaTo', 'tablaUpdate', (datos) => {
                    datosTablaGlobal = datos;
                    dibujarTabla(datos);
                });
            };
            document.getElementById('tablaExcel').onclick = () => exportarExcel(datosTablaGlobal, "Eficiencia_Flota");

            if (typeof callback === 'function') callback();
        },
        focus: function () {
            // Carga automática al entrar
            document.getElementById('vacioUpdate').click();
            document.getElementById('tablaUpdate').click();
        },
        blur: function () {}
    };
};