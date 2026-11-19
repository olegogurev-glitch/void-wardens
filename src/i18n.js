// Game language: English (the source text) or Russian.
//
// UI code passes its English strings through t(), which looks them up in the Russian table and
// falls back to the English text. Slots look like {n}: t('Wave {n}', { n: 3 }).
// Game data (towers, upgrades, malware, sectors, cards, research, medals, achievements…) is
// translated in place by id when this module loads, so code that shows a name needs no change.
// Nothing in the simulation keys off names, so this is safe — and in Node (the balance sim)
// the language is always English and nothing is touched.
//
// Pick order: ?lang=xx (the Pixo site starts games this way) → the choice made in the game →
// the Pixo site's own choice (same origin when embedded) → English.
import { DIFFICULTIES, ABILITIES, ENEMIES, RULES, MUTATORS, TOWERS, RESEARCH, MEDALS, ACHIEVEMENTS, CARDS } from './config.js';
import { MAPS } from './maps.js';

export const LANGS = ['en', 'ru'];
const KEY = 'voidwardens.lang';

function pick() {
  if (typeof location === 'undefined') return 'en';
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(KEY) || localStorage.getItem('pixo-lang');
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  return 'en';
}

export const lang = pick();
export const locale = lang === 'ru' ? 'ru-RU' : 'en-US';

// Switching reloads the page, so every label, cached canvas and data string starts fresh.
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url.toString());
}

export const fmt = (n) => Math.round(n).toLocaleString(locale);

export function t(text, vars) {
  let out = (lang === 'ru' && RU[text]) || text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return out;
}

// Russian plural form for a count: [one, few, many] (1 волна, 2 волны, 5 волн)
export function plural(n, forms) {
  const a = Math.abs(n), m10 = a % 10, m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

// A count with its noun: count(3, 'wave', 'waves') → "3 waves" / "3 волны"
const NOUNS = {
  wave: ['волна', 'волны', 'волн'],
  day: ['день', 'дня', 'дней'],
  breach: ['брешь', 'бреши', 'брешей'],
  pt: ['очко', 'очка', 'очков'],
  point: ['очко', 'очка', 'очков'],
  kill: ['убийство', 'убийства', 'убийств'],
  credit: ['кредит', 'кредита', 'кредитов'],
};
export function count(n, one, other) {
  if (lang === 'ru' && NOUNS[one]) return `${fmt(n)} ${plural(n, NOUNS[one])}`;
  return `${fmt(n)} ${n === 1 ? one : other}`;
}

// Malware noun for a count: "Glitch" / "Glitches" · "глитч" / "глитча" / "глитчей"
export function enemyNoun(d, n) {
  if (lang === 'ru' && d.forms) return plural(n, d.forms);
  return n > 1 ? d.plural : d.name;
}

// Static HTML: elements with data-t (their own English text is the key), data-t-title, data-t-label
export function translatePage(root = document) {
  document.documentElement.lang = lang;
  if (lang === 'en') return;
  root.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t || el.textContent.trim()); });
  root.querySelectorAll('[data-t-title]').forEach((el) => el.setAttribute('title', t(el.dataset.tTitle)));
  root.querySelectorAll('[data-t-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.tLabel)));
}

