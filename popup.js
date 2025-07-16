const snippetsList = document.getElementById("snippets-list");
const favoritesList = document.getElementById("favorites-list");
const STORAGE = chrome.storage.local;
const searchInput = document.getElementById('search');
const copiedPreview = document.getElementById('copied-preview');
const downloadBtn = document.getElementById('download-btn');
const downloadCsvBtn = document.getElementById('download-csv-btn');
const settingsBtn = document.getElementById('settings-btn');
const allTab = document.getElementById('all-tab');
const favoritesTab = document.getElementById('favorites-tab');
const allContent = document.getElementById('all-content');
const favoritesContent = document.getElementById('favorites-content');

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

let currentTab = 'all';
let settings = null;

// Default settings
const defaultSettings = {
  badgeEnabled: false,
  blankItems: false,
  theme: 'system',
  itemLimit: 20
};

// Load settings
async function loadSettings() {
  const result = await STORAGE.get({ settings: defaultSettings });
  return result.settings;
}

// Save settings
async function saveSettings(newSettings) {
  await STORAGE.set({ settings: newSettings });
  settings = newSettings;
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

// Update badge
async function updateBadge() {
  if (!settings?.badgeEnabled) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  
  const result = await STORAGE.get({ snippets: [] });
  const totalItems = result.snippets.length;
  chrome.action.setBadgeText({ text: totalItems.toString() });
  chrome.action.setBadgeBackgroundColor({ color: '#4f8cff' });
}

// Load snippets
async function loadSnippets() {
  const result = await STORAGE.get({ snippets: [] });
  return result.snippets;
}

// Save snippets
async function saveSnippets(snippets) {
  await STORAGE.set({ snippets });
  updateBadge();
}

// Load favorites
async function loadFavorites() {
  const result = await STORAGE.get({ favorites: [] });
  return result.favorites;
}

// Save favorites
async function saveFavorites(favorites) {
  await STORAGE.set({ favorites });
}

function showCopiedAlert() {
  let alertDiv = document.getElementById('copied-alert');
  if (!alertDiv) {
    alertDiv = document.createElement('div');
    alertDiv.id = 'copied-alert';
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '12px';
    alertDiv.style.left = '50%';
    alertDiv.style.transform = 'translateX(-50%)';
    alertDiv.style.background = 'rgba(60,60,60,0.95)';
    alertDiv.style.color = '#fff';
    alertDiv.style.padding = '7px 18px';
    alertDiv.style.borderRadius = '8px';
    alertDiv.style.fontWeight = '600';
    alertDiv.style.fontSize = '1rem';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
    alertDiv.style.pointerEvents = 'none';
    document.body.appendChild(alertDiv);
  }
  alertDiv.textContent = 'Copied!';
  alertDiv.style.display = 'block';
  alertDiv.style.opacity = '1';
  setTimeout(() => {
    alertDiv.style.opacity = '0';
    setTimeout(() => { alertDiv.style.display = 'none'; }, 300);
  }, 1200);
}

async function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // Format time as HH:MM AM/PM with explicit AM/PM
  const timeString = date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true
  }).toUpperCase(); // Convert am/pm to AM/PM

  // Check if date is today
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${timeString}`;
  }
  
  // Check if date is yesterday
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${timeString}`;
  }
  
  // For older dates, format as YYYY/MM/DD, HH:MM AM/PM
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}, ${timeString}`;
}

async function createActionButtons(snippet, index, isFavorite = false) {
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'item-actions';
  // Remove column stacking, let CSS handle row layout
  actionsDiv.style.flexDirection = '';
  actionsDiv.style.alignItems = '';
  actionsDiv.style.gap = '';

  // Favorite button
  const favBtn = document.createElement('button');
  favBtn.className = `action-btn favorite-btn ${snippet.isFavorite ? 'favorited' : ''}`;
  favBtn.innerHTML = await loadSvgIcon('favourite-outline');
  favBtn.title = snippet.isFavorite ? 'Remove from favorites' : 'Add to favorites';
  favBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleFavorite(snippet, index, isFavorite);
  });

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'action-btn edit-btn';
  editBtn.innerHTML = await loadSvgIcon('edit');
  editBtn.title = 'Edit item';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startEdit(snippet, index, isFavorite);
  });

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'action-btn delete-btn';
  delBtn.innerHTML = await loadSvgIcon('delete');
  delBtn.title = 'Delete item';
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteItem(snippet, index, isFavorite);
  });

  // Add all buttons to actionsDiv in a row
  actionsDiv.appendChild(favBtn);
  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(delBtn);

  return actionsDiv;
}

async function toggleFavorite(snippet, index, isFavorite = false) {
  // Get the button that was clicked
  const clickedBtn = event.target.closest('.favorite-btn');
  
  // Check the actual current state of the button
  const isCurrentlyFavorited = clickedBtn.classList.contains('favorited');
  
  if (isCurrentlyFavorited) {
    // Remove from favorites
    let favorites = await loadFavorites();
    const favoriteIndex = favorites.findIndex(f => f.text === snippet.text && f.copiedAt === snippet.copiedAt);
    if (favoriteIndex !== -1) {
      favorites.splice(favoriteIndex, 1);
      await saveFavorites(favorites);
    }
    
    // Update the main list item to show it's not favorited
    let snippets = await loadSnippets();
    const snippetIndex = snippets.findIndex(s => s.text === snippet.text && s.copiedAt === snippet.copiedAt);
    if (snippetIndex !== -1) {
      snippets[snippetIndex].isFavorite = false;
      await saveSnippets(snippets);
    }
    
    // Update UI directly without re-rendering
    clickedBtn.classList.remove('favorited');
    clickedBtn.title = 'Add to favorites';
    
    // Update favorites list if we're in favorites tab
    if (currentTab === 'favorites') {
      const scrollTop = favoritesList.scrollTop;
      renderFavorites(searchInput.value);
      favoritesList.scrollTop = scrollTop;
    }
  } else {
    // Add to favorites
    let favorites = await loadFavorites();
    const favoriteItem = { ...snippet, isFavorite: true };
    favorites.unshift(favoriteItem);
    await saveFavorites(favorites);
    
    // Update the main list item to show it's favorited
    let snippets = await loadSnippets();
    const snippetIndex = snippets.findIndex(s => s.text === snippet.text && s.copiedAt === snippet.copiedAt);
    if (snippetIndex !== -1) {
      snippets[snippetIndex].isFavorite = true;
      await saveSnippets(snippets);
    }
    
    // Update UI directly without re-rendering
    clickedBtn.classList.add('favorited');
    clickedBtn.title = 'Remove from favorites';
  }
}

async function startEdit(snippet, index, isFavorite = false) {
  const li = event.target.closest('li');
  const originalText = li.textContent;
  
  li.classList.add('edit-mode');
  li.innerHTML = `
    <input type="text" class="edit-input" value="${snippet.text}" />
    <div class="edit-actions">
      <button class="action-btn save-btn" title="Save"></button>
      <button class="action-btn cancel-btn" title="Cancel"></button>
    </div>
  `;
  
  // Load SVG icons for save and cancel buttons
  const saveBtn = li.querySelector('.save-btn');
  const cancelBtn = li.querySelector('.cancel-btn');
  saveBtn.innerHTML = await loadSvgIcon('save');
  cancelBtn.innerHTML = await loadSvgIcon('cancel');
  
  // Add event listeners for save and cancel buttons
  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await saveEdit(index, isFavorite);
  });
  
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelEdit(originalText, isFavorite);
  });
  
  const input = li.querySelector('.edit-input');
  input.focus();
  input.select();
}

async function saveEdit(index, isFavorite = false) {
  const li = event.target.closest('li');
  const input = li.querySelector('.edit-input');
  let newText = input.value.trim();
  if (!newText) return;
  // Enforce 5,000 character limit per item
  newText = newText.slice(0, 5000);
  if (isFavorite) {
    let favorites = await loadFavorites();
    favorites[index].text = newText;
    await saveFavorites(favorites);
    renderFavorites(searchInput.value);
  } else {
    let snippets = await loadSnippets();
    snippets[index].text = newText;
    await saveSnippets(snippets);
    renderList(searchInput.value);
  }
}

function cancelEdit(originalText, isFavorite = false) {
  const li = event.target.closest('li');
  li.classList.remove('edit-mode');
  
  if (isFavorite) {
    renderFavorites(searchInput.value);
  } else {
    renderList(searchInput.value);
  }
}

async function deleteItem(snippet, index, isFavorite = false) {
  if (isFavorite) {
    // Delete from favorites only
    let favorites = await loadFavorites();
    favorites.splice(index, 1);
    await saveFavorites(favorites);
    
    const scrollTop = favoritesList.scrollTop;
    renderFavorites(searchInput.value);
    favoritesList.scrollTop = scrollTop;
  } else {
    // Delete from main list and also remove from favorites if it exists there
    let snippets = await loadSnippets();
    let favorites = await loadFavorites();
    
    snippets.splice(index, 1);
    await saveSnippets(snippets);
    
    // Remove from favorites if it exists
    const favoriteIndex = favorites.findIndex(f => f.text === snippet.text && f.copiedAt === snippet.copiedAt);
    if (favoriteIndex !== -1) {
      favorites.splice(favoriteIndex, 1);
      await saveFavorites(favorites);
    }
    
    const scrollTop = snippetsList.scrollTop;
    renderList(searchInput.value);
    snippetsList.scrollTop = scrollTop;
    
    // Only re-render favorites if we're not in favorites tab to avoid double rendering
    if (currentTab !== 'favorites') {
      renderFavorites(searchInput.value);
    }
  }
}

async function createListItem(snippet, index, isFavorite = false) {
  const li = document.createElement("li");
  
  // Add action buttons FIRST (top)
  const actionsDiv = await createActionButtons(snippet, index, isFavorite);
  li.appendChild(actionsDiv);

  // Create text content container (should be directly under icons)
  const textContainer = document.createElement("div");
  textContainer.className = "item-text";
  const previewLength = 300;
  let previewText = snippet.text.length > previewLength ? snippet.text.slice(0, previewLength) + '…' : snippet.text;
  textContainer.textContent = previewText;
  textContainer.title = snippet.text;
  li.appendChild(textContainer);

  // Create metadata container (should be at the bottom)
  const metaContainer = document.createElement("div");
  metaContainer.className = "item-meta";
  const charCount = document.createElement("div");
  charCount.className = "char-count";
  charCount.textContent = `${snippet.text.length} characters`;
  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = await formatTimestamp(snippet.copiedAt);
  timestamp.title = new Date(snippet.copiedAt).toLocaleString();
  metaContainer.appendChild(charCount);
  metaContainer.appendChild(timestamp);
  li.appendChild(metaContainer);

  // Copy on click
  li.addEventListener("click", (e) => {
    if (e.target.classList.contains('action-btn')) return;
    navigator.clipboard.writeText(snippet.text).then(() => {
      showCopiedAlert();
    });
  });

  return li;
}

function updateCopiedPreview(snippets) {
  if (
    snippets.length === 0 ||
    !snippets[0].text ||
    !snippets[0].text.trim() ||
    snippets[0].text.trim().length < 2 ||
    snippets[0].text.trim().toLowerCase().startsWith('skip to content')
  ) {
    copiedPreview.style.display = 'none';
    copiedPreview.textContent = '';
    return;
  }
  copiedPreview.style.display = 'block';
  let previewText = snippets[0].text;
  if (previewText.length > 5000) {
    previewText = previewText.slice(0, 5000) + '…';
  }
  copiedPreview.textContent = `Copied: "${previewText.length > 80 ? previewText.slice(0, 80) + '…' : previewText}"`;
  copiedPreview.title = previewText;
}

async function renderList(filter = "") {
  const scrollTop = snippetsList.scrollTop;
  const currentItems = Array.from(snippetsList.children);
  
  const snippets = await loadSnippets();
  const favorites = await loadFavorites();
  updateCopiedPreview(snippets);
  
  // Mark snippets that are in favorites
  const favoriteTexts = favorites.map(f => f.text);
  snippets.forEach(snippet => {
    snippet.isFavorite = favoriteTexts.includes(snippet.text);
  });
  
  let filtered = snippets;
  if (filter) {
    filtered = snippets.filter(s => s.text.toLowerCase().includes(filter.toLowerCase()));
  }
  
  if (filtered.length === 0) {
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgColor = isDarkMode ? '#374151' : '#f9fafb';
    const textColor = isDarkMode ? '#d1d5db' : '#374151';
    const borderColor = isDarkMode ? '#4b5563' : '#d1d5db';
    
    snippetsList.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; color: ${textColor}; text-align: center; padding: 32px 16px; font-size: 0.95rem; font-weight: 500; background: ${bgColor}; border-radius: 8px; margin: 16px 8px; border: 1px dashed ${borderColor}; min-height: 80px;">No items yet.</div>`;
    return;
  }
  
  // Only re-render if the content has actually changed
  const currentTexts = currentItems.map(item => {
    const textElement = item.querySelector('.item-text');
    return textElement ? textElement.textContent?.trim() : '';
  }).filter(Boolean);
  const newTexts = filtered.map(s => s.text.trim());
  
  if (JSON.stringify(currentTexts) !== JSON.stringify(newTexts)) {
    snippetsList.innerHTML = "";
    
    for (let i = 0; i < filtered.length; i++) {
      const snippet = filtered[i];
      const realIndex = snippets.findIndex(s => s.text === snippet.text && s.copiedAt === snippet.copiedAt);
      const li = await createListItem(snippet, realIndex, false);
      snippetsList.appendChild(li);
    }
  }
  
  // Restore scroll position
  snippetsList.scrollTop = scrollTop;
}

