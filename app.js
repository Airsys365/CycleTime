// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
let currentOperator = null;
let currentOperation = null;
let currentWO = null;
let isAuthorized = false;
let isWorking = false; 
let currentOperatorSummary = []; 
let countInputTimer = null;
 
// --- Product selection ---
window.currentProduct = localStorage.getItem('product') || '';
window.productsList = {}; // 🆕 ДЛЯ ХРАНЕНИЯ ПРОДУКТОВ: {id: name}
// --- КОНСТАНТЫ И НАСТРОЙКИ ---
const VALID_WO_PREFIX = 'WO';
const SCAN_TIMEOUT_MS = 400; 
// === КОНФИГУРАЦИЯ ФИНАЛЬНЫХ ОПЕРАЦИЙ ===
const FINAL_OPERATIONS = {
  'SC1A208': 'VC3 + Packing',
  'SM2A253': 'Test'
};
let currentLang = localStorage.getItem('currentLang') || 'ru';
let scanTimer = null; 
let isPaused = false;
console.log('🚀 app.js is loading...');
console.log('🔧 Debug: Checking GlobalState...');
const debugState = getGlobalState();
console.log('🔧 Current GlobalState:', debugState);
console.log('🚀 app.js loaded - currentLang:', currentLang);
console.log('🔍 localStorage currentLang:', localStorage.getItem('currentLang'));
console.log('🌐 translations.js loaded:', typeof getTranslation);

function initializeAppState() {
    // 🔒 Отключено. Состояние не должно изменяться при загрузке страницы.
    return;
}
// 🔥 ГЛОБАЛЬНАЯ ПРОВЕРКА И СИНХРОНИЗАЦИИ ЯЗЫКА — ОТКЛЮЧЕНА
function syncLanguageAcrossPages() {
    // Логика синхронизации отключена — язык применяется только при загрузке страницы.
    return;
}


function selectProduct() {
    const select = document.getElementById('product-select');
    const selectedValue = select.value;
    
    if (!selectedValue) {
        // Если продукт сброшен, сбрасываем всё состояние
        window.currentProduct = '';
        localStorage.removeItem('product');
        currentOperator = null;
        currentOperation = null;
        currentWO = null;
        isAuthorized = false;
        isWorking = false;
        
        const operatorSelect = document.getElementById('operator-select');
        if (operatorSelect) {
            operatorSelect.value = '';
            operatorSelect.disabled = true;
        }
    } else {
        window.currentProduct = selectedValue;
        localStorage.setItem('product', window.currentProduct);
        
        const operatorSelect = document.getElementById('operator-select');
        if (operatorSelect) {
            operatorSelect.disabled = false;
        }
    }
    
    console.log('✅ Selected product:', window.currentProduct);
    updateUI();
}


// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function getElement(id) {
    return document.getElementById(id);
}

window.setLanguage = function(lang) {
    console.log('🌐 Setting language to:', lang);
    
    // Сохраняем язык
    currentLang = lang;
    localStorage.setItem('currentLang', lang);
    
    // Обновляем все переводимые элементы
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = getTranslation(key);
        if (translation) {
            if (element.tagName === 'TITLE') {
                document.title = translation;
            } else {
                element.textContent = translation;
            }
        }
    });
    
    // Обновляем плейсхолдеры
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        const translation = getTranslation(key);
        if (translation) {
            element.placeholder = translation;
        }
    });
    
    
    
    // Обновляем кнопки языка (только если они есть)
    document.querySelectorAll('#language-selector .lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === lang) {
            btn.classList.add('active');
        }
    });
    
    console.log('✅ Language applied:', lang);
};
async function initDropdowns(shouldUpdateUI = true) {
    console.log('🔁 initDropdowns(): initializing all dropdowns, shouldUpdateUI:', shouldUpdateUI);
    
    stopAutoRefresh();
    
    // 1. Инициализация продуктов
    await loadProducts();
    
    // 2. Инициализация операторов
    await loadOperators();

    // 3. Инициализация станций
    await loadOperations();

    // 4. Инициализация причин простоя
    await loadDowntimeReasons();
    
    // 🆕 5. КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: ЗАГРУЗКА РАБОЧИХ ОРДЕРОВ
    await loadWorkOrders(); // 🔥 ДОБАВИТЬ ЭТУ СТРОКУ

    if (shouldUpdateUI || document.getElementById('login-page')) {
        console.log('🔄 Calling updateUI() from initDropdowns');
        updateUI();
        
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.disabled = isWorking;
    } else {
        console.log('⏩ Skipping UI update (login page or shouldUpdateUI=false)');
    }
}
function updateDynamicTranslations() {
    console.log('🔄 Updating dynamic translations...');
    
    // 1. ОБНОВЛЯЕМ ЗАГОЛОВКИ ТАБЛИЦЫ СВОДКИ ОПЕРАТОРА
    const summaryTable = document.getElementById('operator-summary-table');
    if (summaryTable) {
        const headers = summaryTable.querySelectorAll('th');
        if (headers.length > 0) {
            headers[0].textContent = getTranslation('summary_station');
            headers[1].textContent = getTranslation('summary_wo');
            headers[2].textContent = getTranslation('summary_count');
            headers[3].textContent = getTranslation('plan_per_hour');
            headers[4].textContent = getTranslation('actual_per_hour');
            headers[5].textContent = getTranslation('cycle_label');            
            headers[7].textContent = getTranslation('summary_status');
        }
    }
    
    // 2. ОБНОВЛЯЕМ КНОПКУ ВЫХОДА
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.innerHTML = getTranslation('logout_button');
        console.log('🔄 Logout button text updated to:', getTranslation('logout_button'));
    }
    
    // 3. ОБНОВЛЯЕМ ВСЕ КНОПКИ ОТЧЕТА
    const reportButtons = document.querySelectorAll('a[href="operator_report.html"]');
    reportButtons.forEach(button => {
        if (!button.hasAttribute('data-i18n')) {
            button.textContent = getTranslation('report_button');
            console.log('🔄 Report button text updated to:', getTranslation('report_button'));
        }
    });
    
    // 4. ОБНОВЛЯЕМ ПЛЕЙСХОЛДЕРЫ ВЫПАДАЮЩИХ СПИСКОВ
    updateDropdownPlaceholders();
    
    // 5. ПЕРЕРИСОВЫВАЕМ СВОДКУ (чтобы обновить статусы)
    renderOperatorSummary();
    
    
}

// 🔧 ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ ПЛЕЙСХОЛДЕРОВ ВЫПАДАЮЩИХ СПИСКОВ
function updateDropdownPlaceholders() {
    console.log('🔄 Clearing dropdown placeholders');
    
    // Очищаем первые опции в выпадающих списках
    const selects = [
        'product-select', 'operator-select', 'operation-select', 
        'wo-select', 'downtime-reason', 'component-select', 'defect-select'
    ];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const firstOption = select.querySelector('option[value=""]');
            if (firstOption) {
                firstOption.textContent = ''; // Делаем пустым
            }
        }
    });
}
// 🔧 НОВАЯ ФУНКЦИЯ: Загрузка продуктов
let productsLoadInProgress = false; // 🆕 Защита от множественных вызовов

