geotab.addin.miDashboard = function (api, state) {
    let chartVacioInst = null, chartIdleInst = null;
    let datosKmGlobal = [], datosIdleGlobal = [];

    const showLoader = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';

    // Función: De decimal (1.5) a "01:30"
    const formatHHmm = (decimalHours) => {
        const totalMinutes = Math.round(decimalHours * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const parseTimeSpan = (ts) => {
        if (!ts) return 0;
        if (typeof ts === 'number') return ts;
        if (ts.totalSeconds) return ts.totalSeconds;
        if (typeof ts === 'string') {
            let p = ts.split(':');
            return p.length === 3 ? (parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2])) : 0;
        }
        return 0;
    };

    // --- CARGA DE KILÓMETROS (RESTAURADO) ---
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
            if(callback) callback(viajes);
        });
    };

    // --- CARGA DE RALENTÍ (CORREGIDO ZONAS Y FORMATO) ---
    const cargarIdle = (viajes) => {
        showLoader('loader-idle', true);
        let idleTrips = viajes.filter(v => parseTimeSpan(v.idlingDuration) > 0 && v.stopPoint);
        
        if (idleTrips.length === 0) {
            renderIdle([]);
            showLoader('loader-idle', false);
            return;
        }

        let coordsMap = new Map();
        idleTrips.forEach(v => {
            let key = v.stopPoint.x.toFixed(4) + "," + v.stopPoint.y.toFixed(4);
            v._coordKey = key;
            if (!coordsMap.has(key)) coordsMap.set(key, { x: v.stopPoint.x, y: v.stopPoint.y });
        });

        let uniqueCoords = Array.from(coordsMap.values());
        let calls = [];
        for (let i = 0; i < uniqueCoords.length; i += 400) {
            calls.push(["GetAddresses", { coordinates: uniqueCoords.slice(i, i + 400) }]);
        }

        api.multiCall(calls, (responses) => {
            let allAddresses = [].concat(...responses);
            let zoneResolver = new Map();

            Array.from(coordsMap.keys()).forEach((key, index) => {
                let addr = allAddresses[index];
                // LÓGICA: Solo si tiene 'zones' de Geotab, si no "Fuera de Zona"
                let zoneName = (addr && addr.zones && addr.zones.length > 0) ? addr.zones[0].name : "Fuera de Zona";
                zoneResolver.set(key, zoneName);
            });

            let resumen = {};
            idleTrips.forEach(v => {
                let z = zoneResolver.get(v._coordKey) || "Fuera de Zona";
                resumen[z] = (resumen[z] || 0) + (parseTimeSpan(v.idlingDuration) / 3600);
            });

            datosIdleGlobal = Object.keys(resumen).map(z => ({
                Zona: z,
                HorasDecimal: resumen[z],
                TiempoFormat: formatHHmm(resumen[z])
            })).sort((a,b) => b.HorasDecimal - a.HorasDecimal);

            renderIdle(datosIdleGlobal);
            showLoader('loader-idle', false);
        });
    };

    const renderKM = (datos) => {
        const ctx = document.getElementById('chartVacio').getContext('2d');
        if (chartVacioInst) chartVacioInst.destroy();
        chartVacioInst = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: datos.slice(0,10).map(d => d.Vehiculo), 
                datasets: [
                    { label: 'KM Vacío', data: datos.slice(0,10).map(d => d.kmVacio), backgroundColor: '#e74c3c' },
                    { label: 'KM Carga', data: datos.slice(0,10).map(d => d.kmCarga), backgroundColor: '#2ecc71' }
                ] 
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
        });
        document.getElementById('tablaCuerpo').innerHTML = datos.slice(0,15).map(d => `<tr><td><strong>${d.Vehiculo}</strong></td><td class="num">${d.kmVacio}</td><td>${d.Eficiencia}</td></tr>`).join('');
    };

    const renderIdle = (datos) => {
        const ctx = document.getElementById('chartIdle').getContext('2d');
        if (chartIdleInst) chartIdleInst.destroy();
        const top5 = datos.slice(0, 5);
        chartIdleInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: top5.map(d => d.Zona),
                datasets: [{ data: top5.map(d => d.HorasDecimal), backgroundColor: ['#2780e3', '#008767', '#f39c12', '#e74c3c', '#95a5a6'] }]
            },
            options: { maintainAspectRatio: false }
        });
        document.getElementById('idleTablaCuerpo').innerHTML = datos.map(d => `<tr><td><strong>${d.Zona}</strong></td><td class="num">${d.TiempoFormat}</td></tr>`).join('');
    };

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date().toISOString().split('T')[0];
            document.getElementById('dateTo').value = hoy;
            document.getElementById('dateFrom').value = hoy;

            document.getElementById('btnUpdateMain').onclick = () => {
                const f = document.getElementById('dateFrom').value + "T00:00:00.000Z";
                const t = document.getElementById('dateTo').value + "T23:59:59.000Z";
                cargarKM(f, t, (viajes) => cargarIdle(viajes));
            };

            document.getElementById('btnExcelKm').onclick = () => {
                const ws = XLSX.utils.json_to_sheet(datosKmGlobal);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "KM");
                XLSX.writeFile(wb, "Reporte_Kilometros.xlsx");
            };

            document.getElementById('btnExcelIdle').onclick = () => {
                const exportData = datosIdleGlobal.map(d => ({ Zona: d.Zona, Tiempo: d.TiempoFormat }));
                const ws = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Ralenti");
                XLSX.writeFile(wb, "Reporte_Ralenti.xlsx");
            };

            callback();
        },
        focus: function () { document.getElementById('btnUpdateMain').click(); }
    };
};