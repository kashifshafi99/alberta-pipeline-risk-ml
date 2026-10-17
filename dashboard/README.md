# Canadian Pipeline Incidents Dashboard

An interactive React dashboard of the Canada Energy Regulator's incident data for federally regulated pipelines and facilities (2008 to June 2026). It answers the questions a manager would ask first: how many incidents, how serious, when, where, who operated the line, and what caused them.

**[▶ Open the live dashboard](https://kashifshafi99.github.io/alberta-pipeline-risk-ml/)**

![Dashboard preview](preview.png)

## What it does

- **Click any bar to filter everything.** Each chart keeps its own categories visible and dims the rest, so you can see a selection in context. Click again to clear.
- **Filters** for years, province, incident type, operator, cause, activity and severity, with removable filter chips.
- **Shareable views.** Filters are saved in the URL, so "Copy link to this view" sends someone exactly what you are looking at.
- **Severity everywhere.** Every bar splits significant incidents from the rest, and one chart shows how often incidents became significant by activity (construction: 41% vs. 11% during normal operation).
- **Plain-language findings** that update with the filters (peak year, riskiest activity, most common cause).
- **Searchable, sortable incident table** with expandable details and CSV download of the filtered records.
- Light and dark mode, and a phone layout.

## Data handling decisions

- Incidents can list several types and causes, so those are counted once per category they mention (the earlier version only counted the first one).
- Operators the CER lists under more than one legal name (for example NGTL GP Ltd. and NOVA Gas Transmission Ltd.) are combined; the legal name stays in the table.
- 2026 is a partial year and is drawn lighter and footnoted, so it is not read as a drop.
- Land use is missing for most older records, so the chart states how many records it covers.
- The source file was converted to UTF-8 so names like Trans Québec display correctly.

## Run it locally

Requires [Node.js](https://nodejs.org/) 18 or later.

```bash
cd dashboard
npm install
npm run dev
```

Then open http://localhost:5173. Pushing changes to `dashboard/` redeploys the live site through GitHub Actions.

## Built with

React, Vite, Recharts and Papa Parse. Data: [Incidents at CER-Regulated Pipelines and Facilities](https://open.canada.ca/data/en/dataset/fd17f08f-f14d-433f-91df-c90a34e1e9a6) (Open Government Licence – Canada).