async function loadProducts() {
    const productSelect = document.getElementById('product-select');
    
    // 🔴 ИСПРАВЛЕНИЕ: Проверяем существует ли элемент на этой странице
    if (!productSelect) {
        console.log('ℹ️ Product select not found on this page, skipping...');
        return;
    }
    
    // 🆕 Защита от множественных одновременных вызовов
    if (productsLoadInProgress) {
        console.log('⏳ Products load already in progress, skipping...');
        return;
    }
    
    try {
        productsLoadInProgress = true;
        console.log('🔄 Loading products from API...');
        const response = await fetch('/api/products');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const products = await response.json();
        console.log('📦 Products from API:', products);
        window.allProducts = products;
        
        // 🆕 СОХРАНЯЕМ СПИСОК ПРОДУКТОВ ДЛЯ ИСПОЛЬЗОВАНИЯ НА СТРАНИЦЕ ДЕФЕКТОВ
        window.productsList = {};
        products.forEach(product => {
            window.productsList[product.product_id] = product.product_name || product.product_id;
        });
        
        // Сохраняем текущее выбранное значение
        const currentValue = productSelect.value;
        
        // Очищаем и заполняем список
        productSelect.innerHTML = '<option value=""></option>';
        
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.product_id;
            option.textContent = product.product_name || product.product_id;
            productSelect.appendChild(option);
        });
        
        // Восстанавливаем выбранное значение если оно есть
        if (window.currentProduct) {
            productSelect.value = window.currentProduct;
            console.log('✅ Restored product selection:', window.currentProduct);
        } else if (currentValue) {
            productSelect.value = currentValue;
        }
        
    } catch (err) {
        console.error('❌ Error loading products:', err);
        // 🔴 ИСПРАВЛЕНИЕ: Только если элемент существует
        if (productSelect) {
            productSelect.innerHTML = `
                <option value="">Error loading products</option>
                <option value="TEST001">Test Product 1</option>
                <option value="TEST002">Test Product 2</option>
            `;
        }
    } finally {
        // 🆕 Снимаем блокировку независимо от результата
        productsLoadInProgress = false;
    }
}

// 🔧 Функция загрузки операторов (уже есть, но на всякий случай)
let operatorsLoadInProgress = false;

async function loadOperators() {
    if (operatorsLoadInProgress) return;
    
    try {
        operatorsLoadInProgress = true;
        console.log('🔍 loadOperators() called');
        const res = await fetch('/api/operators');
        const data = await res.json();
        console.log('📦 Operators from API:', data);

        const select = document.getElementById('operator-select');
        if (!select) return;

        // Сохраняем текущее значение
        const currentValue = select.value;
        
        select.innerHTML = '<option value=""></option>';
        data.forEach(op => {
            const option = document.createElement('option');
            option.value = op.operator_id;
            option.textContent = op.operator_name;
            select.appendChild(option);
        });
        
        // Восстанавливаем значение
        if (currentValue) {
            select.value = currentValue;
        }
    } catch (err) {
        console.error('Error loading operators:', err);
    } finally {
        operatorsLoadInProgress = false;
    }
}

// 🔧 Функция загрузки операций
async function loadOperations() {
	console.log('[DEBUG] loadOperations() стартовал');
    try {
        const res = await fetch('/api/operations');
        const data = await res.json();	
		console.log('[DEBUG] Получено операций:', data.length);		

        // ✅ Сохраняем список операций для фильтрации по продукту
        window.allOperations = data;
        console.log('[loadOperations] Всего операций:', data.length);
		console.log('[DEBUG] Сохранили в window.allOperations');

        const select = document.getElementById('operation-select');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value=""></option>';
        
        data.forEach(op => {
			 const option = document.createElement('option');
			 option.value = op.operation_id;     // INTERNAL ID
			 option.textContent = op.operation_name;  // user-facing name
			 select.appendChild(option);
		 });
        
        if (currentValue) {
            select.value = currentValue;
        }
    } catch (err) {
        console.error('Error loading operations:', err);
    }
}


