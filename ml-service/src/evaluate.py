from sklearn.metrics import mean_squared_error, r2_score

def evaluate_model(model, X, y):
    """Evaluate model performance"""
    predictions = model.predict(X)
    return {
        'mse': mean_squared_error(y, predictions),
        'r2_score': r2_score(y, predictions)
    }
