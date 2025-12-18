# Migration from localStorage to MongoDB

## Overview
Replace all localStorage usage with API calls to the backend MongoDB database.

## Files to Update
- [x] dashboard.html - salary, planData, theme, currentUser, email export
- [x] settings.html - theme, currency, categories, salary, planData, user profile
- [x] trackspending.html - expenses
- [x] profile.html - profile data, expenses, goals, settings
- [x] preferences.html - preferences, custom categories
- [x] notifications.html - notifications, expenses, goals
- [x] reports.html - expenses, theme, currency, currentUser
- [x] scan-bill.html - expenses, moments
- [x] receipt-scan.html - scanned expense
- [x] index.html - users, current user

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
6. Remove unused localStorage keys (Done)

## Current Status
Deployed. Email Service Verified (Port 2525). Idle timeouts in logs are normal for connection pooling.
