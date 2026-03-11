// ... (Mantener funciones obtenerDatos y exportarExcel de v1.0.8)

    // --- UI: DIBUJAR TABLA PREMIUM ---
    const dibujarTabla = (datos) => {
        const cuerpo = document.getElementById('tablaCuerpo');
        cuerpo.innerHTML = '';
        
        // Mostramos el top 20 en la tabla para dar más contexto
        datos.slice(0, 20).forEach(d => {
            const total = d.kmEnVacio + d.kmConCarga;
            const ef = total > 0 ? ((d.kmConCarga / total) * 100).toFixed(1) : 0;
            
            // Color de la barra: rojo si es muy ineficiente (<30%), verde si es bueno
            const colorBarra = ef < 40 ? '#e74c3c' : (ef < 70 ? '#f1c40f' : '#008767');

            cuerpo.innerHTML += `
                <tr>
                    <td><strong>${d.nombre}</strong></td>
                    <td class="num">${Math.round(d.kmEnVacio).toLocaleString()} km</td>
                    <td class="num">${Math.round(d.kmConCarga).toLocaleString()} km</td>
                    <td class="num total-col">${Math.round(total).toLocaleString()} km</td>
                    <td>
                        <div class="ef-container">
                            <div class="ef-bar-bg">
                                <div class="ef-bar-fill" style="width: ${ef}%; background-color: ${colorBarra}"></div>
                            </div>
                            <span style="font-weight:bold; color:${colorBarra}">${ef}%</span>
                        </div>
                    </td>
                </tr>`;
        });
    };

// ... (Resto del código de inicialización de v1.0.8)