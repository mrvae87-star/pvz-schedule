// ========================================
// ГЛАВНЫЙ ФАЙЛ ПРИЛОЖЕНИЯ (С SUPABASE)
// ========================================

import { showNotification } from './utils/notifications.js';
import { escapeHtml, getMonthName, getMonthKey, getDayOfWeek, isToday, getTodayDateKey } from './utils/helpers.js';
import { getDeadlineTime } from './config/constants.js';
import { 
    supabase,
    testConnection,
    getEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getPVZ,
    savePVZ,
    deletePVZ,
    saveSchedule,
    getSchedules,
    saveSalary,
    getSalary,
    savePvzOpenTime,
    getPvzSettings,
    saveCheckin,
    getCheckinsForDate,
    saveEmergencyContact,
    getEmergencyContacts,
    deleteEmergencyContact,
    getManagerPhones,
    addManagerPhone,
    deleteManagerPhone,
    getImportantNotices,
    addImportantNotice,
    deleteImportantNotice,
    saveExtraWork,
    getAllExtraWorks,
    deleteExtraWorkRemote,
    saveFine,
    getAllFines,
    deleteFineRemote,
    getAllSalary,
    getScheduleForDate,
    deleteScheduleForEmployeeMonth,
    getZvonokBalance,
    getArchivedEmployees,
    archiveEmployee,
    restoreEmployee,
    logActivity,
    getActivityLog,
    verifyPassword
} from './config/supabase.js';

// ========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ========================================

let allPVZData = {};
let currentPVZ = "";
let currentTab = "pvz";
let isAdminUnlocked = false;
let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth() + 1;
let analyticsYear = new Date().getFullYear();
let analyticsMonth = new Date().getMonth() + 1;
let analyticsSearchTerm = '';
let globalEmployees = [];
let isLoading = true;

let salaryData = {};
let currentDashboardYear = new Date().getFullYear();
let currentDashboardMonth = new Date().getMonth() + 1;

let extraWorks = {};
let fines = {};
let emergencyContacts = {};
let managerPhones = [];
let importantNotices = [];
let archivedEmployees = [];

let checkinData = {};
let checkinInterval = null;
let pvzOpenTimes = {};

// ========================================
// ДЕФОЛТНЫЕ ДАННЫЕ
// ========================================

function getDefaultEmployees() {
    return [
        { name: "Анна", surname: "Смирнова", fullName: "Анна Смирнова", email: "anna@example.com", phone: "+7-999-123-45-67" },
        { name: "Иван", surname: "Козлов", fullName: "Иван Козлов", email: "ivan@example.com", phone: "+7-999-234-56-78" },
        { name: "Мария", surname: "Орлова", fullName: "Мария Орлова", email: "maria@example.com", phone: "+7-999-345-67-89" },
        { name: "Дмитрий", surname: "Павлов", fullName: "Дмитрий Павлов", email: "dmitry@example.com", phone: "+7-999-456-78-90" },
        { name: "Елена", surname: "Ветрова", fullName: "Елена Ветрова", email: "elena@example.com", phone: "+7-999-567-89-01" }
    ];
}

function getDefaultPVZData() {
    return { 
        "ПВЗ Центральный": { employeesHistory: {}, schedules: {} },
        "ПВЗ Северный": { employeesHistory: {}, schedules: {} },
        "ПВЗ Южный": { employeesHistory: {}, schedules: {} },
        "ПВЗ Восточный": { employeesHistory: {}, schedules: {} }
    };
}

// ========================================
// РАБОТА С LOCALSTORAGE (Резервное хранение)
// ========================================

function saveToLocalStorage() {
    if (isLoading) return;
    try {
        const data = {
            employees: globalEmployees,
            pvzData: allPVZData,
            currentPVZ: currentPVZ,
            salaryData: salaryData,
            extraWorks: extraWorks,
            fines: fines,
            emergencyContacts: emergencyContacts,
            pvzOpenTimes: pvzOpenTimes,
            checkinData: checkinData
        };
        localStorage.setItem('pvzAppData', JSON.stringify(data));
        console.log("✅ Данные сохранены в LocalStorage");
    } catch (error) {
        console.error("❌ Ошибка сохранения в LocalStorage:", error);
    }
}

function loadFromLocalStorage() {
    isLoading = true;
    try {
        const saved = localStorage.getItem('pvzAppData');
        if (saved) {
            const data = JSON.parse(saved);
            globalEmployees = data.employees || getDefaultEmployees();
            allPVZData = data.pvzData || getDefaultPVZData();
            currentPVZ = data.currentPVZ || Object.keys(allPVZData)[0];
            salaryData = data.salaryData || {};
            extraWorks = data.extraWorks || {};
            fines = data.fines || {};
            emergencyContacts = data.emergencyContacts || {};
            
            pvzOpenTimes = data.pvzOpenTimes || {};
            if (Object.keys(pvzOpenTimes).length === 0) {
                for (let pvzName in allPVZData) {
                    pvzOpenTimes[pvzName] = '09:00';
                }
            }
            
            checkinData = data.checkinData || {};
            if (Object.keys(checkinData).length === 0) {
                globalEmployees.forEach(emp => {
                    checkinData[emp.fullName] = {
                        today: { status: 'pending', time: null, pvz: null }
                    };
                });
            }
            
            console.log("✅ Данные загружены из LocalStorage");
            isLoading = false;
            return true;
        } else {
            resetToDefaults();
            saveToLocalStorage();
            isLoading = false;
            return true;
        }
    } catch (error) {
        console.error("❌ Ошибка загрузки из LocalStorage:", error);
        resetToDefaults();
        isLoading = false;
        return false;
    }
}

function resetToDefaults() {
    globalEmployees = getDefaultEmployees();
    allPVZData = getDefaultPVZData();
    currentPVZ = Object.keys(allPVZData)[0];
    salaryData = {};
    extraWorks = {};
    fines = {};
    emergencyContacts = {};
    
    pvzOpenTimes = {};
    for (let pvzName in allPVZData) {
        pvzOpenTimes[pvzName] = '09:00';
    }
    
    checkinData = {};
    globalEmployees.forEach(emp => {
        checkinData[emp.fullName] = {
            today: { status: 'pending', time: null, pvz: null }
        };
    });
}

// ========================================
// ЗАГРУЗКА ДАННЫХ ИЗ SUPABASE
// ========================================

async function loadAllDataFromSupabase() {
    isLoading = true;
    try {
        // 1. Загружаем сотрудников
        const employeesResult = await getEmployees();
        if (employeesResult.success && employeesResult.data.length > 0) {
            globalEmployees = employeesResult.data.map(emp => ({
                ...emp,
                fullName: `${emp.name} ${emp.surname}`
            }));
        } else {
            globalEmployees = getDefaultEmployees();
        }
        
        // 2. Загружаем ПВЗ (со всей историей сотрудников)
        const pvzResult = await getPVZ();
        if (pvzResult.success && Object.keys(pvzResult.data).length > 0) {
            allPVZData = pvzResult.data;
            console.log('✅ ПВЗ загружены:', Object.keys(allPVZData));
        } else {
            allPVZData = getDefaultPVZData();
            // Сохраняем дефолтные ПВЗ в Supabase
            for (let pvzName in allPVZData) {
                await savePVZ(pvzName, allPVZData[pvzName]);
            }
        }
        
        // 3. Загружаем время открытия ПВЗ из Supabase
        await loadPvzOpenTimes();

        // 3.5. Загружаем экстренные контакты из Supabase
        try {
            const emergencyResult = await getEmergencyContacts();
            if (emergencyResult.success) {
                emergencyContacts = emergencyResult.data;
                console.log('✅ Экстренные контакты загружены из Supabase:', Object.keys(emergencyContacts).length);
            }
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить экстренные контакты из Supabase:', error);
        }

        // 3.6. Загружаем номера руководителя из Supabase
        try {
            const phonesResult = await getManagerPhones();
            if (phonesResult.success) {
                managerPhones = phonesResult.data;
                console.log('✅ Номера руководителя загружены из Supabase:', managerPhones.length);
            }
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить номера руководителя из Supabase:', error);
        }
        renderManagerPhonesList();

        // 3.7. Загружаем "Важно знать" из Supabase и проверяем баннер новинок
        try {
            const noticesResult = await getImportantNotices();
            if (noticesResult.success) {
                importantNotices = noticesResult.data;
                console.log('✅ "Важно знать" загружено из Supabase:', importantNotices.length);
            }
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить "Важно знать" из Supabase:', error);
        }
        checkNewNoticeBanner();

        // 3.8. Загружаем подработки, штрафы и зарплату из Supabase
        try {
            const extraResult = await getAllExtraWorks();
            if (extraResult.success) {
                extraWorks = extraResult.data;
                console.log('✅ Подработки загружены из Supabase:', Object.keys(extraWorks).length);
            }
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить подработки из Supabase:', error);
        }

        try {
            const finesResult = await getAllFines();
            if (finesResult.success) {
                fines = finesResult.data;
                console.log('✅ Штрафы загружены из Supabase:', Object.keys(fines).length);
            }
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить штрафы из Supabase:', error);
        }

        try {
            const salaryResult = await getAllSalary();
            if (salaryResult.success) {
                salaryData = salaryResult.data;
                console.log('✅ Зарплата загружена из Supabase:', Object.keys(salaryData).length);
            }
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить зарплату из Supabase:', error);
        }
        
        // 4. Загружаем график для текущего месяца для каждого ПВЗ
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        for (let pvzName in allPVZData) {
            // Загружаем расписание
            const schedulesResult = await getSchedules(pvzName, currentYear, currentMonth);
            if (schedulesResult.success) {
                allPVZData[pvzName].schedules = schedulesResult.data;
            }
            
            // Загружаем сотрудников для этого ПВЗ
            const monthKey = getMonthKey(currentYear, currentMonth);
            if (!allPVZData[pvzName].employeesHistory) {
                allPVZData[pvzName].employeesHistory = {};
            }
            
            // Если нет сотрудников для текущего месяца, копируем из предыдущего
            if (!allPVZData[pvzName].employeesHistory[monthKey] || 
                allPVZData[pvzName].employeesHistory[monthKey].length === 0) {
                
                const allKeys = Object.keys(allPVZData[pvzName].employeesHistory).sort();
                if (allKeys.length > 0) {
                    const lastKey = allKeys[allKeys.length - 1];
                    if (lastKey !== monthKey) {
                        allPVZData[pvzName].employeesHistory[monthKey] = 
                            [...allPVZData[pvzName].employeesHistory[lastKey]];
                        console.log(`📋 Скопированы сотрудники для ${pvzName} из ${lastKey} в ${monthKey}`);
                    }
                }
            }
            
            console.log(`👥 ${pvzName}: ${allPVZData[pvzName].employeesHistory[monthKey]?.length || 0} сотрудников`);
        }
        
        currentPVZ = Object.keys(allPVZData)[0];
        isLoading = false;
        console.log('✅ Данные загружены из Supabase');
        return true;
    } catch (error) {
        console.error('Ошибка загрузки данных из Supabase:', error);
        isLoading = false;
        return false;
    }
}

// ========================================
// ЗАГРУЗКА ВРЕМЕНИ ОТКРЫТИЯ ПВЗ (ИЗ SUPABASE)
// ========================================

async function loadPvzOpenTimes() {
    try {
        // Пытаемся загрузить из Supabase
        const result = await getPvzSettings();
        if (result.success && Object.keys(result.data).length > 0) {
            pvzOpenTimes = result.data;
            console.log('✅ Время открытия ПВЗ загружено из Supabase:', pvzOpenTimes);
        } else {
            // Если в Supabase нет данных, используем LocalStorage или дефолтные
            const saved = localStorage.getItem('pvzOpenTimes');
            if (saved) {
                pvzOpenTimes = JSON.parse(saved);
                console.log('✅ Время открытия ПВЗ загружено из LocalStorage');
            } else {
                // Дефолтные значения
                pvzOpenTimes = {};
                for (let pvzName in allPVZData) {
                    pvzOpenTimes[pvzName] = '09:00';
                }
                if (allPVZData['ПВЗ Центральный']) pvzOpenTimes['ПВЗ Центральный'] = '09:00';
                if (allPVZData['ПВЗ Северный']) pvzOpenTimes['ПВЗ Северный'] = '10:00';
                if (allPVZData['ПВЗ Южный']) pvzOpenTimes['ПВЗ Южный'] = '08:30';
                if (allPVZData['ПВЗ Восточный']) pvzOpenTimes['ПВЗ Восточный'] = '11:00';
                console.log('✅ Используются дефолтные времена открытия');
            }
        }
        renderPvzTimeSettings();
    } catch (error) {
        console.error('Ошибка загрузки времени открытия:', error);
        // Fallback на LocalStorage
        const saved = localStorage.getItem('pvzOpenTimes');
        if (saved) {
            pvzOpenTimes = JSON.parse(saved);
        }
        renderPvzTimeSettings();
    }
}

// ========================================
// СОХРАНЕНИЕ ВРЕМЕНИ ОТКРЫТИЯ ПВЗ (В SUPABASE)
// ========================================

async function savePvzTimes() {
    if (!await checkAdminPassword()) return;
    
    const inputs = document.querySelectorAll('.pvz-time-input');
    const updates = [];
    
    inputs.forEach(input => {
        const pvz = input.dataset.pvz;
        const time = input.value;
        if (pvz && time) {
            pvzOpenTimes[pvz] = time;
            updates.push({ pvzName: pvz, openTime: time });
        }
    });
    
    // Сохраняем в LocalStorage (резерв)
    saveToLocalStorage();
    localStorage.setItem('pvzOpenTimes', JSON.stringify(pvzOpenTimes));
    
    // Сохраняем в Supabase
    let allSuccess = true;
    for (const update of updates) {
        const result = await savePvzOpenTime(update.pvzName, update.openTime);
        if (!result.success) {
            allSuccess = false;
            console.error(`❌ Ошибка сохранения для ${update.pvzName}:`, result.error);
        }
    }
    
    if (allSuccess) {
        showNotification('✅ Настройки времени сохранены в Supabase!', false);
    } else {
        showNotification('⚠️ Настройки сохранены локально, но часть данных не синхронизирована с Supabase', true);
    }
    
    document.getElementById('timeSettingsContent').style.display = 'none';
}

// ========================================
// РАБОТА С СОТРУДНИКАМИ
// ========================================

function getEmployeesForMonth(pvzName, year, month) {
    if (!allPVZData[pvzName] || !allPVZData[pvzName].employeesHistory) return [];
    const monthKey = getMonthKey(year, month);
    if (allPVZData[pvzName].employeesHistory[monthKey]) {
        return [...allPVZData[pvzName].employeesHistory[monthKey]];
    }
    const allKeys = Object.keys(allPVZData[pvzName].employeesHistory).sort();
    if (allKeys.length === 0) return [];
    let lastKey = null;
    for (let key of allKeys) {
        const [keyYear, keyMonth] = key.split('-').map(Number);
        if (keyYear < year || (keyYear === year && keyMonth < month)) lastKey = key;
        else break;
    }
    if (lastKey) {
        allPVZData[pvzName].employeesHistory[monthKey] = [...allPVZData[pvzName].employeesHistory[lastKey]];
        return [...allPVZData[pvzName].employeesHistory[monthKey]];
    }
    return [];
}

function addEmployeeToMonth(pvzName, year, month, employeeName) {
    const currentEmps = getEmployeesForMonth(pvzName, year, month);
    if (!currentEmps.includes(employeeName)) {
        currentEmps.push(employeeName);
        const monthKey = getMonthKey(year, month);
        allPVZData[pvzName].employeesHistory[monthKey] = [...currentEmps];
        return true;
    }
    return false;
}

function removeEmployeeFromMonth(pvzName, year, month, employeeName) {
    const currentEmps = getEmployeesForMonth(pvzName, year, month);
    const index = currentEmps.indexOf(employeeName);
    if (index !== -1) {
        currentEmps.splice(index, 1);
        const monthKey = getMonthKey(year, month);
        allPVZData[pvzName].employeesHistory[monthKey] = [...currentEmps];
        if (allPVZData[pvzName].schedules && allPVZData[pvzName].schedules[employeeName]) {
            const daysInMonth = new Date(year, month, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                const dayKey = `${year}-${month}-${d}`;
                if (allPVZData[pvzName].schedules[employeeName][dayKey] !== undefined) {
                    delete allPVZData[pvzName].schedules[employeeName][dayKey];
                }
            }
        }
        return true;
    }
    return false;
}

