geotab.addin.miDashboard = function (api, state) {
    let chartKmObj = null, chartIdleObj = null, chartUsoObj = null;
    let dataKm = [], dataIdle = [], dataUso = [];
    let masterZones = {};

    const toggleL = (id, s) => document.getElementById(id).style.display = s ? 'flex' : 'none';

    const formatTime = (decimalHours) => {
        const totalMinutes = Math.round(decimalHours * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const getSecs = (ts) => {
        if (!ts) return 0;
        if (typeof ts === 'number') return ts;
        if (ts.totalSeconds) return ts.totalSeconds;
        if (typeof ts === 'string') {
            let p = ts.split(':');
            return p.length === 3 ? (parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2])) : 0;
        }
        return 0;
    };

    const procesarTodo = () => {
        const f = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const t = document.getElementById('dateTo').value + "T23:59:59.000Z";
        
        toggleL('load-km', true); toggleL('load-idle', true); toggleL('load-uso', true);

        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { typeName: "StatusData", search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate: f, toDate: t } }],
            ["Get", { typeName: "Trip", search: { fromDate: f, toDate: t } }],
            ["Get", { typeName: "Zone" }]
        ], (results) => {
            const [devices, weights, trips, zones] = results;
            
            masterZones = {};
            zones.forEach(z => { masterZones[z.id] = z.name; });

            // 1. KM
            dataKm = devices.map(d => {
                let vk = 0, ck = 0;
                let dWeights = weights.filter(w => w.device.id === d.id);
                trips.filter(tr => tr.device.id === d.id).forEach(tr => {
                    let w = dWeights.filter(dw => new Date(dw.dateTime) <= new Date(tr.stop)).pop();
                    if (w && (w.data / 1000) >= 20000) ck += tr.distance; else vk += tr.distance;
                });
                return { name: d.name, vk: Math.round(vk), ck: Math.round(ck), ef: ((ck/(vk+ck+0.1))*100).toFixed(1) + "%" };
            }).filter(i => (i.vk + i.ck) > 0).sort((a,b) => b.vk - a.vk);
            renderKM(dataKm);
            toggleL('load-km', false);

            // 2. USO
            dataUso = devices.map(d => {
                let vList = trips.filter(tr => tr.device.id === d.id && tr.distance > 0.1);
                let diasUnicos = new Set(vList.map(v => v.start.split('T')[0]));
                let totalKm = vList.reduce((acc, v) => acc + v.distance, 0);
                let nDias = diasUnicos.size;
                return { name: d.name, dias: nDias, kmDia: nDias > 0 ? (totalKm / nDias).toFixed(1) : 0, total: Math.round(totalKm) };
            }).sort((a,b) => b.total - a.total);
            renderUso(dataUso);
            toggleL('load-uso', false);

            // 3. RALENTÍ
            let idleTrips = trips.filter(tr => getSecs(tr.idlingDuration) > 0 && tr.stopPoint);
            if (idleTrips.length === 0) {
                renderIdle([]); toggleL('load-idle', false);
            } else {
                let coordsMap = new Map();
                idleTrips.forEach(tr => {
                    let key = tr.stopPoint.x.toFixed(4) + "," + tr.stopPoint.y.toFixed(4);
                    tr._ckey = key;
                    if (!coordsMap.has(key)) coordsMap.set(key, { x: tr.stopPoint.x, y: tr.stopPoint.y });
                });
                let geoCalls = [];
                let uCoords = Array.from(coordsMap.values());
                for (let i = 0; i < uCoords.length; i += 400) geoCalls.push(["GetAddresses", { coordinates: uCoords.slice(i, i + 400) }]);

                api.multiCall(geoCalls, (geoResults) => {
                    let allAddrs = [].concat(...geoResults);
                    let resolver = new Map();
                    Array.from(coordsMap.keys()).forEach((key, index) => {
                        let addr = allAddrs[index];
                        let zName = (addr && addr.zones && addr.zones.length > 0) ? (masterZones[addr.zones[0].id] || "Zona") : "Fuera de Zona";
                        resolver.set(key, zName);
                    });
                    let res = {};
                    idleTrips.forEach(tr => {
                        let z = resolver.get(tr._ckey) || "Fuera de Zona";
                        res[z] = (res[z] || 0) + (getSecs(tr.idlingDuration) / 3600);
                    });
                    dataIdle = Object.keys(res).map(k => ({ zona: k, val: res[k], txt: formatTime(res[k]) })).sort((a,b) => b.val - a.val);
                    renderIdle(dataIdle);
                    toggleL('load-idle', false);
                });
            }
        });
    };

    const renderKM = (d) => {
        const ctx = document.getElementById('chart-km').getContext('2d');
        if (chartKmObj) chartKmObj.destroy();
        chartKmObj = new Chart(ctx, {
            type: 'bar',
            data: { labels: d.slice(0,10).map(i => i.name), datasets: [{ label: 'KM Vacío', data: d.slice(0,10).map(i => i.vk), backgroundColor: '#e74c3c' }, { label: 'KM Carga', data: d.slice(0,10).map(i => i.ck), backgroundColor: '#2ecc71' }] },
            options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
        });
        document.getElementById('body-km').innerHTML = d.slice(0,15).map(i => `<tr><td>${i.name}</td><td class="num">${i.vk}</td><td class="num">${i.ef}</td></tr>`).join('');
    };

    const renderIdle = (d) => {
        const ctx = document.getElementById('chart-idle').getContext('2d');
        if (chartIdleObj) chartIdleObj.destroy();
        chartIdleObj = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: d.slice(0,5).map(i => i.zona), datasets: [{ data: d.slice(0,5).map(i => i.val.toFixed(2)), backgroundColor: ['#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#95a5a6'] }] },
            options: { maintainAspectRatio: false }
        });
        document.getElementById('body-idle').innerHTML = d.map(i => `<tr><td><strong>${i.zona}</strong></td><td class="num">${i.txt}</td></tr>`).join('');
    };

    const renderUso = (d) => {
        const ctx = document.getElementById('chart-uso').getContext('2d');
        if (chartUsoObj) chartUsoObj.destroy();
        chartUsoObj = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: d.slice(0,12).map(i => i.name),
                datasets: [
                    { label: 'KM Totales', data: d.slice(0,12).map(i => i.total), backgroundColor: 'rgba(52, 152, 219, 0.5)', yAxisID: 'y' },
                    { label: 'Días Activos', data: d.slice(0,12).map(i => i.dias), type: 'line', borderColor: '#e67e22', tension: 0.3, yAxisID: 'y1' }
                ]
            },
            options: { maintainAspectRatio: false, scales: { y: { type: 'linear', position: 'left' }, y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } } } }
        });
        document.getElementById('body-uso').innerHTML = d.map(i => `
            <tr class="${i.dias === 0 ? 'bad-row' : ''}">
                <td><strong>${i.name}</strong> ${i.dias === 0 ? '⚠️' : ''}</td>
                <td class="num">${i.dias}</td>
                <td class="num">${i.kmDia} km/d</td>
                <td class="num">${i.total}</td>
            </tr>
        `).join('');
    };

    return {
        initialize: function (api, state, callback) {
            // LÓGICA DE FECHAS AUTOMÁTICAS (Últimos 30 días)
            const hoy = new Date();
            const hace30d = new Date();
            hace30d.setDate(hoy.getDate() - 30);

            const formatISO = (date) => date.toISOString().split('T')[0];

            document.getElementById('dateTo').value = formatISO(hoy);
            document.getElementById('dateFrom').value = formatISO(hace30d);

            document.getElementById('btnRun').onclick = procesarTodo;
            
            // Exportadores Excel
            document.getElementById('xlsx-km').onclick = () => {
                const ws = XLSX.utils.json_to_sheet(dataKm);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "KM");
                XLSX.writeFile(wb, "Reporte_Eficiencia.xlsx");
            };
            document.getElementById('xlsx-idle').onclick = () => {
                const ws = XLSX.utils.json_to_sheet(dataIdle.map(i => ({ Zona: i.zona, Tiempo: i.txt })));
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ralenti");
                XLSX.writeFile(wb, "Reporte_Ralenti_Zonas.xlsx");
            };
            document.getElementById('xlsx-uso').onclick = () => {
                const ws = XLSX.utils.json_to_sheet(dataUso);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Uso");
                XLSX.writeFile(wb, "Reporte_Intensidad_Uso.xlsx");
            };
            callback();
        },
        focus: function () { procesarTodo(); }
    };
};