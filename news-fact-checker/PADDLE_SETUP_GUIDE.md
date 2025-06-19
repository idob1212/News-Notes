# Paddle Billing Setup Guide for News Notes

This guide walks you through setting up Paddle billing for the News Notes fact-checking extension with free and premium tiers.

## Account Types

- **Free Account**: 5 articles per month
- **Premium Account**: Unlimited articles, $3.99/month

## 1. Paddle Account Setup

### 1.1 Create Paddle Account
1. Go to [Paddle.com](https://paddle.com) and create an account
2. Complete the seller verification process
3. Note your Paddle Vendor ID from the dashboard

### 1.2 Set Up Products and Prices
1. Navigate to Catalog → Products in your Paddle dashboard
2. Create a new product:
   - **Name**: News Notes Premium
   - **Description**: Unlimited fact-checking for news articles
   - **Type**: Subscription
3. Add a price:
   - **Amount**: $3.99
   - **Currency**: USD
   - **Billing Period**: Monthly
   - **Trial Period**: None (optional: add 7-day trial)
4. Note the Product ID and Price ID for configuration

### 1.3 Set Up Payment Links (IMPORTANT)
1. Navigate to Checkout → Payment Links in your Paddle dashboard
2. Create a new payment link:
   - **Name**: News Notes Premium Subscription
   - **Items**: Add your premium product/price created above
   - **Checkout Settings**: 
     - Display mode: Overlay (optional)
     - Theme: Light (optional)
3. **Copy the payment link URL** for configuration
4. **CRITICAL**: Go to Checkout → Settings and set this as your **Default Payment Link**
   - This fixes the "transaction_default_checkout_url_not_set" error

### 1.4 Alternative: Set Default Payment Link in Dashboard
If you encounter the error "A Default Payment Link has not yet been defined":
1. Go to Checkout → Settings in your Paddle dashboard
2. Under "Default Payment Link", select the payment link you created above
3. Save the settings
4. This enables the transaction API to work properly

### 1.5 Configure Webhooks
1. Go to Developer Tools → Webhooks
2. Add a new webhook endpoint:
   - **Endpoint URL**: `https://your-domain.com/webhooks/paddle`
   - **Events**: Select all subscription and transaction events
3. Note the webhook secret for configuration

## 2. Environment Configuration

### 2.1 Backend Environment Variables
Create or update your `.env` file in the backend directory:

```env
# API Configuration
API_HOST=localhost
API_PORT=8000
DEBUG=true

# Database Configuration
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=news_fact_checker

# Perplexity AI Configuration
PERPLEXITY_API_KEY=your_perplexity_api_key_here

# JWT Authentication
JWT_SECRET_KEY=your_super_secret_jwt_key_change_in_production

# Paddle Billing Configuration
PADDLE_ENVIRONMENT=sandbox  # Change to 'production' for live
PADDLE_API_KEY=your_paddle_api_key_here
PADDLE_WEBHOOK_SECRET=your_paddle_webhook_secret_here
PADDLE_VENDOR_ID=your_paddle_vendor_id_here

# Paddle Product Configuration
PADDLE_PREMIUM_PRODUCT_ID=your_premium_product_id_here
PADDLE_PREMIUM_PRICE_ID=your_premium_price_id_here

# Paddle Payment Link (optional fallback - copy from Paddle dashboard)
PADDLE_DEFAULT_PAYMENT_LINK=https://your-paddle-payment-link-url-here

# CORS Configuration
ALLOWED_ORIGINS=["http://localhost:3000", "chrome-extension://*"]
ALLOW_CREDENTIALS=true
```

### 2.2 Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

## 3. Database Setup

The system will automatically create the necessary MongoDB collections and indexes when you start the server. Ensure MongoDB is running.

## 4. Testing the Setup

### 4.1 Start the Backend Server
```bash
cd backend
python main.py
```

### 4.2 Test API Endpoints
Test the health check:
```bash
curl http://localhost:8000/health
```

### 4.3 Test User Registration
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123",
    "full_name": "Test User"
  }'