// ========================================
// РЕНДЕР ВКЛАДОК
// ========================================

function renderTabs() {
    const tabsLeft = document.getElementById("tabsLeft");
    const tabsRight = document.getElementById("tabsRight");
    if (!tabsLeft || !tabsRight) return;

    tabsLeft.innerHTML = '';
    for (let pvz in allPVZData) {
        const tab = document.createElement('button');
        tab.className = `tab ${currentTab === pvz ? 'active' : ''}`;
        tab.innerHTML = `📍 ${pvz}`;
        tab.onclick = () => switchTab(pvz);
        tabsLeft.appendChild(tab);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.innerHTML = '➕ Добавить ПВЗ';
    addBtn.onclick = () => addNewPVZ();
    tabsLeft.appendChild(addBtn);

    tabsRight.innerHTML = '';
}

// ========================================
// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ========================================

async function switchTab(tabId) {
    document.querySelectorAll('[id$="TabContent"]').forEach(el => el.style.display = "none");

    const legend = document.getElementById('scheduleLegend');
    if (legend) legend.style.display = 'none';

    if (tabId === 'employees') {
        currentTab = 'employees';
        document.getElementById("employeesTabContent").style.display = "block";
        renderGlobalEmployeesTable();
        showEmployeesSubtab('list');
    } else if (tabId === 'dashboard') {
        currentTab = 'dashboard';
        document.getElementById("dashboardTabContent").style.display = "block";
        populateDashboardMonthSelect();
        renderSalaryTable();
    } else if (tabId === 'analytics') {
        currentTab = 'analytics';
        document.getElementById("analyticsTabContent").style.display = "block";
        const now = new Date();
        analyticsYear = now.getFullYear();
        analyticsMonth = now.getMonth() + 1;
        analyticsSearchTerm = '';
        const searchInput = document.getElementById('analyticsSearchInput');
        if (searchInput) searchInput.value = '';
        populateAnalyticsSelects();
        renderAnalytics();
    } else if (tabId === 'emergency') {
        currentTab = 'emergency';
        document.getElementById("emergencyContactsTabContent").style.display = "block";
        loadPublicEmergencyForm();
    } else if (tabId === 'important') {
        currentTab = 'important';
        document.getElementById("importantTabContent").style.display = "block";
        renderImportantNoticesList();
    } else if (tabId === 'checkin') {
        currentTab = 'checkin';
        document.getElementById("checkinTabContent").style.display = "block";
        await loadPvzOpenTimes();
        populateCheckinSelects();
        await loadCheckinData();
        updateClock();
        updateShiftInfo();
        updateMyCheckinStatus();
        if (checkinInterval) clearInterval(checkinInterval);
        checkinInterval = setInterval(updateClock, 1000);
        if (window.checkinCheckInterval) clearInterval(window.checkinCheckInterval);
        window.checkinCheckInterval = setInterval(async () => {
            // Подтягиваем актуальные чекины из Supabase (могли отметиться с другого устройства)
            await loadCheckinData();
            // Подтягиваем актуальный график на сегодня (могли переставить/снять смену)
            await refreshTodaySchedule();
            checkMissedCheckins();
            updateMyCheckinStatus();
        }, 30000);
        setTimeout(() => {
            checkMissedCheckins();
            updateMyCheckinStatus();
        }, 1000);
    } else {
        currentPVZ = tabId;
        currentTab = tabId;
        document.getElementById("pvzTabContent").style.display = "block";
        updatePVZEmployeesUI();
        populateMonthSelect();
        renderSchedule();
        if (legend) legend.style.display = 'flex';
    }

    renderTabs();
    saveToLocalStorage();
}

// ========================================
// РЕНДЕР ГРАФИКА (С ПОДСВЕТКОЙ СТОЛБЦА)
// ========================================

function renderSchedule() {
    const data = allPVZData[currentPVZ];
    if (!data) return;

    const year = selectedYear, month = selectedMonth;
    const daysCount = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = (today.getFullYear() === year && (today.getMonth() + 1) === month);
    const todayDate = today.getDate();

    let headerHtml = `<tr><th class="employee-col">Сотрудник</th>`;
    for (let d = 1; d <= daysCount; d++) {
        const dow = getDayOfWeek(year, month, d);
        const isToday = isCurrentMonth && todayDate === d;
        const isWeekend = (dow === 0 || dow === 6);
        const isWeekStart = (dow === 1); // понедельник — начало новой недели
        
        let extraClass = '';
        if (isToday) extraClass = 'today-column';
        if (isWeekend) extraClass += ' weekend';
        if (isWeekStart) extraClass += ' week-start';
        
        headerHtml += `<th class="${extraClass}">
            <div class="day-number">${d}</div>
            <div class="weekday-name">${["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][dow]}</div>
        </th>`;
    }
    headerHtml += '<th>📊</th></tr>';
    document.getElementById("tableHeader").innerHTML = headerHtml;

    const employeesThisMonth = getEmployeesForMonth(currentPVZ, year, month);
    let bodyHtml = '';

    for (let emp of employeesThisMonth) {
        let workCount = 0;
        let row = `<tr><td class="employee-col">${escapeHtml(emp)}</td>`;

        for (let d = 1; d <= daysCount; d++) {
            if (!data.schedules[emp]) data.schedules[emp] = {};
            const isWork = data.schedules[emp][`${year}-${month}-${d}`] === true;
            if (isWork) workCount++;
            
            const dow = getDayOfWeek(year, month, d);
            const isWeekend = (dow === 0 || dow === 6);
            const isWeekStart = (dow === 1);
            const isToday = isCurrentMonth && todayDate === d;
            let extraClass = '';
            if (isToday) extraClass = 'today-column';
            if (isWeekend) extraClass += ' weekend';
            if (isWeekStart) extraClass += ' week-start';
            
            row += `<td class="${isWork ? 'shift-work' : 'shift-off'} ${extraClass}" 
                        data-employee="${emp}" data-year="${year}" data-month="${month}" data-day="${d}" data-status="${isWork}">
                        ${isWork ? '✅' : '❌'}
                    </td>`;
        }
        bodyHtml += row + `<td style="text-align:center;font-weight:700;">${workCount}</td></tr>`;
    }

    document.getElementById("tableBody").innerHTML = bodyHtml || '<tr><td colspan="40" style="text-align:center;padding:40px;">👀 Нет сотрудников</td></tr>';
    document.getElementById("currentMonthTitle").innerHTML = `📅 ${getMonthName(month)} ${year} | ${currentPVZ}`;
}

// ========================================
// ОБНОВЛЕНИЕ СПИСКА СОТРУДНИКОВ ПВЗ
// ========================================

function updatePVZEmployeesUI() {
    const container = document.getElementById("pvzEmployeesList");
    const span = document.getElementById("currentPVZName");
    const monthSpan = document.getElementById("currentMonthNameForPVZ");

    if (!container) return;

    const employees = getEmployeesForMonth(currentPVZ, selectedYear, selectedMonth);
    if (span) span.textContent = currentPVZ;
    if (monthSpan) monthSpan.textContent = `${getMonthName(selectedMonth)} ${selectedYear}`;

    container.innerHTML = employees.length === 0 
        ? '<span style="color:#64748b;">Нет сотрудников</span>' 
        : employees.map(emp => `
            <div class="pvz-employee-tag">
                ${escapeHtml(emp)}
                <button class="remove-from-pvz" data-name="${emp}">✕</button>
            </div>
        `).join('');

    document.querySelectorAll('.remove-from-pvz').forEach(btn => {
        btn.addEventListener('click', () => removeEmployeeFromPVZ(btn.dataset.name));
    });

    updateAvailableEmployeesSelect();
}

function updateAvailableEmployeesSelect() {
    const select = document.getElementById("availableEmployeesSelect");
    if (!select) return;

    const currentEmps = getEmployeesForMonth(currentPVZ, selectedYear, selectedMonth);
    const available = globalEmployees.filter(emp => !currentEmps.includes(emp.fullName));

    select.innerHTML = '<option value="">-- Выберите сотрудника --</option>';
    available.forEach(emp => {
        const o = document.createElement("option");
        o.value = emp.fullName;
        o.textContent = emp.fullName;
        select.appendChild(o);
    });
}

function populateMonthSelect() {
    const select = document.getElementById("monthSelect");
    if (!select) return;

    const now = new Date();
    select.innerHTML = '';
    const maxYear = 2028;
    const maxMonth = 12;
    let startYear = now.getFullYear() - 1;
    let startMonth = now.getMonth() + 1;

    for (let year = startYear; year <= maxYear; year++) {
        let monthStart = (year === startYear) ? startMonth : 1;
        let monthEnd = (year === maxYear) ? maxMonth : 12;
        for (let month = monthStart; month <= monthEnd; month++) {
            const option = document.createElement("option");
            option.value = `${year}-${month}`;
            option.textContent = `${getMonthName(month)} ${year}`;
            if (year === selectedYear && month === selectedMonth) option.selected = true;
            select.appendChild(option);
        }
    }
}

// ========================================
// РЕНДЕР ТАБЛИЦЫ СОТРУДНИКОВ
// ========================================

function renderGlobalEmployeesTable() {
    const tbody = document.getElementById("employeesTableBody");
    if (!tbody) return;

    tbody.innerHTML = globalEmployees.map((emp, idx) => `
        <tr>
            <td><strong>${escapeHtml(emp.name)}</strong></td>
            <td><strong>${escapeHtml(emp.surname)}</strong></td>
            <td>${escapeHtml(emp.email || '—')}</td>
            <td>${escapeHtml(emp.phone || '—')}</td>
            <td>
                ${isAdminUnlocked ? `
                    <button class="edit-employee-btn" data-idx="${idx}">✏️</button>
                    <button class="history-employee-btn" data-idx="${idx}">🕰</button>
                    <button class="archive-employee-btn" data-idx="${idx}">🗃 Уволить</button>
                ` : ''}
            </td>
        </tr>
    `).join('');

    document.querySelectorAll('.edit-employee-btn').forEach(btn => {
        btn.addEventListener('click', () => editGlobalEmployee(parseInt(btn.dataset.idx)));
    });

    document.querySelectorAll('.history-employee-btn').forEach(btn => {
        btn.addEventListener('click', () => showEmployeeHistory(globalEmployees[parseInt(btn.dataset.idx)].fullName));
    });

    document.querySelectorAll('.archive-employee-btn').forEach(btn => {
        btn.addEventListener('click', () => archiveGlobalEmployee(parseInt(btn.dataset.idx)));
    });
}

// ========================================
// УПРАВЛЕНИЕ СОТРУДНИКАМИ (С SUPABASE)
// ========================================

async function editGlobalEmployee(idx) {
    if (!isAdminUnlocked) { showNotification("❌ Доступно только администратору", true); return; }
    const emp = globalEmployees[idx];
    const newName = prompt("Имя:", emp.name);
    if (!newName) return;
    const newSurname = prompt("Фамилия:", emp.surname);
    if (!newSurname) return;

    const oldFullName = emp.fullName;
    const oldId = emp.id;
    const newFullName = `${newName} ${newSurname}`;

    // ====== ПРОВЕРКА НА ДУБЛИ ПРИ РЕДАКТИРОВАНИИ ======
    const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalize(newFullName) !== normalize(oldFullName)) {
        const existing = globalEmployees.find((e, i) => i !== idx && normalize(e.fullName) === normalize(newFullName));
        if (existing) {
            const proceed = confirm(
                `⚠️ Сотрудник с похожим именем уже есть: "${existing.fullName}".\n\n` +
                `Это точно другой человек? Если да — нажмите OK, чтобы сохранить всё равно.`
            );
            if (!proceed) return;
        }
    }

    emp.name = newName;
    emp.surname = newSurname;
    emp.fullName = newFullName;
    emp.email = prompt("Email:", emp.email || "") || "";
    emp.phone = prompt("Телефон:", emp.phone || "") || "";

    if (oldId) {
        const result = await updateEmployee(oldId, emp);
        if (!result.success) {
            showNotification('❌ Ошибка обновления в Supabase', true);
            return;
        }
    }

    for (let pvz in allPVZData) {
        if (allPVZData[pvz].employeesHistory) {
            for (let monthKey in allPVZData[pvz].employeesHistory) {
                const idx2 = allPVZData[pvz].employeesHistory[monthKey].indexOf(oldFullName);
                if (idx2 !== -1) allPVZData[pvz].employeesHistory[monthKey][idx2] = emp.fullName;
            }
        }
        if (allPVZData[pvz].schedules[oldFullName]) {
            allPVZData[pvz].schedules[emp.fullName] = allPVZData[pvz].schedules[oldFullName];
            delete allPVZData[pvz].schedules[oldFullName];
        }
    }

    updatePVZEmployeesUI();
    renderSchedule();
    renderGlobalEmployeesTable();
    saveToLocalStorage();
    await logActivity(emp.fullName, 'edit', `Изменены данные сотрудника (было: ${oldFullName})`);
    showNotification(`✅ Сотрудник обновлён`, false);
}

async function archiveGlobalEmployee(idx) {
    if (!isAdminUnlocked) { showNotification("❌ Доступно только администратору", true); return; }
    const emp = globalEmployees[idx];
    if (!confirm(`Уволить "${emp.fullName}"? Он попадёт в архив, вся история (штрафы, зарплата) сохранится.`)) return;

    const archivedName = emp.fullName;
    const empId = emp.id;

    if (empId) {
        const result = await archiveEmployee(empId, archivedName);
        if (!result.success) {
            showNotification('❌ Ошибка увольнения в Supabase', true);
            return;
        }
    }

    globalEmployees.splice(idx, 1);

    // Убираем из текущих (и будущих) списков графика ПВЗ, включая сами
    // отметки о сменах — уволенный сотрудник больше не должен фигурировать
    // в графике ни в одном ПВЗ, и звонки по нему больше не нужны.
    for (let pvz in allPVZData) {
        if (allPVZData[pvz].employeesHistory) {
            for (let monthKey in allPVZData[pvz].employeesHistory) {
                const idx2 = allPVZData[pvz].employeesHistory[monthKey].indexOf(archivedName);
                if (idx2 !== -1) allPVZData[pvz].employeesHistory[monthKey].splice(idx2, 1);
            }
        }
        if (allPVZData[pvz].schedules) {
            delete allPVZData[pvz].schedules[archivedName];
        }
    }

    updatePVZEmployeesUI();
    renderSchedule();
    renderGlobalEmployeesTable();
    saveToLocalStorage();
    await logActivity(archivedName, 'archive', 'Сотрудник уволен, перемещён в архив');
    showNotification(`🗃 "${archivedName}" перемещён в архив`, false);
}

async function deleteGlobalEmployee(empId) {
    if (!isAdminUnlocked) { showNotification("❌ Доступно только администратору", true); return; }
    const idx = archivedEmployees.findIndex(e => e.id === empId);
    if (idx === -1) return;
    const emp = archivedEmployees[idx];
    if (!confirm(`Удалить "${emp.fullName}" НАВСЕГДА? Это действие нельзя отменить.`)) return;

    const deletedName = emp.fullName;
    
    if (empId) {
        const result = await deleteEmployee(empId, deletedName);
        if (!result.success) {
            showNotification('❌ Ошибка удаления из Supabase', true);
            return;
        }
    }
    
    archivedEmployees.splice(idx, 1);
    renderArchivedEmployeesTable();
    showNotification(`❌ Сотрудник "${deletedName}" удалён навсегда`, false);
}

async function restoreGlobalEmployee(empId) {
    if (!isAdminUnlocked) { showNotification("❌ Доступно только администратору", true); return; }
    const idx = archivedEmployees.findIndex(e => e.id === empId);
    if (idx === -1) return;
    const emp = archivedEmployees[idx];
    if (!confirm(`Восстановить "${emp.fullName}" из архива?`)) return;

    const restoredName = emp.fullName;

    if (empId) {
        const result = await restoreEmployee(empId);
        if (!result.success) {
            showNotification('❌ Ошибка восстановления в Supabase', true);
            return;
        }
    }

    archivedEmployees.splice(idx, 1);
    globalEmployees.push(emp);
    renderArchivedEmployeesTable();
    renderGlobalEmployeesTable();
    await logActivity(restoredName, 'restore', 'Сотрудник восстановлен из архива');
    showNotification(`↩️ "${restoredName}" восстановлен`, false);
}

