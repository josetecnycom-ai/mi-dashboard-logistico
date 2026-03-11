geotab.addin.miDashboard = function (api, state) {
    let chartVacioInst = null;
    let chartIdleInst = null;

    const showLoader = (id, show) => {
        document.getElementById(id).style.display = show ? 'flex' : 'none';
    };

    const updateStatus = (msg) => {
        document.getElementById('global-status').innerText = msg;
    };

    // --- PASO 1: KM Y EFICIENCIA ---
    const cargarKilometrosYEficiencia = (fromDate, toDate, next) => {
        showLoader('loader-km', true);
        updateStatus("Paso 1/2: Obteniendo KM y Pesos...");

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
                    let p = pesosV.filter(p => new Date(p.dateTime) <= new Date(v.stop)).pop();
                    if (p && (p.data / 1000) >= 20000) kmCarga += v.distance;
                    else kmVacio += v.distance;
                });
                return { nombre: d.name, kmV: kmVacio, kmC: kmCarga };
            }).filter(s => (s.kmV + s.kmC) > 0).sort((a,b) => b.kmV - a.kmV);

            renderModuloKM(stats);
            showLoader('loader-km', false);
            next(); // Llama al siguiente paso
        }, (e) => { console.error(e); showLoader('loader-km', false); });
    };

    // --- PASO 2: RALENTÍ ---
    const cargarRalenti = (fromDate, toDate) => {
        showLoader('loader-idle', true);
        updateStatus("Paso 2/2: Analizando Ralentí por Zona...");

        api.call("Get", {
            typeName: "Trip",
            search: { fromDate, toDate }
        }, (viajes) => {
            let ralenti = {};
            viajes.forEach(v => {
                if (v.idlingDuration) {
                    let zona = (v.stopPoint && v.stopPoint.zones && v.stopPoint.zones.length > 0) ? v.stopPoint.zones[0].name : "Sin Zona Definida";
                    let horas = v.idlingDuration.totalSeconds ? (v.idlingDuration.totalSeconds / 3600) : 0;
                    ralenti[zona] = (ralenti[zona] || 0) + horas;
                }
            });

            let datos = Object.keys(ralenti).map(z => ({ zona: z, horas: ralenti[z] }))
                .sort((a,b) => b.horas - a.horas).slice(0, 5);

            renderModuloIdle(datos);
            showLoader('loader-idle', false);
            updateStatus("¡Dashboard Actualizado!");
        }, (e) => { console.error(e); showLoader('loader-idle', false); });
    };

    // --- RENDERIZADO ---
    const renderModuloKM = (datos) => {
        const ctx = document.getElementById('chartVacio').getContext('2d');
        if (chartVacioInst) chartVacioInst.destroy();
        const top10 = datos.slice(0, 10);
        chartVacioInst = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(d => d.nombre),
                datasets: [
                    { label: 'KM Vacío', data: top10.map(d => Math.round(d.kmV)), backgroundColor: '#e74c3c' },
                    { label: 'KM Carga', data: top10.map(d => Math.round(d.kmC)), backgroundColor: '#2ecc71' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
        });

        document.getElementById('tablaCuerpo').innerHTML = datos.slice(0, 15).map(d => {
            let ef = ((d.kmC / (d.kmV + d.kmC)) * 100).toFixed(1);
            return `<tr><td>${d.nombre}</td><td class="num">${Math.round(d.kmV)}</td><td>${ef}%</td></tr>`;
        }).join('');
    };

    const renderModuloIdle = (datos) => {
        const ctx = document.getElementById('chartIdle').getContext('2d');
        if (chartIdleInst) chartIdleInst.destroy();
        chartIdleInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: datos.map(d => d.zona),
                datasets: [{ data: datos.map(d => d.horas.toFixed(2)), backgroundColor: ['#e67e22','#d35400','#f39c12','#e74c3c','#95a5a6'] }]
            },
            options: { maintainAspectRatio: false }
        });

        document.getElementById('idleTablaCuerpo').innerHTML = datos.map(d => `
            <tr><td>${d.zona}</td><td class="num">${d.horas.toFixed(2)}h</td><td class="num">${(d.horas * 2.5 * 1.45).toFixed(2)}€</td></tr>
        `).join('');
    };

    const iniciarCargaSecuencial = () => {
        const fromDate = document.getElementById('dateFrom').value + "T00:00:00.000Z";
        const toDate = document.getElementById('dateTo').value + "T23:59:59.000Z";
        
        // Ejecución en cadena
        cargarKilometrosYEficiencia(fromDate, toDate, () => {
            cargarRalenti(fromDate, toDate);
        });
    };

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date().toISOString().split('T')[0];
            const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
            
            document.getElementById('dateTo').value = hoy;
            document.getElementById('dateFrom').value = hace30.toISOString().split('T')[0];
            document.getElementById('btnUpdateMain').onclick = iniciarCargaSecuencial;

            if (typeof callback === 'function') callback();
        },
        focus: function () { iniciarCargaSecuencial(); }
    };
};