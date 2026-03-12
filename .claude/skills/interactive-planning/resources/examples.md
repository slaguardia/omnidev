# Interactive Planning Examples

## Example 1: Feature Request

**User:** `/interactive-planning add user profile editing`

**Claude asks:**

```
I'll help you create task files for user profile editing. Let me ask a few questions:

1. What aspects of the profile can users edit?
   A) Basic info (name, bio, avatar)
   B) Contact info (email, phone)
   C) Preferences (notifications, privacy)
   D) All of the above
   E) Other: [please specify]

2. How should avatar uploads work?
   A) Direct file upload
   B) URL from external service
   C) Choose from preset avatars
   D) All options

3. What validation is needed?
   A) Basic (required fields, email format)
   B) Moderate (+ username uniqueness, length limits)
   C) Strict (+ content filtering, image validation)
```

**User:** `1D, 2A, 3B`

**Claude generates draft:**

```
## Feature: Enable user profile editing

### Summary
Allow users to edit their profile including basic info, contact details,
and preferences through a unified settings interface.

### Out of Scope
- Social profile connections
- Profile verification/badges
- Public/private profile toggle

### User Stories

**US-001: Edit basic profile information**
As a user, I want to edit my name, bio, and avatar so that I can personalize my profile.

Acceptance Criteria:
- [ ] Name field with 2-50 character limit
- [ ] Bio field with 500 character limit and counter
- [ ] Avatar upload supporting JPG/PNG up to 5MB
- [ ] Preview changes before saving
- [ ] Success message on save

**US-002: Edit contact information**
As a user, I want to update my email and phone so that I can be reached.

Acceptance Criteria:
- [ ] Email field with format validation
- [ ] Email change requires verification
- [ ] Phone field with format validation
- [ ] Optional phone number

**US-003: Edit notification preferences**
As a user, I want to control my notification settings.

Acceptance Criteria:
- [ ] Toggle for email notifications
- [ ] Toggle for push notifications
- [ ] Frequency options (immediate, daily digest, weekly)
- [ ] Save preferences immediately on toggle

---

Here's the draft. Did I miss anything? Let me know what to add or change
before I save the task files.
```

**User:** `Looks good, but add a story for privacy settings`

**Claude adds US-004 and saves to `.tasks/`**

---

## Example 2: Bug Fix

**User:** `/interactive-planning fix checkout flow errors`

**Claude asks:**

```
I'll help create tasks for fixing checkout errors. A few questions:

1. What types of errors are occurring?
   A) Payment processing failures
   B) Form validation issues
   C) Session/cart expiration
   D) Multiple of the above

2. How should errors be communicated?
   A) Inline field errors
   B) Toast notifications
   C) Error summary at top
   D) Combination approach
```

**User:** `1D, 2D`

**Claude generates tasks for:**

- US-001: Improve payment error handling
- US-002: Fix form validation messages
- US-003: Handle session expiration gracefully
- US-004: Add error tracking/logging

---

## Example 3: Editing Existing Tasks

**User:** `/interactive-planning FEAT-20240115_143022-x7k2`

**Claude reads existing task files:**

```
Found existing feature: "Add dark mode toggle to settings"

Current stories:
- US-001: Add theme toggle UI [todo]
- US-002: Implement theme switching logic [todo]
- US-003: Persist theme preference [todo]

What would you like to do?
A) Add new stories
B) Modify existing stories
C) Review and refine acceptance criteria
D) Start over with new requirements
```
