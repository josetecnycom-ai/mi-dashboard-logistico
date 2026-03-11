geotab.addin.miDashboard = function (api, state) {
    let chartVacioInst = null, chartIdleInst = null;
    let datosKmGlobal = [], datosIdleGlobal = [];

    const showLoader = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';
    
    const exportarExcel = (datos, columnas, nombre) => {
        if (datos.length === 0) return alert("No hay datos para exportar");
        const ws = XLSX.utils.json_to_sheet(datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${nombre}.xlsx`);
    };

    const cargarKM = (fromDate, toDate, callback) => {
        showLoader('loader-km', true);
        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { typeName: "StatusData", search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate, toDate } }],
            ["Get", { typeName: "Trip", search: { fromDate, toDate } }]
        ], (results) => {
            const [dispositivos, pesos, viajes] = results;
            datosKmGlobal = dispositivos.map(d => {
                let kmV = 0, kmC = 0;
                let pesosV = pesos.filter(p => p.device.id === d.id);
                viajes.filter(v => v.device.id === d.id).forEach(v => {
                    let p = pesosV.filter(p => new Date(p.dateTime) <= new Date(v.stop)).pop();
                    if (p && (p.data / 1000) >= 20000) kmC += v.distance; else kmV += v.distance;
                });
                return { Vehiculo: d.name, kmVacio: Math.round(kmV), kmCarga: Math.round(kmC), Eficiencia: ((kmC/(kmV+kmC+0.1))*100).toFixed(1) + "%" };
            }).filter(s => (s.kmVacio + s.kmCarga) > 0).sort((a,b) => b.kmVacio - a.kmVacio);

            renderKM(datosKmGlobal);
            showLoader('loader-km', false);
            if(callback) callback();
        }, (e) => { console.error(e); showLoader('loader-km', false); });
    };

    const cargarIdle = (fromDate, toDate) => {
        showLoader('loader-idle', true);
        api.call("Get", { typeName: "Trip", search: { fromDate, toDate } }, (viajes) => {
            let res = {};
            viajes.forEach(v => {
                if (v.idlingDuration) {
                    let zona = (v.stopPoint && v.stopPoint.zones && v.stopPoint.zones.length > 0) ? v.stopPoint.zones[0].name : "Fuera de Zona";
                    // Corrección: Geotab a veces devuelve la duración como ticks o string ISO
                    let segundos = 0;
                    if(typeof v.idlingDuration === 'string') {
                        // Simple parse de duración ISO si viene como string
                        let parts = v.idlingDuration.split(/[:.]/);
                        segundos = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
                    } else { segundos = v.idlingDuration.totalSeconds || 0; }
                    
                    res[zona] = (res[zona] || 0) + (segundos / 3600);
                }
            });
            datosIdleGlobal = Object.keys(res).map(z => ({ Zona: z, Horas: res[z].toFixed(2), Costo_Est: (res[z] * 3.6).toFixed(2) + "€" }))
                .sort((a,b) => b.Horas - a.Horas);
            
            renderIdle(datosIdleGlobal);
            showLoader('loader-idle', false);
        });
    };

    const renderKM = (datos) => {
        const ctx = document.getElementById('chartVacio').getContext('2d');
        if (chartVacioInst) chartVacioInst.destroy();
        chartVacioInst = new Chart(ctx, {
            type: 'bar',
            data: { labels: datos.slice(0,10).map(d => d.Vehiculo), datasets: [{ label: 'KM Vacío', data: datos.slice(0,10).map(d => d.kmVacio), backgroundColor: '#e74c3c' }, { label: 'KM Carga', data: datos.slice(0,10).map(d => d.kmCarga), backgroundColor: '#2ecc71' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
        });
        document.getElementById('tablaCuerpo').innerHTML = datos.slice(0,15).map(d => `<tr><td>${d.Vehiculo}</td><td class="num">${d.kmVacio}</td><td>${d.Eficiencia}</td></tr>`).join('');
    };

    const renderIdle = (datos) => {
        const ctx = document.getElementById('chartIdle').getContext('2d');
        if (chartIdleInst) chartIdleInst.destroy();
        chartIdleInst = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: datos.slice(0,5).map(d => d.Zona), datasets: [{ data: datos.slice(0,5).map(d => d.Horas), backgroundColor: ['#e67e22','#d35400','#f39c12','#e74c3c','#95a5a6'] }] },
            options: { maintainAspectRatio: false }
        });
        document.getElementById('idleTablaCuerpo').innerHTML = datos.slice(0,10).map(d => `<tr><td>${d.Zona}</td><td class="num">${d.Horas}h</td><td class="num">${d.Costo_Est}</td></tr>`).join('');
    };

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date().toISOString().split('T')[0];
            const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
            document.getElementById('dateTo').value = hoy;
            document.getElementById('dateFrom').value = hace30.toISOString().split('T')[0];
            
            document.getElementById('btnUpdateMain').onclick = () => {
                const f = document.getElementById('dateFrom').value + "T00:00:00.000Z";
                const t = document.getElementById('dateTo').value + "T23:59:59.000Z";
                cargarKM(f, t, () => cargarIdle(f, t));
            };
            document.getElementById('btnExcelKm').onclick = () => exportarExcel(datosKmGlobal, null, "Reporte_KM_Eficiencia");
            document.getElementById('btnExcelIdle').onclick = () => exportarExcel(datosIdleGlobal, null, "Reporte_Ralenti_Zonas");

            callback();
        },
        focus: function () { document.getElementById('btnUpdateMain').click(); }
    };
};