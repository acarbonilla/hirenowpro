# Dynamic Scoring System - HR Configuration Guide

## Overview

The passing score threshold is now **dynamically configurable** by HR staff instead of being hardcoded. This allows HR to adjust scoring criteria based on hiring needs without requiring code changes.

---

## 🎯 What Can Be Configured

### Scoring Thresholds

- **Passing Score Threshold** (default: 70%)
  - Minimum score required for automatic "hire" recommendation
  - Scores at or above this = PASSED
- **Review Score Threshold** (default: 50%)
  - Minimum score for HR review queue
  - Scores between this and passing threshold = NEEDS REVIEW
  - Scores below this = REJECTED

### Example Scenarios

**Scenario 1: Need more candidates (lower standards)**

- Passing: 65%
- Review: 45%

**Scenario 2: High demand period (stricter standards)**

- Passing: 75%
- Review: 55%

**Scenario 3: Default balanced approach**

- Passing: 70%
- Review: 50%

---

## 🔧 How to Configure (3 Methods)

### Method 1: Django Admin (Easiest)

1. **Login to Django Admin:**

   - Navigate to: `http://localhost:8000/admin/`
   - Or production: `https://yourdomain.com/admin/`
   - Login with HR/Admin credentials

2. **Navigate to Settings:**

   - Look for "RESULTS" section in admin
   - Click on "System Settings"

3. **Edit Settings:**

   - Click on the single settings entry (only one exists)
   - Modify fields:
     - **Passing score threshold**: Enter value (e.g., 70.00)
     - **Review score threshold**: Enter value (e.g., 50.00)
   - Add your name in "Modified by" if desired
   - Click "Save"

4. **Changes Take Effect Immediately:**
   - New interviews will use the updated thresholds
   - Existing results keep their original pass/fail status

---

### Method 2: API Endpoint (Programmatic)

**Get Current Settings:**

```bash
curl -H "Authorization: Bearer <your_token>" \
  http://localhost:8000/api/settings/
```

**Response:**

```json
{
  "passing_score_threshold": "70.00",
  "review_score_threshold": "50.00",
  "max_concurrent_interviews": 100,
  "interview_expiry_days": 7,
  "enable_script_detection": true,
  "enable_sentiment_analysis": true,
  "last_modified": "2024-12-09T10:30:00Z",
  "modified_by": "Jane Smith"
}
```

**Update Settings:**

```bash
curl -X PUT \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "passing_score_threshold": 65.00,
    "review_score_threshold": 45.00
  }' \
  http://localhost:8000/api/settings/1/
```

**Permissions Required:**

- User must be `is_staff=True` or `is_superuser=True`
- Regular users get 403 Forbidden

---

### Method 3: Frontend UI (Coming Soon)

A dedicated settings page will be available in the HR dashboard:

**Planned Path:** `/hr-dashboard/settings`

**Features:**

- Visual sliders for score thresholds
- Real-time preview of score ranges
- Validation (passing > review)
- Change history log
- Quick presets for common scenarios

---

## 📊 How It Works

### Code Implementation

**Before (Hardcoded):**

```python
passed = avg_score >= 75.0  # Fixed value
```

**After (Dynamic):**

```python
from results.models import SystemSettings
passing_threshold = SystemSettings.get_passing_threshold()
passed = avg_score >= passing_threshold  # Uses DB value
```

### Affected Components

1. **Interview Submit Processing** (`interviews/views.py`)

   - Determines if applicant passed based on dynamic threshold
   - Updates applicant status (passed/in_review/failed)

2. **Results Serializer** (`results/serializers.py`)

   - Generates recommendations (hire/review/reject)
   - Uses dynamic thresholds for classification

3. **HR Review Queue** (`results/views.py`)
   - Filters results needing HR review
   - Dynamically adjusts based on current thresholds

### Caching

- Settings are cached for 1 hour to reduce database queries
- Cache is automatically cleared when settings are updated
- High-performance: minimal impact on response times

---

## 🎨 Score Classification Logic

```
Score Range          | Status        | Applicant Status | HR Action
---------------------|---------------|------------------|------------------
>= Passing Threshold | PASSED        | passed           | Can proceed to hire
Review - Passing     | NEEDS REVIEW  | in_review        | Manual HR review
< Review Threshold   | FAILED        | failed           | Rejected
```

**With Default Settings (Passing=70, Review=50):**

- **85%** → ✅ Hire (passed)
- **65%** → ⚠️ Review (in_review)
- **40%** → ❌ Reject (failed)

**After Changing to (Passing=65, Review=45):**