async function renderFavorites(filter = "") {
  const scrollTop = favoritesList.scrollTop;
  const currentItems = Array.from(favoritesList.children);
  
  const favorites = await loadFavorites();
  
  let filtered = favorites;
  if (filter) {
    filtered = favorites.filter(s => s.text.toLowerCase().includes(filter.toLowerCase()));
  }
  
  if (filtered.length === 0) {
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgColor = isDarkMode ? '#374151' : '#f9fafb';
    const textColor = isDarkMode ? '#d1d5db' : '#374151';
    const borderColor = isDarkMode ? '#4b5563' : '#d1d5db';
    
    favoritesList.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; color: ${textColor}; text-align: center; padding: 32px 16px; font-size: 0.95rem; font-weight: 500; background: ${bgColor}; border-radius: 8px; margin: 16px 8px; border: 1px dashed ${borderColor}; min-height: 80px;">No favorites yet.</div>`;
    return;
  }
  
  // Only re-render if the content has actually changed
  const currentTexts = currentItems.map(item => {
    const textElement = item.querySelector('.item-text');
    return textElement ? textElement.textContent?.trim() : '';
  }).filter(Boolean);
  const newTexts = filtered.map(s => s.text.trim());
  
  if (JSON.stringify(currentTexts) !== JSON.stringify(newTexts)) {
    favoritesList.innerHTML = "";
    
    for (let i = 0; i < filtered.length; i++) {
      const snippet = filtered[i];
      const realIndex = favorites.findIndex(s => s.text === snippet.text && s.copiedAt === snippet.copiedAt);
      const li = await createListItem(snippet, realIndex, true);
      favoritesList.appendChild(li);
    }
  }
  
  // Restore scroll position
  favoritesList.scrollTop = scrollTop;
}