async function loadDowntimeReasons() {
    try {
        const res = await fetch('/api/downtime_reasons');
        const data = await res.json();
        const select = document.getElementById('downtime-reason');
        if (!select) return;

        select.innerHTML = '<option value=""></option>';
        data.forEach(dt => {
            const option = document.createElement('option');
            option.value = dt.reason_id || dt.reason_description_en;
            
            // Выбираем описание на текущем языке
            let description = dt.reason_description_ru; // по умолчанию русский
            if (currentLang === 'en' && dt.reason_description_en) {
                description = dt.reason_description_en;
            } else if (currentLang === 'et' && dt.reason_description_et) {
                description = dt.reason_description_et;
            }
            
            option.textContent = description || dt.reason_description_en;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading downtime reasons:', err);
    }
}

function updateUI() {
	console.log('🔍 === ДИАГНОСТИКА updateUI ===');
    console.log('📌 Текущие переменные:', {
        currentOperator,
        currentOperation,
        currentWO,
        isAuthorized,
        isWorking
    });
	
	const state = getGlobalState();  
    if (document.getElementById('login-page')) {
        const woInput = document.getElementById('wo-input');
        if (woInput) {
            woInput.placeholder = getTranslation('placeholder_wo');
        }
        return;
    }
    
    const summaryTable = document.getElementById('operator-summary-table');
	const isMainPage = !!summaryTable;

	

    console.log('🔄 updateUI вызван с состоянием:', {
        isAuthorized,
        currentOperation,
        currentWO, 
        isWorking
    });

    // 🔥 ПРАВИЛЬНОЕ ОТОБРАЖЕНИЕ ИМЕНИ ОПЕРАТОРА (а не ID)
    let operatorName = 'НЕТ';
    if (state.operatorName) {
        operatorName = state.operatorName;
		console.log('✅ Имя оператора из state.operatorName:', operatorName);
    } else if (state.operator) {
        operatorName = state.operator;
		console.log('✅ Имя оператора из state.operator:', operatorName);
    } else if (currentOperator) {
        const operatorSelect = document.getElementById('operator-select');
        if (operatorSelect && operatorSelect.value) {
            operatorName = operatorSelect.options[operatorSelect.selectedIndex].text;
			console.log('✅ Имя оператора из select:', operatorName);
        }
    }

    // 🔥 ПРАВИЛЬНОЕ ОТОБРАЖЕНИЕ НАЗВАНИЯ ОПЕРАЦИИ (а не ID)
    let operationName = 'НЕТ';
    if (state.operation_name) {
        operationName = state.operation_name;
		console.log('✅ Название операции из state.operation_name:', operationName);
    } else if (currentOperation) {
        const operationSelect = document.getElementById('operation-select');
        if (operationSelect && operationSelect.value) {
            operationName = operationSelect.options[operationSelect.selectedIndex].text;
			console.log('✅ Название операции из select:', operationName);
        }
    }
	
	console.log('🏭 Финальное название операции:', operationName);
    const wo = state.wo || currentWO || 'НЕТ';
	console.log('📋 Финальный WO:', wo);
   	console.log('🔍 === КОНЕЦ ДИАГНОСТИКИ updateUI ===');
    let statusText;
    if (!isAuthorized) {
        statusText = getTranslation('status_waiting_auth');
    } else if (isWorking === true) {
        statusText = getTranslation('status_working');
    } else if (isWorking === false) {
        statusText = `ПАУЗА: ${state.wo || ''}`;
    } else {
        statusText = 'ГОТОВ К РАБОТЕ';
    }

    if (getElement('current-status-text')) {
        getElement('current-status-text').innerText = statusText;
    }

	updateVisualControlButton();
	
        // 🔥 ОБНОВЛЯЕМ ШАПКУ (оператор / операция / WO)
    const headerOperator = document.getElementById('current-operator-name');
    const headerOperation = document.getElementById('current-operation-name');
    const headerWO = document.getElementById('current-wo-number');

    if (headerOperator) headerOperator.textContent = operatorName || 'НЕТ';
    if (headerOperation) headerOperation.textContent = operationName || 'НЕТ';
    if (headerWO) headerWO.textContent = wo || 'НЕТ';
    

    // 🔥 УПРАВЛЕНИЕ КНОПКАМИ
    const startBtn = document.querySelector('.action-start');
    const pauseBtn = document.querySelector('.action-pause');
    const serialInput = getElement('serial-input');
    const logoutBtn = document.getElementById('logout-btn');

    // 🔐 ЛОГАУТ: заблокирован ТОЛЬКО когда операция АКТИВНА
    if (logoutBtn) {
		// 🔥 Logout запрещён, если операция активна ИЛИ на паузе
		const isBlocked = (isWorking === true || isWorking === false);

		logoutBtn.disabled = isBlocked;
		logoutBtn.style.opacity = isBlocked ? '0.6' : '1';
	}



    // --- ЛОГИКА КНОПКИ START / RESUME ---
	if (startBtn) {

		if (!isAuthorized) {
			// нельзя нажать вообще
			startBtn.disabled = true;
		}

		else if (isWorking === true) {
			// операция уже активна — ничего не делаем
			startBtn.disabled = true;
		}

		else if (isWorking === false) {
			// на паузе — разрешаем возобновить
			startBtn.disabled = false;
			startBtn.textContent = getTranslation('start_button') || 'Resume';
		}

		else {
			// операция ещё не начата — разрешаем старт
			startBtn.disabled = false;
			startBtn.textContent = getTranslation('start_button') || 'Start';
		}

		startBtn.style.opacity = startBtn.disabled ? '0.6' : '1';
	}


	// --- ЛОГИКА КНОПКИ PAUSE ---
	if (pauseBtn) {
		if (isWorking === true) {
			pauseBtn.disabled = false;
		} else {
			pauseBtn.disabled = true;
		}
	}
	
	// --- ЛОГИКА КНОПКИ ЗАВЕРШЕНИЯ ОПЕРАЦИИ ---
	const endBtn = document.querySelector('.action-stop');
	if (endBtn) {
		// Завершить можно только когда операция активна
		const canEnd = (isAuthorized && isWorking === true);

		endBtn.disabled = !canEnd;
		endBtn.style.opacity = canEnd ? '1' : '0.5';
	}




    // Поле ввода SN: активно только когда операция активна
    if (serialInput) {
        serialInput.disabled = !(isWorking === true);
        serialInput.placeholder = getTranslation('placeholder_sn');
    }

    // Обновление плейсхолдеров
    if (getElement('serial-input')) {
        getElement('serial-input').placeholder = getTranslation('placeholder_sn');
        getElement('serial-input').value = '';
    }
	// 🔒 УПРАВЛЕНИЕ КНОПКОЙ LOGOUT
	if (logoutBtn) {
		// Разрешено НИКОГДА НЕ заниматься логикой тут, только отображение:
		logoutBtn.disabled = (isWorking === true || isWorking === false);
		logoutBtn.style.opacity = logoutBtn.disabled ? '0.6' : '1';
	}


    
}
async function fetchOperatorSummary(operatorId) {
  try {
    console.log('🔄 Loading operator summary for:', operatorId);
    
    const res = await fetch(`/api/reports/operator_summary/${operatorId}`);
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const data = await res.json();
    
    console.log('📊 Operator summary response:', data);
    
    if (data.status === 'ok' && data.summary) {
      currentOperatorSummary = (data.summary || []).map(row => ({
		operation_id: row.operation_id,
		operation_name: row.operation_name,   // ← ДОБАВЛЕНО
		wo: row.wo,
		count: row.count,
		last_activity: row.last_activity,
		status: row.status,
		is_active: row.is_active,

		// 🔥 Новые поля из API (cycle_planner)
		cycle_minutes: row.cycle_minutes,
		active_seconds: row.active_seconds,
		planned_cycle_minutes: row.planned_cycle_minutes,
		planned_per_hour: row.planned_per_hour
	}));

      console.log('✅ Operator summary updated:', currentOperatorSummary);
    } else {
      currentOperatorSummary = [];
      console.log('ℹ️ No operator summary data');
    }
  } catch (err) {
    console.error('❌ Error loading operator summary:', err);
    currentOperatorSummary = [];
  }
  renderOperatorSummary();
  updateUI();
}

// Автообновление каждые 30 секунд
let autoRefreshInterval;

function startAutoRefresh() {
  // Останавливаем предыдущий интервал если был
  stopAutoRefresh();
  
  autoRefreshInterval = setInterval(() => {
    if (currentOperator && isAuthorized) {
      console.log('🔄 Auto-refreshing operator data...');
      fetchOperatorSummary(currentOperator);
    
    }
  }, 30000); // 30 секунд
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

async function processSN(rawSn) {
    // 🔥 Нормализуем номер СРАЗУ на входе
    const sn = normalizeSN(rawSn);

    // 1. Предварительные проверки состояния
    if (!isWorking) {
        showToast(getTranslation('alert_not_working'), 'error');
        return;
    }
    
    if (!sn) {
        showToast(getTranslation('alert_sn_empty'), 'error');
        return;
    }

    const serialInput = document.getElementById('serial-input');
    const state = getGlobalState();
    const operatorId  = state.operatorId || currentOperator;
    const operationId = currentOperation || state.operation_id;
    const workOrderId = currentWO || state.wo;

    if (!operatorId || !operationId || !workOrderId) {
        console.warn('⚠️ Нет полного набора данных для проверки SN', {
            operatorId, operationId, workOrderId
        });
        showToast(getTranslation('alert_start_error') || 'Нет данных по операции для проверки SN', 'error');
        return;
    }

    if (serialInput) {
        serialInput.disabled = true;
    }

    console.log('🔴 processSN: начало обработки очищенного SN:', sn);

    try {
        // 🔍 Шаг 1: Проверка на дубликат (теперь передаем уже очищенный sn)
        const resp = await fetch('/api/check_serial_duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operator_id: operatorId,
                operation_id: operationId,
                work_order_id: workOrderId,
                serial_number: sn // Он уже очищен в начале функции
            })
        });

        if (!resp.ok) throw new Error(`Ошибка сети: ${resp.status}`);

        const data = await resp.json();
        if (data.duplicate) {
            console.warn('🚫 Дубликат серийного номера обнаружен:', sn);
            showToast(
                getTranslation('alert_sn_duplicate') || 'Этот серийный номер уже введён для этой операции',
                'error'
            );
            if (typeof playErrorSound === 'function') playErrorSound();
            return; 
        }

        // 🔥 Шаг 2: Логируем ЧИСТЫЙ номер
        await logTransaction('COUNT_ITEM', { 
            sn: sn, // Теперь здесь точно чистый номер без "S/N:"
            work_order_id: workOrderId, 
            operation_id: operationId,
            item_count: 1
        });

        // 🔥 Шаг 3: Сохраняем ЧИСТЫЙ номер
        localStorage.setItem('currentSerial', sn);
        console.log('💾 Чистый серийник сохранен в localStorage:', sn);
        
        if (document.getElementById('defect-auto-serial')) {
            updateDefectsPage();
        }

        // 🔥 Шаг 4: Обновляем сводку
        if (currentOperator) {
            await fetchOperatorSummary(currentOperator);
            updateUI();
        }

        showToast(getTranslation('alert_sn_counted', sn), 'success');
        if (typeof playSuccessSound === 'function') playSuccessSound();

    } catch (err) {
        console.error('❌ Сбой при обработке SN:', err);
        showToast(getTranslation('error_network') || 'Ошибка при сохранении данных', 'error');
    } finally {
        if (serialInput) {
            serialInput.disabled = false;
            serialInput.value = ''; 
            serialInput.focus();
        }
    }
}