// ─────────────────────────────────────────────────────────────
//  Russian: interface strings (English key → Russian)
// ─────────────────────────────────────────────────────────────
const RU = {
  // ---- HUD (index.html)
  'Wave': 'Волна',
  'Credits': 'Кредиты',
  'Core': 'Ядро',
  'Score': 'Очки',
  'Game speed (F)': 'Скорость игры (F)',
  'Pause (P)': 'Пауза (P)',
  'Music (N)': 'Музыка (N)',
  'Sound (M)': 'Звук (M)',
  'Pause': 'Пауза',
  'Toggle music': 'Музыка вкл/выкл',
  'Toggle sound': 'Звук вкл/выкл',
  'Rotate to landscape': 'Поверни устройство',
  'The grid needs the full width — turn your device sideways.': 'Сетке нужна вся ширина — держи устройство горизонтально.',

  // ---- boot console (intro.js)
  'Breach alert': 'Тревога: брешь',
  'GRID MONITOR': 'МОНИТОР СЕТКИ',
  '♪ TAP FOR SOUND': '♪ КОСНИСЬ ДЛЯ ЗВУКА',
  'THREAT': 'УГРОЗА',
  '> DEPLOY THE PROTECTION?': '> РАЗВЕРНУТЬ ЗАЩИТУ?',
  'YES': 'ДА',
  'Enter ↵ · goes fullscreen, landscape': 'Enter ↵ · полный экран, альбомная ориентация',
  'boot core.sys': 'загрузка core.sys',
  'link data bus [01][02]': 'подключение шины данных [01][02]',
  'scan perimeter': 'сканирование периметра',
  'ANOMALY': 'АНОМАЛИЯ',
  '!! BREACH DETECTED · GRID EDGE · SECTOR 01': '!! ОБНАРУЖЕНА БРЕШЬ · КРАЙ СЕТКИ · СЕКТОР 01',
  '!! hostile code signatures': '!! сигнатуры враждебного кода',
  '{n} AND RISING': '{n} И РАСТЁТ',
  'trace intrusion target': 'цель вторжения',
  'THE CORE': 'ЯДРО',
  'core integrity forecast': 'прогноз целостности ядра',
  '0% IN 04:00': '0% ЧЕРЕЗ 04:00',
  'warden protocol': 'протокол стража',
  'STANDING BY': 'НАГОТОВЕ',
  'DEPLOYED': 'РАЗВЁРНУТ',

  // ---- board (render.js, game.js)
  'TAP AGAIN TO DEPLOY': 'КОСНИСЬ ЕЩЁ РАЗ, ЧТОБЫ ПОСТАВИТЬ',
  'PLACE ON THE BUS': 'СТАВЬ НА ШИНУ',
  'BREACH': 'БРЕШЬ',
  'CORE {n}%': 'ЯДРО {n}%',
  '+{n} interest': '+{n} процентов',
  'EXECUTE': 'ДОБИТ',

  // ---- stats and tags (ui.js)
  'FIELD': 'ПОЛЕ',
  'RATE': 'ТЕМП',
  'DMG': 'УРОН',
  'MINES': 'МИНЫ',
  'RANGE': 'ДАЛЬН.',
  '{n}/s': '{n}/с',
  '{n}s': '{n} с',
  'Piercing beam': 'Сквозной луч',
  'Instant hit': 'Мгновенное попадание',
  'Ricochet ×{n}': 'Рикошет ×{n}',
  'Executes <{n}% HP': 'Добивает <{n}% HP',
  'Marks +{n}% dmg': 'Метка +{n}% урона',
  'Pops shields': 'Снимает щиты',
  'Buffs towers in field': 'Усиливает башни в поле',
  '+{n}% range to field': '+{n}% дальности в поле',
  'Field ignores armor': 'Поле игнорирует броню',
  'Exposes cloaked': 'Раскрывает невидимых',
  '+{n} credits / 4s': '+{n} кредитов / 4 с',
  'Blast {n}': 'Взрыв {n}',
  'Stun {n}s': 'Оглушение {n} с',
  'Tar {n}% slow': 'Смола: замедление {n}%',
  'Chain reaction': 'Цепная реакция',
  'Burn {n}/s': 'Горение {n}/с',
  'Chains ×{n}': 'Цепь ×{n}',
  'Hits all in range': 'Бьёт всех в радиусе',
  'Rollback pulse': 'Импульс отката',
  'OVERCLOCK': 'РАЗГОН',
  'SPD +{n}%': 'СКОР +{n}%',
  'Malware adapts: +{s}% speed, {c}% crowd-control resistance': 'Вредоносы адаптируются: +{s}% скорости, {c}% сопротивления контролю',
  'Area pulse': 'Импульс по площади',
  'Splash {n}': 'По площади {n}',
  'Slow {n}%': 'Замедление {n}%',
  'Freeze {n}%': 'Заморозка {n}%',
  'Stun {n}%': 'Оглушение {n}%',
  '+{n}% dmg taken': '+{n}% получаемого урона',
  'Pulls back': 'Отбрасывает назад',
  'Cluster ×{n}': 'Кассета ×{n}',
  'Ignores armor': 'Игнорирует броню',
  'Spin-up +{n}% rate': 'Раскрутка +{n}% скорости',
  'Echo strike {n}%': 'Повторный удар {n}%',
  'Hail ×{n}': 'Град ×{n}',

  // ---- targeting
  'first': 'первый',
  'last': 'новый',
  'strong': 'сильный',
  'close': 'ближний',
  'Furthest along the path': 'Дальше всех по маршруту',
  'Newest arrival': 'Появился последним',
  'Most HP remaining': 'Больше всего HP',
  'Nearest to the tower': 'Ближе всех к башне',

  // ---- waves
  'NEW: {label} ({trait})': 'НОВОЕ: {label} ({trait})',
  '{list} inbound': '{list} на подходе',
  '{n} Leviathans detected': 'Обнаружено Левиафанов: {n}',
  'Leviathan.exe detected': 'Обнаружен Leviathan.exe',
  'Final wave': 'Последняя волна',
  'Into the void': 'В пустоту',
  'Wave {n}': 'Волна {n}',
  'wave {n}': 'волна {n}',
  'Past the last known wave · it only gets worse': 'Дальше известных волн · будет только хуже',
  'Wave purged': 'Волна зачищена',
  '+{n}': '+{n}',
  'Leviathan.exe terminated': 'Leviathan.exe уничтожен',
  'Run wave {n}': 'Запустить волну {n}',
  'Wave {n} in {s} · Run now': 'Волна {n} через {s} · Запустить',
  'Wave {w} · {n} threats': 'Волна {w} · угроз: {n}',
  'Space': 'Пробел',
  'Next': 'Далее',

  // ---- dock and abilities
  'Ready': 'Готово',
  'Click the bus': 'Укажи место на шине',
  'Cooldown {n}s · key {k}': 'Перезарядка {n} с · клавиша {k}',
  'Locked · clear {sector} · {title} to unlock': 'Закрыто · пройди {sector} · {title}, чтобы открыть',
  '2 evolution paths · 4 final forms': '2 пути развития · 4 финальные формы',

  // ---- upgrade cards
  '⟳ Reroll · {n} left': '⟳ Перебросить · осталось {n}',
  'Data cache recovered': 'Найден кэш данных',
  'Choose one upgrade': 'Выбери одно улучшение',
  'for the rest of this run · {keys}': 'до конца забега · {keys}',
  'common': 'обычная',
  'rare': 'редкая',
  'epic': 'эпическая',
  'Achievement unlocked': 'Достижение открыто',

  // ---- tower panel
  'Lv {n}': 'Ур. {n}',
  'Evolve to level {n}': 'Эволюция до уровня {n}',
  'choose one path': 'выбери один путь',
  'Fully evolved': 'Полностью развита',
  'Close': 'Закрыть',
  'Target': 'Цель',
  'Damage dealt': 'Урон',
  'Kills': 'Убийства',
  'Confirm sell': 'Точно продать?',
  'Sell': 'Продать',

  // ---- banners
  '⚠ Hostile process escalated': '⚠ Враждебный процесс повысил привилегии',
  'Class-Ω threat · breach integrity failing': 'Угроза класса Ω · брешь расширяется',
  'Failsafe engaged': 'Аварийная защита',
  'Core held at 1 · all malware stunned': 'Ядро удержано на 1 · весь вредоносный код оглушён',
  'Graphics · {mode}': 'Графика · {mode}',
  'adapts to your device': 'подстраивается под устройство',
  'Daily · {title}': 'Испытание дня · {title}',
  'Twist: {name} — {desc}': 'Модификатор: {name} — {desc}',
  'Endless · {name}': 'Бесконечный · {name}',
  'Rule: {name} — {desc}': 'Правило: {name} — {desc}',
  'The waves never stop · how far can you hold?': 'Волны не кончаются · сколько продержишься?',
  'Deploy towers, then run wave 1': 'Поставь башни и запусти волну 1',

  // ---- start screen
  'Campaign': 'Кампания',
  'Ten sectors': 'Десять секторов',
  'Endless': 'Бесконечный',
  'No last wave': 'Без последней волны',
  'Daily': 'Испытание дня',
  'Same for everyone': 'Одно на всех',
  '{n}/{m} sectors secured': 'Защищено секторов: {n}/{m}',
  '{n} Data · Research': '{n} данных · Исследования',
  'Daily challenge': 'Испытание дня',
  "Today's twist · {name}": 'Модификатор дня · {name}',
  'Rule · {name}': 'Правило · {name}',
  'every tower open · research off · same cards for everyone': 'все башни открыты · без исследований · одни карты на всех',
  'Score: kills, cleared waves, early calls, and a bonus for every Core integrity left on a win.': 'Очки: убийства, пройденные волны, ранние вызовы и бонус за каждую единицу целостности Ядра при победе.',
  'Best today': 'Лучший сегодня',
  'Runs today': 'Забегов сегодня',
  'Streak': 'Серия',
  'New challenge in {h}h {m}m': 'Новое испытание через {h} ч {m} мин',
  'Run it again ▸': 'Ещё раз ▸',
  'Run today ▸': 'Начать ▸',
  'cleared': 'пройден',
  'w{n}': 'в{n}',
  'Locked': 'Закрыто',
  '(locked)': '(закрыто)',
  'Best on {d}: {w} · {s}': 'Рекорд («{d}»): {w} · {s}',
  'No Endless run on {d}': 'Нет забегов на уровне «{d}»',
  'No record on {d}': 'Нет рекорда на уровне «{d}»',
  'Secured on {d}': 'Защищён на уровне «{d}»',
  'Best on {d}: wave {n}/{m}': 'Рекорд («{d}»): волна {n}/{m}',
  'Clear {name} · {title} in the campaign to open its Endless run': 'Пройди {name} · {title} в кампании, чтобы открыть бесконечный режим',
  'this sector': 'этот сектор',
  'Clear {name} · {title} to unlock': 'Пройди {name} · {title}, чтобы открыть',
  '{b} · its {w}, then it never stops · a Leviathan every 5th wave beyond': '{b} · сначала {w}, потом без конца · дальше Левиафан каждую 5-ю волну',
  'boss': 'босс',
  'Hold the line as long as you can. Waves keep coming, denser and tougher, until the Core falls. Score: kills, waves and early calls.': 'Держись сколько сможешь. Волны идут без конца, всё плотнее и крепче, пока Ядро не падёт. Очки: убийства, волны и ранние вызовы.',
  'Normal or harder · +15 Data each': 'На «Обычном» и выше · +15 данных за каждую',
  'Clear to unlock · {name}': 'Пройди, чтобы открыть · {name}',
  'Enter the void ▸': 'В пустоту ▸',
  'Jack in ▸': 'Подключиться ▸',
  'A breach has opened in the grid. Hostile code is pouring through. Keep it away from the Core.': 'В сетке открылась брешь, и сквозь неё хлещет враждебный код. Не подпусти его к Ядру.',
  'Pick a tower, click an empty tile to deploy': 'Выбери башню и кликни по пустой клетке',
  'Evolve': 'Развитие',
  'Every upgrade is a choice between two paths': 'Каждое улучшение — выбор из двух путей',
  'Run waves early for bonus credits': 'Запускай волны раньше — получишь бонусные кредиты',
  'Language': 'Язык',

  // ---- pause
  'Process suspended': 'Процесс приостановлен',
  'Paused': 'Пауза',
  'Resume': 'Продолжить',
  'Restart': 'Заново',
  'Sectors': 'Секторы',
  'Graphics': 'Графика',
  'auto': 'авто',
  'high': 'высокая',
  'medium': 'средняя',
  'low': 'низкая',
  'WebGL unavailable · bloom and post effects off': 'WebGL недоступен · свечение и постэффекты выключены',
  'Adapts to your device · now {tier}': 'Подстраивается под устройство · сейчас {tier}',
  'Full resolution · bloom, lighting, reflections, lens dirt': 'Полное разрешение · свечение, освещение, отражения, блики на линзе',
  'Lower resolution · bloom and lighting, no reflections': 'Пониженное разрешение · свечение и освещение, без отражений',
  'Base resolution · no bloom, lighting or reflections, light weather': 'Базовое разрешение · без свечения, освещения и отражений, лёгкая погода',
  'Comfort': 'Комфорт',
  'Screen shake': 'Тряска экрана',
  'Flashes': 'Вспышки',
  'Calm': 'Спокойно',
  'Full': 'Полностью',

  // ---- results
  '▸ New sector unlocked': '▸ Открыт новый сектор',
  '▸ Up next': '▸ Далее',
  '▸ Campaign complete': '▸ Кампания пройдена',
  'the grid is secure': 'сетка в безопасности',
  'Breach sealed': 'Брешь закрыта',
  'Kernel secured': 'Ядро ОС защищено',
  'System secure': 'Система защищена',
  'Towers': 'Башни',
  'Medals need Normal or harder': 'Медали — только на «Обычном» и выше',
  '+{n} Data': '+{n} данных',
  '({n} from medals)': '({n} за медали)',
  '· {n} total': '· всего {n}',
  '▸ New tower unlocked': '▸ Открыта новая башня',
  '▸ Endless opened': '▸ Открыт бесконечный режим',
  'Next sector ▸': 'Следующий сектор ▸',
  'Play again': 'Сыграть ещё',
  'Share screenshot': 'Поделиться скриншотом',
  'Warden service record': 'Послужной список стража',
  'Achievements': 'Достижения',
  '{done}/ {total} unlocked': '{done}/ {total} открыто',
  '◂ Back to campaign': '◂ Назад к кампании',
  'Warden research lab': 'Лаборатория стражей',
  'Research': 'Исследования',
  '✓ Installed': '✓ Установлено',
  'Requires {name}': 'Нужно: {name}',
  'Data': 'данных',
  '· earned every run — more for waves cleared, wins, stars and harder difficulties': '· начисляются за каждый забег — больше за волны, победы, звёзды и высокую сложность',
  'Signal lost': 'Сигнал потерян',
  'Fell on': 'Пал на',
  'New best': 'Новый рекорд',
  'Best: wave {n}': 'Рекорд: волна {n}',
  'First run': 'Первый забег',
  'Past the campaign': 'Сверх кампании',
  'Go again': 'Ещё раз',
  'Daily secured': 'Испытание пройдено',
  'Daily breached': 'Испытание провалено',
  'New best today': 'Лучший результат дня',
  'Best today: {n}': 'Лучший сегодня: {n}',
  'Reached': 'Дошёл до',
  'Twist': 'Модификатор',
  'Run it again': 'Ещё раз',
  'Share score': 'Поделиться результатом',
  'Core compromised': 'Ядро скомпрометировано',
  'System breached': 'Система взломана',
  'Reboot': 'Перезагрузка',

  // ---- share card and share text (main.js)
  'Daily · {key} · {title}': 'Испытание дня · {key} · {title}',
  'Endless · {name} · {title}': 'Бесконечный · {name} · {title}',
  'core {l}/{m}': 'ядро {l}/{m}',
  'fell on wave {n}': 'пал на волне {n}',
  'WAVE {n}': 'ВОЛНА {n}',
  'Void Wardens daily {key}: {s}': 'Void Wardens, испытание дня {key}: {s}',
  'Void Wardens endless: wave {n} on {title}': 'Void Wardens, бесконечный режим: волна {n}, сектор «{title}»',
  '{name} cleared on {diff} — {stars}': '{name} пройден на уровне «{diff}» — {stars}',

  // ---- training (tutorial.js, ui.js, main.js)
  'Learn the basics': 'Основы игры',
  'Start here': 'Начни отсюда',
  'Completed': 'Пройдено',
  '✓ Completed': '✓ Пройдено',
  'Grid basics': 'Основы сетки',
  'New to Void Wardens? A coach walks you through every mechanic on a small practice map — one step at a time, at your own pace.':
    'Впервые в Void Wardens? Подсказки проведут тебя через все механики на маленькой тренировочной карте — по шагу за раз, в твоём темпе.',
  'Build and deploy': 'Постройка',
  'Waves and credits': 'Волны и кредиты',
  'Slowing': 'Замедление',
  'Evolution paths': 'Пути эволюции',
  'Firewall and Purge': 'Файрвол и чистка',
  'Data caches': 'Тайники данных',
  'About 5 minutes · can\'t be lost · doesn\'t touch your progress': 'Около 5 минут · проиграть нельзя · прогресс не затрагивается',
  'Start training ▸': 'Начать обучение ▸',
  'Train again ▸': 'Пройти ещё раз ▸',
  'Training': 'Обучение',
  'Follow the coach · every mechanic, step by step': 'Следуй подсказкам · все механики шаг за шагом',
  'Training · {n}/{m}': 'Обучение · {n}/{m}',
  '· time frozen': '· время остановлено',
  'Exit': 'Выйти',
  'Next ▸': 'Далее ▸',
  '▸ Your move': '▸ Твой ход',
  '+{n} training grant': '+{n} на обучение',
  'Welcome, Warden': 'Добро пожаловать, страж',
  'Hostile code breaks in at the <b>breach</b> and runs along the <b>data bus</b> toward the Core. This training shows you every mechanic, one step at a time.':
    'Вредоносный код врывается через <b>брешь</b> и бежит по <b>шине данных</b> к Ядру. Это обучение покажет все механики игры — по одной за раз.',
  'The Core': 'Ядро',
  'Malware that reaches the Core costs integrity. At zero the run is lost. (Training can\'t be lost — so experiment.)':
    'Каждый вредонос, добравшийся до Ядра, отнимает целостность. На нуле забег проигран. (Обучение проиграть нельзя — так что экспериментируй.)',
  'Credits buy towers and upgrades. You earn them for every kill and every wave you clear.':
    'Кредиты тратятся на башни и улучшения. Ты получаешь их за каждое уничтожение и каждую отбитую волну.',
  'Build a tower': 'Построй башню',
  'Pick the <b>Photon Blaster</b> in the dock (key <kbd>1</kbd>). It fires fast bolts at one target.':
    'Выбери <b>Фотонный бластер</b> на панели внизу (клавиша <kbd>1</kbd>). Он быстро стреляет зарядами по одной цели.',
  'Tap the <b>Photon Blaster</b> in the dock — or drag it straight onto the map.':
    'Коснись <b>Фотонного бластера</b> на панели — или сразу перетащи его на карту.',
  'Deploy it': 'Размести её',
  'Click the marked tile. The circle shows the tower\'s range. Towers go on empty tiles, never on the bus.':
    'Нажми на отмеченную клетку. Круг показывает радиус башни. Башни ставятся на пустые клетки, но не на шину.',
  'Tap the marked tile twice — once to preview, once to deploy. The circle shows the tower\'s range.':
    'Коснись отмеченной клетки дважды: первый раз — предпросмотр, второй — установка. Круг показывает радиус башни.',
  'Run wave 1': 'Запусти волну 1',
  'Press <b>Run wave</b> (<kbd>Space</kbd>) when you\'re ready. The strip above it shows what\'s coming.':
    'Нажми <b>Запустить волну</b> (<kbd>Пробел</kbd>), когда будешь готов. Полоса над кнопкой показывает, кто идёт.',
  'Towers fire on their own': 'Башни стреляют сами',
  'Your Blaster aims and shoots by itself. Every kill drops credits into your balance.':
    'Бластер сам наводится и стреляет. Каждое уничтожение приносит кредиты.',
  'A cleared wave pays a bonus. Normally a short break then starts the next wave by itself — call it early for <b>+3 credits</b> per second skipped. In training the clock waits for you.':
    'За отбитую волну дают бонус. Обычно после короткой паузы следующая волна стартует сама — вызови её раньше и получи <b>+3 кредита</b> за каждую пропущенную секунду. В обучении таймер ждёт тебя.',
  'Slow them down': 'Замедли их',
  'Towers have different jobs. The <b>ICE Node</b> (key <kbd>2</kbd>) slows all malware in its pulse. Deploy one on the marked tile, under the Blaster.':
    'У башен разные задачи. <b>ICE-узел</b> (клавиша <kbd>2</kbd>) замедляет всех вредоносов в своём импульсе. Поставь его на отмеченную клетку, под бластером.',
  'Armor': 'Броня',
  'Here come the <b>Trojans</b>. Armor 3 takes 3 damage off every hit, and each one that leaks costs 2 integrity. Run wave 2.':
    'Вот и <b>трояны</b>. Броня 3 снимает 3 урона с каждого попадания, а каждый прорвавшийся троян отнимает 2 целостности. Запусти волну 2.',
  'Slow + damage': 'Замедление + урон',
  'Slowed by the ICE Node, the Trojans stay in the Blaster\'s range far longer.':
    'Замедленные ICE-узлом, трояны гораздо дольше остаются в радиусе бластера.',
  'Armored <b>Trojans</b> come next. Get ready: click your <b>Photon Blaster</b> to open its panel.':
    'Следом идут бронированные <b>трояны</b>. Подготовься: нажми на свой <b>Фотонный бластер</b>, чтобы открыть его панель.',
  'Armored <b>Trojans</b> come next. Get ready: tap your <b>Photon Blaster</b> to open its panel.':
    'Следом идут бронированные <b>трояны</b>. Подготовься: коснись своего <b>Фотонного бластера</b>, чтобы открыть его панель.',
  'Choose a path': 'Выбери путь',
  'Every tower evolves twice, and each evolution is a choice between two paths — four final forms per tower. Pick one (<kbd>Q</kbd> / <kbd>E</kbd>).':
    'Каждая башня эволюционирует дважды, и каждый раз нужно выбрать один из двух путей — у каждой башни четыре финальные формы. Выбери путь (<kbd>Q</kbd> / <kbd>E</kbd>).',
  'Every tower evolves twice, and each evolution is a choice between two paths — four final forms per tower. Pick one.':
    'Каждая башня эволюционирует дважды, и каждый раз нужно выбрать один из двух путей — у каждой башни четыре финальные формы. Выбери путь.',
  'Targeting and selling': 'Цели и продажа',
  'The panel also sets what a tower aims at — <b>First</b>, <b>Last</b>, <b>Strong</b> or <b>Close</b> — and <b>sells</b> it for 70% of what you spent (press Sell twice).':
    'На панели также выбирается цель башни — <b>первый</b>, <b>новый</b>, <b>сильный</b> или <b>ближний</b> — и здесь же башню можно <b>продать</b> за 70% вложенного (нажми «Продать» дважды).',
  'A big swarm': 'Большой рой',
  'Wave 3 is a swarm. Spend your credits first — another tower, or the <b>Arc Relay</b> (key <kbd>3</kbd>), whose lightning jumps between targets. Then run it: you\'ll also get two emergency abilities.':
    'Волна 3 — это рой. Сначала потрать кредиты — ещё одна башня или <b>Дуговое реле</b> (клавиша <kbd>3</kbd>), чья молния перескакивает между целями. Потом запускай: у тебя будут ещё и две экстренные способности.',
  'Firewall': 'Файрвол',
  'Time is frozen. Press <b>Firewall</b> (<kbd>Z</kbd>), then click the bus ahead of the swarm. It blocks malware for 5s and burns whatever presses on it.':
    'Время остановлено. Нажми <b>Файрвол</b> (<kbd>Z</kbd>), затем щёлкни по шине перед роем. Он сдерживает вредоносов 5 с и сжигает тех, кто в него упирается.',
  'Time is frozen. Tap <b>Firewall</b>, then tap the bus ahead of the swarm. It blocks malware for 5s and burns whatever presses on it.':
    'Время остановлено. Коснись <b>Файрвола</b>, затем коснись шины перед роем. Он сдерживает вредоносов 5 с и сжигает тех, кто в него упирается.',
  'System Purge': 'Системная чистка',
  'Now press <b>System Purge</b> (<kbd>X</kbd>). It hits every malware on the board for 15% of its health and stuns it for a second.':
    'Теперь нажми <b>Чистку</b> (<kbd>X</kbd>). Она бьёт каждого вредоноса на поле на 15% его здоровья и оглушает на секунду.',
  'Now tap <b>System Purge</b>. It hits every malware on the board for 15% of its health and stuns it for a second.':
    'Теперь коснись <b>Чистки</b>. Она бьёт каждого вредоноса на поле на 15% его здоровья и оглушает на секунду.',
  'Cooldowns': 'Перезарядка',
  'Both abilities recharge over time; the button counts down until each is ready again. Use them when a wave gets away from you.':
    'Обе способности перезаряжаются со временем — кнопка показывает, сколько осталось. Используй их, когда волна выходит из-под контроля.',
  'Data cache': 'Тайник данных',
  'After every 3rd wave you recover a cache and keep one card for the rest of the run. Your picks collect in the top-left corner.':
    'После каждой третьей волны ты находишь тайник и оставляешь себе одну карту до конца забега. Выбранные карты собираются в левом верхнем углу.',
  'Speed and pause': 'Скорость и пауза',
  'Top right: game speed (<kbd>F</kbd>), pause (<kbd>P</kbd>), music and sound. The pause menu also holds graphics and comfort settings.':
    'Справа вверху: скорость игры (<kbd>F</kbd>), пауза (<kbd>P</kbd>), музыка и звук. В меню паузы — ещё настройки графики и комфорта.',
  'You\'re on your own now: build, evolve, then run the last wave. It brings <b>Worms</b> — they split into three when destroyed.':
    'Дальше сам: строй, улучшай и запускай последнюю волну. В ней будут <b>черви</b> — при уничтожении каждый делится на три.',
  'Training complete': 'Обучение пройдено',
  'Ready, Warden': 'Готов, страж',
  'You know the grid. Here is what waits outside it:': 'Сетку ты знаешь. Вот что ждёт дальше:',
  'Ten sectors, each with its own layout and a rule that changes how it plays. Clear one to open the next; the more Core you keep, the more stars (up to 3).':
    'Десять секторов, у каждого своя карта и правило, меняющее игру. Пройди сектор, чтобы открыть следующий; чем целее Ядро, тем больше звёзд (до 3).',
  'Medals': 'Медали',
  'Every sector has three optional challenges. Win on Normal or harder to earn them — each pays Data.':
    'В каждом секторе три необязательных испытания. Победи на уровне «Нормально» или выше, чтобы их получить — каждое приносит данные.',
  'Every run, won or lost, pays Data. Spend it in Research on permanent upgrades.':
    'Каждый забег, выигранный или нет, приносит данные. Трать их в Исследованиях на постоянные улучшения.',
  'Arsenal': 'Арсенал',
  'Clearing sectors 03, 06 and 08 adds the Spike Lance, Overclock Hub and Logic Mines.':
    'За прохождение секторов 03, 06 и 08 ты получишь Копьё-шип, Узел разгона и Логические мины.',
  'Endless · Daily': 'Бесконечный · Испытание дня',
  'Endless never stops — how far can you hold? The Daily is one challenge a day, the same for everyone.':
    'Бесконечный режим не кончается — как долго ты продержишься? Испытание дня — одно в сутки, одинаковое для всех.',
  'Start the campaign ▸': 'Начать кампанию ▸',
  'Train again': 'Пройти ещё раз',
};

