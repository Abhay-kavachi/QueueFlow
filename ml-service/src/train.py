from sklearn.linear_model import LinearRegression

def train_model(X, y):
    """Train a linear regression model"""
    model = LinearRegression()
    model.fit(X, y)
    return model
