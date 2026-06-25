import os
import psycopg2
import pandas as pd
import numpy as np
from datetime import datetime
import yaml

def load_config():
    with open('config/params.yaml', 'r') as f:
        return yaml.safe_load(f)

config = load_config()
MOCK_MODE = os.getenv('MOCK_MODE', str(config['mock_mode'])).lower() == 'true'

def get_db_connection():
    try:
        return psycopg2.connect(
            host=os.getenv(config['database']['db_host_env'], 'localhost'),
            port=os.getenv(config['database']['db_port_env'], '5432'),
            database=os.getenv(config['database']['db_name_env'], 'queueflow'),
            user=os.getenv(config['database']['db_user_env'], 'postgres'),
            password=os.getenv(config['database']['db_password_env'], 'password')
        )
    except Exception as e:
        print(f"Database connection failed: {e}")
        return None

def fetch_wait_time_data(service_id, days=None):
    if days is None:
        days = config['model']['default_days_history']
        
    if MOCK_MODE:
        dates = pd.date_range(end=datetime.now(), periods=10).date
        return pd.DataFrame({
            'date': dates,
            'avg_wait_time': np.random.randint(15, 45, size=10),
            'total_completed': np.random.randint(5, 50, size=10)
        })

    conn = get_db_connection()
    if not conn:
        return pd.DataFrame()
        
    try:
        query = """
        SELECT 
            DATE(completed_at) as date,
            AVG(actual_wait_duration) as avg_wait_time,
            COUNT(*) as total_completed
        FROM historical_queue_logs 
        WHERE service_id = %s 
        AND completed_at >= CURRENT_DATE - INTERVAL '%s days'
        AND final_status = 'completed'
        GROUP BY DATE(completed_at)
        ORDER BY date
        """
        df = pd.read_sql_query(query, conn, params=[service_id, days])
        return df
    except Exception as e:
        print(f"Error fetching data: {e}")
        return pd.DataFrame()
    finally:
        conn.close()

def get_service_statistics(service_id):
    if MOCK_MODE:
        return {
            'service_id': service_id,
            'is_mock': True,
            'basic_stats': {
                'total_visits': 150,
                'average_wait_time': 24.5,
                'min_wait_time': 5,
                'max_wait_time': 55,
                'completion_rate': 92.5
            },
            'hourly_distribution': [
                {'hour': h, 'visits': np.random.randint(5, 20), 'avg_hourly_wait': np.random.randint(10, 40)}
                for h in range(9, 18)
            ]
        }

    conn = get_db_connection()
    if not conn:
        return {'error': 'Database connection failed'}

    try:
        stats_query = """
        SELECT 
            COUNT(*) as total_visits,
            AVG(actual_wait_duration) as avg_wait_time,
            MIN(actual_wait_duration) as min_wait_time,
            MAX(actual_wait_duration) as max_wait_time,
            COUNT(CASE WHEN final_status = 'completed' THEN 1 END) as completed_visits,
            COUNT(CASE WHEN final_status = 'expired' THEN 1 END) as expired_visits
        FROM historical_queue_logs 
        WHERE service_id = %s
        """
        stats_df = pd.read_sql_query(stats_query, conn, params=[service_id])
        if stats_df.empty or stats_df.iloc[0]['total_visits'] == 0:
            return {
                'service_id': service_id,
                'basic_stats': {
                    'total_visits': 0, 'average_wait_time': 0, 'min_wait_time': 0, 'max_wait_time': 0, 'completion_rate': 0
                },
                'hourly_distribution': []
            }
        stats = stats_df.iloc[0].to_dict()
        
        hourly_query = """
        SELECT 
            EXTRACT(HOUR FROM completed_at) as hour,
            COUNT(*) as visits,
            AVG(actual_wait_duration) as avg_hourly_wait
        FROM historical_queue_logs 
        WHERE service_id = %s AND final_status = 'completed'
        GROUP BY EXTRACT(HOUR FROM completed_at)
        ORDER BY hour
        """
        hourly_df = pd.read_sql_query(hourly_query, conn, params=[service_id])
        
        return {
            'service_id': service_id,
            'basic_stats': {
                'total_visits': int(stats['total_visits']),
                'average_wait_time': float(stats['avg_wait_time']) if stats['avg_wait_time'] else 0,
                'min_wait_time': int(stats['min_wait_time']) if stats['min_wait_time'] else 0,
                'max_wait_time': int(stats['max_wait_time']) if stats['max_wait_time'] else 0,
                'completion_rate': round(
                    (stats['completed_visits'] / stats['total_visits'] * 100) if stats['total_visits'] > 0 else 0, 2
                )
            },
            'hourly_distribution': hourly_df.to_dict('records')
        }
    except Exception as e:
        print(f"Error calculating stats: {e}")
        return {'error': str(e)}
    finally:
        conn.close()