// ─────────────────────────────────────────────────────────────
//  Russian: game data, by id
// ─────────────────────────────────────────────────────────────
const RU_DATA = {
  difficulties: {
    easy: ['Лёгкий', 'Волны слабее, кредитов больше. Изучи башни.'],
    normal: ['Обычный', 'Задуманный уровень: волны вырастают до +15% врагов с +15% HP.'],
    hard: ['Сложный', 'До +45% врагов с +40% HP, 18 единиц целостности Ядра. Каждая башня должна оправдать своё место.'],
    nightmare: ['Кошмар', 'Волны разбухают до +80% врагов с +75% HP, 12 единиц целостности Ядра. Без способностей и карт не обойтись.'],
  },
  abilities: {
    firewall: ['Файрвол', 'Ставит барьер на шину данных. Сдерживает вредоносный код 5 с и сжигает тех, кто в него упирается.'],
    purge: ['Чистка', 'Системная чистка — удар по всей сети: 15% макс. HP всем вредоносам, оглушение на 1 с, раскрывает руткиты, снимает щиты.'],
  },
  // name, plural (list), [one, few, many] for counts, trait
  enemies: {
    scout: ['Глитч', 'Глитчи', ['глитч', 'глитча', 'глитчей'], 'быстрый'],
    brute: ['Троян', 'Трояны', ['троян', 'трояна', 'троянов'], 'броня 3'],
    boss: ['Leviathan.exe', 'Leviathan.exe', ['Leviathan.exe', 'Leviathan.exe', 'Leviathan.exe'], 'босс · броня 6'],
    worm: ['Червь', 'Черви', ['червь', 'червя', 'червей'], 'делится ×3'],
    frag: ['Фрагмент', 'Фрагменты', ['фрагмент', 'фрагмента', 'фрагментов'], 'быстрый'],
    cipher: ['Шифр', 'Шифры', ['шифр', 'шифра', 'шифров'], 'щит блокирует удар'],
    rootkit: ['Руткит', 'Руткиты', ['руткит', 'руткита', 'руткитов'], 'невидим · ICE раскрывает'],
    patcher: ['Патчер', 'Патчеры', ['патчер', 'патчера', 'патчеров'], 'лечит соседей'],
    furnace: ['Печь', 'Печи', ['печь', 'печи', 'печей'], 'не замерзает · размораживает союзников'],
    jammer: ['Глушилка', 'Глушилки', ['глушилка', 'глушилки', 'глушилок'], 'башни рядом стреляют на 40% медленнее'],
    bulwark: ['Оплот', 'Оплоты', ['оплот', 'оплота', 'оплотов'], 'союзники рядом получают на 40% меньше урона'],
    carrier: ['Носитель', 'Носители', ['носитель', 'носителя', 'носителей'], 'выпускает глитчей'],
    blinker: ['Мигун', 'Мигуны', ['мигун', 'мигуна', 'мигунов'], 'телепортируется вперёд'],
    watchdog: ['Сторож', 'Сторожа', ['сторож', 'сторожа', 'сторожей'], 'не замерзает, не оглушается и не откатывается'],
  },
  rules: {
    permafrost: ['Вечная мерзлота', 'Замедление и заморозка длятся вдвое дольше.'],
    rush: ['Биржевой ажиотаж', 'Убийства приносят +25% кредитов, но перерывы между волнами — всего 10 с.'],
    dark: ['Плохая видимость', 'Дальность башен −12%. Подбитый руткит остаётся раскрытым в 2,5 раза дольше.'],
    hardened: ['Закалка', 'У всего вредоносного кода +1 к броне. Бронебойные удары наносят +30%.'],
    readonly: ['Только чтение', 'Продажа возвращает 100% — перестраивай лабиринт свободно.'],
    lightning: ['Молнии', 'Разряды бьют и оглушают вредоносный код там, куда попадают.'],
    uplink: ['Восходящий канал', 'Файрвол и системная чистка перезаряжаются на 40% быстрее.'],
    panic: ['Паника ядра', 'Каждая утечка ускоряет весь вредоносный код на поле на 25% на 4 с.'],
  },
  mutators: {
    overclock: ['Разогнанный код', 'Вредоносный код движется на 20% быстрее, но убийства приносят +20% кредитов.'],
    swarm: ['Протокол роя', 'На 40% больше вредоносов, у каждого на 25% меньше HP.'],
    glass: ['Стеклянное Ядро', 'Целостность Ядра уменьшена вдвое; башни наносят +15% урона.'],
    venture: ['Венчурный капитал', '+250 стартовых кредитов, но убийства приносят на 25% меньше.'],
    surge: ['Всплеск данных', 'Кэш данных открывается после каждой 2-й волны.'],
    plated: ['Бронированный груз', 'У вредоносов +1 к броне; у башен +10% дальности.'],
    fuse: ['Короткий запал', 'Перерывы длятся 8 с, а ранний вызов волны приносит вдвое больше.'],
  },
  // [name, desc, [branch A [name, desc, [evolution A1, A2]], branch B …]]
  towers: {
    blaster: ['Фотонный бластер', 'Быстрые световые заряды. Дёшево и надёжно бьёт одну цель.', [
      ['Сверхзаряд', '+90% урона за заряд. Тяжёлые попадания пробивают броню.', [
        ['Рельсотрон', 'Гиперзвуковой луч прошивает всех врагов на линии. Большая дальность.'],
        ['Осколочные заряды', 'Заряды разлетаются осколками и задевают врагов рядом.'],
      ]],
      ['Двойные стволы', '+80% скорострельности: две пушки бьют поочерёдно.', [
        ['Гатлинг', 'Раскручивается: скорострельность растёт до +120%, пока башня ведёт огонь.'],
        ['Веерный залп', 'Захватывает 3 цели и стреляет по всем сразу.'],
      ]],
    ]],
    cryo: ['ICE-узел', 'Контрмера против вторжений. Ледяные импульсы ранят и замедляют всё вокруг.', [
      ['Глубокая заморозка', 'Сильнее холод: замедление 55% и более мощные импульсы.', [
        ['Абсолютный ноль', 'Каждый импульс с шансом 18% замораживает врагов намертво.'],
        ['Раскол', 'Охлаждённые враги получают +40% урона из любых источников.'],
      ]],
      ['Широкое поле', '+40% радиуса импульса и более мощные импульсы.', [
        ['Откат', 'Импульсы откатывают врагов назад по шине данных, каждого не больше 3 раз. Боссы не поддаются.'],
        ['Градобой', 'Импульсы чаще и вдобавок обрушивают на врагов 3 ледяных осколка с тяжёлым уроном.'],
      ]],
    ]],
    arc: ['Дуговое реле', 'Цепная молния перескакивает между 3 врагами.', [
      ['Проводник', 'Молния бьёт 5 врагов, дотягивается дальше и бьёт чаще.', [
        ['Буря', 'Дуга проходит через 9 врагов, а через 0,4 с бьёт снова с силой 50%.'],
        ['Перегрузка', 'Каждый удар с шансом 35% оглушает цель.'],
      ]],
      ['Высокое напряжение', '+80% урона. Молния игнорирует броню.', [
        ['ЭМИ-разряд', 'Разряжается во ВСЕХ врагов в радиусе сразу.'],
        ['Статическое поле', 'Бьёт чаще и замедляет врагов на 40%.'],
      ]],
    ]],
    launcher: ['Пусковая «Демон»', 'Самонаводящиеся ракеты-демоны со взрывом по площади. Медленно, но разрушительно.', [
      ['Боеголовки', '+70% урона и больший радиус взрыва.', [
        ['Нулевой день', 'Колоссальные взрывы-эксплойты: +75% урона и гораздо больший радиус.'],
        ['Кассетные бомбы', 'При попадании разлетаются 6 бомбочек — ковёр дополнительных взрывов.'],
      ]],
      ['Залповые блоки', 'Выпускает за залп 3 ракеты по разным целям.', [
        ['Ботнет', 'Залпы из 5 ракет и перезарядка на 30% быстрее.'],
        ['Порча', 'Попадания оставляют испорченные секторы, которые прожигают броню.'],
      ]],
    ]],
    lance: ['Копьё-шип', 'Дальнобойный снайпер. Бронебойный шип мгновенно поражает одну цель.', [
      ['Длинный ствол', '+40% урона и +30% дальности.', [
        ['Орбитальное копьё', 'Удар с орбиты: огромная дальность, +60% урона, а цель 3 с получает +30% урона.'],
        ['Палач', 'Сразу удаляет вредоносов (кроме боссов) с HP ниже 25%. Боссы получают +50%.'],
      ]],
      ['Быстрый затвор', '+80% скорострельности, −20% урона.', [
        ['Рикошет', 'Каждый шип рикошетит ещё в 2 цели с 60% урона.'],
        ['Подавитель', 'Шипы оглушают на 0,6 с, снимают щиты шифров и раскрывают руткиты.'],
      ]],
    ]],
    hub: ['Узел разгона', 'Узел поддержки. Без оружия — башни в его поле стреляют на 20% быстрее.', [
      ['Усилитель', 'Башни в поле также наносят +25% урона.', [
        ['Форсаж', 'Бонус поля растёт до +40% скорострельности, +35% урона и +15% дальности.'],
        ['Система наведения', 'Башни в поле игнорируют броню, а невидимые вредоносы внутри него раскрыты.'],
      ]],
      ['Широкая сеть', '+50% радиуса поля.', [
        ['Майнер кредитов', 'Добывает 5 кредитов каждые 4 с, пока идёт волна.'],
        ['Статическое поле', 'Вредоносы в поле движутся на 25% медленнее и получают +15% урона.'],
      ]],
    ]],
    mines: ['Логические мины', 'Минирует шину данных в своём радиусе. Мины ждут — даже между волнами.', [
      ['Кассетные заряды', '+50% урона мин, +30% радиуса взрыва.', [
        ['Ядерные семена', 'Мин мало, но они огромные: урон ×2,3, взрывы гораздо шире, 2 мины одновременно.'],
        ['Цепная реакция', 'Взрыв подрывает соседние мины и оставляет горящий сектор.'],
      ]],
      ['Быстрая укладка', '+70% скорости минирования, до 5 мин.', [
        ['ЭМИ-мины', 'Взрывы оглушают на 1,2 с и снимают щиты шифров.'],
        ['Смоляные ямы', 'Взрывы оставляют яму, которая замедляет вредоносов на 50% на 3 с.'],
      ]],
    ]],
  },
  branches: { Economy: 'Экономика', Arsenal: 'Арсенал', Core: 'Ядро' },
  research: {
    seed: ['Стартовый капитал', '+25 стартовых кредитов в каждом секторе.'],
    salvage: ['Протоколы утилизации', 'Продажа возвращает 80% вместо 70%.'],
    bounty: ['Индекс наград', 'Убийства приносят +8% кредитов.'],
    venture: ['Венчурный кэш', 'Каждый кэш данных сдаёт 4 карты вместо 3.'],
    optics: ['Калиброванная оптика', 'Все башни +6% дальности.'],
    rounds: ['Закалённые снаряды', 'Все башни +6% урона.'],
    tooling: ['Быстрая оснастка', 'Улучшения 2-го уровня на 12% дешевле.'],
    reroll: ['Дешифратор кэша', 'Один переброс кэша данных за забег.'],
    plating: ['Броня Ядра', '+2 к целостности Ядра.'],
    firewall2: ['Файрвол Mk II', 'Файрвол перезаряжается на 15% быстрее и держится на 1 с дольше.'],
    capacitor: ['Конденсатор чистки', 'Системная чистка перезаряжается на 15% быстрее.'],
    failsafe: ['Аварийная защита', 'Раз за забег смертельный прорыв оставляет Ядру 1 единицу и оглушает весь вредоносный код на 2 с.'],
  },
  medals: {
    flawless: ['Без царапин', () => 'Победи, не потеряв ни единицы целостности Ядра'],
    lean: ['Экономная сборка', (n) => `Победи, держа на поле не больше ${n} ${plural(n, ['башни', 'башен', 'башен'])} одновременно`],
    duo: ['Специалист', (n) => `Победи, используя только ${n} ${plural(n, ['тип', 'типа', 'типов'])} башен`],
    restraint: ['Сдержанность', () => 'Победи, не развив ни одной башни до 3-го уровня'],
    unassisted: ['Без поддержки', () => 'Победи без файрвола и системной чистки'],
    overclocked: ['Разгон', () => 'Победи, вызывая каждую волну досрочно'],
  },
  achievements: {
    first: ['Первый контакт', 'Пройди свой первый сектор.'],
    leviathan: ['Убийца Левиафана', 'Уничтожь Leviathan.exe.'],
    evolved: ['Полная эволюция', 'Развей башню до 3-го уровня.'],
    cards: ['Карточный шулер', 'Возьми 25 карт улучшений.'],
    arsenal: ['Полный арсенал', 'Построй хотя бы раз башню каждого типа.'],
    purge10: ['Чистая работа', 'Удали 10 вредоносов одной системной чисткой.'],
    kills: ['Истребитель', 'Уничтожь 1000 вредоносов.'],
    close: ['На волоске', 'Победи, когда у Ядра осталась ровно 1 единица целостности.'],
    second: ['Второй шанс', 'Победи в забеге, где тебя спасла аварийная защита.'],
    untouchable: ['Неприкасаемый', 'Победи на 3 звезды на «Сложном» или «Кошмаре».'],
    nightmare: ['Страж кошмара', 'Победи в любом секторе на «Кошмаре».'],
    kernel: ['Ядро ОС защищено', 'Пройди Сектор 10 · Ядро ОС.'],
    campaign: ['Сетка защищена', 'Пройди все десять секторов.'],
    medals10: ['Весь в медалях', 'Получи 10 медалей.'],
    medals30: ['Позолоченный', 'Получи все 30 медалей.'],
    research6: ['Исследователь', 'Установи 6 улучшений лаборатории.'],
    research12: ['Полный допуск', 'Установи все улучшения лаборатории.'],
    endless25: ['В пустоту', 'Дойди до 25-й волны в бесконечном режиме.'],
    daily5: ['Завсегдатай', 'Пройди испытание дня в 5 разных дней.'],
    streak5: ['Сила привычки', 'Играй в испытание дня 5 дней подряд.'],
  },
  cards: {
    overvolt: ['Перенапряжение', 'Фотонные бластеры наносят +20% урона.'],
    deepfreeze: ['Глубокая заморозка', 'ICE-узлы: +15% дальности и замедление на 10% сильнее.'],
    forked: ['Ветвистые дуги', 'Дуговые реле бьют на 1 цель больше и наносят +15% урона.'],
    payload: ['Тяжёлый груз', 'Пусковые «Демон»: +30% радиуса взрыва, +15% урона.'],
    longshot: ['Дальний выстрел', 'Копья-шипы: +20% дальности и +20% урона.'],
    meshlink: ['Сетевой канал', 'Поле узлов разгона на 25% шире.'],
    deepcharges: ['Глубинные заряды', 'Логические мины: +1 мина на башню, +20% урона.'],
    overclock: ['Разгон', 'Все башни стреляют на 8% быстрее.'],
    zeroday: ['Эксплойт нулевого дня', 'Все башни наносят +8% урона.'],
    precision: ['Точная прошивка', 'Каждое попадание игнорирует 2 брони.'],
    bounty: ['Протокол наград', 'Убийства приносят +15% кредитов.'],
    firmware: ['Обновление прошивки', 'Улучшения башен на 12% дешевле.'],
    interest: ['Сложный процент', 'В начале каждой волны — 6% от накопленных кредитов (до 50).'],
    salvage: ['Право утилизации', 'Продажа возвращает 90%.'],
    cache: ['Кредитный тайник', '+90 кредитов прямо сейчас.'],
    patch: ['Патч Ядра', 'Восстанавливает 3 единицы целостности Ядра.'],
    recharge: ['Быстрая перезарядка', 'Файрвол и системная чистка перезаряжаются на 30% быстрее.'],
    bastion: ['Файрвол-бастион', 'Файрволы держатся вдвое дольше.'],
    deeppurge: ['Глубокая чистка', 'Системная чистка наносит двойной урон.'],
  },
  // title, difficulty label, description
  sectors: {
    'sector-01': ['Змеиная шина', 'Вводный', 'Одна брешь, одна длинная извилистая шина данных. Изучи башни.'],
    'sector-02': ['Двойная брешь', 'Продвинутый', 'Две бреши питают одну магистраль, которая петлёй пересекает саму себя. Новый вредоносный код: черви, шифры, руткиты, патчеры.'],
    'sector-03': ['Холодное хранилище', 'Ледяная спираль', 'Шина закручивается внутрь, к Ядру в самом центре хранилища. Тяжёлый, медленный вредоносный код.'],
    'sector-04': ['Неоновый базар', 'Рой с трёх сторон', 'Бреши открываются с трёх сторон рынка и гонят быстрый код в одну развязку.'],
    'sector-05': ['Блэкаут', 'Скрытность', 'Район погрузился во тьму. Две полосы переплетаются друг с другом, руткиты прячутся в тумане — а в конце что-то большое.'],
    'sector-06': ['Литейная', 'Броня', 'Шина ступенями спускается по террасам плавилен и снова взбирается вверх. Толпы бронированных троянов, и патчеры не дают им умереть.'],
    'sector-07': ['Глубокий архив', 'Лабиринт', 'Кривой маршрут петляет туда и обратно между стеллажами, а Ядро спрятано в глухой нише. Щиты и маскировка — здесь точность важнее грубой силы.'],
    'sector-08': ['Грозовой фронт', 'Две полосы', 'Гроза приходит с востока: две зеркальные полосы огибают Ядро и сталкиваются у него за спиной. Короткие маршруты, плотные волны, молнии над головой.'],
    'sector-09': ['Орбитальный ретранслятор', 'Клещи', 'Высоко над планетой, Ядро точно в центре. Бреши открываются на обоих флангах сразу.'],
    'sector-10': ['Ядро ОС', 'Финал', 'Сердце сетки — хранилище из двух колец. Три бреши, полосы сталкиваются лоб в лоб и снова расходятся, а в конце — два Левиафана.'],
  },
};

