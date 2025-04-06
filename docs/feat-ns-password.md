# Vote Namespace Password Protection Feature Specification

## Overview
Add password protection capability for vote namespaces to enhance security. Only namespace admins can set/change passwords.

## Implementation Steps

### Frontend Changes (index.html)
1. Add Password Management section in admin controls:
```html
<div class="mt-6 space-y-4">
  <h3 class="font-semibold text-lg" data-i18n="passwordControls">Password Protection</h3>
  <div>
    <label for="password-input" class="block text-sm font-medium text-gray-700 mb-1">
      <span data-i18n="setPasswordLabel">Set New Password:</span>
    </label>
    <div class="flex flex-col space-y-2">
      <input type="password" id="password-input" 
             class="w-full p-2 border border-gray-300 rounded"
             data-i18n-placeholder="newPasswordPlaceholder" 
             placeholder="New password">
      <input type="password" id="password-confirm-input"
             class="w-full p-2 border border-gray-300 rounded"
             data-i18n-placeholder="confirmPasswordPlaceholder"
             placeholder="Confirm password">
      <button id="set-password-btn" 
              class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
              data-i18n="setPasswordBtn">
        Set Password
      </button>
    </div>
    <p id="password-status" class="mt-1 text-sm">
      <span data-i18n="currentPasswordStatus">Status:</span>
      <span id="password-status-value" class="font-medium">Not set</span>
    </p>
  </div>
</div>
```

### Backend Changes (server.js)
1. Add password hash field to namespace schema:
```javascript
// In namespace data structure
{
  adminKey: string,
  passwordHash?: string,
  // ...existing fields
}
```

2. Create password endpoints:
```javascript
// POST /namespace/password - Set/update password
app.post('/namespace/password', async (req, res) => {
  const { namespace, admin } = req.query;
  const { password } = req.body;

  // Validation logic
  if (!(await validateAdminKey(namespace, admin))) {
    return res.status(403).json({ message: 'Invalid admin key' });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ message: 'Password must be 8+ characters' });
  }

  // Hash password
  const hash = await bcrypt.hash(password, 10);
  
  // Update namespace data
  const data = await readNamespaceData(namespace);
  data.passwordHash = hash;
  await writeNamespaceData(namespace, data);

  res.json({ message: 'Password updated successfully' });
});

// Middleware for password protected endpoints
const checkNamespacePassword = async (req, res, next) => {
  const { namespace } = req.query;
  const { password } = req.body;
  
  const data = await readNamespaceData(namespace);
  if (data?.passwordHash) {
    if (!password || !(await bcrypt.compare(password, data.passwordHash))) {
      return res.status(401).json({ message: 'Invalid password' });
    }
  }
  next();
};
```

## Security Requirements
1. Passwords must be:
   - Minimum 8 characters
   - Stored as bcrypt hashes
   - Required for sensitive operations if set
2. Add rate limiting for password attempts
3. Enforce HTTPS for password transmissions

## Testing Plan
1. Verify password setup flow
2. Test access control for password-protected namespaces
3. Validate error cases:
   - Incorrect password
   - Weak password
   - Unauthorized admin attempts

## Documentation
1. Update README with new security features
2. Add password management section to user guide
3. Document API endpoints for password operations

## Rollout Strategy
1. Phase 1: Development & Testing (2 weeks)
2. Phase 2: Staging Environment Validation (1 week)
3. Phase 3: Gradual Production Rollout