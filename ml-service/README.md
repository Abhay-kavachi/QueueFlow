# QueueFlow ML Service
This service calculates wait-time projections using Linear Regression.

### Professional Data Engineering Structure:
- `data/raw`: untouched historical sql dumps (if exported)
- `data/processed`: cleaned CSVs ready for external models
- `notebooks/`: Jupyter notebooks used exclusively for exploration
- `src/`: The core logic separating loading, training, forecasting.
- `config/`: Centralized parameters replacing hardcoded variables in the source code.