function renderArchivedEmployeesTable() {
    const tbody = document.getElementById("archivedEmployeesTableBody");
    if (!tbody) return;

    const searchInput = document.getElementById('archiveSearchInput');
    const searchTerm = (searchInput?.value || '').trim().toLowerCase();

    const filtered = searchTerm
        ? archivedEmployees.filter(emp => emp.fullName.toLowerCase().includes(searchTerm))
        : archivedEmployees;

    if (archivedEmployees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">Архив пуст</td></tr>';
        return;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">Никого не найдено</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((emp) => {
        const startDate = emp.created_at ? new Date(emp.created_at) : null;
        const endDate = emp.archived_at ? new Date(emp.archived_at) : null;

        const startStr = startDate ? startDate.toLocaleDateString('ru-RU') : '—';
        const endStr = endDate ? endDate.toLocaleDateString('ru-RU') : '—';

        let daysWorked = '—';
        if (startDate && endDate) {
            const diffMs = endDate.getTime() - startDate.getTime();
            daysWorked = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        }

        return `
        <tr>
            <td><strong>${escapeHtml(emp.fullName)}</strong></td>
            <td>${startStr}</td>
            <td>${endStr}</td>
            <td>${daysWorked}</td>
            <td>
                <button class="history-archived-btn" data-id="${emp.id}">🕰 История</button>
                <button class="restore-employee-btn" data-id="${emp.id}">↩️ Восстановить</button>
                <button class="delete-permanent-btn" data-id="${emp.id}">🗑 Удалить навсегда</button>
            </td>
        </tr>
    `;
    }).join('');

    document.querySelectorAll('.history-archived-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const emp = archivedEmployees.find(e => e.id === btn.dataset.id);
            if (emp) showEmployeeHistory(emp.fullName);
        });
    });
    document.querySelectorAll('.restore-employee-btn').forEach(btn => {
        btn.addEventListener('click', () => restoreGlobalEmployee(btn.dataset.id));
    });
    document.querySelectorAll('.delete-permanent-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteGlobalEmployee(btn.dataset.id));
    });
}

// ========================================
// ИСТОРИЯ ИЗМЕНЕНИЙ ПО СОТРУДНИКУ
// ========================================

async function showEmployeeHistory(employeeName) {
    const modal = document.getElementById('employeeHistoryModal');
    const nameEl = document.getElementById('employeeHistoryName');
    const listEl = document.getElementById('employeeHistoryList');
    if (!modal || !listEl) return;

    if (nameEl) nameEl.textContent = employeeName;
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">Загрузка...</div>';
    modal.style.display = 'block';

    const result = await getActivityLog(employeeName);
    if (!result.success || result.data.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">История пуста</div>';
        return;
    }

    listEl.innerHTML = result.data.map(entry => {
        const dateStr = new Date(entry.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `
            <div style="border-left: 3px solid #3b82f6; padding: 8px 14px; margin-bottom: 10px;">
                <div style="font-size: 0.95rem; color: #1e293b;">${escapeHtml(entry.description)}</div>
                <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">${dateStr}</div>
            </div>
        `;
    }).join('');
}

async function addGlobalEmployee() {
    const name = document.getElementById("newEmpName")?.value.trim();
    const surname = document.getElementById("newEmpSurname")?.value.trim();

    if (!name || !surname) {
        alert("Введите имя и фамилию");
        return;
    }

    const fullName = `${name} ${surname}`;

    // ====== ПРОВЕРКА НА ДУБЛИ ======
    // Сравниваем без учёта регистра и лишних пробелов — раньше "Иван Петров"
    // и "иван петров" считались разными людьми, из-за чего в базе копились
    // дубли (и звонки/график путались между ними).
    const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const existing = globalEmployees.find(e => normalize(e.fullName) === normalize(fullName));
    if (existing) {
        const proceed = confirm(
            `⚠️ Сотрудник с похожим именем уже есть: "${existing.fullName}".\n\n` +
            `Это точно другой человек? Если да — нажмите OK, чтобы добавить всё равно.`
        );
        if (!proceed) return;
    }

    const newEmployee = {
        name,
        surname,
        fullName,
        email: document.getElementById("newEmpEmail")?.value.trim() || "",
        phone: document.getElementById("newEmpPhone")?.value.trim() || ""
    };

    const result = await addEmployee(newEmployee);
    if (result.success && result.data) {
        newEmployee.id = result.data.id;
        globalEmployees.push(newEmployee);
    } else {
        globalEmployees.push(newEmployee);
    }

    renderGlobalEmployeesTable();
    updateAvailableEmployeesSelect();
    saveToLocalStorage();
    showNotification(`✅ Сотрудник "${fullName}" добавлен`, false);

    ["newEmpName", "newEmpSurname", "newEmpEmail", "newEmpPhone"].forEach(id => {
        if (document.getElementById(id)) document.getElementById(id).value = "";
    });
}

// ========================================
// УПРАВЛЕНИЕ ПВЗ
// ========================================

async function addNewPVZ() {
    if (!await checkAdminPassword()) return;
    let num = Object.keys(allPVZData).length + 1;
    let name = `ПВЗ ${num}`;
    while (allPVZData[name]) { num++; name = `ПВЗ ${num}`; }
    allPVZData[name] = { employeesHistory: {}, schedules: {} };
    
    await savePVZ(name, allPVZData[name]);
    
    await switchTab(name);
    saveToLocalStorage();
    showNotification(`✅ ПВЗ "${name}" добавлен`, false);
}

async function editCurrentPVZName() {
    if (!await checkAdminPassword()) return;
    const n = prompt("Новое название:", currentPVZ);
    if (n && n !== currentPVZ) {
        renamePVZ(currentPVZ, n);
    }
}

async function renamePVZ(oldName, newName) {
    if (!newName || newName === oldName || allPVZData[newName]) return false;
    allPVZData[newName] = allPVZData[oldName];
    delete allPVZData[oldName];
    
    await savePVZ(newName, allPVZData[newName]);
    await deletePVZ(oldName);
    
    if (currentPVZ === oldName) currentPVZ = newName;
    renderTabs();
    updatePVZEmployeesUI();
    renderSchedule();
    saveToLocalStorage();
    showNotification(`✅ ПВЗ переименован`, false);
    return true;
}

async function deleteCurrentPVZ() {
    if (!await checkAdminPassword() || Object.keys(allPVZData).length === 1) return;
    if (confirm(`Удалить "${currentPVZ}"?`)) {
        const deletedName = currentPVZ;
        await deletePVZ(deletedName);
        delete allPVZData[currentPVZ];
        currentPVZ = Object.keys(allPVZData)[0];
        renderTabs();
        updatePVZEmployeesUI();
        populateMonthSelect();
        renderSchedule();
        saveToLocalStorage();
        showNotification(`❌ ПВЗ удалён`, false);
    }
}

// ========================================
// РАБОТА С ГРАФИКОМ (КЛИК ПО ЯЧЕЙКЕ)
// ========================================

async function toggleStatus(e) {
    if (!isAdminUnlocked) {
        if (!(await unlockAdminSession())) {
            showNotification('❌ Изменение графика доступно только администратору', true);
            return;
        }
    }

    let target = e.target;
    while (target && target.tagName !== 'TD') target = target.parentElement;
    if (!target || target.classList.contains('employee-col')) return;

    const emp = target.dataset.employee;
    const year = parseInt(target.dataset.year);
    const month = parseInt(target.dataset.month);
    const day = parseInt(target.dataset.day);
    const currentStatus = target.dataset.status === 'true';
    const newStatus = !currentStatus;

    if (newStatus === true) {
        const conflictPVZ = findEmployeeInOtherPVZ(emp, year, month, day, currentPVZ);
        
        if (conflictPVZ) {
            alert(
                `⚠️ Внимание! ${emp} уже работает ${day}.${month}.${year} в ПВЗ "${conflictPVZ}".\n\n` +
                `Сотрудник не может работать в один день на разных ПВЗ.\n` +
                `Сначала удалите смену в "${conflictPVZ}", затем назначьте здесь.`
            );
            showNotification(`❌ ${emp} уже работает в ${conflictPVZ}`, true);
            return;
        }

        const existingEmployee = findEmployeeOnDay(currentPVZ, year, month, day);
        
        if (existingEmployee && existingEmployee !== emp) {
            const confirmReplace = confirm(
                `⚠️ На ${day}.${month}.${year} в ПВЗ "${currentPVZ}" уже работает ${existingEmployee}.\n\n` +
                `Заменить на ${emp}?`
            );
            
            if (!confirmReplace) {
                showNotification(`❌ Смена не изменена`, true);
                return;
            }
            
            if (!allPVZData[currentPVZ].schedules[existingEmployee]) {
                allPVZData[currentPVZ].schedules[existingEmployee] = {};
            }
            allPVZData[currentPVZ].schedules[existingEmployee][`${year}-${month}-${day}`] = false;
            
            await saveSchedule(currentPVZ, existingEmployee, year, month, day, false);
        }
    }

    if (!allPVZData[currentPVZ].schedules[emp]) {
        allPVZData[currentPVZ].schedules[emp] = {};
    }

    allPVZData[currentPVZ].schedules[emp][`${year}-${month}-${day}`] = newStatus;
    
    await saveSchedule(currentPVZ, emp, year, month, day, newStatus);
    
    if (newStatus === true) {
        showNotification(`✅ ${emp} назначен на ${day}.${month}.${year} в ${currentPVZ}`, false);
    } else {
        showNotification(`❌ ${emp} убран с ${day}.${month}.${year}`, false);
    }
    
    renderSchedule();
    saveToLocalStorage();
}

// ========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ========================================

function findEmployeeOnDay(pvzName, year, month, day) {
    const employees = getEmployeesForMonth(pvzName, year, month);
    const dayKey = `${year}-${month}-${day}`;
    
    for (let emp of employees) {
        if (allPVZData[pvzName].schedules[emp]?.[dayKey] === true) {
            return emp;
        }
    }
    return null;
}

function findEmployeeInOtherPVZ(employeeName, year, month, day, excludePVZ) {
    const dayKey = `${year}-${month}-${day}`;
    
    for (let pvzName in allPVZData) {
        if (pvzName === excludePVZ) continue;
        if (allPVZData[pvzName].schedules[employeeName]?.[dayKey] === true) {
            return pvzName;
        }
    }
    return null;
}

// ========================================
// РАСЧЁТ ЗАРПЛАТЫ
// ========================================

function getEmployeeMonthData(employeeName, year, month) {
    const monthKey = getMonthKey(year, month);
    if (!salaryData[employeeName]) salaryData[employeeName] = {};
    if (!salaryData[employeeName][monthKey]) {
        salaryData[employeeName][monthKey] = { 
            rate: 1500, 
            traineeDays: 0, 
            traineeRate: 800, 
            advance: 0, 
            moneyTransferred: 0, 
            fine: 0 
        };
    }
    return salaryData[employeeName][monthKey];
}

function calculateWorkDaysForEmployee(employeeFullName, year, month) {
    let totalWorkDays = 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let pvzName in allPVZData) {
        const schedules = allPVZData[pvzName].schedules[employeeFullName];
        if (!schedules) continue;
        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${year}-${month}-${day}`;
            if (schedules[key] === true) totalWorkDays++;
        }
    }
    return totalWorkDays;
}

function calculateTotalExtraForMonth(employeeFullName, year, month) {
    let total = 0;
    const works = extraWorks[employeeFullName] || [];
    for (let work of works) {
        const [workYear, workMonth] = work.date.split('-');
        if (parseInt(workYear) === year && parseInt(workMonth) === month) {
            total += work.amount || 0;
        }
    }
    return total;
}

function calculateTotalFinesForMonth(employeeFullName, year, month) {
    let total = 0;
    const employeeFines = fines[employeeFullName] || [];
    for (let fine of employeeFines) {
        const [fineYear, fineMonth] = fine.date.split('-');
        if (parseInt(fineYear) === year && parseInt(fineMonth) === month) {
            total += fine.amount || 0;
        }
    }
    return total;
}

function calculateNetSalary(empFullName, year, month) {
    const monthData = getEmployeeMonthData(empFullName, year, month);
    const workDays = calculateWorkDaysForEmployee(empFullName, year, month);
    const baseSalary = workDays * monthData.rate;
    const traineeBonus = monthData.traineeDays * monthData.traineeRate;
    const extraAmount = calculateTotalExtraForMonth(empFullName, year, month);
    const totalFines = calculateTotalFinesForMonth(empFullName, year, month);
    monthData.fine = totalFines;
    const total = baseSalary + extraAmount + traineeBonus - monthData.advance - monthData.moneyTransferred - totalFines;
    return Math.max(0, total);
}

function populateDashboardMonthSelect() {
    const select = document.getElementById("dashboardMonthSelect");
    if (!select) return;

    const now = new Date();
    select.innerHTML = '';
    const currentYear = now.getFullYear();
    const startYear = currentYear - 2;
    const endYear = Math.max(2030, currentYear + 2);

    for (let year = startYear; year <= endYear; year++) {
        for (let month = 1; month <= 12; month++) {
            const option = document.createElement("option");
            option.value = `${year}-${month}`;
            option.textContent = `${getMonthName(month)} ${year}`;
            if (year === currentDashboardYear && month === currentDashboardMonth) option.selected = true;
            select.appendChild(option);
        }
    }
}

function renderSalaryTable() {
    const tbody = document.getElementById("salaryTableBody");
    if (!tbody) return;

    tbody.innerHTML = '';
    let totalMonthSalary = 0;

    for (let emp of globalEmployees) {
        const monthData = getEmployeeMonthData(emp.fullName, currentDashboardYear, currentDashboardMonth);
        const workDays = calculateWorkDaysForEmployee(emp.fullName, currentDashboardYear, currentDashboardMonth);
        const extraThisMonth = calculateTotalExtraForMonth(emp.fullName, currentDashboardYear, currentDashboardMonth);
        const finesThisMonth = calculateTotalFinesForMonth(emp.fullName, currentDashboardYear, currentDashboardMonth);
        const netSalary = calculateNetSalary(emp.fullName, currentDashboardYear, currentDashboardMonth);
        totalMonthSalary += netSalary;

        const row = tbody.insertRow();
        row.insertCell(0).innerHTML = `<strong>${escapeHtml(emp.fullName)}</strong>`;
        row.insertCell(1).innerHTML = `<span class="readonly-cell" style="display:inline-block; width:100%; text-align:center; font-weight:700;">${workDays}</span>`;
        row.insertCell(2).innerHTML = `<input type="number" class="salary-rate" data-name="${emp.fullName}" value="${monthData.rate}" step="100">`;
        row.insertCell(3).innerHTML = `<span class="extra-display" style="font-weight:700; color:#2563eb;">${extraThisMonth}</span>`;
        row.insertCell(4).innerHTML = `<input type="number" class="salary-trainee-days" data-name="${emp.fullName}" value="${monthData.traineeDays}" step="1">`;
        row.insertCell(5).innerHTML = `<input type="number" class="salary-trainee-rate" data-name="${emp.fullName}" value="${monthData.traineeRate}" step="100">`;
        row.insertCell(6).innerHTML = `<input type="number" class="salary-advance" data-name="${emp.fullName}" value="${monthData.advance}" step="500">`;
        row.insertCell(7).innerHTML = `<input type="number" class="salary-money-transferred" data-name="${emp.fullName}" value="${monthData.moneyTransferred}" step="500">`;
        row.insertCell(8).innerHTML = `<span class="fine-display" style="font-weight:700; color:#dc2626;">${finesThisMonth}</span>`;
        row.insertCell(9).innerHTML = `<span class="net-salary-amount" data-name="${emp.fullName}" style="font-weight:700; color:#15803d;">${netSalary} ₽</span>`;
    }

    const totalSpan = document.getElementById("totalSalaryAmount");
    if (totalSpan) totalSpan.innerText = totalMonthSalary.toLocaleString('ru-RU');

    document.querySelectorAll('#salaryTableBody input').forEach(input => {
        input.addEventListener('change', async function() {
            const empName = this.getAttribute('data-name');
            if (empName) {
                const monthData = getEmployeeMonthData(empName, currentDashboardYear, currentDashboardMonth);
                let fieldLabel = '';
                if (this.classList.contains('salary-rate')) { monthData.rate = parseFloat(this.value) || 0; fieldLabel = 'ставка'; }
                if (this.classList.contains('salary-trainee-days')) { monthData.traineeDays = parseFloat(this.value) || 0; fieldLabel = 'дни стажёра'; }
                if (this.classList.contains('salary-trainee-rate')) { monthData.traineeRate = parseFloat(this.value) || 0; fieldLabel = 'ставка стажёра'; }
                if (this.classList.contains('salary-advance')) { monthData.advance = parseFloat(this.value) || 0; fieldLabel = 'аванс'; }
                if (this.classList.contains('salary-money-transferred')) { monthData.moneyTransferred = parseFloat(this.value) || 0; fieldLabel = 'перевод на счёт'; }

                const newNetSalary = calculateNetSalary(empName, currentDashboardYear, currentDashboardMonth);
                const netSpan = document.querySelector(`.net-salary-amount[data-name="${empName}"]`);
                if (netSpan) netSpan.innerText = `${newNetSalary} ₽`;

                let total = 0;
                document.querySelectorAll('.net-salary-amount').forEach(el => {
                    const val = parseFloat(el.innerText);
                    if (!isNaN(val)) total += val;
                });
                const totalSpan = document.getElementById("totalSalaryAmount");
                if (totalSpan) totalSpan.innerText = total.toLocaleString('ru-RU');

                saveToLocalStorage();

                // ====== СОХРАНЯЕМ В SUPABASE ======
                const saveResult = await saveSalary(empName, currentDashboardYear, currentDashboardMonth, monthData);
                if (!saveResult.success) {
                    console.warn('⚠️ Не удалось сохранить расчёт зарплаты в Supabase:', saveResult.error);
                } else if (fieldLabel) {
                    await logActivity(empName, 'salary', `Изменено поле «${fieldLabel}»: ${this.value}`);
                }
            }
        });
    });
}

// ========================================
// АНАЛИТИКА
// ========================================

function populateAnalyticsSelects() {
    const yearSelect = document.getElementById('analyticsYearSelect');
    const monthSelect = document.getElementById('analyticsMonthSelect');
    if (!yearSelect || !monthSelect) return;

    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let year = currentYear - 5; year <= currentYear + 5; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === analyticsYear) option.selected = true;
        yearSelect.appendChild(option);
    }

    monthSelect.innerHTML = '';
    for (let month = 1; month <= 12; month++) {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = getMonthName(month);
        if (month === analyticsMonth) option.selected = true;
        monthSelect.appendChild(option);
    }
}

function renderAnalytics() {
    const tbody = document.getElementById("analyticsTableBody");
    const thead = document.getElementById("analyticsTableHeader");
    if (!tbody || !thead) return;

    const daysInMonth = new Date(analyticsYear, analyticsMonth, 0).getDate();
    const today = new Date();
    const isCurrentMonth = (today.getFullYear() === analyticsYear && (today.getMonth() + 1) === analyticsMonth);
    const todayDate = today.getDate();

    let headerHtml = `<tr><th style="min-width: 140px; position: sticky; left: 0; background: #1e293b; z-index: 20;">👤 Сотрудник</th>`;
    for (let day = 1; day <= daysInMonth; day++) {
        const dayOfWeek = getDayOfWeek(analyticsYear, analyticsMonth, day);
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const isToday = isCurrentMonth && todayDate === day;
        
        let bgStyle = '';
        let textColor = '';
        let extraClass = '';
        
        if (isWeekend) {
            bgStyle = 'background: #991b1b;';
        }
        if (isToday) {
            bgStyle = 'background: #f59e0b;';
            textColor = 'color: white;';
            extraClass = 'today-column-header';
        }
        
        headerHtml += `<th style="${bgStyle} ${textColor} width: 70px;" class="${extraClass}">
            <div style="font-weight: ${isToday ? '700' : '400'};">${day}</div>
            <div style="font-size: 0.65rem; opacity: 0.8;">${["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][dayOfWeek]}</div>
        </th>`;
    }
    headerHtml += '<th style="min-width: 70px;">📊 Дней</th></tr>';
    thead.innerHTML = headerHtml;

    tbody.innerHTML = '';

    // ====== СПИСКИ СОТРУДНИКОВ КАЖДОГО ПВЗ НА ЭТОТ МЕСЯЦ ======
    // Считаем рабочим днём только если сотрудник ДЕЙСТВИТЕЛЬНО состоит
    // в списке этого ПВЗ на выбранный месяц — иначе Аналитика может
    // показывать "фантомные" рабочие дни из старых/неактуальных данных,
    // которых уже нет в самом графике ПВЗ.
    const pvzRosters = {};
    for (let pvz in allPVZData) {
        pvzRosters[pvz] = new Set(getEmployeesForMonth(pvz, analyticsYear, analyticsMonth));
    }

    // ====== ФИЛЬТРАЦИЯ ПО ПОИСКУ ======
    const term = (analyticsSearchTerm || '').trim().toLowerCase();
    const filteredEmployees = term
        ? globalEmployees.filter(emp => emp.fullName.toLowerCase().includes(term))
        : globalEmployees;

    if (filteredEmployees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${daysInMonth + 2}" style="text-align:center;padding:30px;color:#94a3b8;">Сотрудники не найдены</td></tr>`;
        return;
    }

    for (let emp of filteredEmployees) {
        let rowHtml = `<tr><td class="employee-name-cell" style="position: sticky; left: 0; background: #f8fafc; z-index: 5;">${escapeHtml(emp.fullName)}</td>`;
        let workDaysCount = 0;

        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = isCurrentMonth && todayDate === day;
            const dayOfWeek = getDayOfWeek(analyticsYear, analyticsMonth, day);
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            
            let pvzName = '';
            let colorClass = '';

            for (let pvz in allPVZData) {
                const key = `${analyticsYear}-${analyticsMonth}-${day}`;
                if (allPVZData[pvz].schedules[emp.fullName]?.[key] === true && pvzRosters[pvz]?.has(emp.fullName)) {
                    pvzName = pvz;
                    workDaysCount++;
                    colorClass = getPVZColorClass(pvz);
                    break;
                }
            }

            let cellClass = colorClass;
            let cellContent = '';
            
            if (isToday) {
                cellClass += ' today-column-analytics';
            }
            
            if (pvzName) {
                let shortName = pvzName.length > 12 ? pvzName.substring(0, 10) + '..' : pvzName;
                cellContent = `<div class="work-badge">✅</div><span class="pvz-name-small">${escapeHtml(shortName)}</span>`;
            } else {
                cellContent = `<div class="off-badge">❌</div>`;
            }
            
            if (isWeekend && !isToday) {
                cellClass += ' weekend-cell';
            }
            
            rowHtml += `<td class="${cellClass}" style="vertical-align: middle;">${cellContent}</td>`;
        }

        rowHtml += `<td style="text-align: center; font-weight: 700; background: #e0f2fe;">${workDaysCount}</td></tr>`;
        tbody.innerHTML += rowHtml;
    }
}

function getPVZColorClass(pvzName) {
    const colors = {
        "ПВЗ Центральный": "pvz-color-0",
        "ПВЗ Северный": "pvz-color-1",
        "ПВЗ Южный": "pvz-color-2",
        "ПВЗ Восточный": "pvz-color-3"
    };
    return colors[pvzName] || "pvz-color-default";
}

// ========================================
// ЭКСТРЕННЫЕ КОНТАКТЫ
// ========================================

function loadPublicEmergencyForm() {
    populatePublicEmployeeSelect();
    clearPublicEmergencyForm();
}

function populatePublicEmployeeSelect() {
    const select = document.getElementById("publicEmployeeSelect");
    if (!select) return;
    select.innerHTML = '<option value="">-- Выберите сотрудника из списка --</option>';
    globalEmployees.forEach(emp => {
        const option = document.createElement("option");
        option.value = emp.fullName;
        option.textContent = emp.fullName;
        select.appendChild(option);
    });
}

function clearPublicEmergencyForm() {
    document.getElementById("publicEmployeeSelect").value = "";
    document.getElementById("publicEmployeeAddress").value = "";
    const container = document.getElementById("publicContactsContainer");
    if (container) {
        container.innerHTML = `
            <div class="emergency-form-row contact-row">
                <input type="text" class="contact-name-input" placeholder="ФИО контакта *">
                <input type="text" class="contact-phone-input" placeholder="Телефон *">
                <input type="text" class="contact-relation-input" placeholder="Кем приходится">
                <button type="button" class="delete-contact-btn remove-contact-row" style="display: none;">✕</button>
            </div>
        `;
    }
}

// ========================================
// СОХРАНЕНИЕ ЭКСТРЕННЫХ КОНТАКТОВ (ОДИН РАЗ + АДМИН)
// ========================================

async function savePublicEmergencyContacts() {
    const selectedEmployee = document.getElementById("publicEmployeeSelect").value;
    if (!selectedEmployee) { alert("Выберите сотрудника"); return; }

    const address = document.getElementById("publicEmployeeAddress").value.trim();
    if (!address) { alert("Введите место проживания"); return; }

    const contacts = [];
    const rows = document.querySelectorAll('#publicContactsContainer .contact-row');
    rows.forEach(row => {
        const name = row.querySelector('.contact-name-input')?.value.trim();
        const phone = row.querySelector('.contact-phone-input')?.value.trim();
        const relation = row.querySelector('.contact-relation-input')?.value.trim();
        if (name && phone) {
            contacts.push({ 
                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                contactName: name, 
                contactPhone: phone, 
                relation: relation || '' 
            });
        }
    });

    if (contacts.length === 0) {
        alert("Заполните хотя бы один контакт");
        return;
    }

    // ====== ПРОВЕРКА: есть ли уже контакты у сотрудника ======
    if (emergencyContacts[selectedEmployee]) {
        // ====== ПРОВЕРКА: кто пытается изменить? ======
        const isAdmin = await checkAdminPassword();
        
        if (!isAdmin) {
            // Сотрудник пытается изменить — блокируем
            alert(
                `❌ У сотрудника "${selectedEmployee}" уже есть экстренные контакты.\n\n` +
                `Изменить их может только администратор.\n` +
                `Пожалуйста, обратитесь к управляющему.\n\n` +
                `📞 Свяжитесь с администратором для внесения изменений.`
            );
            showNotification('❌ Изменение контактов доступно только администратору', true);
            return;
        }
        
        // Администратор — разрешаем с подтверждением
        const confirmOverwrite = confirm(
            `⚠️ У сотрудника "${selectedEmployee}" уже есть экстренные контакты.\n\n` +
            `Вы уверены, что хотите перезаписать их?`
        );
        if (!confirmOverwrite) {
            showNotification('❌ Сохранение отменено', true);
            return;
        }
    }

    // ====== СОХРАНЯЕМ ======
    if (!emergencyContacts[selectedEmployee]) {
        emergencyContacts[selectedEmployee] = { address: "", contacts: [], documents: {} };
    }
    emergencyContacts[selectedEmployee].address = address;
    emergencyContacts[selectedEmployee].contacts = contacts;

    saveToLocalStorage();

    // ====== СОХРАНЯЕМ В SUPABASE (чтобы не потерять и видеть с любого устройства) ======
    const existingDocuments = emergencyContacts[selectedEmployee].documents || {};
    const saveResult = await saveEmergencyContact(selectedEmployee, address, contacts, existingDocuments);
    if (!saveResult.success) {
        console.warn('⚠️ Не удалось сохранить экстренные контакты в Supabase:', saveResult.error);
    }

    showNotification("✅ Экстренные контакты сохранены!", false);
    clearPublicEmergencyForm();
}

// ========================================
// ПРОВЕРКА ПАРОЛЯ
// ========================================

async function checkAdminPassword() {
    const pwd = prompt("Введите пароль администратора:");
    if (pwd === null) return false; // отмена ввода
    const result = await verifyPassword('admin', pwd);
    return result.valid;
}

// Разблокировка на сессию: пароль спрашивается один раз, дальше
// (пока страница не перезагружена) доступ к Дашборду и кнопкам
// управления сотрудниками открыт без повторного ввода.
async function unlockAdminSession() {
    if (isAdminUnlocked) return true;
    if (await checkAdminPassword()) {
        isAdminUnlocked = true;
        return true;
    }
    return false;
}

// ========================================
// ПОКАЗАТЬ ПОДВКЛАДКУ СОТРУДНИКОВ
// ========================================

function showEmployeesSubtab(subtabId) {
    document.getElementById("employeesListSubtab").style.display = subtabId === 'list' ? 'block' : 'none';
    document.getElementById("employeesEmergencySubtab").style.display = subtabId === 'emergency' ? 'block' : 'none';

    document.querySelectorAll('.employees-sub-tab').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-employees-subtab') === subtabId) {
            btn.classList.add('active');
        }
    });

    if (subtabId === 'emergency') {
        loadPublicEmergencyForm();
    }
}