function switchTab(tab) {
  currentTab = tab;
  
  // Update tab buttons
  allTab.classList.toggle('active', tab === 'all');
  favoritesTab.classList.toggle('active', tab === 'favorites');
  
  // Update content
  allContent.classList.toggle('active', tab === 'all');
  favoritesContent.classList.toggle('active', tab === 'favorites');
  
  // Render appropriate content
  if (tab === 'all') {
    renderList(searchInput.value);
  } else {
    renderFavorites(searchInput.value);
  }
}

// Function to escape CSV fields properly
function escapeCSV(field) {
  if (field === null || field === undefined) {
    return '';
  }
  const stringField = String(field);
  // If the field contains quotes, commas, or newlines, wrap it in quotes and escape existing quotes
  if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

// Function to download data as CSV
async function downloadAsCSV() {
  const snippets = currentTab === 'all' ? await loadSnippets() : await loadFavorites();
  
  // Don't proceed if there are no items
  if (!snippets || snippets.length === 0) {
    return;
  }
  
  // Create CSV content with proper line endings
  let csvContent = '\ufeff'; // Add BOM for Excel compatibility
  
  // Add headers
  csvContent += 'Text,Date,Time,Characters,Favorite\r\n';
  
  // Add each snippet as a row
  snippets.forEach(snippet => {
    const date = new Date(snippet.copiedAt);
    const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    const timeStr = date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    }).toUpperCase();
    
    // Create row with proper escaping
    const row = [
      escapeCSV(snippet.text),
      escapeCSV(dateStr),
      escapeCSV(timeStr),
      escapeCSV(snippet.text.length.toString()),
      escapeCSV(snippet.isFavorite ? 'Yes' : 'No')
    ].join(',');
    
    csvContent += row + '\r\n';
  });
  
  // Create and trigger download with proper MIME type
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `clipboard_history_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- Debounce utility ---
function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// --- SVG Preloading ---
const SVG_ICONS = ['settings', 'favourite-outline', 'edit', 'delete', 'save', 'cancel', 'back'];
async function preloadIcons() {
  await Promise.all(SVG_ICONS.map(iconName => loadSvgIcon(iconName)));
}

// --- Debounced Scroll Render for Virtualization ---
const debouncedScrollRender = debounce(() => {
  if (currentTab === 'all') renderListVirtualized(searchInput.value);
}, 16);

snippetsList.addEventListener('scroll', debouncedScrollRender);

// --- Virtualized List Rendering ---
function getFilteredSnippets(snippets, filter) {
  if (!filter) return snippets;
  const norm = filter.trim().toLowerCase();
  return snippets.filter(s => s.text.toLowerCase().includes(norm));
}

let lastSearch = '';
let lastFiltered = [];

async function renderListVirtualized(filter = "") {
  const container = snippetsList;
  const allSnippets = await loadSnippets();
  const favorites = await loadFavorites();
  const favoriteTexts = favorites.map(f => f.text);
  allSnippets.forEach(snippet => {
    snippet.isFavorite = favoriteTexts.includes(snippet.text);
  });

  // Search filter with cache
  let filtered;
  if (filter === lastSearch) {
    filtered = lastFiltered;
  } else {
    filtered = getFilteredSnippets(allSnippets, filter);
    lastSearch = filter;
    lastFiltered = filtered;
  }

  updateCopiedPreview(allSnippets);

  if (filtered.length === 0) {
    container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; color: #374151; text-align: center; padding: 32px 16px; font-size: 0.95rem; font-weight: 500; background: #f9fafb; border-radius: 8px; margin: 16px 8px; border: 1px dashed #d1d5db; min-height: 80px;">No items yet.</div>`;
    return;
  }

  // Virtualization
  const itemHeight = 72; // Updated for better spacing and accuracy
  const visibleCount = Math.ceil(container.clientHeight / itemHeight);
  const scrollTop = container.scrollTop;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 5);
  const end = Math.min(filtered.length, start + visibleCount + 10);

  const fragment = document.createDocumentFragment();
  for (let i = start; i < end; i++) {
    const snippet = filtered[i];
    const realIndex = allSnippets.findIndex(s => s.text === snippet.text && s.copiedAt === snippet.copiedAt);
    const li = await createListItem(snippet, realIndex, false);
    fragment.appendChild(li);
  }
  container.innerHTML = '';
  container.appendChild(fragment);
}