function localizeData(R) {
  const pair = (obj, src) => { for (const [id, [name, desc]] of Object.entries(src)) if (obj[id]) Object.assign(obj[id], { name, desc }); };
  pair(DIFFICULTIES, R.difficulties);
  pair(ABILITIES, R.abilities);
  pair(RULES, R.rules);
  pair(MUTATORS, R.mutators);
  for (const [id, [name, pl, forms, trait]] of Object.entries(R.enemies)) if (ENEMIES[id]) Object.assign(ENEMIES[id], { name, plural: pl, forms, trait });
  for (const [id, [name, desc, branches]] of Object.entries(R.towers)) {
    const def = TOWERS[id];
    if (!def) continue;
    Object.assign(def, { name, desc });
    branches.forEach(([bn, bd, next], i) => {
      const b = def.branches[i];
      Object.assign(b, { name: bn, desc: bd });
      next.forEach(([nn, nd], j) => Object.assign(b.next[j], { name: nn, desc: nd }));
    });
  }
  for (const b of RESEARCH) {
    b.branch = R.branches[b.branch] || b.branch;
    for (const n of b.nodes) if (R.research[n.id]) [n.name, n.desc] = R.research[n.id];
  }
  pair(MEDALS, R.medals);
  for (const a of ACHIEVEMENTS) if (R.achievements[a.id]) [a.name, a.desc] = R.achievements[a.id];
  for (const c of CARDS) if (R.cards[c.id]) [c.name, c.desc] = R.cards[c.id];
  for (const m of MAPS) {
    m.name = m.name.replace('Sector', 'Сектор');
    if (R.sectors[m.id]) [m.title, m.difficulty, m.desc] = R.sectors[m.id];
  }
}

if (lang === 'ru') localizeData(RU_DATA);
