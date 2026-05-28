// ===============================
//   Visual Check – simplified module
// ===============================

// 🔹 Критерии визуального контроля по операциям (только для отображения)
const VC_CRITERIA = {
    "707": [
        "vc_707_1",
        "vc_707_2",
        "vc_707_3",
        "vc_707_4",
        "vc_707_5",
        "vc_707_6",
        "vc_707_7"
    ],

    "708": [
        "vc_708_1",
        "vc_708_2",
        "vc_708_3"
    ],

    "709": [
        "vc_709_1",
        "vc_709_2",
        "vc_709_3",
        "vc_709_4",
        "vc_709_5"
    ]
};


// ===============================
//  INIT PAGE
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    console.log("📄 visual_check.js loaded (simplified)");
    
    // Заполняем поля данными
    fillAutoFields();
    
    // Отображаем таблицу критериев (только для информации)
    renderCriteriaTable();
    
    // Инициализируем кнопки
    initAcceptButton();
   
    
    console.log("✅ Страница визуального контроля инициализирована");
});

// ===============================
//  AUTO-FIELDS
// ===============================
function fillAutoFields() {
    const state = getGlobalState();

    const product = state.product || "НЕТ";
    const serial = localStorage.getItem("currentSerial") || "НЕТ";
    const operator = state.operatorName || state.operator || "НЕТ";
    const operation = state.operation_name || state.operation_id || "НЕТ";

    document.getElementById("vc-operator").textContent = operator;
    document.getElementById("vc-wo").textContent = state.wo || "НЕТ";
    document.getElementById("vc-product").textContent = product;
    document.getElementById("vc-serial").textContent = serial;
    document.getElementById("vc-operation").textContent = operation;
}



// ===============================
//  RENDER CRITERIA TABLE (informational only)
// ===============================
function renderCriteriaTable() {
    const state = getGlobalState();
    const op = state.operation_id || null

    console.log("🔍 Отображение критериев для операции:", op);

    const table = document.getElementById("vc-table");
    table.innerHTML = "";

    if (!op || !VC_CRITERIA[op]) {
        table.innerHTML = `
            <tr>
                <td style="color: #666; text-align: center; padding: 20px; font-style: italic;">
                    Критерии не определены для текущей операции
                </td>
            </tr>
        `;
        return;
    }

   

    // Отображаем критерии как простой список
    VC_CRITERIA[op].forEach((crit, i) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: flex-start;">
                    <span style="margin-right: 10px; color: #28a745; font-weight: bold;">${i + 1}.</span>
                    <span>${getTranslation(crit)}</span>
                </div>
            </td>
        `;
        table.appendChild(row);
    });
    
    console.log(`✅ Отображено ${VC_CRITERIA[op].length} критериев для операции ${op}`);
}

// ===============================
//  ACCEPT VISUAL CHECK
// ===============================
function initAcceptButton() {
    const acceptBtn = document.getElementById("accept-btn");
    
    if (!acceptBtn) {
        console.error("❌ Кнопка 'Акцептировать' не найдена");
        return;
    }
    
    acceptBtn.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        console.log("🔄 Кнопка 'Визуальный контроль акцептирован' нажата");
        
        // Показываем модальное окно подтверждения
        showConfirmationModal();
    });
}

// ===============================
//  CONFIRMATION MODAL
// ===============================
function showConfirmationModal() {
    const state = getGlobalState();
    const serial = localStorage.getItem("currentSerial") || getTranslation('not_defined') || "не указан";

    const modalHTML = `
        <div id="vc-confirm-modal" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        ">
            <div style="
                background: white;
                padding: 30px;
                border-radius: 10px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            ">
                <h2 style="margin-top: 0; color: #333;">${getTranslation('vc_confirm_title')}</h2>

                <p style="font-size: 1.1em; line-height: 1.5; margin-bottom: 25px;">
                    ${getTranslation('vc_confirm_question')}
                </p>

                <p style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 25px;">
                    📦 ${getTranslation('vc_confirm_sn')}: <strong>${serial}</strong><br>
                    👤 ${getTranslation('vc_confirm_operator')}: <strong>${state.operatorName || state.operator || 'НЕТ'}</strong><br>
                    📋 ${getTranslation('vc_confirm_wo')}: <strong>${state.wo || 'НЕТ'}</strong>
                </p>

                <div style="display: flex; gap: 15px;">
                    <button id="vc-confirm-yes" style="
                        flex: 1;
                        background: #28a745;
                        color: white;
                        padding: 12px;
                        border: none;
                        border-radius: 6px;
                        font-size: 1.1em;
                        font-weight: bold;
                        cursor: pointer;
                    ">
                        ${getTranslation('vc_confirm_yes')}
                    </button>

                    <button id="vc-confirm-no" style="
                        flex: 1;
                        background: #6c757d;
                        color: white;
                        padding: 12px;
                        border: none;
                        border-radius: 6px;
                        font-size: 1.1em;
                        cursor: pointer;
                    ">
                        ${getTranslation('vc_confirm_no')}
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('vc-confirm-yes').addEventListener('click', function() {
        document.getElementById('vc-confirm-modal').remove();
        saveVisualCheck();
    });

    document.getElementById('vc-confirm-no').addEventListener('click', function() {
        document.getElementById('vc-confirm-modal').remove();
    });

    document.getElementById('vc-confirm-modal').addEventListener('click', function(e) {
        if (e.target.id === 'vc-confirm-modal') {
            document.getElementById('vc-confirm-modal').remove();
        }
    });
}

// ===============================
//  SAVE VISUAL CHECK TO DATABASE
// ===============================
async function saveVisualCheck() {
    console.log("💾 Сохранение визуального контроля в БД...");
    
    const state = getGlobalState();
    const operationId = state.operation_id || window.currentOperationId;
    
    if (!operationId || !state.wo || !state.operatorId) {
        showToast("❌ Недостаточно данных для сохранения", "error");
        return;
    }
    
    // 🔥 ОЧЕНЬ ПРОСТАЯ СТРУКТУРА - ТОЛЬКО ОСНОВНЫЕ ДАННЫЕ
    const requestBody = {
        operator_id: state.operatorId,
        work_order_id: state.wo,
        operation_id: operationId,
        product_id: state.product || '',
        serial_number: localStorage.getItem("currentSerial") || '',
        // 🔥 ВАЖНО: results теперь пустой массив или можно вообще не отправлять
        results: [],
        timestamp: new Date().toISOString(),
        status: 'accepted' // Добавляем статус для ясности
    };
    
    console.log("📤 Отправляемые данные:", requestBody);
    
    try {
        // Показываем индикатор загрузки
        showToast("📡 Сохранение данных...", "info");
        
        const response = await fetch("/api/log_visual_check", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log("📥 Статус ответа:", response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log("📦 Ответ сервера:", result);
        
        if (result.success) {
            showToast("✅ Визуальный контроль успешно зарегистрирован", "success");
            window.location.href = "index.html";                                                 
            
        } else {
            showToast(`❌ Ошибка: ${result.error || "Неизвестная ошибка"}`, "error");
        }
        
    } catch (error) {
        console.error("❌ Ошибка при сохранении:", error);
        showToast("❌ Ошибка соединения с сервером", "error");
    }
}



