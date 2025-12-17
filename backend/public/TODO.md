# Migration from localStorage to MongoDB

## Overview
Replace all localStorage usage with API calls to the backend MongoDB database.

## Files to Update
- [ ] dashboard.html - salary, planData, theme, currentUser
- [ ] settings.html - theme, currency, categories, salary, planData, user profile
- [ ] trackspending.html - expenses
- [ ] profile.html - profile data, expenses, goals, settings
- [ ] preferences.html - preferences, custom categories
- [ ] notifications.html - notifications, expenses, goals
- [ ] reports.html - expenses, theme, currency, currentUser
- [ ] scan-bill.html - expenses, moments
- [ ] receipt-scan.html - scanned expense
- [ ] index.html - users, current user

## API Endpoints to Use
- /api/auth/me - get current user
- /api/auth/profile - update user profile (salary)
- /api/settings - get/update user settings (theme, currency, categories, planData)
- /api/expenses - get/save/delete expenses
- /api/settings/categories - add categories

## Implementation Steps
1. Update dashboard.html to use API calls
2. Update settings.html
3. Update trackspending.html
4. Update other pages
5. Test full application
6. Remove unused localStorage keys

## Current Status
Starting with dashboard.html