function renderOperatorSummary() {
    const container = getElement('operator-summary-table');
    if (!container) {
        console.error('❌ Container operator-summary-table not found!');
        return;
    }

    // 🔥 ВОССТАНАВЛИВАЕМ СОСТОЯНИЕ ИЗ GLOBALSTATE ПЕРЕД РЕНДЕРОМ
    const state = getGlobalState();
    const isAuthorizedLocal = !!(state.operatorId && state.operation_id && state.wo);
    const currentOperatorLocal = state.operatorId || state.operator;
    
    console.log('🎨 Rendering operator summary:', {
        containerExists: !!container,
        currentOperator: currentOperatorLocal,
        isAuthorized: isAuthorizedLocal,
        summaryLength: currentOperatorSummary ? currentOperatorSummary.length : 0,
        stateFromStorage: state
    });

    let html = '';

    // 🔥 ИСПРАВЛЕННОЕ УСЛОВИЕ: используем локальные переменные
    // ❗ Показываем сводку, если оператор есть. isAuthorized больше не проверяем.
	if (!currentOperatorLocal) {
			html = `
				<tbody>
					<tr>
						<td colspan="8" style="text-align: center; color: #666; padding: 20px;">
							${getTranslation('summary_title')}<br>
							<small>${getTranslation('status_waiting_auth')}</small>
							<br><small>Оператор: НЕТ</small>
						</td>
					</tr>
				</tbody>
			`;
			container.innerHTML = html;
			return;
		}	
	if (!currentOperatorSummary || currentOperatorSummary.length === 0) {
        html = `
            <tbody>
                <tr>
                    <td colspan="8" style="text-align: center; color: #666; padding: 20px;">
                        ${getTranslation('summary_title')}<br>
                        <small>Нет данных за сегодня</small>
                        <br><small>Оператор: ${currentOperatorLocal}</small>
                    </td>
                </tr>
            </tbody>
        `;
        console.log('📭 No data available for summary');
    } else {
        console.log('📊 Rendering summary with data:', currentOperatorSummary.length, 'items');
        
        html += `
            <thead>
                <tr>
                    <th>${getTranslation('summary_operation')}</th>
                    <th>${getTranslation('summary_wo')}</th>
                    <th>${getTranslation('summary_count')}</th>
                    <th>${getTranslation('plan_cycle')}</th>
					<th>${getTranslation('plan_per_hour')}</th>
                    <th>${getTranslation('actual_cycle')}</th>
                    <th>${getTranslation('active_time')}</th>
                    <th>${getTranslation('summary_status')}</th>
					
                </tr>
            </thead>
            <tbody>
        `;

        currentOperatorSummary.forEach((item, index) => {
            console.log(`📋 Rendering item ${index}:`, item);
            
            let statusCell = '';
            switch (item.status) {
                case 'active':
                    statusCell = `<span class="status-symbol" style="color: limegreen;" title="${getTranslation('status_active')}">🟢</span>`;
                    break;
                case 'paused':
                    statusCell = `<span class="status-symbol" style="color: orange;" title="${getTranslation('status_paused')}">⏸️</span>`;
                    break;
                case 'finished':
                    statusCell = `<span class="status-symbol" style="color: gray;" title="${getTranslation('status_completed')}">⚪</span>`;
                    break;
                default:
                    statusCell = `<span class="status-symbol" style="color: #007bff;">❓</span>`;
                    break;
            }

            const cycleMin = item.cycle_minutes != null 
                ? item.cycle_minutes.toFixed(2) + ' min'
                : '-';

            const plannedCycle = item.planned_cycle_minutes != null
                ? item.planned_cycle_minutes.toFixed(2) + ' min'
                : '-';

            const activeMin = item.active_seconds != null
                ? (item.active_seconds / 60).toFixed(1) + ' min'
                : '-';

            let cycleColor = '';
            if (item.planned_cycle_minutes != null && item.cycle_minutes != null) {
                const planned = item.planned_cycle_minutes;
                const actual = item.cycle_minutes;
                const ratio = actual / planned;

                if (ratio <= 0.9) {
                    cycleColor = 'color: limegreen; font-weight: bold;';
                } else if (ratio <= 1.1) {
                    cycleColor = 'color: goldenrod; font-weight: bold;';
                } else {
                    cycleColor = 'color: red; font-weight: bold;';
                }
            }

            html += `
                <tr>
                    <td>${item.operation_name || item.operation_id || '-'}</td>
                    <td>${item.wo || '-'}</td>
                    <td>${item.count || 0}</td>
					<td>${plannedCycle}</td>
					<td>
					  ${item.planned_per_hour != null ? item.planned_per_hour : '-'}
					</td>                    
                    <td style="${cycleColor}">${cycleMin}</td>
                    <td>${activeMin}</td>
                    <td>${statusCell}</td>
                </tr>
            `;
        });

        html += `</tbody>`;
    }

    container.innerHTML = html;
    console.log('✅ Summary rendered successfully');
}

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ
function checkAuthorization() {
    const state = getGlobalState();
    return !!(state.operatorId && state.operation_id && state.wo);
}


// --- ЛОГИКА АВТОРИЗАЦИИ И ВЫБОРА (ИСПРАВЛЕНА!) ---
window.selectOperator = async function(id) {
    if (!currentProduct) {
        alert('Please select a product first.');
        const operatorSelect = document.getElementById('operator-select');
        operatorSelect.value = ''; // сбрасываем выбор
        return;
    }
    
    if (id) {
        currentOperator = id;
        isAuthorized = true;
                         
        await fetchOperatorSummary(id);

        
        logTransaction('AUTH', { operator_id: id });
        
        const select = document.getElementById('operator-select');
        const operatorName = select?.options[select.selectedIndex]?.text || id;

        showToast(getTranslation('alert_auth_success', operatorName), 'success'); 
        
        // 🔹 ПОКАЗЫВАЕМ КНОПКУ СБРОСА
        const resetBtn = document.getElementById('reset-operator-btn');
        if (resetBtn) resetBtn.style.display = 'inline-block';
        
    } else {
        // Полный сброс, если оператор не выбран
        currentOperator = null;
        currentOperation = null;
        currentWO = null;
        isAuthorized = false;
        isWorking = null; 
        currentOperatorSummary = []; 
        
        
        // 🔹 СКРЫВАЕМ КНОПКУ СБРОСА
        const resetBtn = document.getElementById('reset-operator-btn');
        if (resetBtn) resetBtn.style.display = 'none';
        
        showToast(getTranslation('alert_auth_error'), 'error'); 
    }
    
    
}
window.selectOperation = function(operation_id) {
    if (operation_id) {
        currentOperation = operation_id;
        
        // 🔥 СОХРАНЯЕМ НАЗВАНИЕ ОПЕРАЦИИ В GlobalState
        const operationSelect = document.getElementById('operation-select');
        const operationName = operationSelect?.options[operationSelect.selectedIndex]?.text || '';
        
        
        
        logTransaction('SELECT_OPERATION', { operation_id });
    } else {
        currentOperation = null;
        // 🔥 ОЧИЩАЕМ НАЗВАНИЕ ПРИ СБРОСЕ
        const state = getGlobalState();
        const updatedState = {
            ...state,
            operation_id: null,
            operation_name: null
        };
        localStorage.setItem('GlobalState', JSON.stringify(updatedState));
    }
    
    
    setTimeout(() => {
        if (currentOperator) {
            fetchOperatorSummary(currentOperator);
        }
    }, 500);
};

// --- ЛОГИКА ВВОДА СКАНЕРОМ (Остается только для SN) ---
function normalizeSN(sn) {
    if (!sn) return "";
    // Очистка: удаляем "S/N:", пробелы, приводим к верхнему регистру
    return sn.toString().replace(/S\/N[:\s]*/i, "").trim().toUpperCase();
}

window.handleScanInput = function(inputElement, type, event) {
    if (type !== 'ITEM') return;

    if (event && (event.key === 'Enter' || event.keyCode === 13)) {
        clearTimeout(scanTimer);
        // 🔥 ВМЕСТО .trim() используем нашу функцию очистки
        const sn = normalizeSN(inputElement.value); 
        if (sn) processSN(sn);
        inputElement.value = '';
        return;
    }

    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
        if (inputElement.value) {
            // 🔥 И здесь тоже вызываем normalizeSN
            processSN(normalizeSN(inputElement.value));
        }
        inputElement.value = ''; 
    }, SCAN_TIMEOUT_MS);
}

async function logTransaction(type, data = {}) {
    const state = getGlobalState();
    
    // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Всегда передаем основные поля
    const entry = {
        type,
        operator_id: state.operatorId || currentOperator || 'N/A',
        operation_id: currentOperation || state.operation_id || 'N/A', 
        work_order_id: currentWO || state.wo || 'N/A',
        timestamp: new Date().toISOString(),
        data: data
    };

    // 🔥 ДЛЯ COUNT_ITEM ДОБАВЛЯЕМ item_count В ОСНОВНЫЕ ПОЛЯ
    if (type === 'COUNT_ITEM') {
        entry.item_count = data.item_count || 1;
        entry.operator_id = state.operatorId || currentOperator;
        entry.operation_id = currentOperation || state.operation_id;
        entry.work_order_id = currentWO || state.wo;
    }

    console.log('📨 Отправка в журнал:', entry);

    try {
        const response = await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
        
        console.log('📩 Ответ сервера:', response.status, response.statusText);
        
        const result = await response.json();
        console.log('✅ Успешно отправлено в журнал:', result);
        
    } catch (err) {
        console.error('❌ Ошибка отправки в журнал:', err);
    }
}


