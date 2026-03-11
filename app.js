geotab.addin.miDashboard = function (api, state) {
    let chartVacioInst = null, chartIdleInst = null;
    let datosKmGlobal = [], datosIdleGlobal = [];

    // Variables de Costo (Puedes modificarlas a la realidad de tu flota)
    const PRECIO_LITRO = 1.45; // € por Litro
    const CONSUMO_RALENTI = 2.5; // Litros por Hora al ralentí

    const showLoader = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';
    const updateStatus = (msg) => { const el = document.getElementById('global-status'); if(el) el.innerText = msg; };
    
    const exportarExcel = (datos, nombre) => {
        if (datos.length === 0) return alert("No hay datos para exportar");
        const ws = XLSX.utils.json_to_sheet(datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${nombre}.xlsx`);
    };

    // --- SECCIÓN 1: KILÓMETROS Y EFICIENCIA ---
    const cargarKM = (fromDate, toDate, callback) => {
        showLoader('loader-km', true);
        updateStatus("Paso 1/2: Obteniendo Kilómetros y Pesos...");

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
                return { 
                    Vehiculo: d.name, 
                    kmVacio: Math.round(kmV), 
                    kmCarga: Math.round(kmC), 
                    Eficiencia: ((kmC/(kmV+kmC+0.1))*100).toFixed(1) + "%" 
                };
            }).filter(s => (s.kmVacio + s.kmCarga) > 0).sort((a,b) => b.kmVacio - a.kmVacio);

            renderKM(datosKmGlobal);
            showLoader('loader-km', false);
            if(callback) callback();
        }, (e) => { console.error(e); showLoader('loader-km', false); });
    };

    // --- SECCIÓN 2: RALENTÍ CON MAPEO DE ZONAS (NUEVO) ---
    const cargarIdle = (fromDate, toDate) => {
        showLoader('loader-idle', true);
        updateStatus("Paso 2/2: Cruzando coordenadas GPS con Zonas Geotab...");

        api.call("Get", { typeName: "Trip", search: { fromDate, toDate } }, (viajes) => {
            
            // 1. Extraer solo viajes con ralentí y transformar el tiempo a segundos
            let idleTrips = viajes.filter(v => {
                let s = 0;
                if (typeof v.idlingDuration === 'string') {
                    let p = v.idlingDuration.split(/[:.]/);
                    s = (+p[0]) * 3600 + (+p[1]) * 60 + (+p[2]);
                } else {
                    s = v.idlingDuration ? v.idlingDuration.totalSeconds : 0;
                }
                v._idlingSecs = s;
                return s > 0 && v.stopPoint;
            });

            if (idleTrips.length === 0) {
                renderIdle([]);
                showLoader('loader-idle', false);
                updateStatus("Dashboard actualizado (Sin datos de ralentí).");
                return;
            }

            // 2. Agrupar coordenadas para NO bloquear la API (precisión de ~11 metros)
            let coordsMap = new Map();
            idleTrips.forEach(v => {
                let key = v.stopPoint.x.toFixed(4) + "," + v.stopPoint.y.toFixed(4);
                v._coordKey = key;
                if (!coordsMap.has(key)) coordsMap.set(key, { x: v.stopPoint.x, y: v.stopPoint.y });
            });

            let uniqueCoords = Array.from(coordsMap.values());
            let addressCalls = [];
            const CHUNK_SIZE = 400; // Pedimos de 400 en 400 para que Geotab no rechace la petición
            
            for (let i = 0; i < uniqueCoords.length; i += CHUNK_SIZE) {
                addressCalls.push(["GetAddresses", { coordinates: uniqueCoords.slice(i, i + CHUNK_SIZE) }]);
            }

            // 3. MultiCall para resolver todas las zonas a la vez
            api.multiCall(addressCalls, (responses) => {
                let flatResponses = [];
                responses.forEach(r => flatResponses = flatResponses.concat(r));
                
                let resolvedZones = new Map();
                Array.from(coordsMap.keys()).forEach((key, index) => {
                    let addr = flatResponses[index];
                    let zonaNombre = "Fuera de Zona";
                    if (addr && addr.zones && addr.zones.length > 0) {
                        zonaNombre = addr.zones[0].name; // Tomamos la primera zona que coincida
                    }
                    resolvedZones.set(key, zonaNombre);
                });

                // 4. Sumar el tiempo por zona
                let resultadosIdle = {};
                idleTrips.forEach(v => {
                    let zName = resolvedZones.get(v._coordKey) || "Fuera de Zona";
                    resultadosIdle[zName] = (resultadosIdle[zName] || 0) + (v._idlingSecs / 3600);
                });

                datosIdleGlobal = Object.keys(resultadosIdle).map(z => ({ 
                    Zona: z, 
                    Horas: resultadosIdle[z].toFixed(2), 
                    Costo_Est: (resultadosIdle[z] * CONSUMO_RALENTI * PRECIO_LITRO).toFixed(2) + "€" 
                })).sort((a,b) => parseFloat(b.Horas) - parseFloat(a.Horas));
                
                renderIdle(datosIdleGlobal);
                showLoader('loader-idle', false);
                updateStatus("¡Dashboard 100% Actualizado!");

            }, (e) => {
                console.error("Error resolviendo Zonas:", e);
                showLoader('loader-idle', false);
                updateStatus("Error al resolver las zonas.");
            });
        }, (e) => {
            console.error("Error obteniendo Trips:", e);
            showLoader('loader-idle', false);
        });
    };

    // --- RENDERIZADO VISUAL ---
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
            data: { labels: datos.slice(0,5).map(d => d.Zona), datasets: [{ data: datos.slice(0,5).map(d => parseFloat(d.Horas)), backgroundColor: ['#e67e22','#d35400','#f39c12','#e74c3c','#95a5a6'] }] },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
        document.getElementById('idleTablaCuerpo').innerHTML = datos.slice(0,10).map(d => `<tr><td><strong>${d.Zona}</strong></td><td class="num">${d.Horas}h</td><td class="num" style="color:#c0392b; font-weight:bold;">${d.Costo_Est}</td></tr>`).join('');
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
            
            document.getElementById('btnExcelKm').onclick = () => exportarExcel(datosKmGlobal, "Reporte_KM_Eficiencia");
            document.getElementById('btnExcelIdle').onclick = () => exportarExcel(datosIdleGlobal, "Reporte_Ralenti_Zonas");

            if (typeof callback === 'function') callback();
        },
        focus: function () { document.getElementById('btnUpdateMain').click(); }
    };
};