// ========================================
// ДОБАВЛЕНИЕ СОТРУДНИКА В ПВЗ (БЕЗ ПРОВЕРОК)
// ========================================

async function addEmployeeToPVZ() {
    if (!(await unlockAdminSession())) {
        showNotification('❌ Изменение графика доступно только администратору', true);
        return;
    }

    const empFullName = document.getElementById("availableEmployeesSelect").value;
    if (!empFullName) { alert("Выберите сотрудника"); return; }

    const currentEmps = getEmployeesForMonth(currentPVZ, selectedYear, selectedMonth);
    
    // ====== ДОБАВЛЯЕМ БЕЗ ВСЯКИХ ПРОВЕРОК ======
    // Сотрудник может работать на разных ПВЗ в разные дни
    // Ограничения только на уровне графика (нельзя работать в один день на двух ПВЗ)
    
    if (!currentEmps.includes(empFullName)) {
        addEmployeeToMonth(currentPVZ, selectedYear, selectedMonth, empFullName);
        updatePVZEmployeesUI();
        renderSchedule();
        
        // Сохраняем в Supabase
        const pvzData = allPVZData[currentPVZ];
        await savePVZ(currentPVZ, pvzData);
        
        saveToLocalStorage();
        showNotification(`✅ ${empFullName} добавлен в ПВЗ "${currentPVZ}"`, false);
    } else {
        alert("Сотрудник уже добавлен в этом месяце");
    }
}

// ========================================
// УДАЛЕНИЕ СОТРУДНИКА ИЗ ПВЗ (С СОХРАНЕНИЕМ В SUPABASE)
// ========================================

async function removeEmployeeFromPVZ(empFullName) {
    if (!(await unlockAdminSession())) {
        showNotification('❌ Изменение графика доступно только администратору', true);
        return;
    }
    if (!confirm(`Удалить "${empFullName}" из ПВЗ "${currentPVZ}" за ${getMonthName(selectedMonth)} ${selectedYear}?`)) return;

    removeEmployeeFromMonth(currentPVZ, selectedYear, selectedMonth, empFullName);
    updatePVZEmployeesUI();
    renderSchedule();
    
    // ====== СОХРАНЯЕМ В SUPABASE ======
    const pvzData = allPVZData[currentPVZ];
    await savePVZ(currentPVZ, pvzData);

    // ====== ЧИСТИМ РЕЛЯЦИОННУЮ ТАБЛИЦУ schedules ======
    // Именно её читает серверная функция звонков — без этого шага
    // звонки могли продолжать идти по уже убранному сотруднику.
    const scheduleCleanResult = await deleteScheduleForEmployeeMonth(currentPVZ, empFullName, selectedYear, selectedMonth);
    if (!scheduleCleanResult.success) {
        console.warn('⚠️ Не удалось очистить таблицу schedules при удалении сотрудника с ПВЗ:', scheduleCleanResult.error);
    }
    
    saveToLocalStorage();
    showNotification(`❌ ${empFullName} удалён из ПВЗ`, false);
}

// ========================================
// ПОДРАБОТКИ
// ========================================

function populateExtraSelects() {
    const empSelect = document.getElementById('extraEmployeeSelect');
    if (empSelect) {
        empSelect.innerHTML = '<option value="">-- Выберите --</option>';
        globalEmployees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.fullName;
            option.textContent = emp.fullName;
            empSelect.appendChild(option);
        });
    }
    
    const pvzSelect = document.getElementById('extraPVZSelect');
    if (pvzSelect) {
        pvzSelect.innerHTML = '<option value="">-- Выберите --</option>';
        for (let pvzName in allPVZData) {
            const option = document.createElement('option');
            option.value = pvzName;
            option.textContent = pvzName;
            pvzSelect.appendChild(option);
        }
    }
}

