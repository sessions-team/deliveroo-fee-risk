# Contracted Rates — Deliveroo Core Service Pack (2025 Renewal)

**Source:** `Sessions - Core Service Pack - (2025 Renewal).pdf`
**Parties:** Roofoods Ltd ("Deliveroo") & Sessions Accelerator Limited ("Partner")
**Commencement Date:** 1 January 2026
**Term:** 24 months (Initial Term) → auto-extends in 12-month Extension Terms
**Territory:** United Kingdom
**Permitted order types:** Delivery Orders and Pick-up Orders

> This file is the **source of truth** for what we *should* be charged. The comparison in `04_analysis` checks actual charges against the rates below.

---

## 1. Core Services Fee (Delivery Orders) — the headline commission

The fee charged on Delivery Orders is the **Adjusted Core Services Rate**, applied to **GMV** (gross merchandise value of Menu Items, *inclusive of VAT*), per calendar week, **calculated individually per Site**.

```
Adjusted Core Services Rate = Headline Commission Rate + Commission Adjustments
```

### 1a. Headline Commission Rate — banded by order value

Applies **only if the Price Competitiveness Condition was met** in the preceding Quarter. The rate is tiered by the £ value of each individual Delivery Order:

| £ Value of Delivery Order | Headline Commission Rate |
|---|---|
| £0 – £11.99 | **32.59%** |
| £12 – £13.99 | **31.59%** |
| £14 – £15.99 | **30.00%** |
| £16 – £17.99 | **28.78%** |
| £18 – £19.99 | **27.82%** |
| £20 – £21.99 | **27.04%** |
| £22 – £23.99 | **26.40%** |
| £24 – £25.99 | **25.86%** |
| £26+ | **25.62%** |

**If the Price Competitiveness Condition was NOT met** in the preceding Quarter → flat **30%**.

**Following expiry of the Initial Term** → flat **30%**.

> **Price Competitiveness Condition:** the price of each Menu Item on the Platform must not have exceeded the price for the same item offered in-store / on our own e-commerce at any point in the Quarter. We must send Deliveroo supporting evidence ≥2 Business Days before quarter-end. Deliveroo verifies and decides at its sole discretion.

### 1b. Commission Adjustments (PfP Incentives)

Calculated per Site, per Quarter, from the **preceding** Quarter's metrics. Negative = discount (rate goes down); positive = penalty (rate goes up). These are added to the Headline Rate.

**(i) Rider Wait Time Past Target** — % of Delivery Orders where Rider Held Time > 5 min:

| Band | Adjustment |
|---|---|
| <3% | −2.00% |
| 3–3.99% | −1.80% |
| 4–4.99% | −1.60% |
| 5–5.99% | −1.40% |
| 6–6.99% | −1.20% |
| 7–7.99% | −1.00% |
| 8–8.99% | −0.80% |
| 9–9.99% | −0.60% |
| 10–10.99% | −0.40% |
| 11–11.99% | −0.20% |
| 12–12.99% | 0.00% |
| 13–13.99% | +0.20% |
| 14–14.99% | +0.40% |
| 15–15.99% | +0.60% |
| >16% | +0.80% |

**(ii) Missing Items** — % of Orders with at least one missing-item claim:

| Band | Adjustment |
|---|---|
| <1% | −2.40% |
| 1–1.24% | −2.20% |
| 1.25–1.49% | −2.00% |
| 1.5–1.74% | −1.80% |
| 1.75–1.99% | −1.60% |
| 2–2.24% | −1.40% |
| 2.25–2.49% | −1.20% |
| 2.5–2.74% | −1.00% |
| 2.75–2.99% | −0.80% |
| 3–3.24% | −0.60% |
| 3.25–3.49% | −0.40% |
| 3.5–3.74% | −0.20% |
| 3.75–3.99% | 0.00% |
| 4–4.24% | +0.20% |
| 4.25–4.49% | +0.40% |
| 4.5–4.74% | +0.60% |
| 4.75–4.99% | +0.80% |
| 5–5.24% | +1.00% |
| 5.25–5.49% | +1.20% |
| 5.5–5.74% | +1.40% |
| >5.75% | +1.60% |

**(iii) Open Hours at Peak** — Actual Site Open Hours at Peak (Peak = 17:00–20:59):

| Band | Adjustment |
|---|---|
| >99% | −1.20% |
| >98% | −1.00% |
| >96% | −0.80% |
| >94% | −0.60% |
| >92% | −0.40% |
| >90% | −0.20% |
| >88% | 0.00% |
| >86% | 0.00% |
| >84% | 0.00% |
| >82% | 0.00% |
| >80% | 0.00% |

**(iv) Marketer Ads Condition** — **−0.5%** reduction in Core Services Fee for as long as Partner invests ≥1% of the preceding 6 months' Total GMV into Deliveroo's Marketer Ads tool (6-month windows: 1 Jan–30 Jun and 1 Jul–31 Dec). Fail it → Deliveroo can claw back the shortfall and remove the 0.5%.

---

## 2. Pick-up Services Fee

Flat **10%** of GMV ordered per calendar week as Pick-up Orders (plus VAT).

---

## 3. Other charges / commercial terms

- **Joining Fee:** £100 per Site (set off against Partner Payment).
- **VAT:** all Services Fees are plus VAT at prevailing rate.
- **Transition Period:** first 10 Business Days from Commencement Date — old agreement's fee basis still applies.
- **Breach of Exclusivity (para 4):** NB exclusivity (para 4) does **not** apply to Core/Pick-up Services here.
- **Confidentiality breach (para 14.4):** Deliveroo may raise Core Services Fee to flat 30%.

---

## 4. How the rate moves through time (important for the audit)

- The Adjusted Core Services Rate is **set quarterly** and is effective from the **10th Business Day after** the preceding quarter ends to the **9th Business Day after** the current quarter ends.
- **Quarters:** Q1 = 1 Jan 2026 – 31 Mar 2026, then each successive 3-month period.
- Deliveroo issues a **Commission Adjustment Statement** each quarter showing the calculation.
- Fees are reconciled **weekly** (Calculation Day), per Site; statement = Menu Items Amount − Services Fees = Partner Payment.

---

## 5. What we need to verify in the audit

For each Site / menu / week, check that the rate Deliveroo actually deducted equals:

1. The correct **banded Headline Rate** for each order's value (or flat 30% if Price Competitiveness Condition not met / post-Initial-Term), **plus**
2. The correct **Commission Adjustments** for that quarter (Rider wait, Missing items, Open hours at peak, Marketer Ads −0.5%),
3. Applied to the correct **GMV (inc. VAT)** base,
4. Pick-up orders charged at **10%**,
5. No unexpected extra deductions.

**Open questions to confirm against Deliveroo's Commission Adjustment Statements:**
- Was the Price Competitiveness Condition deemed met each quarter? (Determines banded vs flat 30%.)
- What Commission Adjustment values did Deliveroo apply per Site per quarter?
- Are we claiming the Marketer Ads −0.5%?
