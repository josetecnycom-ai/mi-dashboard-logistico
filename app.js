geotab.addin.miDashboard = function (api, state) {
    let chartVacioInst = null, chartIdleInst = null;
    let datosKmGlobal = [], datosIdleGlobal = [];

    const PRECIO_LITRO = 1.45; 
    const CONSUMO_RALENTI = 2.5; 

    const showLoader = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';
    const updateStatus = (msg) => document.getElementById('global-status').innerText = msg;
    
    const exportarExcel = (datos, nombre) => {
        if (datos.length === 0) return alert("No hay datos para exportar. Ejecuta el análisis primero.");
        const ws = XLSX.utils.json_to_sheet(datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${nombre}.xlsx`);
    };

    // Parser blindado para tiempos de Geotab (puede venir en string "hh:mm:ss", "d.hh:mm:ss", o en ticks)
    const parseTimeSpan = (ts) => {
        if (!ts) return 0;
        if (typeof ts === 'number') return ts; 
        if (ts.totalSeconds) return ts.totalSeconds; 
        if (typeof ts === 'string') {
            let parts = ts.split(':');
            if (parts.length === 3) {
                let hours = 0, days = 0;
                if (parts[0].includes('.')) {
                    let hp = parts[0].split('.');
                    days = parseInt(hp[0]) || 0;
                    hours = parseInt(hp[1]) || 0;
                } else {
                    hours = parseInt(parts[0]) || 0;
                }
                let mins = parseInt(parts[1]) || 0;
                let secs = parseFloat(parts[2]) || 0;
                return (days * 86400) + (hours * 3600) + (mins * 60) + secs;
            }
        }
        return 0;
    };

    // --- PASO 1: KILÓMETROS Y PESOS ---
    const cargarKM = (fromDate, toDate, callback) => {
        showLoader('loader-km', true);
        updateStatus("Calculando KM y Pesos...");

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
            if(callback) callback(viajes); // Pasamos los viajes al paso 2 para no volver a descargarlos
        }, (e) => { console.error(e); showLoader('loader-km', false); updateStatus("Error en KM"); });
    };

    // --- PASO 2: RALENTÍ CON REVERSE GEOCODING ---
    const cargarIdle = (viajes) => {
        showLoader('loader-idle', true);
        updateStatus("Traduciendo coordenadas GPS a Zonas...");

        let idleTrips = viajes.filter(v => {
            let s = parseTimeSpan(v.idlingDuration);
            v._idlingSecs = s;
            return s > 0 && v.stopPoint;
        });

        if (idleTrips.length === 0) {
            renderIdle([]);
            showLoader('loader-idle', false);
            updateStatus("Análisis completado (Sin Ralentí).");
            return;
        }

        // Agrupar coordenadas para preguntar a Geotab en bloque
        let coordsMap = new Map();
        idleTrips.forEach(v => {
            let key = v.stopPoint.x.toFixed(4) + "," + v.stopPoint.y.toFixed(4);
            v._coordKey = key;
            if (!coordsMap.has(key)) coordsMap.set(key, { x: v.stopPoint.x, y: v.stopPoint.y });
        });

        let uniqueCoords = Array.from(coordsMap.values());
        let addressCalls = [];
        
        // MyGeotab permite consultar de a muchos. Hacemos bloques de 400.
        for (let i = 0; i < uniqueCoords.length; i += 400) {
            addressCalls.push(["GetAddresses", { coordinates: uniqueCoords.slice(i, i + 400) }]);
        }

        api.multiCall(addressCalls, (responses) => {
            let flatResponses = [];
            responses.forEach(r => { if (Array.isArray(r)) flatResponses = flatResponses.concat(r); });
            
            let resolvedZones = new Map();
            Array.from(coordsMap.keys()).forEach((key, index) => {
                let addr = flatResponses[index];
                let locationName = "Desconocido";
                
                if (addr) {
                    if (addr.zones && addr.zones.length > 0) {
                        locationName = "[ZONA] " + addr.zones[0].name;
                    } else if (addr.formattedAddress) {
                        // LA MEJORA: Si no hay zona, te dice la calle exacta.
                        locationName = addr.formattedAddress.split(',')[0]; 
                    } else {
                        locationName = "Lat: " + coordsMap.get(key).y.toFixed(3);
                    }
                }
                resolvedZones.set(key, locationName);
            });

            let resultadosIdle = {};
            idleTrips.forEach(v => {
                let loc = resolvedZones.get(v._coordKey) || "Desconocido";
                resultadosIdle[loc] = (resultadosIdle[loc] || 0) + (v._idlingSecs / 3600);
            });

            datosIdleGlobal = Object.keys(resultadosIdle).map(loc => ({ 
                Ubicacion: loc, 
                Horas: resultadosIdle[loc].toFixed(2), 
                Costo: (resultadosIdle[loc] * CONSUMO_RALENTI * PRECIO_LITRO).toFixed(2) + "€" 
            })).sort((a,b) => parseFloat(b.Horas) - parseFloat(a.Horas));
            
            renderIdle(datosIdleGlobal);
            showLoader('loader-idle', false);
            updateStatus("¡Análisis Completado!");

        }, (e) => {
            console.error(e);
            showLoader('loader-idle', false);
            updateStatus("Error traduciendo zonas.");
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
        document.getElementById('tablaCuerpo').innerHTML = datos.slice(0,15).map(d => `<tr><td><strong>${d.Vehiculo}</strong></td><td class="num">${d.kmVacio}</td><td>${d.Eficiencia}</td></tr>`).join('');
    };

    const renderIdle = (datos) => {
        const ctx = document.getElementById('chartIdle').getContext('2d');
        if (chartIdleInst) chartIdleInst.destroy();
        chartIdleInst = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: datos.slice(0,5).map(d => d.Ubicacion), datasets: [{ data: datos.slice(0,5).map(d => parseFloat(d.Horas)), backgroundColor: ['#e67e22','#d35400','#f39c12','#e74c3c','#95a5a6'] }] },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
        document.getElementById('idleTablaCuerpo').innerHTML = datos.slice(0,15).map(d => `<tr><td><strong>${d.Ubicacion}</strong></td><td class="num">${d.Horas}h</td><td class="num" style="color:#c0392b; font-weight:bold;">${d.Costo}</td></tr>`).join('');
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
                
                // Carga Secuencial: KM primero, y le pasa los viajes a Idle para ahorrar tiempo
                cargarKM(f, t, (viajes) => cargarIdle(viajes));
            };
            
            document.getElementById('btnExcelKm').onclick = () => exportarExcel(datosKmGlobal, "Reporte_KM_Eficiencia");
            document.getElementById('btnExcelIdle').onclick = () => exportarExcel(datosIdleGlobal, "Reporte_Ralenti_Ubicacion");

            if (typeof callback === 'function') callback();
        },
        focus: function () { document.getElementById('btnUpdateMain').click(); }
    };
};