- **85%** → ✅ Hire (passed)
- **65%** → ✅ Hire (passed) ← Now passes!
- **40%** → ❌ Reject (failed)

---

## 🔒 Security & Validation

### Permissions

- Only `staff` or `superuser` can modify settings
- Regular users can only view settings
- All changes are logged with modifier name and timestamp

### Validation Rules

1. **Passing threshold must be > Review threshold**

   - Prevents invalid configurations
   - Returns error if validation fails

2. **Values must be between 0-100**

   - Enforced at database level
   - Decimal precision up to 2 places (e.g., 75.50)

3. **Singleton Pattern**
   - Only one settings instance can exist
   - Updates modify existing record instead of creating new ones

---

## 📝 Common Use Cases

### Use Case 1: Seasonal Hiring (Lower Standards)

**Scenario:** Holiday season, need to hire quickly

**Action:**

```
Passing: 70% → 65%
Review: 50% → 45%
```

**Result:** More candidates automatically pass, fewer need manual review

---

### Use Case 2: Competitive Market (Higher Standards)

**Scenario:** Many qualified applicants, can be selective

**Action:**

```
Passing: 70% → 75%
Review: 50% → 60%
```

**Result:** Only top candidates pass, more go to review queue

---

### Use Case 3: Emergency Adjustments

**Scenario:** AI scoring is too harsh, good candidates failing

**Action:**

```
Passing: 70% → 65%  (temporary)
```

**Later:** Review AI prompts and adjust back once fixed

---

## 🚀 Testing Your Changes

### 1. Check Current Settings

```bash
curl http://localhost:8000/api/settings/
```

### 2. Submit Test Interview

- Create test interview with known score (e.g., 68%)
- Submit interview
- Check if classification changed based on new threshold

### 3. Verify HR Dashboard

- Open HR review queue
- Confirm correct interviews appear based on new thresholds

---

## 📊 Monitoring & History

### View Change History

In Django Admin:

- Each settings record shows "Last Modified" timestamp
- "Modified By" field shows who made the change
- System logs can track all changes over time

### Recommended Tracking

- Document why thresholds were changed
- Note the date range when special thresholds were active
- Review impact on pass rates periodically

---

## 🎯 Best Practices

1. **Don't Change Too Frequently**

   - Frequent changes make data inconsistent
   - Set thresholds and stick with them for at least a hiring cycle

2. **Communicate Changes**

   - Inform HR team when thresholds change
   - Document the reason for the change

3. **Review Impact**

   - After changing, monitor pass/fail rates
   - Adjust again if needed after seeing results

4. **Test First**

   - Use test interviews to verify new thresholds
   - Ensure HR review queue shows correct results

5. **Keep Review Threshold Reasonable**
   - Too low (e.g., 20%): Review queue gets cluttered
   - Too high (e.g., 70%): Most candidates need manual review
   - Sweet spot: 45-55%

---

## 📁 Files Modified

- ✅ `results/models.py` - SystemSettings model
- ✅ `results/admin.py` - Admin interface
- ✅ `results/settings_serializers.py` - API serializer
- ✅ `results/views.py` - API endpoint
- ✅ `results/urls.py` - URL routing
- ✅ `interviews/views.py` - Uses dynamic threshold
- ✅ `results/serializers.py` - Uses dynamic threshold
- ✅ `frontend/lib/api.ts` - API client

---

## 🔄 Migration Applied

Database migration created and applied:

```
results/migrations/0003_systemsettings.py
```

**Initial values:**

- Passing threshold: 70%
- Review threshold: 50%

---

## ❓ FAQ

**Q: Do existing results change when I update thresholds?**
A: No. Existing results keep their original pass/fail status. Only new interviews use the updated thresholds.

**Q: Can I have different thresholds for different positions?**
A: Not yet. Currently one global threshold for all positions. This could be added as a future feature.

**Q: What happens if I set passing = review?**
A: Validation error. Passing threshold must be greater than review threshold.

**Q: Can multiple HR staff change settings?**
A: Yes, but only one person at a time. Last change wins. "Modified by" field tracks who made the last change.

**Q: How do I reset to default values?**
A: Set passing=70, review=50 via admin or API.

---

## 🎉 Summary

✅ **Passing score threshold is now dynamic**
✅ **HR can adjust via Django Admin**
✅ **API endpoint available for programmatic access**
✅ **Changes take effect immediately**
✅ **Secure (staff/admin only)**
✅ **Validated (passing > review)**
✅ **Cached for performance**

**No more hardcoded values!** HR has full control over scoring criteria.