// --- Debounced Search Input ---
const debouncedRender = debounce(() => {
  if (currentTab === 'all') renderListVirtualized(searchInput.value);
  else renderFavorites(searchInput.value);
}, 250);

// --- Patch initialize to preload icons and use debounced search ---
async function initialize() {
  settings = await loadSettings();
  applyTheme(settings.theme);
  await preloadIcons();
  settingsBtn.innerHTML = await loadSvgIcon('settings');
  searchInput.removeEventListener('input', debouncedRender); // Remove if already attached
  searchInput.addEventListener('input', debouncedRender);
  
  downloadBtn.addEventListener('click', async () => {
    const snippets = currentTab === 'all' ? await loadSnippets() : await loadFavorites();
    
    // Don't proceed if there are no items
    if (!snippets || snippets.length === 0) {
      return;
    }
    
    const text = snippets.map(s => s.text).join('\n\n');
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `clipboard_history_${new Date().toISOString().split('T')[0]}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
  
  downloadCsvBtn.addEventListener('click', downloadAsCSV);
  
  settingsBtn.addEventListener('click', () => {
    window.location.href = 'settings.html';
  });
  
  allTab.addEventListener('click', () => switchTab('all'));
  favoritesTab.addEventListener('click', () => switchTab('favorites'));
  
  // Initial render
  renderList();
  renderFavorites();
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  if (settings?.theme === 'system') {
    applyTheme('system');
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initialize); 