```

## 5. Frontend Integration

### 5.1 Extension Configuration
The extension is already configured to work with the authentication system. Make sure to:

1. Load the extension in Chrome developer mode
2. Open the account management page: chrome-extension://YOUR_EXTENSION_ID/account.html
3. Test user registration and login

### 5.2 Update API URLs
In `switch-env.js`, ensure the production URL points to your deployed backend:

```javascript
production: {
  API_BASE_URL: 'https://your-deployed-backend.com',
  API_ENDPOINT: 'https://your-deployed-backend.com/analyze'
}
```

## 6. Deployment Checklist

### 6.1 Production Environment Setup
1. Deploy backend to your hosting service (Render, Railway, etc.)
2. Set up production MongoDB database
3. Configure production environment variables
4. Update CORS settings for your domain

### 6.2 Paddle Production Setup
1. Switch `PADDLE_ENVIRONMENT` to `production`
2. Update webhook URLs to production endpoints
3. Test payment flow in Paddle's live environment
4. Update frontend environment configuration

### 6.3 Security Checklist
- [ ] Strong JWT secret key set
- [ ] MongoDB database secured with authentication
- [ ] HTTPS enabled for all API endpoints
- [ ] CORS properly configured
- [ ] Webhook signature verification enabled
- [ ] API rate limiting implemented (optional)

## 7. Key Features Implemented

### 7.1 Authentication System
- User registration and login
- JWT token-based authentication
- Session management
- Password hashing with bcrypt

### 7.2 Billing Integration
- Paddle subscription management
- Webhook event processing
- Automatic account upgrades/downgrades
- Usage tracking for free accounts

### 7.3 Usage Limits
- Free accounts: 5 articles per month
- Premium accounts: Unlimited access
- Monthly usage reset
- Real-time usage tracking

### 7.4 User Interface
- Account management dashboard
- Usage statistics display
- Upgrade/downgrade functionality
- Billing status indicators

## 8. API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user info
- `GET /auth/usage` - Get usage statistics

### Billing
- `POST /billing/subscribe` - Create subscription
- `POST /billing/cancel` - Cancel subscription
- `POST /webhooks/paddle` - Paddle webhook handler

### Analysis (Protected)
- `POST /analyze` - Analyze article (requires authentication)

## 9. Quick Fix for Current Error

If you're seeing the error `"transaction_default_checkout_url_not_set"`:

### Option 1: Set Default Payment Link in Dashboard (Recommended)
1. Log into your Paddle Dashboard
2. Go to **Checkout → Payment Links**
3. Create a new payment link if you don't have one:
   - Name: "News Notes Premium"
   - Add your premium product/price
   - Configure checkout settings as desired
4. Go to **Checkout → Settings**
5. Under "Default Payment Link", select the payment link you just created
6. Save settings
7. Restart your backend server

### Option 2: Use Environment Variable Fallback
1. Copy your payment link URL from Paddle Dashboard
2. Add to your `.env` file:
   ```
   PADDLE_DEFAULT_PAYMENT_LINK=https://your-paddle-payment-link-url
   ```
3. Restart your backend server

### Test Your Fix
Run the test script to verify:
```bash
cd backend
python test_paddle_setup.py
```

## 10. Troubleshooting

### Common Issues

**Issue**: Authentication fails
**Solution**: Check JWT secret key and token expiration

**Issue**: Paddle webhooks not working
**Solution**: Verify webhook URL is accessible and signature verification is correct

**Issue**: "transaction_default_checkout_url_not_set" error
**Solution**: 
1. Go to Paddle Dashboard → Checkout → Settings
2. Set a "Default Payment Link" (create one first in Checkout → Payment Links)
3. Alternative: Set `PADDLE_DEFAULT_PAYMENT_LINK` in your environment variables
4. The system will automatically fallback to the pre-configured payment link

**Issue**: Paddle checkout fails with 400 error
**Solution**: 
1. Check that `PADDLE_PREMIUM_PRICE_ID` is correctly set
2. Verify your Paddle API key has the correct permissions
3. Ensure you're using the right environment (sandbox vs production)
4. Set up the Default Payment Link as described above

**Issue**: Usage limits not updating
**Solution**: Check MongoDB connection and user document structure

**Issue**: Payment flow errors
**Solution**: Verify Paddle product/price IDs and API keys

### Logs and Monitoring
- Backend logs are available in the console
- Paddle events can be monitored in the Paddle dashboard
- MongoDB operations are logged for debugging

### 403 Forbidden Error
If you get a 403 error when creating customers:
1. **Check API Key Scopes**: Your API key must have `customer:write` permission
2. **Regenerate API Key**: Go to Paddle dashboard and create a new API key with all required scopes
3. **Verify Environment**: Make sure you're using the correct environment (sandbox vs production)

### Testing the Integration
Run the test script to verify your setup:
```bash
cd backend
python test_paddle_integration.py
```

## 10. Support and Maintenance

### Regular Tasks
- Monitor webhook delivery success rates
- Check user usage patterns
- Update billing amounts if needed
- Monitor failed payments and account downgrades

### Scaling Considerations
- Implement database connection pooling
- Add Redis for session management
- Set up load balancing for multiple backend instances
- Implement comprehensive logging and monitoring

## Need Help?

This implementation follows Paddle's best practices and provides a complete billing solution. For specific Paddle configuration questions, refer to the [Paddle Documentation](https://developer.paddle.com/getting-started/intro) or contact Paddle support. 