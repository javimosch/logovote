# Internationalization (i18n) in VoteImage

## Overview

VoteImage supports multiple languages through a simple yet effective i18n system. The default language is French ('fr'), but users can switch between supported languages, and their preference is remembered.

## Language Selection Priority

1. User's explicit choice (stored in localStorage)
2. Browser's language preference (if supported)
3. Server's default language (configurable via DEFAULT_LANG environment variable, defaults to 'fr')

## Implementation Details

### Server-Side

- Default language is configured via `DEFAULT_LANG` environment variable in `.env`
- Server sends default language via `X-Default-Lang` header on initial page load
- Locale files are served from `/src/locales/` directory

### Client-Side

- Language switcher in UI allows immediate language changes
- Language preference is stored in localStorage as 'preferredLanguage'
- Active language is visually indicated in the UI
- All UI text is loaded from JSON translation files

### Translation Files

Location: `/src/locales/{lang}.json`

Structure:
```json
{
  "key": "translated text",
  "keyWithParam": "text with {param}"
}
```

Currently supported languages:
- English (en)
- French (fr)

### Usage in Code

1. HTML Elements:
```html
<element data-i18n="translationKey">Default Text</element>
<input data-i18n-placeholder="placeholderKey" placeholder="Default Placeholder">
<element data-i18n-title="tooltipKey" title="Default Tooltip">
```

2. JavaScript:
```javascript
// Get translated text
const text = t('translationKey');

// With parameters
const text = t('keyWithParam', { param: 'value' });
```

## Adding a New Language

1. Create new translation file in `/src/locales/{lang}.json`
2. Add language code to `supportedLanguages` array in index.html
3. Add language to switcher UI
4. Translate all existing keys

## Best Practices

1. Always use translation keys instead of hardcoded text
2. Keep translation keys descriptive and organized by feature
3. Use parameters for dynamic content
4. Provide fallback text in HTML for better loading experience
5. Test all supported languages after adding new features

## Error Handling

- Missing translations fall back to the key name
- Failed language loads fall back to English
- If English fails, keys are used as text
- Invalid language selections are ignored with a warning

## Language Switcher Behavior

- Highlights current active language
- Updates immediately on selection
- Persists choice across sessions
- Updates `<html lang="">` attribute
- Retranslates all page content
- Maintains state during navigation

## Testing Language Switching

### Visual Indicators

The current language should be visually indicated in the UI:
- Active language button has blue background (`bg-blue-600`) and white text
- Active language button has `active` class applied
- Inactive language buttons show hover effect with gray background
- HTML `lang` attribute updates to match selected language

### Test Cases

1. **Initial Load**
   - Set `DEFAULT_LANG=fr` in `.env`
   - Load page
   - Expected: FR button highlighted, content in French

2. **Browser Preference**
   - Clear localStorage
   - Set browser language to English
   - Reload page
   - Expected: EN button highlighted, content in English

3. **User Selection**
   - Click FR button
   - Expected:
     - FR button gets blue background
     - EN button loses highlight
     - Content changes to French
     - Setting persists after reload

4. **localStorage Priority**
   - Set `DEFAULT_LANG=fr` in `.env`
   - Set browser to English
   - Click EN button
   - Reload page
   - Expected: EN remains selected (localStorage preference wins)

### Common Issues

- Language button not highlighting: Check if `updateLanguageSwitcher()` is called after language changes
- Highlight lost after reload: Verify localStorage is being set and read correctly
- Wrong initial language: Check priority order (localStorage > browser > server default)

### Manual Testing Steps

1. Clear browser data:
   - Clear localStorage
   - Reset browser language
   - Close all tabs of the app

2. Test server default:
   ```bash
   # Set French as default
   echo "DEFAULT_LANG=fr" > .env
   # Restart server
   npm run dev
   ```
   - Load page
   - Verify FR is highlighted

3. Test language switching:
   - Click EN button
   - Verify:
     - EN button turns blue
     - FR button becomes gray
     - Content changes to English
   - Reload page
   - Verify EN remains selected

4. Test persistence:
   - Select FR
   - Close browser
   - Reopen and navigate to site
   - Verify FR is still selected

### Debugging

If language switcher is not highlighting:
1. Check browser console for errors
2. Verify `currentLanguage` value
3. Inspect language buttons for `active` class
4. Confirm `updateLanguageSwitcher()` is being called
5. Test CSS styles are being applied correctly

## Environment Variables

```env
# In .env file
DEFAULT_LANG=fr  # Options: fr, en (defaults to fr if not set)
```