function renderExtraWorksTable() {
    const tbody = document.getElementById('extraWorkTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    for (let empName in extraWorks) {
        const works = extraWorks[empName] || [];
        works.forEach((work, index) => {
            const row = tbody.insertRow();
            const amount = (work.hours || 0) * (work.hourlyRate || 200);
            
            row.insertCell(0).textContent = empName;
            row.insertCell(1).textContent = work.pvz || '—';
            row.insertCell(2).textContent = work.date || '—';
            row.insertCell(3).textContent = work.hours || 0;
            row.insertCell(4).textContent = work.hourlyRate || 200;
            row.insertCell(5).textContent = work.description || '—';
            row.insertCell(6).textContent = amount + ' ₽';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.onclick = () => deleteExtraWork(empName, index);
            const cell = row.insertCell(7);
            cell.appendChild(deleteBtn);
        });
    }
    
    if (tbody.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8;">Нет подработок</td></tr>';
    }
}

async function addExtraWork() {
    const employee = document.getElementById('extraEmployeeSelect')?.value;
    const pvz = document.getElementById('extraPVZSelect')?.value;
    const date = document.getElementById('extraDate')?.value;
    const hours = parseFloat(document.getElementById('extraHours')?.value) || 0;
    const hourlyRate = parseFloat(document.getElementById('extraHourlyRate')?.value) || 200;
    const description = document.getElementById('extraDesc')?.value.trim() || '';
    
    if (!employee) {
        showNotification('❌ Выберите сотрудника', true);
        return;
    }
    if (!pvz) {
        showNotification('❌ Выберите ПВЗ', true);
        return;
    }
    if (!date) {
        showNotification('❌ Выберите дату', true);
        return;
    }
    if (hours <= 0) {
        showNotification('❌ Введите количество часов', true);
        return;
    }
    
    if (!extraWorks[employee]) {
        extraWorks[employee] = [];
    }

    // ====== СОХРАНЯЕМ В SUPABASE (Supabase сам создаёт id) ======
    const saveResult = await saveExtraWork(employee, pvz, date, hours, hourlyRate, description);
    const newId = saveResult.success && saveResult.data ? saveResult.data.id : Date.now().toString();
    if (!saveResult.success) {
        console.warn('⚠️ Не удалось сохранить подработку в Supabase:', saveResult.error);
    }

    extraWorks[employee].push({
        id: newId,
        pvz: pvz,
        date: date,
        hours: hours,
        hourlyRate: hourlyRate,
        description: description,
        amount: hours * hourlyRate
    });
    
    saveToLocalStorage();
    renderExtraWorksTable();
    renderSalaryTable();
    
    showNotification(`✅ Подработка добавлена для ${employee}`, false);
    await logActivity(employee, 'extra_work', `Добавлена подработка: ${hours} ч × ${hourlyRate} ₽ (${date})`);
    
    document.getElementById('extraDate').value = '';
    document.getElementById('extraHours').value = '';
    document.getElementById('extraDesc').value = '';
}

async function deleteExtraWork(employee, index) {
    if (!confirm(`Удалить подработку для ${employee}?`)) return;
    
    if (extraWorks[employee] && extraWorks[employee][index]) {
        const entry = extraWorks[employee][index];

        // ====== УДАЛЯЕМ ИЗ SUPABASE ======
        const deleteResult = await deleteExtraWorkRemote(entry.id);
        if (!deleteResult.success) {
            console.warn('⚠️ Не удалось удалить подработку из Supabase:', deleteResult.error);
        }

        extraWorks[employee].splice(index, 1);
        if (extraWorks[employee].length === 0) {
            delete extraWorks[employee];
        }
        saveToLocalStorage();
        renderExtraWorksTable();
        renderSalaryTable();
        showNotification('✅ Подработка удалена', false);
        await logActivity(employee, 'extra_work', `Удалена подработка от ${entry.date}`);
    }
}

// ========================================
// ШТРАФЫ
// ========================================

function populateFineSelects() {
    const empSelect = document.getElementById('fineEmployeeSelect');
    if (empSelect) {
        empSelect.innerHTML = '<option value="">-- Выберите --</option>';
        globalEmployees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.fullName;
            option.textContent = emp.fullName;
            empSelect.appendChild(option);
        });
    }
}

function renderFinesTable() {
    const tbody = document.getElementById('finesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    for (let empName in fines) {
        const finesList = fines[empName] || [];
        finesList.forEach((fine, index) => {
            const row = tbody.insertRow();
            
            row.insertCell(0).textContent = empName;
            row.insertCell(1).textContent = fine.date || '—';
            row.insertCell(2).textContent = (fine.amount || 0) + ' ₽';
            row.insertCell(3).textContent = fine.description || '—';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.onclick = () => deleteFine(empName, index);
            const cell = row.insertCell(4);
            cell.appendChild(deleteBtn);
        });
    }
    
    if (tbody.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">Нет штрафов</td></tr>';
    }
}

async function addFine() {
    const employee = document.getElementById('fineEmployeeSelect')?.value;
    const date = document.getElementById('fineDate')?.value;
    const amount = parseFloat(document.getElementById('fineAmount')?.value) || 0;
    const description = document.getElementById('fineDesc')?.value.trim() || '';
    
    if (!employee) {
        showNotification('❌ Выберите сотрудника', true);
        return;
    }
    if (!date) {
        showNotification('❌ Выберите дату', true);
        return;
    }
    if (amount <= 0) {
        showNotification('❌ Введите сумму штрафа', true);
        return;
    }
    
    if (!fines[employee]) {
        fines[employee] = [];
    }

    // ====== СОХРАНЯЕМ В SUPABASE (Supabase сам создаёт id) ======
    const saveResult = await saveFine(employee, date, amount, description);
    const newId = saveResult.success && saveResult.data ? saveResult.data.id : Date.now().toString();
    if (!saveResult.success) {
        console.warn('⚠️ Не удалось сохранить штраф в Supabase:', saveResult.error);
    }

    fines[employee].push({
        id: newId,
        date: date,
        amount: amount,
        description: description
    });
    
    saveToLocalStorage();
    renderFinesTable();
    renderSalaryTable();
    
    showNotification(`✅ Штраф добавлен для ${employee} на ${amount} ₽`, false);
    await logActivity(employee, 'fine', `Добавлен штраф ${amount} ₽ (${description || 'без причины'})`);
    
    document.getElementById('fineDate').value = '';
    document.getElementById('fineAmount').value = '';
    document.getElementById('fineDesc').value = '';
}

async function deleteFine(employee, index) {
    if (!confirm(`Удалить штраф для ${employee}?`)) return;
    
    if (fines[employee] && fines[employee][index]) {
        const entry = fines[employee][index];

        // ====== УДАЛЯЕМ ИЗ SUPABASE ======
        const deleteResult = await deleteFineRemote(entry.id);
        if (!deleteResult.success) {
            console.warn('⚠️ Не удалось удалить штраф из Supabase:', deleteResult.error);
        }

        fines[employee].splice(index, 1);
        if (fines[employee].length === 0) {
            delete fines[employee];
        }
        saveToLocalStorage();
        renderFinesTable();
        renderSalaryTable();
        showNotification('✅ Штраф удалён', false);
        await logActivity(employee, 'fine', `Удалён штраф ${entry.amount} ₽ от ${entry.date}`);
    }
}

// ========================================
// ЭКСТРЕННЫЕ КОНТАКТЫ (ДАШБОРД) С ФАЙЛАМИ
// ========================================

function renderEmergencyContactsList() {
    const container = document.getElementById('emergencyContactsList');
    if (!container) return;
    
    const searchInput = document.getElementById('emergencySearchInput');
    const searchTerm = searchInput?.value?.toLowerCase() || '';
    
    let html = '';
    let hasData = false;
    
    for (let empName in emergencyContacts) {
        const data = emergencyContacts[empName];
        const address = data.address || 'Не указан';
        const contacts = data.contacts || [];
        const documents = data.documents || {};
        const hasDocs = Object.keys(documents).length > 0;
        
        if (searchTerm && !empName.toLowerCase().includes(searchTerm)) {
            continue;
        }
        
        hasData = true;
        
        const docNames = {
            'passport': '🪪 Паспорт',
            'contract': '📄 Договор',
            'statement': '📝 Заявление'
        };
        
        let docsHtml = '';
        if (hasDocs) {
            docsHtml = '<div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">';
            for (const [type, doc] of Object.entries(documents)) {
                const label = docNames[type] || type;
                docsHtml += `
                    <button onclick="viewEmployeeFile('${empName}', '${type}')" style="background: #e0f2fe; border: none; padding: 2px 10px; border-radius: 12px; cursor: pointer; font-size: 0.7rem; color: #0369a1;">
                        ${label} ✅
                    </button>
                `;
            }
            docsHtml += '</div>';
        }
        
        html += `
            <div style="background: #f8fafc; padding: 16px; border-radius: 12px; margin-bottom: 12px; border-left: 4px solid #3b82f6;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <h4 style="font-size: 1rem; color: #1e293b;">👤 ${empName}</h4>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button onclick="editEmergencyContacts('${empName}')" style="background: #dbeafe; border: none; padding: 4px 14px; border-radius: 40px; cursor: pointer; font-size: 0.8rem; color: #2563eb;">✏️ Редактировать</button>
                        <button onclick="deleteEmergencyContacts('${empName}')" style="background: #fee2e2; border: none; padding: 4px 14px; border-radius: 40px; cursor: pointer; font-size: 0.8rem; color: #dc2626;">🗑️ Удалить</button>
                    </div>
                </div>
                <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">📍 ${address}</div>
                <div style="margin-top: 8px;">
                    <strong style="font-size: 0.8rem; color: #475569;">📞 Контакты:</strong>
                    ${contacts.map(c => `
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.85rem; padding: 4px 0;">
                            <span>${c.contactName}</span>
                            <span style="color: #3b82f6;">${c.contactPhone}</span>
                            ${c.relation ? `<span style="color: #94a3b8;">(${c.relation})</span>` : ''}
                        </div>
                    `).join('')}
                    ${contacts.length === 0 ? '<div style="color: #94a3b8; font-size: 0.8rem;">Нет контактов</div>' : ''}
                </div>
                ${docsHtml}
            </div>
        `;
    }
    
    if (!hasData) {
        html = `
            <div style="text-align:center;padding:40px;color:#94a3b8;">
                <div style="font-size: 2rem; margin-bottom: 10px;">🆘</div>
                <div>Нет данных об экстренных контактах</div>
                <div style="font-size: 0.85rem; margin-top: 8px;">Добавьте контакты во вкладке "Все сотрудники" → "Экстренные контакты"</div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ========================================
// УДАЛЕНИЕ ЭКСТРЕННЫХ КОНТАКТОВ (ТОЛЬКО ДЛЯ АДМИНИСТРАТОРА)
// ========================================

async function deleteEmergencyContacts(employeeName) {
    // ====== ПРОВЕРКА: только администратор может удалять ======
    if (!await checkAdminPassword()) {
        alert('❌ Только управляющий может удалять контакты!');
        return;
    }
    
    if (!confirm(`Вы уверены, что хотите удалить все экстренные контакты и документы для "${employeeName}"?`)) {
        return;
    }
    
    if (emergencyContacts[employeeName]) {
        delete emergencyContacts[employeeName];
        saveToLocalStorage();

        // ====== УДАЛЯЕМ ИЗ SUPABASE ======
        const deleteResult = await deleteEmergencyContact(employeeName);
        if (!deleteResult.success) {
            console.warn('⚠️ Не удалось удалить экстренные контакты из Supabase:', deleteResult.error);
        }

        renderEmergencyContactsList();
        showNotification(`✅ Контакты для "${employeeName}" удалены`, false);
    } else {
        showNotification(`❌ Контакты для "${employeeName}" не найдены`, true);
    }
}

// ========================================
// ФАЙЛЫ В ЭКСТРЕННЫХ КОНТАКТАХ
// ========================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
}

// ========================================
// ДОБАВЛЕНИЕ ФАЙЛА (ТОЛЬКО ДЛЯ АДМИНИСТРАТОРА)
// ========================================

async function addFileToEmployee(employeeName, fileType, file) {
    // ====== ПРОВЕРКА: только администратор может загружать файлы ======
    if (!await checkAdminPassword()) {
        alert('❌ Только управляющий может загружать документы!');
        return;
    }
    
    if (!employeeName) {
        showNotification('❌ Сначала выберите сотрудника', true);
        return;
    }
    
    if (!file) {
        showNotification('❌ Файл не выбран', true);
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showNotification('❌ Файл слишком большой! Максимум 5MB', true);
        return;
    }
    
    try {
        const base64Data = await fileToBase64(file);
        
        if (!emergencyContacts[employeeName]) {
            emergencyContacts[employeeName] = { address: "", contacts: [], documents: {} };
        }
        
        if (!emergencyContacts[employeeName].documents) {
            emergencyContacts[employeeName].documents = {};
        }
        
        emergencyContacts[employeeName].documents[fileType] = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64Data,
            uploadedAt: new Date().toISOString()
        };
        
        saveToLocalStorage();
        renderEmergencyContactsList();
        renderEmployeeDocuments(employeeName);
        showNotification(`✅ ${fileType} загружен для ${employeeName}`, false);
    } catch (error) {
        console.error('Ошибка загрузки файла:', error);
        showNotification('❌ Ошибка загрузки файла', true);
    }
}

// ========================================
// УДАЛЕНИЕ ФАЙЛА (ТОЛЬКО ДЛЯ АДМИНИСТРАТОРА)
// ========================================

async function deleteEmployeeFile(employeeName, fileType) {
    // ====== ПРОВЕРКА: только администратор может удалять файлы ======
    if (!await checkAdminPassword()) {
        alert('❌ Только управляющий может удалять файлы!');
        return;
    }
    
    if (!confirm(`Удалить "${fileType}" у сотрудника "${employeeName}"?`)) {
        return;
    }
    
    if (emergencyContacts[employeeName]?.documents?.[fileType]) {
        delete emergencyContacts[employeeName].documents[fileType];
        saveToLocalStorage();
        renderEmergencyContactsList();
        renderEmployeeDocuments(employeeName);
        showNotification(`✅ ${fileType} удалён`, false);
    }
}

// Отображение документов сотрудника
function renderEmployeeDocuments(employeeName) {
    const container = document.getElementById('employeeDocumentsContainer');
    if (!container) return;
    
    const data = emergencyContacts[employeeName];
    if (!data || !data.documents || Object.keys(data.documents).length === 0) {
        container.innerHTML = `
            <div style="color: #94a3b8; font-size: 0.9rem; padding: 12px 0;">
                📄 Нет загруженных документов
            </div>
        `;
        return;
    }
    
    const docNames = {
        'passport': '🪪 Паспорт',
        'contract': '📄 Договор',
        'statement': '📝 Заявление на расчёт'
    };
    
    let html = '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">';
    
    for (const [type, doc] of Object.entries(data.documents)) {
        const label = docNames[type] || type;
        const fileSize = (doc.size / 1024).toFixed(1);
        const uploadDate = new Date(doc.uploadedAt).toLocaleDateString('ru-RU');
        
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border-radius: 8px; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.2rem;">${doc.type.includes('image') ? '🖼️' : '📎'}</span>
                    <div>
                        <div style="font-weight: 600; font-size: 0.9rem;">${label}</div>
                        <div style="font-size: 0.75rem; color: #64748b;">
                            ${doc.name} (${fileSize} KB) • ${uploadDate}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button onclick="viewEmployeeFile('${employeeName}', '${type}')" style="background: #dbeafe; border: none; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.75rem; color: #2563eb;">👁️ Просмотр</button>
                    <button onclick="deleteEmployeeFile('${employeeName}', '${type}')" style="background: #fee2e2; border: none; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.75rem; color: #dc2626;">🗑️</button>
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// Просмотр файла
function viewEmployeeFile(employeeName, fileType) {
    const data = emergencyContacts[employeeName]?.documents?.[fileType];
    if (!data) {
        showNotification('❌ Файл не найден', true);
        return;
    }
    
    // Если это изображение — показываем в модалке
    if (data.type.startsWith('image/')) {
        const modal = document.getElementById('docViewerModal');
        const content = document.getElementById('docViewerContent');
        if (modal && content) {
            content.innerHTML = `
                <div style="text-align: center;">
                    <h3 style="margin-bottom: 12px;">${data.name}</h3>
                    <img src="${data.data}" style="max-width: 100%; max-height: 80vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="margin-top: 12px; color: #64748b; font-size: 0.85rem;">
                        ${(data.size / 1024).toFixed(1)} KB • Загружен: ${new Date(data.uploadedAt).toLocaleString('ru-RU')}
                    </div>
                </div>
            `;
            modal.style.display = 'block';
        }
    } else {
        // Для PDF и других файлов — скачиваем
        const link = document.createElement('a');
        link.href = data.data;
        link.download = data.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification(`📥 Скачивание ${data.name}...`, false);
    }
}

// Закрытие модалки просмотра
document.querySelector('.close-doc-modal')?.addEventListener('click', () => {
    document.getElementById('docViewerModal').style.display = 'none';
});

// Клик вне модалки для закрытия
document.getElementById('docViewerModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

// ========================================
// ОБРАБОТЧИК ЗАГРУЗКИ ФАЙЛОВ В МОДАЛКЕ
// ========================================

window.handleFileUpload = async function(employeeName, fileType, input) {
    const file = input.files[0];
    if (!file) return;
    
    await addFileToEmployee(employeeName, fileType, file);
    input.value = ''; // Сброс input
};

// ========================================
// РЕДАКТИРОВАНИЕ ЭКСТРЕННЫХ КОНТАКТОВ (ТОЛЬКО ДЛЯ АДМИНИСТРАТОРА)
// ========================================

window.editEmergencyContacts = async function(employeeName) {
    // ====== ПРОВЕРКА: только администратор может редактировать ======
    if (!await checkAdminPassword()) {
        alert('❌ Только управляющий может редактировать экстренные контакты!');
        return;
    }
    
    const data = emergencyContacts[employeeName] || { address: '', contacts: [], documents: {} };
    
    document.getElementById('editEmployeeName').textContent = employeeName;
    document.getElementById('editAddress').value = data.address || '';
    
    const container = document.getElementById('editContactsContainer');
    container.innerHTML = '';
    
    if (data.contacts && data.contacts.length > 0) {
        data.contacts.forEach((contact) => {
            const div = document.createElement('div');
            div.className = 'emergency-form-row contact-row';
            div.innerHTML = `
                <input type="text" class="edit-contact-name" value="${escapeHtml(contact.contactName)}" placeholder="ФИО контакта *">
                <input type="text" class="edit-contact-phone" value="${escapeHtml(contact.contactPhone)}" placeholder="Телефон *">
                <input type="text" class="edit-contact-relation" value="${escapeHtml(contact.relation || '')}" placeholder="Кем приходится">
                <button type="button" class="delete-contact-btn" onclick="this.closest('.contact-row').remove()">✕</button>
            `;
            container.appendChild(div);
        });
    } else {
        const div = document.createElement('div');
        div.className = 'emergency-form-row contact-row';
        div.innerHTML = `
            <input type="text" class="edit-contact-name" placeholder="ФИО контакта *">
            <input type="text" class="edit-contact-phone" placeholder="Телефон *">
            <input type="text" class="edit-contact-relation" placeholder="Кем приходится">
            <button type="button" class="delete-contact-btn" onclick="this.closest('.contact-row').remove()">✕</button>
        `;
        container.appendChild(div);
    }
    
    // Добавляем секцию для документов в модалке
    const docSection = document.createElement('div');
    docSection.id = 'editDocSection';
    docSection.style.marginTop = '16px';
    docSection.style.borderTop = '2px solid #f1f5f9';
    docSection.style.paddingTop = '16px';
    docSection.innerHTML = `
        <h4 style="font-size: 0.95rem; color: #1e293b; margin-bottom: 8px;">📄 Документы</h4>
        <div id="employeeDocumentsContainer" style="margin-bottom: 12px;"></div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <label style="background: #f1f5f9; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 0.8rem; border: 2px dashed #cbd5e1; transition: all 0.2s;">
                🪪 Паспорт
                <input type="file" accept="image/*,application/pdf" style="display: none;" onchange="handleFileUpload('${employeeName}', 'passport', this)">
            </label>
            <label style="background: #f1f5f9; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 0.8rem; border: 2px dashed #cbd5e1; transition: all 0.2s;">
                📄 Договор
                <input type="file" accept="image/*,application/pdf" style="display: none;" onchange="handleFileUpload('${employeeName}', 'contract', this)">
            </label>
            <label style="background: #f1f5f9; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 0.8rem; border: 2px dashed #cbd5e1; transition: all 0.2s;">
                📝 Заявление
                <input type="file" accept="image/*,application/pdf" style="display: none;" onchange="handleFileUpload('${employeeName}', 'statement', this)">
            </label>
        </div>
        <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 8px;">Поддерживаемые форматы: JPG, PNG, PDF (макс. 5MB)</div>
    `;
    container.parentNode.appendChild(docSection);
    
    // Отображаем уже загруженные документы
    renderEmployeeDocuments(employeeName);
    
    document.getElementById('editContactsModal').style.display = 'block';
    document.getElementById('saveEditBtn').dataset.employee = employeeName;
};

// ========================================
// МОДУЛЬ ЧЕКИН
// ========================================

function renderPvzTimeSettings() {
    const container = document.getElementById('pvzTimeList');
    if (!container) return;
    
    container.innerHTML = '';
    for (let pvzName in allPVZData) {
        const time = pvzOpenTimes[pvzName] || '09:00';
        const row = document.createElement('div');
        row.className = 'pvz-time-row';
        row.innerHTML = `
            <label>🏪 ${pvzName}</label>
            <input type="time" value="${time}" data-pvz="${pvzName}" class="pvz-time-input">
            <span style="font-size: 0.75rem; color: #64748b;">(открытие)</span>
        `;
        container.appendChild(row);
    }
}

// ========================================
// НОМЕРА РУКОВОДИТЕЛЯ ДЛЯ АВТОЗВОНКА
// ========================================

// ========================================
// БАЛАНС ZVONOK.COM
// ========================================

async function renderZvonokBalance() {
    const container = document.getElementById('zvonokBalanceBlock');
    if (!container) return;

    container.innerHTML = 'Загрузка баланса...';

    const result = await getZvonokBalance();

    if (!result.success || !result.data || result.data.balance === null) {
        container.innerHTML = '💳 Баланс zvonok.com пока неизвестен — появится после первого реального звонка.';
        return;
    }

    const balance = Number(result.data.balance).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const updatedAt = new Date(result.data.updated_at);
    const updatedStr = updatedAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

    container.innerHTML = `💳 Баланс zvonok.com: <strong>${balance} ₽</strong> <span style="opacity:0.75;">(по состоянию на последний звонок, ${updatedStr})</span>`;
}

function renderManagerPhonesList() {
    const container = document.getElementById('managerPhonesList');
    if (!container) return;

    if (managerPhones.length === 0) {
        container.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 8px 0;">Номера не добавлены</div>';
        return;
    }

    container.innerHTML = managerPhones.map(phone => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 8px 12px; border-radius: 10px; margin-bottom: 6px;">
            <span style="font-size: 0.9rem;">📞 +${escapeHtml(phone)}</span>
            <button onclick="deleteManagerPhoneHandler('${phone}')" style="background: #fee2e2; border: none; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.75rem; color: #dc2626;">🗑 Удалить</button>
        </div>
    `).join('');
}

