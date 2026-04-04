# Integration Report — CashPulse

**Date:** 2026-04-05  
**Scope:** Frontend ↔ Backend compatibility audit and fix

---

## 1. Found Issues & Fixes

### 1.1 JSON Serialization — Missing camelCase Policy (CRITICAL)

**File:** `src/CashPulse.Api/Program.cs`

**Problem:**  
`ConfigureHttpJsonOptions` was registering `JsonStringEnumConverter` without a naming policy, and critically **missing `PropertyNamingPolicy = JsonNamingPolicy.CamelCase`**. Without this, all C# PascalCase properties (`AccountId`, `IsConfirmed`, etc.) would serialize to PascalCase JSON, breaking all frontend consumers that expect camelCase.

**Fix:**
```csharp
// Before
options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());

// After
options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
options.SerializerOptions.Converters.Add(
    new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
```

---

### 1.2 ForecastEndpoints — Wrong Response Shape (CRITICAL)

**File:** `src/CashPulse.Api/Endpoints/ForecastEndpoints.cs`

**Problem:**  
The endpoint returned the raw `ForecastResult` domain object with fields:
- `accountTimelines` — list of `AccountTimeline` objects (not a dict)
- `netWorthTimeline` — wrong field name (frontend expects `netWorth`)
- `monthlyBreakdowns` — wrong field name (frontend expects `monthlyBreakdown`)
- `tagSummaries` — not expected by frontend `ForecastResponse`
- `calculatedAt` — not in frontend type
- `MonthlyBreakdown.Year` + `.Month` (ints) — frontend expects `month: "2026-05"` string
- `AccountTimeline[]` — frontend expects `Record<string, TimelinePoint[]>` keyed by currency

**Fix:**  
Added `MapToForecastResponse()` method and DTO records:
- Groups `AccountTimelines` by currency into `Dictionary<string, List<TimelinePointDto>>`
- Merges balance points across accounts within same currency by date
- Maps `NetWorthTimeline` → `netWorth` with date as ISO string
- Maps `MonthlyBreakdowns` → `monthlyBreakdown` with `month: "YYYY-MM"` format
- Maps alert severity enum to lowercase string
- Added DTOs: `ForecastResponseDto`, `TimelinePointDto`, `NetWorthPointDto`, `ForecastAlertDto`, `MonthlyBreakdownDto`

---

### 1.3 Scenario Toggle — Wrong HTTP Method & Signature (HIGH)

**File:** `cashpulse-web/src/api/scenarios.ts`

**Problem:**  
Frontend called `PATCH /api/scenarios/{id}` with `{ isActive }` body.  
Backend registers `PUT /api/scenarios/{id}/toggle` (no body, server-side toggle).

**Fix:**
```typescript
// Before
export const toggleScenario = (id: number, isActive: boolean) =>
  apiClient.patch<Scenario>(`/api/scenarios/${id}`, { isActive });

// After
export const toggleScenario = (id: number) =>
  apiClient.put<Scenario>(`/api/scenarios/${id}/toggle`, {});
```

**Cascading fix:**  
`ScenarioDetail.tsx` and `Scenarios.tsx` — removed unused `active: boolean` parameter from `handleToggle`.

---

### 1.4 Exchange Rate Update — Wrong HTTP Method (HIGH)

**File:** `cashpulse-web/src/api/exchangeRates.ts`

**Problem:**  
Frontend used `PATCH /api/exchange-rates`. Backend registers `PUT /api/exchange-rates`.

**Fix:** Changed `apiClient.patch` → `apiClient.put`.

---

### 1.5 Exchange Rate Refresh — Wrong Return Type (MEDIUM)

**File:** `cashpulse-web/src/api/exchangeRates.ts`

**Problem:**  
Frontend typed `refreshExchangeRates` as returning `ExchangeRate[]`.  
Backend returns `{ message: string, rates: ExchangeRate[] }`.

**Fix:**
```typescript
// Before
apiClient.post<ExchangeRate[]>('/api/exchange-rates/refresh')

// After
apiClient.post<{ message: string; rates: ExchangeRate[] }>('/api/exchange-rates/refresh')
```

**Cascading fix:**  
`Settings.tsx` — `setRates(data)` → `setRates(data.rates)`.

---

### 1.6 CSV Import — Wrong Form Field Name (HIGH)

**File:** `cashpulse-web/src/api/import.ts`

**Problem:**  
Frontend appended form field `mapping`. Backend reads `form["columnMapping"]` and throws `ValidationException("columnMapping is required")`.

**Fix:** `formData.append('mapping', ...)` → `formData.append('columnMapping', ...)`.

---

### 1.7 ImportPreviewResponse — Mismatched Shape (MEDIUM)

**File:** `cashpulse-web/src/api/types.ts`

**Problem:**  
Frontend type: `{ headers, rows, totalRows }`.  
Backend returns: `{ fileName, headers, preview, totalPreviewLines }`.

**Fix:**
```typescript
// Before
interface ImportPreviewResponse {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

// After
interface ImportPreviewResponse {
  fileName: string;
  headers: string[];
  preview: string[][];
  totalPreviewLines: number;
}
```

**Cascading fix:**  
`Settings.tsx` — `preview.rows` → `preview.preview` in two places.

---

### 1.8 ImportResultResponse — Missing / Wrong Fields (MEDIUM)

**File:** `cashpulse-web/src/api/types.ts`

**Problem:**  
Frontend expected `{ imported, skipped, errors }`.  
Backend returns `{ imported, errors, message }` — no `skipped` field.

**Fix:**
```typescript
// Before
interface ImportResultResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

// After
interface ImportResultResponse {
  imported: number;
  errors: string[];
  message: string;
}
```

