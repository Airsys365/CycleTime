// === state_manager.js ===
// Работа с GlobalState в localStorage

window.getGlobalState = function() {
    try {
        const state = JSON.parse(localStorage.getItem('GlobalState') || '{}');
        
        // 🔥 ОТЛАДКА: Добавьте логирование
        console.log("🔍 getGlobalState() вызвана, возвращает:", {
            operation_id: state.operation_id,
            operation_name: state.operation_name,
            product: state.product,
            wo: state.wo
        });
        
        return state;
    } catch (err) {
        console.error("❌ Ошибка в getGlobalState:", err);
        return {};
    }
};

window.updateGlobalState = function () {
    const operatorSelect = document.getElementById("operator-select");
    const operationSelect = document.getElementById("operation-select");

    const currentState = window.getGlobalState();

    // --- оператор ---
    let operatorName = currentState.operatorName || currentState.operator || "";
    if (operatorSelect && operatorSelect.value) {
        operatorName = operatorSelect.options[operatorSelect.selectedIndex]?.text || "";
    }

    // --- операция ---
    let operationName = currentState.operation_name || "";
    let operationId = currentState.operation_id || "";
    if (operationSelect && operationSelect.value) {
        operationId = operationSelect.value;
        operationName = operationSelect.options[operationSelect.selectedIndex]?.text || "";
    }

    // ⚠️ НИЧЕГО НЕ СБРАСЫВАЕМ, ТОЛЬКО ОБНОВЛЯЕМ ПОЛЯ ДЛЯ ОТОБРАЖЕНИЯ
    const newState = {
        ...currentState,
        operatorName: operatorName,
        operator: operatorName,
        operation_id: operationId,
        operation_name: operationName
        // product, wo, operatorId, isAuthorized, isWorking и т.д. остаются как были
    };

    console.log("💾 Сохраняем GlobalState:", newState);
    localStorage.setItem("GlobalState", JSON.stringify(newState));
};


window.clearGlobalState = function () {
    console.log("🗑 Очищаем GlobalState");
    localStorage.removeItem("GlobalState");
};
