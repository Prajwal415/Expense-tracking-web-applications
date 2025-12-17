const SETTINGS_KEYS = {
  THEME: 'appTheme',           // 'light' or 'dark'
  USER: 'currentUser',          // JSON object {name, email, ...}
  CURRENCY: 'currencySymbol',   // '₹', '$', etc
  LANGUAGE: 'appLanguage',      // 'en', 'hi', etc
  NOTIFICATIONS: 'notifications', // true/false
  PROFILE_NAME: 'profileName',
  PROFILE_EMAIL: 'profileEmail',
  PROFILE_PHONE: 'profilePhone',
  PROFILE_AVATAR: 'profileAvatar'
};

// ===== INITIALIZE SETTINGS MANAGER =====
class SettingsManager {
  constructor() {
    this.listeners = [];
    this.setupStorageListener();
  }
  

  // Get setting value
  getSetting(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? value : defaultValue;
    } catch (e) {
      console.error('Error getting setting:', e);
      return defaultValue;
    }
  }

  // Set setting value and notify all listeners
  setSetting(key, value) {
    try {
      localStorage.setItem(key, value);
      this.notifyListeners(key, value);
    } catch (e) {
      console.error('Error setting:', key, e);
    }
  }

  // Get object settings (JSON)
  getSettingObject(key, defaultObject = {}) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultObject;
    } catch (e) {
      console.error('Error getting object setting:', e);
      return defaultObject;
    }
  }

  // Set object settings (JSON)
  setSettingObject(key, object) {
    try {
      localStorage.setItem(key, JSON.stringify(object));
      this.notifyListeners(key, object);
    } catch (e) {
      console.error('Error setting object:', key, e);
    }
  }

  // Register listener for changes
  onSettingChange(callback) {
    this.listeners.push(callback);
  }

  // Remove listener
  offSettingChange(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  // Notify all listeners
  notifyListeners(key, value) {
    this.listeners.forEach(listener => {
      try {
        listener(key, value);
      } catch (e) {
        console.error('Error in listener:', e);
      }
    });
  }

  // Listen to storage changes from other tabs/windows
  setupStorageListener() {
    window.addEventListener('storage', (e) => {
      if (e.key && Object.values(SETTINGS_KEYS).includes(e.key)) {
        this.notifyListeners(e.key, e.newValue);
      }
    });
  }
  

  // Sync all settings with UI elements
  syncWithUI() {
    // Apply theme
    const theme = this.getSetting(SETTINGS_KEYS.THEME, 'light');
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);

    // Update user header if exists
    const user = this.getSettingObject(SETTINGS_KEYS.USER, {});
    if (user.name) {
      const userNameEl = document.getElementById('userName');
      const userAvatarEl = document.getElementById('userAvatar');
      const welcomeTextEl = document.getElementById('welcomeText');

      if (userNameEl) userNameEl.innerText = user.name;
      if (userAvatarEl) userAvatarEl.innerText = user.name.charAt(0).toUpperCase();
      if (welcomeTextEl) welcomeTextEl.innerText = `Welcome back, ${user.name.split(' ')[0]}! 👋`;
    }
  }
}

// Create global instance
const settingsManager = new SettingsManager();

// Apply sync on page load
document.addEventListener('DOMContentLoaded', () => {
  settingsManager.syncWithUI();
});

// Also apply immediately for fast pages
settingsManager.syncWithUI();