// ======================================================
//  СТАРТ ОПЕРАЦИИ
// ======================================================

window.processOperation = async function () {
    console.log('🔘 processOperation вызван');

    const state = getGlobalState();
    currentOperator = state.operatorId || currentOperator;
    currentOperation = state.operation_id || currentOperation;
    currentWO = state.wo || currentWO;

    isAuthorized = !!(currentOperator && currentOperation && currentWO);

    if (!isAuthorized) {
        showToast(getTranslation('alert_start_error'), 'error');
        return;
    }

    // --- 1️⃣ ОПЕРАЦИЯ УЖЕ АКТИВНА ---
    if (isWorking === true) {
        showToast(getTranslation('alert_already_working') || 'Operation already active', 'info');
        return;
    }

    // --- 2️⃣ ВОЗОБНОВЛЕНИЕ ПОСЛЕ ПАУЗЫ ---
    if (isWorking === false) {
        isWorking = true;

        const st = getGlobalState();
        st.isWorking = true;
        localStorage.setItem('GlobalState', JSON.stringify(st));

        logTransaction('RESUME_OP', {
            operation_id: currentOperation,
            work_order_id: currentWO
        });

        showToast(getTranslation('status_working'), 'success');
        updateUI();
        if (currentOperator) fetchOperatorSummary(currentOperator);

        console.log('✅ RESUME_OP выполнен');
        return;
    }

    // --- 3️⃣ СТАРТ НОВОЙ ОПЕРАЦИИ ---
    if (isWorking === null) {
        isWorking = true;

        const st = getGlobalState();
        st.isWorking = true;
        localStorage.setItem("GlobalState", JSON.stringify(st));

        logTransaction('START_OP', {
            operation_id: currentOperation,
            work_order_id: currentWO
        });

        showToast(getTranslation('status_working'), 'success');
        updateUI();
        if (currentOperator) {
            await fetchOperatorSummary(currentOperator);
            startAutoRefresh();
        }

        console.log('✅ START_OP выполнен');
        return;
    }
};


// ======================================================
//  КНОПКА ПАУЗЫ (переключатель)
// ======================================================
window.showDowntimeForm = function () {
    console.log("🔍 showDowntimeForm - isWorking:", isWorking);
    
    if (!isAuthorized) {
        showToast(getTranslation('alert_not_authorized'), 'error');
        return;
    }

    // 🔥 ИСПРАВЛЕНИЕ: если на паузе - возобновляем
    if (isWorking === false) {
        console.log("🔍 Already paused - resuming operation");
        endDowntime();
        return;
    }

    // 🔥 ИСПРАВЛЕНИЕ: если операция активна - ставим на паузу
    if (isWorking === true) {
        // Показываем форму выбора причины простоя
        const modal = document.getElementById('modal-downtime');
        if (modal) {
            modal.style.display = 'block';
        }
        return;
    }

    // 🔥 Если операция не начата - ошибка
    showToast(getTranslation('error_start_before_operation'), 'error');
};




// ======================================================
//  СНЯТИЕ ПАУЗЫ
// ======================================================
function endDowntime() {
    if (isWorking !== false) {
        console.warn('Попытка возобновить операцию которая не на паузе');
        return;
    }

    isWorking = true;

    const st = getGlobalState();
    st.isWorking = true;
    localStorage.setItem("GlobalState", JSON.stringify(st));

    logTransaction('RESUME_OP', {
        operation_id: currentOperation,
        work_order_id: currentWO
    });

    showToast(getTranslation('status_working'), 'success');

    updateUI();

    setTimeout(() => {
        if (currentOperator) fetchOperatorSummary(currentOperator);
    }, 300);
}



// ======================================================
//  НАЧАЛО ПРОСТОЯ
// ======================================================
window.startDowntime = function () {
    const reasonCode = getElement('downtime-reason').value;
    if (!reasonCode) {
        showToast(getTranslation('downtime_select_reason'), 'error');
        return;
    }

    if (isWorking !== true) {
        showToast(getTranslation('error_cannot_pause_not_active'), 'error');
        return;
    }

    isWorking = false;

    const st = getGlobalState();
    st.isWorking = false;
    localStorage.setItem("GlobalState", JSON.stringify(st));

    logTransaction('PAUSE_OP', {
        operation_id: currentOperation,
        work_order_id: currentWO,
        reason_id: reasonCode
    });

    hideDowntimeForm();
    updateUI();

    setTimeout(() => {
        if (currentOperator) fetchOperatorSummary(currentOperator);
    }, 300);
};



// ======================================================
//  ЗАВЕРШЕНИЕ ОПЕРАЦИИ
// ======================================================
window.endWorkOrShift = async function () {
    console.log('🔘 endWorkOrShift вызван', {
        currentOperator,
        currentOperation,
        currentWO,
        isAuthorized,
        isWorking
    });
	// 🚫 Нельзя завершать операцию во время паузы
    if (isWorking === false) {
        showToast(getTranslation('error_pause_cannot_finish'), 'error');
        return;
    }
	

    // Разрешаем завершать, если есть активная операция и наряд
    if (!currentOperation || !currentWO) {
        showToast(getTranslation('error_operation_not_active'), 'error');

        return;
    }

    // Останавливаем автообновление сводки
    stopAutoRefresh();

    const oldWO = currentWO;
    const oldOperation = currentOperation;

    // Обновляем сводку перед завершением
    if (currentOperator) {
        await fetchOperatorSummary(currentOperator);
    }

    // 📝 Логирование завершения операции
    logTransaction('END_OP_SESSION', {
        operation_id: oldOperation,
        work_order_id: oldWO,
        reason_id: 'END_OPERATION'
    });
	
	

    try {
        const response = await fetch('/api/update_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operator_id: currentOperator,
                wo: oldWO,
                status: 'finished'
            })
        });

        console.log('Статус обновлён:', await response.json());
    } catch (err) {
        console.error('Ошибка обновления статуса:', err);
    }

    showToast(
        getTranslation('alert_op_ended', { wo: oldWO, station: oldOperation }),
        'success'
    );

    // 🔥 Флаги состояния
    isWorking = null;
    isAuthorized = false;

    // Старт невозможен без авторизации
    const startBtn = document.querySelector('.action-start');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.6';
    }

    // Пауза выключена
    const pauseBtn = document.querySelector('.action-pause');
    if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.style.opacity = '0.6';
        pauseBtn.textContent = getTranslation('pause_button');
        pauseBtn.style.backgroundColor = '';
    }

    // Блокируем ввод серийного номера
    const serialInput = document.getElementById('serial-input');
    if (serialInput) {
        serialInput.disabled = true;
        serialInput.value = '';
    }

    // Разблокируем Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.disabled = false;
        logoutBtn.style.opacity = '1';
        logoutBtn.title = getTranslation('logout_button') || 'Выход';
    }
	// 🔥 Корректная очистка GlobalState при завершении операции
	const st = getGlobalState();
	const clearedState = {
		...st,
		operatorId: null,
		operatorName: null,
		operator: null,
		operation_id: null,
		operation_name: null,
		wo: null,
		isWorking: null,
		isAuthorized: false
	};
	localStorage.setItem('GlobalState', JSON.stringify(clearedState));
	// 🔥 Сразу убрать сводку, потому что операции уже нет
	const table = document.getElementById('operator-summary-table');
	if (table) table.innerHTML = "";

    updateUI();

    console.log('✅ Операция завершена, logout доступен');
};


function updateVisualControlButton() {
    const vcBtn = document.getElementById("vc-btn");
    if (!vcBtn) return;

    const state = getGlobalState();
    const opId = state.operation_id;

    // Разрешённые операции
    const allowedOps = ["707", "708", "709"];

    if (allowedOps.includes(opId)) {
        vcBtn.style.display = "inline-block";
        vcBtn.disabled = false;
        vcBtn.style.opacity = "1";
    } else {
        vcBtn.style.display = "none"; // полностью скрыть
        // Если хочешь показывать, но делать неактивной:
        // vcBtn.disabled = true;
        // vcBtn.style.opacity = "0.4";
    }
}