async function addManagerPhoneHandler() {
    const input = document.getElementById('newManagerPhoneInput');
    if (!input) return;

    const cleanPhone = input.value.replace(/[^0-9]/g, '');

    if (!cleanPhone || cleanPhone.length < 10) {
        showNotification('❌ Введите корректный номер телефона', true);
        return;
    }

    if (managerPhones.includes(cleanPhone)) {
        showNotification('❌ Этот номер уже добавлен', true);
        return;
    }

    const result = await addManagerPhone(cleanPhone);
    if (!result.success) {
        showNotification('❌ Не удалось добавить номер', true);
        return;
    }

    managerPhones.push(cleanPhone);
    input.value = '';
    renderManagerPhonesList();
    showNotification('✅ Номер добавлен', false);
}

async function deleteManagerPhoneHandler(phone) {
    if (!await checkAdminPassword()) {
        alert('❌ Только управляющий может удалять номера!');
        return;
    }

    if (!confirm(`Удалить номер +${phone} из списка автозвонка?`)) {
        return;
    }

    const result = await deleteManagerPhone(phone);
    if (!result.success) {
        showNotification('❌ Не удалось удалить номер', true);
        return;
    }

    managerPhones = managerPhones.filter(p => p !== phone);
    renderManagerPhonesList();
    showNotification('✅ Номер удалён', false);
}

window.deleteManagerPhoneHandler = deleteManagerPhoneHandler;

// ========================================
// "ВАЖНО ЗНАТЬ" — СПИСОК ШТРАФОВ/ПРАВИЛ
// ========================================

function renderImportantNoticesList() {
    const container = document.getElementById('importantNoticesList');
    if (!container) return;

    if (importantNotices.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">Пока нет записей</div>';
        return;
    }

    container.innerHTML = importantNotices.map(notice => {
        const date = new Date(notice.created_at);
        const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const isNew = (Date.now() - date.getTime()) < (7 * 24 * 60 * 60 * 1000);
        const amountStr = notice.amount != null ? `${Number(notice.amount).toLocaleString('ru-RU')} ₽` : '';

        return `
            <div style="background: white; border: 2px solid ${isNew ? '#f59e0b' : '#e2e8f0'}; border-radius: 14px; padding: 16px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            ${isNew ? '<span style="background:#f59e0b;color:white;font-size:0.7rem;padding:2px 8px;border-radius:20px;">НОВОЕ</span>' : ''}
                            <span style="font-weight: 600; color: #1e293b;">${escapeHtml(notice.title)}</span>
                        </div>
                        ${amountStr ? `<div style="color: #dc2626; font-weight: 700; font-size: 1.1rem;">${amountStr}</div>` : ''}
                        <div style="color: #94a3b8; font-size: 0.8rem; margin-top: 4px;">${dateStr}</div>
                    </div>
                    <button onclick="deleteImportantNoticeHandler('${notice.id}')" style="background: #fee2e2; border: none; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.75rem; color: #dc2626; white-space: nowrap;">🗑 Удалить</button>
                </div>
            </div>
        `;
    }).join('');
}

async function addImportantNoticeHandler() {
    const titleInput = document.getElementById('newNoticeTitle');
    const amountInput = document.getElementById('newNoticeAmount');
    if (!titleInput) return;

    const title = titleInput.value.trim();
    const amount = amountInput.value ? Number(amountInput.value) : null;

    if (!title) {
        showNotification('❌ Укажите, за что штраф', true);
        return;
    }

    const result = await addImportantNotice(title, amount);
    if (!result.success) {
        showNotification('❌ Не удалось добавить запись', true);
        return;
    }

    importantNotices.unshift(result.data);
    titleInput.value = '';
    amountInput.value = '';
    renderImportantNoticesList();
    checkNewNoticeBanner();
    showNotification('✅ Запись добавлена', false);
}

async function deleteImportantNoticeHandler(id) {
    if (!await checkAdminPassword()) {
        alert('❌ Только управляющий может удалять записи!');
        return;
    }

    if (!confirm('Удалить эту запись?')) {
        return;
    }

    const result = await deleteImportantNotice(id);
    if (!result.success) {
        showNotification('❌ Не удалось удалить запись', true);
        return;
    }

    importantNotices = importantNotices.filter(n => n.id !== id);
    renderImportantNoticesList();
    checkNewNoticeBanner();
    showNotification('✅ Запись удалена', false);
}

window.deleteImportantNoticeHandler = deleteImportantNoticeHandler;

function checkNewNoticeBanner() {
    const banner = document.getElementById('newNoticeBanner');
    if (!banner) return;

    const hasRecent = importantNotices.some(notice => {
        const createdAt = new Date(notice.created_at).getTime();
        return (Date.now() - createdAt) < (7 * 24 * 60 * 60 * 1000);
    });

    banner.style.display = hasRecent ? 'block' : 'none';
}

async function toggleImportantAdmin() {
    if (!await checkAdminPassword()) {
        alert('❌ Только управляющий может добавлять записи!');
        return;
    }
    const form = document.getElementById('importantAdminForm');
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
}

async function loadCheckinData() {
    // ====== ЗАГРУЖАЕМ РЕАЛЬНЫЕ ЧЕКИНЫ ЗА СЕГОДНЯ ИЗ SUPABASE ======
    // Это та же таблица `checkins`, которую читает Edge Function на сервере,
    // поэтому статус в интерфейсе и статус, который видит Edge Function
    // при проверке пропусков, всегда совпадают.
    try {
        const todayKey = getTodayDateKey();
        const result = await getCheckinsForDate(todayKey);

        if (result.success) {
            // Сбрасываем статус всем — иначе "confirmed" за вчера мог бы
            // ошибочно остаться в локальных данных и сегодня
            globalEmployees.forEach(emp => {
                if (!checkinData[emp.fullName]) checkinData[emp.fullName] = {};
                checkinData[emp.fullName].today = { status: 'pending', time: null, pvz: null };
            });

            for (let empName in result.data) {
                if (!checkinData[empName]) checkinData[empName] = {};
                checkinData[empName].today = {
                    status: result.data[empName].status,
                    time: result.data[empName].time,
                    pvz: result.data[empName].pvz
                };
            }
        } else {
            console.warn('⚠️ Не удалось загрузить чекины из Supabase, используем локальные данные');
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки чекинов из Supabase:', error);
    }

    renderCheckinStatus();
    updateMyCheckinStatus();
}

function saveCheckinData() {
    saveToLocalStorage();
}

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const display = document.getElementById('currentTimeDisplay');
    if (display) display.textContent = timeStr;
    
    const dateDisplay = document.getElementById('todayDateDisplay');
    if (dateDisplay) dateDisplay.textContent = dateStr;
}

function isEmployeeWorkingToday(employeeFullName, pvzName) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    
    if (allPVZData[pvzName] && allPVZData[pvzName].schedules[employeeFullName]) {
        const key = `${year}-${month}-${day}`;
        return allPVZData[pvzName].schedules[employeeFullName][key] === true;
    }
    return false;
}

function getEmployeePVZToday(employeeFullName) {
    for (let pvzName in allPVZData) {
        if (isEmployeeWorkingToday(employeeFullName, pvzName)) {
            return pvzName;
        }
    }
    return null;
}

// ========================================
// ПРОВЕРКА ПРОПУСКОВ ЧЕКИНА
// ========================================

// Подтягивает актуальный график на СЕГОДНЯ по всем ПВЗ из Supabase и
// обновляет локальные данные в памяти. Нужно, чтобы открытая вкладка
// чекина не работала по устаревшему графику, если смены поменяли
// (переставили сотрудника, сняли смену) уже после того, как страница
// была открыта.
async function refreshTodaySchedule() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dayKey = `${year}-${month}-${day}`;

    const result = await getScheduleForDate(year, month, day);
    if (!result.success) return;

    // Сначала собираем, кто СЕЙЧАС реально работает сегодня (по свежим данным)
    const workingNow = new Set(); // "pvzName|employeeName"
    result.data.forEach(row => {
        if (row.is_working) {
            workingNow.add(`${row.pvz_name}|${row.employee_name}`);
        }
    });

    // Обновляем локальный кэш: снимаем отметку "работает сегодня" у всех,
    // кого нет в свежих данных, и проставляем тем, кто реально работает —
    // так перестановки/снятие смены подхватятся, даже если запись о смене
    // была вовсе удалена (а не просто помечена false) в базе.
    for (let pvzName in allPVZData) {
        if (!allPVZData[pvzName].schedules) continue;
        for (let empName in allPVZData[pvzName].schedules) {
            const isWorking = workingNow.has(`${pvzName}|${empName}`);
            if (allPVZData[pvzName].schedules[empName][dayKey] !== isWorking) {
                allPVZData[pvzName].schedules[empName][dayKey] = isWorking;
            }
        }
    }
    result.data.forEach(row => {
        if (!row.is_working) return;
        if (!allPVZData[row.pvz_name]) return;
        if (!allPVZData[row.pvz_name].schedules[row.employee_name]) {
            allPVZData[row.pvz_name].schedules[row.employee_name] = {};
        }
        allPVZData[row.pvz_name].schedules[row.employee_name][dayKey] = true;
    });
}

