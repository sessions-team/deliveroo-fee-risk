# Q4 2026 Commission — NEW sites (launched after Q3)

**Source:** Email from Liam Gillanders (Deliveroo) → Ellie Wilson, Mon 5 Oct 2026 10:01, subj "Q4 Forward Commission" (forwarded to Tristan; transcribed 2026-10-06).
**Applies to:** sites that launched *after* the start of Q4 2026 (i.e. no preceding-quarter performance data, so a standard Ops adjustment is applied). Existing-estate sites are on their individually-banded rates in the Q4 Commission Output (`data/raw/commission-output/Q4_existing-sites_commission_output_2026-10-05.csv`). The email calls that attachment "Q3 sites for your existing estate" — a slip; the attachment is the Q4 output dated 2026-10-05.

Per the email, these are the Q4 2026 rates for new sites "based on the new contract that went into effect Jan 1st":

| Bracket | JBP Reduction | w/ Ops adjustment (final Q4 rate) | Contract Headline | Implied total adj. |
|---|---|---|---|---|
| < £12.00 | −0.50% | **31.09%** | 32.59% | −1.50% |
| £12.00 – £14.00 | −0.50% | **30.09%** | 31.59% | −1.50% |
| £14.00 – £16.00 | −0.50% | **28.50%** | 30.00% | −1.50% |
| £16.00 – £18.00 | −0.50% | **27.28%** | 28.78% | −1.50% |
| £18.00 – £20.00 | −0.50% | **26.32%** | 27.82% | −1.50% |
| £20.00 – £22.00 | −0.50% | **25.54%** | 27.04% | −1.50% |
| £22.00 – £24.00 | −0.50% | **24.90%** | 26.40% | −1.50% |
| £24.00 – £26.00 | −0.50% | **24.36%** | 25.86% | −1.50% |
| £26.00 + | −0.50% | **24.12%** | 25.62% | −1.50% |

## Reconciliation vs contract

Every bracket = **Contract Headline − 1.50%**, where the 1.50% = JBP/Marketer Ads reduction (−0.50%) + a standard Ops adjustment (−1.00%).

✅ **All 9 brackets reconcile exactly** to the contract Headline Commission Rate table (the banded rates that apply when the Price Competitiveness Condition is met). The −1.00% Ops adjustment for new sites sits well within the contract's allowed adjustment ranges (RWT −2.00%→+0.80%, Missing Items −2.40%→+1.60%, Open Hours −1.20%→0.00%).

**Note:** the brackets here are stated as £12–14, £14–16 etc. (rounded), vs the contract's £12–13.99, £14–15.99. Same bands, just notation.

**Q4 vs Q3 vs Q2:** the new-site rate card is **identical to Q2 and Q3 2026** — same nine final rates, same −1.50% total adjustment. New sites get the standard −1.00% Ops + −0.50% JBP regardless of quarter (they have no preceding-quarter performance to band on). `NEW_CARD_ADJ = -1.50` in `scripts/build_q4_views.js` is therefore confirmed.