// === Загрузка операторов из базы ===
async function loadOperators() {
  try {
    console.log('🔍 loadOperators() called');
    const res = await fetch('/api/operators');
    const data = await res.json();
    console.log('📦 Operators from API:', data);

    const select = document.getElementById('operator-select');
    if (!select) return;

    // Перезаполняем список операторов
    select.innerHTML = '<option value=""></option>';
    data.forEach(op => {
      const option = document.createElement('option');
      option.value = op.operator_id;
      option.textContent = op.operator_name;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Error loading operators:', err);
  }
}





// === ФУНКЦИИ ДЛЯ УЧЕТА ДЕФЕКТОВ ===

/**
 * Запись дефекта в базу данных
 */
window.logDefect = async function() {
    console.log('🔴 logDefect() called - проверка вызова функции');
    
    const componentSelect = document.getElementById('component-select');
    const defectSelect = document.getElementById('defect-select');
    
    const componentId = componentSelect.value;
    const defectId = defectSelect.value;
    
    console.log('Компонент:', componentId);
    console.log('Дефект:', defectId);
    
    if (!componentId || !defectId) {
        showToast(getTranslation('error_select_defect_and_reason'), 'error');
        return;
    }
    
    const state = getGlobalState();
    console.log('Текущее состояние:', state);
    
    if (!state.operatorId) {
        showToast(getTranslation('error_defect_not_authorized'), 'error');
        return;
    }
    
    const currentProduct = window.currentProduct || '';
    
    // 🔥 ПОЛУЧАЕМ product_name из отображения на странице или из состояния
    const currentProductName = window.currentProductName 
        || document.getElementById('defect-auto-product')?.textContent 
        || '';
    
    let currentSerial = '';
    const savedSerial = localStorage.getItem('currentSerial');
    console.log('🔍 Серийник из localStorage:', savedSerial);
    
    if (savedSerial) {
        currentSerial = savedSerial;
    }
    
    if (!currentSerial) {
        const serialInput = document.getElementById('serial-input');
        if (serialInput && serialInput.value) {
            currentSerial = serialInput.value;
        }
    }
    
    console.log('Автоматические данные:', {
        product_id: currentProduct,
        product_name: currentProductName,
        serial: currentSerial
    });
    
    try {
        const requestBody = {
            operator_id: state.operatorId,
            operation_id: state.operation_id || 'N/A',
            work_order_id: state.wo || 'N/A',
            component_id: componentId,
            defect_id: defectId,
            product_id: currentProduct,
            product_name: currentProductName,   // 🔥 ДОБАВЛЕНО!
            serial_number: currentSerial
        };

        console.log('📤 Отправляемые данные:', requestBody);

        const response = await fetch('/api/log_defect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        console.log('📥 Ответ сервера:', response.status, response.statusText);
        const result = await response.json();
        console.log('📦 Результат:', result);
        
        if (result.success) {
            showToast(getTranslation('success_defect_registered'), 'success');
            componentSelect.value = '';
            defectSelect.value = '';
        } else {
            showToast(getTranslation('error_defect_save_failed', { details: result.error || 'неизвестная ошибка' }), 'error');
        }
    } catch (err) {
        console.error('❌ Error logging defect:', err);
        showToast(getTranslation('error_network'), 'error');
    }
}
/**
 * Загрузка компонентов для выпадающего списка
 * с фильтром по текущему продукту
 */
async function loadComponents() {
    try {
		const currentProductId = window.currentProduct || '';
        const response = await fetch('/api/components');
        const components = await response.json();

        const select = document.getElementById('component-select');
        if (!select) return;

        // Сохраняем текущее значение
        const currentValue = select.value;

        // Определяем текущий продукт (В UI это product_name)
		const state = getGlobalState();
		const currentProductName =
			localStorage.getItem('product') ||
			state.product ||
			window.currentProduct ||
			'';

        console.log('🧩 loadComponents() фильтрация:', {
            currentProductId,    // Должно быть 'PROD208'
            currentProductName,  // Должно быть 'SC1A208'
            productsList: window.productsList,
            totalComponents: components.length,
            componentsSample: components.slice(0, 3) // покажем первые 3 компонента для отладки
        });

        // --- ФИЛЬТР ПО ПРОДУКТУ ---
        let filtered = components;

        if (currentProductName) {
			filtered = components.filter(c => {
				const compProductName = c.product_name || '';
				return compProductName === currentProductName;
			});

			if (filtered.length === 0) {
				console.warn('⚠️ Не найдено компонентов для продукта:', currentProductName);

				select.innerHTML = `
					<option value="">-- Нет компонентов для ${currentProductName} --</option>
					<option value="OTHER">Другой компонент</option>
				`;
				return;
			}
		} else {
			console.warn('⚠️ Продукт не выбран, показываю все компоненты');
		}


        // Заполняем select
        select.innerHTML = '<option value=""></option>';
        filtered.forEach(component => {
            const option = document.createElement('option');
            option.value = component.component_id;
            option.textContent = component.component_name || component.component_id;
            select.appendChild(option);
        });

        // Восстанавливаем значение если было
        if (currentValue) {
            select.value = currentValue;
        }

    } catch (err) {
        console.error('❌ Error loading components:', err);
        const select = document.getElementById('component-select');
        if (select) {
            select.innerHTML = `
                <option value="">-- Ошибка загрузки --</option>
                <option value="OTHER">Другой компонент</option>
            `;
        }
    }
}

/**
 * Загрузка типов дефектов для выпадающего списка
 */
async function loadDefects() {
    try {
        const response = await fetch('/api/defects');
        const defects = await response.json();
        
        const select = document.getElementById('defect-select');
        if (!select) return;
        
        // Сохраняем текущее значение
        const currentValue = select.value;
        
        select.innerHTML = '<option value=""></option>';
        defects.forEach(defect => {
            const option = document.createElement('option');
            option.value = defect.defect_id;
            
            // Выбираем описание на текущем языке
            let description = defect.defect_description_ru; // по умолчанию русский
            if (currentLang === 'en' && defect.defect_description_en) {
                description = defect.defect_description_en;
            } else if (currentLang === 'et' && defect.defect_description_et) {
                description = defect.defect_description_et;
            }
            
            option.textContent = description || defect.defect_id;
            select.appendChild(option);
        });
        
        // Восстанавливаем значение если было
        if (currentValue) {
            select.value = currentValue;
        }
    } catch (err) {
        console.error('❌ Error loading defects:', err);
    }
}

/**
 * Инициализация страницы дефектов
 */
async function initDefectsPage() {
    console.log('🧩 initDefectsPage вызван');
	const state = getGlobalState();
    
    // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Получаем продукт из GlobalState
    const currentProduct = localStorage.getItem('product') || '';
	window.currentProduct = currentProduct;
    
    
    
    
    
    const savedSerial = localStorage.getItem('currentSerial');
    console.log('🔍 Серийник из localStorage:', savedSerial);
    console.log('📦 Продукт для дефектов:', currentProduct);
    console.log('📋 Список продуктов:', window.productsList);
    
    const defectSelect = document.getElementById('defect-select');
    const componentSelect = document.getElementById('component-select');
    const defectButton = document.querySelector('[onclick="logDefect()"]');
    
    // Проверяем, что мы на странице дефектов
    if (!defectSelect || !componentSelect || !defectButton) return;
    
    console.log('🧩 Initializing Defect Tracking page');
    
    // 🔥 ОБНОВЛЯЕМ АВТОМАТИЧЕСКИЕ ДАННЫЕ - ИСПРАВЛЕННАЯ ВЕРСИЯ
    const autoProduct = document.getElementById('defect-auto-product');
    const autoSerial = document.getElementById('defect-auto-serial');

    if (autoProduct) {
        // 🆕 ПОКАЗЫВАЕМ НАЗВАНИЕ ПРОДУКТА ВМЕСТО ID
        autoProduct.textContent = currentProduct || 'НЕТ';
        console.log('📦 Продукт для дефектов:', currentProduct);
    }
    
    if (autoSerial) {
        const savedSerial = localStorage.getItem('currentSerial') || '';
        autoSerial.textContent = savedSerial || 'НЕТ';
        console.log('🔢 Серийник для дефекта:', savedSerial);
    }
    
    try {
        // Загружаем данные
        await loadComponents();
        await loadDefects();
        
        // Проверяем авторизацию
        if (state.operatorId) {
            // Включаем форму если оператор авторизован
            componentSelect.disabled = false;
            defectSelect.disabled = false;
            defectButton.disabled = false;
            
            // Обновляем информацию в заголовке
            document.getElementById('defect-current-operator').textContent = 
                state.operatorName || state.operatorId;
            document.getElementById('defect-current-wo').textContent = 
                state.wo || 'НЕТ';
        } else {
            console.warn('⚠️ Not authorized — fields remain disabled');
        }
    } catch (err) {
        console.error('❌ Error initializing defects page:', err);
    }
    
    updateDefectsPage();
}

/**
 * Загрузка продуктов специально для страницы дефектов
 */
async function loadProductsForDefects() {
    try {
        console.log('🔄 Загрузка продуктов для страницы дефектов...');
        const response = await fetch('/api/products');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const products = await response.json();
        console.log('📦 Products loaded for defects page:', products);
        
        // Сохраняем список продуктов
        window.productsList = {};
        products.forEach(product => {
            window.productsList[product.product_id] = product.product_name || product.product_id;
        });
        
        console.log('✅ Products list updated:', window.productsList);
        
    } catch (err) {
        console.error('❌ Error loading products for defects page:', err);
        // Создаем тестовые данные если API недоступно
        window.productsList = {
            'TEST001': 'Test Product 1',
            'TEST002': 'Test Product 2'
        };
    }
}

// 🔧 ФУНКЦИЯ ОБНОВЛЕНИЯ СТРАНИЦЫ ДЕФЕКТОВ
function updateDefectsPage() {
    const state = getGlobalState();

    // продукт только читаем, никогда не меняем!
    const currentProduct =
	  localStorage.getItem('product') ||
	  window.currentProduct ||
	  state.product ||
	  '';

    const autoProduct = document.getElementById('defect-auto-product');
    const autoSerial = document.getElementById('defect-auto-serial');

    autoProduct.textContent = currentProduct || 'НЕТ';
	console.log('📦 Продукт для дефектов:', currentProduct);

    // отображаем серийник
    if (autoSerial) {
        const savedSerial = localStorage.getItem('currentSerial') || '';
        autoSerial.textContent = savedSerial || 'НЕТ';
    }

    // логика отображения — только вывод, не меняет состояние
    console.log('🔄 Defects page updated:', {
        product: window.productsList?.[currentProduct] || currentProduct,
        serial: localStorage.getItem('currentSerial')
    });
}

// === API-запрос: получение итога смены ===
async function fetchShiftSummary(operatorId, workOrderId) {
  try {
    // формируем адрес запроса
    const url = `/api/reports/shift_summary/${operatorId}?wo=${encodeURIComponent(workOrderId)}`;
    console.log('[fetchShiftSummary] →', url);

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'ok') {
      console.error('[fetchShiftSummary] Ошибка API:', data.error || data);
      return null;
    }

    console.log('[fetchShiftSummary] Получено:', data);
    return data; // структура: { status, operator_id, work_order_id, date, summary: [...] }
  } catch (err) {
    console.error('[fetchShiftSummary] Ошибка сети или парсинга:', err);
    return null;
  }
}

// === Итог смены ===
async function renderShiftSummary() {
  const container = document.getElementById('shift-summary-block');
  if (!container) return;

  // Если оператор не выбран
  if (!isAuthorized || !currentOperator) {
    container.innerHTML = `<h2>Итог смены</h2><p>Оператор не выбран.</p>`;
    return;
  }

  container.innerHTML = `<h2>Итог смены</h2><p>Загрузка данных...</p>`;

  // Берём первый ордер из сводки оператора
  const workOrders = currentOperatorSummary
    ? [...new Set(currentOperatorSummary.map(i => i.wo).filter(Boolean))]
    : [];

  if (workOrders.length === 0) {
    container.innerHTML = `<h2>Итог смены</h2><p>Нет активных ордеров за сегодня.</p>`;
    return;
  }

  // Для начала просто используем первый ордер из списка
  const workOrderId = workOrders[0];
  const data = await fetchShiftSummary(currentOperator, workOrderId);

  if (!data || !data.summary || data.summary.length === 0) {
    container.innerHTML = `
      <h2>Итог смены</h2>
      <p>Ордер: ${workOrderId}</p>
      <p>Нет данных по операциям.</p>
    `;
    return;
  }

  // Строим таблицу
  let html = `
    <h2>Итог смены</h2>
    <p>Оператор: ${currentOperator}</p>
    <p>Ордер: ${workOrderId}, Дата: ${data.date}</p>
    <table class="summary-table" style="margin-top:8px;">
      <thead>
        <tr>
          <th>Операция</th>
          <th>Произведено</th>
          <th>Дефектные</th>
          <th>Ушло в ремонт</th>
          <th>Типы дефектов</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.summary.forEach(row => {
    const defectsText =
      row.defects && row.defects.length > 0
        ? row.defects.join(', ')
        : '-';
    html += `
      <tr>
        <td>${row.operation_name || row.operation_id || '-'}</td> 
        <td>${row.total_count}</td>
        <td>${row.defective_count || 0}</td>
        <td>${row.repair_sent_count || 0}</td>
        <td>${defectsText}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}


// === Кнопка выхода / смены ордера ===
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', () => {

    // 🔥 Правильная проверка: выход запрещён ТОЛЬКО если операция АКТИВНА
    if (isWorking === true) {
        showToast(getTranslation('error_finish_before_logout'), 'error');
        return;
    }

    // 🔥 очищаем состояние
    localStorage.removeItem('GlobalState');
    isAuthorized = false;
    isWorking = false;

    window.location.href = 'login.html';
  });
});
// === Авторизация оператора на login.html ===
document.addEventListener('DOMContentLoaded', () => {
  const confirmBtn = document.getElementById('confirm-btn');
  if (!confirmBtn) return; // если не на login.html — выходим

  // В обработчике кнопки подтверждения на login.html
	confirmBtn.addEventListener('click', () => {
		const product = document.getElementById('product-select').value;
		const operatorSelect = document.getElementById('operator-select');
		const operatorId = operatorSelect.value;
		const operatorName = operatorSelect.options[operatorSelect.selectedIndex]?.text || '';
		
		const operationSelect = document.getElementById('operation-select');
		const operation_id = operationSelect.value;
		const operationName = operationSelect.options[operationSelect.selectedIndex]?.text || '';
		
		const wo = document.getElementById('wo-input').value.trim();

		if (!product || !operatorId || !operation_id || !wo) {
			alert('Пожалуйста, заполните все поля.');
			return;
		}

		// 🔥 ПРАВИЛЬНОЕ СОХРАНЕНИЕ ВСЕХ ДАННЫХ
		const globalState = {
			product: product,
			operatorId: operatorId,           // ID оператора (TLN00010)
			operatorName: operatorName,       // Имя оператора (Иван Иванов)
			operator: operatorName,           // Дублируем для совместимости
			operation_id: operation_id,       // ID операции (710)
			operation_name: operationName,    // Название операции (Сборка)
			wo: wo,
			isAuthorized: true,
			isWorking: false
		};

		console.log('💾 Сохраняем GlobalState:', globalState);
		localStorage.setItem('GlobalState', JSON.stringify(globalState));

		// переходим на основную страницу
		window.location.href = 'index.html';
	});
});
window.hideDowntimeForm = function() {
    const modal = document.getElementById('modal-downtime');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Очищаем выбор причины
    const reasonSelect = document.getElementById('downtime-reason');
    if (reasonSelect) {
        reasonSelect.value = '';
    }
}