function checkMissedCheckins() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const dayKey = `${year}-${month}-${day}`;
    
    for (let emp of globalEmployees) {
        const empData = checkinData[emp.fullName];
        if (!empData || !empData.today) continue;
        
        let isWorkingToday = false;
        let workingPvz = null;
        
        for (let pvzName in allPVZData) {
            if (allPVZData[pvzName].schedules[emp.fullName]?.[dayKey] === true) {
                isWorkingToday = true;
                workingPvz = pvzName;
                break;
            }
        }
        
        if (!isWorkingToday) {
            if (empData.today.status === 'pending' || empData.today.status === 'missed') {
                empData.today.status = 'not-working';
                empData.today.pvz = null;
            }
            continue;
        }
        
        if (empData.today.status === 'confirmed') continue;
        
        const openTime = pvzOpenTimes[workingPvz] || '09:00';
        const [openHour, openMinute] = openTime.split(':').map(Number);
        const openMinutes = openHour * 60 + openMinute;
        const deadlineMinutes = openMinutes - 30;
        
        if (currentMinutes >= deadlineMinutes && empData.today.status === 'pending') {
            empData.today.status = 'missed';
            empData.today.pvz = workingPvz;
            const logs = JSON.parse(localStorage.getItem('checkinLogs') || '[]');
            const alreadyNotified = logs.some(log => 
                log.employee === emp.fullName && 
                new Date(log.time).toDateString() === new Date().toDateString()
            );
            if (!alreadyNotified) {
                notifyManager(emp.fullName, workingPvz);
            }
        }
    }
    
    saveCheckinData();
    renderCheckinStatus();
    updateMyCheckinStatus();
}

// ========================================
// УВЕДОМЛЕНИЕ РУКОВОДИТЕЛЯ - АВТОМАТИЧЕСКИЙ ЗВОНОК
// ========================================

function notifyManager(employeeName, pvzName) {
    // ====== ЗВОНОК ЧЕРЕЗ ZVONOK.COM ТЕПЕРЬ ДЕЛАЕТ SUPABASE EDGE FUNCTION ======
    // Она сама, по расписанию (cron), проверяет пропуски и звонит руководителю
    // с сервера — так API-ключ zvonok.com не попадает в браузер.
    // Здесь мы только показываем визуальное уведомление в интерфейсе,
    // чтобы админ видел пропуск, даже если вкладка открыта.
    const openTime = pvzOpenTimes[pvzName] || '09:00';
    const deadlineTime = getDeadlineTime(openTime);
    // Номер берём из уже загруженного списка (Supabase), а не храним
    // в открытом коде сайта — так личный номер руководителя не виден
    // всем, кто откроет исходники страницы.
    const phone = managerPhones[0] || '';
    
    console.log(`🔔 [${new Date().toLocaleTimeString()}] ПРОПУЩЕН ЧЕКИН: ${employeeName}`);
    console.log(`🏪 ПВЗ: ${pvzName}, Открытие: ${openTime}, Дедлайн: ${deadlineTime}`);
    
    showNotificationOnScreen(employeeName, pvzName, openTime, deadlineTime, phone);
}

// ========================================
// УВЕДОМЛЕНИЕ НА ЭКРАНЕ
// ========================================

