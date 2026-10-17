# Pipeline Incidents Dashboard

An interactive React dashboard for exploring the Canada Energy Regulator's pipeline incident data: trends over time, incident types, provinces, operators, root causes, contributing factors, released substances, facility types and land use, with filters for year, province, incident type, company, significance and substance.

**[▶ Open the live dashboard](https://kashifshafi99.github.io/alberta-pipeline-risk-ml/)**

![Dashboard preview](preview.png)

## Run it locally

Requires [Node.js](https://nodejs.org/) 18 or later.

```bash
cd dashboard
npm install
npm run dev
```

Then open http://localhost:5173.

## Built with

React, Vite, Recharts and Papa Parse. The data file is in `public/` and comes from [Incidents at CER-Regulated Pipelines and Facilities](https://open.canada.ca/data/en/dataset/fd17f08f-f14d-433f-91df-c90a34e1e9a6) (Open Government Licence – Canada).
