# Personal Finance Narrative Visualization

## Overview

This is a narrative visualization built with D3.js that tells a focused story about how steady income can mask underlying volatility in a checking account balance, how one-off shocks (like a travel expense) erode that balance, and how deliberate choices—like consistent savings or smoothing large expenses—can change outcomes. It uses a **Martini Glass** structure: the problem is presented first, reinforced with a concise summary, and only after that does the user get to explore and experiment with what-if scenarios.

Live version: **[PUT YOUR GITHUB.IO URL HERE]**

## Project Structure

- `index.html` — Main page orchestrating the four scenes: problem, summary/closure, exploration, and what-if scenarios. Includes the breadcrumb and the “unlock” flow.
- `style.css` — Styling for charts, overlay, breadcrumb, and UI controls.
- `script.js` — Core logic: data loading, series computation, rendering of charts, annotation system, state management (parameters), and user interaction wiring.
- `personal_finance_transactions.csv` — Synthetic financial transactions data driving the visuals.
- `.nojekyll` — (Optional) Prevents GitHub Pages from ignoring files/folders that start with underscores or other special rules.

## How to Use / Navigate

1. **Scene 1: The Problem**  
   You’re shown the checking account balance over time and actual vs. projected savings. The key shock (a travel expense in April) is annotated, and the baseline savings behavior is contrasted with a hypothetical consistent savings rate.

2. **Scene 1.5: Summary / Key Takeaway**  
   A brief, distilled restatement of the insight. Click **“Continue to Exploration”** to unlock the deeper interactive parts.

3. **Scene 2: Exploration**  
   After unlocking, pick a month from the dropdown (months with no meaningful negative spending are filtered out) to see a category-level breakdown of spending that contributed to balance erosion.

4. **Scene 3: What-if Scenarios**  
   Test alternate futures via preset buttons: raise/lower the savings rate, remove the travel expense, or split it across months. The visualization updates to reflect how those choices would have affected balances and savings trajectories.

5. **Controls / Interactivity**  
   - **Savings Rate Slider:** Adjust the hypothetical savings rate; projected cumulative savings updates instantly.  
   - **Toggle Travel Expense:** Show/hide the April travel dip.  
   - **Preset Buttons:** Apply compound scenarios (aggressive/conservative saver, remove travel, split travel).  
   - **Reset Button:** Return all parameters to the narrative baseline.  
   - **Breadcrumb:** Shows current position (Problem → Summary → Exploration → What-if); clickable for navigation.  
   - **Unlock Overlay:** Ensures the user sees the story before exploration.

## Data & Assumptions

- The dataset is synthetic transaction data stored in `personal_finance_transactions.csv`. It contains account entries (e.g., “Checking”, “Savings”), categories (including a “Travel” expense on April 15), amounts (positive for credit, negative for debit), and dates.
- **Projected savings** is computed by assuming a fixed savings rate (percentage of a monthly income of $4,500) applied consistently from January 2024. Cumulative projected savings are built month by month.
- The visualization contrasts these projections with the *actual* savings behavior reflected in the data.
- The **travel expense** is treated specially: it creates a visible dip in the checking balance. There’s logic to remove it, split it, or include it with lenient matching to avoid timezone mismatches.

## Narrative Design

The project uses a **Martini Glass** structure:
- **Story first:** Scene 1 surfaces the problem; Scene 1.5 closes that story with a takeaway.
- **Exploration second:** Only after the summary are the interactive diagnosis (Scene 2) and what-if simulations (Scene 3) unlocked, giving the user agency to test and dive deeper.

Breadcrumbs and transition cues reinforce the intended flow.

## Parameters / State

Key state variables driving the visualization:
- `savingsRate`: Controls projected savings pace.  
- `travelIncluded`: Whether the April travel expense is present.  
- `splitTravel`: Replaces the single travel hit with two smaller ones to smooth the effect.  
- `Selected Month`: Drives which month's spending breakdown is shown in Scene 2.

These parameters are manipulated via UI controls and determine which data series are drawn or altered.

## Annotations

Annotations are visually consistent callouts (boxed titles + subtitles) used to highlight:
- The travel expense dip in Scene 1.  
- Scenario descriptions in Scene 3 (dynamic text explaining the current preset).  

Annotations adapt when the user changes state—e.g., if travel is split or removed, the messaging reflects the new effect.

## Technical Notes

- The balance and savings charts are rendered with D3.js v7.  
- Date matching for the travel expense uses a lenient function to reconcile local vs. UTC representation of the same day, avoiding false mismatches.  
- Scenes 2 and 3 start visually locked (dimmed/blurred) until the user clicks through the summary, enhancing the martini glass flow.

## Running Locally

To test locally (if you choose to clone instead of relying on the GitHub Pages live site), serve the directory with any static server. Examples:

```bash
# Python 3
python -m http.server 8000
# Then open http://localhost:8000 in your browser