window.filterOperationsByProduct = function() {
  console.log('[filterOperationsByProduct] запущена');
  const productSelect = document.getElementById('product-select');
  const operationSelect = document.getElementById('operation-select');
  const selectedProductId = productSelect.value;
  console.log('🔍 Выбранный продукт ID:', selectedProductId);
  console.log('🔍 allWorkOrders доступен:', !!window.allWorkOrders);
  console.log('🔍 allWorkOrders количество:', window.allWorkOrders ? window.allWorkOrders.length : 0);

  if (!selectedProductId || !window.allOperations || !window.allProducts) {
    console.warn('[filterOperationsByProduct] нет данных для фильтрации');
    return;
  }

  const selectedProductName = selectedProductId;
  
  // 2️⃣ Фильтруем операции по product_id (ИСПРАВЛЕНО!)
  const filtered = window.allOperations.filter(
	  op => op.product_name === selectedProductName
	);

  // 3️⃣ Очищаем и заполняем список операций
  operationSelect.innerHTML = '';
  if (filtered.length === 0) {
    operationSelect.innerHTML = `<option value="">Нет операций для ${selectedProductName}</option>`;
    return;
  }

  filtered.forEach(op => {
    const option = document.createElement('option');
    option.value = op.operation_id;         
	option.textContent = op.operation_name;
    operationSelect.appendChild(option);
  });

  operationSelect.selectedIndex = 0;
  console.log(`[filterOperationsByProduct] ${filtered.length} операций для ${selectedProductId}`);

  
  // 🔥 ДОБАВИТЬ: Фильтруем ордера по продукту (ПОСЛЕ фильтрации операций)
	console.log('🔧 Вызываем filterWorkOrdersByProduct для:', selectedProductId);
	if (typeof filterWorkOrdersByProduct === 'function') {
	  console.log('✅ filterWorkOrdersByProduct найдена, вызываем...');
	  // 🔥 ПЕРЕДАЕМ ОБЪЕКТ ПРОДУКТА ВМЕСТО ID
	  filterWorkOrdersByProduct(selectedProductId);
	} else {
	  console.error('❌ filterWorkOrdersByProduct НЕ НАЙДЕНА!');
	}
};	
function confirmSelection() {
    const operator = document.getElementById('operator-select')?.value;
    const operation = document.getElementById('operation-select')?.value;
    const wo = document.getElementById('wo-input')?.value?.trim();

    if (!operator || !operation || !wo) {
        showToast(getTranslation('error_fill_all_fields'), 'error');
        return;
    }

    // Сохраняем состояние авторизации
    setGlobalState({
        operatorId: operator,
        operation_id: operation,
        wo: wo,
        isAuthorized: true,
        isWorking: null
    });

    window.location.href = 'index.html';
}
	

