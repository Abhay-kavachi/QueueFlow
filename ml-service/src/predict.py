import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import io
from datetime import datetime, timedelta

from .data_loader import fetch_wait_time_data, load_config, MOCK_MODE
from .train import train_model
from .evaluate import evaluate_model

config = load_config()

def generate_wait_time_prediction_plot(service_id):
    """Generate wait time prediction visualization"""
    df = fetch_wait_time_data(service_id)
    
    if df.empty or len(df) < 2:
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.text(0.5, 0.5, 'Insufficient data for analysis\n(Add more completed records or enable MOCK_MODE)', 
                ha='center', va='center', transform=ax.transAxes, fontsize=14)
        ax.set_title(f'Wait Time Analysis - Service {service_id}')
        plt.tight_layout()
    else:
        df['date_ordinal'] = pd.to_datetime(df['date']).map(datetime.toordinal)
        X = df['date_ordinal'].values.reshape(-1, 1)
        y = df['avg_wait_time'].values
        
        # Train model
        model = train_model(X, y)
        metrics = evaluate_model(model, X, y)
        print(f"Model trained with R2 Score: {metrics.get('r2_score', 0):.2f}")
        
        # Generate predictions
        last_date = pd.to_datetime(df['date'].max())
        periods = config['model']['prediction_periods']
        future_dates = pd.date_range(start=last_date + timedelta(days=1), periods=periods, freq='D')
        future_ordinals = future_dates.map(datetime.toordinal).values.reshape(-1, 1)
        future_predictions = model.predict(future_ordinals)
        
        # Create visualization
        fig, ax = plt.subplots(figsize=(12, 6))
        
        ax.plot(pd.to_datetime(df['date']), df['avg_wait_time'], 'bo-', label='Actual Wait Times', linewidth=2)
        
        trend_x = pd.to_datetime(df['date_ordinal'].apply(datetime.fromordinal))
        ax.plot(trend_x, model.predict(X), 'r--', alpha=0.7, label='Trend Line')
        
        ax.plot(future_dates, future_predictions, 'go--', label='Predicted Wait Times', linewidth=2)
        
        ax.set_xlabel('Date')
        ax.set_ylabel('Average Wait Time (minutes)')
        ax.set_title(f'Wait Time Analysis and Prediction - Service {service_id} {"(MOCK DATA)" if MOCK_MODE else ""}')
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=45)
        plt.tight_layout()
    
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', dpi=300, bbox_inches='tight')
    img_buffer.seek(0)
    plt.close()
    
    return img_buffer
