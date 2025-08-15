const skipButton = document.getElementById('skipButton');
const timerView = document.getElementById('timerView');
const completionView = document.getElementById('completionView');
const modeLabel = document.getElementById('mode');
const timerDisplay = document.getElementById('timer');
const mainButton = document.getElementById('mainButton');
const endDayButton = document.getElementById('endDayButton');
const startAnotherButton = document.getElementById('startAnotherButton');
const spChartProgress = document.getElementById('sp-chart-progress');
const spChartText = document.getElementById('sp-chart-text');

// --- Глобальные переменные ---
let uiUpdateInterval = null;
const WORK_MINUTES = 45; // Константа для отображения начального времени

// --- Основная функция обновления интерфейса ---
async function updateUI() {
    const data = await chrome.storage.local.get([
        'timerState', 'spCount', 'dailyGoal', 'alarmTime', 'remainingTime', 'lastResetDate'
    ]);
    const today = new Date().toLocaleDateString();
    if (data.lastResetDate !== today) {
        chrome.runtime.sendMessage({ command: 'end_day' }, () => setTimeout(updateUI, 100));
        return;
    }
    const { timerState = 'initial', spCount = 0, dailyGoal = 5, alarmTime, remainingTime } = data;

    // Кнопка "Пропустить" видна только во время работы или перерыва
    if (skipButton) {
        if (timerState === 'work' || timerState === 'break') {
            skipButton.classList.remove('hidden');
        } else {
            skipButton.classList.add('hidden');
        }
    }

    // Обновление кругового графика
    if (spChartProgress && spChartText) {
        const progressPercentage = (spCount / dailyGoal) * 100;
        spChartProgress.style.strokeDasharray = `${progressPercentage}, 100`;
        spChartText.textContent = `${spCount}/${dailyGoal}`;
        spChartProgress.style.stroke = (spCount >= dailyGoal) ? '#34c759' : '#007aff';
    }

    // Показать экран поздравления, если нужно
    if (timerView && completionView) {
        if (timerState === 'initial' && spCount >= dailyGoal) {
            timerView.classList.add('hidden');
            completionView.classList.remove('hidden');
            return;
        }
        timerView.classList.remove('hidden');
        completionView.classList.add('hidden');
    }

    if (uiUpdateInterval) clearInterval(uiUpdateInterval);

    let displayTime, label, buttonText;
    switch (timerState) {
        case 'work':
            label = 'Работа';
            buttonText = 'Пауза';
            startLiveTimer(alarmTime);
            break;
        case 'break':
            label = 'Перерыв';
            buttonText = 'Пауза';
            startLiveTimer(alarmTime);
            break;
        case 'paused':
            label = 'На паузе';
            buttonText = 'Продолжить';
            displayTime = formatTime(Math.round((remainingTime || 0) / 1000));
            break;
        case 'initial':
        default:
            label = 'Готовы к работе?';
            buttonText = 'Начать работу';
            displayTime = formatTime(WORK_MINUTES * 60);
            break;
    }
    if (modeLabel) modeLabel.textContent = label;
    if (mainButton) mainButton.textContent = buttonText;
    if (displayTime && timerDisplay) timerDisplay.textContent = displayTime;
}


// --- Функции-помощники ---
function startLiveTimer(endTime) {
    if (!endTime || !timerDisplay) return;
    uiUpdateInterval = setInterval(() => {
        const remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        timerDisplay.textContent = formatTime(remainingSeconds);
        if (remainingSeconds === 0) {
            clearInterval(uiUpdateInterval);
            setTimeout(updateUI, 500);
        }
    }, 1000);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Обработчики событий ---
function setupEventListeners() {
    if (mainButton) {
        mainButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ command: 'main_action' }, () => setTimeout(updateUI, 100));
        });
    }
    if (skipButton) {
        skipButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ command: 'skip_cycle' }, () => setTimeout(updateUI, 100));
        });
    }
    if (endDayButton) {
        endDayButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ command: 'end_day' }, () => setTimeout(updateUI, 100));
        });
    }
}

// --- Инициализация ---
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    updateUI();
    setInterval(updateUI, 1000);
});
