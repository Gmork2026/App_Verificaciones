// ====================================================================================================
// 1. DATA Y CONFIGURACIÓN CRÍTICA
// ====================================================================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbzDjq01yI157yqVUnRddgOrZS0Y7i2Vsdq23CD39lqoF6cHTNDiFYerxYRqXo2vE2Uysw/exec';

let currentSheet = "Verificacion de Baterias/Patrullas";
let sheetData = [];
let repeatedChecksAnalysis = {}; 
let activeSupervisorEmail = null; 

// NUEVO: Variables Globales para Paginación
let currentFilteredData = []; 
let currentPage = 1;
const itemsPerPage = 30; // 👈 Límite de resultados por página

// Referencias del DOM
const dataContainer = document.getElementById('dataContainer');
const searchInput = document.getElementById('searchInput');
const alertFilter = document.getElementById('alertFilter');
const dateFilter = document.getElementById('dateFilter'); 
const countDisplay = document.getElementById('countDisplay');
const detailsModal = document.getElementById('detailsModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.querySelector('.close-button');
const tabButtons = document.querySelectorAll('.tab-button');
const supervisorSummary = document.getElementById('supervisorSummary');
const recorridoContainer = document.getElementById('recorridoContainer');
const recorridoInstructions = document.getElementById('recorridoInstructions');
const resultsTitle = document.getElementById('resultsTitle');
const recorridoDateSelector = document.getElementById('recorridoDateSelector');
const summarySection = document.querySelector('.summary-section'); 
const dataDisplaySection = document.querySelector('.data-display'); 
const repetitionAnalysisContainer = document.getElementById('repetitionAnalysisContainer'); 
const filterBar = document.querySelector('.filter-bar'); 


// ====================================================================================================
// 1.5. DATA Y LÓGICA DE ANÁLISIS DE REPETICIONES
// ====================================================================================================

const analyzeRepeatedChecks = (allRecorridoData) => {
    const repeatsByDate = {}; 

    Object.keys(allRecorridoData).forEach(emailSupervisor => {
        const checkData = allRecorridoData[emailSupervisor];

        Object.keys(checkData).forEach(dayISO => {
            if (!repeatsByDate[dayISO]) repeatsByDate[dayISO] = {};

            checkData[dayISO].forEach(check => {
                const objective = check.patrullaNombre;
                if (!objective) return;

                if (!repeatsByDate[dayISO][objective]) {
                    repeatsByDate[dayISO][objective] = new Set();
                }
                repeatsByDate[dayISO][objective].add(emailSupervisor);
            });
        });
    });

    const finalRepeats = {};
    Object.keys(repeatsByDate).forEach(dayISO => {
        const dayRepeats = {};
        Object.keys(repeatsByDate[dayISO]).forEach(objective => {
            const supervisors = Array.from(repeatsByDate[dayISO][objective]);

            if (supervisors.length > 1) {
                dayRepeats[objective] = supervisors.map(email => email.split('@')[0]);
            }
        });

        if (Object.keys(dayRepeats).length > 0) finalRepeats[dayISO] = dayRepeats;
    });

    return finalRepeats;
};

const renderRepetitionAnalysis = (analysisData) => {
    const container = repetitionAnalysisContainer;
    const resultsDiv = document.getElementById('repetitionResults');
    const countSpan = document.getElementById('repetitionCount');
    const toggleButton = document.getElementById('toggleRepetitionsBtn');

    if (!container || !resultsDiv) return;

    const daysWithRepeats = Object.keys(analysisData).length;
    countSpan.textContent = daysWithRepeats;

    if (daysWithRepeats === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    let detailsHtml = '<div id="repetitionDetails" style="display: none;">';

    Object.keys(analysisData).sort().reverse().forEach(dayISO => {
        const objectives = analysisData[dayISO];
        const dateDisplay = new Date(dayISO + 'T00:00:00').toLocaleDateString();

        detailsHtml += `<div class="card p-2 mt-2">
            <h6>📅 ${dateDisplay} (${Object.keys(objectives).length} objetivos repetidos)</h6>
            <ul class="list-group list-group-flush mt-1">`;

        Object.keys(objectives).forEach(objective => {
            const supervisors = objectives[objective].join(', ');
            detailsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center text-danger list-group-item-danger">
                <span>📍 <strong>${objective}</strong></span>
                <span class="badge bg-danger text-white">Supervisores: ${supervisors}</span>
            </li>`;
        });

        detailsHtml += `</ul></div>`;
    });

    detailsHtml += '</div>';
    resultsDiv.innerHTML = detailsHtml;

    if (toggleButton) toggleButton.textContent = 'Ver Detalles';
};

window.toggleRepetitionDetails = () => {
    const details = document.getElementById('repetitionDetails');
    const button = document.getElementById('toggleRepetitionsBtn');

    if (!details || !button) return;

    const isVisible = details.style.display !== 'none';
    details.style.display = isVisible ? 'none' : 'block';
    button.textContent = isVisible ? 'Ver Detalles' : 'Ocultar Detalles';
};


// ====================================================================================================
// 2. FUNCIONES DE CARGA Y ORDENAMIENTO
// ====================================================================================================

const getDateSortValue = (timestampString) => {
    if (!timestampString) return 0;

    const [datePartWithSpaces, timePartWithSpaces] = timestampString.split(', ');
    let datePart = datePartWithSpaces ? datePartWithSpaces.trim() : null;
    let timePart = timePartWithSpaces ? timePartWithSpaces.trim() : null;

    if (!datePart || !timePart) {
        const parts = timestampString.trim().split(' ');
        if (parts.length >= 2) {
            timePart = parts.pop();
            datePart = parts.join(' ');
        } else {
            return 0;
        }
    }

    const dateParts = datePart.split('/');
    if (dateParts.length !== 3) return 0;

    const day = parseInt(dateParts[0]);
    const monthIndex = parseInt(dateParts[1]) - 1;
    const year = parseInt(dateParts[2]);

    const timeElements = timePart.split(' ');
    const hms = timeElements[0];
    const ampm = timeElements.length > 1 ? timeElements[1] : '';

    const [rawHour, minute, second] = hms.split(':').map(n => parseInt(n));
    if (isNaN(rawHour) || isNaN(minute) || isNaN(second)) return 0;

    let hour = rawHour;

    if (ampm && ampm.toLowerCase() === 'p.m.' && hour !== 12) hour += 12;
    else if (ampm && ampm.toLowerCase() === 'a.m.' && hour === 12) hour = 0;

    const dateObj = new Date(year, monthIndex, day, hour, minute, second);
    return isNaN(dateObj.getTime()) ? 0 : dateObj.getTime();
};

const loadData = async (sheetName) => {
    currentSheet = sheetName;
    const isRecorridoTab = sheetName === "Recorridos_Consolidados";
    const isCambioTurno = sheetName === "Cambio de Turno";

    if (summarySection) {
        const newDisplay = isRecorridoTab ? 'flex' : 'none';
        summarySection.style.display = newDisplay;
    
        if (isRecorridoTab) {
            const flexDir = (window.innerWidth > 900) ? 'row' : 'column';
            summarySection.style.flexDirection = flexDir; 
        }

        if (isCambioTurno) {
            if (searchInput) searchInput.style.display = 'block'; 
            if (alertFilter) alertFilter.style.display = 'none';   
            if (dateFilter) dateFilter.style.display = 'block'; 
            if (filterBar) filterBar.style.display = 'flex';

            if (dataContainer) {
                dataContainer.innerHTML = `<p class="loading-message">Cargando registros de Cambio de Turno...</p>`;
            }
        }
    }
    
    if (dataDisplaySection) {
        dataDisplaySection.style.display = isRecorridoTab ? 'none' : 'block';
    }

    if (searchInput) searchInput.style.display = isRecorridoTab ? 'none' : 'block';
    if (alertFilter) alertFilter.style.display = isRecorridoTab ? 'none' : 'block';
    if (dateFilter) dateFilter.style.display = isRecorridoTab ? 'none' : 'block'; 
    if (filterBar) filterBar.style.display = isRecorridoTab ? 'none' : 'flex'; 

    if (dataContainer) {
        dataContainer.innerHTML = `<p class="loading-message">Cargando datos de **${sheetName}**, por favor espere...</p>`;
    }
    if (supervisorSummary) {
        if (isRecorridoTab) {
            supervisorSummary.innerHTML = '<h4>Supervisores y Cantidad de Chequeos Consolidados:</h4><p>Cargando sumario...</p>';
        } else {
             if (recorridoContainer) recorridoContainer.innerHTML = '';
             if (recorridoInstructions) recorridoInstructions.textContent = 'Selecciona un supervisor para ver su recorrido.';
             if (repetitionAnalysisContainer) repetitionAnalysisContainer.style.display = 'none'; 
        }
    }

    const fullUrl = `${API_URL}?sheet=${encodeURIComponent(sheetName)}`;

    try {
        const response = await fetch(fullUrl);
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        sheetData = data;

        // Ordenamiento global de más reciente a más antiguo
        sheetData.sort((a, b) => {
            const sortValueA = getDateSortValue(a.timestamp);
            const sortValueB = getDateSortValue(b.timestamp);
            return sortValueB - sortValueA;
        });

        if (!isRecorridoTab) {
            if (!isCambioTurno) {
                sheetData = checkInactivity(sheetData);
            }
            window.filterAndSearch();

        } else {
            const allRecorridoData = updateSummaryData(sheetData);
            repeatedChecksAnalysis = analyzeRepeatedChecks(allRecorridoData);
            renderRepetitionAnalysis(repeatedChecksAnalysis);

            if (recorridoInstructions) recorridoInstructions.textContent = 'Selecciona un supervisor para ver su recorrido.';
            if (recorridoContainer) recorridoContainer.innerHTML = '';
            activeSupervisorEmail = null;
        }

    } catch (error) {
        console.error("Fallo al obtener los datos:", error);
        if (dataContainer) {
             dataContainer.innerHTML = `<p class="text-danger">❌ **Error de Conexión/Datos:** Verifique la URL de la API y el formato de los datos. Error: ${error.message}</p>`;
        }
        if (countDisplay) countDisplay.textContent = 0;
        if (supervisorSummary && isRecorridoTab) {
             supervisorSummary.innerHTML = `<p class="text-danger">Error: No se pudo cargar el sumario.</p>`;
        }
    }
};

// ====================================================================================================
// 3. LÓGICA DE NEGOCIO Y ALERTAS
// ====================================================================================================

const checkCombustible = (fraccion) => {
    if (fraccion === 'N/A' || !fraccion) return { valor: 100, alerta: false };
    const parts = fraccion.split('/');
    if (parts.length !== 2) return { valor: 100, alerta: false };

    const [num, den] = parts.map(n => parseInt(n.trim()));
    if (den === 0 || isNaN(num) || isNaN(den)) return { valor: 100, alerta: false };

    const valor = (num / den) * 100;
    return { valor: valor, alerta: valor <= (6/16 * 100) };
};

const isNegative = (value) => {
    if (!value) return false;
    const lowerValue = value.toString().toLowerCase().trim();
    return lowerValue === 'no' || lowerValue === 'regular' || lowerValue === 'mala';
};

const getBasesAlertDetails = (item) => {
    const faltas = [];
    const baseCheckFields = [
        { label: "Higiene de la Base", key: "higieneMovil" },
        { label: "Posee Botiquín", key: "poseeBotiquin" },
        { label: "Posee Auxilio", key: "poseeAuxilio" },
        { label: "Posee Matafuegos en vigencia", key: "poseeMatafuegos" },
        { label: "Posee Baliza", key: "poseeBaliza" },
        { label: "Posee Linterna", key: "poseeLinterna" },
        { label: "Posee Cable para puentear bateria", key: "poseeCableBateria" },
        { label: "Posee Capa de lluvia", key: "poseeCapaLluvia" },
        { label: "Posee toda la documentacion del movil", key: "poseeDocumentacionMovil" },
        { label: "Posee Linga", key: "poseeLinga" },
        { label: "Posee Cricket", key: "poseeCricket" },
        { label: "Posee Llave Cruz", key: "poseeLlaveCruz" },
    ];
    baseCheckFields.forEach(field => {
        const fieldValue = item[field.key];
        if (isNegative(fieldValue)) {
            const displayValue = fieldValue.toUpperCase();
            faltas.push(`${field.label}: ${displayValue}`);
        }
    });
    return faltas;
};

const hasAlert = (item) => {
    const isRecorridoCheck = currentSheet === "Recorridos_Consolidados";
    const sheetToCheck = isRecorridoCheck ? (item.HojaOrigen || currentSheet) : currentSheet;

    const checkMovil = sheetToCheck !== "Verificacion de objetivos MAC";
    const isBaseCheck = sheetToCheck === "verificacion de bases";

    if (isBaseCheck && getBasesAlertDetails(item).length > 0) return true;

    if (checkMovil) {
        if (item.combustibleFraccion && checkCombustible(item.combustibleFraccion).alerta) return true;
        if (isNegative(item.poseeBotiquin)) return true;
        if (isNegative(item.higieneMovil)) return true;
    }

    if (item.vigiladores && item.vigiladores.length > 0) {
        const vigiladorAlerta = item.vigiladores.some(v =>
            isNegative(v.uniformeCompleto) || isNegative(v.regControlado)
        );
        if (vigiladorAlerta) return true;
    }

    return false;
};

const checkInactivity = (data) => {
    if (data.length === 0) return data;

    const lastReports = {};
    data.forEach((item) => {
        const key = item.patrullaNombre;
        const sortValue = item.timestamp ? getDateSortValue(item.timestamp) : 0;

        if (!lastReports[key] || lastReports[key].sortValue < sortValue) {
            lastReports[key] = { sortValue: sortValue, timestamp: item.timestamp };
        }
    });

    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    return data.map((item) => {
        const key = item.patrullaNombre;
        const lastReport = lastReports[key];
        const lastReportDateMilli = lastReport ? lastReport.sortValue : 0;
        const hasPassedThreshold = lastReportDateMilli === 0 || (now - lastReportDateMilli) > twentyFourHours;
        const isLatestReport = item.timestamp && getDateSortValue(item.timestamp) === lastReport.sortValue;

        item.inactividadAlerta = isLatestReport && hasPassedThreshold;
        return item;
    });
};

const updateSummaryData = (data) => {
    const supervisorCounts = {};
    const allRecorridoData = {}; 

    data.forEach(item => {
        const email = item.emailSupervisor;
        if (email && email.trim() !== '') {
            const key = email.trim().toLowerCase();
            const sortValue = getDateSortValue(item.timestamp);

            if (!supervisorCounts[key]) supervisorCounts[key] = { count: 0, lastCheck: item.timestamp };
            supervisorCounts[key].count++;

            if (sortValue > getDateSortValue(supervisorCounts[key].lastCheck)) {
                 supervisorCounts[key].lastCheck = item.timestamp;
            }

            if (sortValue !== 0) {
                const dateObj = new Date(sortValue);
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                const dayKey = `${year}-${month}-${day}`;

                if (!allRecorridoData[key]) allRecorridoData[key] = {};
                if (!allRecorridoData[key][dayKey]) allRecorridoData[key][dayKey] = [];
                allRecorridoData[key][dayKey].push(item);
            }
        }
    });

    let html = '<h4>Supervisores y Cantidad de Chequeos Consolidados:</h4>';
    const sortedSupervisors = Object.entries(supervisorCounts).sort(([, a], [, b]) => b.count - a.count);

    if (sortedSupervisors.length === 0) {
        html += '<p class="text-info">No se encontraron chequeos para supervisores.</p>';
        if (supervisorSummary) supervisorSummary.innerHTML = html;
        if (recorridoContainer) recorridoContainer.innerHTML = '';
        if (recorridoInstructions) recorridoInstructions.textContent = 'No hay datos para mostrar.';
        return allRecorridoData;
    }

    html += '<ul class="supervisor-list">';
    sortedSupervisors.forEach(([email, details]) => {
        const name = email.split('@')[0];
        const lastDateDisplay = details.lastCheck ? details.lastCheck.split(',')[0].trim() : 'N/A';
        const isAlert = data.filter(item => item.emailSupervisor && item.emailSupervisor.toLowerCase() === email && hasAlert(item)).length > 0;

        html += `
             <li data-email="${email}" onclick="window.showSupervisorRecorrido('${email}')"
                 title="Ver recorrido de ${name}"
                 class="${isAlert ? 'list-alert' : ''}">
                 <strong>${name} ${isAlert ? '🚨' : ''}</strong>
                 <span>Chequeos: ${details.count}</span>
                 <span class="small-text">Último: ${lastDateDisplay}</span>
             </li>
          `;
    });

    html += '</ul>';
    if (supervisorSummary) supervisorSummary.innerHTML = html;

    return allRecorridoData;
};


// ====================================================================================================
// 4. LÓGICA DE RECORRIDO Y FILTRO DE FECHA
// ====================================================================================================

const groupRecorridoByDay = (data) => {
    const dailyRecorrido = {};

    data.forEach(item => {
        const sortValue = getDateSortValue(item.timestamp);
        if (sortValue === 0) return;

        const dateObj = new Date(sortValue);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dayKey = `${year}-${month}-${day}`;

        if (!dailyRecorrido[dayKey]) dailyRecorrido[dayKey] = [];
        dailyRecorrido[dayKey].push(item);
    });

    for (const day in dailyRecorrido) {
        dailyRecorrido[day].sort((a, b) => {
            const timeA = getDateSortValue(a.timestamp);
            const timeB = getDateSortValue(b.timestamp);
            return timeA - timeB; 
        });
    }

    return dailyRecorrido;
};

const getDisplayLocation = (check, sheet) => {
    const locationName = check.patrullaNombre || 'Ubicación Desconocida';
    const movilDominio = check.movilDominio || '';

    if (sheet === "Recorridos_Consolidados") {
        const sheetSource = check.HojaOrigen || 'N/A';
        const typeMap = {
             "Verificacion de Baterias/Patrullas": "B/P",
             "Verificacion de objetivos MAC": "MAC",
             "Verificacion de sitios Aysa": "AYSA",
             "verificacion de bases": "BASE",
        };
        const typeDisplay = typeMap[sheetSource] || sheetSource.replace('Verificacion de ', '').replace('verificacion de ', '');
        return `${locationName} (${typeDisplay})`;
    }

    return `${locationName} - ${movilDominio || 'Puesto Fijo'}`;
};

const renderRecorridoForDate = (dayISO, supervisorName, dailyRecorrido) => {
    if (!recorridoContainer) return;

    const checks = dailyRecorrido[dayISO];
    const availableDays = Object.keys(dailyRecorrido).sort().reverse();

    if (!checks || checks.length === 0) {
        let availableDaysHtml = availableDays.length > 0
            ? `<p><strong>Días con chequeos:</strong> ${availableDays.map(d => {
                     const dateParts = d.split('-'); 
                     return `${dateParts[2]}/${dateParts[1]}`; 
                }).join(', ')}</p>`
            : `<p>Este supervisor no tiene chequeos registrados.</p>`;

        recorridoContainer.innerHTML = `<div class="card p-3 text-center">
                                             <h4>No hay chequeos registrados el ${new Date(dayISO).toLocaleDateString()}</h4>
                                             <p>Selecciona otra fecha o supervisor.</p>
                                             ${availableDaysHtml}
                                         </div>`;
        return;
    }

    let html = '';
    const dayCheck = checks[0].timestamp ? checks[0].timestamp.split(',')[0].trim() : new Date(dayISO).toLocaleDateString();

    html += `<div class="card recorrido-day-card">
                 <div class="card-header">Día: <strong>${dayCheck}</strong> (${checks.length} Chequeos)</div>
                 <ul class="list-group list-group-flush recorrido-timeline">`;

    checks.forEach((check) => {
        const timePart = check.timestamp ? check.timestamp.split(',')[1].trim() : 'N/A';
        const isAlert = hasAlert(check);
        const checkDataString = JSON.stringify(check);
        const displayLocation = getDisplayLocation(check, "Recorridos_Consolidados");

        html += `
             <li class="list-group-item recorrido-item ${isAlert ? 'item-alert' : ''}">
                 <div class="item-time">${timePart}</div>
                 <div class="item-details">
                     <span class="item-location"><strong>${displayLocation}</strong></span>
                 </div>
                 <button class="button-small recorrido-btn-detail"
                     data-check='${encodeURIComponent(checkDataString)}'
                     title="Ver detalle del chequeo">
                     ${isAlert ? '🚨 Ver Detalle' : '✅ Ver Detalle'}
                 </button>
             </li>
         `;
    });

    html += `</ul></div>`;
    recorridoContainer.innerHTML = html;
};

window.showSupervisorRecorrido = (emailSupervisor) => {
    if (!recorridoContainer || !recorridoInstructions || !recorridoDateSelector || currentSheet !== "Recorridos_Consolidados") return; 

    const allListItems = document.querySelectorAll('.supervisor-list li');
    allListItems.forEach(li => li.classList.remove('active-supervisor'));

    const clickedItem = document.querySelector(`.supervisor-list li[data-email="${emailSupervisor}"]`);
    if(clickedItem) clickedItem.classList.add('active-supervisor');

    activeSupervisorEmail = emailSupervisor;

    const supervisorData = sheetData.filter(item =>
        item.emailSupervisor && item.emailSupervisor.trim().toLowerCase() === emailSupervisor.trim().toLowerCase()
    );

    const supervisorName = emailSupervisor.includes('@') ? emailSupervisor.split('@')[0] : emailSupervisor;

    if (supervisorData.length === 0) {
        recorridoContainer.innerHTML = `<p class="text-danger">No se encontraron chequeos para ${supervisorName}.</p>`;
        recorridoInstructions.innerHTML = `Ruta de Chequeos de: <strong>${supervisorName}</strong>`;
        return;
    }

    const dailyRecorrido = groupRecorridoByDay(supervisorData);

    const availableDates = Object.keys(dailyRecorrido).sort().reverse(); 
    const latestDateISO = availableDates[0] || recorridoDateSelector.value;

    recorridoDateSelector.value = latestDateISO;
    recorridoDateSelector.dataset.activeSupervisor = emailSupervisor;
    recorridoDateSelector.dataset.dailyRecorrido = JSON.stringify(dailyRecorrido);

    renderRecorridoForDate(latestDateISO, supervisorName, dailyRecorrido);

    recorridoInstructions.innerHTML = `Ruta de Chequeos de: <strong>${supervisorName}</strong>`;
    recorridoContainer.scrollIntoView({ behavior: 'smooth' });
};


// ====================================================================================================
// 5. RENDERIZADO, BÚSQUEDA Y PAGINACIÓN (Globales)
// ====================================================================================================

window.filterAndSearch = () => {
    let filteredData = [...sheetData];

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const alertValue = alertFilter ? alertFilter.value : '';
    const dateValue = dateFilter ? dateFilter.value : ''; 

    // 1. Filtro de Alertas
    if (alertValue === 'alerts') {
        filteredData = filteredData.filter(item => hasAlert(item) || item.inactividadAlerta);
    }

    // 2. Filtro por Fecha Exacta
    if (dateValue) {
        const [year, month, day] = dateValue.split('-');
        const formattedDate = `${day}/${month}/${year}`;
        
        filteredData = filteredData.filter(item => {
            return item.timestamp && item.timestamp.includes(formattedDate);
        });
    }

    // 3. Filtro de Búsqueda de Texto
    if (searchTerm) {
        filteredData = filteredData.filter(item => {
            const supervisorMatch = item.emailSupervisor && item.emailSupervisor.toLowerCase().includes(searchTerm);
            const generalMatch = (item.timestamp && item.timestamp.toLowerCase().includes(searchTerm));
            const puestoMatch = item.patrullaNombre && item.patrullaNombre.toLowerCase().includes(searchTerm);
            const movilMatch = item.movilDominio && item.movilDominio.toLowerCase().includes(searchTerm);
            
            const vigiladorMatch = item.vigiladores && item.vigiladores.some(v =>
                (v.nombre && v.nombre.toLowerCase().includes(searchTerm)) ||
                (v.legajo && v.legajo.includes(searchTerm)) ||
                (v.capacitacion && v.capacitacion.toLowerCase().includes(searchTerm))
            );

            const patenteMatch = item.vehiculo && item.vehiculo.patente && item.vehiculo.patente.toLowerCase().includes(searchTerm);
            const conductorMatch = item.conductor && item.conductor.nombre && item.conductor.nombre.toLowerCase().includes(searchTerm);

            return generalMatch || puestoMatch || movilMatch || vigiladorMatch || supervisorMatch || patenteMatch || conductorMatch;
        });
    }

    // Guardamos los datos filtrados en la variable global y reiniciamos la página
    currentFilteredData = filteredData;
    currentPage = 1; 
    
    // Llamamos a la nueva función que solo dibuja 30 resultados
    window.renderCurrentPage();
};

window.renderCurrentPage = () => {
    if (!dataContainer) return;

    // Actualizamos los títulos globales para mostrar la cantidad TOTAL (no solo los 30 de la página)
    if (countDisplay) countDisplay.textContent = currentFilteredData.length;
    if (resultsTitle) {
        resultsTitle.textContent = currentSheet === "Cambio de Turno" 
            ? `Registros de Cambio de Turno (${currentFilteredData.length})`
            : `Resultados del Chequeo (${currentFilteredData.length})`;
    }

    // Calculamos qué parte del array debemos mostrar
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = currentFilteredData.slice(startIndex, endIndex);

    // Renderizamos según la pestaña o el dispositivo
    if (currentSheet === "Cambio de Turno") {
        renderCambioTurnoTable(paginatedData);
    } else {
        dataContainer.innerHTML = '';
        if (window.innerWidth > 900) {
            window.renderTable(paginatedData);
        } else {
            window.renderCards(paginatedData);
        }
    }

    // Dibujar los botones de paginación
    window.renderPagination();
};

window.renderPagination = () => {
    const paginationContainer = document.getElementById('paginationControls');
    if (!paginationContainer) return;

    const totalItems = currentFilteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    // Ocultar paginación si hay 30 o menos resultados en total
    if (totalItems <= itemsPerPage) {
        paginationContainer.innerHTML = ''; 
        return;
    }

    let html = `<div class="pagination-wrapper">`;
    html += `<button class="page-btn" onclick="window.changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Anterior</button>`;
    html += `<span class="page-info">Página ${currentPage} de ${totalPages}</span>`;
    html += `<button class="page-btn" onclick="window.changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>Siguiente &raquo;</button>`;
    html += `</div>`;
    
    paginationContainer.innerHTML = html;
};

window.changePage = (direction) => {
    const totalPages = Math.ceil(currentFilteredData.length / itemsPerPage);
    currentPage += direction;
    
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    window.renderCurrentPage();
    
    // Auto-scroll suave para volver al principio de los resultados
    document.querySelector('.data-display').scrollIntoView({ behavior: 'smooth' });
};

const getDynamicHeaders = () => {
    let principalHeader = '';
    switch (currentSheet) {
        case "Verificacion de objetivos MAC": principalHeader = 'Objetivo'; break;
        case "Verificacion de sitios Aysa": principalHeader = 'Sitio'; break;
        case "verificacion de bases": principalHeader = 'Base'; break;
        case "Verificacion de Baterias/Patrullas":
        default: principalHeader = 'Patrulla/Batería'; break;
    }

    const headers = [
        '🚨',
        principalHeader,
        'Móvil/Tipo',
        'Supervisor',
        'Fecha Chequeo',
        ...((currentSheet === "Verificacion de objetivos MAC" || currentSheet === "verificacion de bases" || currentSheet === "Verificacion de sitios Aysa") ? [''] : ['Combustible', 'Km']),
        'Vigiladores (U/R)',
        'Detalles'
    ];

    return headers.filter(h => h.trim() !== '');
};

window.renderTable = (dataToRender) => {
    if (!dataContainer) return;
    const headers = getDynamicHeaders();
    const isMovilCheck = currentSheet !== "Verificacion de objetivos MAC" && currentSheet !== "Verificacion de sitios Aysa";
    const isBaseCheck = currentSheet === "verificacion de bases";

    let tableHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    ${headers.map(h => `<th>${h}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    dataToRender.forEach((item, index) => {
        const isAlert = hasAlert(item);
        const isInactivityAlert = item.inactividadAlerta;

        let alertClass = '';
        if (isInactivityAlert) alertClass = 'inactivity-alert-row';
        else if (isAlert) alertClass = 'alert-row';

        const statusIcon = isInactivityAlert ? '🛑' : (isAlert ? '🚨' : '✅');

        let vigiladoresSummary = 'N/A';
        if (item.vigiladores && item.vigiladores.length > 0) {
            vigiladoresSummary = item.vigiladores.slice(0, 2).map(v => { 
                const namePart = (v.nombre && typeof v.nombre === 'string') ? v.nombre.split(' ')[0] : 'Vigilador';
                const regStatus = (v.regControlado && v.regControlado.length > 0) ? v.regControlado.substring(0,1) : '?';
                const uniStatus = (v.uniformeCompleto && v.uniformeCompleto.length > 0) ? v.uniformeCompleto.substring(0,1) : '?';
                return `${namePart} (${uniStatus}/${regStatus})`;
            }).join('<br>');
        }

        const combustibleDisplay = item.combustibleFraccion || 'N/A';
        const combustibleAlertClass = isMovilCheck && !isBaseCheck && item.combustibleFraccion && checkCombustible(item.combustibleFraccion).alerta ? 'text-danger' : '';
        const supervisorDisplay = (item.emailSupervisor && typeof item.emailSupervisor === 'string') ? item.emailSupervisor.split('@')[0] : 'N/A';
        const showMovilDetails = isMovilCheck && !isBaseCheck;
        const itemDataString = JSON.stringify(item);

        tableHTML += `
            <tr class="${alertClass}" data-index="${index}">
                <td>${statusIcon}</td>
                <td>${item.patrullaNombre || 'N/A'}</td>
                <td>${item.movilDominio || (isBaseCheck ? 'Base Fija' : 'Puesto Fijo')}</td>
                <td>${supervisorDisplay}</td>
                <td>${item.timestamp ? item.timestamp.split(',')[0] : 'N/A'}</td>
                ${showMovilDetails ? `<td class="${combustibleAlertClass}">${combustibleDisplay}</td>` : ''}
                ${showMovilDetails ? `<td>${item.kilometraje || 'N/A'}</td>` : ''}
                <td>${vigiladoresSummary}</td>
                <td>
                    <button class="view-details-btn button-small"
                            onclick="event.stopPropagation(); window.showDetailsModal(JSON.parse(decodeURIComponent('${encodeURIComponent(itemDataString)}')))">
                        Ver Detalle
                    </button>
                </td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    dataContainer.innerHTML = tableHTML;
};

window.renderCards = (dataToRender) => {
    if (!dataContainer) return;
    let cardsHTML = `<div class="card-grid">`;

    dataToRender.forEach((item, index) => {
        const isAlert = hasAlert(item);
        const isInactivityAlert = item.inactividadAlerta;
        const isRecorridoCheck = currentSheet === "Recorridos_Consolidados";
        const isBaseCheck = isRecorridoCheck ? (item.HojaOrigen === "verificacion de bases") : (currentSheet === "verificacion de bases");
        const isMovilCheck = isRecorridoCheck ? (item.HojaOrigen !== "Verificacion de objetivos MAC" && item.HojaOrigen !== "Verificacion de sitios Aysa") : (currentSheet !== "Verificacion de objetivos MAC" && currentSheet !== "Verificacion de sitios Aysa");

        let cardClass = '';
        let alertIconText = '✅ OK';

        if (isInactivityAlert) {
            cardClass = 'inactivity-alert-card';
            alertIconText = '🛑 INACTIVIDAD';
        } else if (isAlert) {
            cardClass = 'alert-card';
            alertIconText = '🚨 ALERTA';
        }

        const supervisorDisplay = (item.emailSupervisor && typeof item.emailSupervisor === 'string') ? item.emailSupervisor.split('@')[0] : 'N/A';

        let vigiladoresSummary = '';
        if (item.vigiladores && item.vigiladores.length > 0) {
            vigiladoresSummary = item.vigiladores.map(v => {
                const namePart = (v.nombre && typeof v.nombre === 'string') ? v.nombre.split(' ')[0] : 'Vigilador';
                const regStatus = (v.regControlado && v.regControlado.length > 0) ? v.regControlado.substring(0,1) : '?';
                const uniStatus = (v.uniformeCompleto && v.uniformeCompleto.length > 0) ? v.uniformeCompleto.substring(0,1) : '?';
                return `<li>${namePart} (U:${uniStatus}/R:${regStatus})</li>`;
            }).join('');
        } else {
            vigiladoresSummary = '<li>Sin Vigiladores Chequeados</li>';
        }

        const combustibleDisplay = item.combustibleFraccion || 'N/A';
        const itemDataString = JSON.stringify(item);

        cardsHTML += `
            <div class="data-card ${cardClass}" data-index="${index}">
                <div class="card-header">
                    <h4>${item.patrullaNombre || 'N/A'} - ${item.movilDominio || (isBaseCheck ? 'Base Fija' : 'Puesto Fijo')}</h4>
                    <span class="status-icon">${alertIconText}</span>
                </div>
                <p><strong>Fecha:</strong> ${item.timestamp ? item.timestamp.split(',')[0] : 'N/A'}</p>
                <p><strong>Supervisor:</strong> ${supervisorDisplay}</p>
                ${isMovilCheck && !isBaseCheck ? `<p><strong>Combustible:</strong> ${combustibleDisplay}</p>` : ''}
                <p><strong>Vigiladores:</strong> <ul>${vigiladoresSummary}</ul></p>
                <button class="view-details-btn button-full"
                        onclick="event.stopPropagation(); window.showDetailsModal(JSON.parse(decodeURIComponent('${encodeURIComponent(itemDataString)}')))">
                    Ver Detalles Completos
                </button>
            </div>
        `;
    });

    cardsHTML += `</div>`;
    dataContainer.innerHTML = cardsHTML;
};

window.showDetailsModal = (item) => {
    const isRecorridoCheck = currentSheet === "Recorridos_Consolidados";
    const sheetType = isRecorridoCheck ? (item.HojaOrigen || currentSheet) : currentSheet;

    if (currentSheet === "Cambio de Turno") {
        const estadoVehiculoModal = item.vehiculo.estado ? item.vehiculo.estado.toString().toLowerCase().trim() : '';
        const estadoClassModal = estadoVehiculoModal === 'bueno estado' ? 'text-success' : 'text-danger fw-bold';

        let html = `
            <h4>Detalles del Cambio de Turno</h4>
            <hr>
            <p><strong>Fecha/Hora del Registro:</strong> ${item.timestamp || '—'}</p>
            <p><strong>Conductor:</strong> ${item.conductor.nombre || '—'} (${item.conductor.legajo || '—'})</p>
            <p><strong>Turno Inicio:</strong> ${item.turno.inicio || '—'}</p>
            <p><strong>Turno Salida:</strong> ${item.turno.salida || '—'}</p>
            <p><strong>Patente del Vehículo:</strong> ${item.vehiculo.patente || '—'}</p>
            <p><strong>Estado del Vehículo:</strong> <span class="${estadoClassModal}">${item.vehiculo.estado || '—'}</span></p>
            <p><strong>Descripción del Estado:</strong> ${item.vehiculo.descripcionEstado || 'Sin descripción'}</p>
            <p><strong>Kilometraje:</strong> ${item.vehiculo.kilometraje || '—'}</p>
            <hr>
            <p><strong>Acompañante Principal:</strong> ${item.acompanantePrincipal.nombre || '—'} (${item.acompanantePrincipal.legajo || '—'})</p>
            <p><strong>Acompañante Opcional:</strong> ${item.acompananteOpcional.nombre || '—'} (${item.acompananteOpcional.legajo || '—'})</p>
        `;

        if (modalBody) modalBody.innerHTML = html;
        if (detailsModal) detailsModal.style.display = 'block';
        return; 
    }

    const isBaseCheck = sheetType === "verificacion de bases";
    const isMovilCheck = sheetType !== "Verificacion de objetivos MAC" && sheetType !== "Verificacion de sitios Aysa" && !isBaseCheck;
    let basesFaltas = [];

    const getColorClass = (value) => {
        if (!value) return '';
        const lowerValue = value.toString().toLowerCase().trim();
        if (lowerValue === 'no' || lowerValue === 'regular' || lowerValue === 'mala') return 'text-danger';
        if (lowerValue === 'si' || lowerValue === 'sí' || lowerValue === 'buena') return 'text-success';
        return '';
    };

    const isNegativeValue = (value) => {
        if (!value) return false;
        const lowerValue = value.toString().toLowerCase();
        return lowerValue === 'no' || lowerValue === 'regular' || lowerValue === 'mala';
    };

    let html = `
        <p><strong>Puesto/Base/Sitio:</strong> ${item.patrullaNombre || 'N/A'}</p>
        <p><strong>Supervisor:</strong> ${(item.emailSupervisor && typeof item.emailSupervisor === 'string' ? item.emailSupervisor : 'N/A')}</p>
        <p><strong>Fecha/Hora Chequeo:</strong> ${item.timestamp || 'N/A'}</p>
        ${isRecorridoCheck ? `<p><strong>Origen del Chequeo:</strong> ${item.HojaOrigen ? item.HojaOrigen.replace('Verificacion de ', '').replace('verificacion de ', '') : 'N/A'}</p>` : ''}
        <hr>
    `;

    if (isBaseCheck) {
        basesFaltas = getBasesAlertDetails(item);

        if (basesFaltas.length > 0) {
            html += `<h4 class="text-danger">🚨 Faltas en la Base:</h4><ul>`;
            basesFaltas.forEach(falta => { html += `<li><strong class="text-danger">${falta}</strong></li>`; });
            html += `</ul><hr>`;
        } else {
            html += `<p class="text-success">✅ Todos los chequeos básicos de la Base están **OK**.</p><hr>`;
        }

        const baseDetailFields = [
            { label: "Dominio/Móvil", key: "movilDominio", checkAlert: false },
            { label: "Kilometraje", key: "kilometraje", checkAlert: false },
            { label: "Nivel de Combustible", key: "combustibleFraccion", checkAlert: false },
            { label: "Higiene de la Base", key: "higieneMovil", checkAlert: true },
            { label: "Posee Botiquín", key: "poseeBotiquin", checkAlert: true },
            { label: "Posee Auxilio", key: "poseeAuxilio", checkAlert: true },
            { label: "Posee Matafuegos en vigencia", key: "poseeMatafuegos", checkAlert: true },
            { label: "Posee Baliza", key: "poseeBaliza", checkAlert: true },
            { label: "Posee Linterna", key: "poseeLinterna", checkAlert: true },
            { label: "Posee Cable para puentear bateria", key: "poseeCableBateria", checkAlert: true },
            { label: "Posee Capa de lluvia", key: "poseeCapaLluvia", checkAlert: true },
            { label: "Posee toda la documentacion del movil", key: "poseeDocumentacionMovil", checkAlert: true },
            { label: "Posee Linga", key: "poseeLinga", checkAlert: true },
            { label: "Posee Cricket", key: "poseeCricket", checkAlert: true },
            { label: "Posee Llave Cruz", key: "poseeLlaveCruz", checkAlert: true },
        ];

        let baseDetailsHtml = `<h4>Información del Chequeo:</h4>`;
        let hasBaseInfo = false;

        baseDetailFields.forEach(field => {
             const value = item[field.key];
             if (value && value.toString().trim().toUpperCase() !== 'N/A') {
                 const colorClass = field.checkAlert ? getColorClass(value) : '';
                 baseDetailsHtml += `<p class="${colorClass}"><strong>${field.label}:</strong> ${value}</p>`;
                 hasBaseInfo = true;
             }
        });

        if (hasBaseInfo) html += baseDetailsHtml;

    } else if (isMovilCheck) { 
        html += `
             <h4>Información del Móvil/Puesto:</h4>
             <p><strong>Dominio/Móvil:</strong> ${item.movilDominio || 'N/A'}</p>
             <p><strong>Kilometraje:</strong> ${item.kilometraje || 'N/A'}</p>
             <p class="${item.combustibleFraccion && checkCombustible(item.combustibleFraccion).alerta ? 'text-danger' : ''}"><strong>Nivel de Combustible:</strong> ${item.combustibleFraccion || 'N/A'}</p>
             <p class="${getColorClass(item.higieneMovil)}"><strong>Higiene:</strong> ${item.higieneMovil || 'N/A'}</p>
             <p class="${getColorClass(item.poseeBotiquin)}"><strong>Posee Botiquín:</strong> ${item.poseeBotiquin || 'N/A'}</p>
        `;
    } else { 
        html += `<h4>Información del Puesto:</h4><p>Dominio/Móvil: N/A - Puesto Fijo</p>`;
    }

    if (item.observacionesMovil) html += `<hr><p><strong>Observaciones Generales:</strong> ${item.observacionesMovil || 'Sin observaciones'}</p>`;
    html += '<hr>';

    if (item.vigiladores && item.vigiladores.length > 0) {
        html += `<h4>Vigiladores Chequeados:</h4>`;
        item.vigiladores.forEach((v, i) => {
            const isUniformeAlert = isNegativeValue(v.uniformeCompleto);
            const isRegAlert = isNegativeValue(v.regControlado);
            const isCapacitacionAlert = isNegativeValue(v.capacitacion);

            const faltas = [];
            if (isRegAlert) faltas.push('Falta Registro');
            if (isUniformeAlert) faltas.push('Falta Uniforme');
            if (isCapacitacionAlert) faltas.push('Falta Capacitación');

            const isVigiladorAlert = isRegAlert || isUniformeAlert; 

            const statusDisplay = isVigiladorAlert
                ? `<span class="text-danger">🚨 **Falta Grave:** ${faltas.filter(f => f !== 'Falta Capacitación').join(', ')}</span>`
                : `<span class="${isCapacitacionAlert ? 'text-warning' : 'text-success'}">${isCapacitacionAlert ? '⚠️ Capacitación Pendiente' : '✅ OK'}</span>`;

            html += `<div class="vigilador-detail">
                <h5>Vigilador ${i + 1} (${v.legajo || 'N/A'}) - ${v.nombre || 'N/A'}</h5>
                <p><strong>Estado:</strong> ${statusDisplay}</p>
                <p class="${getColorClass(v.regControlado)}"><strong>Registro Controlado / Presentación:</strong> ${v.regControlado || 'N/A'}</p>
                <p class="${getColorClass(v.uniformeCompleto)}"><strong>Uniforme Completo:</strong> ${v.uniformeCompleto || 'N/A'}</p>
                <p class="${getColorClass(v.capacitacion)}"><strong>Capacitación Realizada:</strong> ${v.capacitacion || 'N/A'}</p>
                <p><strong>Observaciones:</strong> ${v.observaciones || 'N/A'}</p>
            </div>`;
        });
    } else {
        html += `<p>No se registraron vigiladores para este chequeo.</p>`;
    }

    if (modalBody) modalBody.innerHTML = html;
    if (detailsModal) detailsModal.style.display = 'block';
};

if (closeModal) closeModal.onclick = () => { if (detailsModal) detailsModal.style.display = 'none'; };
if (detailsModal) window.onclick = (event) => { if (event.target == detailsModal) detailsModal.style.display = 'none'; };

const setupRecorridoDetailListener = () => {
    if (!recorridoContainer) return;
    recorridoContainer.addEventListener('click', (event) => {
        const button = event.target.closest('.button-small');
        if (button && button.hasAttribute('data-check')) { 
            event.stopPropagation();
            try {
                const itemData = JSON.parse(decodeURIComponent(button.dataset.check));
                window.showDetailsModal(itemData);
            } catch (e) {
                console.error("Error al parsear datos:", e);
                alert("No se pudo cargar el detalle. Verifique el formato JSON.");
            }
        }
    });
};

const initialize = () => {
    if (summarySection) summarySection.style.display = 'none'; 
    if (repetitionAnalysisContainer) repetitionAnalysisContainer.style.display = 'none';

    if (searchInput) searchInput.addEventListener('input', window.filterAndSearch);
    if (alertFilter) alertFilter.addEventListener('change', window.filterAndSearch);
    if (dateFilter) dateFilter.addEventListener('change', window.filterAndSearch); 

    window.addEventListener('resize', () => {
        if (currentFilteredData.length > 0 && currentSheet !== "Recorridos_Consolidados") {
             window.renderCurrentPage();
        }
    });

    tabButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const sheetName = event.target.dataset.sheet;
            tabButtons.forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            loadData(sheetName);
        });
    });

    if (recorridoDateSelector) {
        const today = new Date();
        const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        recorridoDateSelector.value = todayISO;

        recorridoDateSelector.addEventListener('change', (event) => {
            const selectedDate = event.target.value;
            const activeSupervisor = event.target.dataset.activeSupervisor;
            const rawDailyRecorrido = event.target.dataset.dailyRecorrido;

            if (activeSupervisor && rawDailyRecorrido) {
                const dailyRecorrido = JSON.parse(rawDailyRecorrido);
                const supervisorName = activeSupervisor.includes('@') ? activeSupervisor.split('@')[0] : activeSupervisor;
                renderRecorridoForDate(selectedDate, supervisorName, dailyRecorrido);
            }
        });
    }

    setupRecorridoDetailListener();

    const initialTab = document.querySelector(`.tab-button[data-sheet="${currentSheet}"]`);
    if (initialTab) initialTab.classList.add('active');

    loadData(currentSheet);
};

function renderCambioTurnoTable(data) {
    if (!dataContainer) return;

    dataContainer.innerHTML = '';

    if (data.length === 0) {
        dataContainer.innerHTML = '<p class="text-center text-muted p-4">No hay registros para mostrar en esta página.</p>';
        return;
    }

    let html = `
        <table class="data-table table-responsive cambio-turno-table">
            <thead>
                <tr>
                    <th>Patente</th>
                    <th>Turno Inicio</th>
                    <th>Turno Salida</th>
                    <th>Km</th>
                    <th>Estado del Vehiculo</th>
                    <th>Detalles</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach((item, index) => {
        const estadoLower = item.vehiculo.estado ? item.vehiculo.estado.toString().toLowerCase().trim() : '';
        const estadoClass = estadoLower === 'bueno estado' ? 'text-success' : 'text-danger fw-bold';
        const itemDataString = JSON.stringify(item);

        html += `
            <tr ${item.hasAlert ? 'class="table-warning"' : ''}>
                <td><strong>${item.vehiculo.patente}</strong></td>
                <td>${item.turno.inicio || '—'}</td>
                <td>${item.turno.salida || '—'}</td>
                <td>${item.vehiculo.kilometraje}</td>
                <td class="${estadoClass}">${item.vehiculo.estado}</td>
                <td>
                    <button class="button-small" 
                        onclick="window.showDetailsModal(JSON.parse(decodeURIComponent('${encodeURIComponent(itemDataString)}')))">
                        Ver Detalle
                    </button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    dataContainer.innerHTML = html;
}

window.onload = initialize;