function loadInitialState() {
    const state = getGlobalState();
    
    console.log('🔍 RAW GlobalState:', state);
    
    // Восстанавливаем базовые данные
    currentProduct = state.product || null;
    currentOperator = state.operatorId || state.operator || null;
    currentOperation = state.operation_id || null;
    currentWO = state.wo || null;
    
    // 🔥 ИСПРАВЛЕНИЕ: Разделяем авторизацию и готовность к работе
    // Авторизован - когда есть оператор
    // Готов к работе - когда есть оператор + станция + WO
    isAuthorized = !!currentOperator; // 🔥 ТОЛЬКО оператор!
    
    // Операция не начата
    isWorking = null;
    
    console.log('🔄 Восстановлено состояние:', {
        product: currentProduct,
        operator: currentOperator,
        operation: currentOperation,
        wo: currentWO,
        isAuthorized: isAuthorized,
        isWorking: isWorking
    });
    
    if (currentOperator) {
        currentOperatorSummary = [];
    }
}

window.filterWorkOrdersByProduct = function(selectedProductId) {
  console.log('🔥 NEW filterWorkOrdersByProduct CALLED', selectedProductId);
  const woSelect = document.getElementById('wo-select');
  if (!woSelect) return;

  // reset
  woSelect.innerHTML = `<option value="">${getTranslation('select_wo')}</option>`;
  woSelect.disabled = true;

  // no product selected
  if (!selectedProductId) {
    woSelect.innerHTML = `<option value="">${getTranslation('select_product_first')}</option>`;
    return;
  }

  // no work orders loaded
  if (!window.allWorkOrders || window.allWorkOrders.length === 0) {
    woSelect.innerHTML = `<option value="">No work orders loaded</option>`;
    return;
  }

  // FILTER DIRECTLY BY product_name
  const selected = selectedProductId.trim().toUpperCase();

	const filteredOrders = window.allWorkOrders.filter(order =>
	  order.product_name &&
	  order.product_name.trim().toUpperCase() === selected
	);
	console.log('🧪 filteredOrders length =', filteredOrders.length);
  if (filteredOrders.length === 0) {
    woSelect.innerHTML = `<option value="">-- No orders for ${selectedProductId} --</option>`;
    return;
  }

  filteredOrders.forEach(order => {
    const option = document.createElement('option');
    option.value = order.work_order_id;
    option.textContent = order.work_order_id;
    woSelect.appendChild(option);
  });

  woSelect.disabled = false;
};


let workOrdersLoadInProgress = false;

async function loadWorkOrders() {
  if (workOrdersLoadInProgress) {
    console.log('⏳ Work orders load already in progress, skipping...');
    return;
  }
  
  try {
    workOrdersLoadInProgress = true;
    console.log('🔄 Загружаем список рабочих ордеров...');
    const response = await fetch('/api/work_orders_plan');
    const orders = await response.json();
    
    window.allWorkOrders = orders || [];
    console.log(`📋 Загружено ордеров: ${window.allWorkOrders.length}`);
    // If a product is already selected on login page, re-run filtering after WO list is loaded
	const productSelect = document.getElementById('product-select');
	if (productSelect && productSelect.value && typeof window.filterOperationsByProduct === 'function') {
	  window.filterOperationsByProduct();
	}
    
  } catch (err) {
    console.error('❌ Ошибка загрузки рабочих ордеров:', err);
    window.allWorkOrders = [];
  } finally {
    workOrdersLoadInProgress = false;
  }
}
// 🔥 ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ ЯЗЫКА ПРИ ЗАГРУЗКЕ ЛЮБОЙ СТРАНИЦЫ
window.addEventListener('load', function() {
    console.log('🚀 Page fully loaded, ensuring language consistency');
    const storedLang = localStorage.getItem('currentLang') || 'ru';
    if (storedLang !== currentLang) {
        console.log('🔄 Language mismatch detected, updating...');
        currentLang = storedLang;
        setLanguage(currentLang);
    }
});


document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 app.js загружен');

    const isLoginPage = document.getElementById('login-page');
    const isMainPage = document.getElementById('operator-summary-table');

    if (!isLoginPage && !isMainPage) {
        return;
    }

    // login.html или index.html — разрешено выполнять initDropdowns
    initDropdowns();

    if (isMainPage) {

		const state = getGlobalState();
		isAuthorized = !!(state.operatorId && state.operation_id && state.wo);

		currentOperator = state.operatorId ?? '';
		currentOperation = state.operation_id ?? '';
		currentWO = state.wo ?? '';
		isWorking = state.isWorking ?? null;

		if (isAuthorized && currentOperator) {
			fetchOperatorSummary(currentOperator).then(() => {
				updateUI(); // 🔥 UI уже рисует правдивую сводку
			});
			startAutoRefresh();
		}

		// 🔘 Включаем кнопку Визуальный контроль на главной странице
        const vcBtn = document.getElementById('vc-btn');
        if (vcBtn) {
			// логика показа — только через updateVisualControlButton()
			vcBtn.onclick = function (e) {
				e.preventDefault();
				window.location.href = 'visual_check.html';
			};
		}

		updateUI();
		// 🔥 Гарантируем повторное обновление интерфейса после полной загрузки
		setTimeout(() => {
			updateUI();
		}, 50);

	}

    setLanguage(currentLang);
});


// 🔥 ИСПРАВЛЕННЫЙ КОД В app.js (обработчик кнопки VC):
document.getElementById("vc-btn")?.addEventListener("click", () => {
    console.log("🔄 Переход на страницу визуального контроля...");
    window.location.href = "visual_check.html";
});

document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirm-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmSelection);
    }
});
