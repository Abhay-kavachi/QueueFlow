import os
import matplotlib.pyplot as plt
import io
from flask import Flask, send_file
from datetime import datetime

from src.predict import generate_wait_time_prediction_plot
from src.data_loader import get_service_statistics, MOCK_MODE

app = Flask(__name__)

@app.route('/api/analytics/wait-times-graph/<int:service_id>')
def wait_times_graph(service_id):
    """Serve wait time analysis graph"""
    try:
        img_buffer = generate_wait_time_prediction_plot(service_id)
        return send_file(img_buffer, mimetype='image/png', as_attachment=False)
    except Exception as e:
        print(f"Error generating graph: {e}")
        # Return error image
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.text(0.5, 0.5, f'Error: {str(e)}', ha='center', va='center', transform=ax.transAxes)
        ax.set_title('Analysis Error')
        
        img_buffer = io.BytesIO()
        plt.savefig(img_buffer, format='png')
        img_buffer.seek(0)
        plt.close()
        
        return send_file(img_buffer, mimetype='image/png')

@app.route('/api/analytics/statistics/<int:service_id>')
def service_statistics(service_id):
    """Get service statistics"""
    stats = get_service_statistics(service_id)
    if 'error' in stats:
        return stats, 500 if 'Database connection failed' not in stats.get('error','') else 503
    return stats

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return {
        'status': 'healthy', 
        'timestamp': datetime.now().isoformat(),
        'mock_mode': MOCK_MODE
    }

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)