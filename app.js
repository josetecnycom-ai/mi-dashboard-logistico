geotab.addin.miDashboard = function (api, state) {
    let chartVacioInst = null;
    let chartIdleInst = null;

    // --- CÁLCULO DE RALENTÍ ---
    const procesarRalenti = (viajes) => {
        let ralentiPorZona = {};
        const PRECIO_L = 1.45; 
        const CONSUMO_H = 2.5;

        viajes.forEach(v => {
            if (v.idlingDuration) {
                // Obtenemos nombre de zona si existe
                let zona = (v.stopPoint && v.stopPoint.zones && v.stopPoint.zones.length > 0) 
                    ? v.stopPoint.zones[0].name 
                    : "Fuera de Zona / Cliente";
                
                // Duración en horas (Geotab suele enviar TimeSpan como string o segundos)
                let horas = v.idlingDuration.totalSeconds ? (v.idlingDuration.totalSeconds / 3600) : 0;
                if (!ralentiPorZona[zona]) ralentiPorZona[zona] = 0;
                ralentiPorZona[zona] += horas;
            }
        });

        let datos = Object.keys(ralentiPorZona)
            .map(z => ({ zona: z, horas: ralentiPorZona[z] }))
            .sort((a, b) => b.horas - a.horas).slice(0, 5);

        dibujarGraficoIdle(datos);
        dibujarTablaIdle(datos, PRECIO_L, CONSUMO_H);
    };

    const dibujarGraficoIdle = (datos) => {
        const ctx = document.getElementById('chartIdle').getContext('2d');
        if (chartIdleInst) chartIdleInst.destroy();
        chartIdleInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: datos.map(d => d.zona),
                datasets: [{ data: datos.map(d => d.horas.toFixed(2)), backgroundColor: ['#e67e22','#d35400','#f39c12','#e74c3c','#95a5a6'] }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    };

    const dibujarTablaIdle = (datos, precio, consumo) => {
        const cuerpo = document.getElementById('idleTablaCuerpo');
        cuerpo.innerHTML = datos.map(d => `
            <tr>
                <td><strong>${d.zona}</strong></td>
                <td class="num">${d.horas.toFixed(2)} h</td>
                <td class="num" style="color:#c0392b; font-weight:bold;">${(d.horas * consumo * precio).toFixed(2)} €</td>
            </tr>`).join('');
    };

    // --- MÉTODOS DE CARGA (KM Y EFICIENCIA) ---
    // (Se mantienen las funciones obtenerDatos, dibujarGrafico y dibujarTabla de la v1.0.10)

    return {
        initialize: function (api, state, callback) {
            const hoy = new Date().toISOString().split('T')[0];
            ['vacioTo', 'tablaTo', 'idleTo'].forEach(id => document.getElementById(id).value = hoy);
            
            const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
            const inicio = hace30.toISOString().split('T')[0];
            ['vacioFrom', 'tablaFrom', 'idleFrom'].forEach(id => document.getElementById(id).value = inicio);

            // Listeners
            document.getElementById('idleUpdate').onclick = () => {
                const fromDate = document.getElementById('idleFrom').value + "T00:00:00.000Z";
                const toDate = document.getElementById('idleTo').value + "T23:59:59.000Z";
                api.call("Get", { typeName: "Trip", search: { fromDate, toDate } }, (v) => procesarRalenti(v));
            };

            // ... Añadir aquí los otros listeners de vacioUpdate y tablaUpdate ...

            if (typeof callback === 'function') callback();
        },
        focus: function () { 
            document.getElementById('idleUpdate').click();
            // ... Otros clicks automáticos ...
        }
    };
};