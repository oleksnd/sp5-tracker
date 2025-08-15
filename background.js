// --- Константы ---
const WORK_MINUTES = 45;
const BREAK_MINUTES = 15;
const BADGE_COLOR_WORK = '#007aff';
const BADGE_COLOR_PAUSED = '#8e8e93';
const ALARM_SP5 = 'sp5Timer';
const ALARM_BADGE = 'badgeUpdater';

// --- Инициализация при установке ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    timerState: 'initial',
    spCount: 0,
    dailyGoal: 5,
    lastResetDate: new Date().toLocaleDateString()
  });
  chrome.action.setBadgeText({ text: '' });
});

// --- Основной слушатель будильника (для таймера и для обновления иконки) ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_SP5) {
    const { timerState, spCount, dailyGoal } = await chrome.storage.local.get(['timerState', 'spCount', 'dailyGoal']);
    if (timerState === 'work') {
      const newSpCount = spCount + 1;
      await chrome.storage.local.set({ timerState: 'break', spCount: newSpCount });
      chrome.alarms.create(ALARM_SP5, { when: Date.now() + BREAK_MINUTES * 60 * 1000 });
      createNotification('work_end', `Время для перерыва!`, `Выполнено SP: ${newSpCount} из ${dailyGoal}`);
    } else if (timerState === 'break') {
      await chrome.storage.local.set({ timerState: 'initial' });
      createNotification('break_end', 'Перерыв окончен!', 'Готовы к следующему рабочему циклу?');
    }
  }
  if (alarm.name === ALARM_BADGE) {
    updateBadge();
  }
});

// --- Слушатель сообщений от popup.js ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.command) {
        case 'main_action':
          await handleMainAction();
          break;
        case 'end_day':
          await resetToInitialState();
          break;
        case 'check_date':
          await checkDateAndResetCounter();
          break;
        case 'skip_break':
          await skipBreak();
          break;
        case 'skip_cycle':
          await skipCycle();
          break;
        default:
          break;
      }
      sendResponse({ status: "ok" });
    } catch (error) {
      console.error("Ошибка в обработчике сообщений:", error);
      sendResponse({ status: "error", message: error.message });
    }
  })();
  return true;
});

// Пропуск текущего цикла (работа или перерыв)
async function skipCycle() {
  const { timerState, spCount, dailyGoal } = await chrome.storage.local.get(['timerState', 'spCount', 'dailyGoal']);
  if (timerState === 'work') {
    const newSpCount = spCount + 1;
    await chrome.storage.local.set({ timerState: 'break', spCount: newSpCount });
    chrome.alarms.create(ALARM_SP5, { when: Date.now() + BREAK_MINUTES * 60 * 1000 });
    createNotification('work_skipped', 'Рабочий цикл пропущен', `Выполнено SP: ${newSpCount} из ${dailyGoal}`);
  } else if (timerState === 'break') {
    await chrome.storage.local.set({ timerState: 'initial' });
    await chrome.alarms.clear(ALARM_SP5);
    createNotification('break_skipped', 'Перерыв пропущен', 'Вы можете начать следующий рабочий цикл.');
  }
  await updateBadge();
}
// --- Основные действия ---
async function handleMainAction() {
  const { timerState } = await chrome.storage.local.get(['timerState']);
  if (timerState === 'initial') {
    await chrome.storage.local.set({ timerState: 'work' });
    chrome.alarms.create(ALARM_SP5, { when: Date.now() + WORK_MINUTES * 60 * 1000 });
  } else if (timerState === 'work' || timerState === 'break') {
    const alarm = await chrome.alarms.get(ALARM_SP5);
    if (alarm) {
      const remainingTime = alarm.scheduledTime - Date.now();
      await chrome.storage.local.set({
        timerState: 'paused',
        remainingTime: remainingTime > 0 ? remainingTime : 0,
        previousState: timerState
      });
      await chrome.alarms.clear(ALARM_SP5);
    }
  } else if (timerState === 'paused') {
    const { remainingTime, previousState } = await chrome.storage.local.get(['remainingTime', 'previousState']);
    await chrome.storage.local.set({ timerState: previousState });
    chrome.alarms.create(ALARM_SP5, { when: Date.now() + remainingTime });
  }
  await updateBadge();
}

// Пропуск перерыва: сразу переводим в initial, не увеличивая spCount
async function skipBreak() {
  const { timerState } = await chrome.storage.local.get(['timerState']);
  if (timerState === 'break') {
    await chrome.storage.local.set({ timerState: 'initial' });
    await chrome.alarms.clear(ALARM_SP5);
    await updateBadge();
    createNotification('break_skipped', 'Перерыв пропущен', 'Вы можете начать следующий рабочий цикл.');
  }
}
async function resetToInitialState() {
  await chrome.alarms.clearAll();
  await chrome.storage.local.set({
    timerState: 'initial',
    spCount: 0
  });
  await updateBadge();
}

// --- Логика обновления иконки (Badge) ---
async function updateBadge() {
  const { timerState, remainingTime } = await chrome.storage.local.get(['timerState', 'remainingTime']);
  const alarm = await chrome.alarms.get(ALARM_SP5);
  if (timerState === 'work' || timerState === 'break') {
    if (alarm) {
      const minutesLeft = Math.ceil((alarm.scheduledTime - Date.now()) / 1000 / 60);
      chrome.action.setBadgeText({ text: `${minutesLeft}'` });
      chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_WORK });
      chrome.alarms.create(ALARM_BADGE, { delayInMinutes: 1 });
    }
  } else if (timerState === 'paused') {
    const minutesLeft = Math.ceil((remainingTime || 0) / 1000 / 60);
    chrome.action.setBadgeText({ text: `${minutesLeft}'` });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_PAUSED });
    chrome.alarms.clear(ALARM_BADGE);
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.alarms.clear(ALARM_BADGE);
  }
}

// --- Утилиты ---
function createNotification(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic', iconUrl: 'icons/icon128.png', title: title, message: message, priority: 2
  });
}

async function checkDateAndResetCounter() {
  const { lastResetDate } = await chrome.storage.local.get(['lastResetDate']);
  const today = new Date().toLocaleDateString();
  if (lastResetDate !== today) {
    await resetToInitialState();
    await chrome.storage.local.set({ lastResetDate: today });
  }
}

// При запуске браузера проверяем, нужно ли восстановить состояние иконки
chrome.runtime.onStartup.addListener(updateBadge);
