// ... al principio de tu app.js
geotab.addin.miDashboard = function (api, state) {
    
    // Mantenemos tus funciones obtenerDatosPeso y dibujarGrafico aquí arriba...

    return {
        // CORRECCIÓN AQUÍ:
        initialize: function (el, callback) {
            console.log("Inicializando Add-in...");
            
            // Es vital que el callback se ejecute inmediatamente 
            // para que Geotab quite la pantalla de carga.
            if (typeof callback === 'function') {
                callback();
            } else {
                console.warn("Callback no es una función");
            }
        },

        focus: function (api, state) {
            console.log("Cargando datos en Focus...");
            // Aquí es donde ejecutamos la lógica pesada
            const hoy = new Date().toISOString();
            const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            
            // Llamamos a tu función de datos
            obtenerDatosPeso(ayer, hoy);
        },

        blur: function () {
            console.log("Saliendo del dashboard");
        }
    };
};