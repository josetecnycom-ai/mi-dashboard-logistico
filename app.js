geotab.addin.miDashboard = function (api, state) {
    let chartKmObj = null, chartIdleObj = null;
    let dataKm = [], dataIdle = [];
    let masterZones = {}; // Mapa para guardar ID -> Nombre de Zona

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
        
        toggleL('load-km', true);
        toggleL('load-idle', true);

        // Paso 1: Obtener dispositivos, pesos, viajes y la lista de Zonas
        api.multiCall([
            ["Get", { typeName: "Device" }],
            ["Get", { typeName: "StatusData", search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate: f, toDate: t } }],
            ["Get", { typeName: "Trip", search: { fromDate: f, toDate: t } }],
            ["Get", { typeName: "Zone" }]
        ], (results) => {
            const [devices, weights, trips, zones] = results;
            
            // Guardamos las zonas en un mapa para acceso rápido
            masterZones = {};
            zones.forEach(z => { masterZones[z.id] = z.name; });

            // 1. Lógica de KM y Eficiencia
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

            // 2. Lógica de Ralentí por Zona (Reverse Geocoding con IDs de zona)
            let idleTrips = trips.filter(tr => getSecs(tr.idlingDuration) > 0 && tr.stopPoint);
            if (idleTrips.length === 0) {
                renderIdle([]);
                toggleL('load-idle', false);
                return;
            }

            let coordsMap = new Map();
            idleTrips.forEach(tr => {
                let key = tr.stopPoint.x.toFixed(4) + "," + tr.stopPoint.y.toFixed(4);
                tr._ckey = key;
                if (!coordsMap.has(key)) coordsMap.set(key, { x: tr.stopPoint.x, y: tr.stopPoint.y });
            });

            let uCoords = Array.from(coordsMap.values());
            let geoCalls = [];
            for (let i = 0; i < uCoords.length; i += 400) {
                geoCalls.push(["GetAddresses", { coordinates: uCoords.slice(i, i + 400) }]);
            }

            api.multiCall(geoCalls, (geoResults) => {
                let allAddrs = [].concat(...geoResults);
                let resolver = new Map();

                Array.from(coordsMap.keys()).forEach((key, index) => {
                    let addr = allAddrs[index];
                    let zName = "Fuera de Zona";
                    // Si Geotab detecta zonas, buscamos el nombre en nuestra masterZones
                    if (addr && addr.zones && addr.zones.length > 0) {
                        let zId = addr.zones[0].id;
                        zName = masterZones[zId] || addr.zones[0].name || "Zona Sin Nombre";
                    }
                    resolver.set(key, zName);
                });

                let resumen = {};
                idleTrips.forEach(tr => {
                    let z = resolver.get(tr._ckey) || "Fuera de Zona";
                    resumen[z] = (resumen[z] || 0) + (getSecs(tr.idlingDuration) / 3600);
                });

                dataIdle = Object.keys(resumen).map(k => ({
                    zona: k,
                    val: resumen[k],
                    txt: formatTime(resumen[k])
                })).sort((a,b) => b.val - a.val);

                renderIdle(dataIdle);
                toggleL('load-idle', false);
            });

        }, (e) => { 
            console.error(e); 
            alert("Error en la conexión con MyGeotab. Revisa los permisos."); 
            toggleL('load-km', false); toggleL('load-idle', false);
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
            data: { labels: d.slice(0,5).map(i => i.zona), datasets: [{ data: d.slice(0,5).map(i => i.val.toFixed(2)), backgroundColor: ['#2780e3', '#27ae60', '#f1c40f', '#e67e22', '#95a5a6'] }] },
            options: { maintainAspectRatio: false }
        });
        document.getElementById('body-idle').innerHTML = d.map(i => `<tr><td><strong>${i.zona}</strong></td><td class="num">${i.txt}</td></tr>`).join('');
    };

    return {
        initialize: function (api, state, callback) {
            const h = new Date().toISOString().split('T')[0];
            document.getElementById('dateTo').value = h;
            document.getElementById('dateFrom').value = h;
            document.getElementById('btnRun').onclick = procesarTodo;
            document.getElementById('xlsx-km').onclick = () => {
                const ws = XLSX.utils.json_to_sheet(dataKm);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "KM");
                XLSX.writeFile(wb, "Reporte_KM.xlsx");
            };
            document.getElementById('xlsx-idle').onclick = () => {
                const ws = XLSX.utils.json_to_sheet(dataIdle.map(i => ({ Zona: i.zona, Tiempo: i.txt })));
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ralenti");
                XLSX.writeFile(wb, "Reporte_Ralenti.xlsx");
            };
            callback();
        },
        focus: function () { procesarTodo(); }
    };
};