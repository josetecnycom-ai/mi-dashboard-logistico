geotab.addin.miDashboard = function (api, state) {
    let chartIdleInst = null;
    let datosIdleGlobal = [];

    const showLoader = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';

    // Función para convertir horas decimales a formato HH:mm
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

    const cargarDatos = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";
        
        showLoader('loader-idle', true);

        api.call("Get", { typeName: "Trip", search: { fromDate, toDate } }, (viajes) => {
            let idleTrips = viajes.filter(v => parseTimeSpan(v.idlingDuration) > 0 && v.stopPoint);
            
            if (idleTrips.length === 0) {
                renderIdle([]);
                showLoader('loader-idle', false);
                return;
            }

            // Mapeo único de coordenadas para consultar zonas
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
                    // Si existe la propiedad 'zones' y tiene elementos, tomamos el nombre. Si no, "Fuera de Zona"
                    let zoneName = (addr && addr.zones && addr.zones.length > 0) 
                                   ? addr.zones[0].name 
                                   : "Fuera de Zona";
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
        });
    };

    const renderIdle = (datos) => {
        const ctx = document.getElementById('chartIdle').getContext('2d');
        if (chartIdleInst) chartIdleInst.destroy();
        
        const top5 = datos.slice(0, 5);
        chartIdleInst = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: top5.map(d => d.Zona),
                datasets: [{ data: top5.map(d => d.HorasDecimal.toFixed(2)), backgroundColor: ['#2780e3', '#008767', '#f39c12', '#e74c3c', '#95a5a6'] }]
            },
            options: { maintainAspectRatio: false }
        });

        document.getElementById('idleTablaCuerpo').innerHTML = datos.map(d => `
            <tr>
                <td><strong>${d.Zona}</strong></td>
                <td class="num">${d.TiempoFormat}</td>
            </tr>
        `).join('');
    };

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date().toISOString().split('T')[0];
            document.getElementById('dateTo').value = hoy;
            document.getElementById('dateFrom').value = hoy;
            document.getElementById('btnUpdateMain').onclick = cargarDatos;
            document.getElementById('btnExcelIdle').onclick = () => {
                const exportData = datosIdleGlobal.map(d => ({ Zona: d.Zona, Tiempo: d.TiempoFormat }));
                const ws = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Ralenti");
                XLSX.writeFile(wb, "Reporte_Ralenti_Zonas.xlsx");
            };
            callback();
        },
        focus: function () { cargarDatos(); }
    };
};