function showNotificationOnScreen(employeeName, pvzName, openTime, deadlineTime, phone) {
    // ====== ТОЛЬКО ДЛЯ АДМИНИСТРАТОРА ======
    // Обычные сотрудники не должны видеть, что у коллеги пропущен чекин —
    // руководитель и так узнаёт об этом по звонку с сервера. Показываем
    // всплывающее окно только если на этом устройстве уже разблокирован
    // админ-режим (введён пароль).
    if (!isAdminUnlocked) return;

    const manualUrl = `tel:+${phone}`;
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = 'background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 12px; margin-bottom: 10px; z-index: 10000; position: fixed; top: 20px; right: 20px; max-width: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
    notification.innerHTML = `
        <div style="font-weight: 700; color: #dc2626; font-size: 1rem;">🚨 ПРОПУЩЕН ЧЕКИН!</div>
        <div style="font-weight: 600; color: #92400e; margin-top: 4px;">${employeeName} не отметился!</div>
        <div style="font-size: 0.85rem; color: #78350f; margin-top: 4px;">🏪 ${pvzName}</div>
        <div style="font-size: 0.8rem; color: #92400e;">⏰ Открытие в ${openTime} | Дедлайн был в ${deadlineTime}</div>
        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
            <a href="${manualUrl}" style="background: #dc2626; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: 700; font-size: 1rem; text-decoration: none; display: inline-block;">
                📞 ПОЗВОНИТЬ РУКОВОДИТЕЛЮ
            </a>
            <button onclick="this.parentElement.parentElement.remove()" style="background: #e2e8f0; border: none; padding: 10px 16px; border-radius: 20px; cursor: pointer;">
                ✕ Закрыть
            </button>
        </div>
        <div style="font-size: 0.6rem; color: #78350f; margin-top: 8px; border-top: 1px solid #fde68a; padding-top: 6px;">
            📞 +${phone}
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 60000);
}

async function confirmCheckin() {
    const employeeSelect = document.getElementById('checkinEmployeeSelect');
    const btn = document.getElementById('checkinConfirmBtn');
    
    const employee = employeeSelect?.value;
    
    if (!employee) {
        showNotification('❌ Выберите себя!', true);
        return;
    }
    
    const pvz = getEmployeePVZToday(employee);
    
    if (!pvz) {
        showNotification(`❌ У вас сегодня нет смены!`, true);
        return;
    }
    
    if (checkinData[employee] && checkinData[employee].today && checkinData[employee].today.status === 'confirmed') {
        showNotification(`✅ Вы уже отметились сегодня!`, false);
        return;
    }

    // ====== ПРОВЕРКА: НЕ РАНЬШЕ ЧЕМ ЗА 2 ЧАСА ДО ОТКРЫТИЯ ======
    const openTime = pvzOpenTimes[pvz] || '09:00';
    const [openHourCheck, openMinuteCheck] = openTime.split(':').map(Number);
    const openMinutesTotalCheck = openHourCheck * 60 + openMinuteCheck;
    const checkinOpensMinutesCheck = Math.max(0, openMinutesTotalCheck - 120);
    const nowCheck = new Date();
    const currentMinutesCheck = nowCheck.getHours() * 60 + nowCheck.getMinutes();
    if (currentMinutesCheck < checkinOpensMinutesCheck) {
        const checkinOpensTimeCheck = `${Math.floor(checkinOpensMinutesCheck / 60)}:${String(checkinOpensMinutesCheck % 60).padStart(2, '0')}`;
        showNotification(`❌ Ещё рано — отметиться можно с ${checkinOpensTimeCheck}`, true);
        return;
    }
    
    if (btn) btn.disabled = true;
    
    // ====== СОХРАНЯЕМ ЧЕКИН В SUPABASE (ИСТОЧНИК ПРАВДЫ) ======
    const todayKey = getTodayDateKey();
    const result = await saveCheckin(employee, pvz, todayKey);
    
    if (!result.success) {
        showNotification('❌ Не удалось сохранить чекин, попробуйте ещё раз', true);
        if (btn) btn.disabled = false;
        return;
    }
    
    if (!checkinData[employee]) {
        checkinData[employee] = {};
    }
    
    checkinData[employee].today = {
        status: 'confirmed',
        time: new Date().toISOString(),
        pvz: pvz
    };
    
    saveCheckinData();
    renderCheckinStatus();
    updateMyCheckinStatus();
    updateShiftInfo();
    populateCheckinSelects();
    
    showNotification(`✅ ${employee} подтвердил выход на смену в ${pvz}!`, false);
    
    if (btn) {
        btn.textContent = '✅ Отмечен!';
        btn.classList.add('confirmed');
        
        setTimeout(() => {
            btn.textContent = '✅ Подтвердить выход на смену';
            btn.classList.remove('confirmed');
            btn.disabled = false;
        }, 5000);
    }
}

function populateCheckinSelects() {
    const empSelect = document.getElementById('checkinEmployeeSelect');
    if (empSelect) {
        const currentValue = empSelect.value;
        empSelect.innerHTML = '<option value="">-- Выберите себя --</option>';
        globalEmployees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.fullName;
            option.textContent = emp.fullName;
            empSelect.appendChild(option);
        });
        if (currentValue) empSelect.value = currentValue;
    }
}

function updateShiftInfo() {
    const employee = document.getElementById('checkinEmployeeSelect')?.value;
    const shiftInfo = document.getElementById('shiftInfo');
    const shiftText = document.getElementById('shiftInfoText');
    
    if (!employee) {
        shiftInfo.style.display = 'none';
        return;
    }
    
    const pvz = getEmployeePVZToday(employee);
    const empData = checkinData[employee];
    const isConfirmed = empData && empData.today && empData.today.status === 'confirmed';
    
    shiftInfo.style.display = 'block';
    
    if (pvz && !isConfirmed) {
        const openTime = pvzOpenTimes[pvz] || '09:00';
        const deadlineTime = getDeadlineTime(openTime);
        
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [openHour, openMinute] = openTime.split(':').map(Number);
        const openMinutesTotal = openHour * 60 + openMinute;
        const deadlineMinutes = openMinutesTotal - 30;
        
        const isDeadlinePassed = currentMinutes >= deadlineMinutes;

        // ====== ОКНО ДОСТУПНОСТИ ЧЕКИНА: НЕ РАНЬШЕ ЧЕМ ЗА 2 ЧАСА ДО ОТКРЫТИЯ ======
        // Чтобы сотрудник не мог отметиться посреди ночи "заранее" за завтрашнюю смену.
        const checkinOpensMinutes = Math.max(0, openMinutesTotal - 120);
        const isTooEarly = currentMinutes < checkinOpensMinutes;
        const checkinOpensTime = `${Math.floor(checkinOpensMinutes / 60)}:${String(checkinOpensMinutes % 60).padStart(2, '0')}`;

        const confirmBtn = document.getElementById('checkinConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = isTooEarly;
        }

        if (isTooEarly) {
            shiftText.innerHTML = `
                <div style="font-size: 1rem; font-weight: 600; color: #1e293b;">🕐 Ещё рано отмечаться</div>
                <div style="font-size: 0.95rem; color: #1e293b; margin-top: 4px;">🏪 ${pvz}</div>
                <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">⏰ Открытие в ${openTime}</div>
                <div style="font-size: 0.85rem; color: #3b82f6; margin-top: 4px; font-weight: 600;">
                    ✅ Кнопка отметки станет доступна в ${checkinOpensTime} (за 2 часа до открытия)
                </div>
            `;
        } else {
            shiftText.innerHTML = `
                <div style="font-size: 1rem; font-weight: 600; color: #15803d;">✅ Вы работаете сегодня</div>
                <div style="font-size: 0.95rem; color: #1e293b; margin-top: 4px;">🏪 ${pvz}</div>
                <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">⏰ Открытие в ${openTime}</div>
                <div style="font-size: 0.85rem; color: ${isDeadlinePassed ? '#dc2626' : '#f59e0b'}; margin-top: 4px; font-weight: 600;">
                    ⚠️ Отметиться нужно ДО ${deadlineTime} (за 30 минут до открытия)
                    ${isDeadlinePassed ? ' ❌ Время вышло!' : ''}
                </div>
            `;
        }
    } else if (pvz && isConfirmed) {
        const time = new Date(empData.today.time);
        const timeStr = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        shiftText.innerHTML = `
            <div style="font-size: 1rem; font-weight: 600; color: #15803d;">✅ Вы уже отметились!</div>
            <div style="font-size: 0.95rem; color: #1e293b; margin-top: 4px;">🏪 ${pvz}</div>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">🕐 Отметились в ${timeStr}</div>
        `;
    } else {
        shiftText.innerHTML = `
            <div style="font-size: 1rem; font-weight: 600; color: #991b1b;">❌ У вас нет смены сегодня</div>
        `;
    }
}

function updateMyCheckinStatus() {
    const container = document.getElementById('myCheckinStatus');
    if (!container) return;
    
    const employee = document.getElementById('checkinEmployeeSelect')?.value;
    if (!employee) {
        container.style.display = 'none';
        return;
    }
    
    const empData = checkinData[employee];
    if (!empData || !empData.today) {
        container.style.display = 'none';
        return;
    }
    
    const status = empData.today.status;
    const pvz = empData.today.pvz;
    const time = empData.today.time;
    
    container.style.display = 'block';
    container.className = status;
    
    let text = '';
    if (status === 'confirmed') {
        const timeStr = new Date(time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        text = `✅ Вы отметились в ${pvz} в ${timeStr}`;
    } else if (status === 'missed') {
        const pvzWorking = getEmployeePVZToday(employee);
        const openTime = pvzOpenTimes[pvzWorking] || '09:00';
        const deadlineTime = getDeadlineTime(openTime);
        text = `❌ ВЫ НЕ ОТМЕТИЛИСЬ! Дедлайн был в ${deadlineTime}. Срочно свяжитесь с руководителем!`;
    } else if (status === 'pending') {
        const pvzWorking = getEmployeePVZToday(employee);
        if (pvzWorking) {
            const openTime = pvzOpenTimes[pvzWorking] || '09:00';
            const deadlineTime = getDeadlineTime(openTime);
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const [openHour, openMinute] = openTime.split(':').map(Number);
            const deadlineMinutes = (openHour * 60 + openMinute) - 30;
            const isDeadlinePassed = currentMinutes >= deadlineMinutes;
            
            text = `⏳ Ожидаем ваш чекин в ${pvzWorking}`;
            if (isDeadlinePassed) {
                text += ` ⚠️ ДЕДЛАЙН ПРОШЁЛ! (нужно было до ${deadlineTime})`;
            } else {
                text += ` ⏰ Отметьтесь ДО ${deadlineTime}`;
            }
        } else {
            text = `📅 У вас нет смены сегодня`;
        }
    } else if (status === 'not-working') {
        text = `📅 У вас нет смены сегодня`;
    }
    
    container.textContent = text;
}

// ========================================
// СТАТУС СОТРУДНИКОВ - ТОЛЬКО РАБОТАЮЩИЕ СЕГОДНЯ
// ========================================

function renderCheckinStatus() {
    const container = document.getElementById('checkinStatusList');
    if (!container) return;
    
    let confirmedCount = 0;
    let pendingCount = 0;
    let missedCount = 0;
    let notWorkingCount = 0;
    
    let html = '';
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const dayKey = `${year}-${month}-${day}`;
    
    for (let emp of globalEmployees) {
        const empData = checkinData[emp.fullName];
        let status = 'pending';
        let time = null;
        let pvz = null;
        
        if (empData && empData.today) {
            status = empData.today.status || 'pending';
            time = empData.today.time;
            pvz = empData.today.pvz;
        }
        
        let isWorkingToday = false;
        let workingPvz = null;
        
        for (let pvzName in allPVZData) {
            if (allPVZData[pvzName].schedules[emp.fullName]?.[dayKey] === true) {
                isWorkingToday = true;
                workingPvz = pvzName;
                break;
            }
        }
        
        if (!isWorkingToday) {
            notWorkingCount++;
            continue;
        }
        
        if (status === 'pending' || status === 'not-working') {
            if (workingPvz) {
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                const openTime = pvzOpenTimes[workingPvz] || '09:00';
                const [openHour, openMinute] = openTime.split(':').map(Number);
                const openMinutes = openHour * 60 + openMinute;
                const deadlineMinutes = openMinutes - 30;
                
                if (currentMinutes >= deadlineMinutes) {
                    status = 'missed';
                    if (empData) {
                        empData.today.status = 'missed';
                        empData.today.pvz = workingPvz;
                        const logs = JSON.parse(localStorage.getItem('checkinLogs') || '[]');
                        const alreadyNotified = logs.some(log => 
                            log.employee === emp.fullName && 
                            new Date(log.time).toDateString() === new Date().toDateString()
                        );
                        if (!alreadyNotified) {
                            notifyManager(emp.fullName, workingPvz);
                        }
                    }
                } else {
                    status = 'pending';
                }
            }
        }
        
        if (status === 'confirmed') confirmedCount++;
        else if (status === 'missed') missedCount++;
        else if (status === 'pending') pendingCount++;
        
        let statusText = '';
        let statusClass = '';
        let timeStr = '';
        let pvzDisplay = '';
        
        if (status === 'confirmed') {
            statusText = '✅ Отметил(а)ся';
            statusClass = 'confirmed';
            if (time) {
                const date = new Date(time);
                timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            }
            if (pvz) pvzDisplay = `🏪 ${pvz}`;
        } else if (status === 'missed') {
            statusText = '❌ Пропустил(а)';
            statusClass = 'missed';
            if (workingPvz) pvzDisplay = `🏪 ${workingPvz}`;
        } else if (status === 'pending') {
            statusText = '⏳ Ожидает';
            statusClass = 'pending';
            if (workingPvz) pvzDisplay = `🏪 ${workingPvz}`;
        }
        
        html += `
            <div class="checkin-status-item">
                <span class="checkin-status-employee">👤 ${emp.fullName}</span>
                ${pvzDisplay ? `<span class="checkin-status-pvz">${pvzDisplay}</span>` : ''}
                ${timeStr ? `<span class="checkin-status-time">🕐 ${timeStr}</span>` : ''}
                <span class="checkin-status-badge ${statusClass}">${statusText}</span>
            </div>
        `;
    }
    
    const totalWorking = confirmedCount + pendingCount + missedCount;
    const statsHtml = `
        <div style="display: flex; gap: 20px; padding: 12px 0; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px; flex-wrap: wrap;">
            <span style="font-weight: 600;">📊 Сегодня работают: ${totalWorking} чел.</span>
            <span style="color: #15803d;">✅ Отметились: ${confirmedCount}</span>
            <span style="color: #92400e;">⏳ Ожидают: ${pendingCount}</span>
            <span style="color: #991b1b;">❌ Пропустили: ${missedCount}</span>
        </div>
    `;
    
    if (totalWorking === 0) {
        html = `
            <div style="text-align:center;padding:30px;color:#94a3b8;">
                <div style="font-size: 2rem; margin-bottom: 10px;">📅</div>
                <div>Сегодня никто не работает</div>
            </div>
        `;
    }
    
    container.innerHTML = statsHtml + html;
}

async function toggleTimeSettings() {
    const content = document.getElementById('timeSettingsContent');
    if (content.style.display === 'block') {
        content.style.display = 'none';
    } else {
        if (await checkAdminPassword()) {
            content.style.display = 'block';
            renderPvzTimeSettings();
        }
    }
}

async function toggleStaffStatus() {
    const content = document.getElementById('staffStatusContent');
    if (content.style.display === 'block') {
        content.style.display = 'none';
    } else {
        if (await checkAdminPassword()) {
            content.style.display = 'block';
            renderCheckinStatus();
        }
    }
}

// ========================================
// НАСТРОЙКА ОБРАБОТЧИКОВ
// ========================================

function setupEventListeners() {
    document.getElementById("employeesCornerBtn")?.addEventListener("click", () => switchTab('employees'));
    document.getElementById("analyticsCornerBtn")?.addEventListener("click", () => switchTab('analytics'));
    document.getElementById("dashboardCornerBtn")?.addEventListener("click", async () => {
        if (await unlockAdminSession()) {
            switchTab('dashboard');
        } else {
            showNotification('❌ Неверный пароль администратора', true);
        }
    });
    document.getElementById("unlockAdminEmployeesBtn")?.addEventListener("click", async () => {
        if (await unlockAdminSession()) {
            renderGlobalEmployeesTable();
            showNotification('🔓 Админ-режим включён', false);
        }
    });
    document.getElementById("archiveSearchInput")?.addEventListener("input", renderArchivedEmployeesTable);
    document.getElementById("checkinCornerBtn")?.addEventListener("click", () => switchTab('checkin'));
    document.getElementById("importantCornerBtn")?.addEventListener("click", () => switchTab('important'));
    document.getElementById("newNoticeBanner")?.addEventListener("click", () => switchTab('important'));
    document.getElementById("toggleImportantAdminBtn")?.addEventListener("click", toggleImportantAdmin);
    document.getElementById("addNoticeBtn")?.addEventListener("click", addImportantNoticeHandler);
    document.getElementById("analyticsYearSelect")?.addEventListener("change", (e) => {
        analyticsYear = Number(e.target.value);
        renderAnalytics();
    });
    document.getElementById("analyticsMonthSelect")?.addEventListener("change", (e) => {
        analyticsMonth = Number(e.target.value);
        renderAnalytics();
    });

    document.getElementById("addEmployeeBtnGlobal")?.addEventListener("click", addGlobalEmployee);
    document.getElementById("addToPVZBtn")?.addEventListener("click", addEmployeeToPVZ);
    document.getElementById("editPVZNameBtn")?.addEventListener("click", editCurrentPVZName);
    document.getElementById("deletePVZBtn")?.addEventListener("click", deleteCurrentPVZ);

    document.getElementById("monthSelect")?.addEventListener("change", (e) => {
        [selectedYear, selectedMonth] = e.target.value.split("-").map(Number);
        updatePVZEmployeesUI();
        renderSchedule();
    });

    document.getElementById("goToCurrentMonthBtn")?.addEventListener("click", () => {
        const now = new Date();
        selectedYear = now.getFullYear();
        selectedMonth = now.getMonth() + 1;
        document.getElementById("monthSelect").value = `${selectedYear}-${selectedMonth}`;
        updatePVZEmployeesUI();
        renderSchedule();
    });

    document.getElementById("scheduleGrid")?.addEventListener("click", toggleStatus);

    document.querySelectorAll('.employees-sub-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const subtab = btn.getAttribute('data-employees-subtab');
            showEmployeesSubtab(subtab);
        });
    });

    document.getElementById("savePublicEmergencyContactsBtn")?.addEventListener("click", savePublicEmergencyContacts);

    document.getElementById("addMoreContactsBtn")?.addEventListener("click", () => {
        const container = document.getElementById("publicContactsContainer");
        if (!container) return;
        const newRow = document.createElement('div');
        newRow.className = 'emergency-form-row contact-row';
        newRow.innerHTML = `
            <input type="text" class="contact-name-input" placeholder="ФИО контакта *">
            <input type="text" class="contact-phone-input" placeholder="Телефон *">
            <input type="text" class="contact-relation-input" placeholder="Кем приходится">
            <button type="button" class="delete-contact-btn remove-contact-row">✕</button>
        `;
        container.appendChild(newRow);

        document.querySelectorAll('.remove-contact-row').forEach(btn => {
            btn.addEventListener('click', function() {
                const rows = container.querySelectorAll('.contact-row');
                if (rows.length > 1) {
                    this.closest('.contact-row').remove();
                } else {
                    showNotification("Должен быть хотя бы один контакт", true);
                }
            });
        });
    });

    document.querySelectorAll('.sub-tab').forEach(btn => {
        btn.addEventListener('click', async function() {
            const subtab = this.dataset.subtab;
            
            document.querySelectorAll('#dashboardMainTab, #dashboardExtraTab, #dashboardFinesTab, #dashboardEmergencyTab, #dashboardSettingsTab, #dashboardArchiveTab').forEach(el => {
                el.style.display = 'none';
            });
            
            if (subtab === 'main') {
                document.getElementById('dashboardMainTab').style.display = 'block';
            } else if (subtab === 'extra') {
                document.getElementById('dashboardExtraTab').style.display = 'block';
                renderExtraWorksTable();
                populateExtraSelects();
            } else if (subtab === 'fines') {
                document.getElementById('dashboardFinesTab').style.display = 'block';
                renderFinesTable();
                populateFineSelects();
            } else if (subtab === 'emergency') {
                document.getElementById('dashboardEmergencyTab').style.display = 'block';
                renderEmergencyContactsList();
            } else if (subtab === 'settings') {
                document.getElementById('dashboardSettingsTab').style.display = 'block';
                await loadPvzOpenTimes();
                renderPvzTimeSettings();
                renderManagerPhonesList();
                renderZvonokBalance();
                await loadCheckinData();
                renderCheckinStatus();
            } else if (subtab === 'archive') {
                document.getElementById('dashboardArchiveTab').style.display = 'block';
                const archivedResult = await getArchivedEmployees();
                if (archivedResult.success) {
                    archivedEmployees = archivedResult.data.map(emp => ({
                        ...emp,
                        fullName: `${emp.name} ${emp.surname}`
                    }));
                }
                renderArchivedEmployeesTable();
            }
            
            document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    document.getElementById("dashboardMonthSelect")?.addEventListener("change", (e) => {
        [currentDashboardYear, currentDashboardMonth] = e.target.value.split("-").map(Number);
        renderSalaryTable();
    });

    document.getElementById("refreshSalaryBtn")?.addEventListener("click", () => {
        renderSalaryTable();
        showNotification("✅ Таблица обновлена", false);
    });

    document.getElementById("addExtraWorkBtn")?.addEventListener("click", addExtraWork);
    document.getElementById("addFineBtn")?.addEventListener("click", addFine);

    document.getElementById('saveEditBtn')?.addEventListener('click', function() {
        const employeeName = this.dataset.employee;
        const address = document.getElementById('editAddress').value.trim();
        
        const contactRows = document.querySelectorAll('#editContactsContainer .contact-row');
        const contacts = [];
        contactRows.forEach(row => {
            const name = row.querySelector('.edit-contact-name')?.value.trim();
            const phone = row.querySelector('.edit-contact-phone')?.value.trim();
            const relation = row.querySelector('.edit-contact-relation')?.value.trim();
            if (name && phone) {
                contacts.push({
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                    contactName: name,
                    contactPhone: phone,
                    relation: relation || ''
                });
            }
        });
        
        if (contacts.length === 0) {
            showNotification('❌ Добавьте хотя бы один контакт', true);
            return;
        }
        
        if (!emergencyContacts[employeeName]) {
            emergencyContacts[employeeName] = { address: '', contacts: [] };
        }
        emergencyContacts[employeeName].address = address;
        emergencyContacts[employeeName].contacts = contacts;
        
        saveToLocalStorage();
        renderEmergencyContactsList();
        document.getElementById('editContactsModal').style.display = 'none';
        
        showNotification('✅ Контакты обновлены!', false);
    });

    document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
        document.getElementById('editContactsModal').style.display = 'none';
    });

    document.querySelector('.close-edit-modal')?.addEventListener('click', () => {
        document.getElementById('editContactsModal').style.display = 'none';
    });

    document.querySelector('.close-history-modal')?.addEventListener('click', () => {
        document.getElementById('employeeHistoryModal').style.display = 'none';
    });

    document.getElementById('addEditContactBtn')?.addEventListener('click', () => {
        const container = document.getElementById('editContactsContainer');
        const div = document.createElement('div');
        div.className = 'emergency-form-row contact-row';
        div.innerHTML = `
            <input type="text" class="edit-contact-name" placeholder="ФИО контакта *">
            <input type="text" class="edit-contact-phone" placeholder="Телефон *">
            <input type="text" class="edit-contact-relation" placeholder="Кем приходится">
            <button type="button" class="delete-contact-btn" onclick="this.closest('.contact-row').remove()">✕</button>
        `;
        container.appendChild(div);
    });

    document.getElementById("checkinEmployeeSelect")?.addEventListener("change", function() {
        updateShiftInfo();
        updateMyCheckinStatus();
    });

    document.getElementById("checkinConfirmBtn")?.addEventListener("click", confirmCheckin);
    document.getElementById("toggleTimeSettingsBtn")?.addEventListener("click", toggleTimeSettings);
    document.getElementById("savePvzTimesBtn")?.addEventListener("click", savePvzTimes);
    document.getElementById("addManagerPhoneBtn")?.addEventListener("click", addManagerPhoneHandler);
    document.getElementById("toggleStaffStatusBtn")?.addEventListener("click", toggleStaffStatus);
}

// ========================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ (С SUPABASE)
// ========================================

async function initApp() {
    try {
        showNotification("🔄 Загрузка данных...", false);
        
        // Проверяем подключение к Supabase
        const connection = await testConnection();
        if (connection.success) {
            console.log('✅ Работаем с Supabase');
            await loadAllDataFromSupabase();
        } else {
            console.warn('⚠️ Работаем с LocalStorage (Supabase не доступен)');
            await loadFromLocalStorage();
        }
        
        setupEventListeners();
        await switchTab(currentPVZ);

        // ====== ЯРЛЫКИ БЫСТРЫХ ДЕЙСТВИЙ (при запуске с домашнего экрана) ======
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        if (action === 'checkin') {
            await switchTab('checkin');
        } else if (action === 'employees') {
            await switchTab('employees');
        } else if (action === 'important') {
            await switchTab('important');
        } else if (action === 'dashboard') {
            if (await unlockAdminSession()) {
                await switchTab('dashboard');
            }
        }

        showNotification("✅ Приложение загружено!", false);
        console.log("🚀 PVZ Manager запущен!");
    } catch (error) {
        console.error("❌ Ошибка инициализации:", error);
        showNotification("❌ Ошибка загрузки приложения", true);
    }
}

// ========================================
// ВХОД (ПРОСТОЙ ПАРОЛЬ)
// ========================================

async function handleLogin() {
    const passwordInput = document.getElementById('passwordInput');
    const errorDiv = document.getElementById('loginError');
    const submitBtn = document.getElementById('submitLoginBtn');
    const pwd = passwordInput?.value.trim() || '';

    if (submitBtn) submitBtn.disabled = true;
    if (errorDiv) errorDiv.textContent = '';

    const result = await verifyPassword('login', pwd);

    if (submitBtn) submitBtn.disabled = false;

    if (result.valid) {
        localStorage.setItem('app_authorized', 'true');
        const loginScreen = document.getElementById('loginScreen');
        const mainContent = document.getElementById('mainAppContent');
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
        if (errorDiv) errorDiv.textContent = '';
        if (passwordInput) passwordInput.value = '';
        initApp();
    } else {
        if (errorDiv) errorDiv.textContent = '❌ Неверный пароль';
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
}

// ========================================
// ЗАПУСК
// ========================================

const isAuthorized = localStorage.getItem('app_authorized') === 'true';

if (isAuthorized) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainAppContent').style.display = 'block';
    initApp();
} else {
    const loginBtn = document.getElementById('submitLoginBtn');
    const passwordInput = document.getElementById('passwordInput');
    
    if (loginBtn) {
        const newBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newBtn, loginBtn);
        newBtn.addEventListener('click', handleLogin);
        console.log('✅ Кнопка входа настроена!');
    } else {
        console.error('❌ Кнопка входа не найдена!');
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }
}

// Экспорт функций для глобального доступа
window.toggleStatus = toggleStatus;
window.switchTab = switchTab;
window.addGlobalEmployee = addGlobalEmployee;
window.addEmployeeToPVZ = addEmployeeToPVZ;
window.removeEmployeeFromPVZ = removeEmployeeFromPVZ;
window.editCurrentPVZName = editCurrentPVZName;
window.deleteCurrentPVZ = deleteCurrentPVZ;
window.showEmployeesSubtab = showEmployeesSubtab;
window.filterAnalyticsTable = function() {
    const input = document.getElementById('analyticsSearchInput');
    analyticsSearchTerm = input ? input.value : '';
    renderAnalytics();
};
window.filterEmergencyContacts = renderEmergencyContactsList;

window.confirmCheckin = confirmCheckin;
window.loadCheckinData = loadCheckinData;
window.renderCheckinStatus = renderCheckinStatus;
window.toggleTimeSettings = toggleTimeSettings;
window.toggleStaffStatus = toggleStaffStatus;
window.savePvzTimes = savePvzTimes;

window.editEmergencyContacts = editEmergencyContacts;
window.deleteEmergencyContacts = deleteEmergencyContacts;
window.viewEmployeeFile = viewEmployeeFile;
window.deleteEmployeeFile = deleteEmployeeFile;
window.addFileToEmployee = addFileToEmployee;
window.handleFileUpload = handleFileUpload;
window.renderEmployeeDocuments = renderEmployeeDocuments;

// ====== ДОБАВЛЯЕМ notifyManager В ГЛОБАЛЬНЫЙ ДОСТУП ДЛЯ ТЕСТА ======
window.notifyManager = notifyManager;

console.log('🚀 Приложение готово к работе!');