**Cascading fix:**  
`Settings.tsx` — `result.skipped` → hardcoded `0` (backend doesn't track skipped count; tracking skipped is noted as a known limitation).

---

### 1.9 confirmOperation — Wrong Return Type Usage (MEDIUM)

**Files:** `cashpulse-web/src/api/operations.ts`, `AccountDetail.tsx`, `Operations.tsx`, `ScenarioDetail.tsx`

**Problem:**  
Backend `POST /api/operations/{id}/confirm` returns `{ id, isConfirmed: true }` — a partial object.  
Frontend typed it as `PlannedOperation` and passed the result directly to `updateOperation(result)`, causing a TypeScript type mismatch and runtime state corruption (operation in store replaced with partial object).

**Fix:**  
- `operations.ts`: Return type changed to `{ id: number; isConfirmed: boolean }`.
- All three pages: After `await confirmOperation(opId)`, patch the existing operation in store:
  ```typescript
  const existing = store.operations.find((o) => o.id === opId);
  if (existing) store.updateOperation({ ...existing, isConfirmed: true });
  ```

---

### 1.10 updateBalances — Sending Extra Fields (LOW)

**File:** `cashpulse-web/src/api/accounts.ts`

**Problem:**  
`updateBalances` was sending `CurrencyBalance[]` which contains `accountId` field. Backend `BalanceUpdateItem` record only has `Currency` and `Amount`; extra fields are ignored by model binder but it's semantically incorrect and wastes bandwidth.

**Fix:** Map to `{ currency, amount }` before sending.

---

### 1.11 Account Type — Missing createdAt/updatedAt (LOW)

**File:** `cashpulse-web/src/api/types.ts`

**Problem:**  
`Account` C# model has `CreatedAt` and `UpdatedAt` fields that are serialized to JSON, but the TypeScript `Account` interface was missing them.

**Fix:** Added `createdAt: string` and `updatedAt: string` to the `Account` interface.

---

## 2. Verified — No Issues Found

| Item | Status |
|------|--------|
| CORS origins (`https://max31000.github.io`, `http://localhost:5173`) | ✅ Correct |
| No `AllowCredentials()` without `WithOrigins` | ✅ Correct |
| Dockerfile `EXPOSE 5000` | ✅ Present |
| Dockerfile `ENV ASPNETCORE_URLS=http://+:5000` | ✅ Present |
| Dockerfile layer order (`.csproj` first, then source) | ✅ Optimal |
| SQL schema — all tables present | ✅ Complete |
| SQL seed data — dev user + system categories | ✅ Correct |
| SQL syntax | ✅ No errors |
| `/api/accounts` URL | ✅ Matches |
| `/api/operations` URL | ✅ Matches |
| `/api/categories` URL | ✅ Matches |
| `/api/scenarios` URL | ✅ Matches |
| `/api/forecast` URL | ✅ Matches |
| `/api/tags/summary` URL | ✅ Matches |
| `/api/exchange-rates` URL | ✅ Matches |
| `/api/import/csv` and `/api/import/csv/preview` URLs | ✅ Matches |
| `RecurrenceRule` fields | ✅ Compatible |
| `PlannedOperation` fields | ✅ Compatible |
| `Category` fields | ✅ Compatible |
| `Scenario` fields | ✅ Compatible |
| `TagSummary` fields | ✅ Compatible |
| `NetWorthPoint` fields | ✅ Compatible (after DTO mapping) |

---

## 3. Build Results

### dotnet build
```
CashPulse.Core     → bin/Debug/net8.0/CashPulse.Core.dll
CashPulse.Tests    → bin/Debug/net8.0/CashPulse.Tests.dll
CashPulse.Infrastructure → bin/Debug/net8.0/CashPulse.Infrastructure.dll
CashPulse.Api      → bin/Debug/net8.0/CashPulse.Api.dll

Сборка успешно завершена.
  Предупреждений: 0
  Ошибок: 0
```

### dotnet test
```
Passed!  — failed 0, passed 23, skipped 0, total 23 (136 ms)
```

### npm run build (frontend)
```
✓ 1425 modules transformed
dist/index.html           0.90 kB
dist/assets/index.css   230.89 kB
dist/assets/index.js  1,007.12 kB
✓ built in 321ms
```
TypeScript: 0 errors, 0 warnings.

---

## 4. Known Limitations (MVP)

1. **Import `skipped` count not tracked** — The backend processes rows and counts `imported` and `errors`, but does not separately count skipped/invalid rows. Frontend now shows `0` for skipped. A future improvement would be to return a `skipped` count from the import endpoint.

2. **Forecast timeline merges across accounts** — The DTO mapping groups `AccountTimeline` entries by currency and sums balances by date. This means a user with two RUB accounts will see a merged RUB timeline rather than per-account timelines. If per-account charting is needed, the `ForecastResponseDto` shape must be extended.

3. **`MonthlyBreakdown.ByCategory` with null key** — Categories with `null` ID (uncategorized operations) are excluded from the `byCategory` dictionary in the response DTO (`Where(kv => kv.Key.HasValue)`). Uncategorized totals are still included in `income`/`expense` totals.

4. **No authentication** — MVP uses `DevUserMiddleware` (hardcoded `UserId = 1`). All endpoints are unprotected.

5. **Chunk size warning** — Frontend JS bundle is ~1 MB. This is a performance concern but not a build error. Code-splitting by route would reduce initial load time.

6. **DateOnly serialization** — .NET 8 supports `DateOnly` natively in JSON, but only when `JsonSerializerOptions` are properly configured. The current setup relies on default `DateOnly` handling; if issues arise with specific clients, a custom `JsonConverter<DateOnly>` may be needed.
