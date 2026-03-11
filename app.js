geotab.addin.miDashboard = function (api, state) {
    let chartKmObj = null, chartIdleObj = null;
    let dataKm = [], dataIdle = [];

    const toggleLoad = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';

    const toHHmm = (decimalHours) => {
        const totalSecs = Math.round(decimalHours * 3600);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const parseSeconds = (ts) => {
        if (!ts) return 0;
        if (typeof ts === 'number') return ts;
        if (ts.totalSeconds) return ts.totalSeconds;
        if (typeof ts === 'string') {
            let p = ts.split(':');
            return p.length === 3 ? (parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2])) : 0;
        }
        return 0;
    };

    const ejecutarProceso = () => {
        const from = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const to = document.getElementById('dateTo').value + "T23:59:59.000Z";
        
        toggleLoad('load-km', true);
        toggleLoad('load-idle', true);

        // LLAMADA MAESTRA: Traemos todo de una vez
        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { typeName: "StatusData", search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate: from, toDate: to } }],
            ["Get", { typeName: "Trip", search: { fromDate: from, toDate: to } }],
            ["Get", { typeName: "Exception", search: { ruleSearch: { id: "RuleZoneStopId" }, fromDate: from, toDate: to } }]
        ], (results) => {
            const [devices, weights, trips, exceptions] = results;

            // 1. PROCESAR KM Y EFICIENCIA
            dataKm = devices.map(d => {
                let vK = 0, cK = 0;
                let dWeights = weights.filter(w => w.device.id === d.id);
                trips.filter(t => t.device.id === d.id).forEach(t => {
                    let lastW = dWeights.filter(w => new Date(w.dateTime) <= new Date(t.stop)).pop();
                    if (lastW && (lastW.data / 1000) >= 20000) cK += t.distance; else vK += t.distance;
                });
                return { name: d.name, vk: Math.round(vK), ck: Math.round(cK), ef: ((cK/(vK+cK+0.1))*100).toFixed(1) + "%" };
            }).filter(i => (i.vk + i.ck) > 0).sort((a,b) => b.vk - a.vk);

            renderKM(dataKm);
            toggleLoad('load-km', false);

            // 2. PROCESAR RALENTÍ POR ZONA (MÉTODO EXCEPCIONES)
            let zonesResumen = {};
            trips.filter(t => parseSeconds(t.idlingDuration) > 0).forEach(t => {
                let idlingHr = parseSeconds(t.idlingDuration) / 3600;
                let stopTime = new Date(t.stop).getTime();
                
                // Buscamos si existe una excepción de ZoneStop que coincida con el fin del viaje
                let match = exceptions.find(e => 
                    e.device.id === t.device.id && 
                    Math.abs(new Date(e.activeFrom).getTime() - stopTime) < 5000 // 5 segundos de margen
                );

                let zName = match ? (match.rule.name || "Zona") : "Fuera de Zona";
                // Limpieza de nombre si Geotab añade prefijos
                zName = zName.replace("Zone Stop: ", "").replace("Parada en zona: ", "");
                
                zonesResumen[zName] = (zonesResumen[zName] || 0) + idlingHr;
            });

            dataIdle = Object.keys(zonesResumen).map(z => ({
                zona: z,
                valor: zonesResumen[z],
                formato: toHHmm(zonesResumen[z])
            })).sort((a,b) => b.valor - a.valor);

            renderIdle(dataIdle);
            toggleLoad('load-idle', false);

        }, (err) => { console.error(err); alert("Error en API Geotab"); });
    };

    const renderKM = (datos) => {
        const ctx = document.getElementById('chart-km').getContext('2d');
        if (chartKmObj) chartKmObj.destroy();
        chartKmObj = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: datos.slice(0,10).map(i => i.name),
                datasets: [
                    { label: 'KM Vacío', data: datos.slice(0,10).map(i => i.vk), backgroundColor: '#e74c3c' },
                    { label: 'KM Carga', data: datos.slice(0,10).map(i => i.ck), backgroundColor: '#2ecc71' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
        });
        document.getElementById('body-km').innerHTML = datos.slice(0,15).map(i => `<tr><td>${i.name}</td><td class="num">${i.vk}</td><td class="num">${i.ef}</td></tr>`).join('');
    };

    const renderIdle = (datos) => {
        const ctx = document.getElementById('chart-idle').getContext('2d');
        if (chartIdleObj) chartIdleObj.destroy();
        const top5 = datos.slice(0, 5);
        chartIdleObj = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: top5.map(i => i.zona),
                datasets: [{ data: top5.map(i => i.valor.toFixed(2)), backgroundColor: ['#3498db', '#27ae60', '#f1c40f', '#e67e22', '#95a5a6'] }]
            },
            options: { maintainAspectRatio: false }
        });
        document.getElementById('body-idle').innerHTML = datos.map(i => `<tr><td><strong>${i.zona}</strong></td><td class="num">${i.formato}</td></tr>`).join('');
    };

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date().toISOString().split('T')[0];
            document.getElementById('dateTo').value = hoy;
            document.getElementById('dateFrom').value = hoy;
            document.getElementById('btnRun').onclick = ejecutarProceso;
            
            document.getElementById('xlsx-km').onclick = () => {
                const ws = XLSX.utils.json_to_sheet(dataKm);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "KM");
                XLSX.writeFile(wb, "Reporte_KM.xlsx");
            };
            
            document.getElementById('xlsx-idle').onclick = () => {
                const ws = XLSX.utils.json_to_sheet(dataIdle.map(i => ({ Zona: i.zona, Tiempo: i.formato })));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Ralenti");
                XLSX.writeFile(wb, "Reporte_Ralenti.xlsx");
            };

            callback();
        },
        focus: function () { ejecutarProceso(); }
    };
};