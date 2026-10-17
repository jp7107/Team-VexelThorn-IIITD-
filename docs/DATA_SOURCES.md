# Data sources

Training data for the disease model is documented in [`ml/DATA_SOURCES.md`](../ml/DATA_SOURCES.md).

## Mandi prices (MKT-01)

| Item | Value |
|---|---|
| Dataset | "Current Daily Price of Various Commodities from Various Markets (Mandi)", Open Government Data Platform India, from AGMARKNET (Department of Agriculture and Farmers Welfare) |
| API | `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=…&format=json&filters[commodity]=Tomato` |
| Key | Required. Without one the API answers `{"error": "Authorization field missing"}` (checked 2026-10-17). Get a free key by registering on data.gov.in, then set `DATAGOV_API_KEY` in `backend/.env`. |
| Status | Resource ID confirmed from independent sources, including a peer-reviewed pilot that retrieved ~13,000 records/day in Aug 2026. **Not yet checked against a live response from this app**: do that once a key is set (see below). |
| Licence | To verify on the dataset page (it returned 503 when checked). OGD India datasets are normally published under the Government Open Data License – India. |
| Unit | Rs per quintal (AGMARKNET convention) |
| Fields used | state, district, market, commodity, variety, arrival_date, min_price, max_price, modal_price. The parser also accepts the `Arrival_Date` / `Min_x0020_Price` spellings seen in AGMARKNET exports, and drops rows with missing or invalid fields instead of guessing. |

### How the app uses it

- Fetches one all-India page per commodity at most every 6 hours, stores it in `market_prices`, and filters by state/district locally.
- If the fetch fails, it serves the stored rows (`source_status: cached`).
- With no key or no stored rows, it serves the seeded demo rows (`is_demo: true`, source "KisanSetu demo data"). The UI labels these "DEMO DATA: not real prices".
- Prices more than 7 days old are flagged "may be outdated". Prices are never estimated or interpolated.

### Checklist once a key is set

1. Put the key in `backend/.env` as `DATAGOV_API_KEY=…` and restart the backend.
2. Open Mandi prices → Tomato. The banner should say "Live from data.gov.in (AGMARKNET)" and rows should carry no DEMO badge.
3. Check that dates and prices look right against agmarknet.gov.in for one market. If the field names differ, adjust `parse_records` in `backend/app/routers/prices.py`.
