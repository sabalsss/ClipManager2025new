const STORAGE = chrome.storage.local;

// SVG icon cache
const svgIcons = {};

// Load SVG icon
async function loadSvgIcon(iconName) {
  if (svgIcons[iconName]) {
    return svgIcons[iconName];
  }
  
  try {
    const response = await fetch(chrome.runtime.getURL(`${iconName}.svg`));
    const svgText = await response.text();
    svgIcons[iconName] = svgText;
    return svgText;
  } catch (error) {
    console.error(`Failed to load SVG icon: ${iconName}`, error);
    return '';
  }
}

// Settings elements
const backBtn = document.getElementById('back-btn');
const badgeEnabled = document.getElementById('badge-enabled');
const blankItems = document.getElementById('blank-items');
const themeSelect = document.getElementById('theme-select');
const itemLimit = document.getElementById('item-limit');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const importFile = document.getElementById('import-file');

// Default settings
const defaultSettings = {
  badgeEnabled: false,
  blankItems: false,
  theme: 'system',
  itemLimit: 20
};

// Load settings from storage
async function loadSettings() {
  const result = await STORAGE.get({ settings: defaultSettings });
  return result.settings;
}

// Save settings to storage
async function saveSettings(settings) {
  await STORAGE.set({ settings });
  // Update badge if enabled
  if (settings.badgeEnabled) {
    updateBadge();
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
  // Notify background script
  chrome.runtime.sendMessage({ type: "settingsUpdated" });
}

// Apply theme
function applyTheme(theme) {
  if (theme === 'system') {
    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// Update badge with total items count
async function updateBadge() {
  const result = await STORAGE.get({ snippets: [] });
  const totalItems = result.snippets.length;
  chrome.action.setBadgeText({ text: totalItems.toString() });
  chrome.action.setBadgeBackgroundColor({ color: '#4f8cff' });
}

// Initialize settings page
async function initializeSettings() {
  const settings = await loadSettings();
  
  // Set form values
  badgeEnabled.checked = settings.badgeEnabled;
  blankItems.checked = settings.blankItems;
  themeSelect.value = settings.theme;
  itemLimit.value = settings.itemLimit;
  
  // Apply current theme
  applyTheme(settings.theme);
  
  // Load back icon
  backBtn.innerHTML = await loadSvgIcon('back');
  
  // Update badge if enabled
  if (settings.badgeEnabled) {
    updateBadge();
  }
}

// Event listeners
backBtn.addEventListener('click', () => {
  window.location.href = 'popup.html';
});

badgeEnabled.addEventListener('change', async () => {
  const settings = await loadSettings();
  settings.badgeEnabled = badgeEnabled.checked;
  await saveSettings(settings);
});

blankItems.addEventListener('change', async () => {
  const settings = await loadSettings();
  settings.blankItems = blankItems.checked;
  await saveSettings(settings);
});

themeSelect.addEventListener('change', async () => {
  const settings = await loadSettings();
  settings.theme = themeSelect.value;
  await saveSettings(settings);
  applyTheme(settings.theme);
});

itemLimit.addEventListener('change', async () => {
  const settings = await loadSettings();
  settings.itemLimit = parseInt(itemLimit.value);
  await saveSettings(settings);
  
  // Trim existing snippets if needed
  const result = await STORAGE.get({ snippets: [] });
  if (result.snippets.length > settings.itemLimit) {
    result.snippets = result.snippets.slice(0, settings.itemLimit);
    await STORAGE.set({ snippets: result.snippets });
  }
});

importBtn.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (data.snippets && Array.isArray(data.snippets)) {
      await STORAGE.set({ snippets: data.snippets });
      alert('Data imported successfully!');
    } else {
      alert('Invalid file format. Please select a valid export file.');
    }
  } catch (error) {
    alert('Error importing data: ' + error.message);
  }
  
  // Reset file input
  importFile.value = '';
});

exportBtn.addEventListener('click', async () => {
  const result = await STORAGE.get({ snippets: [] });
  const data = {
    snippets: result.snippets,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clipboard-manager-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
});

clearAllBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all items? This action cannot be undone.')) {
    await STORAGE.set({ snippets: [], favorites: [] });
    alert('All items and favorites cleared successfully!');
  }
});

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const settings = await loadSettings();
  if (settings.theme === 'system') {
    applyTheme('system');
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeSettings); 