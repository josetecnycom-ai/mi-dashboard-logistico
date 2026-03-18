geotab.addin.miDashboard = function (api, state) {
    let chartKmObj = null, chartIdleObj = null, chartUsoObj = null;
    let dataKm = [], dataIdle = [], dataUso = [];
    let masterZones = {};
    let cacheResults = null; // Caché para recalcular peso al instante

    const toggleL = (id, s) => document.getElementById(id).style.display = s ? 'flex' : 'none';

    // Conversor de decimal a formato reloj HH:mm
    const formatTime = (decimalHours) => {
        const totalMinutes = Math.round(decimalHours * 60);
        return `${Math.floor(totalMinutes / 60).toString().padStart(2, '0')}:${(totalMinutes % 60).toString().padStart(2, '0')}`;
    };

    // Parser seguro para tiempos de Geotab
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

    // LÓGICA PRINCIPAL DE PROCESAMIENTO
    const procesarDatos = (results) => {
        cacheResults = results;
        const [devices, weights, trips, zones] = results;
        
        // RECOGEMOS EL VALOR DEL INPUT (POR DEFECTO AHORA ES 18000)
        const UMBRAL = parseFloat(document.getElementById('cfgWeight').value) || 18000;
        
        // 1. BLOQUE KILÓMETROS
        dataKm = devices.map(d => {
            let vk = 0, ck = 0;
            let dWeights = weights.filter(w => w.device.id === d.id);
            trips.filter(tr => tr.device.id === d.id).forEach(tr => {
                let w = dWeights.filter(dw => new Date(dw.dateTime) <= new Date(tr.stop)).pop();
                if (w && (w.data / 1000) >= UMBRAL) ck += tr.distance; else vk += tr.distance;
            });
            return { name: d.name, vk: Math.round(vk), ck: Math.round(ck), ef: ((ck/(vk+ck+0.1))*100).toFixed(1) + "%" };
        }).filter(i => (i.vk + i.ck) > 0).sort((a,b) => b.vk - a.vk);
        renderKM(dataKm);

        // 2. BLOQUE USO DE FLOTA
        dataUso = devices.map(d => {
            let vList = trips.filter(tr => tr.device.id === d.id && tr.distance > 0.1);
            let dias = new Set(vList.map(v => v.start.split('T')[0])).size;
            let tKm = vList.reduce((acc, v) => acc + v.distance, 0);
            return { name: d.name, dias: dias, kmDia: dias > 0 ? (tKm/dias).toFixed(1) : 0, total: Math.round(tKm) };
        }).sort((a,b) => b.total - a.total);
        renderUso(dataUso);

        // 3. BLOQUE RALENTÍ POR ZONAS
        masterZones = {}; zones.forEach(z => { masterZones[z.id] = z.name; });
        let idleTrips = trips.filter(tr => getSecs(tr.idlingDuration) > 0 && tr.stopPoint);
        
        if (idleTrips.length === 0) {
            renderIdle([]); 
            toggleL('load-idle', false); 
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
                let resolver = new Map();
                [].concat(...geoResults).forEach((addr, idx) => {
                    let zName = (addr && addr.zones && addr.zones.length > 0) ? (masterZones[addr.zones[0].id] || "Zona") : "Fuera de Zona";
                    resolver.set(Array.from(coordsMap.keys())[idx], zName);
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
        
        toggleL('load-km', false); 
        toggleL('load-uso', false);
    };

    const ejecutarLlamadaMaestra = () => {
        const fStr = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const tStr = document.getElementById('dateTo').value + "T23:59:59.000Z";
        toggleL('load-km', true); toggleL('load-idle', true); toggleL('load-uso', true);
        
        // --- NUEVA LÓGICA DE CHUNKING DIARIO PARA FLOTAS MASIVAS ---
        let fromDate = new Date(fStr);
        let finalToDate = new Date(tStr);
        let dateChunks = [];
        
        // Dividimos en bloques de 1 DÍA (evita el límite de 50k de la API en flotas de +300)
        while (fromDate < finalToDate) {
            let nextTo = new Date(fromDate);
            nextTo.setDate(nextTo.getDate() + 1); 
            if (nextTo > finalToDate) nextTo = finalToDate;
            
            dateChunks.push({ f: fromDate.toISOString(), t: nextTo.toISOString() });
            fromDate = new Date(nextTo.getTime() + 1); // Sumar 1ms para no solapar llamadas
        }

        // Llamadas base: Dispositivos y Zonas (Estos rara vez llegan a 50k registros)
        let calls = [
            ["Get", { typeName: "Device" }],
            ["Get", { typeName: "Zone" }]
        ];
        
        // Por CADA DÍA, añadimos una llamada para Viajes y otra para Pesos
        dateChunks.forEach(chunk => {
            calls.push(["Get", { typeName: "Trip", search: { fromDate: chunk.f, toDate: chunk.t } }]);
            calls.push(["Get", { typeName: "StatusData", search: { diagnosticSearch: { id: "aVrWeoUlmHE2AXsV_j0Kc7g" }, fromDate: chunk.f, toDate: chunk.t } }]);
        });

        // Ejecutamos todo de golpe
        api.multiCall(calls, (results) => {
            const devices = results[0];
            const zones = results[1];
            
            let allTrips = [];
            let allWeights = [];
            
            // Los resultados a partir de la posición 2 vienen en pares: [Viajes Día 1, Pesos Día 1, Viajes Día 2, Pesos Día 2...]
            for (let i = 2; i < results.length; i += 2) {
                allTrips = allTrips.concat(results[i]);
                allWeights = allWeights.concat(results[i + 1]);
            }
            
            // Enviamos todo a procesar como si hubiera sido una sola llamada
            procesarDatos([devices, allWeights, allTrips, zones]);
        }, (error) => {
            console.error("Error en la descarga masiva:", error);
            alert("Hubo un error de red contactando con Geotab. Revisa la consola.");
            toggleL('load-km', false); toggleL('load-idle', false); toggleL('load-uso', false);
        });
    };

    // FUNCIONES DE RENDERIZADO VISUAL
    const renderKM = (d) => {
        const ctx = document.getElementById('chart-km').getContext('2d');
        if (chartKmObj) chartKmObj.destroy();
        chartKmObj = new Chart(ctx, { 
            type: 'bar', 
            data: { 
                labels: d.slice(0,10).map(i => i.name), 
                datasets: [
                    { label: 'KM Vacío', data: d.slice(0,10).map(i => i.vk), backgroundColor: '#e74c3c' }, 
                    { label: 'KM Carga', data: d.slice(0,10).map(i => i.ck), backgroundColor: '#2ecc71' }
                ] 
            }, 
            options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } } 
        });
        document.getElementById('body-km').innerHTML = d.slice(0,15).map(i => `<tr><td><strong>${i.name}</strong></td><td class="num">${i.vk}</td><td class="num">${i.ef}</td></tr>`).join('');
    };

    const renderIdle = (d) => {
        const ctx = document.getElementById('chart-idle').getContext('2d');
        if (chartIdleObj) chartIdleObj.destroy();
        chartIdleObj = new Chart(ctx, { 
            type: 'doughnut', 
            data: { 
                labels: d.slice(0,5).map(i => i.zona), 
                datasets: [{ data: d.slice(0,5).map(i => i.val.toFixed(2)), backgroundColor: ['#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#95a5a6'] }] 
            }, 
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
                    { label: 'Días Activos', data: d.slice(0,12).map(i => i.dias), type: 'line', borderColor: '#e67e22', yAxisID: 'y1' }
                ] 
            }, 
            options: { maintainAspectRatio: false, scales: { y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } } } 
        });
        document.getElementById('body-uso').innerHTML = d.map(i => `<tr class="${i.dias === 0 ? 'bad-row' : ''}"><td><strong>${i.name}</strong> ${i.dias === 0 ? '⚠️' : ''}</td><td class="num">${i.dias}</td><td class="num">${i.kmDia}</td><td class="num">${i.total}</td></tr>`).join('');
    };

    return {
        initialize: function (api, state, callback) {
            // INICIALIZACIÓN DE FECHAS A 30 DÍAS
            const hoy = new Date();
            const hace30 = new Date(); hace30.setDate(hoy.getDate() - 30);
            document.getElementById('dateTo').value = hoy.toISOString().split('T')[0];
            document.getElementById('dateFrom').value = hace30.toISOString().split('T')[0];

            // BOTONES DE ACCIÓN
            document.getElementById('btnRun').onclick = ejecutarLlamadaMaestra;
            document.getElementById('btnToggleConfig').onclick = () => {
                const p = document.getElementById('configPanel');
                p.style.display = (p.style.display === 'flex') ? 'none' : 'flex';
            };

            // RECALCULAR AL CAMBIAR EL PESO EN EL INPUT
            document.getElementById('cfgWeight').onchange = () => { 
                if (cacheResults) {
                    toggleL('load-km', true);
                    // Timeout mínimo para que dé tiempo a mostrar el spinner
                    setTimeout(() => { procesarDatos(cacheResults); }, 50); 
                }
            };

            // DESCARGAS DE EXCEL
            document.getElementById('xlsx-km').onclick = () => {
                if(dataKm.length === 0) return alert("No hay datos para exportar.");
                const ws = XLSX.utils.json_to_sheet(dataKm);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Eficiencia");
                XLSX.writeFile(wb, "Reporte_Eficiencia.xlsx");
            };
            
            document.getElementById('xlsx-idle').onclick = () => {
                if(dataIdle.length === 0) return alert("No hay datos para exportar.");
                const ws = XLSX.utils.json_to_sheet(dataIdle.map(i => ({ Zona: i.zona, Tiempo: i.txt })));
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ralenti");
                XLSX.writeFile(wb, "Reporte_Ralenti_Zonas.xlsx");
            };
            
            document.getElementById('xlsx-uso').onclick = () => {
                if(dataUso.length === 0) return alert("No hay datos para exportar.");
                const ws = XLSX.utils.json_to_sheet(dataUso);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Uso");
                XLSX.writeFile(wb, "Reporte_Intensidad_Uso.xlsx");
            };
            
            callback();
        },
        focus: function () { ejecutarLlamadaMaestra(); }
    };
};
